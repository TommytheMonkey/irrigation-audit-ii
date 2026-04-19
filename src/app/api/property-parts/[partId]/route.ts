import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertSubInOrg, requireEditor } from "@/lib/system-profile-auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ partId: string }> },
) {
  const { partId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const owns = await assertSubInOrg("part", partId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    category?: string | null;
    brand?: string | null;
    model?: string | null;
    size?: string | null;
    quantity?: number | null;
    catalogSource?: string | null;
    catalogSymbol?: string | null;
    notes?: string | null;
  };
  const norm = (v: string | null | undefined) =>
    v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim();

  const updated = await db.propertyPart.update({
    where: { id: partId },
    data: {
      ...(body.category !== undefined && { category: norm(body.category) }),
      ...(body.brand !== undefined && { brand: norm(body.brand) }),
      ...(body.model !== undefined && { model: norm(body.model) }),
      ...(body.size !== undefined && { size: norm(body.size) }),
      ...(body.quantity !== undefined && { quantity: body.quantity }),
      ...(body.catalogSource !== undefined && {
        catalogSource: norm(body.catalogSource),
      }),
      ...(body.catalogSymbol !== undefined && {
        catalogSymbol: norm(body.catalogSymbol),
      }),
      ...(body.notes !== undefined && { notes: norm(body.notes) }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ partId: string }> },
) {
  const { partId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const owns = await assertSubInOrg("part", partId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }
  await db.propertyPart.delete({ where: { id: partId } });
  return NextResponse.json({ ok: true });
}
