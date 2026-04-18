import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  exchangeCodeForTokens,
  fetchUserEmail,
  encryptRefreshToken,
} from "@/lib/google";

// GET /api/auth/google/callback
//
// Google redirects back here after the user grants (or denies) consent. We
// verify the state nonce, exchange the code for tokens, encrypt the refresh
// token, and stash it on the org. Errors land back at /settings (or the
// caller-supplied `next`) with an `?error=` query so the UI can surface them.
//
// Note: refresh_token is only returned on FIRST consent. We force re-consent
// in buildAuthUrl() so this is reliable, but if a user re-runs this without a
// refresh_token coming back, we treat it as a connect failure.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const c = await cookies();
  const expectedState = c.get("google_oauth_state")?.value;
  const next = c.get("google_oauth_next")?.value ?? "/settings";

  c.delete("google_oauth_state");
  c.delete("google_oauth_next");

  // Anchor user-facing redirects to APP_URL. The request URL's host can be
  // the bind address (e.g. 0.0.0.0) when Next dev is started with -H, which
  // produces broken redirect targets.
  const redirectBase = process.env.APP_URL ?? url.origin;

  function bounce(errCode: string): NextResponse {
    const dest = new URL(next, redirectBase);
    dest.searchParams.set("google_error", errCode);
    return NextResponse.redirect(dest);
  }

  if (error) return bounce(error);
  if (!code || !state) return bounce("missing_code");
  if (!expectedState || state !== expectedState) return bounce("state_mismatch");

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (e) {
    console.error("[google/callback] token exchange failed", e);
    return bounce("token_exchange_failed");
  }

  if (!tokens.refresh_token) {
    // Should be unreachable because we always pass prompt=consent, but bail
    // loudly if Google ever changes that contract.
    return bounce("no_refresh_token");
  }

  let connectedEmail: string;
  try {
    connectedEmail = await fetchUserEmail(tokens.access_token);
  } catch (e) {
    console.error("[google/callback] userinfo failed", e);
    return bounce("userinfo_failed");
  }

  await db.org.update({
    where: { id: user.orgId },
    data: {
      googleCredentialsEnc: encryptRefreshToken(tokens.refresh_token),
      googleConnectedEmail: connectedEmail,
    },
  });

  const dest = new URL(next, redirectBase);
  dest.searchParams.set("google_connected", "1");
  return NextResponse.redirect(dest);
}
