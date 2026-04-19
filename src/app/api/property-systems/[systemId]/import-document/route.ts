import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertSystemInOrg, requireEditor } from "@/lib/system-profile-auth";
import { extractFromPdf, extractFromXlsx } from "@/lib/system-extract";
import type { ZoneType } from "@prisma/client";

export const runtime = "nodejs";
// PDFs + Claude extraction can take a while — Claude Opus with adaptive
// thinking on a 5-page drawing regularly takes 30-45s.
export const maxDuration = 60;

// POST /api/property-systems/[systemId]/import-document
// multipart/form-data with one "file" field (xlsx or pdf).
//
// Extraction is additive: new zones skip on (systemId, zoneNumber) conflict
// so re-imports don't duplicate. Parts always append — matching to existing
// parts is Phase 4 (catalog matcher) territory.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ systemId: string }> },
) {
  const { systemId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const owns = await assertSystemInOrg(systemId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "not_configured", message: "ANTHROPIC_API_KEY isn't set." },
      { status: 500 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const lowerName = file.name.toLowerCase();
  const isXlsx = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xlsm");
  const isPdf = lowerName.endsWith(".pdf");
  if (!isXlsx && !isPdf) {
    return NextResponse.json(
      { error: "unsupported_type", message: "Upload an .xlsx or .pdf file." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  let result;
  try {
    result = isXlsx
      ? await extractFromXlsx(bytes, file.name)
      : await extractFromPdf(bytes, file.name);
  } catch (e) {
    console.error("[import-document] extract failed:", e);
    return NextResponse.json(
      {
        error: "extract_failed",
        message: e instanceof Error ? e.message : "Extraction failed.",
      },
      { status: 502 },
    );
  }

  // Zones: skip any zoneNumber already present so re-imports don't collide
  // on the (systemId, zoneNumber) unique constraint.
  const existingZones = await db.propertyZone.findMany({
    where: { systemId },
    select: { zoneNumber: true },
  });
  const takenNumbers = new Set(existingZones.map((z) => z.zoneNumber));

  const zonesToCreate = result.zones.filter(
    (z) => Number.isFinite(z.zoneNumber) && !takenNumbers.has(z.zoneNumber),
  );
  const skippedZones = result.zones.length - zonesToCreate.length;

  const partsToCreate = result.parts.filter(
    (p) => p.brand || p.model || p.category,
  );

  const [zonesResult, partsResult] = await Promise.all([
    zonesToCreate.length > 0
      ? db.propertyZone.createMany({
          data: zonesToCreate.map((z) => ({
            systemId,
            zoneNumber: z.zoneNumber,
            zoneName: z.zoneName,
            zoneType: (z.zoneType as ZoneType) ?? "spray",
            valveBrand: z.valveBrand,
            valveModel: z.valveModel,
            valveSize: z.valveSize,
            ballValvePresent: z.ballValvePresent,
            headCount: z.headCount,
            coverage: z.coverage,
            notes: z.notes,
          })),
          skipDuplicates: true,
        })
      : Promise.resolve({ count: 0 }),
    partsToCreate.length > 0
      ? db.propertyPart.createMany({
          data: partsToCreate.map((p) => ({
            systemId,
            category: p.category,
            brand: p.brand,
            model: p.model,
            size: p.size,
            quantity: p.quantity == null ? null : Math.round(p.quantity),
            notes: p.notes,
          })),
        })
      : Promise.resolve({ count: 0 }),
  ]);

  // Persist the summary blurb on the system if one came back and the system
  // doesn't already have notes — don't overwrite existing text.
  if (result.summary) {
    const sys = await db.propertySystem.findUnique({
      where: { id: systemId },
      select: { notes: true },
    });
    if (sys && !sys.notes) {
      await db.propertySystem.update({
        where: { id: systemId },
        data: { notes: result.summary },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    fileName: file.name,
    fileKind: isXlsx ? "xlsx" : "pdf",
    zonesCreated: zonesResult.count,
    zonesSkipped: skippedZones,
    partsCreated: partsResult.count,
    summary: result.summary,
  });
}
