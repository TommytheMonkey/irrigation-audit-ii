"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { compressImage } from "@/lib/image-compress";
import {
  clearDraft,
  draftKey,
  isDraftDirty,
  loadDraft,
  saveDraft,
} from "@/lib/finding-draft";
import {
  IssueType,
  SolutionAction,
  CostModel,
  UnitOfMeasure,
  Severity,
  ZoneType,
  type PinSource,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  SitePlanPicker,
  type ExistingPin,
} from "./site-plan-picker";
import {
  SatellitePinModal,
  type LatLng,
} from "@/components/map/satellite-pin-modal";

export type SitePlanData = {
  fileId: string;
  renderUrl: string;
  width: number;
  height: number;
  existingPins: ExistingPin[];
} | null;

// ─────────────────────────────────────────────────────────────────────────────
// Types crossing the RSC → client boundary. Decimals stripped to plain
// numbers; Prisma enums are plain string unions at runtime so they pass fine.
// ─────────────────────────────────────────────────────────────────────────────

export type ZoneNavItem = {
  id: string;
  zoneNumber: number;
  zoneName: string | null;
  completed: boolean;
  findingCount: number;
};

export type QuickPickRow = {
  id: string;
  section: string;
  label: string;
  issueType: IssueType;
  componentCategory: string;
  componentSubtype: string | null;
  componentSize: string | null;
  defaultSolution: SolutionAction;
  defaultCostModel: CostModel;
  defaultUom: UnitOfMeasure;
  defaultSeverity: Severity;
};

export type ComponentTypeRow = {
  id: string;
  category: string;
  name: string;
  subtypes: string[];
};

export type SeverityLevelRow = {
  severity: Severity;
  name: string;
  color: string; // hex from the config sheet
  label: string | null;
  sortOrder: number;
};

export type FindingRow = {
  id: string;
  issueType: IssueType;
  componentCategory: string;
  componentSubtype: string | null;
  componentSize: string | null;
  severity: Severity;
  solutionAction: SolutionAction;
  quantity: number | null;
  unitOfMeasure: UnitOfMeasure;
  description: string | null;
  notes: string | null;
  photoUrls: string[];
  // Real-world map pin fields (null-coalesced client-side; see
  // src/app/audits/.../page.tsx for the RSC→client mapping).
  pinLat: number | null;
  pinLng: number | null;
  pinSource: PinSource | null;
  pinPlacedAt: string | null;
};

// Default solution per issue type when the auditor builds a custom finding.
// These are sane defaults — overridable in the form.
const DEFAULT_SOLUTION_BY_ISSUE: Record<IssueType, SolutionAction> = {
  missing: "replace",
  damaged_broken: "replace",
  maladjusted: "adjust",
  incorrect_placement: "relocate",
  leak: "repair",
  clog: "replace",
  electrical_issue: "repair",
};

const ISSUE_LABELS: Record<IssueType, string> = {
  missing: "Missing",
  damaged_broken: "Damaged",
  maladjusted: "Maladjusted",
  incorrect_placement: "Wrong placement",
  leak: "Leak",
  clog: "Clog",
  electrical_issue: "Electrical",
};

// ─────────────────────────────────────────────────────────────────────────────
// Form draft state — what we're about to save.
// ─────────────────────────────────────────────────────────────────────────────

