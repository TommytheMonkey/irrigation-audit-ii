// Org-scoped reference data helpers.
//
// Rule of thumb: if the org has ANY rows in a reference table, use those
// (and only those). Otherwise fall back to the global defaults seeded with
// orgId=null. This is "override entirely", not "merge with globals" — the
// config sheet is meant to be a complete picture of the org's reference data.
//
// All helpers respect the isActive flag so soft-deleted rows are hidden.

import { db } from "./db";
import type { ComponentType, QuickPickFinding, SeverityLevel } from "@prisma/client";

export async function getOrgComponentTypes(
  orgId: string,
): Promise<ComponentType[]> {
  const orgRows = await db.componentType.findMany({
    where: { orgId, isActive: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
  if (orgRows.length > 0) return orgRows;
  return db.componentType.findMany({
    where: { orgId: null, isActive: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
}

export async function getOrgQuickPicks(
  orgId: string,
): Promise<QuickPickFinding[]> {
  const orgRows = await db.quickPickFinding.findMany({
    where: { orgId, isActive: true },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
  });
  if (orgRows.length > 0) return orgRows;
  return db.quickPickFinding.findMany({
    where: { orgId: null, isActive: true },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
  });
}

export async function getOrgSeverityLevels(
  orgId: string,
): Promise<SeverityLevel[]> {
  const orgRows = await db.severityLevel.findMany({
    where: { orgId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (orgRows.length > 0) return orgRows;
  return db.severityLevel.findMany({
    where: { orgId: null, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}
