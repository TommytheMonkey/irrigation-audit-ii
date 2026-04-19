// One-shot seed: populate a property's system profile from Tyler's Cascia
// Hall sample pack (as-built PDF + takeoff MTO xlsx). Written to dry-run
// the Phase 2/3 pipeline manually before we build the real upload flow.
//
// Run:
//   npx tsx --env-file=.env scripts/seed-cascia.ts
//   npx tsx --env-file=.env scripts/seed-cascia.ts --property "<name match>"
//   npx tsx --env-file=.env scripts/seed-cascia.ts --property-id <id>
//
// It will:
//   1. Pick the target property: --property-id if given, else the first
//      property whose name contains the --property substring (default
//      "Cascia"), else the first property on the first org.
//   2. Send the PDF to Claude Opus 4.7 with a prompt asking for structured
//      zone data (number, type, valve, GPM, area).
//   3. Use the XLSX-parsed parts list (hardcoded — already parsed) to
//      build the PropertyPart rows.
//   4. Wipe any existing PropertySystem named "Cascia Demo (as-built)" on
//      this property and recreate it from the extracted data. Safe to re-run.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../src/lib/db";

const PDF_PATH = path.join(
  process.cwd(),
  "sample_systems",
  "Cascia Hall Irrigation 4-14-2026.pdf",
);

// Exact data parsed from "MTO - Cascia Hall 4-14-2026.xlsx". Grouped by
// section; each row becomes a PropertyPart. Pipes/sleeves/fittings are
// "infrastructure" parts; backflow/controller/sensor/valves/heads are
// categorized for the Phase 4 catalog matcher.
const MTO_PARTS: Array<{
  category: string;
  brand: string | null;
  model: string;
  size: string | null;
  quantity: number;
  uom: "EA" | "LF";
  notes?: string;
}> = [
  // Mainline
  { category: "pipe", brand: null, model: "PVC Class 200 SDR 21", size: '2"', quantity: 738, uom: "LF", notes: "Mainline" },
  // Lateral
  { category: "pipe", brand: null, model: "PVC Class 200 SDR 21", size: '1.5"', quantity: 60, uom: "LF", notes: "Lateral" },
  { category: "pipe", brand: null, model: "PVC Class 200 SDR 21", size: '1"', quantity: 1387, uom: "LF", notes: "Lateral" },
  // POC / backflow (also recorded on the System's backflow fields)
  { category: "backflow", brand: "Wilkins", model: "975XL2", size: '1"', quantity: 1, uom: "EA", notes: "RPZ" },
  // Controller + wire
  { category: "controller", brand: "Rain Bird", model: "ESP-2WIRE", size: null, quantity: 1, uom: "EA" },
  { category: "decoder", brand: "Rain Bird", model: "FD-101TURF", size: null, quantity: 6, uom: "EA" },
  { category: "decoder", brand: "Rain Bird", model: "FD-202TURF", size: null, quantity: 2, uom: "EA" },
  { category: "sensor", brand: "Rain Bird", model: "WR2-RFC", size: null, quantity: 1, uom: "EA", notes: "Rain sensor" },
  { category: "wire", brand: null, model: "Two-wire cable", size: null, quantity: 738, uom: "LF" },
  { category: "fitting", brand: null, model: "Wire nuts", size: null, quantity: 20, uom: "EA" },
  // Valves
  { category: "valve", brand: "Rain Bird", model: "PGA Globe", size: '1"', quantity: 6, uom: "EA", notes: "Electric remote control valve" },
  { category: "valve", brand: "Rain Bird", model: "XCZ-075-PRF", size: '3/4"', quantity: 4, uom: "EA", notes: "Electric drip remote control valve" },
  // Spray heads
  { category: "head", brand: "Rain Bird", model: "1804 08", size: null, quantity: 3, uom: "EA", notes: "Spray head, 8' nozzle" },
  { category: "head", brand: "Rain Bird", model: "1804 12", size: null, quantity: 1, uom: "EA", notes: "Spray head, 12' nozzle" },
  { category: "head", brand: "Rain Bird", model: "1804 15", size: null, quantity: 2, uom: "EA", notes: "Spray head, 15' nozzle" },
  // Rotors
  { category: "rotor", brand: "Rain Bird", model: "5004-PC 1.5", size: null, quantity: 8, uom: "EA" },
  { category: "rotor", brand: "Rain Bird", model: "5004-PC 3.0", size: null, quantity: 14, uom: "EA" },
  { category: "rotor", brand: "Rain Bird", model: "5004-PC 6.0", size: null, quantity: 1, uom: "EA" },
  { category: "root_irrigation", brand: "Rain Bird", model: "RWS-B-C 1402", size: null, quantity: 6, uom: "EA", notes: "Deep root irrigation" },
  // Drip
  { category: "drip", brand: "Rain Bird", model: "MDCFCAP", size: null, quantity: 4, uom: "EA", notes: "Flush valve" },
  { category: "drip", brand: "Rain Bird", model: "ARV050", size: '1/2"', quantity: 4, uom: "EA", notes: "Air relief valve" },
  { category: "drip", brand: "Rain Bird", model: "XB-PC", size: null, quantity: 1, uom: "EA", notes: "Drip emitter" },
  { category: "drip", brand: "Rain Bird", model: "XFS-CV-06-18", size: null, quantity: 2019, uom: "LF", notes: "Dripline" },
  // Sleeves
  { category: "sleeve", brand: null, model: "PVC Schedule 40", size: '4"', quantity: 75, uom: "LF" },
  { category: "sleeve", brand: null, model: "PVC Schedule 40", size: '2"', quantity: 169, uom: "LF" },
  // Valve boxes
  { category: "valve_box", brand: null, model: "Valve box", size: '12"', quantity: 5, uom: "EA" },
  { category: "valve_box", brand: null, model: "Valve box", size: '10"', quantity: 5, uom: "EA" },
  // Fittings
  { category: "fitting", brand: null, model: "Swing pipe", size: null, quantity: 53, uom: "LF" },
  { category: "fitting", brand: null, model: "Swing elbow", size: null, quantity: 70, uom: "EA" },
];

