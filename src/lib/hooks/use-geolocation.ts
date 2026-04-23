// Canonical client-side geolocation hook.
//
// Wraps navigator.geolocation.getCurrentPosition into a small state
// machine so callers don't have to juggle the imperative API. Used by
// the pin-drop GPS fallback today; future callers (e.g. property
// geocoding from the field) should reuse this rather than rolling
// their own.
//
// Intentional choices:
//   - enableHighAccuracy: true. A rough IP-based fix is useless for
//     field work — we need the real GPS fix. Cost is a second or two
//     while the radio warms up.
//   - timeout: 10_000 ms. Modern phones typically resolve in ~2–5s
//     outdoors; 10s is "something is wrong, bail." Shorter starves a
//     cold-started GPS; longer frustrates the tech.
//   - maximumAge: 0. Don't serve a cached fix; the tech may have
//     walked to the actual finding since the last permission grant.
//   - Messages are user-facing copy, not stack traces — the
//     consuming sheet shows them inline.

"use client";

import { useCallback, useRef, useState } from "react";

export type GeoCoords = {
  lat: number;
  lng: number;
  /** Accuracy radius in meters (one-sigma). */
  accuracy: number;
};

export type GeoState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; coords: GeoCoords; capturedAt: Date }
  | { status: "error"; error: string; code: number | null };

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 0,
};

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle" });
  // Guard against setState-after-unmount when the hook unmounts mid-
  // capture (tech closes the sheet). We don't need full cancellation
  // since getCurrentPosition can't actually be cancelled.
  const cancelled = useRef(false);

  const capture = useCallback(
    (options: PositionOptions = DEFAULT_OPTIONS) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setState({
          status: "error",
          error: "Geolocation isn't available on this device.",
          code: null,
        });
        return;
      }
      cancelled.current = false;
      setState({ status: "pending" });
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled.current) return;
          setState({
            status: "success",
            coords: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            },
            capturedAt: new Date(pos.timestamp),
          });
        },
        (err) => {
          if (cancelled.current) return;
          setState({
            status: "error",
            error: humanizeGeoError(err),
            code: err.code,
          });
        },
        options,
      );
    },
    [],
  );

  const reset = useCallback(() => {
    cancelled.current = true;
    setState({ status: "idle" });
  }, []);

  return { state, capture, reset };
}

export function humanizeGeoError(err: GeolocationPositionError): string {
  // Using the runtime constants rather than hard-coded numbers — they
  // happen to be 1/2/3 but the spec treats them as opaque.
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission was denied. Enable location access for this site in your browser settings.";
    case err.POSITION_UNAVAILABLE:
      return "GPS signal isn't available right now. Try again with a clearer view of the sky.";
    case err.TIMEOUT:
      return "GPS timed out. Try again — a cold-started GPS can take a few seconds to settle.";
    default:
      return err.message || "Couldn't get your location. Try again.";
  }
}
