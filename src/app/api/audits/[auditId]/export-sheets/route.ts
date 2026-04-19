import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  GoogleAuthError,
  batchUpdateSheet,
  createSpreadsheetInFolder,
  findOrCreateFolder,
  getAccessTokenForOrg,
  listSheetTabs,
  writeSheetValues,
} from "@/lib/google";
import {
  TAB_SUMMARY,
  buildFormatRequests,
  buildSheetPayload,
  type FullAudit,
} from "@/lib/sheet-export";
import {
  isMockMode,
  mockSpreadsheetUrl,
  writeMockExport,
} from "@/lib/dev-export-store";

// POST /api/audits/[auditId]/export-sheets
//
// Builds the audit Sheet payload, creates the Drive folder hierarchy
// {orgFolder}/Property Reports/{Property}/audit-{date}/, creates a fresh
// spreadsheet inside it, writes all four tabs, applies formatting, and
// stores the resulting sheetId/url + status=exported on the audit row.
//
// In GOOGLE_MOCK mode the same payload is written to dev-exports/{id}.json
// instead, so the full pipeline can be exercised without Google credentials.
//
// V1 deliberately creates a brand new sheet on each export (no overwrite of
// the previous one) — keeping things idempotent on the Neon side and
// letting the user keep prior versions in Drive if they want.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "auditor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const audit = await db.audit.findFirst({
    where: { id: auditId, orgId: user.orgId },
    include: {
      property: true,
      auditor: { select: { name: true, email: true } },
      systems: {
        orderBy: { createdAt: "asc" },
        include: {
          zones: {
            orderBy: { zoneNumber: "asc" },
            include: { findings: { orderBy: { createdAt: "asc" } } },
          },
        },
      },
      findings: true,
    },
  });
  if (!audit) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const org = await db.org.findUniqueOrThrow({
    where: { id: user.orgId },
    select: {
      name: true,
      brandColorPrimary: true,
      brandColorSecondary: true,
      googleCredentialsEnc: true,
      googleDriveFolderId: true,
    },
  });

  const payload = buildSheetPayload(audit as FullAudit, {
    name: org.name,
    brandColorPrimary: org.brandColorPrimary,
    brandColorSecondary: org.brandColorSecondary,
  });

  // ── Mock mode ───────────────────────────────────────────────────────────
  if (isMockMode()) {
    const sheetId = `mock-${auditId}`;
    const sheetUrl = mockSpreadsheetUrl(auditId);
    await writeMockExport({
      auditId,
      spreadsheetId: sheetId,
      spreadsheetUrl: sheetUrl,
      exportedAt: new Date().toISOString(),
      payload,
    });
    await db.audit.update({
      where: { id: auditId },
      data: {
        googleSheetId: sheetId,
        googleSheetUrl: sheetUrl,
        status: "exported",
      },
    });
    return NextResponse.json({
      ok: true,
      mock: true,
      sheetId,
      sheetUrl,
      title: payload.title,
      findingCount: payload.findingCount,
    });
  }

  // ── Real Google mode ────────────────────────────────────────────────────
  if (!org.googleCredentialsEnc) {
    return NextResponse.json(
      {
        error: "google_not_configured",
        message: "Connect Google in Settings before exporting.",
      },
      { status: 400 },
    );
  }

  try {
    const accessToken = await getAccessTokenForOrg(org.googleCredentialsEnc);

    // If the org hasn't picked a Drive folder, land the hierarchy in My
    // Drive's root — Google accepts the literal "root" as a parent alias.
    const exportRoot = org.googleDriveFolderId ?? "root";

    // Build folder hierarchy: {root}/Property Reports/{Property}/audit-{date}/
    const auditDate = (audit.completedAt ?? audit.startedAt)
      .toISOString()
      .slice(0, 10);
    const reportsFolder = await findOrCreateFolder(
      accessToken,
      "Property Reports",
      exportRoot,
    );
    const propertyFolder = await findOrCreateFolder(
      accessToken,
      audit.property.name,
      reportsFolder,
    );
    const auditFolder = await findOrCreateFolder(
      accessToken,
      `audit-${auditDate}`,
      propertyFolder,
    );

    // Create the spreadsheet directly in the audit folder.
    const { spreadsheetId, spreadsheetUrl } = await createSpreadsheetInFolder(
      accessToken,
      payload.title,
      auditFolder,
    );

    // The fresh spreadsheet has one default tab ("Sheet1"). Rename it to
    // "Summary" and add the other three tabs in a single batchUpdate.
    const initialTabs = await listSheetTabs(accessToken, spreadsheetId);
    const defaultTabId = initialTabs[0].sheetId;
    const renameAndAdd: unknown[] = [
      {
        updateSheetProperties: {
          properties: { sheetId: defaultTabId, title: TAB_SUMMARY },
          fields: "title",
        },
      },
    ];
    for (const tab of payload.tabs) {
      if (tab.name === TAB_SUMMARY) continue;
      renameAndAdd.push({
        addSheet: { properties: { title: tab.name } },
      });
    }
    await batchUpdateSheet(accessToken, spreadsheetId, renameAndAdd);

    // Get the new sheet ids assigned by Google.
    const tabsAfter = await listSheetTabs(accessToken, spreadsheetId);
    const sheetIdByTab: Record<string, number> = {};
    for (const t of tabsAfter) sheetIdByTab[t.title] = t.sheetId;

    // Write data into each tab via individual values updates. Could be
    // collapsed into a single values.batchUpdate but the per-tab path keeps
    // the failure modes obvious.
    for (const tab of payload.tabs) {
      if (tab.values.length === 0) continue;
      const lastCol = String.fromCharCode(
        65 + Math.max(...tab.values.map((r) => r.length)) - 1,
      );
      const range = `${tab.name}!A1:${lastCol}${tab.values.length}`;
      await writeSheetValues(accessToken, spreadsheetId, range, tab.values);
    }

    // Apply all format / structural requests in one shot.
    const formatRequests = buildFormatRequests(sheetIdByTab, payload, {
      name: org.name,
      brandColorPrimary: org.brandColorPrimary,
      brandColorSecondary: org.brandColorSecondary,
    });
    await batchUpdateSheet(accessToken, spreadsheetId, formatRequests);

    await db.audit.update({
      where: { id: auditId },
      data: {
        googleSheetId: spreadsheetId,
        googleSheetUrl: spreadsheetUrl,
        status: "exported",
      },
    });

    return NextResponse.json({
      ok: true,
      sheetId: spreadsheetId,
      sheetUrl: spreadsheetUrl,
      title: payload.title,
      findingCount: payload.findingCount,
    });
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      // Refresh token is dead — clear it so the user is forced to reconnect
      // rather than getting the same error every time they hit Export.
      await db.org.update({
        where: { id: user.orgId },
        data: {
          googleCredentialsEnc: null,
          googleConnectedEmail: null,
        },
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
      { error: "export_failed", message: msg },
      { status: 502 },
    );
  }
}
