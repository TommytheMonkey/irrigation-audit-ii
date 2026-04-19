import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";

// POST /api/property-systems
// Body: { propertyId: string, name: string }
//
// Create a new system on a property. Sort order is assigned based on the
// count of existing systems on the same property so the new tab lands at
// the end.
export async function POST(req: Request) {
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    propertyId?: string;
    name?: string;
  };
  if (!body.propertyId || !body.name) {
    return NextResponse.json(
      { error: "invalid_request", message: "propertyId and name are required" },
      { status: 400 },
    );
  }

  const property = await db.property.findFirst({
    where: { id: body.propertyId, orgId: auth.user.orgId },
    select: { id: true, _count: { select: { systems: true } } },
  });
  if (!property) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const created = await db.propertySystem.create({
    data: {
      propertyId: property.id,
      orgId: auth.user.orgId,
      name: body.name.trim(),
      sortOrder: property._count.systems,
    },
  });
  return NextResponse.json(created);
}
