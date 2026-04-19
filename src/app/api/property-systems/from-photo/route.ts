import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";
import { extractFromImage } from "@/lib/system-extract";
import type { ZoneType } from "@prisma/client";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/property-systems/from-photo
// multipart/form-data: file, propertyId, name
//
// Creates a new PropertySystem on the target property, runs Claude vision
// over the uploaded photo, and inserts the extracted zones in one
// transaction. If extraction returns nothing the system is still created
// empty — the user can fill it in manually.
export async function POST(req: Request) {
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "not_configured", message: "ANTHROPIC_API_KEY isn't set." },
      { status: 500 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const propertyId = form?.get("propertyId");
  const name = form?.get("name");
  if (!(file instanceof File) || typeof propertyId !== "string" || typeof name !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "not_image", message: "Upload an image (JPEG, PNG, HEIC, WebP)." },
      { status: 400 },
    );
  }

  const property = await db.property.findFirst({
    where: { id: propertyId, orgId: auth.user.orgId },
    select: { id: true, _count: { select: { systems: true } } },
  });
  if (!property) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  let extracted;
  try {
    extracted = await extractFromImage(bytes, file.name, file.type);
  } catch (e) {
    console.error("[from-photo] extract failed:", e);
    return NextResponse.json(
      {
        error: "extract_failed",
        message: e instanceof Error ? e.message : "Extraction failed.",
      },
      { status: 502 },
    );
  }

  const zonesToCreate = extracted.zones.filter((z) =>
    Number.isFinite(z.zoneNumber),
  );

  const system = await db.$transaction(async (tx) => {
    const sys = await tx.propertySystem.create({
      data: {
        propertyId: property.id,
        orgId: auth.user.orgId,
        name: name.trim(),
        sortOrder: property._count.systems,
        notes: extracted.summary,
      },
    });
    if (zonesToCreate.length > 0) {
      await tx.propertyZone.createMany({
        data: zonesToCreate.map((z) => ({
          systemId: sys.id,
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
      });
    }
    return sys;
  });

  return NextResponse.json({
    ok: true,
    systemId: system.id,
    zonesCreated: zonesToCreate.length,
    summary: extracted.summary,
  });
}
