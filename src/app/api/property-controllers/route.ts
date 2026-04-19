import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertSystemInOrg, requireEditor } from "@/lib/system-profile-auth";
import type { WiringType } from "@prisma/client";

export async function POST(req: Request) {
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const body = (await req.json().catch(() => ({}))) as {
    systemId?: string;
    name?: string | null;
    brand?: string | null;
    model?: string | null;
    stationCount?: number | null;
    location?: string | null;
    wiringType?: WiringType | null;
    rainSensorPresent?: boolean | null;
    notes?: string | null;
  };
  if (!body.systemId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const owns = await assertSystemInOrg(body.systemId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }

  const count = await db.propertyController.count({
    where: { systemId: body.systemId },
  });

  const created = await db.propertyController.create({
    data: {
      systemId: body.systemId,
      name: body.name?.trim() || null,
      brand: body.brand?.trim() || null,
      model: body.model?.trim() || null,
      stationCount: body.stationCount ?? null,
      location: body.location?.trim() || null,
      wiringType: body.wiringType ?? null,
      rainSensorPresent: body.rainSensorPresent ?? null,
      notes: body.notes?.trim() || null,
      sortOrder: count,
    },
  });
  return NextResponse.json(created);
}
