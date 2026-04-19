// Manual property import — either an uploaded .xlsx or a pasted Google
// Sheet URL. Output shape matches the preview + apply flow used by the
// Monday column mapper, so the UI can reuse the same mental model.
//
// For xlsx we parse with exceljs. For Sheets we resolve the spreadsheet
// id out of the URL, read the first tab's A:Z range via the Sheets API.
// Either path returns `{columns, rows, autoMapping}` — headers, data
// rows, and a best-guess PropertyField → column-header mapping.

import ExcelJS from "exceljs";
import type { ColumnMapping, PropertyField } from "./monday-types";
import { db } from "./db";
import { GoogleAuthError, getAccessTokenForOrg, readSheetValues } from "./google";
import { geocodeAddress } from "./geocode";

export type ImportPreview = {
  columns: string[];
  rows: string[][];
  totalRows: number;
  autoMapping: ColumnMapping;
};

// Same auto-match rules as the Monday flow, just operating on plain header
// text instead of Monday column titles. Keeps the UX consistent for admins
// who've already mapped a Monday board once.
const AUTO_MATCH_RULES: { field: PropertyField; needles: string[] }[] = [
  { field: "pmEmail", needles: ["pmemail", "manageremail", "contactemail", "email"] },
  { field: "pmPhone", needles: ["pmphone", "managerphone", "contactphone", "phone"] },
  { field: "pmName", needles: ["pmname", "propertymanager", "manager", "contactname"] },
  { field: "address", needles: ["streetaddress", "address", "street", "location"] },
  { field: "city", needles: ["city"] },
  { field: "state", needles: ["state", "province"] },
  { field: "zip", needles: ["zip", "postal"] },
];

function autoMatchColumns(columns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const rule of AUTO_MATCH_RULES) {
    if (mapping[rule.field]) continue;
    for (const col of columns) {
      const t = norm(col);
      if (rule.needles.some((n) => t.includes(n))) {
        mapping[rule.field] = col;
        break;
      }
    }
  }
  return mapping;
}

// The canonical Property Name column. Not in PROPERTY_FIELDS (which is PM
// contact + address only) but we need it since every import must name each
// property somehow.
const NAME_NEEDLES = ["propertyname", "name", "site", "sitename", "accountname"];

function autoMatchNameColumn(columns: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const col of columns) {
    const t = norm(col);
    if (NAME_NEEDLES.some((n) => t.includes(n))) return col;
  }
  // Fall back to the first non-empty column.
  return columns.find((c) => c.trim().length > 0) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX path
// ─────────────────────────────────────────────────────────────────────────────

export async function parseXlsxForImport(
  bytes: Buffer,
): Promise<ImportPreview & { nameColumn: string | null }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(bytes).buffer as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Workbook has no sheets");

  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cellToString(cell.value));
    });
    grid.push(cells);
  });

  return gridToPreview(grid);
}

function cellToString(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && v !== null) {
    if ("text" in v && v.text) return String(v.text);
    if ("result" in v && v.result !== undefined) return String(v.result);
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join("");
    }
  }
  return String(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Sheet path
// ─────────────────────────────────────────────────────────────────────────────

const SHEET_ID_REGEX = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;

export function extractSheetId(url: string): string | null {
  const m = url.match(SHEET_ID_REGEX);
  return m ? m[1] : null;
}

export async function parseGoogleSheetForImport(
  orgId: string,
  sheetUrl: string,
): Promise<ImportPreview & { nameColumn: string | null }> {
  const spreadsheetId = extractSheetId(sheetUrl);
  if (!spreadsheetId) {
    throw new Error("Couldn't find a spreadsheet ID in that URL.");
  }

  const org = await db.org.findUniqueOrThrow({
    where: { id: orgId },
    select: { googleCredentialsEnc: true },
  });
  if (!org.googleCredentialsEnc) {
    throw new GoogleAuthError(
      "Connect Google in Settings → Integrations to import from Sheets.",
    );
  }
  const accessToken = await getAccessTokenForOrg(org.googleCredentialsEnc);
  // First tab, generous range. Most property sheets are well under 1000 rows.
  const rawRows = await readSheetValues(accessToken, spreadsheetId, "A1:Z1000");

  const grid: string[][] = rawRows.map((r) =>
    r.map((c) => (c === null || c === undefined ? "" : String(c))),
  );
  return gridToPreview(grid);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared grid → preview
// ─────────────────────────────────────────────────────────────────────────────

function gridToPreview(
  grid: string[][],
): ImportPreview & { nameColumn: string | null } {
  if (grid.length === 0) {
    return {
      columns: [],
      rows: [],
      totalRows: 0,
      autoMapping: {},
      nameColumn: null,
    };
  }
  const headerRow = grid[0].map((c) => c.trim());
  const dataRows = grid.slice(1).filter((r) => r.some((c) => c.trim() !== ""));

  return {
    columns: headerRow,
    rows: dataRows,
    totalRows: dataRows.length,
    autoMapping: autoMatchColumns(headerRow),
    nameColumn: autoMatchNameColumn(headerRow),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply
// ─────────────────────────────────────────────────────────────────────────────

export type ApplyInput = {
  orgId: string;
  columns: string[];
  rows: string[][];
  nameColumn: string;
  mapping: ColumnMapping;
  // If set to true, geocode each property address before inserting. Adds
  // latency (one Google Geocoding call per row) but keeps map view and
  // mobile flows working out of the gate. Skip for giant imports.
  geocode?: boolean;
};

export async function applyPropertyImport(
  input: ApplyInput,
): Promise<{ created: number; skipped: number; geocoded: number }> {
  const { orgId, columns, rows, nameColumn, mapping } = input;
  const colIndex = (header: string) => columns.indexOf(header);

  const nameIdx = colIndex(nameColumn);
  if (nameIdx < 0) throw new Error("Name column not found in headers.");

  let created = 0;
  let skipped = 0;
  let geocoded = 0;

  for (const row of rows) {
    const name = row[nameIdx]?.trim() ?? "";
    if (!name) {
      skipped++;
      continue;
    }
    const valueAt = (field: PropertyField): string | null => {
      const header = mapping[field];
      if (!header) return null;
      const idx = colIndex(header);
      if (idx < 0) return null;
      const v = row[idx]?.trim();
      return v ? v : null;
    };

    const address = valueAt("address");
    const city = valueAt("city");
    const state = valueAt("state");
    const zip = valueAt("zip");

    let latitude: number | null = null;
    let longitude: number | null = null;
    let geocodedAt: Date | null = null;
    if (input.geocode) {
      const coords = await geocodeAddress(address, city, state, zip);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lng;
        geocodedAt = new Date();
        geocoded++;
      }
    }

    await db.property.create({
      data: {
        orgId,
        name,
        address,
        city,
        state,
        zip,
        propertyManagerName: valueAt("pmName"),
        propertyManagerEmail: valueAt("pmEmail"),
        propertyManagerPhone: valueAt("pmPhone"),
        mondayItemId: null,
        syncStatus: "active",
        latitude,
        longitude,
        geocodedAt,
      },
    });
    created++;
  }

  return { created, skipped, geocoded };
}
