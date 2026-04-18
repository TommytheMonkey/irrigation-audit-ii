import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deleteMockConfig } from "@/lib/config-mock";

// POST /api/config/reset
//
// Tear-down for the org's config: delete the mock JSON, soft-delete every
// org-scoped reference row (so the fallback to globals kicks back in), and
// clear configSheetId / configSyncedAt. Severity levels are also deactivated
// since they're org-scoped overrides; the UI falls back to globals.
//
// Historical findings still resolve their component category from the
// soft-deleted rows, so this is non-destructive to existing audits.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = user.orgId;

  await deleteMockConfig(orgId);

  await db.$transaction(async (tx) => {
    await tx.componentType.updateMany({
      where: { orgId },
      data: { isActive: false },
    });
    await tx.quickPickFinding.updateMany({
      where: { orgId },
      data: { isActive: false },
    });
    await tx.severityLevel.updateMany({
      where: { orgId },
      data: { isActive: false },
    });
    await tx.org.update({
      where: { id: orgId },
      data: { configSheetId: null, configSyncedAt: null },
    });
  });

  return NextResponse.json({ ok: true });
}
