import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// PATCH /api/findings/[findingId] — update pin location on site plan.
// Body: { sitePlanX?, sitePlanY?, sitePlanFileId? }
export async function PATCH(
  req: Request,
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

  const body = (await req.json().catch(() => ({}))) as {
    sitePlanX?: number | null;
    sitePlanY?: number | null;
    sitePlanFileId?: string | null;
  };

  const updated = await db.auditFinding.update({
    where: { id: findingId },
    data: {
      ...(body.sitePlanX !== undefined && { sitePlanX: body.sitePlanX }),
      ...(body.sitePlanY !== undefined && { sitePlanY: body.sitePlanY }),
      ...(body.sitePlanFileId !== undefined && {
        sitePlanFileId: body.sitePlanFileId,
      }),
    },
  });
  return NextResponse.json(updated);
}

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
