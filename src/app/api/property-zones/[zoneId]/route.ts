import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertSubInOrg, requireEditor } from "@/lib/system-profile-auth";
import type { ZoneType } from "@prisma/client";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  const { zoneId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const owns = await assertSubInOrg("zone", zoneId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
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
  const norm = (v: string | null | undefined) =>
    v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim();

  const updated = await db.propertyZone.update({
    where: { id: zoneId },
    data: {
      ...(body.zoneNumber !== undefined && { zoneNumber: body.zoneNumber }),
      ...(body.zoneName !== undefined && { zoneName: norm(body.zoneName) }),
      ...(body.zoneType !== undefined && { zoneType: body.zoneType }),
      ...(body.valveBrand !== undefined && { valveBrand: norm(body.valveBrand) }),
      ...(body.valveModel !== undefined && { valveModel: norm(body.valveModel) }),
      ...(body.valveSize !== undefined && { valveSize: norm(body.valveSize) }),
      ...(body.ballValvePresent !== undefined && {
        ballValvePresent: body.ballValvePresent,
      }),
      ...(body.headCount !== undefined && { headCount: body.headCount }),
      ...(body.coverage !== undefined && { coverage: norm(body.coverage) }),
      ...(body.notes !== undefined && { notes: norm(body.notes) }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  const { zoneId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const owns = await assertSubInOrg("zone", zoneId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }
  await db.propertyZone.delete({ where: { id: zoneId } });
  return NextResponse.json({ ok: true });
}
