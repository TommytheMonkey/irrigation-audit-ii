// Persistence + dirty detection for in-progress finding drafts.
//
// A "draft" is whatever the auditor has typed/tapped on the zone screen
// before saving. If they walk away (tap Complete & next, close the tab,
// crash), we want that work restored on the next mount. Keyed by
// audit+zone so multiple tabs/zones don't collide.
//
// Backed by IndexedDB (Dexie) as of Phase 1 offline work. Previously
// lived in localStorage; the migration from legacy keys is handled
// once per client in src/lib/offline/migrate.ts. The external key
// shape (`audit-draft:<auditId>:<zoneId>`) is preserved so callers
// don't need to change; we strip the `audit-draft:` prefix when
// talking to Dexie.

import { offlineDb } from "./offline/db";

export const DRAFT_PREFIX = "audit-draft:";

export function draftKey(auditId: string, zoneId: string): string {
  return `${DRAFT_PREFIX}${auditId}:${zoneId}`;
}

export function auditDraftPrefix(auditId: string): string {
  return `${DRAFT_PREFIX}${auditId}:`;
}

function toDexieKey(storageKey: string): string {
  return storageKey.startsWith(DRAFT_PREFIX)
    ? storageKey.slice(DRAFT_PREFIX.length)
    : storageKey;
}

function toStorageKey(dexieKey: string): string {
  return `${DRAFT_PREFIX}${dexieKey}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export async function saveDraft<T>(key: string, value: T): Promise<void> {
  if (!isBrowser()) return;
  try {
    await offlineDb.drafts.put({
      key: toDexieKey(key),
      value: value as unknown,
      updatedAt: new Date(),
    });
  } catch {
    // Storage failure must not block field work. The form stays
    // functional; we just can't restore on reload.
  }
}

export async function loadDraft<T>(key: string): Promise<T | null> {
  if (!isBrowser()) return null;
  try {
    const row = await offlineDb.drafts.get(toDexieKey(key));
    return (row?.value as T) ?? null;
  } catch {
    return null;
  }
}

export async function clearDraft(key: string): Promise<void> {
  if (!isBrowser()) return;
  try {
    await offlineDb.drafts.delete(toDexieKey(key));
  } catch {
    // ignore
  }
}

// Enumerate every draft key belonging to a given audit. Used by
// Complete Audit to surface a warning and to purge on success.
export async function listAuditDraftKeys(auditId: string): Promise<string[]> {
  if (!isBrowser()) return [];
  try {
    const rows = await offlineDb.drafts
      .where("key")
      .startsWith(`${auditId}:`)
      .toArray();
    return rows.map((r) => toStorageKey(r.key));
  } catch {
    return [];
  }
}

export async function clearAllDraftsForAudit(auditId: string): Promise<void> {
  if (!isBrowser()) return;
  try {
    await offlineDb.drafts
      .where("key")
      .startsWith(`${auditId}:`)
      .delete();
  } catch {
    // ignore
  }
}

// Deep equality via JSON. Our drafts are plain JSON objects (enums are
// strings at runtime, no Dates, no Maps) so this is sound. Used to
// decide whether to prompt before discarding. Stays synchronous — the
// caller already has `current` and `initial` in memory.
export function isDraftDirty<T>(current: T | null, initial: T | null): boolean {
  if (!current) return false;
  if (!initial) return true; // restored-from-storage — treat as dirty
  return JSON.stringify(current) !== JSON.stringify(initial);
}
