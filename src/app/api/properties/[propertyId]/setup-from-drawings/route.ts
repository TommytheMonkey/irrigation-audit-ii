import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";
import type { ZoneType } from "@prisma/client";

export const runtime = "nodejs";
export const maxDuration = 300;

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

// ── Extraction types ────────────────────────────────────────────────────────

export type ExtractedPOC = {
  pocNumber: number;
  waterMeterSize: string | null;
  staticPressure: string | null;
  flowAvailable: string | null;
  serviceLineSize: string | null;
  notes: string | null;
};

export type ExtractedValve = {
  pocNumber: number;
  valveNumber: string;
  manufacturer: string | null;
  model: string | null;
  size: string | null;
  type: string | null;
  zoneType: "spray" | "drip" | "bubbler" | "rotor" | "other";
  gpm: number | null;
  psi: number | null;
  precipitationRate: number | null;
  sqft: number | null;
  notes: string | null;
};

export type ExtractedPipe = {
  pocNumber: number | null;
  material: string;
  size: string;
  length: number | null;
  usage: string | null;
};

export type DrawingExtraction = {
  pocs: ExtractedPOC[];
  valves: ExtractedValve[];
  pipes: ExtractedPipe[];
  summary: string | null;
};

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You extract irrigation system data from construction drawing schedules — valve schedules, watering schedules, irrigation schedules, and critical analysis tables. Respond ONLY with JSON matching the requested shape. No prose, no markdown fences.

Rules:
- A drawing may show one or more POCs (Points of Connection). Each POC is a separate water supply. Extract all of them.
- For each POC, extract the Critical Analysis data: P.O.C. number, water meter size, static pressure, flow available, service line size.
- For each valve row in the Valve Schedule, extract: valve number (e.g. "A1", "B14"), manufacturer/model, size, type description (e.g. "Area for Dripline", "Drip Emitter"), GPM, PSI, precipitation rate, square footage.
- Map the "type" column to a zoneType: "drip" for anything with Dripline/Drip Emitter/XFS/XCZ, "spray" for spray heads/fixed spray, "rotor" for MP rotators/rotors/I-series, "bubbler" for bubblers, "other" for anything else.
- For pipe/mainline/lateral data from the Irrigation Schedule, extract material, size, and total length if shown.
- Valve numbers should preserve the exact alphanumeric format from the schedule (e.g. "A1", "A2", "B1").
- If a value is unreadable or absent, use null.`;

const USER_PROMPT = `Return JSON with this exact shape:
{
  "pocs": [{ "pocNumber": int, "waterMeterSize": string|null, "staticPressure": string|null, "flowAvailable": string|null, "serviceLineSize": string|null, "notes": string|null }],
  "valves": [{ "pocNumber": int, "valveNumber": string, "manufacturer": string|null, "model": string|null, "size": string|null, "type": string|null, "zoneType": "spray"|"drip"|"bubbler"|"rotor"|"other", "gpm": number|null, "psi": number|null, "precipitationRate": number|null, "sqft": number|null, "notes": string|null }],
  "pipes": [{ "pocNumber": int|null, "material": string, "size": string, "length": number|null, "usage": string|null }],
  "summary": string|null
}

