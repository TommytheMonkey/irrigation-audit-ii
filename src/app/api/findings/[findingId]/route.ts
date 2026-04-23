import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { PinSource } from "@prisma/client";

// PATCH /api/findings/[findingId] — update pin locations.
// Two independent pin systems live on a finding:
//   - sitePlan{X,Y,FileId}: the legacy PDF site-plan pin.
//   - pin{Lat,Lng,Source,PlacedAt}: the new real-world map/GPS pin.
// Any subset of fields may be sent; undefined-means-leave-alone,
// null-means-clear. Clients that want to remove the real-world pin
// should send all four pin* fields as null in one request.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ findingId: string }> },
) {
  const { findingId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const finding = await db.auditFinding.findFirst({
    where: { id: findingId, audit: { orgId: user.orgId } },
    select: { id: true },
  });
  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    sitePlanX?: number | null;
    sitePlanY?: number | null;
    sitePlanFileId?: string | null;
    pinLat?: number | null;
    pinLng?: number | null;
    pinSource?: PinSource | null;
    pinPlacedAt?: string | null;
  };

  const updated = await db.auditFinding.update({
    where: { id: findingId },
    data: {
      ...(body.sitePlanX !== undefined && { sitePlanX: body.sitePlanX }),
      ...(body.sitePlanY !== undefined && { sitePlanY: body.sitePlanY }),
      ...(body.sitePlanFileId !== undefined && {
        sitePlanFileId: body.sitePlanFileId,
      }),
      ...(body.pinLat !== undefined && { pinLat: body.pinLat }),
      ...(body.pinLng !== undefined && { pinLng: body.pinLng }),
      ...(body.pinSource !== undefined && { pinSource: body.pinSource }),
      ...(body.pinPlacedAt !== undefined && {
        pinPlacedAt: body.pinPlacedAt ? new Date(body.pinPlacedAt) : null,
      }),
    },
  });
  return NextResponse.json(updated);
}

// DELETE /api/findings/[findingId] — remove a finding.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ findingId: string }> },
) {
  const { findingId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const finding = await db.auditFinding.findFirst({
    where: { id: findingId, audit: { orgId: user.orgId } },
    select: { id: true },
  });
  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }
  await db.auditFinding.delete({ where: { id: findingId } });
  return NextResponse.json({ ok: true });
}
