"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Marks the audit complete and forwards to the summary screen. Disabled
// until at least one zone exists, otherwise the summary would be empty.
export function CompleteAuditButton({
  auditId,
  disabled,
}: {
  auditId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function complete() {
    startTransition(async () => {
      const res = await fetch(`/api/audits/${auditId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) {
        toast.error("Failed to complete audit");
        return;
      }
      router.push(`/audits/${auditId}/summary`);
    });
  }

  return (
    <Button
      type="button"
      size="lg"
      className="h-12 w-full text-base"
      onClick={complete}
      disabled={disabled || pending}
    >
      {pending ? "Saving…" : "Complete Audit"}
    </Button>
  );
}
