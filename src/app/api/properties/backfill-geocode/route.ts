import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { geocodeAddress } from "@/lib/geocode";

// Admin-only one-shot backfill. Iterates every property in the org that
// doesn't yet have lat/lng and geocodes it. Safe to re-run — already-geocoded
// rows are skipped.
//
// Runs sequentially to stay well under Google's rate limit; a full org of
// ~500 properties takes ~50s. Long-running but well under Vercel's 60s
// default hobby function timeout.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const pending = await db.property.findMany({
    where: {
      orgId: user.orgId,
      syncStatus: { not: "removed" },
      OR: [{ latitude: null }, { longitude: null }],
    },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zip: true,
    },
  });

  let geocoded = 0;
  let skipped = 0;
  for (const p of pending) {
    const coords = await geocodeAddress(p.address, p.city, p.state, p.zip);
    if (coords) {
      await db.property.update({
        where: { id: p.id },
        data: {
          latitude: coords.lat,
          longitude: coords.lng,
          geocodedAt: new Date(),
        },
      });
      geocoded++;
    } else {
      skipped++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: pending.length,
    geocoded,
    skipped,
  });
}
