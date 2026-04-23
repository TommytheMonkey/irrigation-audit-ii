// Seeds a sample property + system + audits + findings + files on a
// freshly-created org so the first-time user has something to explore
// instead of an empty dashboard. Called once by /api/auth/verify when
// a new org is minted (isNewOrg branch). Idempotent: if the sample
// property already exists on this org, we bail.
//
// The sample is modeled on a real residential property (Tommy's own
// house at 2203 Freeman Street, Winston-Salem NC) and a real Hunter
// X-Core controller manual — the landscape plan PDF, Hunter manual,
// and four photos of the property live in /public/sample and are
// referenced here via same-origin paths so no external deps / Blob
// uploads are needed for the seed to run.
//
// Tagged in Property.metadata.isSample = true so we can identify
// sample rows later if we add a "Remove sample data" affordance.

import type { PrismaClient } from "@prisma/client";

// ─── Sample assets in /public/sample ─────────────────────────────────────

const ASSETS = {
  plan: {
    name: "Landscape Plan (2022-02-28).pdf",
    path: "/sample/landscape-plan.pdf",
    size: 754254,
    mimeType: "application/pdf",
  },
  manual: {
    name: "Hunter X-Core Owner's Manual.pdf",
    path: "/sample/hunter-x-core-manual.pdf",
    size: 2196161,
    mimeType: "application/pdf",
  },
  photos: {
    mailboxBed: "/sample/mailbox-bed.jpg",
    mailboxWide: "/sample/mailbox-wide.jpg",
    frontPorch: "/sample/front-porch.jpg",
    frontTreeBed: "/sample/front-tree-bed.jpg",
  },
} as const;

// ─── Zone definitions — derived from the 2203 Freeman Street plan ────────

type ZoneSeed = {
  zoneNumber: number;
  zoneName: string;
  zoneType: "spray" | "drip" | "bubbler" | "rotor" | "other";
  valveBrand?: string;
  valveModel?: string;
  valveSize?: string;
  headCount?: number;
  coverage?: string;
};

const ZONES: ZoneSeed[] = [
  // Front
  { zoneNumber: 1, zoneName: "Mailbox bed", zoneType: "drip", valveBrand: "Hunter", valveModel: "PGV-100", valveSize: "1 in", coverage: "Mailbox perennial bed (~60 sf mulch ring)" },
  { zoneNumber: 2, zoneName: "Front tree ring", zoneType: "drip", valveBrand: "Hunter", valveModel: "PGV-100", valveSize: "1 in", coverage: "Front yard specimen tree ring" },
  { zoneNumber: 3, zoneName: "Front foundation shrubs", zoneType: "spray", valveBrand: "Hunter", valveModel: "PGV-100", valveSize: "1 in", headCount: 8, coverage: "Hydrangeas, Dwarf Burford Holly along front porch" },
  { zoneNumber: 4, zoneName: "Front lawn — east", zoneType: "rotor", valveBrand: "Hunter", valveModel: "PGV-100", valveSize: "1 in", headCount: 4, coverage: "Front lawn east of driveway" },
  { zoneNumber: 5, zoneName: "Front lawn — west", zoneType: "rotor", valveBrand: "Hunter", valveModel: "PGV-100", valveSize: "1 in", headCount: 4, coverage: "Front lawn west of driveway" },
  // Side
  { zoneNumber: 6, zoneName: "Arborvitae hedge (west side)", zoneType: "drip", valveBrand: "Hunter", valveModel: "PGV-100", valveSize: "1 in", coverage: "16 Emerald Green Arborvitae along west property line" },
  // Back
  { zoneNumber: 7, zoneName: "Rear patio perimeter beds", zoneType: "drip", valveBrand: "Hunter", valveModel: "PGV-100", valveSize: "1 in", coverage: "Pin Oak + patio perennial surround" },
  { zoneNumber: 8, zoneName: "Biofiltration swale grasses", zoneType: "drip", valveBrand: "Hunter", valveModel: "PGV-100", valveSize: "1 in", coverage: "Gulf Coast Pink Muhly + Little Bluestem swale" },
  { zoneNumber: 9, zoneName: "Back lawn", zoneType: "rotor", valveBrand: "Hunter", valveModel: "PGV-100", valveSize: "1 in", headCount: 6, coverage: "Back lawn between swale and rear fence" },
  { zoneNumber: 10, zoneName: "Rear tree line (bubblers)", zoneType: "bubbler", valveBrand: "Hunter", valveModel: "PGV-100", valveSize: "1 in", headCount: 3, coverage: "Zelkova + Cherokee Princess Dogwood at rear fence" },
  { zoneNumber: 11, zoneName: "Japanese Pieris / Holly hedge", zoneType: "drip", valveBrand: "Hunter", valveModel: "PGV-100", valveSize: "1 in", coverage: "Japanese Pieris + Helleri Japanese Holly along house side" },
  { zoneNumber: 12, zoneName: "Metal planter / raised garden", zoneType: "drip", valveBrand: "Hunter", valveModel: "PGV-100", valveSize: "1 in", coverage: "Corrugated metal garden planter at rear gravel pad" },
];

