// Google OAuth + Drive/Sheets helpers.
//
// Talks to Google's REST APIs directly via fetch — no `googleapis` SDK
// dependency. We only need a handful of endpoints (token exchange, refresh,
// drive folder list, sheets create) and the SDK is large.
//
// Refresh tokens are encrypted at rest via src/lib/encryption.ts before being
// written to Org.googleCredentialsEnc. Access tokens are never persisted —
// we mint them from the refresh token at request time.

import { encrypt, decrypt } from "./encryption";

const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets";

// Typed error so the export route can distinguish "user needs to reconnect"
// from "transient API problem". Thrown by helpers when Google returns 401
// (refresh token revoked / scope changed) or 403 (access lost).
export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

// Scopes:
// - drive.file: read/write only files this app creates (least-privilege —
//   we don't get to see the user's other docs).
// - spreadsheets: full sheets API for the config sheet + sync sheets.
// - userinfo.email: so we can show "connected as foo@…" in settings.
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function getClientCreds(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set");
  }
  if (!appUrl) {
    throw new Error("APP_URL not set");
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/auth/google/callback`,
  };
}

/**
 * Build the Google consent screen URL. `state` should be a random nonce
 * stored in a cookie so we can defend against CSRF on the callback.
 *
 * `prompt=consent` and `access_type=offline` are both required to reliably
 * get a refresh_token back — Google only returns one on first consent
 * unless we force re-consent every time.
 */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = getClientCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

/**
 * Exchange the code from the callback for a token bundle. The first time a
 * user consents, this returns a refresh_token; subsequent calls do not (which
 * is why we set `prompt=consent` above).
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getClientCreds();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

/**
 * Trade an encrypted refresh token for a fresh access token. Called on every
 * Drive/Sheets API request — we don't cache because access tokens are short
 * (1h) and the cost of asking Google is small.
 */
export async function refreshAccessToken(encryptedRefreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getClientCreds();
  const refreshToken = decrypt(encryptedRefreshToken);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as TokenResponse;
  return json.access_token;
}

/**
 * Look up the email of the Google account that just consented. We persist
 * this on Org.googleConnectedEmail so settings can show "Connected as …".
 */
export async function fetchUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed: ${res.status}`);
  }
  const json = (await res.json()) as { email: string };
  return json.email;
}

/** Encrypt the refresh token before persistence. Thin wrapper for clarity. */
export function encryptRefreshToken(refreshToken: string): string {
  return encrypt(refreshToken);
}

// ─────────────────────────────────────────────────────────────────────────────
// Drive helpers (used by the onboarding wizard + Sheets sync milestone)
// ─────────────────────────────────────────────────────────────────────────────

export type DriveFolder = {
  id: string;
  name: string;
};

/**
 * List folders the user has shared with this app (via the Drive picker, or
 * any folder they create through the onboarding wizard). With the
 * `drive.file` scope we ONLY see folders this app touched, which is by
 * design — least-privilege.
 */
