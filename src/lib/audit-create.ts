// Shared audit-creation logic. Callers (POST /api/audits, the new-audit
// page's server action) agree on a Source discriminator — "blank",
// "previous_audit", or "profile" — and this helper fans out:
//
//   blank           → one empty AuditSystem labeled "1"
//   previous_audit  → duplicate AuditSystem + AuditZone from a prior audit
//   profile         → duplicate PropertySystem + PropertyZone into AuditSystem
//                     + AuditZone (controllers, water source, zones all
//                     carried over so the auditor isn't re-entering layout).
//
// Findings are intentionally never copied — a new audit is a fresh inspection.

import { db } from "./db";
import { ZoneSize, type ZoneType, type WiringType } from "@prisma/client";

export type AuditSource =
  | { type: "blank" }
  | { type: "previous_audit"; auditId: string }
  | { type: "profile" };

export async function createAudit(params: {
  orgId: string;
  propertyId: string;
  auditorUserId: string;
  source: AuditSource;
}): Promise<{ id: string }> {
  const { orgId, propertyId, auditorUserId, source } = params;

  // Fetch the source data (if any) BEFORE opening the transaction so the
  // tx stays short. Connection pool limits on Neon are tight.
  let prevAudit:
    | {
        systems: Array<{
          systemNumber: string;
          systemName: string | null;
          controllerBrand: string | null;
          controllerModel: string | null;
          controllerLocation: string | null;
          wiringType: WiringType | null;
          waterSourceType: string | null;
          zones: Array<{
            zoneNumber: number;
            zoneName: string | null;
            zoneType: ZoneType;
            zoneSize: ZoneSize;
          }>;
        }>;
      }
    | null = null;
  let propertySystems:
    | Array<{
        sortOrder: number;
        name: string;
        notes: string | null;
        backflowType: string | null;
        backflowNotes: string | null;
        controllers: Array<{
          brand: string | null;
          model: string | null;
          location: string | null;
          wiringType: WiringType | null;
        }>;
        waterSources: Array<{ sourceType: string }>;
        zones: Array<{
          zoneNumber: number;
          zoneName: string | null;
          zoneType: ZoneType;
          valveSize: string | null;
          notes: string | null;
        }>;
      }>
    | null = null;

  if (source.type === "previous_audit") {
    prevAudit = await db.audit.findFirst({
      where: { id: source.auditId, orgId },
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
    });
  } else if (source.type === "profile") {
    propertySystems = await db.propertySystem.findMany({
      where: { propertyId, orgId },
      orderBy: { sortOrder: "asc" },
      select: {
        sortOrder: true,
        name: true,
        notes: true,
        backflowType: true,
        backflowNotes: true,
        controllers: {
          orderBy: { sortOrder: "asc" },
          select: {
            brand: true,
            model: true,
            location: true,
            wiringType: true,
          },
        },
        waterSources: {
          orderBy: { sortOrder: "asc" },
          select: { sourceType: true },
        },
        zones: {
          orderBy: { zoneNumber: "asc" },
          select: {
            zoneNumber: true,
            zoneName: true,
            zoneType: true,
            valveSize: true,
            notes: true,
          },
        },
      },
    });
  }

  return db.$transaction(async (tx) => {
    const audit = await tx.audit.create({
      data: { orgId, propertyId, auditorUserId },
      select: { id: true },
    });

    if (source.type === "previous_audit" && prevAudit && prevAudit.systems.length > 0) {
      for (const s of prevAudit.systems) {
        const sys = await tx.auditSystem.create({
          data: {
            auditId: audit.id,
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
              auditId: audit.id,
              systemId: sys.id,
              zoneNumber: z.zoneNumber,
              zoneName: z.zoneName,
              zoneType: z.zoneType,
              zoneSize: z.zoneSize,
            })),
          });
        }
      }
    } else if (
      source.type === "profile" &&
      propertySystems &&
      propertySystems.length > 0
    ) {
      for (let i = 0; i < propertySystems.length; i++) {
        const ps = propertySystems[i];
        const firstController = ps.controllers[0];
        const firstSource = ps.waterSources[0];
        const sys = await tx.auditSystem.create({
          data: {
            auditId: audit.id,
            systemNumber: String(i + 1),
            systemName: ps.name,
            controllerBrand: firstController?.brand ?? null,
            controllerModel: firstController?.model ?? null,
            controllerLocation: firstController?.location ?? null,
            wiringType: firstController?.wiringType ?? null,
            waterSourceType: firstSource?.sourceType ?? null,
            backflowStatus: ps.backflowType ?? null,
            notes: ps.notes ?? null,
          },
          select: { id: true },
        });
        if (ps.zones.length > 0) {
          await tx.auditZone.createMany({
            data: ps.zones.map((z) => ({
              auditId: audit.id,
              systemId: sys.id,
              zoneNumber: z.zoneNumber,
              zoneName: z.zoneName,
              zoneType: z.zoneType,
              zoneSize: valveSizeToEnum(z.valveSize),
              notes: z.notes,
            })),
          });
        }
      }
    } else {
      // Blank or an empty source. Single default system.
      await tx.auditSystem.create({
        data: { auditId: audit.id, systemNumber: "1" },
      });
    }

    return audit;
  });
}

// Best-effort string → ZoneSize enum mapping. The profile stores valve size
// as freeform ("1\"", "3/4\"", etc.); AuditZone uses an enum. Unknown values
// fall back to "other".
function valveSizeToEnum(valveSize: string | null): ZoneSize {
  if (!valveSize) return ZoneSize.other;
  const normalized = valveSize.toLowerCase().replace(/[^0-9./]/g, "");
  if (normalized === "0.75" || normalized === "3/4") return ZoneSize.size_0_75in;
  if (normalized === "1") return ZoneSize.size_1in;
  if (normalized === "1.5") return ZoneSize.size_1_5in;
  if (normalized === "2") return ZoneSize.size_2in;
  return ZoneSize.other;
}
