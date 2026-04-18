import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// DELETE /api/findings/[findingId] — remove a finding.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ findingId: string }> },
) {
  const { findingId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const finding = await db.auditFinding.findFirst({
    where: { id: findingId, audit: { orgId: user.orgId } },
    select: { id: true },
  });
  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }
  await db.auditFinding.delete({ where: { id: findingId } });
  return NextResponse.json({ ok: true });
}
