// Builds the default ConfigJson for a brand-new org by snapshotting the
// global reference data (orgId=null) currently in Neon. This is what gets
// dropped into the org's config sheet on initialize, so they start with the
// same taxonomy everyone else has and can edit from there.

import { db } from "./db";
import type {
  ConfigComponentRow,
  ConfigJson,
  ConfigQuickPickRow,
  ConfigReportSettingRow,
  ConfigSeverityLevelRow,
} from "./config-types";

export async function buildDefaultConfig(orgName: string): Promise<ConfigJson> {
  const [components, quickPicks, severityLevels] = await Promise.all([
    db.componentType.findMany({
      where: { orgId: null },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    }),
    db.quickPickFinding.findMany({
      where: { orgId: null },
      orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
    }),
    db.severityLevel.findMany({
      where: { orgId: null },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  // Build a (severity-enum → severity-name) map so quick-picks reference the
  // human name from the SeverityLevels tab rather than the raw enum value.
  const severityNameByEnum = new Map<string, string>();
  for (const s of severityLevels) severityNameByEnum.set(s.severity, s.name);

  const componentRows: ConfigComponentRow[] = components.map((c) => ({
    category: c.category,
    component: c.name,
    sizes: Array.isArray(c.subtypes)
      ? (c.subtypes as string[]).join(", ")
      : undefined,
    active: true,
  }));

  const quickPickRows: ConfigQuickPickRow[] = quickPicks.map((q) => ({
    section: q.section,
    category: q.componentCategory,
    component: q.componentSubtype ?? undefined,
    size: q.componentSize ?? undefined,
    issue: q.label,
    issueType: q.issueType,
    defaultSeverity:
      severityNameByEnum.get(q.defaultSeverity) ?? q.defaultSeverity,
    defaultSolution: q.defaultSolution,
    unit: q.defaultUom,
    active: true,
  }));

  const severityRows: ConfigSeverityLevelRow[] = severityLevels.map((s) => ({
    level: s.sortOrder,
    name: s.name,
    color: s.color,
    label: s.label ?? undefined,
    description: s.description ?? undefined,
  }));

  const reportSettings: ConfigReportSettingRow[] = [
    { setting: "company_name", value: orgName },
    { setting: "report_title", value: "Irrigation Audit Report" },
    {
      setting: "footer_text",
      value: `Confidential — Prepared by ${orgName}`,
    },
    { setting: "show_photos", value: "yes" },
    { setting: "show_scores", value: "yes" },
    { setting: "score_method", value: "percentage" },
  ];

  return {
    components: componentRows,
    quickPicks: quickPickRows,
    severityLevels: severityRows,
    reportSettings,
  };
}
