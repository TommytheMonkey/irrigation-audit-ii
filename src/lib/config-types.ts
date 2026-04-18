// JSON shape of an org's config sheet. Mirrors the four tabs from the spec
// (Components, Quick Picks, Severity Levels, Report Settings). When real
// Google Sheets lands, the Sheet→JSON parser produces this same shape.

export type ConfigComponentRow = {
  category: string;
  component: string;
  sizes?: string; // comma-separated, e.g. '4 in, 6 in, 12 in'
  systemLevel?: boolean;
  active?: boolean;
  notes?: string;
};

export type ConfigQuickPickRow = {
  section: string; // groups in the auditor UI ("Turf / shrub heads", etc.)
  category: string; // must match a ConfigComponentRow.category
  component?: string;
  size?: string;
  issue: string; // shown on the button
  issueType: string; // must match an IssueType enum value
  defaultSeverity: string; // must match a SeverityLevel.name
  defaultSolution: string; // must match a SolutionAction enum value
  unit?: string; // must match a UnitOfMeasure enum value
  active?: boolean;
};

export type ConfigSeverityLevelRow = {
  level: number; // 1, 2, 3 — sort order, also maps to low/medium/high
  name: string;
  color: string; // hex
  label?: string;
  description?: string;
};

export type ConfigReportSettingRow = {
  setting: string;
  value: string;
};

export type ConfigJson = {
  components: ConfigComponentRow[];
  quickPicks: ConfigQuickPickRow[];
  severityLevels: ConfigSeverityLevelRow[];
  reportSettings: ConfigReportSettingRow[];
};
