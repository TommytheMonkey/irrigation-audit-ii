"use client";

// GPS capture sheet — shown when the auditor taps "Drop pin" while
// offline, or picks "Use my current location" from inside the
// satellite modal.
//
// UX notes:
//   - This is the killer feature, not a reluctant fallback. The tech
//     is standing on the broken head; one tap is more accurate than
//     panning a satellite photo. Layout leads with the capture
//     button, not with an apology.
//   - Error state keeps the user on the sheet (Try again / Cancel).
//   - A secondary "Save without a pin" exit lets the tech bail
//     without losing draft work.

import { useEffect } from "react";
import { MapPin, Crosshair, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGeolocation } from "@/lib/hooks/use-geolocation";

export function GpsCaptureSheet({
  isOffline,
  onSave,
  onCancel,
}: {
  /** True when the auditor ended up here because satellite wasn't available. */
  isOffline: boolean;
  onSave: (coords: { lat: number; lng: number; accuracy: number }) => void;
  onCancel: () => void;
}) {
  const { state, capture, reset } = useGeolocation();

  // Auto-commit on success so the tech doesn't need a second tap. We
  // also toast so the accuracy reading is visible even though the
  // sheet has closed.
  useEffect(() => {
    if (state.status === "success") {
      const meters = Math.round(state.coords.accuracy);
      onSave(state.coords);
      toast.success(`Location captured · ±${meters}m accuracy`);
    }
  }, [state, onSave]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gps-sheet-title"
    >
      <Card className="m-0 w-full max-w-md rounded-b-none sm:m-4 sm:rounded-xl">
        <CardContent className="flex flex-col gap-5 py-6">
          <div>
            <h2
              id="gps-sheet-title"
              className="text-lg font-semibold"
            >
              {isOffline
                ? "Use GPS to pin this finding"
                : "Use your current location"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isOffline
                ? "Satellite imagery needs an internet connection. Your phone's GPS works fine offline — tap the button to capture your current coords."
                : "Faster than panning the map, and typically accurate to within a few meters."}
            </p>
          </div>

          {state.status === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              className="h-14 w-full gap-2 text-base"
              onClick={() => capture()}
              disabled={state.status === "pending"}
            >
              {state.status === "pending" ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Locating…
                </>
              ) : state.status === "error" ? (
                <>
                  <Crosshair className="h-5 w-5" />
                  Try again
                </>
              ) : (
                <>
                  <MapPin className="h-5 w-5" />
                  Use my current location
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-12 w-full"
              onClick={() => {
                reset();
                onCancel();
              }}
              disabled={state.status === "pending"}
            >
              {isOffline ? "Save finding without a pin" : "Cancel"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
