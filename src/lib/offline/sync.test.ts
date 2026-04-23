import { beforeEach, describe, it, expect, vi } from "vitest";
import type { OfflineBundle } from "./sync";
import {
  fetchOfflineBundle,
  writeBundleToDexie,
  downloadPropertyForOffline,
  getOfflineProperty,
} from "./sync";
import { offlineDb } from "./db";

// A small, realistic-shaped bundle. Use strings for dates — the server
// ships ISO strings over JSON and sync.ts normalizes to Date when
// writing to Dexie.
const BUNDLE: OfflineBundle = {
  property: {
    id: "prop-1",
    orgId: "org-1",
    name: "Austin Oaks",
    address: "123 Main St",
  },
  audits: [
    {
      id: "aud-1",
      propertyId: "prop-1",
      status: "in_progress",
      startedAt: "2026-04-20T15:00:00.000Z",
    },
  ],
  zones: [
    {
      id: "zn-1",
      auditId: "aud-1",
      systemId: "sys-1",
      zoneNumber: 1,
    },
  ],
  findings: [
    {
      id: "f-1",
      auditId: "aud-1",
      zoneId: "zn-1",
      createdAt: "2026-04-20T15:30:00.000Z",
    },
  ],
  quickPickFindings: [
    { id: "qp-1", orgId: null, section: "Turf" },
    { id: "qp-2", orgId: "org-1", section: "Drip" },
  ],
  componentTypes: [
    { id: "ct-1", orgId: null, category: "Head", name: "Rotor" },
  ],
  severityLevels: [{ id: "sev-1", orgId: null, severity: "high" }],
  bundledAt: "2026-04-20T16:00:00.000Z",
};

beforeEach(async () => {
  await Promise.all([
    offlineDb.properties.clear(),
    offlineDb.audits.clear(),
    offlineDb.zones.clear(),
    offlineDb.findings.clear(),
    offlineDb.quickPickFindings.clear(),
    offlineDb.componentTypes.clear(),
    offlineDb.severityLevels.clear(),
  ]);
  vi.restoreAllMocks();
});

describe("writeBundleToDexie", () => {
  it("writes each slice into its matching store", async () => {
    await writeBundleToDexie(BUNDLE);

    const property = await offlineDb.properties.get("prop-1");
    expect(property?.name).toBe("Austin Oaks");
    expect(property?.downloadedAt).toBeInstanceOf(Date);
    expect(property?.syncedAt.toISOString()).toBe(BUNDLE.bundledAt);

    expect(await offlineDb.audits.count()).toBe(1);
    expect(await offlineDb.zones.count()).toBe(1);
    expect(await offlineDb.findings.count()).toBe(1);
    expect(await offlineDb.quickPickFindings.count()).toBe(2);
    expect(await offlineDb.componentTypes.count()).toBe(1);
    expect(await offlineDb.severityLevels.count()).toBe(1);
  });

  it("marks fetched findings as synced (not pending)", async () => {
    await writeBundleToDexie(BUNDLE);
    const f = await offlineDb.findings.get("f-1");
    expect(f?.syncStatus).toBe("synced");
  });

  it("is idempotent — re-running updates instead of duplicating", async () => {
    await writeBundleToDexie(BUNDLE);
    await writeBundleToDexie(BUNDLE);
    expect(await offlineDb.audits.count()).toBe(1);
    expect(await offlineDb.zones.count()).toBe(1);
  });

  it("doesn't touch unrelated rows written earlier", async () => {
    await offlineDb.audits.put({
      id: "other-aud",
      propertyId: "other-prop",
      status: "completed",
      startedAt: new Date(),
      syncedAt: new Date(),
      payload: {},
    });
    await writeBundleToDexie(BUNDLE);
    expect(await offlineDb.audits.count()).toBe(2);
    expect((await offlineDb.audits.get("other-aud"))?.propertyId).toBe(
      "other-prop",
    );
  });
});

describe("fetchOfflineBundle + downloadPropertyForOffline", () => {
  it("fetches from the correct endpoint and writes the result", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(BUNDLE), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const bundle = await downloadPropertyForOffline("prop-1");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/properties/prop-1/offline-bundle",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(bundle.property.id).toBe("prop-1");

    const stored = await getOfflineProperty("prop-1");
    expect(stored?.name).toBe("Austin Oaks");
  });

  it("throws on non-2xx so the UI surfaces the failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(fetchOfflineBundle("prop-1")).rejects.toThrow(/403/);
  });
});
