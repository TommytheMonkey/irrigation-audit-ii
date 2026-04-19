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
    category?: string | null;
    brand?: string | null;
    model?: string | null;
    size?: string | null;
    quantity?: number | null;
    catalogSource?: string | null;
    catalogSymbol?: string | null;
    notes?: string | null;
  };
  if (!body.systemId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const owns = await assertSystemInOrg(body.systemId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }

  const created = await db.propertyPart.create({
    data: {
      systemId: body.systemId,
      category: body.category?.trim() || null,
      brand: body.brand?.trim() || null,
      model: body.model?.trim() || null,
      size: body.size?.trim() || null,
      quantity: body.quantity ?? null,
      catalogSource: body.catalogSource?.trim() || null,
      catalogSymbol: body.catalogSymbol?.trim() || null,
      notes: body.notes?.trim() || null,
    },
  });
  return NextResponse.json(created);
}
