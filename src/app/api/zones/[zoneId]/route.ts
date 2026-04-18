import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// PATCH /api/zones/[zoneId] — update a zone (rename, mark complete, etc.)
// Body: { zoneName?, zoneNumber?, zoneType?, zoneSize?, completed?: boolean }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  const { zoneId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    zoneName?: string | null;
    zoneNumber?: number;
    zoneType?: "spray" | "drip" | "bubbler" | "rotor" | "other";
    zoneSize?: "size_0_75in" | "size_1in" | "size_1_5in" | "size_2in" | "other";
    completed?: boolean;
  };

  // Tenancy check: verify the zone's audit belongs to this org.
  const zone = await db.auditZone.findFirst({
    where: { id: zoneId, audit: { orgId: user.orgId } },
    select: { id: true },
  });
  if (!zone) {
    return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  }

  const updated = await db.auditZone.update({
    where: { id: zoneId },
    data: {
      ...(body.zoneName !== undefined && { zoneName: body.zoneName }),
      ...(body.zoneNumber !== undefined && { zoneNumber: body.zoneNumber }),
      ...(body.zoneType !== undefined && { zoneType: body.zoneType }),
      ...(body.zoneSize !== undefined && { zoneSize: body.zoneSize }),
      ...(body.completed !== undefined && {
        completedAt: body.completed ? new Date() : null,
      }),
    },
  });
  return NextResponse.json(updated);
}

// DELETE /api/zones/[zoneId] — remove a zone (cascades findings).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  const { zoneId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const zone = await db.auditZone.findFirst({
    where: { id: zoneId, audit: { orgId: user.orgId } },
    select: { id: true },
  });
  if (!zone) {
    return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  }
  await db.auditZone.delete({ where: { id: zoneId } });
  return NextResponse.json({ ok: true });
}