type FormDraft = {
  label: string; // human description shown at the top of the panel
  issueType: IssueType;
  componentCategory: string;
  componentSubtype: string | null;
  componentSize: string | null;
  solutionAction: SolutionAction;
  costModel: CostModel;
  unitOfMeasure: UnitOfMeasure;
  severity: Severity;
  quantity: number;
  notes: string;
  photoUrls: string[];
  // Real-world map pin — lat/lng captured from the satellite modal or
  // GPS fallback. All four fields move together: null when unpinned.
  pinLat: number | null;
  pinLng: number | null;
  pinSource: PinSource | null;
  pinPlacedAt: string | null; // ISO
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ZoneAudit({
  auditId,
  systemId,
  zoneId,
  zoneNumber,
  zoneName,
  zoneType,
  completed,
  propertyId,
  propertyName,
  propertyLat,
  propertyLng,
  navItems,
  initialFindings,
  quickPicks,
  componentTypes,
  severityLevels,
  sitePlan,
}: {
  auditId: string;
  systemId: string;
  zoneId: string;
  zoneNumber: number;
  zoneName: string | null;
  zoneType: ZoneType;
  completed: boolean;
  propertyId: string;
  propertyName: string;
  propertyLat: number | null;
  propertyLng: number | null;
  navItems: ZoneNavItem[];
  initialFindings: FindingRow[];
  quickPicks: QuickPickRow[];
  componentTypes: ComponentTypeRow[];
  severityLevels: SeverityLevelRow[];
  sitePlan: SitePlanData;
}) {
  const router = useRouter();
  const [findings, setFindings] = useState<FindingRow[]>(initialFindings);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  // Snapshot of the draft at the moment it was created (quick-pick tap or
  // custom builder finish). We diff the current draft against this to tell
  // whether the auditor has actually edited anything; a fresh-opened chip
  // shouldn't nag on its way out. A restored-from-storage draft has no
  // snapshot and is treated as dirty.
  const [draftInitial, setDraftInitial] = useState<FormDraft | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [pinPromptFindingId, setPinPromptFindingId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  // Real-world satellite pin modal state. Opens when the auditor taps
  // "Drop pin" (or "Edit") in the LOCATION row of the draft form.
  // Offline fallback (GPS) is wired in the next commit.
  const [mapPinOpen, setMapPinOpen] = useState(false);
  // "What the user was trying to do when we interrupted them for the
  // unsaved-changes confirm" — determines where we navigate after a
  // Save/Discard choice.
  const [confirmIntent, setConfirmIntent] = useState<
    "complete-next" | "done" | null
  >(null);

  const storageKey = useMemo(() => draftKey(auditId, zoneId), [auditId, zoneId]);

  const isDirty = useMemo(
    () => isDraftDirty(draft, draftInitial),
    [draft, draftInitial],
  );

  // ── Restore any in-progress draft on mount ──
  useEffect(() => {
    let cancelled = false;
    loadDraft<FormDraft>(storageKey).then((saved) => {
      if (cancelled || !saved) return;
      setDraft(saved);
      setDraftInitial(null); // restored drafts are always "dirty"
      toast("Draft restored", {
        description: "Your in-progress finding was recovered.",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // ── Persist (debounced) on any draft change; clear when draft goes away ──
  useEffect(() => {
    if (!draft) {
      void clearDraft(storageKey);
      return;
    }
    const t = setTimeout(() => void saveDraft(storageKey, draft), 300);
    return () => clearTimeout(t);
  }, [draft, storageKey]);

  // ── Warn on tab close / refresh when a dirty draft is open ──
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required by some browsers for the prompt to appear.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Severity buckets in display order (low → high). The config sheet locks
  // this to three; if any are missing for some reason, fall back to a sane
  // default so the form is still operable.
  const severityByEnum = useMemo(() => {
    const map = new Map<Severity, SeverityLevelRow>();
    for (const s of severityLevels) map.set(s.severity, s);
    return map;
  }, [severityLevels]);
  const severityOrder = useMemo<Severity[]>(
    () =>
      [...severityLevels]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => s.severity),
    [severityLevels],
  );

  // Group quick-picks by section for the chip layout. Memoized so we don't
  // rebuild it on every render.
  const quickPicksBySection = useMemo(() => {
    const acc: Record<string, QuickPickRow[]> = {};
    for (const q of quickPicks) {
      (acc[q.section] ??= []).push(q);
    }
    return acc;
  }, [quickPicks]);

  // Categories for the custom builder (deduped from component_types).
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of componentTypes) {
      if (!seen.has(c.category)) {
        seen.add(c.category);
        out.push(c.category);
      }
    }
    return out;
  }, [componentTypes]);

  // ── Quick-pick → draft ──
  function selectQuickPick(qp: QuickPickRow) {
    setCustomOpen(false);
    const d: FormDraft = {
      label: qp.label,
      issueType: qp.issueType,
      componentCategory: qp.componentCategory,
      componentSubtype: qp.componentSubtype,
      componentSize: qp.componentSize,
      solutionAction: qp.defaultSolution,
      costModel: qp.defaultCostModel,
      unitOfMeasure: qp.defaultUom,
      severity: qp.defaultSeverity,
      quantity: 1,
      notes: "",
      photoUrls: [],
      pinLat: null,
      pinLng: null,
      pinSource: null,
      pinPlacedAt: null,
    };
    setDraft(d);
    setDraftInitial(d);
  }

  // ── Save the draft (POST + optimistic insert) ──
  // Returns true if the save succeeded, false otherwise. Callers that chain
  // navigation (the "Save & continue" branch of the unsaved-changes sheet)
  // need to know whether to proceed.
  async function saveCurrentDraft(): Promise<boolean> {
    if (!draft || saving) return false;
    setSaving(true);
    const optimistic: FindingRow = {
      id: `tmp-${crypto.randomUUID()}`,
      issueType: draft.issueType,
      componentCategory: draft.componentCategory,
      componentSubtype: draft.componentSubtype,
      componentSize: draft.componentSize,
      severity: draft.severity,
      solutionAction: draft.solutionAction,
      quantity: draft.quantity,
      unitOfMeasure: draft.unitOfMeasure,
      description: draft.label,
      notes: draft.notes || null,
      photoUrls: draft.photoUrls,
      pinLat: draft.pinLat,
      pinLng: draft.pinLng,
      pinSource: draft.pinSource,
      pinPlacedAt: draft.pinPlacedAt,
    };
    setFindings((f) => [optimistic, ...f]);
    const postedDraft = draft;
    setDraft(null);
    setDraftInitial(null);
    void clearDraft(storageKey);

    const res = await fetch("/api/findings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auditId,
        systemId,
        zoneId,
        issueType: optimistic.issueType,
        componentCategory: optimistic.componentCategory,
        componentSubtype: optimistic.componentSubtype,
        componentSize: optimistic.componentSize,
        severity: optimistic.severity,
        solutionAction: optimistic.solutionAction,
        costModel: postedDraft.costModel,
        quantity: optimistic.quantity,
        unitOfMeasure: optimistic.unitOfMeasure,
        description: optimistic.description,
        notes: optimistic.notes,
        photoUrls: optimistic.photoUrls,
        pinLat: optimistic.pinLat,
        pinLng: optimistic.pinLng,
        pinSource: optimistic.pinSource,
        pinPlacedAt: optimistic.pinPlacedAt,
      }),
    });
    if (!res.ok) {
      setFindings((f) => f.filter((x) => x.id !== optimistic.id));
      toast.error("Failed to save finding");
      setSaving(false);
      // Restore the draft so the user doesn't lose their work on a network blip.
      setDraft(postedDraft);
      setDraftInitial(null);
      return false;
    }
    const saved = (await res.json()) as { id: string };
    setFindings((f) =>
      f.map((x) => (x.id === optimistic.id ? { ...x, id: saved.id } : x)),
    );
    setSaving(false);
    toast.success("Finding added");
    if (sitePlan) {
      setPinPromptFindingId(saved.id);
    } else {
      router.refresh();
    }
    return true;
  }

  function discardDraft() {
    setDraft(null);
    setDraftInitial(null);
    void clearDraft(storageKey);
  }

  // ── Delete a finding (optimistic) ──
  function deleteFinding(id: string) {
    const previous = findings;
    setFindings((f) => f.filter((x) => x.id !== id));
    startTransition(async () => {
      const res = await fetch(`/api/findings/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setFindings(previous);
        toast.error("Failed to delete");
        return;
      }
      router.refresh();
    });
  }

  // ── Mark zone complete + jump to next ──
  function doCompleteZone() {
    startTransition(async () => {
      const res = await fetch(`/api/zones/${zoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
      if (!res.ok) {
        toast.error("Failed to complete zone");
        return;
      }
      // Find the next un-completed zone (ignoring the current one).
      const idx = navItems.findIndex((n) => n.id === zoneId);
      const next =
        navItems.slice(idx + 1).find((n) => !n.completed) ??
        navItems.slice(0, idx).find((n) => !n.completed);
      if (next) {
        router.push(`/audits/${auditId}/zones/${next.id}`);
      } else {
        router.push(`/audits/${auditId}`);
      }
      router.refresh();
    });
  }

  function goToAuditHub() {
    router.push(`/audits/${auditId}`);
  }

  // Entry points for the two navigation buttons in the bottom bar. If there's
  // a dirty draft, we intercept and let the unsaved-changes sheet decide
  // whether to save/discard/cancel before proceeding.
  function handleCompleteAndNext() {
    if (isDirty) {
      setConfirmIntent("complete-next");
      return;
    }
    doCompleteZone();
  }

  function handleDone() {
    if (isDirty) {
      setConfirmIntent("done");
      return;
    }
    goToAuditHub();
  }

  function runIntent(intent: "complete-next" | "done") {
    if (intent === "complete-next") doCompleteZone();
    else goToAuditHub();
  }

  async function onConfirmSave() {
    const intent = confirmIntent;
    if (!intent) return;
    const ok = await saveCurrentDraft();
    setConfirmIntent(null);
    if (ok) runIntent(intent);
  }

  function onConfirmDiscard() {
    const intent = confirmIntent;
    discardDraft();
    setConfirmIntent(null);
    if (intent) runIntent(intent);
  }

  function onConfirmCancel() {
    setConfirmIntent(null);
  }

  function confirmPin(x: number, y: number) {
    if (!pinPromptFindingId || !sitePlan) return;
    const findingId = pinPromptFindingId;
    setPinPromptFindingId(null);
    setShowPicker(false);
    startTransition(async () => {
      await fetch(`/api/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sitePlanX: x,
          sitePlanY: y,
          sitePlanFileId: sitePlan.fileId,
        }),
      });
      router.refresh();
    });
  }

  function skipPin() {
    setPinPromptFindingId(null);
    setShowPicker(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Site plan picker overlay ── */}
      {showPicker && sitePlan && (
        <SitePlanPicker
          renderUrl={sitePlan.renderUrl}
          width={sitePlan.width}
          height={sitePlan.height}
          existingPins={sitePlan.existingPins}
          onConfirm={confirmPin}
          onSkip={skipPin}
        />
      )}

      {/* ── Pin prompt after saving a finding ── */}
      {pinPromptFindingId && !showPicker && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <Card className="mx-4 w-full max-w-sm">
            <CardContent className="flex flex-col items-center gap-4 py-6">
              <p className="text-center text-base font-medium">
                Mark this finding on the site plan?
              </p>
              <div className="flex w-full gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 flex-1"
                  onClick={skipPin}
                >
                  Skip
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="h-12 flex-1"
                  onClick={() => setShowPicker(true)}
                >
                  Mark Location
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Zone {zoneNumber}
            {zoneName && <span className="ml-2 text-base font-normal text-muted-foreground">{zoneName}</span>}
          </h1>
          <p className="text-xs text-muted-foreground">
            {zoneType} · {findings.length}{" "}
            {findings.length === 1 ? "finding" : "findings"}
            {completed && " · ✓ complete"}
          </p>
        </div>
      </div>

      {/* ── Pill bar nav ── */}
      <ZoneNavBar
        items={navItems}
        currentZoneId={zoneId}
        auditId={auditId}
      />

      {/* ── Draft panel (open when a quick-pick is tapped or custom built) ── */}
      {draft ? (
        <DraftPanel
          draft={draft}
          setDraft={setDraft}
          onSave={() => void saveCurrentDraft()}
          onCancel={discardDraft}
          pending={pending || saving}
          severityOrder={severityOrder}
          severityByEnum={severityByEnum}
          propertyId={propertyId}
          propertyName={propertyName}
          propertyLat={propertyLat}
          propertyLng={propertyLng}
          zoneNumber={zoneNumber}
          onOpenPinModal={() => setMapPinOpen(true)}
        />
      ) : (
        <>
          {/* Quick picks */}
          <div className="flex flex-col gap-3">
            {Object.entries(quickPicksBySection).map(([section, items]) => (
              <div key={section}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {items.map((qp) => (
                    <button
                      key={qp.id}
                      type="button"
                      onClick={() => selectQuickPick(qp)}
                      className="min-h-11 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium shadow-sm transition-colors hover:border-primary hover:bg-primary/5 active:bg-primary/10 dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Custom finding builder */}
          <div>
            <Button
              type="button"
              variant={customOpen ? "default" : "outline"}
              size="lg"
              className="h-11 w-full"
              onClick={() => setCustomOpen((o) => !o)}
            >
              {customOpen ? "Cancel custom finding" : "+ Custom finding"}
            </Button>
            {customOpen && (
              <CustomBuilder
                categories={categories}
                componentTypes={componentTypes}
                onPick={(d) => {
                  setCustomOpen(false);
                  setDraft(d);
                  setDraftInitial(d);
                }}
              />
            )}
          </div>
        </>
      )}

      {/* ── Running findings list ── */}
      {findings.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Findings on this zone
          </h3>
          <div className="flex flex-col gap-2">
            {findings.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                severityByEnum={severityByEnum}
                onDelete={() => deleteFinding(f.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom action bar ── */}
      <div className="sticky bottom-0 -mx-4 mt-4 flex gap-2 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/95">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 flex-1"
          onClick={handleDone}
          disabled={pending}
        >
          Done
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-12 flex-1"
          onClick={handleCompleteAndNext}
          disabled={pending}
        >
          Complete &amp; next →
        </Button>
      </div>

      {/* ── Unsaved-changes confirm sheet ── */}
      {confirmIntent && (
        <UnsavedChangesSheet
          pending={saving || pending}
          onSave={onConfirmSave}
          onDiscard={onConfirmDiscard}
          onCancel={onConfirmCancel}
        />
      )}

      {/* ── Satellite pin modal ── */}
      {mapPinOpen && draft && propertyLat !== null && propertyLng !== null && (
        <SatellitePinModal
          propertyCenter={{ lat: propertyLat, lng: propertyLng }}
          initialPin={
            draft.pinLat !== null && draft.pinLng !== null
              ? { lat: draft.pinLat, lng: draft.pinLng }
              : null
          }
          onCancel={() => setMapPinOpen(false)}
          onSave={(coords: LatLng) => {
            setDraft({
              ...draft,
              pinLat: coords.lat,
              pinLng: coords.lng,
              pinSource: "map",
              pinPlacedAt: new Date().toISOString(),
            });
            setMapPinOpen(false);
          }}
          // GPS fallback link is wired in the next commit. Until then the
          // modal just hides it (undefined → no link rendered).
        />
      )}
    </div>
  );
}

function UnsavedChangesSheet({
  pending,
  onSave,
  onDiscard,
  onCancel,
}: {
  pending: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-title"
    >
      <Card className="m-0 w-full max-w-md rounded-b-none sm:m-4 sm:rounded-xl">
        <CardContent className="flex flex-col gap-4 py-6">
          <div>
            <h2
              id="unsaved-changes-title"
              className="text-lg font-semibold"
            >
              You have unsaved changes
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Save this finding before leaving the zone, or discard it.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              className="h-12 w-full"
              onClick={onSave}
              disabled={pending}
            >
              Save finding
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 w-full"
              onClick={onDiscard}
              disabled={pending}
            >
              Discard
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-12 w-full"
              onClick={onCancel}
              disabled={pending}
            >
              Keep editing
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ZoneNavBar({
  items,
  currentZoneId,
  auditId,
}: {
  items: ZoneNavItem[];
  currentZoneId: string;
  auditId: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
      {items.map((z) => {
        const active = z.id === currentZoneId;
        return (
          <Link
            key={z.id}
            href={`/audits/${auditId}/zones/${z.id}`}
            className={`flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border px-3 text-sm font-medium transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : z.completed
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-zinc-300 bg-white text-foreground dark:border-zinc-700 dark:bg-zinc-900"
            }`}
          >
            <span className="tabular-nums">{z.zoneNumber}</span>
            {z.completed && !active && <span className="ml-1">✓</span>}
            {z.findingCount > 0 && !z.completed && (
              <span className="ml-1 text-xs opacity-70">·{z.findingCount}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function DraftPanel({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending,
  severityOrder,
  severityByEnum,
  propertyId,
  propertyName,
  propertyLat,
  propertyLng,
  zoneNumber,
  onOpenPinModal,
}: {
  draft: FormDraft;
  setDraft: (d: FormDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
  severityOrder: Severity[];
  severityByEnum: Map<Severity, SeverityLevelRow>;
  propertyId: string;
  propertyName: string;
  propertyLat: number | null;
  propertyLng: number | null;
  zoneNumber: number;
  onOpenPinModal: () => void;
}) {
  return (
    <Card className="border-primary/30 ring-2 ring-primary/20">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {draft.componentCategory}
            </div>
            <div className="text-lg font-semibold">{draft.label}</div>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onCancel}
            aria-label="Cancel"
          >
            ✕
          </Button>
        </div>

        {/* Severity */}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Severity
          </div>
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${severityOrder.length || 3}, minmax(0, 1fr))`,
            }}
          >
            {severityOrder.map((s) => {
              const level = severityByEnum.get(s);
              if (!level) return null;
              return (
                <SeverityButton
                  key={s}
                  level={level}
                  selected={draft.severity === s}
                  onClick={() => setDraft({ ...draft, severity: s })}
                />
              );
            })}
          </div>
        </div>

        {/* Quantity */}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quantity ({draft.unitOfMeasure})
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setDraft({ ...draft, quantity: Math.max(1, draft.quantity - 1) })
              }
              className="h-12 w-12 rounded-lg border border-zinc-300 text-2xl font-semibold dark:border-zinc-700"
            >
              −
            </button>
            <input
              type="number"
              value={draft.quantity}
              onChange={(e) =>
                setDraft({ ...draft, quantity: Math.max(1, Number(e.target.value) || 1) })
              }
              className="h-12 w-20 rounded-lg border border-zinc-300 text-center text-xl font-semibold tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="button"
              onClick={() => setDraft({ ...draft, quantity: draft.quantity + 1 })}
              className="h-12 w-12 rounded-lg border border-zinc-300 text-2xl font-semibold dark:border-zinc-700"
            >
              +
            </button>
          </div>
        </div>

        {/* Photo */}
        <PhotoButton
          urls={draft.photoUrls}
          onChange={(urls) => setDraft({ ...draft, photoUrls: urls })}
          propertyId={propertyId}
          propertyName={propertyName}
          zoneNumber={zoneNumber}
        />

        {/* Notes */}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes (optional)
          </div>
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Anything the estimator should know"
            rows={2}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        {/* Location pin */}
        <LocationRow
          draft={draft}
          setDraft={setDraft}
          propertyLat={propertyLat}
          propertyLng={propertyLng}
          onOpenPinModal={onOpenPinModal}
        />

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 flex-1"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-12 flex-1 text-base"
            onClick={onSave}
            disabled={pending}
          >
            Save Finding
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LocationRow({
  draft,
  setDraft,
  propertyLat,
  propertyLng,
  onOpenPinModal,
}: {
  draft: FormDraft;
  setDraft: (d: FormDraft) => void;
  propertyLat: number | null;
  propertyLng: number | null;
  onOpenPinModal: () => void;
}) {
  const hasPin = draft.pinLat !== null && draft.pinLng !== null;
  const canMap = propertyLat !== null && propertyLng !== null;

  function removePin() {
    setDraft({
      ...draft,
      pinLat: null,
      pinLng: null,
      pinSource: null,
      pinPlacedAt: null,
    });
  }

  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Location
      </div>
      {hasPin ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <MapPin className="h-4 w-4" />
            Pinned
            <span className="text-xs font-normal text-emerald-600/80 dark:text-emerald-400/70">
              · {draft.pinSource === "gps" ? "GPS" : "Map"}
            </span>
          </span>
          <button
            type="button"
            onClick={onOpenPinModal}
            disabled={!canMap}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={removePin}
            className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenPinModal}
          disabled={!canMap}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium shadow-sm transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          aria-label="Drop pin"
        >
          <MapPin className="h-4 w-4" />
          Drop pin
        </button>
      )}
      {!canMap && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Property needs lat/lng to use the satellite map.
        </p>
      )}
    </div>
  );
}

