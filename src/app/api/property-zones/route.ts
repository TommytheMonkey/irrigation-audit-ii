import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertSystemInOrg, requireEditor } from "@/lib/system-profile-auth";
import type { ZoneType } from "@prisma/client";

export async function POST(req: Request) {
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const body = (await req.json().catch(() => ({}))) as {
    systemId?: string;
    zoneNumber?: number;
    zoneName?: string | null;
    zoneType?: ZoneType;
    valveBrand?: string | null;
    valveModel?: string | null;
    valveSize?: string | null;
    ballValvePresent?: boolean | null;
    headCount?: number | null;
    coverage?: string | null;
    notes?: string | null;
  };
  if (!body.systemId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const owns = await assertSystemInOrg(body.systemId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }

  // Default zone number to max+1 if not provided, so quick-adds work.
  let zoneNumber = body.zoneNumber;
  if (zoneNumber === undefined || zoneNumber === null) {
    const last = await db.propertyZone.findFirst({
      where: { systemId: body.systemId },
      orderBy: { zoneNumber: "desc" },
      select: { zoneNumber: true },
    });
    zoneNumber = (last?.zoneNumber ?? 0) + 1;
  }

  const created = await db.propertyZone.create({
    data: {
      systemId: body.systemId,
      zoneNumber,
      zoneName: body.zoneName?.trim() || null,
      zoneType: body.zoneType ?? "spray",
      valveBrand: body.valveBrand?.trim() || null,
      valveModel: body.valveModel?.trim() || null,
      valveSize: body.valveSize?.trim() || null,
      ballValvePresent: body.ballValvePresent ?? null,
      headCount: body.headCount ?? null,
      coverage: body.coverage?.trim() || null,
      notes: body.notes?.trim() || null,
    },
  });
  return NextResponse.json(created);
}
