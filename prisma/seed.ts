// Idempotent seed of GLOBAL reference data (org_id = null) so every new org
// inherits the canonical irrigation taxonomy from REFERENCE_NOTES.md.
//
// Run with:  npx tsx --env-file=.env prisma/seed.ts
//
// All upserts use the @@unique constraints, so re-running is safe.

import { db } from "../src/lib/db";
import {
  IssueType,
  SolutionAction,
  CostModel,
  UnitOfMeasure,
  Severity,
} from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Component types — REFERENCE_NOTES.md §4
// Category buckets are intentionally coarse (the auditor taps a category, then
// a subtype). Subtypes live in the JSON `subtypes` column.
// ─────────────────────────────────────────────────────────────────────────────

const componentTypes: Array<{
  category: string;
  name: string;
  subtypes?: string[];
  sortOrder: number;
}> = [
  // Heads / emitters
  { category: "Heads / emitters", name: "Spray head", subtypes: ['4"', '6"', '12"'], sortOrder: 10 },
  { category: "Heads / emitters", name: "Rotor head", subtypes: ["RB 5004", "Standard", "Premium"], sortOrder: 20 },
  { category: "Heads / emitters", name: "Bubbler head", sortOrder: 30 },
  { category: "Heads / emitters", name: "Nozzle", subtypes: ["Standard", "MP (multi-pattern)"], sortOrder: 40 },
  { category: "Heads / emitters", name: "Emitter (drip)", sortOrder: 50 },
  // Piping
  { category: "Piping", name: "Main piping", sortOrder: 10 },
  { category: "Piping", name: "Lateral piping", sortOrder: 20 },
  { category: "Piping", name: "Drip tubing", sortOrder: 30 },
  // Valves & boxes
  { category: "Valves & boxes", name: "Valve", subtypes: ["Standard", "Premium"], sortOrder: 10 },
  { category: "Valves & boxes", name: "Valve box", subtypes: ["Small", "Medium", "Large"], sortOrder: 20 },
  { category: "Valves & boxes", name: "Solenoid", sortOrder: 30 },
  // Control & power
  { category: "Control & power", name: "Controller", subtypes: ["Rainbird", "Rainbird ESPME", "Hunter", "Toro", "Weathermatic"], sortOrder: 10 },
  { category: "Control & power", name: "Field wire", sortOrder: 20 },
  { category: "Control & power", name: "Electrical wiring", sortOrder: 30 },
  { category: "Control & power", name: "Remote wired control", sortOrder: 40 },
  // Water source
  { category: "Water source", name: "Meter", sortOrder: 10 },
  { category: "Water source", name: "Backflow device", sortOrder: 20 },
  { category: "Water source", name: "Rain / freeze sensor", sortOrder: 30 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Quick-pick findings — REFERENCE_NOTES.md §7 (Austin Oaks paper checklist)
// Each row is a one-tap shortcut: pre-filled (issue, component, default
// solution, default UOM, default severity).
// ─────────────────────────────────────────────────────────────────────────────

const quickPicks: Array<{
  section: string;
  label: string;
  issueType: IssueType;
  componentCategory: string;
  componentSubtype?: string;
  componentSize?: string;
  defaultSolution: SolutionAction;
  defaultCostModel?: CostModel;
  defaultUom?: UnitOfMeasure;
  defaultSeverity?: Severity;
  sortOrder: number;
}> = [
  // ── Turf / shrub heads
  { section: "Turf / shrub heads", label: 'Missing head 4"', issueType: "missing", componentCategory: "Heads / emitters", componentSubtype: "Spray head", componentSize: '4"', defaultSolution: "replace", defaultSeverity: "high", sortOrder: 10 },
  { section: "Turf / shrub heads", label: 'Missing head 6"', issueType: "missing", componentCategory: "Heads / emitters", componentSubtype: "Spray head", componentSize: '6"', defaultSolution: "replace", defaultSeverity: "high", sortOrder: 20 },
  { section: "Turf / shrub heads", label: 'Missing head 12"', issueType: "missing", componentCategory: "Heads / emitters", componentSubtype: "Spray head", componentSize: '12"', defaultSolution: "replace", defaultSeverity: "high", sortOrder: 30 },
  { section: "Turf / shrub heads", label: 'Broken head 4"', issueType: "damaged_broken", componentCategory: "Heads / emitters", componentSubtype: "Spray head", componentSize: '4"', defaultSolution: "replace", defaultSeverity: "high", sortOrder: 40 },
  { section: "Turf / shrub heads", label: 'Broken head 6"', issueType: "damaged_broken", componentCategory: "Heads / emitters", componentSubtype: "Spray head", componentSize: '6"', defaultSolution: "replace", defaultSeverity: "high", sortOrder: 50 },
  { section: "Turf / shrub heads", label: 'Broken head 12"', issueType: "damaged_broken", componentCategory: "Heads / emitters", componentSubtype: "Spray head", componentSize: '12"', defaultSolution: "replace", defaultSeverity: "high", sortOrder: 60 },
  { section: "Turf / shrub heads", label: 'Leaking seal @ head 4"', issueType: "leak", componentCategory: "Heads / emitters", componentSubtype: "Spray head", componentSize: '4"', defaultSolution: "repair", defaultSeverity: "high", sortOrder: 70 },
  { section: "Turf / shrub heads", label: 'Leaking seal @ head 6"', issueType: "leak", componentCategory: "Heads / emitters", componentSubtype: "Spray head", componentSize: '6"', defaultSolution: "repair", defaultSeverity: "high", sortOrder: 80 },
  { section: "Turf / shrub heads", label: 'Leaking seal @ head 12"', issueType: "leak", componentCategory: "Heads / emitters", componentSubtype: "Spray head", componentSize: '12"', defaultSolution: "repair", defaultSeverity: "high", sortOrder: 90 },
  { section: "Turf / shrub heads", label: "Head blocked by plants", issueType: "incorrect_placement", componentCategory: "Heads / emitters", componentSubtype: "Spray head", defaultSolution: "relocate", defaultCostModel: "time_only", defaultSeverity: "medium", sortOrder: 100 },
  { section: "Turf / shrub heads", label: "Sunken head", issueType: "maladjusted", componentCategory: "Heads / emitters", componentSubtype: "Spray head", defaultSolution: "adjust", defaultCostModel: "time_only", defaultSeverity: "medium", sortOrder: 110 },
  { section: "Turf / shrub heads", label: "Tilted head", issueType: "maladjusted", componentCategory: "Heads / emitters", componentSubtype: "Spray head", defaultSolution: "adjust", defaultCostModel: "time_only", defaultSeverity: "medium", sortOrder: 120 },
  { section: "Turf / shrub heads", label: "Incorrect nozzle MP", issueType: "maladjusted", componentCategory: "Heads / emitters", componentSubtype: "Nozzle", componentSize: "MP", defaultSolution: "replace", defaultSeverity: "medium", sortOrder: 130 },
  { section: "Turf / shrub heads", label: "Clogged nozzle MP", issueType: "clog", componentCategory: "Heads / emitters", componentSubtype: "Nozzle", componentSize: "MP", defaultSolution: "replace", defaultSeverity: "high", sortOrder: 140 },
  { section: "Turf / shrub heads", label: "Broken nozzle MP", issueType: "damaged_broken", componentCategory: "Heads / emitters", componentSubtype: "Nozzle", componentSize: "MP", defaultSolution: "replace", defaultSeverity: "high", sortOrder: 150 },
  { section: "Turf / shrub heads", label: "Broken nozzle / emitter", issueType: "damaged_broken", componentCategory: "Heads / emitters", componentSubtype: "Nozzle", defaultSolution: "replace", defaultSeverity: "high", sortOrder: 160 },

  // ── Drip / misc
  { section: "Drip / misc", label: "Cut drip", issueType: "damaged_broken", componentCategory: "Piping", componentSubtype: "Drip tubing", defaultSolution: "repair", defaultUom: "sf", defaultSeverity: "high", sortOrder: 10 },
  { section: "Drip / misc", label: "Clogged nozzle / emitter", issueType: "clog", componentCategory: "Heads / emitters", componentSubtype: "Emitter (drip)", defaultSolution: "replace", defaultSeverity: "high", sortOrder: 20 },

  // ── Valve / valve box
  { section: "Valve / valve box", label: "Valve box lid missing", issueType: "missing", componentCategory: "Valves & boxes", componentSubtype: "Valve box", defaultSolution: "replace", defaultSeverity: "medium", sortOrder: 10 },
  { section: "Valve / valve box", label: "Valve box crushed", issueType: "damaged_broken", componentCategory: "Valves & boxes", componentSubtype: "Valve box", defaultSolution: "replace", defaultSeverity: "medium", sortOrder: 20 },

  // ── Mainline / lateral / electrical (system-level — no zone required)
  { section: "Mainline / lateral / electrical", label: "Major mainline break", issueType: "damaged_broken", componentCategory: "Piping", componentSubtype: "Main piping", defaultSolution: "repair", defaultSeverity: "high", sortOrder: 10 },
  { section: "Mainline / lateral / electrical", label: "Mainline break", issueType: "damaged_broken", componentCategory: "Piping", componentSubtype: "Main piping", defaultSolution: "repair", defaultSeverity: "high", sortOrder: 20 },
  { section: "Mainline / lateral / electrical", label: "Lateral line break", issueType: "damaged_broken", componentCategory: "Piping", componentSubtype: "Lateral piping", defaultSolution: "repair", defaultSeverity: "high", sortOrder: 30 },
  { section: "Mainline / lateral / electrical", label: "Major lateral break", issueType: "damaged_broken", componentCategory: "Piping", componentSubtype: "Lateral piping", defaultSolution: "repair", defaultSeverity: "high", sortOrder: 40 },
  { section: "Mainline / lateral / electrical", label: "Leaking / stuck valve", issueType: "leak", componentCategory: "Valves & boxes", componentSubtype: "Valve", defaultSolution: "repair", defaultSeverity: "high", sortOrder: 50 },
  { section: "Mainline / lateral / electrical", label: "Valve not activating", issueType: "electrical_issue", componentCategory: "Valves & boxes", componentSubtype: "Valve", defaultSolution: "troubleshoot", defaultCostModel: "time_only", defaultSeverity: "high", sortOrder: 60 },
  { section: "Mainline / lateral / electrical", label: "Solenoid (short)", issueType: "electrical_issue", componentCategory: "Valves & boxes", componentSubtype: "Solenoid", defaultSolution: "replace", defaultSeverity: "high", sortOrder: 70 },
  { section: "Mainline / lateral / electrical", label: "Cut field wire", issueType: "electrical_issue", componentCategory: "Control & power", componentSubtype: "Field wire", defaultSolution: "repair", defaultUom: "sf", defaultSeverity: "high", sortOrder: 80 },

  // ── Additions (new install — track with "other" issue)
  { section: "Additions", label: 'Add 4" head', issueType: "incorrect_placement", componentCategory: "Heads / emitters", componentSubtype: "Spray head", componentSize: '4"', defaultSolution: "other", defaultSeverity: "low", sortOrder: 10 },
  { section: "Additions", label: 'Add 6" head', issueType: "incorrect_placement", componentCategory: "Heads / emitters", componentSubtype: "Spray head", componentSize: '6"', defaultSolution: "other", defaultSeverity: "low", sortOrder: 20 },
  { section: "Additions", label: 'Add 12" head', issueType: "incorrect_placement", componentCategory: "Heads / emitters", componentSubtype: "Spray head", componentSize: '12"', defaultSolution: "other", defaultSeverity: "low", sortOrder: 30 },
];

async function main() {
  console.log("Seeding component_types…");
  // Prisma can't upsert on a compound unique that includes a nullable column,
  // so wipe-and-reseed the global rows. (org-scoped overrides are untouched.)
  await db.componentType.deleteMany({ where: { orgId: null } });
  for (const c of componentTypes) {
    await db.componentType.create({
      data: {
        orgId: null,
        category: c.category,
        name: c.name,
        subtypes: c.subtypes ?? undefined,
        sortOrder: c.sortOrder,
      },
    });
  }
  console.log(`  ✓ ${componentTypes.length} component types`);

  console.log("Seeding quick_pick_findings…");
  // No natural unique key on QuickPickFinding (multiple labels could share
  // section). Wipe-and-reseed the global rows to keep this idempotent.
  await db.quickPickFinding.deleteMany({ where: { orgId: null } });
  for (const q of quickPicks) {
    await db.quickPickFinding.create({
      data: {
        orgId: null,
        section: q.section,
        label: q.label,
        issueType: q.issueType,
        componentCategory: q.componentCategory,
        componentSubtype: q.componentSubtype,
        componentSize: q.componentSize,
        defaultSolution: q.defaultSolution,
        defaultCostModel: q.defaultCostModel ?? "time_materials",
        defaultUom: q.defaultUom ?? "ea",
        defaultSeverity: q.defaultSeverity ?? "medium",
        sortOrder: q.sortOrder,
      },
    });
  }
  console.log(`  ✓ ${quickPicks.length} quick-pick findings`);

  console.log("Seeding severity_levels…");
  // Three global severity levels mapped to the underlying enum buckets.
  // Orgs can override the name/color/label/description per-bucket via the
  // config sheet, but the bucket count is locked to three.
  await db.severityLevel.deleteMany({ where: { orgId: null } });
  const severityLevels = [
    {
      severity: "low" as const,
      name: "Minor",
      color: "#22c55e",
      sortOrder: 1,
      label: "🟢 Minor",
      description: "Cosmetic issue, low priority",
    },
    {
      severity: "medium" as const,
      name: "Moderate",
      color: "#eab308",
      sortOrder: 2,
      label: "🟡 Moderate",
      description: "Functional issue, should fix",
    },
    {
      severity: "high" as const,
      name: "Critical",
      color: "#ef4444",
      sortOrder: 3,
      label: "🔴 Critical",
      description: "System failure, fix immediately",
    },
  ];
  for (const s of severityLevels) {
    await db.severityLevel.create({ data: { orgId: null, ...s } });
  }
  console.log(`  ✓ ${severityLevels.length} severity levels`);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
