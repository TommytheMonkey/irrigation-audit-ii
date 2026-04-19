import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertSubInOrg, requireEditor } from "@/lib/system-profile-auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const owns = await assertSubInOrg("waterSource", sourceId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    sourceType?: string;
    label?: string | null;
    gpm?: number | null;
    psi?: number | null;
    permanent?: boolean;
    notes?: string | null;
  };
  const norm = (v: string | null | undefined) =>
    v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim();

  const updated = await db.propertyWaterSource.update({
    where: { id: sourceId },
    data: {
      ...(body.sourceType !== undefined && { sourceType: body.sourceType }),
      ...(body.label !== undefined && { label: norm(body.label) }),
      ...(body.gpm !== undefined && { gpm: body.gpm }),
      ...(body.psi !== undefined && { psi: body.psi }),
      ...(body.permanent !== undefined && { permanent: body.permanent }),
      ...(body.notes !== undefined && { notes: norm(body.notes) }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const owns = await assertSubInOrg("waterSource", sourceId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }
  await db.propertyWaterSource.delete({ where: { id: sourceId } });
  return NextResponse.json({ ok: true });
}
