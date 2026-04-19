// Local-disk store used by GOOGLE_MOCK mode to stand in for the real Sheet.
// Each mock export writes one JSON file under dev-exports/, containing the
// same payload that would have been pushed to Google. The price-sync route
// reads it back so the full export → price → summary loop can be exercised
// without Google credentials.
//
// The user can hand-edit the JSON file (specifically the unitPrice fields
// inside `tabs[1].values`) between export and sync to simulate the
// estimator filling in prices.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { SheetPayload } from "./sheet-export";

const ROOT = path.resolve(process.cwd(), "dev-exports");

export type MockExportFile = {
  auditId: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  exportedAt: string;
  payload: SheetPayload;
};

// Dev-only mock path. Guarded by NODE_ENV so even if GOOGLE_MOCK=true
// somehow ends up in prod (e.g., a .env got re-imported), the filesystem
// write that breaks on Vercel's read-only /var/task stays off.
export function isMockMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.GOOGLE_MOCK === "true";
}

function pathFor(auditId: string): string {
  return path.join(ROOT, `${auditId}.json`);
}

/** Returns a fake spreadsheet URL pointing at the local file. */
export function mockSpreadsheetUrl(auditId: string): string {
  return `file://${pathFor(auditId)}`;
}

export async function writeMockExport(file: MockExportFile): Promise<void> {
  await fs.mkdir(ROOT, { recursive: true });
  await fs.writeFile(pathFor(file.auditId), JSON.stringify(file, null, 2), "utf8");
}

export async function readMockExport(
  auditId: string,
): Promise<MockExportFile | null> {
  try {
    const raw = await fs.readFile(pathFor(auditId), "utf8");
    return JSON.parse(raw) as MockExportFile;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