"summary" is one sentence describing the overall irrigation system. Extract every POC, every valve row, and every pipe entry visible in the schedules.`;

// ── POST handler ─────────────────────────────────────────────────────────────
// Accepts multipart/form-data with one or more image files.
// Returns the raw extraction for client-side review before committing.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
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

  const prop = await db.property.findFirst({
    where: { id: propertyId, orgId: auth.user.orgId },
    select: { id: true },
  });
  if (!prop) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const imageBlocks: Anthropic.ContentBlockParam[] = [];
  for (const [, value] of form.entries()) {
    if (!(value instanceof File)) continue;
    if (!value.type.startsWith("image/")) continue;
    const bytes = Buffer.from(await value.arrayBuffer());
    imageBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: normalizeMediaType(value.type),
        data: bytes.toString("base64"),
      },
    });
  }

  if (imageBlocks.length === 0) {
    return NextResponse.json(
      { error: "no_images", message: "Upload at least one image." },
      { status: 400 },
    );
  }

  imageBlocks.push({
    type: "text",
    text: `${USER_PROMPT}\n\n---\n\nThese are photos/screenshots of irrigation schedule drawings. Extract all POCs, valve rows, and pipe data visible across all images.`,
  });

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: imageBlocks }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude returned no text block");
    }

    const cleaned = textBlock.text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed: DrawingExtraction;
    try {
      parsed = JSON.parse(cleaned) as DrawingExtraction;
    } catch {
      throw new Error("Claude returned invalid JSON");
    }

    parsed.pocs = Array.isArray(parsed.pocs) ? parsed.pocs : [];
    parsed.valves = Array.isArray(parsed.valves) ? parsed.valves : [];
    parsed.pipes = Array.isArray(parsed.pipes) ? parsed.pipes : [];

    return NextResponse.json({ ok: true, extraction: parsed });
  } catch (e) {
    console.error("[setup-from-drawings] extract failed:", e);
    return NextResponse.json(
      {
        error: "extract_failed",
        message: e instanceof Error ? e.message : "Extraction failed.",
      },
      { status: 502 },
    );
  }
}

// ── PUT handler ──────────────────────────────────────────────────────────────
// Accepts the reviewed/edited extraction and commits it to the database.
// Creates one PropertySystem per POC with zones from the valve schedule.

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const prop = await db.property.findFirst({
    where: { id: propertyId, orgId: auth.user.orgId },
    select: { id: true, _count: { select: { systems: true } } },
  });
  if (!prop) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as DrawingExtraction | null;
  if (!body || !Array.isArray(body.pocs)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const systemIds: string[] = [];
  let totalZones = 0;

  await db.$transaction(async (tx) => {
    let sortOrder = prop._count.systems;

    for (const poc of body.pocs) {
      const sys = await tx.propertySystem.create({
        data: {
          propertyId,
          orgId: auth.user.orgId,
          name: `POC ${poc.pocNumber}`,
          sortOrder: sortOrder++,
          notes: [
            poc.waterMeterSize && `Meter: ${poc.waterMeterSize}`,
            poc.staticPressure && `Static pressure: ${poc.staticPressure}`,
            poc.flowAvailable && `Flow available: ${poc.flowAvailable}`,
            poc.serviceLineSize && `Service line: ${poc.serviceLineSize}`,
            poc.notes,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });
      systemIds.push(sys.id);

      // Water source from POC data
      if (poc.flowAvailable || poc.staticPressure) {
        await tx.propertyWaterSource.create({
          data: {
            systemId: sys.id,
            sourceType: "city_meter",
            label: `POC ${poc.pocNumber}`,
            gpm: parseDecimal(poc.flowAvailable),
            psi: parseDecimal(poc.staticPressure),
          },
        });
      }

      const pocValves = (body.valves ?? []).filter(
        (v) => v.pocNumber === poc.pocNumber,
      );

      if (pocValves.length > 0) {
        let zoneNum = 1;
        await tx.propertyZone.createMany({
          data: pocValves.map((v) => ({
            systemId: sys.id,
            zoneNumber: zoneNum++,
            zoneName: v.valveNumber,
            zoneType: (v.zoneType as ZoneType) ?? "other",
            valveBrand: v.manufacturer,
            valveModel: v.model,
            valveSize: v.size,
            coverage: v.sqft ? `~${v.sqft} sq ft` : null,
            notes: [
              v.type,
              v.gpm != null ? `${v.gpm} GPM` : null,
              v.psi != null ? `${v.psi} PSI` : null,
              v.precipitationRate != null
                ? `${v.precipitationRate} in/hr`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
          })),
          skipDuplicates: true,
        });
        totalZones += pocValves.length;
      }
    }

    await tx.property.update({
      where: { id: propertyId },
      data: { setupStatus: "CONFIGURED" },
    });
  });

  return NextResponse.json({
    ok: true,
    systemsCreated: systemIds.length,
    zonesCreated: totalZones,
    systemIds,
  });
}

function normalizeMediaType(mime: string): ImageMediaType {
  const lower = mime.toLowerCase();
  if (lower.includes("png")) return "image/png";
  if (lower.includes("gif")) return "image/gif";
  if (lower.includes("webp")) return "image/webp";
  return "image/jpeg";
}

function parseDecimal(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseFloat(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
