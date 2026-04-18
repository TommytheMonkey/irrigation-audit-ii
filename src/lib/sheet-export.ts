// Audit → Google Sheet payload builder.
//
// Pure data layer for the export pipeline. Takes a fully-joined audit and
// the org's branding, and produces:
//   1. The 2D values arrays for each of the four tabs
//      (Summary, All Findings, By Zone, Pricing Summary)
//   2. A list of Sheets API batchUpdate requests to apply formatting
//      (header colors, conditional formatting, frozen rows, hidden columns,
//      number formats, tab colors, merged title row)
//
// Kept separate from src/lib/google.ts so we can unit-test the structure
// without hitting Google. The route handler in /api/audits/[id]/export-sheets
// stitches the two together.

import type {
  Audit,
  AuditFinding,
  AuditSystem,
  AuditZone,
  Property,
} from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FullAudit = Audit & {
  property: Property;
  auditor: { name: string | null; email: string };
  systems: (AuditSystem & {
    zones: (AuditZone & { findings: AuditFinding[] })[];
  })[];
  findings: AuditFinding[];
};

export type OrgBrand = {
  name: string;
  brandColorPrimary: string | null;
  brandColorSecondary: string | null;
};

export type SheetTabPayload = {
  name: string;
  values: (string | number | null)[][];
  // Tab color (RGB 0-1) applied via updateSheetProperties.
  tabColor: { red: number; green: number; blue: number };
};

