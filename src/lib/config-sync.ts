// Applies a validated ConfigJson to Neon for one org. Wraps the upserts in a
// transaction so a partial sync can't leave the org's reference data in a
// half-updated state.
//
// For each table:
//   - Components: upsert by (orgId, category, name); rows in DB but not in
//     the JSON get isActive=false (soft-delete preserves historical findings).
//   - Quick picks: no natural unique key on the model, so we match by
//     (section, label) within the org's rows. Same soft-delete on vanish.
//   - Severity levels: always exactly 3 rows, upsert by (orgId, severity).
//
// After all writes succeed, Org.configSyncedAt is bumped.

import { db } from "./db";
import { Severity, IssueType, SolutionAction, UnitOfMeasure } from "@prisma/client";
import type { ConfigJson } from "./config-types";
import { validateConfig, type ValidationError } from "./config-validator";

export type SyncSummary = {
  components: { upserted: number; deactivated: number };
  quickPicks: { upserted: number; deactivated: number };
  severityLevels: { upserted: number };
};

export type SyncResult =
  | { ok: true; summary: SyncSummary }
  | { ok: false; errors: ValidationError[] };

export async function syncConfig(orgId: string, json: ConfigJson): Promise<SyncResult> {
  const validation = validateConfig(json);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors as never };
  }

  const { severityNameToEnum } = validation;

  const summary = await db.$transaction(async (tx) => {
    // ── Severity levels ─────────────────────────────────────────────────────
    // Sort by `level` and map to low/medium/high in order. Always 3 rows.
    const sortedSeverities = [...json.severityLevels].sort((a, b) => a.level - b.level);
    const enumOrder: Severity[] = [Severity.low, Severity.medium, Severity.high];

    for (let i = 0; i < sortedSeverities.length; i++) {
      const s = sortedSeverities[i];
      const sev = enumOrder[i];
      await tx.severityLevel.upsert({
        where: { orgId_severity: { orgId, severity: sev } },
        create: {
          orgId,
          severity: sev,
          name: s.name,
          color: s.color,
          sortOrder: s.level,
          label: s.label,
          description: s.description,
          isActive: true,
        },
        update: {
          name: s.name,
          color: s.color,
          sortOrder: s.level,
          label: s.label,
          description: s.description,
          isActive: true,
        },
      });
    }

    // ── Components ──────────────────────────────────────────────────────────
    let componentsUpserted = 0;
    const seenComponentKeys = new Set<string>();
    let sortCursor = 0;

    for (const c of json.components) {
      sortCursor += 10;
      const subtypes = c.sizes
        ? c.sizes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null;
      await tx.componentType.upsert({
        where: {
          orgId_category_name: { orgId, category: c.category, name: c.component },
        },
        create: {
          orgId,
          category: c.category,
          name: c.component,
          subtypes: subtypes ?? undefined,
          sortOrder: sortCursor,
          isActive: c.active !== false,
        },
        update: {
          subtypes: subtypes ?? undefined,
          sortOrder: sortCursor,
          isActive: c.active !== false,
        },
      });
      seenComponentKeys.add(`${c.category}::${c.component}`);
      componentsUpserted++;
    }

    // Soft-delete vanished components
    const existingComponents = await tx.componentType.findMany({
      where: { orgId, isActive: true },
      select: { id: true, category: true, name: true },
    });
    const vanishedComponentIds = existingComponents
      .filter((e) => !seenComponentKeys.has(`${e.category}::${e.name}`))
      .map((e) => e.id);
    if (vanishedComponentIds.length > 0) {
      await tx.componentType.updateMany({
        where: { id: { in: vanishedComponentIds } },
        data: { isActive: false },
      });
    }

    // ── Quick picks ─────────────────────────────────────────────────────────
    // Match existing rows by (section, label) so re-syncing the same sheet
    // doesn't churn IDs. Anything we don't see again gets isActive=false.
    const existingQuickPicks = await tx.quickPickFinding.findMany({
      where: { orgId },
      select: { id: true, section: true, label: true },
    });
    const existingByKey = new Map<string, string>();
    for (const e of existingQuickPicks) {
      existingByKey.set(`${e.section}::${e.label}`, e.id);
    }

    let quickPicksUpserted = 0;
    const seenQuickPickKeys = new Set<string>();
    const quickPickSortBySection = new Map<string, number>();

    for (const q of json.quickPicks) {
      const key = `${q.section}::${q.issue}`;
      seenQuickPickKeys.add(key);
      const cursor = (quickPickSortBySection.get(q.section) ?? 0) + 10;
      quickPickSortBySection.set(q.section, cursor);

      const sev = severityNameToEnum.get(q.defaultSeverity);
      if (!sev) {
        // Validator should have caught this, but guard anyway.
        throw new Error(`Severity "${q.defaultSeverity}" not in lookup`);
      }
      const data = {
        section: q.section,
        label: q.issue,
        issueType: q.issueType as IssueType,
        componentCategory: q.category,
        componentSubtype: q.component ?? null,
        componentSize: q.size ?? null,
        defaultSolution: q.defaultSolution as SolutionAction,
        defaultUom: (q.unit as UnitOfMeasure | undefined) ?? UnitOfMeasure.ea,
        defaultSeverity: sev,
        sortOrder: cursor,
        isActive: q.active !== false,
      };

      const existingId = existingByKey.get(key);
      if (existingId) {
        await tx.quickPickFinding.update({
          where: { id: existingId },
          data,
        });
      } else {
        await tx.quickPickFinding.create({
          data: { orgId, ...data },
        });
      }
      quickPicksUpserted++;
    }

    const vanishedQuickPickIds: string[] = [];
    for (const [key, id] of existingByKey) {
      if (!seenQuickPickKeys.has(key)) vanishedQuickPickIds.push(id);
    }
    if (vanishedQuickPickIds.length > 0) {
      await tx.quickPickFinding.updateMany({
        where: { id: { in: vanishedQuickPickIds } },
        data: { isActive: false },
      });
    }

    await tx.org.update({
      where: { id: orgId },
      data: { configSyncedAt: new Date() },
    });

    return {
      components: { upserted: componentsUpserted, deactivated: vanishedComponentIds.length },
      quickPicks: { upserted: quickPicksUpserted, deactivated: vanishedQuickPickIds.length },
      severityLevels: { upserted: sortedSeverities.length },
    };
  });

  return { ok: true, summary };
}