type ExtractedZone = {
  zoneNumber: number;
  zoneName: string | null;
  zoneType: "spray" | "drip" | "bubbler" | "rotor" | "other";
  valveBrand: string | null;
  valveModel: string | null;
  valveSize: string | null;
  ballValvePresent: boolean | null;
  headCount: number | null;
  coverage: string | null;
  notes: string | null;
};

async function extractZonesFromPdf(): Promise<ExtractedZone[]> {
  const bytes = fs.readFileSync(PDF_PATH);
  const pdfB64 = bytes.toString("base64");
  const client = new Anthropic();

  const prompt = `This is an irrigation as-built drawing for Cascia Hall. Your task is to extract every zone shown in the plan's zone schedule (or valve schedule / legend / zone summary table, whatever the drawing calls it).

For each zone return:
- zoneNumber (integer starting from 1)
- zoneName (descriptive name if given, e.g. "Front lawn", else null)
- zoneType (one of: spray, drip, bubbler, rotor, other) — rotors use MP/I-series/5004-style heads; sprays use fixed spray heads/nozzles; drip is point-source or subsurface; bubbler is low-volume for trees; other is the catch-all
- valveBrand (e.g. "Rain Bird") or null
- valveModel (e.g. "PGA" or "XCZ-075-PRF") or null
- valveSize (e.g. "1\\"") or null
- ballValvePresent (true/false/null if not shown)
- headCount (integer total heads on the zone, or null if not shown)
- coverage (short text like "~2000 sq ft" or the area description, or null)
- notes (anything else useful — e.g. "tree bubblers only", "north side turf")

From the takeoff worksheet we already know the system has: 6× Rain Bird PGA 1" valves (turf) and 4× Rain Bird XCZ-075-PRF 3/4" drip valves, so expect ~10 zones total.

Return ONLY a JSON array of zone objects matching the shape above. No prose, no markdown fences.`;

  console.log("[seed-cascia] Sending PDF to Claude Opus…");
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfB64,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in Claude response");
  }
  const cleaned = textBlock.text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as ExtractedZone[];
  console.log(`[seed-cascia] Claude returned ${parsed.length} zones.`);
  return parsed;
}

const SYSTEM_NAME = "Cascia Demo (as-built)";

