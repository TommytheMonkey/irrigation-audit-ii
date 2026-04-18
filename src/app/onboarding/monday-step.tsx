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

// Step 2: Monday.com integration. Two-phase form:
//   Phase "creds" → user enters API key + board id, we save them.
//   Phase "mapping" → we fetch the board's columns, auto-match property
//     fields, let the user override, then save mapping + run initial sync.
//
// The phases are tracked in component state (not the URL) so the user can
// step back without losing the half-entered key. The API key is encrypted
// server-side before write — we never echo it back, so the field is
// "write-only" and the existing-key state is shown via a small badge.
type Phase = "creds" | "mapping";

export function MondayStep({
  initial,
  nextHref,
  backHref,
}: {
  initial: {
    hasApiKey: boolean;
    boardId: string | null;
    mapping: Record<string, string> | null;
  };
  nextHref: string;
  backHref: string;
}) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [boardId, setBoardId] = useState(initial.boardId ?? "");
  // If creds + mapping are already saved, jump straight to the mapping
  // editor — that way revisiting onboarding doesn't make the user retype.
  const [phase, setPhase] = useState<Phase>(
    initial.hasApiKey && initial.boardId ? "mapping" : "creds",
  );
  const [columns, setColumns] = useState<MondayColumn[] | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(
    (initial.mapping as ColumnMapping | null) ?? {},
  );
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [pending, startTransition] = useTransition();

  async function loadColumns(forBoardId: string) {
    setLoadingColumns(true);
    try {
      const res = await fetch(
        `/api/monday/columns?boardId=${encodeURIComponent(forBoardId)}`,
      );
      const data = (await res.json()) as
        | { columns: MondayColumn[]; suggested: ColumnMapping }
        | { error: string; message: string };
      if (!res.ok || !("columns" in data)) {
        const msg = "message" in data ? data.message : "Couldn't load columns.";
        toast.error(msg);
        return false;
      }
      setColumns(data.columns);
      // Only fill empty slots from auto-match — don't overwrite user picks
      // if they're revisiting this step.
      setMapping((current) => {
        const merged: ColumnMapping = { ...data.suggested, ...current };
        return merged;
      });
      return true;
    } catch {
      toast.error("Couldn't reach the server.");
      return false;
    } finally {
      setLoadingColumns(false);
    }
  }

  function saveCreds(e: React.FormEvent) {
    e.preventDefault();
    if (!boardId.trim()) {
      toast.error("Board ID is required.");
      return;
    }
    if (!initial.hasApiKey && !apiKey.trim()) {
      toast.error("API key is required.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/settings/monday", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey ? apiKey : undefined,
          boardId: boardId.trim(),
        }),
      });
      if (!res.ok) {
        toast.error("Couldn't save Monday.com integration.");
        return;
      }
      const ok = await loadColumns(boardId.trim());
      if (ok) setPhase("mapping");
    });
  }

  function saveMappingAndSync(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      // Persist mapping (server validates against the live board).
      const saveRes = await fetch("/api/monday/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      });
      const saveData = (await saveRes.json()) as { error?: string; message?: string };
      if (!saveRes.ok) {
        toast.error(saveData.message ?? "Couldn't save column mapping.");
        return;
      }

      // Kick off the initial sync. We always show the result so the user
      // sees how many properties came across before moving on.
      const syncRes = await fetch("/api/properties/sync", { method: "POST" });
      const syncData = (await syncRes.json()) as
        | { ok: true; summary: { total: number; created: number; updated: number; removed: number } }
        | { error: string; message: string };

      if (!syncRes.ok || !("ok" in syncData)) {
        const msg =
          "message" in syncData ? syncData.message : "Sync failed.";
        toast.error(msg);
        return;
      }
      toast.success(
        `Synced ${syncData.summary.total} properties (${syncData.summary.created} new).`,
      );
      router.push(nextHref);
    });
  }

  // Lazy-load columns when revisiting onboarding with creds + mapping
  // already saved. Without this, the mapping phase would render with no
  // column dropdowns until the user did something.
  if (phase === "mapping" && !columns && !loadingColumns) {
    void loadColumns(boardId);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monday.com integration</CardTitle>
        <CardDescription>
          {phase === "creds" ? (
            <>
              Connect your properties board so audits sync back to Monday. You
              can find your API key under{" "}
              <a
                href="https://monday.com/developers"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                monday.com/developers
              </a>
              . The board ID is the number in the board URL.
            </>
          ) : (
            <>
              Match your Monday columns to property fields. We&apos;ve
              pre-filled the obvious ones — adjust anything that looks wrong.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {phase === "creds" ? (
          <form onSubmit={saveCreds} className="flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="monday-key">API key</Label>
                {initial.hasApiKey && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    Already set
                  </span>
                )}
              </div>
              <Input
                id="monday-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={initial.hasApiKey ? "Leave blank to keep current" : "eyJhbGc..."}
                autoComplete="off"
                className="mt-1.5 h-11"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Stored encrypted at rest. We never show it back to you.
              </p>
            </div>
            <div>
              <Label htmlFor="board-id">Board ID</Label>
              <Input
                id="board-id"
                value={boardId}
                onChange={(e) => setBoardId(e.target.value)}
                placeholder="1234567890"
                inputMode="numeric"
                className="mt-1.5 h-11"
              />
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-11"
                onClick={() => router.push(backHref)}
                disabled={pending}
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="h-11"
                  onClick={() => router.push(nextHref)}
                  disabled={pending}
                >
                  Skip
                </Button>
                <Button type="submit" size="lg" className="h-11" disabled={pending}>
                  {pending ? "Loading…" : "Continue"}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={saveMappingAndSync} className="flex flex-col gap-4">
            {loadingColumns || !columns ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Loading columns from Monday…
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  {PROPERTY_FIELDS.map((field) => (
                    <div
                      key={field.id}
                      className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <Label
                        htmlFor={`map-${field.id}`}
                        className="sm:w-44 sm:shrink-0"
                      >
                        {field.label}
                      </Label>
                      <select
                        id={`map-${field.id}`}
                        value={mapping[field.id] ?? ""}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            [field.id]: e.target.value || undefined,
                          }))
                        }
                        className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">— Skip —</option>
                        {columns.map((col) => (
                          <option key={col.id} value={col.id}>
                            {col.title} ({col.type})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  We&apos;ll pull every item on board <strong>{boardId}</strong>{" "}
                  and create one property for each. Re-running sync later will
                  update existing properties in place.
                </p>
              </>
            )}
            <div className="flex justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-11"
                onClick={() => setPhase("creds")}
                disabled={pending}
              >
                Edit credentials
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="h-11"
                  onClick={() => router.push(nextHref)}
                  disabled={pending}
                >
                  Skip
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  className="h-11"
                  disabled={pending || loadingColumns || !columns}
                >
                  {pending ? "Syncing…" : "Save & sync properties"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