export type SheetPayload = {
  title: string;
  tabs: SheetTabPayload[];
  // Total rows in "All Findings" excluding header (used by sync to bound the
  // read range). Stored here so the export route can stash a manifest in
  // mock mode without recomputing.
  findingCount: number;
  // Ordered list of finding ids in the same order they were written to
  // "All Findings" — column N. The price-sync route uses this when the
  // sheet read returns a row whose finding-id cell is empty (rare, but a
  // user could delete it) so it can fall back to row index.
  findingIdsInOrder: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const TAB_SUMMARY = "Summary";
export const TAB_FINDINGS = "All Findings";
export const TAB_BY_ZONE = "By Zone";
export const TAB_PRICING = "Pricing Summary";

// "Critical first" ordering rank for severity sort.
const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_LABEL: Record<string, string> = {
  high: "Critical",
  medium: "Moderate",
  low: "Minor",
};

// All Findings column letters (1-indexed columns A..N → indexes 0..13)
const COL_ZONE = 0;
const COL_CATEGORY = 1;
// Other column indexes referenced by formulas — kept named so future column
// reorders only touch this list:
const COL_QUANTITY = 6; // G
const COL_UNIT_PRICE = 11; // L
const COL_EXTENDED = 12; // M
const COL_FINDING_ID = 13; // N

const ALL_FINDINGS_HEADERS = [
  "Zone",
  "Category",
  "Component",
  "Size",
  "Issue",
  "Severity",
  "Quantity",
  "Unit",
  "Recommended Repair",
  "Notes",
  "Photo Links",
  "Unit Price",
  "Extended Price",
  "Finding ID",
];

// ─────────────────────────────────────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────────────────────────────────────

type RGB = { red: number; green: number; blue: number };

function hexToRgb(hex: string | null, fallback: RGB): RGB {
  if (!hex) return fallback;
  const m = hex.replace(/^#/, "");
  const full =
    m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (full.length !== 6) return fallback;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return fallback;
  return {
    red: ((n >> 16) & 0xff) / 255,
    green: ((n >> 8) & 0xff) / 255,
    blue: (n & 0xff) / 255,
  };
}

const DEFAULT_HEADER_RGB: RGB = { red: 30 / 255, green: 41 / 255, blue: 59 / 255 }; // #1e293b
const TAB_BLUE: RGB = { red: 0.23, green: 0.51, blue: 0.96 };
const TAB_GREEN: RGB = { red: 0.16, green: 0.65, blue: 0.27 };
const TAB_ORANGE: RGB = { red: 0.96, green: 0.55, blue: 0.18 };
const TAB_PURPLE: RGB = { red: 0.55, green: 0.32, blue: 0.74 };

// Severity backgrounds for the conditional formatting.
const SEVERITY_BG = {
  critical: { red: 1.0, green: 0.85, blue: 0.85 },
  moderate: { red: 1.0, green: 0.95, blue: 0.78 },
  minor: { red: 0.85, green: 0.95, blue: 0.85 },
};
// Light yellow for the editable Unit Price column.
const UNIT_PRICE_BG: RGB = { red: 1.0, green: 0.98, blue: 0.85 };
// Light gray for the formula Extended Price column.
const EXTENDED_BG: RGB = { red: 0.93, green: 0.93, blue: 0.93 };

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export function buildSheetPayload(audit: FullAudit, org: OrgBrand): SheetPayload {
  const property = audit.property;
  const auditor = audit.auditor;
  const auditDate = (audit.completedAt ?? audit.startedAt).toISOString().slice(0, 10);
  const title = `${property.name} - Audit Report - ${auditDate}`;

  // Build a "zone label" map keyed by finding id, used by both All Findings
  // and By Zone. System-level findings (zoneId null) get labeled by their
  // system number so they don't disappear from the export.
  const zoneLabelByZoneId = new Map<string, string>();
  const systemLabelBySystemId = new Map<string, string>();
  for (const sys of audit.systems) {
    systemLabelBySystemId.set(sys.id, `System ${sys.systemNumber}`);
    for (const z of sys.zones) {
      const label = z.zoneName
        ? `Zone ${z.zoneNumber} - ${z.zoneName}`
        : `Zone ${z.zoneNumber}`;
      zoneLabelByZoneId.set(z.id, label);
    }
  }
  const zoneLabelForFinding = (f: AuditFinding): string =>
    f.zoneId
      ? zoneLabelByZoneId.get(f.zoneId) ?? "(unknown zone)"
      : systemLabelBySystemId.get(f.systemId) ?? "System";

  // Sort: zone (numeric where possible), then severity (Critical first),
  // then category alpha.
  const sortedFindings = [...audit.findings].sort((a, b) => {
    const za = zoneLabelForFinding(a);
    const zb = zoneLabelForFinding(b);
    if (za !== zb) return za.localeCompare(zb, undefined, { numeric: true });
    const sa = SEVERITY_RANK[a.severity] ?? 9;
    const sb = SEVERITY_RANK[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    return a.componentCategory.localeCompare(b.componentCategory);
  });

  const findingIdsInOrder = sortedFindings.map((f) => f.id);

  return {
    title,
    findingCount: sortedFindings.length,
    findingIdsInOrder,
    tabs: [
      {
        name: TAB_SUMMARY,
        values: buildSummaryTab(audit, property, auditor, auditDate, sortedFindings),
        tabColor: TAB_BLUE,
      },
      {
        name: TAB_FINDINGS,
        values: buildFindingsTab(sortedFindings, zoneLabelForFinding),
        tabColor: TAB_GREEN,
      },
      {
        name: TAB_BY_ZONE,
        values: buildByZoneTab(audit, sortedFindings, zoneLabelForFinding),
        tabColor: TAB_ORANGE,
      },
      {
        name: TAB_PRICING,
        values: buildPricingTab(sortedFindings),
        tabColor: TAB_PURPLE,
      },
    ],
  };
  // Suppress unused warning — org currently feeds formatRequests, not data.
  void org;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab builders
// ─────────────────────────────────────────────────────────────────────────────

function buildSummaryTab(
  audit: FullAudit,
  property: Property,
  auditor: { name: string | null; email: string },
  auditDate: string,
  findings: AuditFinding[],
): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  // Row 1: title (will be merged + styled in formatRequests).
  rows.push([`${property.name} — Irrigation Audit Report`]);
  // Row 2: meta
  rows.push([`Audit Date: ${auditDate}    ·    Auditor: ${auditor.name ?? auditor.email}`]);
  rows.push([`Property Address: ${property.address ?? "—"}`]);
  rows.push([
    `Property Manager: ${property.propertyManagerName ?? "—"}    ·    ${property.propertyManagerEmail ?? "—"}    ·    ${property.propertyManagerPhone ?? "—"}`,
  ]);
  rows.push([""]);

  rows.push(["Overall Summary"]);
  rows.push(["Total findings", findings.length]);
  const sev = { high: 0, medium: 0, low: 0 };
  const byCategory: Record<string, number> = {};
  for (const f of findings) {
    sev[f.severity]++;
    byCategory[f.componentCategory] = (byCategory[f.componentCategory] ?? 0) + 1;
  }
  rows.push(["Critical", sev.high]);
  rows.push(["Moderate", sev.medium]);
  rows.push(["Minor", sev.low]);
  rows.push([""]);

  rows.push(["By component category"]);
  const sortedCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedCats) {
    rows.push([cat, count]);
  }

  // Pricing rollup — only meaningful after a price sync, but we keep the
  // formulas live so the cells light up automatically when prices land.
  rows.push([""]);
  rows.push(["Pricing"]);
  rows.push([
    "Estimated total",
    `=IFERROR(SUM('${TAB_FINDINGS}'!M2:M),0)`,
  ]);
  rows.push([
    "Findings priced",
    `=IFERROR(COUNTA('${TAB_FINDINGS}'!L2:L),0)`,
  ]);

  // Audit context tail
  rows.push([""]);
  rows.push(["Audit ID", audit.id]);
  return rows;
}

function buildFindingsTab(
  sortedFindings: AuditFinding[],
  zoneLabelFor: (f: AuditFinding) => string,
): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [ALL_FINDINGS_HEADERS];
  let r = 2; // sheets is 1-indexed and row 1 is the header
  for (const f of sortedFindings) {
    const sevLabel = SEVERITY_LABEL[f.severity] ?? f.severity;
    const qty = f.quantity ? Number(f.quantity) : 1;
    const unit = f.unitOfMeasure === "none" ? "" : f.unitOfMeasure;
    const recommendation = f.recommendation ?? f.solutionAction;
    const photos = (f.photoUrls ?? []).join(", ");
    // Pre-populate Unit Price if a prior sync filled it in — that way
    // re-exporting an already-priced audit doesn't blow away the prices.
    const unitPrice = f.unitPrice !== null ? Number(f.unitPrice) : null;
    rows.push([
      zoneLabelFor(f),
      f.componentCategory,
      f.componentSubtype ?? f.componentCategory,
      f.componentSize ?? "",
      f.description ?? f.issueType.replace(/_/g, " "),
      sevLabel,
      qty,
      unit,
      recommendation,
      f.notes ?? "",
      photos,
      unitPrice,
      // M: extended price formula. Even when L is blank the formula gives 0
      // and lights up the moment a unit price is filled in.
      `=IFERROR(G${r}*L${r},0)`,
      f.id,
    ]);
    r++;
  }
  return rows;
}

function buildByZoneTab(
  audit: FullAudit,
  sortedFindings: AuditFinding[],
  zoneLabelFor: (f: AuditFinding) => string,
): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  // Group findings by zone label, preserving the sorted order.
  const groups = new Map<string, AuditFinding[]>();
  for (const f of sortedFindings) {
    const label = zoneLabelFor(f);
    const arr = groups.get(label);
    if (arr) arr.push(f);
    else groups.set(label, [f]);
  }

  for (const [zoneLabel, zoneFindings] of groups) {
    rows.push([zoneLabel]);
    rows.push(["Finding", "Count", "Severity", "Est. Total"]);
    for (const f of zoneFindings) {
      const sevLabel = SEVERITY_LABEL[f.severity] ?? f.severity;
      const desc =
        f.description ??
        `${f.componentSubtype ?? f.componentCategory}${f.componentSize ? ` ${f.componentSize}` : ""}`;
      // Per-finding total: SUMIFS keyed on the Finding ID column so the row
      // updates automatically when prices land in All Findings.
      rows.push([
        desc,
        1,
        sevLabel,
        `=IFERROR(SUMIFS('${TAB_FINDINGS}'!M:M,'${TAB_FINDINGS}'!N:N,"${f.id}"),0)`,
      ]);
    }
    // Zone total: SUMIF keyed on the zone label.
    rows.push([
      "Zone Total",
      "",
      "",
      `=IFERROR(SUMIF('${TAB_FINDINGS}'!A:A,"${zoneLabel}",'${TAB_FINDINGS}'!M:M),0)`,
    ]);
    rows.push([""]);
  }

  rows.push([
    "Grand Total",
    "",
    "",
    `=IFERROR(SUM('${TAB_FINDINGS}'!M2:M),0)`,
  ]);
  // Suppress unused — audit param kept for symmetry / future per-system
  // grouping if we want it later.
  void audit;
  return rows;
}

