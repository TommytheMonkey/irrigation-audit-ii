import { beforeEach, describe, it, expect } from "vitest";
import { offlineDb } from "./db";

// Schema sanity tests. The store-level tests elsewhere
// (finding-draft.test.ts, migrate.test.ts, sync.test.ts) exercise the
// flows the app actually runs; these guard the schema contract itself
// so a future index rename / removal fails loudly under vitest instead
// of silently at 3am in a field somewhere.

beforeEach(async () => {
  await Promise.all([
    offlineDb.properties.clear(),
    offlineDb.audits.clear(),
    offlineDb.zones.clear(),
    offlineDb.findings.clear(),
    offlineDb.quickPickFindings.clear(),
    offlineDb.componentTypes.clear(),
    offlineDb.severityLevels.clear(),
    offlineDb.drafts.clear(),
  ]);
});

describe("OfflineDB schema", () => {
  it("exposes all 8 stores", () => {
    const names = offlineDb.tables.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "audits",
        "componentTypes",
        "drafts",
        "findings",
        "properties",
        "quickPickFindings",
        "severityLevels",
        "zones",
      ].sort(),
    );
  });

  it("is on schema version 1", () => {
    expect(offlineDb.verno).toBe(1);
  });

  it("indexes the fields the app actually queries", () => {
    // Audits are looked up by propertyId in the sync module; zones by
    // auditId. If these indexes disappear, the queries still work but
    // degrade to a full table scan — catch it here.
    const audits = offlineDb.audits.schema;
    const zones = offlineDb.zones.schema;
    expect(audits.idxByName["propertyId"]).toBeDefined();
    expect(zones.idxByName["auditId"]).toBeDefined();
  });
});

describe("basic CRUD", () => {
  it("round-trips a property row verbatim", async () => {
    const now = new Date();
    await offlineDb.properties.put({
      id: "p-1",
      orgId: "org-1",
      name: "Austin Oaks",
      syncedAt: now,
      downloadedAt: now,
      payload: { nested: { field: "value" } },
    });
    const got = await offlineDb.properties.get("p-1");
    expect(got?.name).toBe("Austin Oaks");
    expect(got?.downloadedAt.getTime()).toBe(now.getTime());
    expect(got?.payload).toEqual({ nested: { field: "value" } });
  });

  it("filters audits by propertyId using the secondary index", async () => {
    const base = {
      status: "in_progress",
      startedAt: new Date(),
      syncedAt: new Date(),
      payload: {},
    };
    await offlineDb.audits.bulkPut([
      { id: "a1", propertyId: "p1", ...base },
      { id: "a2", propertyId: "p1", ...base },
      { id: "a3", propertyId: "p2", ...base },
    ]);

    const forP1 = await offlineDb.audits.where("propertyId").equals("p1").toArray();
    expect(forP1.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
  });

  it("deletes a draft by key", async () => {
    await offlineDb.drafts.put({
      key: "aud:zn",
      value: { note: "hi" },
      updatedAt: new Date(),
    });
    await offlineDb.drafts.delete("aud:zn");
    expect(await offlineDb.drafts.get("aud:zn")).toBeUndefined();
  });

  it("findings store accepts syncStatus values the app actually uses", async () => {
    // Phase 1 only writes "synced"; Phase 2 will also write "pending"
    // and "error". Guard that the shape accepts all three so the
    // schema doesn't need a migration later.
    const base = {
      auditId: "aud-1",
      zoneId: "zn-1",
      createdAt: new Date(),
      payload: {},
    };
    await offlineDb.findings.bulkPut([
      { id: "f1", ...base, syncStatus: "synced" },
      { id: "f2", ...base, syncStatus: "pending" },
      { id: "f3", ...base, syncStatus: "error" },
    ]);
    const rows = await offlineDb.findings
      .where("syncStatus")
      .equals("pending")
      .toArray();
    expect(rows.map((r) => r.id)).toEqual(["f2"]);
  });
});