function parseArgs(): { propertyId?: string; propertyMatch: string } {
  const args = process.argv.slice(2);
  let propertyId: string | undefined;
  let propertyMatch = "Cascia";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--property-id" && args[i + 1]) {
      propertyId = args[++i];
    } else if (args[i] === "--property" && args[i + 1]) {
      propertyMatch = args[++i];
    }
  }
  return { propertyId, propertyMatch };
}

async function main() {
  const { propertyId, propertyMatch } = parseArgs();

  let property;
  if (propertyId) {
    property = await db.property.findUnique({
      where: { id: propertyId },
      include: { systems: { select: { id: true, name: true } } },
    });
    if (!property) throw new Error(`Property ${propertyId} not found.`);
  } else {
    property = await db.property.findFirst({
      where: { name: { contains: propertyMatch, mode: "insensitive" } },
      include: { systems: { select: { id: true, name: true } } },
    });
    if (!property) {
      console.log(
        `[seed-cascia] No property matches "${propertyMatch}". Falling back to the first property.`,
      );
      property = await db.property.findFirst({
        orderBy: { createdAt: "asc" },
        include: { systems: { select: { id: true, name: true } } },
      });
    }
    if (!property) throw new Error("No properties found at all.");
  }
  console.log(`[seed-cascia] Target property: ${property.name} (${property.id})`);

  const existing = property.systems.find((s) => s.name === SYSTEM_NAME);
  if (existing) {
    await db.propertySystem.delete({ where: { id: existing.id } });
    console.log(`[seed-cascia] Removed prior "${SYSTEM_NAME}" system (safe re-run).`);
  }

  // Fetch zones from the PDF.
  const zones = await extractZonesFromPdf();

  // Create the system + sub-rows in one transaction so partial failures don't
  // leave orphaned rows.
  const created = await db.propertySystem.create({
    data: {
      propertyId: property.id,
      orgId: property.orgId,
      name: SYSTEM_NAME,
      sortOrder: property.systems.length,
      onSiteContactName: null,
      backflowType: "RPZ",
      backflowSize: '1"',
      backflowStatus: "installed",
      backflowNotes: "Wilkins by Zurn Elkay 975XL2 1\".",
      notes: "Imported from Cascia Hall 4/14/2026 as-built + MTO. 738 LF of 2\" Class 200 PVC mainline, 1387 LF of 1\" lateral, 2019 LF of Rain Bird XFS-CV-06-18 dripline.",
      controllers: {
        create: [
          {
            name: "Main",
            brand: "Rain Bird",
            model: "ESP-2WIRE",
            stationCount: 10,
            location: null,
            wiringType: "two_wire",
            rainSensorPresent: true,
            notes: "Two-wire decoder system: 6× FD-101TURF + 2× FD-202TURF decoders, WR2-RFC rain sensor.",
          },
        ],
      },
      // The MTO doesn't call out the water source type (it's a POC-only line)
      // so we seed a stub that the user can edit. Marked permanent = true.
      waterSources: {
        create: [
          {
            sourceType: "city_meter",
            label: "POC",
            gpm: null,
            psi: null,
            permanent: true,
            notes: "Point of connection per as-built. GPM/PSI not shown on drawing — field-verify.",
          },
        ],
      },
      zones: {
        create: zones.map((z) => ({
          zoneNumber: z.zoneNumber,
          zoneName: z.zoneName,
          zoneType: z.zoneType,
          valveBrand: z.valveBrand,
          valveModel: z.valveModel,
          valveSize: z.valveSize,
          ballValvePresent: z.ballValvePresent,
          headCount: z.headCount,
          coverage: z.coverage,
          notes: z.notes,
        })),
      },
      parts: {
        create: MTO_PARTS.map((p) => ({
          category: p.category,
          brand: p.brand,
          model: p.model,
          size: p.size,
          quantity: p.quantity,
          notes: [p.notes, `${p.quantity} ${p.uom}`].filter(Boolean).join(" · "),
        })),
      },
    },
  });

  console.log(
    `[seed-cascia] Created system ${created.id} with ${zones.length} zones and ${MTO_PARTS.length} parts.`,
  );
  console.log("[seed-cascia] Done. Visit the property page in the app.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
