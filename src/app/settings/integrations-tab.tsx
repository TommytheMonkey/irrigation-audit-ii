"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PROPERTY_FIELDS,
  type ColumnMapping,
  type MondayColumn,
} from "@/lib/monday-types";
import { LogoField } from "@/components/logo-field";
import { MagicFill, type MagicFillResult } from "@/components/magic-fill";
import { DriveFolderPicker } from "./drive-folder-picker";
import { PropertyImportCard } from "./property-import-card";

// Settings → Integrations tab. Three cards: Monday.com, Google, Branding.
// The Monday card has two modes: when not connected it shows the cred form;
// when connected it shows last-synced + property count and exposes Sync Now /
// Edit Mapping / Disconnect actions. The Google card just shows the
// connected email + a Connect/Disconnect button — the OAuth dance lives at
// /api/auth/google.
export function IntegrationsTab({
  initial,
  canEdit,
}: {
  initial: {
    hasMondayKey: boolean;
    mondayBoardId: string | null;
    mondayMapping: Record<string, string> | null;
    propertiesSyncedAt: string | null;
    propertyCount: number;
    googleConnectedEmail: string | null;
    googleDriveFolderId: string | null;
    brandingPrimary: string | null;
    brandingSecondary: string | null;
    brandingLogo: string | null;
    brandingFont: string | null;
  };
  canEdit: boolean;
}) {
  const router = useRouter();

  // Monday card state
  const mondayConnected =
    initial.hasMondayKey && initial.mondayBoardId !== null;
  const [editingCreds, setEditingCreds] = useState(!mondayConnected);
  const [apiKey, setApiKey] = useState("");
  const [boardId, setBoardId] = useState(initial.mondayBoardId ?? "");
  const [mondayPending, mondayStart] = useTransition();
  const [syncPending, syncStart] = useTransition();
  const [geocodePending, geocodeStart] = useTransition();
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingColumns, setMappingColumns] = useState<MondayColumn[] | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(
    (initial.mondayMapping as ColumnMapping | null) ?? {},
  );
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingPending, mappingStart] = useTransition();

  // Branding card state
  const [logo, setLogo] = useState(initial.brandingLogo ?? "");
  const [primary, setPrimary] = useState(initial.brandingPrimary ?? "#1e6f3a");
  const [secondary, setSecondary] = useState(initial.brandingSecondary ?? "#0f3d20");
  const [font, setFont] = useState(initial.brandingFont ?? "");
  const [brandPending, brandStart] = useTransition();

  // Google card state
  const [googlePending, googleStart] = useTransition();

  function saveMonday(e: React.FormEvent) {
    e.preventDefault();
    mondayStart(async () => {
      const res = await fetch("/api/settings/monday", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey ? apiKey : undefined,
          boardId: boardId || null,
        }),
      });
      if (!res.ok) {
        toast.error("Couldn't save Monday integration.");
        return;
      }
      toast.success("Saved.");
      setApiKey("");
      setEditingCreds(false);
      router.refresh();
    });
  }

  function geocodeNow() {
    geocodeStart(async () => {
      const res = await fetch("/api/properties/backfill-geocode", {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as
        | { ok: true; total: number; geocoded: number; skipped: number }
        | { error: string; message?: string };
      if (!res.ok || !("ok" in data)) {
        toast.error("Geocode failed.");
        return;
      }
      if (data.total === 0) {
        toast.message("All properties already have coordinates.");
      } else {
        toast.success(
          `Geocoded ${data.geocoded} of ${data.total} properties${data.skipped ? ` (${data.skipped} skipped — bad address)` : ""}.`,
        );
      }
      router.refresh();
    });
  }

  function syncNow() {
    syncStart(async () => {
      const res = await fetch("/api/properties/sync", { method: "POST" });
      const data = (await res.json()) as
        | {
            ok: true;
            summary: { total: number; created: number; updated: number; removed: number };
          }
        | { error: string; message: string };
      if (!res.ok || !("ok" in data)) {
        const msg = "message" in data ? data.message : "Sync failed.";
        toast.error(msg);
        return;
      }
      const { total, created, updated, removed } = data.summary;
      toast.success(
        `Synced ${total} properties — ${created} new, ${updated} updated${removed ? `, ${removed} removed` : ""}.`,
      );
      router.refresh();
    });
  }

  async function openMappingEditor() {
    setMappingOpen(true);
    if (mappingColumns) return; // already loaded
    setMappingLoading(true);
    try {
      const res = await fetch("/api/monday/columns");
      const data = (await res.json()) as
        | { columns: MondayColumn[]; suggested: ColumnMapping }
        | { error: string; message: string };
      if (!res.ok || !("columns" in data)) {
        const msg = "message" in data ? data.message : "Couldn't load columns.";
        toast.error(msg);
        setMappingOpen(false);
        return;
      }
      setMappingColumns(data.columns);
      // Fill empty slots from auto-match without overwriting saved picks.
      setMapping((current) => ({ ...data.suggested, ...current }));
    } catch {
      toast.error("Couldn't reach the server.");
      setMappingOpen(false);
    } finally {
      setMappingLoading(false);
    }
  }

  function saveMapping() {
    mappingStart(async () => {
      const res = await fetch("/api/monday/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        toast.error(data.message ?? "Couldn't save column mapping.");
        return;
      }
      toast.success("Mapping saved.");
      setMappingOpen(false);
      router.refresh();
    });
  }

  function disconnectMonday() {
    if (!confirm("Disconnect Monday.com? Existing synced properties stay but won't refresh.")) {
      return;
    }
    mondayStart(async () => {
      const res = await fetch("/api/settings/monday", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: null, boardId: null }),
      });
      if (!res.ok) {
        toast.error("Couldn't disconnect Monday.");
        return;
      }
      toast.success("Disconnected.");
      setApiKey("");
      setBoardId("");
      setEditingCreds(true);
      router.refresh();
    });
  }

  function saveBranding(e: React.FormEvent) {
    e.preventDefault();
    brandStart(async () => {
      const res = await fetch("/api/settings/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryLogoUrl: logo || null,
          brandColorPrimary: primary || null,
          brandColorSecondary: secondary || null,
          fontFamily: font || null,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(json.message ?? "Couldn't save branding.");
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  function googleConnect() {
    window.location.href = `/api/auth/google?next=${encodeURIComponent("/settings?tab=integrations")}`;
  }

  function googleDisconnect() {
    googleStart(async () => {
      const res = await fetch("/api/settings/google", { method: "DELETE" });
      if (!res.ok) {
        toast.error("Couldn't disconnect Google.");
        return;
      }
      toast.success("Disconnected.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Manual property import (xlsx or Google Sheet) */}
      <PropertyImportCard canEdit={canEdit} />

      {/* Monday */}
      <Card>
        <CardHeader>
          <CardTitle>Monday.com</CardTitle>
          <CardDescription>
            Pulls properties from your Monday board. Sync mirrors items into
            this app — Monday stays the source of truth for property records.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {mondayConnected && !editingCreds && (
            <>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-emerald-900 dark:text-emerald-200">
                    Connected · board {initial.mondayBoardId}
                  </div>
                  <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100">
                    {initial.propertyCount} {initial.propertyCount === 1 ? "property" : "properties"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-300/90">
                  {initial.propertiesSyncedAt
                    ? `Last synced ${formatRelative(initial.propertiesSyncedAt)}`
                    : "Never synced — click Sync now to pull properties."}
                </div>
              </div>

              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="lg"
                    className="h-11"
                    onClick={syncNow}
                    disabled={syncPending}
                  >
                    {syncPending ? "Syncing…" : "Sync now"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-11"
                    onClick={geocodeNow}
                    disabled={geocodePending}
                    title="Geocode any properties missing map coordinates"
                  >
                    {geocodePending ? "Geocoding…" : "Geocode now"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-11"
                    onClick={openMappingEditor}
                    disabled={mappingPending}
                  >
                    Edit column mapping
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="h-11"
                    onClick={() => setEditingCreds(true)}
                  >
                    Edit credentials
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="h-11 text-destructive hover:text-destructive"
                    onClick={disconnectMonday}
                    disabled={mondayPending}
                  >
                    Disconnect
                  </Button>
                </div>
              )}

              {mappingOpen && (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                  {mappingLoading || !mappingColumns ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Loading columns from Monday…
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {PROPERTY_FIELDS.map((field) => (
                        <div
                          key={field.id}
                          className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
                        >
                          <Label
                            htmlFor={`settings-map-${field.id}`}
                            className="sm:w-44 sm:shrink-0"
                          >
                            {field.label}
                          </Label>
                          <select
                            id={`settings-map-${field.id}`}
                            value={mapping[field.id] ?? ""}
                            onChange={(e) =>
                              setMapping((m) => ({
                                ...m,
                                [field.id]: e.target.value || undefined,
                              }))
                            }
                            disabled={!canEdit}
                            className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                          >
                            <option value="">— Skip —</option>
                            {mappingColumns.map((col) => (
                              <option key={col.id} value={col.id}>
                                {col.title} ({col.type})
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                      {canEdit && (
                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="lg"
                            className="h-11"
                            onClick={() => setMappingOpen(false)}
                            disabled={mappingPending}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="lg"
                            className="h-11"
                            onClick={saveMapping}
                            disabled={mappingPending}
                          >
                            {mappingPending ? "Saving…" : "Save mapping"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {(!mondayConnected || editingCreds) && (
            <form onSubmit={saveMonday} className="flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="monday-key">API key</Label>
                  {initial.hasMondayKey && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Set
                    </span>
                  )}
                </div>
                <Input
                  id="monday-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={initial.hasMondayKey ? "Leave blank to keep current" : "eyJhbGc..."}
                  autoComplete="off"
                  disabled={!canEdit}
                  className="mt-1.5 h-11"
                />
              </div>
              <div>
                <Label htmlFor="board-id">Board ID</Label>
                <Input
                  id="board-id"
                  value={boardId}
                  onChange={(e) => setBoardId(e.target.value)}
                  placeholder="1234567890"
                  inputMode="numeric"
                  disabled={!canEdit}
                  className="mt-1.5 h-11"
                />
              </div>
              {canEdit && (
                <div className="flex justify-end gap-2">
                  {mondayConnected && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      className="h-11"
                      onClick={() => {
                        setEditingCreds(false);
                        setApiKey("");
                        setBoardId(initial.mondayBoardId ?? "");
                      }}
                      disabled={mondayPending}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" size="lg" className="h-11" disabled={mondayPending}>
                    {mondayPending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      {/* Google */}
      <Card>
        <CardHeader>
          <CardTitle>Google Drive &amp; Sheets</CardTitle>
          <CardDescription>
            Powers audit → estimator handoff via Sheets and stores the config
            sheet that drives the audit UI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initial.googleConnectedEmail ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                Connected as <strong>{initial.googleConnectedEmail}</strong>
              </div>
              <DriveFolderPicker
                currentFolderId={initial.googleDriveFolderId ?? null}
                canEdit={canEdit}
              />
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-11 self-start"
                  onClick={googleDisconnect}
                  disabled={googlePending}
                >
                  {googlePending ? "Disconnecting…" : "Disconnect"}
                </Button>
              )}
            </div>
          ) : canEdit ? (
            <Button type="button" size="lg" className="h-11" onClick={googleConnect}>
              Connect Google account
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Not connected.</p>
          )}
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Logo + colors + font for PDF reports and the in-app header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveBranding} className="flex flex-col gap-4">
            {canEdit && (
              <MagicFill
                disabled={brandPending}
                onFilled={(r: MagicFillResult) => {
                  if (r.logoUrl) setLogo(r.logoUrl);
                  if (r.primaryColor) setPrimary(r.primaryColor);
                  if (r.secondaryColor) setSecondary(r.secondaryColor);
                  if (r.fontFamily) setFont(r.fontFamily);
                }}
              />
            )}
            <LogoField value={logo} onChange={setLogo} disabled={!canEdit || brandPending} />
            <div className="grid grid-cols-2 gap-3">
              <ColorField
                id="brand-primary"
                label="Primary"
                value={primary}
                onChange={setPrimary}
                disabled={!canEdit}
              />
              <ColorField
                id="brand-secondary"
                label="Secondary"
                value={secondary}
                onChange={setSecondary}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="font">Font family</Label>
              <Input
                id="font"
                value={font}
                onChange={(e) => setFont(e.target.value)}
                placeholder="Inter, Helvetica, sans-serif"
                disabled={!canEdit}
                className="mt-1.5 h-11"
              />
            </div>
            {canEdit && (
              <div className="flex justify-end">
                <Button type="submit" size="lg" className="h-11" disabled={brandPending}>
                  {brandPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Tiny relative formatter — avoids pulling date-fns in just for one label.
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  const days = Math.round(diffSec / 86400);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ColorField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5 flex gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-11 w-12 cursor-pointer rounded-md border border-zinc-300 disabled:cursor-not-allowed dark:border-zinc-700"
          aria-label={`${label} swatch`}
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#1e6f3a"
          disabled={disabled}
          className="h-11 flex-1 font-mono text-sm"
        />
      </div>
    </div>
  );
}
