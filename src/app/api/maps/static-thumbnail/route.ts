import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/maps/static-thumbnail?findingId=<id>
//
// Server-side proxy for the Google Static Maps API. Returns a small
// hybrid-satellite thumbnail centered on the finding's pin.
//
// Why a proxy instead of calling Static Maps directly from <img>:
//   1. The Static Maps API's referrer restrictions are flaky for
//      embedded images (some clients strip the Referer header). The
//      server key is IP-restricted instead, which is reliable.
//   2. Keeps the server key server-side — we don't expose it to the
//      browser.
//   3. Lets us enforce org-scoped access before ever hitting Google's
//      quota.
//
// Caching:
//   - Responses are identical given the same finding pin coords, and
//     pins aren't editable after save in v1 (add/delete only). Safe
//     to serve with `immutable` + 7-day max-age so Vercel's CDN does
//     the heavy lifting and we don't burn quota on repeated views of
//     the zone screen.
//   - If the pin-edit flow ever lands, bust by appending
//     `&v=<pinPlacedAt>` on the client.
//
// Env:
//   GOOGLE_MAPS_SERVER_API_KEY must be set. Different key from the
//   browser-side NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — this one is
//   IP-restricted, that one is HTTP-referrer-restricted.

const STATIC_MAPS_ENDPOINT = "https://maps.googleapis.com/maps/api/staticmap";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const findingId = url.searchParams.get("findingId");
  if (!findingId) {
    return NextResponse.json(
      { error: "findingId is required" },
      { status: 400 },
    );
  }

  // Org-scoped lookup — 404 hides existence from other tenants.
  const finding = await db.auditFinding.findFirst({
    where: { id: findingId, audit: { orgId: user.orgId } },
    select: { pinLat: true, pinLng: true },
  });
  if (!finding) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (finding.pinLat === null || finding.pinLng === null) {
    return NextResponse.json(
      { error: "finding has no pin" },
      { status: 422 },
    );
  }

  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "maps_server_key_not_configured" },
      { status: 500 },
    );
  }

  // Static Maps parameters. scale=2 for retina; the UI displays this
  // at ~80×60 so 120×90 × 2 = 240×180 actual pixels.
  const center = `${finding.pinLat},${finding.pinLng}`;
  const params = new URLSearchParams({
    center,
    zoom: "20",
    size: "120x90",
    scale: "2",
    maptype: "hybrid",
    markers: `color:red|${center}`,
    key,
  });

  const upstream = await fetch(`${STATIC_MAPS_ENDPOINT}?${params.toString()}`, {
    // Let Next cache at the route level too — `immutable` below covers
    // the CDN/browser side.
    cache: "force-cache",
  });
  if (!upstream.ok) {
    const body = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: "upstream_error", status: upstream.status, detail: body },
      { status: 502 },
    );
  }

  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "image/png",
      "Content-Length": String(buf.byteLength),
      // 7 days, immutable — see caching note above.
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
