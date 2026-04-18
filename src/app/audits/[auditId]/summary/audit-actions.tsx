"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";

// Client island for the audit summary's "Next steps" card. Owns:
//   - Export to Sheets button (and re-export after the first one)
//   - Open in Google Sheets link
//   - Sync Prices button (enabled once a sheet exists)
//   - Generate Report placeholder
//
// All state-changing actions go through API routes; this component only
// holds the in-flight spinners + the latest sheet url returned from export.
// router.refresh() is called after each successful action so the server
// component re-renders with the new audit row.
export function AuditActions({
  auditId,
  initialSheetUrl,
  googleConnected,
  fullyPriced,
}: {
  auditId: string;
  initialSheetUrl: string | null;
  googleConnected: boolean;
  fullyPriced: boolean;
}) {
  const router = useRouter();
  const [sheetUrl, setSheetUrl] = useState<string | null>(initialSheetUrl);
  const [exportPending, exportStart] = useTransition();
  const [syncPending, syncStart] = useTransition();

  function exportSheet() {
    exportStart(async () => {
      const res = await fetch(`/api/audits/${auditId}/export-sheets`, {
        method: "POST",
      });
      const data = (await res.json()) as
        | { ok: true; sheetId: string; sheetUrl: string; mock?: boolean; findingCount: number }
        | { error: string; message: string };
      if (!res.ok || !("ok" in data)) {
        const msg = "message" in data ? data.message : "Export failed.";
        toast.error(msg);
        return;
      }
      setSheetUrl(data.sheetUrl);
      toast.success(
        data.mock
          ? `Mock export created (${data.findingCount} findings).`
          : `Report created in Google Sheets (${data.findingCount} findings).`,
      );
      router.refresh();
    });
  }

  function syncPrices() {
    syncStart(async () => {
      const res = await fetch(`/api/audits/${auditId}/sync-prices`, {
        method: "POST",
      });
      const data = (await res.json()) as
        | {
            ok: true;
            priced: number;
            unpriced: number;
            total: number;
            grandTotal: number;
            unmatched: number[];
            fullyPriced: boolean;
          }
        | { error: string; message: string };
      if (!res.ok || !("ok" in data)) {
        const msg = "message" in data ? data.message : "Sync failed.";
        toast.error(msg);
        return;
      }
      const formatted = formatCurrency(data.grandTotal);
      const unmatchedPart =
        data.unmatched.length > 0
          ? ` · ${data.unmatched.length} row${data.unmatched.length === 1 ? "" : "s"} couldn't be matched`
          : "";
      toast.success(
        `${data.priced} of ${data.total} findings priced (${formatted})${unmatchedPart}.`,
      );
      router.refresh();
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (!googleConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next steps</CardTitle>
          <CardDescription>
            Connect a Google account to export this audit to Sheets for the
            estimator.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            variant="outline"
            size="lg"
            className="h-11"
            render={<Link href="/settings?tab=integrations" />}
          >
            Connect Google in Settings
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Next steps</CardTitle>
        <CardDescription>
          {sheetUrl
            ? "Hand the Sheet to your estimator. When prices are filled in, click Sync to pull them back."
            : "Export this audit to a Google Sheet so the estimator can fill in pricing."}
        </CardDescription>
      </CardHeader>
      {sheetUrl && (
        <CardContent>
          <div className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <div className="font-medium text-emerald-900 dark:text-emerald-200">
              Report ready
            </div>
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all text-xs text-emerald-700 underline dark:text-emerald-300"
            >
              {sheetUrl}
            </a>
          </div>
        </CardContent>
      )}
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="lg"
          className="h-11"
          render={<Link href="/" />}
        >
          Back to dashboard
        </Button>
        {sheetUrl && (
          <Button
            variant="outline"
            size="lg"
            className="h-11"
            render={<a href={sheetUrl} target="_blank" rel="noreferrer" />}
          >
            Open in Google Sheets
          </Button>
        )}
        <Button
          variant={sheetUrl ? "outline" : "default"}
          size="lg"
          className="h-11"
          onClick={exportSheet}
          disabled={exportPending}
        >
          {exportPending
            ? "Creating report…"
            : sheetUrl
            ? "Re-export"
            : "Export to Sheets"}
        </Button>
        <Button
          size="lg"
          className="h-11"
          onClick={syncPrices}
          disabled={!sheetUrl || syncPending}
          title={!sheetUrl ? "Export the audit first" : undefined}
        >
          {syncPending ? "Pulling prices…" : "Sync prices"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-11"
          disabled
          title="Coming in Milestone F"
        >
          Generate PDF
        </Button>
      </CardFooter>
      {fullyPriced && (
        <CardContent>
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            ✓ All findings priced — ready to generate report
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
