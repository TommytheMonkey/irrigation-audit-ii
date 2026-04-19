import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertSystemInOrg, requireEditor } from "@/lib/system-profile-auth";

export async function POST(req: Request) {
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const body = (await req.json().catch(() => ({}))) as {
    systemId?: string;
    sourceType?: string;
    label?: string | null;
    gpm?: number | null;
    psi?: number | null;
    permanent?: boolean;
    notes?: string | null;
  };
  if (!body.systemId || !body.sourceType) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const owns = await assertSystemInOrg(body.systemId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }

  const count = await db.propertyWaterSource.count({
    where: { systemId: body.systemId },
  });

  const created = await db.propertyWaterSource.create({
    data: {
      systemId: body.systemId,
      sourceType: body.sourceType,
      label: body.label?.trim() || null,
      gpm: body.gpm ?? null,
      psi: body.psi ?? null,
      permanent: body.permanent ?? true,
      notes: body.notes?.trim() || null,
      sortOrder: count,
    },
  });
  return NextResponse.json(created);
}
