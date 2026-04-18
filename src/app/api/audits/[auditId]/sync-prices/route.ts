import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  GoogleAuthError,
  getAccessTokenForOrg,
  readSheetValues,
} from "@/lib/google";
import { TAB_FINDINGS } from "@/lib/sheet-export";
import { isMockMode, readMockExport } from "@/lib/dev-export-store";

// POST /api/audits/[auditId]/sync-prices
//
// Reads the "All Findings" tab of the audit's exported Sheet, parses the
// Unit Price column, and writes prices back to the matching findings.
// Findings whose Unit Price cell is blank are left alone (not zeroed) so
// the estimator can fill the sheet in incrementally without wiping work.
//
// Auth: admin or estimator role. Auditors can export but not pull prices —
// pricing is the estimator's lane.
//
// Match strategy: each row in the Sheet has the Neon Finding ID in the
// hidden N column. We use that as the join key. If a row is missing the ID
// (someone deleted it from the Sheet) we just skip it and report it back.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "estimator") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const audit = await db.audit.findFirst({
    where: { id: auditId, orgId: user.orgId },
    select: {
      id: true,
      googleSheetId: true,
      findings: { select: { id: true, quantity: true } },
    },
  });
  if (!audit) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!audit.googleSheetId) {
    return NextResponse.json(
      {
        error: "not_exported",
        message: "Export this audit to Google Sheets first.",
      },
      { status: 400 },
    );
  }

  // Build a quantity lookup so we can compute extPrice without re-reading
  // the row's quantity cell (which the estimator could have edited and
  // we'd rather trust the source-of-truth value in Neon).
  const quantityById = new Map<string, number>();
  for (const f of audit.findings) {
    quantityById.set(f.id, f.quantity ? Number(f.quantity) : 1);
  }

  // ── Get the rows from either the mock file or Sheets ────────────────────
  let rows: (string | number | null)[][];
  try {
    rows = await loadFindingRows(user.orgId, auditId, audit.googleSheetId);
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      await db.org.update({
        where: { id: user.orgId },
        data: { googleCredentialsEnc: null, googleConnectedEmail: null },
      });
      return NextResponse.json(
        {
          error: "google_auth",
          message: "Google connection expired — reconnect in Settings.",
        },
        { status: 401 },
      );
    }
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { error: "sync_failed", message: msg },
      { status: 502 },
    );
  }

  // ── Parse + update ──────────────────────────────────────────────────────
  const COL_UNIT_PRICE = 11; // L
  const COL_FINDING_ID = 13; // N
  let priced = 0;
  let unpriced = 0;
  const unmatched: number[] = []; // 1-indexed row numbers from the sheet

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const findingId = row[COL_FINDING_ID];
    const rawPrice = row[COL_UNIT_PRICE];
    if (!findingId || typeof findingId !== "string") {
      unmatched.push(i + 2); // +2 because we read from row 2 onward
      continue;
    }
    const qty = quantityById.get(findingId);
    if (qty === undefined) {
      // Sheet row points to a finding that no longer exists in Neon.
      unmatched.push(i + 2);
      continue;
    }
    const unitPrice = parsePrice(rawPrice);
    if (unitPrice === null) {
      unpriced++;
      continue;
    }
    const extPrice = Number((qty * unitPrice).toFixed(2));
    await db.auditFinding.update({
      where: { id: findingId },
      data: { unitPrice, extPrice },
    });
    priced++;
  }

  // Flip status to "priced" only when every finding has a price. Otherwise
  // leave the status alone (estimator may sync incrementally).
  const totalFindings = audit.findings.length;
  const fullyPriced = priced === totalFindings && totalFindings > 0;
  await db.audit.update({
    where: { id: auditId },
    data: {
      priceSyncedAt: new Date(),
      ...(fullyPriced && { status: "priced" }),
    },
  });

  // Compute the grand total for the toast.
  const totalRow = await db.auditFinding.aggregate({
    where: { auditId },
    _sum: { extPrice: true },
  });

  return NextResponse.json({
    ok: true,
    priced,
    unpriced,
    total: totalFindings,
    grandTotal: totalRow._sum.extPrice ? Number(totalRow._sum.extPrice) : 0,
    unmatched,
    fullyPriced,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function loadFindingRows(
  orgId: string,
  auditId: string,
  sheetId: string,
): Promise<(string | number | null)[][]> {
  if (isMockMode()) {
    const file = await readMockExport(auditId);
    if (!file) {
      throw new Error("Mock export file not found — re-export the audit.");
    }
    // Tabs[1] is "All Findings"; row 0 is the header, the rest are data.
    const findingsTab = file.payload.tabs.find((t) => t.name === TAB_FINDINGS);
    if (!findingsTab) {
      throw new Error("Mock export missing All Findings tab.");
    }
    return findingsTab.values.slice(1);
  }

  const org = await db.org.findUniqueOrThrow({
    where: { id: orgId },
    select: { googleCredentialsEnc: true },
  });
  if (!org.googleCredentialsEnc) {
    throw new Error("Google not connected.");
  }
  const accessToken = await getAccessTokenForOrg(org.googleCredentialsEnc);
  // Read columns A:N from row 2 to a generous upper bound. Google trims
  // trailing empty rows so a 2000-row range is safe even for small audits.
  return readSheetValues(accessToken, sheetId, `${TAB_FINDINGS}!A2:N2000`, {
    unformatted: true,
  });
}

function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  // String fallback — strip $ and commas in case the user typed them.
  const cleaned = raw.toString().replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
