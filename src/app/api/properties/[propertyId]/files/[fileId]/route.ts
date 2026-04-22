import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";
import type { FileCategory } from "@prisma/client";

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set([
  "DRAWINGS",
  "CUTSHEET",
  "MANUAL",
  "PHOTO",
  "OTHER",
]);

// PATCH /api/properties/[propertyId]/files/[fileId]
// Body: { category?, isFullSitePlan? }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ propertyId: string; fileId: string }> },
) {
  const { propertyId, fileId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const file = await db.propertyFile.findFirst({
    where: { id: fileId, propertyId, property: { orgId: auth.user.orgId } },
    select: { id: true },
  });
  if (!file) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    category?: string;
    isFullSitePlan?: boolean;
  };

  // Enforce at most one full site plan per property
  if (body.isFullSitePlan === true) {
    await db.propertyFile.updateMany({
      where: { propertyId, isFullSitePlan: true, id: { not: fileId } },
      data: { isFullSitePlan: false },
    });
  }

  const updated = await db.propertyFile.update({
    where: { id: fileId },
    data: {
      ...(body.category !== undefined &&
        VALID_CATEGORIES.has(body.category) && {
          category: body.category as FileCategory,
        }),
      ...(body.isFullSitePlan !== undefined && {
        isFullSitePlan: body.isFullSitePlan,
      }),
    },
  });
  return NextResponse.json(updated);
}

// DELETE /api/properties/[propertyId]/files/[fileId]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ propertyId: string; fileId: string }> },
) {
  const { propertyId, fileId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const file = await db.propertyFile.findFirst({
    where: { id: fileId, propertyId, property: { orgId: auth.user.orgId } },
    select: { id: true, blobUrl: true },
  });
  if (!file) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    await del(file.blobUrl);
  } catch (e) {
    console.warn("[property-files/delete] blob del failed (non-fatal):", e);
  }

  await db.propertyFile.delete({ where: { id: fileId } });
  return NextResponse.json({ ok: true });
}
