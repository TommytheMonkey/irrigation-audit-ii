import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { AuditStatus } from "@prisma/client";

// PATCH /api/audits/[auditId] — update audit (status, notes).
// Used to mark an audit "completed" from the summary screen.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    status?: AuditStatus;
    notes?: string;
  };

  const existing = await db.audit.findFirst({
    where: { id: auditId, orgId: user.orgId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const updated = await db.audit.update({
    where: { id: auditId },
    data: {
      ...(body.status !== undefined && {
        status: body.status,
        completedAt: body.status === "completed" ? new Date() : undefined,
      }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
    select: { id: true, status: true },
  });
  return NextResponse.json(updated);
}
