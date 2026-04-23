import { beforeEach, describe, it, expect } from "vitest";
import {
  draftKey,
  auditDraftPrefix,
  saveDraft,
  loadDraft,
  clearDraft,
  listAuditDraftKeys,
  clearAllDraftsForAudit,
  isDraftDirty,
  DRAFT_PREFIX,
} from "./finding-draft";

// Dummy draft shape — mirrors FormDraft in zone-audit.tsx closely enough
// that the serializer pass is representative.
type Draft = {
  label: string;
  severity: "low" | "medium" | "high";
  quantity: number;
  notes: string;
  photoUrls: string[];
};

const DRAFT_A: Draft = {
  label: "Broken head",
  severity: "high",
  quantity: 1,
  notes: "",
  photoUrls: [],
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("draftKey / auditDraftPrefix", () => {
  it("keys by audit + zone", () => {
    expect(draftKey("aud1", "zn1")).toBe(`${DRAFT_PREFIX}aud1:zn1`);
  });
  it("prefix matches key start for same audit", () => {
    const key = draftKey("aud1", "zn1");
    expect(key.startsWith(auditDraftPrefix("aud1"))).toBe(true);
    expect(key.startsWith(auditDraftPrefix("aud2"))).toBe(false);
  });
});

describe("saveDraft / loadDraft round-trip", () => {
  it("returns null when nothing saved", () => {
    expect(loadDraft(draftKey("aud1", "zn1"))).toBeNull();
  });

  it("persists and reloads an object verbatim", () => {
    const key = draftKey("aud1", "zn1");
    saveDraft<Draft>(key, DRAFT_A);
    expect(loadDraft<Draft>(key)).toEqual(DRAFT_A);
  });

  it("overwrites on second save", () => {
    const key = draftKey("aud1", "zn1");
    saveDraft(key, DRAFT_A);
    saveDraft(key, { ...DRAFT_A, notes: "edited" });
    expect(loadDraft<Draft>(key)?.notes).toBe("edited");
  });

  it("returns null when stored JSON is corrupt", () => {
    const key = draftKey("aud1", "zn1");
    window.localStorage.setItem(key, "{not json");
    expect(loadDraft<Draft>(key)).toBeNull();
  });
});

describe("clearDraft", () => {
  it("removes a saved draft", () => {
    const key = draftKey("aud1", "zn1");
    saveDraft(key, DRAFT_A);
    clearDraft(key);
    expect(loadDraft<Draft>(key)).toBeNull();
  });
});

describe("cross-zone / cross-audit isolation", () => {
  it("drafts for different zones don't overlap", () => {
    const a = draftKey("aud1", "zn1");
    const b = draftKey("aud1", "zn2");
    saveDraft<Draft>(a, { ...DRAFT_A, notes: "zone-1" });
    saveDraft<Draft>(b, { ...DRAFT_A, notes: "zone-2" });
    expect(loadDraft<Draft>(a)?.notes).toBe("zone-1");
    expect(loadDraft<Draft>(b)?.notes).toBe("zone-2");
  });

  it("drafts for different audits don't overlap", () => {
    const a = draftKey("aud1", "zn1");
    const b = draftKey("aud2", "zn1");
    saveDraft<Draft>(a, { ...DRAFT_A, notes: "audit-1" });
    saveDraft<Draft>(b, { ...DRAFT_A, notes: "audit-2" });
    expect(loadDraft<Draft>(a)?.notes).toBe("audit-1");
    expect(loadDraft<Draft>(b)?.notes).toBe("audit-2");
  });
});

describe("listAuditDraftKeys", () => {
  it("returns only keys for the target audit", () => {
    saveDraft<Draft>(draftKey("aud1", "zn1"), DRAFT_A);
    saveDraft<Draft>(draftKey("aud1", "zn2"), DRAFT_A);
    saveDraft<Draft>(draftKey("aud2", "zn1"), DRAFT_A);
    window.localStorage.setItem("unrelated", "whatever");

    const keys = listAuditDraftKeys("aud1").sort();
    expect(keys).toEqual(
      [draftKey("aud1", "zn1"), draftKey("aud1", "zn2")].sort(),
    );
  });
});

describe("clearAllDraftsForAudit", () => {
  it("removes every draft under the audit and leaves others", () => {
    saveDraft<Draft>(draftKey("aud1", "zn1"), DRAFT_A);
    saveDraft<Draft>(draftKey("aud1", "zn2"), DRAFT_A);
    saveDraft<Draft>(draftKey("aud2", "zn1"), DRAFT_A);
    window.localStorage.setItem("unrelated", "whatever");

    clearAllDraftsForAudit("aud1");

    expect(loadDraft<Draft>(draftKey("aud1", "zn1"))).toBeNull();
    expect(loadDraft<Draft>(draftKey("aud1", "zn2"))).toBeNull();
    expect(loadDraft<Draft>(draftKey("aud2", "zn1"))).toEqual(DRAFT_A);
    expect(window.localStorage.getItem("unrelated")).toBe("whatever");
  });
});

describe("isDraftDirty", () => {
  it("fresh draft matching initial snapshot is not dirty", () => {
    expect(isDraftDirty(DRAFT_A, DRAFT_A)).toBe(false);
    expect(isDraftDirty({ ...DRAFT_A }, { ...DRAFT_A })).toBe(false);
  });

  it("any field change marks the draft dirty", () => {
    expect(isDraftDirty({ ...DRAFT_A, severity: "low" }, DRAFT_A)).toBe(true);
    expect(isDraftDirty({ ...DRAFT_A, quantity: 5 }, DRAFT_A)).toBe(true);
    expect(isDraftDirty({ ...DRAFT_A, notes: "note" }, DRAFT_A)).toBe(true);
    expect(isDraftDirty({ ...DRAFT_A, photoUrls: ["/x.jpg"] }, DRAFT_A)).toBe(
      true,
    );
  });

  it("null current is never dirty", () => {
    expect(isDraftDirty<Draft>(null, DRAFT_A)).toBe(false);
    expect(isDraftDirty<Draft>(null, null)).toBe(false);
  });

  it("null initial with a present draft counts as dirty (restored from storage)", () => {
    expect(isDraftDirty<Draft>(DRAFT_A, null)).toBe(true);
  });
});
