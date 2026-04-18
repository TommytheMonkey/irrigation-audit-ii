// Validates a parsed ConfigJson before sync. Surfaces row/column-level errors
// the user can fix in their config sheet (or, in dev mode, the JSON file).
//
// Validation rules:
//   - Required columns present and non-empty
//   - Exactly 3 severity levels with sortOrder 1,2,3
//   - Severity colors are valid hex
//   - Quick-pick severity name resolves to a severity level
//   - Quick-pick category exists in components
//   - Quick-pick issueType / defaultSolution / unit are valid enum values
//   - No duplicate component (category, name) rows
//   - No duplicate quick-pick (section, issue) rows
//
// On success, returns the resolved lookup maps the sync step needs (so it
// doesn't have to re-derive them).

import { IssueType, SolutionAction, UnitOfMeasure, Severity } from "@prisma/client";
import type {
  ConfigComponentRow,
  ConfigJson,
  ConfigQuickPickRow,
  ConfigSeverityLevelRow,
} from "./config-types";

export type ValidationError = {
  tab: "components" | "quickPicks" | "severityLevels" | "reportSettings";
  row?: number; // 1-based, matches the sheet row the user sees
  field?: string;
  message: string;
};

export type ValidationResult =
  | {
      valid: true;
      // Lookup maps the sync step reuses
      severityNameToEnum: Map<string, Severity>;
      severityEnumToSortOrder: Map<Severity, number>;
    }
  | { valid: false; errors: ValidationError[] };

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const ISSUE_TYPES = new Set<string>(Object.values(IssueType));
const SOLUTION_ACTIONS = new Set<string>(Object.values(SolutionAction));
const UNIT_OF_MEASURES = new Set<string>(Object.values(UnitOfMeasure));

export function validateConfig(json: ConfigJson): ValidationResult {
  const errors: ValidationError[] = [];

  // ── Severity levels ───────────────────────────────────────────────────────
  const severityNameToEnum = new Map<string, Severity>();
  const severityEnumToSortOrder = new Map<Severity, number>();

  if (!Array.isArray(json.severityLevels) || json.severityLevels.length !== 3) {
    errors.push({
      tab: "severityLevels",
      message: `Expected exactly 3 severity levels, got ${json.severityLevels?.length ?? 0}`,
    });
  } else {
    const sortOrders = json.severityLevels.map((s) => s.level).sort((a, b) => a - b);
    if (sortOrders[0] !== 1 || sortOrders[1] !== 2 || sortOrders[2] !== 3) {
      errors.push({
        tab: "severityLevels",
        field: "level",
        message: "Severity levels must use sortOrder 1, 2, 3",
      });
    }

    // Order is locked: lowest sortOrder → low, middle → medium, highest → high.
    const sorted = [...json.severityLevels].sort((a, b) => a.level - b.level);
    const enumOrder: Severity[] = [Severity.low, Severity.medium, Severity.high];

    sorted.forEach((s, idx) => {
      const sheetRow = json.severityLevels.indexOf(s) + 1;
      validateSeverityRow(s, sheetRow, errors);
      if (s.name && !errors.some((e) => e.tab === "severityLevels" && e.row === sheetRow && e.field === "name")) {
        if (severityNameToEnum.has(s.name)) {
          errors.push({
            tab: "severityLevels",
            row: sheetRow,
            field: "name",
            message: `Duplicate severity name "${s.name}"`,
          });
        } else {
          severityNameToEnum.set(s.name, enumOrder[idx]);
        }
      }
      severityEnumToSortOrder.set(enumOrder[idx], s.level);
    });
  }

  // ── Components ────────────────────────────────────────────────────────────
  const componentKeys = new Set<string>();
  const componentCategories = new Set<string>();

  if (!Array.isArray(json.components)) {
    errors.push({ tab: "components", message: "components must be an array" });
  } else {
    json.components.forEach((c, idx) => {
      const row = idx + 1;
      validateComponentRow(c, row, errors);
      if (c.category && c.component) {
        const key = `${c.category}::${c.component}`;
        if (componentKeys.has(key)) {
          errors.push({
            tab: "components",
            row,
            message: `Duplicate component (${c.category} / ${c.component})`,
          });
        } else {
          componentKeys.add(key);
          componentCategories.add(c.category);
        }
      }
    });
  }

  // ── Quick picks ───────────────────────────────────────────────────────────
  const quickPickKeys = new Set<string>();
  if (!Array.isArray(json.quickPicks)) {
    errors.push({ tab: "quickPicks", message: "quickPicks must be an array" });
  } else {
    json.quickPicks.forEach((q, idx) => {
      const row = idx + 1;
      validateQuickPickRow(q, row, componentCategories, severityNameToEnum, errors);
      if (q.section && q.issue) {
        const key = `${q.section}::${q.issue}`;
        if (quickPickKeys.has(key)) {
          errors.push({
            tab: "quickPicks",
            row,
            message: `Duplicate quick-pick (${q.section} / ${q.issue})`,
          });
        } else {
          quickPickKeys.add(key);
        }
      }
    });
  }

  // ── Report settings ───────────────────────────────────────────────────────
  if (!Array.isArray(json.reportSettings)) {
    errors.push({ tab: "reportSettings", message: "reportSettings must be an array" });
  } else {
    json.reportSettings.forEach((r, idx) => {
      const row = idx + 1;
      if (!r.setting || typeof r.setting !== "string") {
        errors.push({ tab: "reportSettings", row, field: "setting", message: "Setting key is required" });
      }
    });
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, severityNameToEnum, severityEnumToSortOrder };
}