export async function listDriveFolders(accessToken: string): Promise<DriveFolder[]> {
  const params = new URLSearchParams({
    q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: "files(id,name)",
    pageSize: "100",
  });
  const res = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Drive folder list failed: ${res.status}`);
  }
  const json = (await res.json()) as { files: DriveFolder[] };
  return json.files ?? [];
}

/**
 * Create a folder in the user's Drive. Returns the folder ID. Used by the
 * onboarding wizard when the user chooses "Create new folder" instead of
 * picking an existing one.
 */
export async function createDriveFolder(
  accessToken: string,
  name: string,
): Promise<DriveFolder> {
  const res = await fetch(DRIVE_FILES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive folder create failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as DriveFolder;
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// Drive + Sheets helpers (audit export pipeline)
//
// All helpers below take an accessToken minted at the start of the request
// (we never persist access tokens). Auth/authorization errors throw
// GoogleAuthError so callers can surface "Reconnect Google in Settings"
// rather than a generic 500. 429s get a single short-backoff retry.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrapper around fetch() that handles the two retry-able cases for Google
 * APIs: 429 (rate-limit) gets one 1-second backoff retry, and 401/403 raises
 * a typed GoogleAuthError so the caller can route the user to Settings.
 *
 * The 300-rpm Sheets API quota is well above what one export uses, but the
 * retry exists in case multiple users export at once.
 */
async function googleFetch(url: string, init: RequestInit): Promise<Response> {
  let res = await fetch(url, init);
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await fetch(url, init);
  }
  if (res.status === 401 || res.status === 403) {
    const text = await res.text().catch(() => "");
    throw new GoogleAuthError(
      `Google rejected request (${res.status}): ${text || "unauthorized"}`,
    );
  }
  return res;
}

/**
 * Find a folder by name inside a parent folder, or create it if missing.
 * Used to build the {parent}/Property Reports/{Property}/audit-{date}/
 * hierarchy idempotently — re-running an export reuses the existing
 * subfolders rather than spawning duplicates.
 */
export async function findOrCreateFolder(
  accessToken: string,
  name: string,
  parentFolderId: string,
): Promise<string> {
  // Drive q-language is finicky: single-quoted strings, escape any quotes in
  // the user-supplied folder name to avoid breaking out of the literal.
  const escapedName = name.replace(/['\\]/g, "\\$&");
  const q = `name='${escapedName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const params = new URLSearchParams({
    q,
    fields: "files(id,name)",
    pageSize: "10",
  });
  const findRes = await googleFetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!findRes.ok) {
    throw new Error(`Drive folder lookup failed: ${findRes.status}`);
  }
  const findJson = (await findRes.json()) as { files: { id: string; name: string }[] };
  if (findJson.files && findJson.files.length > 0) {
    return findJson.files[0].id;
  }

  const createRes = await googleFetch(DRIVE_FILES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Drive folder create failed: ${createRes.status} ${text}`);
  }
  const json = (await createRes.json()) as { id: string };
  return json.id;
}

/**
 * Create a Google Spreadsheet directly inside the given Drive folder. We go
 * through Drive (not Sheets) for creation so we can specify `parents` in one
 * request — Sheets create lands the file in My Drive root and a separate
 * move call would be needed.
 *
 * Returns the file id and a webViewLink the UI can use to open it.
 */
export async function createSpreadsheetInFolder(
  accessToken: string,
  title: string,
  folderId: string,
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const params = new URLSearchParams({ fields: "id,webViewLink" });
  const res = await googleFetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: title,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [folderId],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spreadsheet create failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { id: string; webViewLink: string };
  return { spreadsheetId: json.id, spreadsheetUrl: json.webViewLink };
}

export type SheetTab = {
  sheetId: number;
  title: string;
};

/**
 * Get the list of tabs (sheet ids + titles) for a spreadsheet. Needed
 * because batchUpdate requests target tabs by numeric `sheetId`, not by
 * title — and a fresh spreadsheet has one default tab whose id we don't
 * know until we ask.
 */
export async function listSheetTabs(
  accessToken: string,
  spreadsheetId: string,
): Promise<SheetTab[]> {
  const params = new URLSearchParams({ fields: "sheets(properties(sheetId,title))" });
  const res = await googleFetch(
    `${SHEETS_URL}/${spreadsheetId}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Sheets get failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    sheets: { properties: { sheetId: number; title: string } }[];
  };
  return json.sheets.map((s) => ({
    sheetId: s.properties.sheetId,
    title: s.properties.title,
  }));
}

/**
 * Apply a batch of structural / formatting requests to a spreadsheet. The
 * caller builds the request objects per Google's batchUpdate schema; this
 * helper just handles auth + transport.
 */
export async function batchUpdateSheet(
  accessToken: string,
  spreadsheetId: string,
  requests: unknown[],
): Promise<void> {
  if (requests.length === 0) return;
  const res = await googleFetch(
    `${SHEETS_URL}/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets batchUpdate failed: ${res.status} ${text}`);
  }
}

/**
 * Write a 2D array of values into a sheet range using `USER_ENTERED` so
 * formulas like `=G2*L2` are evaluated by Sheets, not stored as strings.
 *
 * `range` is A1 notation, e.g. "All Findings!A1:N50".
 */
export async function writeSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][],
): Promise<void> {
  const params = new URLSearchParams({ valueInputOption: "USER_ENTERED" });
  const res = await googleFetch(
    `${SHEETS_URL}/${spreadsheetId}/values/${encodeURIComponent(range)}?${params.toString()}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets values update failed: ${res.status} ${text}`);
  }
}

/**
 * Read a range from a spreadsheet. Returns the raw 2D array Sheets gives
 * us — note that trailing empty cells are NOT returned, so each row may be
 * shorter than the column count if the rightmost cells are blank. Callers
 * should handle missing cells by index.
 *
 * `unformatted=true` returns raw cell values (numbers as numbers) — used
 * by price sync so $5.00 doesn't come back as the string "$5.00". Default
 * is FORMATTED_VALUE which is what most readers want.
 */
export async function readSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  opts?: { unformatted?: boolean },
): Promise<(string | number | null)[][]> {
  const params = new URLSearchParams();
  if (opts?.unformatted) {
    params.set("valueRenderOption", "UNFORMATTED_VALUE");
  }
  const url = `${SHEETS_URL}/${spreadsheetId}/values/${encodeURIComponent(range)}${
    params.toString() ? `?${params.toString()}` : ""
  }`;
  const res = await googleFetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets values read failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { values?: (string | number | null)[][] };
  return json.values ?? [];
}

/**
 * Mint a fresh access token for the given org. Convenience over
 * refreshAccessToken so route handlers don't need to know about the
 * encrypted-credentials shape.
 */
export async function getAccessTokenForOrg(
  encryptedRefreshToken: string,
): Promise<string> {
  return refreshAccessToken(encryptedRefreshToken);
}
