"use client";

// "Download for offline use" action on the property detail page.
// Fetches the offline bundle and writes it into IndexedDB so the
// auditor can work this property without signal.

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Download, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadPropertyForOffline } from "@/lib/offline/sync";
import { offlineDb } from "@/lib/offline/db";
import { formatDate } from "@/lib/format";

// Short "2 hours ago" / "3 days ago" formatter — format.ts rounds to
// whole days, which is too coarse for the downloaded-at label on
// freshly-synced properties. Kept inline because it's the only place
// we need hour-resolution relative time.
function formatOfflineAge(d: Date): string {
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return formatDate(d);
}

export function OfflineDownloadButton({ propertyId }: { propertyId: string }) {
  // Live subscription to the Dexie row — when the download completes,
  // the button re-renders with the "Offline copy: …" label without
  // needing manual state plumbing.
  const row = useLiveQuery(
    () => offlineDb.properties.get(propertyId),
    [propertyId],
  );
  const [busy, setBusy] = useState(false);
  // The spec allows an imprecise progress indicator. We show a simple
  // "Downloading…" state; a future fetch-streaming enhancement can
  // plug finer progress into this same slot.
  const [, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function onDownload() {
    if (busy) return;
    setBusy(true);
    try {
      await downloadPropertyForOffline(propertyId);
      toast.success("Offline copy saved", {
        description: "Audits, zones, and findings cached on this device.",
      });
    } catch (e) {
      toast.error("Download failed", {
        description: e instanceof Error ? e.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  }

  const downloadedAt = row?.downloadedAt;
  const label = downloadedAt
    ? `Offline copy: ${formatOfflineAge(downloadedAt)}`
    : "Download for offline use";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={downloadedAt ? "outline" : "default"}
        size="sm"
        onClick={onDownload}
        disabled={busy}
        className="gap-2"
        aria-label={downloadedAt ? "Refresh offline copy" : "Download for offline use"}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : downloadedAt ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {busy ? "Downloading…" : downloadedAt ? "Refresh offline copy" : "Download for offline use"}
      </Button>
      {downloadedAt && !busy && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
    </div>
  );
}
