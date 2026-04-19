// Dev-mode storage backend for the config "sheet" while real Google OAuth
// + Sheets API is off the critical path. Originally this wrote to
// dev-config/{orgId}-config.json on disk; Vercel's read-only serverless
// filesystem forced the move into Org.configMockJson. The file-based
// alternative is fine for local dev but won't work on any hosted deploy, so
// this single DB-backed path is used everywhere.

import { db } from "./db";
import type { ConfigJson } from "./config-types";

export async function readMockConfig(orgId: string): Promise<ConfigJson | null> {
  const row = await db.org.findUnique({
    where: { id: orgId },
    select: { configMockJson: true },
  });
  if (!row?.configMockJson) return null;
  return row.configMockJson as unknown as ConfigJson;
}

export async function writeMockConfig(
  orgId: string,
  json: ConfigJson,
): Promise<void> {
  await db.org.update({
    where: { id: orgId },
    data: { configMockJson: json as unknown as object },
  });
}

export async function deleteMockConfig(orgId: string): Promise<void> {
  await db.org.update({
    where: { id: orgId },
    data: { configMockJson: undefined },
  });
}

/**
 * For the settings UI. We no longer have a file path — the JSON lives in
 * the DB — so this returns a description string. Kept for backward-compat
 * with the settings page; safe to remove once that surface updates.
 */
export function mockConfigPath(_orgId: string): string {
  return "stored in database (org.config_mock_json)";
}
