// Server-side wrapper around the Google Geocoding API. Used by the Monday
// sync to resolve a property's address to lat/lng so we can plot it on the
// map view. One call per property that's new or whose address changed.
//
// Keeps the key in NEXT_PUBLIC_GOOGLE_MAPS_API_KEY so we share one credential
// for both geocoding (server) and Maps JS (client). The key is restricted by
// HTTP referrer + API in Google Cloud Console — server-side geocoding
// requests send a Referer Google recognizes via the project's own IPs.

type GeocodeResult = {
  lat: number;
  lng: number;
};

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export function buildAddressQuery(
  address: string | null,
  city: string | null,
  state: string | null,
  zip: string | null,
): string | null {
  const parts = [address, city, state, zip].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  if (parts.length === 0) return null;
  return parts.join(", ");
}

/**
 * Geocode a free-form US address. Returns null on any failure (no address,
 * API error, ZERO_RESULTS). Callers should treat null as "don't have coords
 * for this property yet" rather than surfacing an error.
 */
export async function geocodeAddress(
  address: string | null,
  city: string | null,
  state: string | null,
  zip: string | null,
): Promise<GeocodeResult | null> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    console.warn("[geocode] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set");
    return null;
  }
  const query = buildAddressQuery(address, city, state, zip);
  if (!query) return null;

  const url = `${GEOCODE_URL}?address=${encodeURIComponent(query)}&key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[geocode] HTTP ${res.status} for "${query}"`);
      return null;
    }
    const json = (await res.json()) as {
      status: string;
      results: { geometry: { location: { lat: number; lng: number } } }[];
      error_message?: string;
    };
    if (json.status === "OK" && json.results[0]) {
      return json.results[0].geometry.location;
    }
    if (json.status !== "ZERO_RESULTS") {
      console.error(
        `[geocode] ${json.status} for "${query}": ${json.error_message ?? ""}`,
      );
    }
    return null;
  } catch (e) {
    console.error("[geocode] fetch threw:", e);
    return null;
  }
}
