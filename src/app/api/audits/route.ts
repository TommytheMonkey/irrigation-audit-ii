import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST /api/audits — create a new audit + a default first system "1".
// Body: { propertyId: string, copyFromAuditId?: string }
//
// copyFromAuditId duplicates the systems and zones from a previous audit
// (findings are NOT copied — that's the whole point of a re-audit).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    propertyId: string;
    copyFromAuditId?: string;
  };

  // Verify the property belongs to this org.
  const property = await db.property.findFirst({
    where: { id: body.propertyId, orgId: user.orgId },
    select: { id: true },
  });
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  // Optionally load systems+zones to copy.
  const source = body.copyFromAuditId
    ? await db.audit.findFirst({
        where: { id: body.copyFromAuditId, orgId: user.orgId },
        select: {
          systems: {
            orderBy: { createdAt: "asc" },
            select: {
              systemNumber: true,
              systemName: true,
              controllerBrand: true,
              controllerModel: true,
              controllerLocation: true,
              wiringType: true,
              waterSourceType: true,
              zones: {
                orderBy: { zoneNumber: "asc" },
                select: {
                  zoneNumber: true,
                  zoneName: true,
                  zoneType: true,
                  zoneSize: true,
                },
              },
            },
          },
        },
      })
    : null;

  // Use a transaction so a partially-created audit can't be left around if
  // something blows up halfway through.
  const audit = await db.$transaction(async (tx) => {
    const a = await tx.audit.create({
      data: {
        orgId: user.orgId,
        propertyId: property.id,
        auditorUserId: user.id,
      },
      select: { id: true },
    });

    if (source && source.systems.length > 0) {
      for (const s of source.systems) {
        const sys = await tx.auditSystem.create({
          data: {
            auditId: a.id,
            systemNumber: s.systemNumber,
            systemName: s.systemName,
            controllerBrand: s.controllerBrand,
            controllerModel: s.controllerModel,
            controllerLocation: s.controllerLocation,
            wiringType: s.wiringType,
            waterSourceType: s.waterSourceType,
          },
          select: { id: true },
        });
        if (s.zones.length > 0) {
          await tx.auditZone.createMany({
            data: s.zones.map((z) => ({
              auditId: a.id,
              systemId: sys.id,
              zoneNumber: z.zoneNumber,
              zoneName: z.zoneName,
              zoneType: z.zoneType,
              zoneSize: z.zoneSize,
            })),
          });
        }
      }
    } else {
      // Default: a single un-named system "1" so the auditor doesn't have to
      // think about systems on a one-system property — they can jump straight
      // into adding zones.
      await tx.auditSystem.create({
        data: { auditId: a.id, systemNumber: "1" },
      });
    }
    return a;
  });

  return NextResponse.json({ id: audit.id });
}
