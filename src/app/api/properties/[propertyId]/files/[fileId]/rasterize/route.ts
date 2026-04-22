import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";
import imageSize from "image-size";

export const runtime = "nodejs";

// POST /api/properties/[propertyId]/files/[fileId]/rasterize
// Receives a PNG blob from client-side PDF rasterization (pdf.js in browser).
// multipart/form-data: file (the rasterized PNG)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ propertyId: string; fileId: string }> },
) {
  const { propertyId, fileId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const pf = await db.propertyFile.findFirst({
    where: {
      id: fileId,
      propertyId,
      property: { orgId: auth.user.orgId },
      isFullSitePlan: true,
    },
    select: { id: true },
  });
  if (!pf) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const dims = imageSize(buf);
  if (!dims.width || !dims.height) {
    return NextResponse.json(
      { error: "invalid_image", message: "Could not read image dimensions." },
      { status: 400 },
    );
  }

  const blobKey = `site-plans/${fileId}-render.png`;
  const blob = await put(blobKey, buf, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: false,
  });

  await db.sitePlanRender.upsert({
    where: { propertyFileId: fileId },
    create: {
      propertyFileId: fileId,
      renderUrl: blob.url,
      renderPathname: blob.pathname,
      width: dims.width,
      height: dims.height,
      status: "READY",
    },
    update: {
      renderUrl: blob.url,
      renderPathname: blob.pathname,
      width: dims.width,
      height: dims.height,
      status: "READY",
    },
  });

  return NextResponse.json({
    ok: true,
    renderUrl: blob.url,
    width: dims.width,
    height: dims.height,
  });
}
