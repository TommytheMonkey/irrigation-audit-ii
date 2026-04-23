// One-shot migration of in-progress finding drafts from localStorage
// (Issue 1's original storage) into the Dexie `drafts` table.
//
// Safe to call on every app load — if localStorage has no matching
// keys, this does nothing. Runs client-side only.
//
// Logs each migrated key at info-level so we can eyeball the field
// telemetry and notice if anything goes wrong. Failures are logged but
// never thrown — a migration glitch must not block the auditor from
// working.

import { offlineDb } from "./db";

const LEGACY_PREFIX = "audit-draft:";

export async function migrateLocalStorageDraftsToDexie(): Promise<number> {
  if (typeof window === "undefined") return 0;
  const ls = window.localStorage;
  if (!ls) return 0;

  // Snapshot keys first — we'll remove as we go, and iterating live
  // indices while mutating is a classic footgun.
  const keys: string[] = [];
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(LEGACY_PREFIX)) keys.push(k);
    }
  } catch {
    return 0;
  }

  if (keys.length === 0) return 0;

  let migrated = 0;
  for (const k of keys) {
    try {
      const raw = ls.getItem(k);
      if (!raw) {
        ls.removeItem(k);
        continue;
      }

      // Legacy wrapper shape from finding-draft.ts@issue-1:
      //   { value: <FormDraft>, updatedAt: <ISO string> }
      const parsed = JSON.parse(raw) as {
        value?: unknown;
        updatedAt?: string;
      };

      const dexieKey = k.slice(LEGACY_PREFIX.length); // "audit-draft:A:Z" → "A:Z"
      await offlineDb.drafts.put({
        key: dexieKey,
        value: parsed.value ?? null,
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : new Date(),
      });

      ls.removeItem(k);
      console.info("[offline] migrated draft from localStorage:", k);
      migrated++;
    } catch (e) {
      console.warn("[offline] failed to migrate draft:", k, e);
    }
  }

  if (migrated > 0) {
    console.info(
      `[offline] migrated ${migrated} draft${migrated === 1 ? "" : "s"} to IndexedDB`,
    );
  }
  return migrated;
}