// ─── Parts (catalog of what's installed) ─────────────────────────────────

type PartSeed = {
  category: string;
  brand: string;
  model: string;
  size?: string;
  quantity: number;
  notes?: string;
};

const PARTS: PartSeed[] = [
  { category: "Controller", brand: "Hunter", model: "X-Core", quantity: 1, notes: "Garage wall mount, 120V outlet" },
  { category: "Valve", brand: "Hunter", model: "PGV-100", size: "1 in", quantity: 12, notes: "Manifold in front of house and one behind" },
  { category: "Spray head", brand: "Hunter", model: "Pro-Spray PRS40", size: '4"', quantity: 14, notes: "Foundation beds (zones 3, 11)" },
  { category: "Rotor", brand: "Hunter", model: "PGP Ultra", size: '4"', quantity: 14, notes: "Lawn zones (4, 5, 9)" },
  { category: "Bubbler", brand: "Hunter", model: "PCB-25", quantity: 3, notes: "Tree zone 10" },
  { category: "Drip tubing", brand: "Netafim", model: "Techline CV 0.9gph", size: "1/2 in", quantity: 1, notes: "~450 ft across zones 1, 2, 6, 7, 8, 11, 12 — measured in sf" },
  { category: "Backflow", brand: "Febco", model: "765 PVB", size: "1 in", quantity: 1, notes: "Front of house, below hose bib" },
  { category: "Rain sensor", brand: "Hunter", model: "Mini-Clik", quantity: 1, notes: "Mounted to gutter above garage" },
];

// ─── Completed-audit findings ────────────────────────────────────────────
// 8 findings across multiple zones. Two with real-world map pins —
// one placed via the satellite modal (pinSource=map), one via GPS.

type FindingSeed = {
  zoneNumber: number | null; // null = system-level
  issueType: "maladjusted" | "missing" | "damaged_broken" | "incorrect_placement" | "leak" | "clog" | "electrical_issue";
  componentCategory: string;
  componentSubtype?: string;
  componentSize?: string;
  severity: "low" | "medium" | "high";
  solutionAction: "adjust" | "replace" | "repair" | "relocate" | "troubleshoot" | "other";
  costModel?: "time_only" | "time_materials";
  quantity: number;
  unitOfMeasure: "ea" | "sf" | "none";
  description?: string;
  notes?: string;
  photoUrls?: string[];
  // Real-world pin — both must be set or both null
  pinLat?: number;
  pinLng?: number;
  pinSource?: "map" | "gps";
};

// Rough coords near 2203 Freeman St, Winston-Salem NC 27127
const PROPERTY_LAT = 36.062;
const PROPERTY_LNG = -80.255;

