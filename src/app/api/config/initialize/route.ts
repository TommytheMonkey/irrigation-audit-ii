import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildDefaultConfig } from "@/lib/config-default";
import { writeMockConfig, readMockConfig } from "@/lib/config-mock";
import { syncConfig } from "@/lib/config-sync";

// POST /api/config/initialize
//
// First-time setup: snapshot the current global reference data into a fresh
// org-scoped config (mock JSON for now), sync it into Neon, and stamp the org
// with configSheetId="mock". Idempotent — if a mock file already exists,
// re-uses it instead of overwriting.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = user.orgId;

  let json = await readMockConfig(orgId);
  if (!json) {
    json = await buildDefaultConfig(user.org.name);
    await writeMockConfig(orgId, json);
  }

  const result = await syncConfig(orgId, json);
  if (!result.ok) {
    return NextResponse.json({ error: "validation_failed", errors: result.errors }, { status: 400 });
  }

  await db.org.update({
    where: { id: orgId },
    data: { configSheetId: "mock" },
  });

  return NextResponse.json({ ok: true, summary: result.summary });
}
