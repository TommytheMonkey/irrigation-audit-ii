// Real Google Sheets backend for the org config. Swaps in when the org has
// connected Google; falls back to the DB-stored mock JSON when not.
//
// Structure: one spreadsheet per org, four tabs — Components, QuickPicks,
// SeverityLevels, ReportSettings. Same shape as ConfigJson. Edit the sheet
// in Google directly; click "Sync now" to pull it back and apply the diff
// to Neon via syncConfig.

import {
  getAccessTokenForOrg,
  readSheetValues,
  writeSheetValues,
} from "./google";
import { db } from "./db";
import type {
  ConfigComponentRow,
  ConfigJson,
  ConfigQuickPickRow,
  ConfigReportSettingRow,
  ConfigSeverityLevelRow,
} from "./config-types";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

/** Stable Google-hosted editor URL derived from the spreadsheet id. */
export function sheetEditUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create + populate
// ─────────────────────────────────────────────────────────────────────────────

export async function createConfigSheet(
  orgId: string,
  json: ConfigJson,
  orgName: string,
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const org = await db.org.findUniqueOrThrow({
    where: { id: orgId },
    select: { googleCredentialsEnc: true, googleDriveFolderId: true },
  });
  if (!org.googleCredentialsEnc) {
    throw new Error("Google not connected on this org");
  }
  const accessToken = await getAccessTokenForOrg(org.googleCredentialsEnc);

  // Create the spreadsheet with all four tabs pre-named — saves a follow-up
  // batchUpdate to rename Sheet1 and add the others.
  const createRes = await fetch(SHEETS_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title: `${orgName} — Audit Config` },
      sheets: [
        { properties: { title: "Components" } },
        { properties: { title: "QuickPicks" } },
        { properties: { title: "SeverityLevels" } },
        { properties: { title: "ReportSettings" } },
      ],
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Sheets create failed: ${createRes.status} ${text}`);
  }
  const created = (await createRes.json()) as {
    spreadsheetId: string;
    spreadsheetUrl: string;
  };

  // Move into the org's Drive folder if one is set. Fire-and-forget; a
  // missed move is non-fatal, the sheet still exists in My Drive root.
  if (org.googleDriveFolderId) {
    const moveRes = await fetch(
      `${DRIVE_FILES}/${created.spreadsheetId}?addParents=${encodeURIComponent(org.googleDriveFolderId)}&removeParents=root&fields=id,parents`,
      { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!moveRes.ok) {
      console.warn(
        `[config-sheet] move to folder failed: ${moveRes.status}`,
      );
    }
  }

  // Populate each tab. Sequential since Google rate-limits batchUpdate, and
  // four short writes are fast enough.
  await writeSheetValues(accessToken, created.spreadsheetId, "Components!A1", buildComponentRows(json));
  await writeSheetValues(accessToken, created.spreadsheetId, "QuickPicks!A1", buildQuickPickRows(json));
  await writeSheetValues(accessToken, created.spreadsheetId, "SeverityLevels!A1", buildSeverityRows(json));
  await writeSheetValues(accessToken, created.spreadsheetId, "ReportSettings!A1", buildReportSettingsRows(json));

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl || sheetEditUrl(created.spreadsheetId),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Row builders (ConfigJson → 2D array for writeSheetValues)
// ─────────────────────────────────────────────────────────────────────────────

function buildComponentRows(json: ConfigJson): (string | null)[][] {
  const header = [
    "category",
    "component",
    "sizes",
    "systemLevel",
    "active",
    "notes",
  ];
  const rows: (string | null)[][] = json.components.map((c) => [
    c.category,
    c.component,
    c.sizes ?? null,
    c.systemLevel ? "yes" : null,
    c.active === false ? "no" : "yes",
    c.notes ?? null,
  ]);
  return [header, ...rows];
}

function buildQuickPickRows(json: ConfigJson): (string | null)[][] {
  const header = [
    "section",
    "category",
    "component",
    "size",
    "issue",
    "issueType",
    "defaultSeverity",
    "defaultSolution",
    "unit",
    "active",
  ];
  const rows: (string | null)[][] = json.quickPicks.map((q) => [
    q.section,
    q.category,
    q.component ?? null,
    q.size ?? null,
    q.issue,
    q.issueType,
    q.defaultSeverity,
    q.defaultSolution,
    q.unit ?? null,
    q.active === false ? "no" : "yes",
  ]);
  return [header, ...rows];
}

function buildSeverityRows(json: ConfigJson): (string | null)[][] {
  const header = ["level", "name", "color", "label", "description"];
  const rows: (string | null)[][] = json.severityLevels.map((s) => [
    String(s.level),
    s.name,
    s.color,
    s.label ?? null,
    s.description ?? null,
  ]);
  return [header, ...rows];
}

function buildReportSettingsRows(json: ConfigJson): (string | null)[][] {
  const header = ["setting", "value"];
  const rows: (string | null)[][] = json.reportSettings.map((r) => [
    r.setting,
    r.value,
  ]);
  return [header, ...rows];
}

// ─────────────────────────────────────────────────────────────────────────────
// Read + parse
// ─────────────────────────────────────────────────────────────────────────────

export async function readConfigSheet(
  orgId: string,
  spreadsheetId: string,
): Promise<ConfigJson> {
  const org = await db.org.findUniqueOrThrow({
    where: { id: orgId },
    select: { googleCredentialsEnc: true },
  });
  if (!org.googleCredentialsEnc) {
    throw new Error("Google not connected on this org");
  }
  const accessToken = await getAccessTokenForOrg(org.googleCredentialsEnc);

  const [components, quickPicks, severityLevels, reportSettings] =
    await Promise.all([
      readSheetValues(accessToken, spreadsheetId, "Components!A:Z"),
      readSheetValues(accessToken, spreadsheetId, "QuickPicks!A:Z"),
      readSheetValues(accessToken, spreadsheetId, "SeverityLevels!A:Z"),
      readSheetValues(accessToken, spreadsheetId, "ReportSettings!A:Z"),
    ]);

  return {
    components: parseComponents(components),
    quickPicks: parseQuickPicks(quickPicks),
    severityLevels: parseSeverityLevels(severityLevels),
    reportSettings: parseReportSettings(reportSettings),
  };
}

type Row = (string | number | null)[];

/** Build a header → index map from the first row. Normalizes case + spaces. */
function headerIndex(header: Row | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!header) return m;
  for (let i = 0; i < header.length; i++) {
    const key = String(header[i] ?? "").trim().toLowerCase();
    if (key) m.set(key, i);
  }
  return m;
}

function str(row: Row, idx: number | undefined): string | undefined {
  if (idx === undefined) return undefined;
  const v = row[idx];
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function required(row: Row, idx: number | undefined, field: string): string {
  const v = str(row, idx);
  if (!v) throw new Error(`Missing required field "${field}"`);
  return v;
}

function bool(row: Row, idx: number | undefined): boolean | undefined {
  const v = str(row, idx);
  if (!v) return undefined;
  const lower = v.toLowerCase();
  if (["yes", "true", "y", "1", "active"].includes(lower)) return true;
  if (["no", "false", "n", "0", "inactive"].includes(lower)) return false;
  return undefined;
}

function parseComponents(rows: Row[]): ConfigComponentRow[] {
  if (rows.length < 2) return [];
  const h = headerIndex(rows[0]);
  return rows.slice(1).flatMap((row) => {
    try {
      return [
        {
          category: required(row, h.get("category"), "category"),
          component: required(row, h.get("component"), "component"),
          sizes: str(row, h.get("sizes")),
          systemLevel: bool(row, h.get("systemlevel")),
          active: bool(row, h.get("active")) ?? true,
          notes: str(row, h.get("notes")),
        } satisfies ConfigComponentRow,
      ];
    } catch {
      return []; // skip malformed rows silently
    }
  });
}

function parseQuickPicks(rows: Row[]): ConfigQuickPickRow[] {
  if (rows.length < 2) return [];
  const h = headerIndex(rows[0]);
  return rows.slice(1).flatMap((row) => {
    try {
      return [
        {
          section: required(row, h.get("section"), "section"),
          category: required(row, h.get("category"), "category"),
          component: str(row, h.get("component")),
          size: str(row, h.get("size")),
          issue: required(row, h.get("issue"), "issue"),
          issueType: required(row, h.get("issuetype"), "issueType"),
          defaultSeverity: required(
            row,
            h.get("defaultseverity"),
            "defaultSeverity",
          ),
          defaultSolution: required(
            row,
            h.get("defaultsolution"),
            "defaultSolution",
          ),
          unit: str(row, h.get("unit")),
          active: bool(row, h.get("active")) ?? true,
        } satisfies ConfigQuickPickRow,
      ];
    } catch {
      return [];
    }
  });
}

function parseSeverityLevels(rows: Row[]): ConfigSeverityLevelRow[] {
  if (rows.length < 2) return [];
  const h = headerIndex(rows[0]);
  return rows.slice(1).flatMap((row) => {
    try {
      const levelStr = required(row, h.get("level"), "level");
      const level = parseInt(levelStr, 10);
      if (!Number.isFinite(level)) return [];
      return [
        {
          level,
          name: required(row, h.get("name"), "name"),
          color: required(row, h.get("color"), "color"),
          label: str(row, h.get("label")),
          description: str(row, h.get("description")),
        } satisfies ConfigSeverityLevelRow,
      ];
    } catch {
      return [];
    }
  });
}

function parseReportSettings(rows: Row[]): ConfigReportSettingRow[] {
  if (rows.length < 2) return [];
  const h = headerIndex(rows[0]);
  return rows.slice(1).flatMap((row) => {
    try {
      return [
        {
          setting: required(row, h.get("setting"), "setting"),
          value: str(row, h.get("value")) ?? "",
        } satisfies ConfigReportSettingRow,
      ];
    } catch {
      return [];
    }
  });
}
