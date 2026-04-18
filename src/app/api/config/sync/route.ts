import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readMockConfig } from "@/lib/config-mock";
import { syncConfig } from "@/lib/config-sync";

// POST /api/config/sync
//
// Re-reads the org's config (mock JSON file in dev) and applies it to Neon.
// Returns 400 with row/column-level errors if validation fails.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = user.orgId;

  const json = await readMockConfig(orgId);
  if (!json) {
    return NextResponse.json(
      { error: "not_initialized", message: "No config to sync. Initialize first." },
      { status: 404 },
    );
  }

  const result = await syncConfig(orgId, json);
  if (!result.ok) {
    return NextResponse.json({ error: "validation_failed", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json({ ok: true, summary: result.summary });
}
