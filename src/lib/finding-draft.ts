// Persistence + dirty detection for in-progress finding drafts.
//
// A "draft" is whatever the auditor has typed/tapped on the zone screen
// before saving. If they walk away (tap Complete & next, close the tab,
// crash), we want that work restored on the next mount. Keyed by
// audit+zone so multiple tabs/zones don't collide.
//
// This module is pure and framework-agnostic so it can be unit-tested in
// isolation — no React, no DOM beyond the `localStorage` global.

export const DRAFT_PREFIX = "audit-draft:";

export function draftKey(auditId: string, zoneId: string): string {
  return `${DRAFT_PREFIX}${auditId}:${zoneId}`;
}

export function auditDraftPrefix(auditId: string): string {
  return `${DRAFT_PREFIX}${auditId}:`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, value: T): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(
      key,
      JSON.stringify({ value, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // Quota exceeded or disabled — field must keep working regardless.
  }
}

export function loadDraft<T>(key: string): T | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: T } | null;
    return parsed?.value ?? null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

// Enumerate every draft key belonging to a given audit. Used when the
// auditor taps Complete Audit so we can warn about (or purge) any zone
// drafts still sitting in local storage.
export function listAuditDraftKeys(auditId: string): string[] {
  const storage = getStorage();
  if (!storage) return [];
  const prefix = auditDraftPrefix(auditId);
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(prefix)) out.push(k);
  }
  return out;
}

export function clearAllDraftsForAudit(auditId: string): void {
  const storage = getStorage();
  if (!storage) return;
  // Snapshot first — removing while iterating shifts indices in some impls.
  for (const k of listAuditDraftKeys(auditId)) {
    try {
      storage.removeItem(k);
    } catch {
      // ignore
    }
  }
}

// Deep equality via JSON. Our drafts are plain JSON objects (enums are
// strings at runtime, no Dates, no Maps) so this is sound. We use it to
// decide whether to prompt the auditor before discarding — the initial
// snapshot is taken at the moment the draft is created; any deviation
// means the user actually touched the form.
export function isDraftDirty<T>(current: T | null, initial: T | null): boolean {
  if (!current) return false;
  if (!initial) return true; // restored-from-storage — treat as dirty
  return JSON.stringify(current) !== JSON.stringify(initial);
}