const COMPLETED_FINDINGS: FindingSeed[] = [
  {
    zoneNumber: 1,
    issueType: "damaged_broken",
    componentCategory: "Spray head",
    componentSubtype: "Pro-Spray",
    componentSize: '4"',
    severity: "medium",
    solutionAction: "replace",
    quantity: 1,
    unitOfMeasure: "ea",
    description: "Cracked riser on mailbox bed spray head — leaking at the base during each cycle.",
    notes: "Replace riser, reset nozzle.",
    photoUrls: [ASSETS.photos.mailboxBed],
  },
  {
    zoneNumber: 2,
    issueType: "clog",
    componentCategory: "Drip emitter",
    componentSubtype: "Techline CV",
    severity: "low",
    solutionAction: "replace",
    quantity: 2,
    unitOfMeasure: "ea",
    description: "Two emitters on the front tree ring bed running dry — clogged, likely from iron in city water.",
    notes: "Swap emitters, flush line.",
    photoUrls: [ASSETS.photos.frontTreeBed],
  },
  {
    zoneNumber: 3,
    issueType: "damaged_broken",
    componentCategory: "Spray head",
    componentSubtype: "Pro-Spray",
    componentSize: '4"',
    severity: "high",
    solutionAction: "replace",
    quantity: 1,
    unitOfMeasure: "ea",
    description: "Broken head on foundation bed next to porch column — snapped off at the riser, geysering.",
    notes: "Needs immediate replacement. Shutoff valve cycled for now.",
    photoUrls: [ASSETS.photos.frontPorch],
    pinLat: PROPERTY_LAT + 0.00004,
    pinLng: PROPERTY_LNG - 0.00003,
    pinSource: "map",
  },
  {
    zoneNumber: 4,
    issueType: "maladjusted",
    componentCategory: "Rotor",
    componentSubtype: "PGP Ultra",
    componentSize: '4"',
    severity: "low",
    solutionAction: "adjust",
    quantity: 2,
    unitOfMeasure: "ea",
    description: "Two rotors on front lawn east spraying the driveway — arc off by roughly 30°.",
    notes: "Reset arc stops.",
  },
  {
    zoneNumber: 6,
    issueType: "leak",
    componentCategory: "Drip tubing",
    componentSubtype: "Techline CV",
    componentSize: "1/2 in",
    severity: "medium",
    solutionAction: "repair",
    quantity: 4,
    unitOfMeasure: "sf",
    description: "Split in drip tubing along the arborvitae hedge about halfway down — saturated mulch and a visible plume when the zone runs.",
    notes: "Cut out the split section and splice with a compression coupling.",
    pinLat: PROPERTY_LAT - 0.00006,
    pinLng: PROPERTY_LNG - 0.00009,
    pinSource: "gps",
  },
  {
    zoneNumber: 9,
    issueType: "missing",
    componentCategory: "Rotor",
    componentSubtype: "PGP Ultra",
    severity: "medium",
    solutionAction: "replace",
    quantity: 1,
    unitOfMeasure: "ea",
    description: "Back lawn northeast corner is missing a head — dry circle ~4' across.",
    notes: "Install new PGP with matching nozzle.",
  },
  {
    zoneNumber: 11,
    issueType: "damaged_broken",
    componentCategory: "Drip emitter",
    componentSubtype: "Techline CV",
    severity: "low",
    solutionAction: "replace",
    quantity: 3,
    unitOfMeasure: "ea",
    description: "Three crushed emitters on the Pieris hedge where the landscaper's edger has been run too close.",
  },
  {
    // System-level finding (zoneNumber null).
    zoneNumber: null,
    issueType: "electrical_issue",
    componentCategory: "Rain sensor",
    componentSubtype: "Mini-Clik",
    severity: "medium",
    solutionAction: "troubleshoot",
    quantity: 1,
    unitOfMeasure: "ea",
    description: "Rain sensor override not engaging after last week's storm — controller ran a full cycle with the cup still full.",
    notes: "Check sensor wiring at the controller terminal and replace the sensor if the switch doesn't close under weight.",
  },
];

// ─── In-progress audit findings — partial walkthrough ────────────────────

