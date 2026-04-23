// IndexedDB schema for offline support, via Dexie.
//
// Stores are split to match the server's Prisma shape (three lookup
// tables for finding taxonomy, not one flattened "findingTypes") so
// joins stay explicit and we don't have to re-flatten on every bundle
// download. Reads fall back here when navigator.onLine is false; writes
// are bundle-wide (Phase 1 is read-side offline only).
//
// version(1) is the first schema. Any future column addition needs
// .version(N).stores(...) in a new Dexie schema chain (Dexie migrates
// automatically as long as we don't drop or rename indexed columns).

import Dexie, { type Table } from "dexie";

// ─── Server-mirror rows ──────────────────────────────────────────────────
// Each row caches a fully-joined server row keyed by its server `id`.
// `payload` is the JSON-serializable shape the UI already expects — we
// store it verbatim so the offline render path is indistinguishable
// from the online path.

export type PropertyRow = {
  id: string;
  orgId: string;
  name: string;
  syncedAt: Date;
  downloadedAt: Date; // when the auditor tapped "Download for offline"
  payload: unknown;
};

export type AuditRow = {
  id: string;
  propertyId: string;
  status: string;
  startedAt: Date | null;
  syncedAt: Date;
  payload: unknown;
};

export type ZoneRow = {
  id: string;
  auditId: string;
  systemId: string;
  zoneNumber: number;
  syncedAt: Date;
  payload: unknown;
};

export type QuickPickFindingRow = {
  id: string;
  orgId: string | null; // null = global reference row
  section: string;
  syncedAt: Date;
  payload: unknown;
};

export type ComponentTypeRow = {
  id: string;
  orgId: string | null;
  category: string;
  name: string;
  syncedAt: Date;
  payload: unknown;
};

export type SeverityLevelRow = {
  id: string;
  orgId: string | null;
  severity: string;
  syncedAt: Date;
  payload: unknown;
};

export type FindingRow = {
  id: string;
  auditId: string;
  zoneId: string | null;
  createdAt: Date;
  // Phase 1 only ever writes "synced" (findings come from the server).
  // Phase 2 will add "pending" and "error" for offline-created findings.
  syncStatus: "synced" | "pending" | "error";
  payload: unknown;
};

// ─── In-progress finding drafts ──────────────────────────────────────────
// Replaces the localStorage implementation shipped with Issue 1.
// Keyed `${auditId}:${zoneId}` (no prefix — finding-draft.ts strips the
// legacy `audit-draft:` prefix when translating external-shape keys).

export type DraftRow = {
  key: string;
  value: unknown;
  updatedAt: Date;
};

// ─── Dexie instance ──────────────────────────────────────────────────────

export class OfflineDB extends Dexie {
  properties!: Table<PropertyRow, string>;
  audits!: Table<AuditRow, string>;
  zones!: Table<ZoneRow, string>;
  quickPickFindings!: Table<QuickPickFindingRow, string>;
  componentTypes!: Table<ComponentTypeRow, string>;
  severityLevels!: Table<SeverityLevelRow, string>;
  findings!: Table<FindingRow, string>;
  drafts!: Table<DraftRow, string>;

  constructor(name = "irrigation-audit-offline") {
    super(name);
    this.version(1).stores({
      // Leading "id" (or "key" for drafts) = primary key; the rest are
      // secondary indexes we'll actually query by. Don't index columns
      // you won't use — every index is a write cost.
      properties: "id, syncedAt, downloadedAt",
      audits: "id, propertyId, syncedAt",
      zones: "id, auditId, syncedAt",
      quickPickFindings: "id, orgId, section",
      componentTypes: "id, orgId, category",
      severityLevels: "id, orgId",
      findings: "id, auditId, zoneId, syncStatus",
      drafts: "key, updatedAt",
    });
  }
}

// Singleton. Tests construct their own instance via `new OfflineDB(name)`
// with a per-test database name to keep runs isolated.
export const offlineDb = new OfflineDB();
