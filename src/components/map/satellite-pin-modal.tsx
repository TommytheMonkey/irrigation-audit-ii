"use client";

// Full-screen (mobile) / large dialog (desktop) satellite view for
// dropping a pin on a finding. Primary placement flow is "pan the map,
// tap Place pin here" — a finger covers the screen when tapping
// directly, so crosshair-plus-button is more accurate than raw
// tap-to-place on mobile. We also accept taps and allow dragging the
// marker for folks who want pixel control.
//
// Requires NEXT_PUBLIC_MAPS_API. If the property has no
// geocoded lat/lng, the caller should route to the GPS fallback
// instead (the map would have nowhere to center).

import { useEffect, useRef, useState } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from "@vis.gl/react-google-maps";
import { Button } from "@/components/ui/button";
import { X, Crosshair } from "lucide-react";

export type LatLng = { lat: number; lng: number };

export function SatellitePinModal({
  propertyCenter,
  initialPin,
  onSave,
  onCancel,
  onUseMyLocation,
}: {
  propertyCenter: LatLng;
  initialPin: LatLng | null;
  onSave: (coords: LatLng) => void;
  onCancel: () => void;
  // Rendered as a text link below the map. Commit 4 wires it to the
  // useGeolocation hook; in this commit the parent supplies it.
  onUseMyLocation?: () => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_MAPS_API;

  // The working pin position. Starts at initialPin if editing, else
  // at the property center (the crosshair is over the center).
  const [pin, setPin] = useState<LatLng>(initialPin ?? propertyCenter);
  // Whether the user has meaningfully moved the pin from its initial
  // position. Used to disable "Place pin here" if it's a literal no-op
  // edit (pin + initialPin identical).
  const moved = !initialPin || !latLngEquals(pin, initialPin);

  if (!apiKey) {
    return (
      <MissingKeyDialog onCancel={onCancel} />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black sm:items-center sm:justify-center sm:bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
    >
      <div className="flex w-full flex-col overflow-hidden bg-white dark:bg-zinc-950 sm:h-[85vh] sm:max-w-3xl sm:rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 id="pin-modal-title" className="text-base font-semibold">
              Drop a pin
            </h2>
            <p className="text-xs text-muted-foreground">
              Pan to center the crosshair on the finding, then tap{" "}
              <span className="font-medium">Place pin here</span>.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Map + crosshair overlay */}
        <div className="relative flex-1 bg-zinc-900">
          <APIProvider apiKey={apiKey}>
            <Map
              mapId="pin-drop-map"
              defaultCenter={initialPin ?? propertyCenter}
              defaultZoom={20}
              // Google caps satellite at ~21. 20 is roof-level without
              // the occasional "no imagery" tile.
              maxZoom={22}
              mapTypeId="hybrid"
              gestureHandling="greedy"
              disableDefaultUI={false}
              clickableIcons={false}
              className="h-full w-full"
              onClick={(ev) => {
                // Tap-to-place as a secondary gesture — finger obscures
                // the exact point on mobile, so we don't make this the
                // primary UX, but folks on desktop / tablets with a
                // stylus find it natural.
                if (ev.detail.latLng) {
                  setPin({
                    lat: ev.detail.latLng.lat,
                    lng: ev.detail.latLng.lng,
                  });
                }
              }}
            >
              {/* The working pin marker. Draggable so fine adjustments
                  after placing don't require re-tapping. */}
              <AdvancedMarker
                position={pin}
                draggable
                onDragEnd={(ev) => {
                  if (ev.latLng) {
                    setPin({ lat: ev.latLng.lat(), lng: ev.latLng.lng() });
                  }
                }}
              />
              <CenterSync pin={pin} />
            </Map>
          </APIProvider>

          {/* Crosshair overlay — purely visual, fixed in the viewport
              center. User pans the MAP under the crosshair, then taps
              "Place pin here" which reads the map center as the coord. */}
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden
          >
            <Crosshair className="h-7 w-7 text-primary drop-shadow-md" />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col gap-2 border-t border-border bg-background px-4 py-3">
          {onUseMyLocation && (
            <button
              type="button"
              onClick={onUseMyLocation}
              className="text-sm text-primary underline-offset-2 hover:underline"
            >
              Or use my current location
            </button>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 flex-1"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <PlacePinButton
              pin={pin}
              moved={moved}
              onSave={onSave}
              hasInitial={Boolean(initialPin)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Reads the map's current viewport center into a ref so the "Place pin
// here" button always knows the crosshair's actual lat/lng, not just
// the last tap or drag event. Purely side-effectual — renders nothing.
function CenterSync({ pin }: { pin: LatLng }) {
  const map = useMap();
  const prevPin = useRef(pin);

  useEffect(() => {
    // When the working pin changes (tap/drag), recenter the map so
    // the crosshair aligns. This lets subsequent "Place pin here"
    // taps resolve to the tapped/dragged coord rather than the old
    // center.
    if (!map) return;
    if (latLngEquals(pin, prevPin.current)) return;
    prevPin.current = pin;
    map.panTo(pin);
  }, [map, pin]);

  return null;
}

function PlacePinButton({
  pin,
  moved,
  onSave,
  hasInitial,
}: {
  pin: LatLng;
  moved: boolean;
  onSave: (coords: LatLng) => void;
  hasInitial: boolean;
}) {
  // Grab the latest map center on tap — the crosshair is always at
  // the map center, so that's the source of truth for "Place pin here."
  const map = useMap();
  const commit = () => {
    const center = map?.getCenter();
    const final: LatLng = center
      ? { lat: center.lat(), lng: center.lng() }
      : pin;
    onSave(final);
  };
  return (
    <Button
      type="button"
      size="lg"
      className="h-12 flex-1"
      onClick={commit}
      disabled={hasInitial && !moved}
    >
      Place pin here
    </Button>
  );
}

function MissingKeyDialog({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="max-w-sm rounded-xl bg-background p-5 text-sm">
        <p className="font-semibold">Map unavailable</p>
        <p className="mt-1 text-muted-foreground">
          NEXT_PUBLIC_MAPS_API isn&rsquo;t set. Ask an admin
          to add it in Vercel, then reload.
        </p>
        <Button
          type="button"
          className="mt-4 w-full"
          onClick={onCancel}
        >
          Close
        </Button>
      </div>
    </div>
  );
}

function latLngEquals(a: LatLng, b: LatLng): boolean {
  // Map centers drift by fractions of a meter as the map settles;
  // consider anything within ~5cm the "same" position so we don't
  // flag an untouched pin as "moved" for the disabled-button check.
  return Math.abs(a.lat - b.lat) < 5e-7 && Math.abs(a.lng - b.lng) < 5e-7;
}
