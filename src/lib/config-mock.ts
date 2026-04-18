// ⚠️ DEV-ONLY config-sheet storage backend.
//
// Real Google OAuth + Sheets API isn't wired up yet, so the "config sheet"
// is a JSON file at dev-config/{orgId}-config.json. Same shape as ConfigJson;
// editing the file by hand and clicking "Sync" runs the full validator and
// upserts the same way the real Sheets sync will. When OAuth lands, swap the
// implementation behind a thin interface (read/write/delete) and the rest of
// the pipeline keeps working unchanged.

import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { ConfigJson } from "./config-types";

const DIR = path.join(process.cwd(), "dev-config");

function pathFor(orgId: string): string {
  return path.join(DIR, `${orgId}-config.json`);
}

export async function readMockConfig(orgId: string): Promise<ConfigJson | null> {
  try {
    const raw = await readFile(pathFor(orgId), "utf-8");
    return JSON.parse(raw) as ConfigJson;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeMockConfig(
  orgId: string,
  json: ConfigJson,
): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(pathFor(orgId), JSON.stringify(json, null, 2), "utf-8");
}

export async function deleteMockConfig(orgId: string): Promise<void> {
  try {
    await unlink(pathFor(orgId));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/** For the settings UI: where the file is on disk so the user can find it. */
export function mockConfigPath(orgId: string): string {
  return pathFor(orgId);
}
