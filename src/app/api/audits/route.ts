import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createAudit, type AuditSource } from "@/lib/audit-create";

// POST /api/audits — start a new audit.
// Body: { propertyId: string, copyFromAuditId?: string, fromProfile?: boolean }
//
// Source priority (only one applies):
//   fromProfile=true  → duplicate property's system profile into the audit
//   copyFromAuditId   → duplicate a prior audit's systems/zones
//   (neither)         → single empty AuditSystem "1"
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    propertyId: string;
    copyFromAuditId?: string;
    fromProfile?: boolean;
  };

  const property = await db.property.findFirst({
    where: { id: body.propertyId, orgId: user.orgId },
    select: { id: true },
  });
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const source: AuditSource = body.fromProfile
    ? { type: "profile" }
    : body.copyFromAuditId
      ? { type: "previous_audit", auditId: body.copyFromAuditId }
      : { type: "blank" };

  const audit = await createAudit({
    orgId: user.orgId,
    propertyId: property.id,
    auditorUserId: user.id,
    source,
  });

  return NextResponse.json({ id: audit.id });
}