const IN_PROGRESS_FINDINGS: FindingSeed[] = [
  {
    zoneNumber: 1,
    issueType: "maladjusted",
    componentCategory: "Spray head",
    componentSubtype: "Pro-Spray",
    severity: "low",
    solutionAction: "adjust",
    quantity: 1,
    unitOfMeasure: "ea",
    description: "Mailbox bed head arc is turned too far right, watering the sidewalk.",
    photoUrls: [ASSETS.photos.mailboxWide],
  },
  {
    zoneNumber: 2,
    issueType: "clog",
    componentCategory: "Drip emitter",
    severity: "low",
    solutionAction: "replace",
    quantity: 1,
    unitOfMeasure: "ea",
    description: "Single emitter clogged at base of tree.",
  },
  {
    zoneNumber: 3,
    issueType: "incorrect_placement",
    componentCategory: "Spray head",
    severity: "medium",
    solutionAction: "relocate",
    quantity: 1,
    unitOfMeasure: "ea",
    description: "Head on foundation bed is spraying directly onto the house siding.",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Seed entry point
// ─────────────────────────────────────────────────────────────────────────

export async function seedSampleProject(
  db: PrismaClient,
  orgId: string,
  userId: string,
): Promise<void> {
  // Idempotency — if the sample property is already present, bail.
  const existing = await db.property.findFirst({
    where: {
      orgId,
      metadata: { path: ["isSample"], equals: true },
    },
    select: { id: true },
  });
  if (existing) return;

  const now = new Date();
  const threeWeeksAgo = new Date(now.getTime() - 21 * 24 * 3600 * 1000);
  const threeWeeksAgoEnd = new Date(threeWeeksAgo.getTime() + 3 * 3600 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 3600 * 1000);

  // 1. Property
  const property = await db.property.create({
    data: {
      orgId,
      name: "2203 Freeman Street (sample)",
      address: "2203 Freeman Street",
      city: "Winston-Salem",
      state: "NC",
      zip: "27127",
      latitude: PROPERTY_LAT,
      longitude: PROPERTY_LNG,
      geocodedAt: now,
      propertyManagerName: "Tommy Lather",
      propertyManagerEmail: "tommy@example.com",
      propertyManagerPhone: "(555) 123-4567",
      setupStatus: "CONFIGURED",
      metadata: { isSample: true },
    },
  });

  // 2. PropertySystem
  const system = await db.propertySystem.create({
    data: {
      orgId,
      propertyId: property.id,
      name: "Main system",
      onSiteContactName: "Tommy Lather",
      onSiteContactEmail: "tommy@example.com",
      onSiteContactPhone: "(555) 123-4567",
      onSiteContactRole: "Homeowner",
      backflowType: "PVB",
      backflowSize: "1 in",
      backflowStatus: "passed",
      backflowLastTestedAt: new Date(now.getTime() - 180 * 24 * 3600 * 1000),
      backflowNotes: "Febco 765 PVB, tested Oct 2025.",
      notes: "Residential build, 12-station Hunter X-Core in garage. Drip on beds, spray/rotor on lawn, bubblers on rear trees.",
    },
  });

  // 3. Controller
  await db.propertyController.create({
    data: {
      systemId: system.id,
      name: "Garage controller",
      brand: "Hunter",
      model: "X-Core",
      stationCount: 12,
      location: "Garage — east wall, 120V outlet",
      wiringType: "conventional",
      rainSensorPresent: true,
      notes: "X-Core with rain-sensor bypass switch. See attached owner's manual.",
    },
  });

  // 4. Water source
  await db.propertyWaterSource.create({
    data: {
      systemId: system.id,
      sourceType: "city_meter",
      label: "City water — front-yard meter",
      gpm: 12.0,
      psi: 65.0,
      permanent: true,
      notes: "Meter located in front yard near sidewalk, curb box.",
    },
  });

  // 5. Zones (property-level)
  await db.propertyZone.createMany({
    data: ZONES.map((z) => ({
      systemId: system.id,
      zoneNumber: z.zoneNumber,
      zoneName: z.zoneName,
      zoneType: z.zoneType,
      valveBrand: z.valveBrand,
      valveModel: z.valveModel,
      valveSize: z.valveSize,
      headCount: z.headCount,
      coverage: z.coverage,
    })),
  });

  // 6. Parts
  await db.propertyPart.createMany({
    data: PARTS.map((p) => ({
      systemId: system.id,
      category: p.category,
      brand: p.brand,
      model: p.model,
      size: p.size,
      quantity: p.quantity,
      notes: p.notes,
    })),
  });

  // 7. Property-level files (plan PDF) + system-level files (manual PDF)
  await db.propertyFile.create({
    data: {
      propertyId: property.id,
      uploadedById: userId,
      fileName: ASSETS.plan.name,
      mimeType: ASSETS.plan.mimeType,
      fileSize: ASSETS.plan.size,
      category: "DRAWINGS",
      blobUrl: ASSETS.plan.path,
      blobPathname: ASSETS.plan.path,
    },
  });
  await db.systemFile.create({
    data: {
      systemId: system.id,
      uploadedById: userId,
      filename: ASSETS.manual.name,
      mimeType: ASSETS.manual.mimeType,
      sizeBytes: ASSETS.manual.size,
      blobUrl: ASSETS.manual.path,
      blobPathname: ASSETS.manual.path,
      tags: ["manual", "controller"],
    },
  });

  // 8. Completed audit — 3 weeks ago, fully walked, Google-sheet exported.
  const completedAudit = await db.audit.create({
    data: {
      orgId,
      propertyId: property.id,
      auditorUserId: userId,
      status: "completed",
      startedAt: threeWeeksAgo,
      completedAt: threeWeeksAgoEnd,
      notes: "Sample audit — 8 findings across 7 zones plus a system-level rain-sensor issue.",
    },
  });
  const completedAuditSystem = await db.auditSystem.create({
    data: {
      auditId: completedAudit.id,
      systemNumber: "1",
      systemName: "Main system",
      controllerBrand: "Hunter",
      controllerModel: "X-Core",
      controllerLocation: "Garage — east wall",
      wiringType: "conventional",
      waterSourceType: "city_meter",
      meterLocation: "Front yard, near sidewalk",
      meterReading: "083421 gal",
      backflowStatus: "passed",
      rainSensorPresent: true,
      controllerStatus: "operational",
      powerToUnit: true,
      notes: "Full 12-zone walkthrough. Rain sensor suspect — flagged as system finding.",
    },
  });

  // Audit zones for the completed audit — all 12, all marked complete.
  await db.auditZone.createMany({
    data: ZONES.map((z) => ({
      auditId: completedAudit.id,
      systemId: completedAuditSystem.id,
      zoneNumber: z.zoneNumber,
      zoneName: z.zoneName,
      zoneType: z.zoneType,
      completedAt: threeWeeksAgoEnd,
    })),
  });

  // Grab the zone IDs keyed by zoneNumber so findings can reference them.
  const completedZoneRows = await db.auditZone.findMany({
    where: { auditId: completedAudit.id },
    select: { id: true, zoneNumber: true },
  });
  const completedZonesByNumber = new Map(
    completedZoneRows.map((z) => [z.zoneNumber, z.id]),
  );

  // Findings — mix of zone-level and one system-level.
  await db.auditFinding.createMany({
    data: COMPLETED_FINDINGS.map((f) => ({
      auditId: completedAudit.id,
      systemId: completedAuditSystem.id,
      zoneId: f.zoneNumber === null
        ? null
        : completedZonesByNumber.get(f.zoneNumber) ?? null,
      issueType: f.issueType,
      componentCategory: f.componentCategory,
      componentSubtype: f.componentSubtype,
      componentSize: f.componentSize,
      severity: f.severity,
      solutionAction: f.solutionAction,
      costModel: f.costModel ?? "time_materials",
      quantity: f.quantity,
      unitOfMeasure: f.unitOfMeasure,
      description: f.description,
      notes: f.notes,
      photoUrls: f.photoUrls ?? [],
      pinLat: f.pinLat ?? null,
      pinLng: f.pinLng ?? null,
      pinSource: f.pinSource ?? null,
      pinPlacedAt: f.pinLat != null ? threeWeeksAgo : null,
    })),
  });

  // 9. In-progress audit — 2 days ago, first 3 zones audited.
  const inProgressAudit = await db.audit.create({
    data: {
      orgId,
      propertyId: property.id,
      auditorUserId: userId,
      status: "in_progress",
      startedAt: twoDaysAgo,
      completedAt: null,
      notes: "Sample in-progress audit — first three zones walked, nine to go.",
    },
  });
  const inProgressAuditSystem = await db.auditSystem.create({
    data: {
      auditId: inProgressAudit.id,
      systemNumber: "1",
      systemName: "Main system",
      controllerBrand: "Hunter",
      controllerModel: "X-Core",
      controllerLocation: "Garage — east wall",
      wiringType: "conventional",
      waterSourceType: "city_meter",
      meterLocation: "Front yard, near sidewalk",
      backflowStatus: "passed",
      rainSensorPresent: true,
      powerToUnit: true,
    },
  });

  // All 12 zones exist on the in-progress audit; first three are marked
  // complete to match the findings distribution below.
  await db.auditZone.createMany({
    data: ZONES.map((z) => ({
      auditId: inProgressAudit.id,
      systemId: inProgressAuditSystem.id,
      zoneNumber: z.zoneNumber,
      zoneName: z.zoneName,
      zoneType: z.zoneType,
      completedAt: z.zoneNumber <= 3 ? twoDaysAgo : null,
    })),
  });
  const inProgressZoneRows = await db.auditZone.findMany({
    where: { auditId: inProgressAudit.id },
    select: { id: true, zoneNumber: true },
  });
  const inProgressZonesByNumber = new Map(
    inProgressZoneRows.map((z) => [z.zoneNumber, z.id]),
  );

  await db.auditFinding.createMany({
    data: IN_PROGRESS_FINDINGS.map((f) => ({
      auditId: inProgressAudit.id,
      systemId: inProgressAuditSystem.id,
      zoneId: f.zoneNumber === null
        ? null
        : inProgressZonesByNumber.get(f.zoneNumber) ?? null,
      issueType: f.issueType,
      componentCategory: f.componentCategory,
      componentSubtype: f.componentSubtype,
      componentSize: f.componentSize,
      severity: f.severity,
      solutionAction: f.solutionAction,
      costModel: f.costModel ?? "time_materials",
      quantity: f.quantity,
      unitOfMeasure: f.unitOfMeasure,
      description: f.description,
      notes: f.notes,
      photoUrls: f.photoUrls ?? [],
    })),
  });
}
