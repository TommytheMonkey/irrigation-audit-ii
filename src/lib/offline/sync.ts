// Client-side helpers to download an offline bundle from the server
// and write each slice into Dexie. Counterpart to
// /api/properties/[propertyId]/offline-bundle (server route).
//
// Writes run inside a single Dexie transaction per property so a
// half-failed bundle doesn't leave the store in a mixed state. If the
// transaction throws, nothing has been committed and the caller can
// retry without deduping.

import { offlineDb } from "./db";

export type OfflineBundle = {
  property: { id: string; orgId: string; name: string } & Record<
    string,
    unknown
  >;
  audits: Array<{ id: string; propertyId: string; status: string; startedAt: string | null } & Record<string, unknown>>;
  zones: Array<{ id: string; auditId: string; systemId: string; zoneNumber: number } & Record<string, unknown>>;
  findings: Array<{ id: string; auditId: string; zoneId: string | null; createdAt: string } & Record<string, unknown>>;
  quickPickFindings: Array<{ id: string; orgId: string | null; section: string } & Record<string, unknown>>;
  componentTypes: Array<{ id: string; orgId: string | null; category: string; name: string } & Record<string, unknown>>;
  severityLevels: Array<{ id: string; orgId: string | null; severity: string } & Record<string, unknown>>;
  bundledAt: string;
};

export async function fetchOfflineBundle(
  propertyId: string,
  opts?: { signal?: AbortSignal },
): Promise<OfflineBundle> {
  const res = await fetch(
    `/api/properties/${encodeURIComponent(propertyId)}/offline-bundle`,
    { credentials: "same-origin", signal: opts?.signal },
  );
  if (!res.ok) {
    throw new Error(
      `offline-bundle request failed: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as OfflineBundle;
}

// Writes a fetched bundle into the offline store. Idempotent — a
// second call with the same bundle overwrites rather than duplicates.
export async function writeBundleToDexie(
  bundle: OfflineBundle,
): Promise<void> {
  const now = new Date();
  const bundledAt = new Date(bundle.bundledAt);

  await offlineDb.transaction(
    "rw",
    [
      offlineDb.properties,
      offlineDb.audits,
      offlineDb.zones,
      offlineDb.findings,
      offlineDb.quickPickFindings,
      offlineDb.componentTypes,
      offlineDb.severityLevels,
    ],
    async () => {
      await offlineDb.properties.put({
        id: bundle.property.id,
        orgId: bundle.property.orgId,
        name: bundle.property.name,
        syncedAt: bundledAt,
        downloadedAt: now,
        payload: bundle.property,
      });

      // Upsert each slice. We don't delete pre-existing rows for
      // entities that aren't in the bundle — other properties the
      // user has downloaded shouldn't be disturbed by this one.
      await offlineDb.audits.bulkPut(
        bundle.audits.map((a) => ({
          id: a.id,
          propertyId: a.propertyId,
          status: a.status,
          startedAt: a.startedAt ? new Date(a.startedAt) : null,
          syncedAt: bundledAt,
          payload: a,
        })),
      );
      await offlineDb.zones.bulkPut(
        bundle.zones.map((z) => ({
          id: z.id,
          auditId: z.auditId,
          systemId: z.systemId,
          zoneNumber: z.zoneNumber,
          syncedAt: bundledAt,
          payload: z,
        })),
      );
      await offlineDb.findings.bulkPut(
        bundle.findings.map((f) => ({
          id: f.id,
          auditId: f.auditId,
          zoneId: f.zoneId,
          createdAt: new Date(f.createdAt),
          syncStatus: "synced" as const,
          payload: f,
        })),
      );
      await offlineDb.quickPickFindings.bulkPut(
        bundle.quickPickFindings.map((q) => ({
          id: q.id,
          orgId: q.orgId,
          section: q.section,
          syncedAt: bundledAt,
          payload: q,
        })),
      );
      await offlineDb.componentTypes.bulkPut(
        bundle.componentTypes.map((c) => ({
          id: c.id,
          orgId: c.orgId,
          category: c.category,
          name: c.name,
          syncedAt: bundledAt,
          payload: c,
        })),
      );
      await offlineDb.severityLevels.bulkPut(
        bundle.severityLevels.map((s) => ({
          id: s.id,
          orgId: s.orgId,
          severity: s.severity,
          syncedAt: bundledAt,
          payload: s,
        })),
      );
    },
  );
}

// Convenience — fetch + write in one call.
export async function downloadPropertyForOffline(
  propertyId: string,
  opts?: { signal?: AbortSignal },
): Promise<OfflineBundle> {
  const bundle = await fetchOfflineBundle(propertyId, opts);
  await writeBundleToDexie(bundle);
  return bundle;
}

// Look up the downloaded metadata for a property. Used by the property
// card badge ("Offline ready") and the detail page ("Offline copy: 2
// hours ago") — both read-only.
export async function getOfflineProperty(propertyId: string) {
  return offlineDb.properties.get(propertyId);
}
