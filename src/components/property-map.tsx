"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from "@vis.gl/react-google-maps";
import { Button } from "@/components/ui/button";
import type { PropertyListItem } from "@/app/property-list";

// Map view for the dashboard. Loads Google Maps JS via @vis.gl wrapper, drops
// a marker per property with lat/lng, and auto-fits bounds so every marker is
// visible on first paint.
//
// Properties without coords (backfill not run, geocode failed, no address)
// aren't rendered — we surface a count of those in the empty-state banner so
// the admin knows how many need attention.
const MAP_ID = "irrigation-audit-map";

export function PropertyMap({ properties }: { properties: PropertyListItem[] }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const mappable = useMemo(
    () =>
      properties.filter(
        (p): p is PropertyListItem & { latitude: number; longitude: number } =>
          typeof p.latitude === "number" && typeof p.longitude === "number",
      ),
    [properties],
  );
  const missingCount = properties.length - mappable.length;

  if (!apiKey) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        Map disabled: <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> isn&apos;t set.
      </div>
    );
  }

  if (mappable.length === 0) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
        No properties have coordinates yet.
        {missingCount > 0 && (
          <>
            {" "}
            Run the <strong>Geocode now</strong> button in Settings to populate{" "}
            {missingCount}.
          </>
        )}
      </div>
    );
  }

  return (
    <div className="h-[60vh] min-h-[400px] overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
      <APIProvider apiKey={apiKey}>
        <Map
          mapId={MAP_ID}
          defaultCenter={{ lat: mappable[0].latitude, lng: mappable[0].longitude }}
          defaultZoom={11}
          gestureHandling="greedy"
          disableDefaultUI={false}
          className="h-full w-full"
        >
          <AutoFit mappable={mappable} />
          {mappable.map((p) => (
            <PropertyMarker key={p.id} property={p} />
          ))}
        </Map>
      </APIProvider>
      {missingCount > 0 && (
        <div className="border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {missingCount} {missingCount === 1 ? "property" : "properties"} hidden
          (no coordinates yet).
        </div>
      )}
    </div>
  );
}

function AutoFit({
  mappable,
}: {
  mappable: (PropertyListItem & { latitude: number; longitude: number })[];
}) {
  const map = useMap();
  useMemo(() => {
    if (!map || mappable.length === 0) return;
    if (mappable.length === 1) {
      map.setCenter({ lat: mappable[0].latitude, lng: mappable[0].longitude });
      map.setZoom(13);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const p of mappable) {
      bounds.extend({ lat: p.latitude, lng: p.longitude });
    }
    map.fitBounds(bounds, 64);
  }, [map, mappable]);
  return null;
}

function PropertyMarker({
  property,
}: {
  property: PropertyListItem & { latitude: number; longitude: number };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AdvancedMarker
        position={{ lat: property.latitude, lng: property.longitude }}
        onClick={() => setOpen(true)}
      />
      {open && (
        <InfoWindow
          position={{ lat: property.latitude, lng: property.longitude }}
          onCloseClick={() => setOpen(false)}
          pixelOffset={[0, -36]}
        >
          <div className="flex flex-col gap-1.5 p-1 text-sm text-zinc-900">
            <div className="font-medium">{property.name}</div>
            {property.address && (
              <div className="text-xs text-zinc-600">{property.address}</div>
            )}
            {property.propertyManagerName && (
              <div className="text-xs text-zinc-600">
                PM: {property.propertyManagerName}
              </div>
            )}
            <div className="mt-1 flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/properties/${property.id}`} />}
              >
                View
              </Button>
              <Button
                size="sm"
                render={<Link href={`/audits/new?propertyId=${property.id}`} />}
              >
                Start Audit
              </Button>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}
