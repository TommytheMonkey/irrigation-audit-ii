import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/properties/[propertyId]/offline-bundle
//
// Returns every server row a field auditor needs to run the property,
// the property's audits, zones, and findings without a network
// connection. Used by the "Download for offline" button on the
// property detail screen; the client writes each collection into the
// matching Dexie store (src/lib/offline/db.ts).
//
// Phase 1 excludes photos — they'd dominate the bundle size and
// Vercel Blob URLs expire, so a snapshot-at-download-time copy is
// stale by the time the auditor hits the field anyway. Photo caching
// lands in Phase 3.
//
// Scope: org-scoped like every other read. Reference tables
// (quickPickFindings, componentTypes, severityLevels) include both
// org-specific rows and the global `orgId = null` defaults; the
// in-zone form needs both to render chips.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Anchor on the property row so we can 404 fast for mistyped URLs
  // and avoid leaking the existence of another tenant's property.
  const property = await db.property.findFirst({
    where: { id: propertyId, orgId: user.orgId },
    include: {
      systems: {
        orderBy: { sortOrder: "asc" },
        include: {
          controllers: { orderBy: { sortOrder: "asc" } },
          waterSources: { orderBy: { sortOrder: "asc" } },
          zones: { orderBy: { zoneNumber: "asc" } },
          parts: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!property) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [audits, quickPickFindings, componentTypes, severityLevels] =
    await Promise.all([
      db.audit.findMany({
        where: { propertyId, orgId: user.orgId },
        orderBy: { startedAt: "desc" },
        include: {
          auditor: { select: { id: true, name: true, email: true } },
          systems: true,
          zones: { orderBy: { zoneNumber: "asc" } },
          findings: true,
        },
      }),
      db.quickPickFinding.findMany({
        where: { OR: [{ orgId: user.orgId }, { orgId: null }] },
        orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
      }),
      db.componentType.findMany({
        where: { OR: [{ orgId: user.orgId }, { orgId: null }] },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      db.severityLevel.findMany({
        where: { OR: [{ orgId: user.orgId }, { orgId: null }] },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

  // Flatten zones + findings so the client can upsert per-store
  // without re-walking the nested audit graph on every read.
  const zones = audits.flatMap((a) => a.zones);
  const findings = audits.flatMap((a) => a.findings);

  return NextResponse.json(
    {
      property,
      audits,
      zones,
      findings,
      quickPickFindings,
      componentTypes,
      severityLevels,
      bundledAt: new Date().toISOString(),
    },
    {
      // Never cache — serving a stale bundle would strand the auditor
      // on outdated quick-picks or missing zones.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