function validateSeverityRow(
  s: ConfigSeverityLevelRow,
  row: number,
  errors: ValidationError[],
): void {
  if (!s.name || typeof s.name !== "string") {
    errors.push({ tab: "severityLevels", row, field: "name", message: "Name is required" });
  }
  if (!s.color || !HEX_RE.test(s.color)) {
    errors.push({
      tab: "severityLevels",
      row,
      field: "color",
      message: `Color must be a hex code like #ef4444 (got "${s.color ?? ""}")`,
    });
  }
  if (typeof s.level !== "number") {
    errors.push({ tab: "severityLevels", row, field: "level", message: "Level must be a number" });
  }
}

function validateComponentRow(
  c: ConfigComponentRow,
  row: number,
  errors: ValidationError[],
): void {
  if (!c.category || typeof c.category !== "string") {
    errors.push({ tab: "components", row, field: "category", message: "Category is required" });
  }
  if (!c.component || typeof c.component !== "string") {
    errors.push({ tab: "components", row, field: "component", message: "Component is required" });
  }
}

function validateQuickPickRow(
  q: ConfigQuickPickRow,
  row: number,
  componentCategories: Set<string>,
  severityNameToEnum: Map<string, Severity>,
  errors: ValidationError[],
): void {
  if (!q.section) {
    errors.push({ tab: "quickPicks", row, field: "section", message: "Section is required" });
  }
  if (!q.category) {
    errors.push({ tab: "quickPicks", row, field: "category", message: "Category is required" });
  } else if (componentCategories.size > 0 && !componentCategories.has(q.category)) {
    errors.push({
      tab: "quickPicks",
      row,
      field: "category",
      message: `Category "${q.category}" doesn't exist in the Components tab`,
    });
  }
  if (!q.issue) {
    errors.push({ tab: "quickPicks", row, field: "issue", message: "Issue is required" });
  }
  if (!q.issueType || !ISSUE_TYPES.has(q.issueType)) {
    errors.push({
      tab: "quickPicks",
      row,
      field: "issueType",
      message: `Issue type must be one of: ${[...ISSUE_TYPES].join(", ")}`,
    });
  }
  if (!q.defaultSolution || !SOLUTION_ACTIONS.has(q.defaultSolution)) {
    errors.push({
      tab: "quickPicks",
      row,
      field: "defaultSolution",
      message: `Solution must be one of: ${[...SOLUTION_ACTIONS].join(", ")}`,
    });
  }
  if (q.unit && !UNIT_OF_MEASURES.has(q.unit)) {
    errors.push({
      tab: "quickPicks",
      row,
      field: "unit",
      message: `Unit must be one of: ${[...UNIT_OF_MEASURES].join(", ")}`,
    });
  }
  if (!q.defaultSeverity) {
    errors.push({ tab: "quickPicks", row, field: "defaultSeverity", message: "Default severity is required" });
  } else if (severityNameToEnum.size > 0 && !severityNameToEnum.has(q.defaultSeverity)) {
    errors.push({
      tab: "quickPicks",
      row,
      field: "defaultSeverity",
      message: `Severity "${q.defaultSeverity}" doesn't match a name in the Severity Levels tab`,
    });
  }
}