function SeverityButton({
  level,
  selected,
  onClick,
}: {
  level: SeverityLevelRow;
  selected: boolean;
  onClick: () => void;
}) {
  // Color comes from the org's config sheet (hex). Tailwind can't generate
  // utility classes for runtime values, so we tint the background and ring
  // inline. ~18% alpha for the fill keeps the text readable on light + dark.
  const tint = `${level.color}2E`;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        backgroundColor: tint,
        borderColor: selected ? level.color : undefined,
        boxShadow: selected ? `0 0 0 2px ${level.color}` : undefined,
      }}
      className="flex h-14 flex-col items-center justify-center rounded-lg border border-zinc-200 text-sm font-semibold dark:border-zinc-800"
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: level.color }}
        aria-hidden
      />
      <span className="mt-1">{level.label ?? level.name}</span>
    </button>
  );
}

function PhotoButton({
  urls,
  onChange,
  propertyId,
  propertyName,
  zoneNumber,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  propertyId: string;
  propertyName: string;
  zoneNumber: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      const auditDate = new Date().toISOString().slice(0, 10);
      for (const rawFile of Array.from(files)) {
        const file = await compressImage(rawFile);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("propertyId", propertyId);
        fd.append("propertyName", propertyName);
        fd.append("zoneNumber", String(zoneNumber));
        fd.append("auditDate", auditDate);
        const res = await fetch("/api/audit-photos", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          toast.error("Upload failed");
          continue;
        }
        const json = (await res.json()) as { url: string };
        uploaded.push(json.url);
      }
      onChange([...urls, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Photo
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <div className="flex flex-wrap gap-2">
        {urls.map((u) => (
          <div
            key={u}
            className="relative h-16 w-16 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="Finding" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(urls.filter((x) => x !== u))}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1.5 text-xs text-white"
              aria-label="Remove photo"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 text-xs text-muted-foreground hover:bg-muted dark:border-zinc-700"
        >
          {uploading ? "…" : <>📷<br />Add</>}
        </button>
      </div>
    </div>
  );
}

function CustomBuilder({
  categories,
  componentTypes,
  onPick,
}: {
  categories: string[];
  componentTypes: ComponentTypeRow[];
  onPick: (draft: FormDraft) => void;
}) {
  const [stage, setStage] = useState<"category" | "component" | "size" | "issue">(
    "category",
  );
  const [category, setCategory] = useState<string | null>(null);
  const [component, setComponent] = useState<ComponentTypeRow | null>(null);
  const [size, setSize] = useState<string | null>(null);

  const componentsInCategory = useMemo(
    () => componentTypes.filter((c) => c.category === category),
    [componentTypes, category],
  );

  return (
    <Card className="mt-3 border-dashed">
      <CardContent className="flex flex-col gap-3">
        {stage === "category" && (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              1. Component category
            </div>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCategory(c);
                    setStage("component");
                  }}
                  className="min-h-14 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium hover:border-primary hover:bg-primary/5 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {c}
                </button>
              ))}
            </div>
          </>
        )}

        {stage === "component" && category && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                2. Component — {category}
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => setStage("category")}
              >
                back
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {componentsInCategory.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setComponent(c);
                    setStage(c.subtypes.length > 0 ? "size" : "issue");
                  }}
                  className="min-h-14 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium hover:border-primary hover:bg-primary/5 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </>
        )}

        {stage === "size" && component && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                3. Size — {component.name}
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => setStage("component")}
              >
                back
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {component.subtypes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSize(s);
                    setStage("issue");
                  }}
                  className="min-h-11 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium hover:border-primary hover:bg-primary/5 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSize(null);
                  setStage("issue");
                }}
                className="min-h-11 rounded-full border border-zinc-300 bg-white px-4 text-sm text-muted-foreground hover:bg-muted dark:border-zinc-700 dark:bg-zinc-900"
              >
                skip
              </button>
            </div>
          </>
        )}

        {stage === "issue" && component && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {component.subtypes.length > 0 ? "4." : "3."} Deficiency
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() =>
                  setStage(component.subtypes.length > 0 ? "size" : "component")
                }
              >
                back
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ISSUE_LABELS) as IssueType[]).map((issue) => (
                <button
                  key={issue}
                  type="button"
                  onClick={() => {
                    onPick({
                      label: `${component.name}${size ? ` ${size}` : ""} — ${ISSUE_LABELS[issue]}`,
                      issueType: issue,
                      componentCategory: category!,
                      componentSubtype: component.name,
                      componentSize: size,
                      solutionAction: DEFAULT_SOLUTION_BY_ISSUE[issue],
                      costModel: "time_materials",
                      unitOfMeasure: "ea",
                      severity: issue === "incorrect_placement" || issue === "maladjusted" ? "medium" : "high",
                      quantity: 1,
                      notes: "",
                      photoUrls: [],
                      pinLat: null,
                      pinLng: null,
                      pinSource: null,
                      pinPlacedAt: null,
                    });
                    // Reset for the next custom build.
                    setStage("category");
                    setCategory(null);
                    setComponent(null);
                    setSize(null);
                  }}
                  className="min-h-11 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium hover:border-primary hover:bg-primary/5 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {ISSUE_LABELS[issue]}
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FindingCard({
  finding,
  severityByEnum,
  onDelete,
}: {
  finding: FindingRow;
  severityByEnum: Map<Severity, SeverityLevelRow>;
  onDelete: () => void;
}) {
  const level = severityByEnum.get(finding.severity);
  const description =
    finding.description ??
    `${finding.componentSubtype ?? finding.componentCategory}${
      finding.componentSize ? ` ${finding.componentSize}` : ""
    } — ${ISSUE_LABELS[finding.issueType]}`;
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        {finding.photoUrls.length > 0 && (
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={finding.photoUrls[0]}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{description}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
              style={
                level
                  ? { backgroundColor: `${level.color}2E`, color: level.color }
                  : undefined
              }
            >
              {level?.name ?? finding.severity}
            </span>
            <span className="tabular-nums">
              qty {finding.quantity ?? 1} {finding.unitOfMeasure}
            </span>
            <span>· {finding.solutionAction}</span>
            {finding.pinLat !== null && finding.pinLng !== null && (
              <span
                className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400"
                title={`Pinned · ${finding.pinSource === "gps" ? "GPS" : "Map"}`}
              >
                <MapPin className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="Delete finding"
        >
          ✕
        </button>
      </CardContent>
    </Card>
  );
}
