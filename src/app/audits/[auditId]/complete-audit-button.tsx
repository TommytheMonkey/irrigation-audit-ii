"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  clearAllDraftsForAudit,
  listAuditDraftKeys,
} from "@/lib/finding-draft";

// Marks the audit complete and forwards to the summary screen. A
// confirmation dialog is shown first — tapping "Complete Audit" by
// accident on a mobile list view shouldn't silently lock the record.
// We also check localStorage for in-progress zone drafts and warn about
// them before committing, then purge all drafts on success.
export function CompleteAuditButton({
  auditId,
  disabled,
}: {
  auditId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Computed when we open the dialog so the warning copy reflects the
  // state at the moment of the tap. Zero-cost when the dialog is closed.
  const [draftCount, setDraftCount] = useState(0);

  function openConfirm() {
    setDraftCount(listAuditDraftKeys(auditId).length);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    if (pending) return;
    setConfirmOpen(false);
  }

  function complete() {
    startTransition(async () => {
      const res = await fetch(`/api/audits/${auditId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) {
        toast.error("Failed to complete audit", {
          description: "Check your connection and try again.",
          action: { label: "Retry", onClick: () => complete() },
        });
        return;
      }
      clearAllDraftsForAudit(auditId);
      setConfirmOpen(false);
      toast.success("Audit completed");
      router.push(`/audits/${auditId}/summary`);
    });
  }

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="h-12 w-full text-base"
        onClick={openConfirm}
        disabled={disabled || pending}
      >
        Complete Audit
      </Button>
      {confirmOpen && (
        <ConfirmDialog
          pending={pending}
          draftCount={draftCount}
          onConfirm={complete}
          onCancel={closeConfirm}
        />
      )}
    </>
  );
}

function ConfirmDialog({
  pending,
  draftCount,
  onConfirm,
  onCancel,
}: {
  pending: boolean;
  draftCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Close on Escape — nicer on desktop, harmless on mobile where the
  // keyboard is not present.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, pending]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-audit-title"
    >
      <Card className="m-0 w-full max-w-md rounded-b-none sm:m-4 sm:rounded-xl">
        <CardContent className="flex flex-col gap-4 py-6">
          <div>
            <h2
              id="complete-audit-title"
              className="text-lg font-semibold"
            >
              Complete this audit?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You won&rsquo;t be able to add more findings after completing.
            </p>
            {draftCount > 0 && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                Heads up: you have{" "}
                <span className="font-semibold">
                  {draftCount} unsaved finding{draftCount === 1 ? "" : "s"}
                </span>{" "}
                in progress. Those drafts will be discarded.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              className="h-12 w-full"
              onClick={onConfirm}
              disabled={pending}
            >
              {pending ? "Completing…" : "Complete audit"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 w-full"
              onClick={onCancel}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
