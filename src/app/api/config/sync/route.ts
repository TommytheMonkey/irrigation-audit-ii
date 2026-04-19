import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readMockConfig } from "@/lib/config-mock";
import { readConfigSheet } from "@/lib/config-sheet";
import { syncConfig } from "@/lib/config-sync";
import { GoogleAuthError } from "@/lib/google";

// POST /api/config/sync
//
// Re-reads the org's config from its current source (mock JSON in DB or a
// real Google Sheet) and applies it to Neon. Returns 400 with row/column-
// level validation errors on failure.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = user.orgId;

  const org = await db.org.findUniqueOrThrow({
    where: { id: orgId },
    select: { configSheetId: true },
  });
  if (!org.configSheetId) {
    return NextResponse.json(
      { error: "not_initialized", message: "No config to sync. Initialize first." },
      { status: 404 },
    );
  }

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
    console.error("[config/sync] read failed:", e);
    return NextResponse.json(
      { error: "read_failed", message: "Couldn't read the config." },
      { status: 502 },
    );
  }

  if (!json) {
    return NextResponse.json(
      { error: "not_initialized", message: "No config rows found. Re-initialize." },
      { status: 404 },
    );
  }

  const result = await syncConfig(orgId, json);
  if (!result.ok) {
    return NextResponse.json(
      { error: "validation_failed", errors: result.errors },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, summary: result.summary });
}
