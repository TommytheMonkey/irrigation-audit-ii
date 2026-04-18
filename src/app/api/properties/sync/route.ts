import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { syncProperties } from "@/lib/monday";

// POST /api/properties/sync
//
// Pulls the org's Monday board and reconciles against the properties table.
// Returns a summary of created/updated/removed counts on success, or an
// error code (`not_configured`, `missing_mapping`, `monday_error`) the UI
// can map to a friendly message.
//
// Admin-only — sync mutates org-wide property data.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await syncProperties(user.orgId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, summary: result.summary });
}
