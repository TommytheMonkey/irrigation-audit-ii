import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildDefaultConfig } from "@/lib/config-default";
import { writeMockConfig, readMockConfig } from "@/lib/config-mock";
import { createConfigSheet, readConfigSheet } from "@/lib/config-sheet";
import { syncConfig } from "@/lib/config-sync";
import { GoogleAuthError } from "@/lib/google";

// POST /api/config/initialize
//
// First-time setup. Behavior depends on whether the org has connected Google:
//
//   • Google connected: create a fresh Google Spreadsheet titled
//     "<OrgName> — Audit Config" in the org's Drive folder (or root),
//     populate four tabs with defaults, store the sheet id on org.
//     "Sync now" reads from this sheet.
//
//   • Not connected: mock mode — default JSON goes into the
//     Org.configMockJson column and configSheetId gets the sentinel "mock".
//
// Idempotent: if already initialized, just re-syncs from the current source
// without recreating anything.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = user.orgId;

  const org = await db.org.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      name: true,
      configSheetId: true,
      googleCredentialsEnc: true,
    },
  });

  // Re-sync path for already-initialized orgs (idempotent).
  if (org.configSheetId) {
    let json;
    try {
      json =
        org.configSheetId === "mock"
          ? await readMockConfig(orgId)
          : await readConfigSheet(orgId, org.configSheetId);
    } catch (e) {
      if (e instanceof GoogleAuthError) {
        return NextResponse.json(
          {
            error: "google_auth",
            message: "Reconnect Google in Settings → Integrations.",
          },
          { status: 401 },
        );
      }
      throw e;
    }
    if (!json) {
      return NextResponse.json(
        { error: "no_config", message: "Config is initialized but empty." },
        { status: 500 },
      );
    }
    const result = await syncConfig(orgId, json);
    if (!result.ok) {
      return NextResponse.json(
        { error: "validation_failed", errors: result.errors },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      summary: result.summary,
      mode: org.configSheetId === "mock" ? "mock" : "sheets",
    });
  }

  // Fresh init.
  const json = await buildDefaultConfig(org.name);
  let mode: "mock" | "sheets" = "mock";
  let spreadsheetUrl: string | null = null;

  if (org.googleCredentialsEnc) {
    try {
      const created = await createConfigSheet(orgId, json, org.name);
      await db.org.update({
        where: { id: orgId },
        data: { configSheetId: created.spreadsheetId },
      });
      spreadsheetUrl = created.spreadsheetUrl;
      mode = "sheets";
    } catch (e) {
      if (e instanceof GoogleAuthError) {
        return NextResponse.json(
          {
            error: "google_auth",
            message: "Google connection is invalid. Reconnect in Settings → Integrations.",
          },
          { status: 401 },
        );
      }
      console.error("[config/initialize] sheet create failed:", e);
      return NextResponse.json(
        {
          error: "sheet_create_failed",
          message: "Couldn't create the Google Sheet.",
        },
        { status: 502 },
      );
    }
  } else {
    await writeMockConfig(orgId, json);
    await db.org.update({
      where: { id: orgId },
      data: { configSheetId: "mock" },
    });
  }

  const result = await syncConfig(orgId, json);
  if (!result.ok) {
    return NextResponse.json(
      { error: "validation_failed", errors: result.errors },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    summary: result.summary,
    mode,
    spreadsheetUrl,
  });
}
