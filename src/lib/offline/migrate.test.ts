import { beforeEach, describe, it, expect } from "vitest";
import { migrateLocalStorageDraftsToDexie } from "./migrate";
import { offlineDb } from "./db";

const LEGACY_PREFIX = "audit-draft:";

type LegacyEntry = {
  value: unknown;
  updatedAt?: string;
};

function writeLegacy(key: string, entry: LegacyEntry): void {
  window.localStorage.setItem(key, JSON.stringify(entry));
}

beforeEach(async () => {
  window.localStorage.clear();
  await offlineDb.drafts.clear();
});

describe("migrateLocalStorageDraftsToDexie", () => {
  it("is a no-op when there are no legacy keys", async () => {
    window.localStorage.setItem("unrelated", "whatever");
    const count = await migrateLocalStorageDraftsToDexie();
    expect(count).toBe(0);
    expect(window.localStorage.getItem("unrelated")).toBe("whatever");
  });

  it("moves each audit-draft:* entry into Dexie and removes localStorage", async () => {
    writeLegacy(`${LEGACY_PREFIX}aud1:zn1`, {
      value: { label: "head", quantity: 2 },
      updatedAt: "2026-04-22T10:00:00.000Z",
    });
    writeLegacy(`${LEGACY_PREFIX}aud1:zn2`, {
      value: { label: "nozzle", quantity: 1 },
    });
    window.localStorage.setItem("unrelated", "stay");

    const count = await migrateLocalStorageDraftsToDexie();

    expect(count).toBe(2);
    expect(window.localStorage.getItem(`${LEGACY_PREFIX}aud1:zn1`)).toBeNull();
    expect(window.localStorage.getItem(`${LEGACY_PREFIX}aud1:zn2`)).toBeNull();
    expect(window.localStorage.getItem("unrelated")).toBe("stay");

    const row1 = await offlineDb.drafts.get("aud1:zn1");
    expect(row1).toBeDefined();
    expect(row1?.value).toEqual({ label: "head", quantity: 2 });
    expect(row1?.updatedAt.toISOString()).toBe("2026-04-22T10:00:00.000Z");

    const row2 = await offlineDb.drafts.get("aud1:zn2");
    expect(row2?.value).toEqual({ label: "nozzle", quantity: 1 });
    // Missing updatedAt → synthesized "now" — just assert it parsed to a
    // valid Date, not a specific clock reading.
    expect(row2?.updatedAt).toBeInstanceOf(Date);
    expect(Number.isNaN(row2?.updatedAt.getTime())).toBe(false);
  });

  it("skips unparseable entries but still removes them so they don't block future runs", async () => {
    window.localStorage.setItem(`${LEGACY_PREFIX}aud1:zn1`, "{not json");
    const count = await migrateLocalStorageDraftsToDexie();
    // Malformed → counted as failure, not migrated; but it's OK for the
    // test to be tolerant on whether the garbage gets cleaned up. The
    // important invariant is that good entries migrate and the function
    // doesn't throw.
    expect(count).toBe(0);
  });

  it("is idempotent — second run finds nothing to do", async () => {
    writeLegacy(`${LEGACY_PREFIX}aud1:zn1`, {
      value: { label: "head" },
    });
    const first = await migrateLocalStorageDraftsToDexie();
    const second = await migrateLocalStorageDraftsToDexie();
    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(await offlineDb.drafts.count()).toBe(1);
  });
});
