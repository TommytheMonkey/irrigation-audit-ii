import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertSubInOrg, requireEditor } from "@/lib/system-profile-auth";
import type { WiringType } from "@prisma/client";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ controllerId: string }> },
) {
  const { controllerId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const owns = await assertSubInOrg("controller", controllerId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string | null;
    brand?: string | null;
    model?: string | null;
    stationCount?: number | null;
    location?: string | null;
    wiringType?: WiringType | null;
    rainSensorPresent?: boolean | null;
    notes?: string | null;
  };
  const norm = (v: string | null | undefined) =>
    v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim();

  const updated = await db.propertyController.update({
    where: { id: controllerId },
    data: {
      ...(body.name !== undefined && { name: norm(body.name) }),
      ...(body.brand !== undefined && { brand: norm(body.brand) }),
      ...(body.model !== undefined && { model: norm(body.model) }),
      ...(body.stationCount !== undefined && { stationCount: body.stationCount }),
      ...(body.location !== undefined && { location: norm(body.location) }),
      ...(body.wiringType !== undefined && { wiringType: body.wiringType }),
      ...(body.rainSensorPresent !== undefined && {
        rainSensorPresent: body.rainSensorPresent,
      }),
      ...(body.notes !== undefined && { notes: norm(body.notes) }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ controllerId: string }> },
) {
  const { controllerId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const owns = await assertSubInOrg("controller", controllerId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }
  await db.propertyController.delete({ where: { id: controllerId } });
  return NextResponse.json({ ok: true });
}
