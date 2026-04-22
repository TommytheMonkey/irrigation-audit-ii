import { NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";
import type { FileCategory } from "@prisma/client";
import imageSize from "image-size";

export const runtime = "nodejs";
export const maxDuration = 30;

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
    select: { id: true, blobUrl: true, mimeType: true, blobPathname: true },
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

  // When marking as full site plan, create/update SitePlanRender
  if (body.isFullSitePlan === true) {
    try {
      await ensureSitePlanRender(fileId, file.blobUrl, file.mimeType);
    } catch (e) {
      console.error("[files/patch] site plan render failed:", e);
      // Non-fatal: the file is still marked as full site plan, but the
      // render might be missing. The UI degrades gracefully.
    }
  }

  // When unmarking, clean up the render
  if (body.isFullSitePlan === false) {
    const existing = await db.sitePlanRender.findUnique({
      where: { propertyFileId: fileId },
    });
    if (existing) {
      try {
        await del(existing.renderUrl);
      } catch {
        // best-effort
      }
      await db.sitePlanRender.delete({ where: { id: existing.id } });
    }
  }

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

// ── Site plan render ────────────────────────────────────────────────────────

async function ensureSitePlanRender(
  propertyFileId: string,
  blobUrl: string,
  mimeType: string,
) {
  // Delete any existing render for this file
  const existing = await db.sitePlanRender.findUnique({
    where: { propertyFileId },
  });
  if (existing) {
    try {
      if (existing.renderUrl !== blobUrl) await del(existing.renderUrl);
    } catch {
      // best-effort
    }
    await db.sitePlanRender.delete({ where: { id: existing.id } });
  }

  if (mimeType.startsWith("image/")) {
    // For images: probe dimensions and point to the original
    const res = await fetch(blobUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    const dims = imageSize(buf);
    if (!dims.width || !dims.height) {
      throw new Error("Could not determine image dimensions");
    }

    await db.sitePlanRender.create({
      data: {
        propertyFileId,
        renderUrl: blobUrl,
        renderPathname: "",
        width: dims.width,
        height: dims.height,
        status: "READY",
      },
    });
    return;
  }

  if (mimeType === "application/pdf") {
    // PDF rasterization: set status to PENDING — the client will rasterize
    // via pdf.js in the browser and upload the result via a separate endpoint.
    await db.sitePlanRender.create({
      data: {
        propertyFileId,
        renderUrl: "",
        renderPathname: "",
        width: 0,
        height: 0,
        status: "PENDING",
      },
    });
    return;
  }

  throw new Error(`Unsupported mime type for site plan: ${mimeType}`);
}
