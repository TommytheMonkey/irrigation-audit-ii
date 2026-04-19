"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MagicFillResult = {
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFamily: string | null;
};

export function MagicFill({
  onFilled,
  disabled,
}: {
  onFilled: (r: MagicFillResult) => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();

  function run() {
    if (!url.trim()) return;
    start(async () => {
      const res = await fetch("/api/settings/branding/magic-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | { ok: true; data: MagicFillResult }
        | { error: string; message: string };

      if (!res.ok || !("ok" in data)) {
        const msg =
          "message" in data
            ? data.message
            : "Magic Fill failed. Enter the branding manually.";
        toast.error(msg);
        return;
      }

      onFilled(data.data);
      const filled = Object.values(data.data).filter(Boolean).length;
      if (filled === 0) {
        toast.message("Couldn't detect any brand signals — fill in manually.");
      } else {
        toast.success(`Filled ${filled} field${filled === 1 ? "" : "s"} from the site.`);
      }
      setUrl("");
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-zinc-300 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-900/30">
      <Label htmlFor="magic-fill-url" className="text-sm">
        Magic Fill from website
      </Label>
      <p className="text-xs text-muted-foreground">
        Paste your company website and we&apos;ll grab the logo, colors, and font.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="magic-fill-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              run();
            }
          }}
          placeholder="https://yourcompany.com"
          type="url"
          inputMode="url"
          disabled={disabled || pending}
          className="h-11 flex-1"
        />
        <Button
          type="button"
          size="lg"
          variant="secondary"
          className="h-11"
          onClick={run}
          disabled={disabled || pending || !url.trim()}
        >
          {pending ? "Fetching…" : "Magic Fill"}
        </Button>
      </div>
    </div>
  );
}
