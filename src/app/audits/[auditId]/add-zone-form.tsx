"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const ZONE_TYPES = ["spray", "drip", "rotor", "bubbler", "other"] as const;
type ZoneType = (typeof ZONE_TYPES)[number];

// Inline "add zone" form. Renders below the zone list. Submits to
// POST /api/audits/[auditId]/zones, then router.refresh() rehydrates the
// server component above. Resets after a successful save so the auditor
// can rapid-fire multiple zones without leaving the page.
export function AddZoneForm({
  auditId,
  systemId,
  nextZoneNumber,
}: {
  auditId: string;
  systemId: string;
  nextZoneNumber: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [zoneNumber, setZoneNumber] = useState<number>(nextZoneNumber);
  const [zoneName, setZoneName] = useState("");
  const [zoneType, setZoneType] = useState<ZoneType>("spray");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch(`/api/audits/${auditId}/zones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemId,
          zoneNumber,
          zoneName: zoneName.trim() || undefined,
          zoneType,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to add zone");
        return;
      }
      toast.success(`Zone ${zoneNumber} added`);
      // Reset for the next entry; bump the number for convenience.
      setZoneNumber(zoneNumber + 1);
      setZoneName("");
      setZoneType("spray");
      router.refresh();
    });
  }

  return (
    <Card className="border-dashed">
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="w-20">
              <label className="text-xs text-muted-foreground">#</label>
              <Input
                type="number"
                min={1}
                value={zoneNumber}
                onChange={(e) => setZoneNumber(Number(e.target.value))}
                className="h-11 text-base tabular-nums"
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">
                Name (optional)
              </label>
              <Input
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="Front turf"
                className="h-11 text-base"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ZONE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setZoneType(t)}
                className={`h-9 rounded-full border px-3 text-sm capitalize transition-colors ${
                  zoneType === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-zinc-300 bg-background hover:bg-muted dark:border-zinc-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <Button
            type="submit"
            size="lg"
            variant="outline"
            className="h-11 w-full"
            disabled={pending}
          >
            {pending ? "Adding…" : "+ Add Zone"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
