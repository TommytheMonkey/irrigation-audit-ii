import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { ZoneType, ZoneSize } from "@prisma/client";

// POST /api/audits/[auditId]/zones — add a new zone.
// Body: { systemId?: string, zoneNumber: number, zoneName?: string,
//          zoneType?: ZoneType, zoneSize?: ZoneSize }
// If systemId is omitted we attach to the audit's first system, which is the
// common case (one-system properties — auditor doesn't have to think about it).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    systemId?: string;
    zoneNumber: number;
    zoneName?: string;
    zoneType?: ZoneType;
    zoneSize?: ZoneSize;
  };

  // Verify audit ownership and load systems in one go.
  const audit = await db.audit.findFirst({
    where: { id: auditId, orgId: user.orgId },
    include: {
      systems: { select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  if (!audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }
  const systemId = body.systemId ?? audit.systems[0]?.id;
  if (!systemId) {
    return NextResponse.json(
      { error: "No system found on audit" },
      { status: 400 },
    );
  }

  const zone = await db.auditZone.create({
    data: {
      auditId,
      systemId,
      zoneNumber: body.zoneNumber,
      zoneName: body.zoneName ?? null,
      zoneType: body.zoneType ?? "spray",
      zoneSize: body.zoneSize ?? "other",
    },
    select: {
      id: true,
      zoneNumber: true,
      zoneName: true,
      zoneType: true,
      zoneSize: true,
    },
  });
  return NextResponse.json(zone);
}