function buildPricingTab(
  sortedFindings: AuditFinding[],
): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  rows.push(["Category", "Finding Count", "Estimated Total"]);
  // Categories ordered by count desc, mirroring the Summary tab so the
  // numbers line up visually for the estimator.
  const counts = new Map<string, number>();
  for (const f of sortedFindings) {
    counts.set(f.componentCategory, (counts.get(f.componentCategory) ?? 0) + 1);
  }
  const sortedCats = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat] of sortedCats) {
    const escapedCat = cat.replace(/"/g, '""');
    rows.push([
      cat,
      `=COUNTIF('${TAB_FINDINGS}'!B:B,"${escapedCat}")`,
      `=IFERROR(SUMIF('${TAB_FINDINGS}'!B:B,"${escapedCat}",'${TAB_FINDINGS}'!M:M),0)`,
    ]);
  }
  rows.push([
    "Grand Total",
    `=SUM(B2:B${sortedCats.length + 1})`,
    `=SUM(C2:C${sortedCats.length + 1})`,
  ]);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Format requests
//
// Built lazily because the requests need real numeric sheet ids, which we
// only get after the spreadsheet has been created and the extra tabs added.
// The route passes in the sheet-id-by-name map.
// ─────────────────────────────────────────────────────────────────────────────

export function buildFormatRequests(
  sheetIdByTab: Record<string, number>,
  payload: SheetPayload,
  brand: OrgBrand,
): unknown[] {
  const headerBg = hexToRgb(brand.brandColorPrimary, DEFAULT_HEADER_RGB);
  const headerText = { red: 1, green: 1, blue: 1 };
  const requests: unknown[] = [];

  const summaryId = sheetIdByTab[TAB_SUMMARY];
  const findingsId = sheetIdByTab[TAB_FINDINGS];
  const byZoneId = sheetIdByTab[TAB_BY_ZONE];
  const pricingId = sheetIdByTab[TAB_PRICING];

  // ── Tab colors ──────────────────────────────────────────────────────────
  for (const tab of payload.tabs) {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: sheetIdByTab[tab.name],
          tabColor: tab.tabColor,
          tabColorStyle: { rgbColor: tab.tabColor },
        },
        fields: "tabColor,tabColorStyle",
      },
    });
  }

  // ── Summary tab: merged title + bold meta + section headers ─────────────
  // Title row spans columns A:E
  requests.push({
    mergeCells: {
      range: {
        sheetId: summaryId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 5,
      },
      mergeType: "MERGE_ALL",
    },
  });
  requests.push({
    repeatCell: {
      range: {
        sheetId: summaryId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 5,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: headerBg,
          backgroundColorStyle: { rgbColor: headerBg },
          textFormat: {
            foregroundColor: headerText,
            foregroundColorStyle: { rgbColor: headerText },
            bold: true,
            fontSize: 16,
          },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
        },
      },
      fields:
        "userEnteredFormat(backgroundColor,backgroundColorStyle,textFormat,horizontalAlignment,verticalAlignment)",
    },
  });
  // Auto-resize Summary columns
  requests.push({
    autoResizeDimensions: {
      dimensions: {
        sheetId: summaryId,
        dimension: "COLUMNS",
        startIndex: 0,
        endIndex: 5,
      },
    },
  });

  // ── All Findings tab ────────────────────────────────────────────────────
  const findingsRowCount = payload.findingCount + 1; // +1 for header
  // Header row formatting + freeze
  requests.push({
    repeatCell: {
      range: {
        sheetId: findingsId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: ALL_FINDINGS_HEADERS.length,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: headerBg,
          backgroundColorStyle: { rgbColor: headerBg },
          textFormat: {
            foregroundColor: headerText,
            foregroundColorStyle: { rgbColor: headerText },
            bold: true,
          },
          horizontalAlignment: "LEFT",
        },
      },
      fields:
        "userEnteredFormat(backgroundColor,backgroundColorStyle,textFormat,horizontalAlignment)",
    },
  });
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: findingsId,
        gridProperties: { frozenRowCount: 1 },
      },
      fields: "gridProperties.frozenRowCount",
    },
  });
  // Hide the Finding ID column (N)
  requests.push({
    updateDimensionProperties: {
      range: {
        sheetId: findingsId,
        dimension: "COLUMNS",
        startIndex: COL_FINDING_ID,
        endIndex: COL_FINDING_ID + 1,
      },
      properties: { hiddenByUser: true },
      fields: "hiddenByUser",
    },
  });
  // Currency number format on L (Unit Price) and M (Extended Price)
  if (findingsRowCount > 1) {
    for (const colIdx of [COL_UNIT_PRICE, COL_EXTENDED]) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: findingsId,
            startRowIndex: 1,
            endRowIndex: findingsRowCount,
            startColumnIndex: colIdx,
            endColumnIndex: colIdx + 1,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: { type: "CURRENCY", pattern: '"$"#,##0.00' },
              backgroundColor: colIdx === COL_UNIT_PRICE ? UNIT_PRICE_BG : EXTENDED_BG,
              backgroundColorStyle: {
                rgbColor: colIdx === COL_UNIT_PRICE ? UNIT_PRICE_BG : EXTENDED_BG,
              },
            },
          },
          fields:
            "userEnteredFormat(numberFormat,backgroundColor,backgroundColorStyle)",
        },
      });
    }
  }
  // Conditional formatting on Severity column (F = index 5) — three rules,
  // one per label. Sheets evaluates rules in order; first match wins.
  const sevColRange = {
    sheetId: findingsId,
    startRowIndex: 1,
    endRowIndex: Math.max(findingsRowCount, 2),
    startColumnIndex: 5,
    endColumnIndex: 6,
  };
  for (const [label, bg] of [
    ["Critical", SEVERITY_BG.critical],
    ["Moderate", SEVERITY_BG.moderate],
    ["Minor", SEVERITY_BG.minor],
  ] as const) {
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [sevColRange],
          booleanRule: {
            condition: {
              type: "TEXT_EQ",
              values: [{ userEnteredValue: label }],
            },
            format: {
              backgroundColor: bg,
              backgroundColorStyle: { rgbColor: bg },
            },
          },
        },
        index: 0,
      },
    });
  }
  // Auto-resize all visible columns of All Findings (skip the hidden N).
  requests.push({
    autoResizeDimensions: {
      dimensions: {
        sheetId: findingsId,
        dimension: "COLUMNS",
        startIndex: 0,
        endIndex: COL_FINDING_ID,
      },
    },
  });

  // ── By Zone tab ─────────────────────────────────────────────────────────
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: byZoneId,
        gridProperties: { frozenRowCount: 0 },
      },
      fields: "gridProperties.frozenRowCount",
    },
  });
  // Currency format on column D for the entire used range (cheap to apply
  // to a wide row band; doesn't matter that some rows are headers).
  const byZoneRowCount = payload.tabs.find((t) => t.name === TAB_BY_ZONE)!.values.length;
  if (byZoneRowCount > 0) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: byZoneId,
          startRowIndex: 0,
          endRowIndex: byZoneRowCount,
          startColumnIndex: 3,
          endColumnIndex: 4,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "CURRENCY", pattern: '"$"#,##0.00' },
          },
        },
        fields: "userEnteredFormat.numberFormat",
      },
    });
  }
  requests.push({
    autoResizeDimensions: {
      dimensions: {
        sheetId: byZoneId,
        dimension: "COLUMNS",
        startIndex: 0,
        endIndex: 4,
      },
    },
  });

  // ── Pricing Summary tab ─────────────────────────────────────────────────
  const pricingRowCount = payload.tabs.find((t) => t.name === TAB_PRICING)!.values.length;
  requests.push({
    repeatCell: {
      range: {
        sheetId: pricingId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 3,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: headerBg,
          backgroundColorStyle: { rgbColor: headerBg },
          textFormat: {
            foregroundColor: headerText,
            foregroundColorStyle: { rgbColor: headerText },
            bold: true,
          },
        },
      },
      fields:
        "userEnteredFormat(backgroundColor,backgroundColorStyle,textFormat)",
    },
  });
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: pricingId,
        gridProperties: { frozenRowCount: 1 },
      },
      fields: "gridProperties.frozenRowCount",
    },
  });
  if (pricingRowCount > 1) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: pricingId,
          startRowIndex: 1,
          endRowIndex: pricingRowCount,
          startColumnIndex: 2,
          endColumnIndex: 3,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "CURRENCY", pattern: '"$"#,##0.00' },
          },
        },
        fields: "userEnteredFormat.numberFormat",
      },
    });
  }
  // Bold the grand total row (last row).
  if (pricingRowCount >= 2) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: pricingId,
          startRowIndex: pricingRowCount - 1,
          endRowIndex: pricingRowCount,
          startColumnIndex: 0,
          endColumnIndex: 3,
        },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat",
      },
    });
  }
  requests.push({
    autoResizeDimensions: {
      dimensions: {
        sheetId: pricingId,
        dimension: "COLUMNS",
        startIndex: 0,
        endIndex: 3,
      },
    },
  });

  // Suppress unused warnings on local consts that document the layout.
  void COL_ZONE;
  void COL_CATEGORY;
  void COL_QUANTITY;
  return requests;
}
