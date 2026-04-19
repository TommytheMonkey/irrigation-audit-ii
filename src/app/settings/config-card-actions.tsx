"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ValidationError } from "@/lib/config-validator";

// Client island for the buttons on the Settings → Config card. The page
// itself is a server component, so any state (validation errors from a
// failed sync, the reset confirmation flag) lives here.
export function ConfigCardActions({
  initialized,
  hasMockFile,
}: {
  initialized: boolean;
  hasMockFile: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<ValidationError[] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  function callRoute(
    path: string,
    successToast: string,
    onOk?: () => void,
  ) {
    setErrors(null);
    startTransition(async () => {
      const res = await fetch(path, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: ValidationError[];
        message?: string;
      };
      if (!res.ok) {
        if (json.error === "validation_failed" && json.errors) {
          setErrors(json.errors);
          toast.error(`Sync failed — ${json.errors.length} validation error${json.errors.length === 1 ? "" : "s"}`);
        } else {
          toast.error(json.message ?? "Request failed");
        }
        return;
      }
      toast.success(successToast);
      onOk?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {!initialized ? (
          <Button
            type="button"
            onClick={() => callRoute("/api/config/initialize", "Config initialized")}
            disabled={pending}
          >
            {pending ? "Initializing…" : "Initialize config"}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              onClick={() => callRoute("/api/config/sync", "Config synced")}
              disabled={pending}
            >
              {pending ? "Syncing…" : "Sync now"}
            </Button>
            {/* The "Open config" button was for the old file-based mock —
                removed now that mock storage lives in a DB column. Real
                sheets get their own "Open in Google Sheets" link above. */}
            {confirmReset ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() =>
                    callRoute("/api/config/reset", "Config reset", () =>
                      setConfirmReset(false),
                    )
                  }
                  disabled={pending}
                >
                  {pending ? "Resetting…" : "Confirm reset"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmReset(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmReset(true)}
                disabled={pending}
              >
                Reset
              </Button>
            )}
          </>
        )}
      </div>

      {errors && errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs dark:border-red-900/40 dark:bg-red-950/30">
          <div className="mb-1 font-semibold text-red-800 dark:text-red-300">
            Validation errors
          </div>
          <ul className="space-y-0.5 text-red-700 dark:text-red-300">
            {errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono">[{e.tab}{e.row ? `:${e.row}` : ""}{e.field ? `.${e.field}` : ""}]</span>{" "}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
