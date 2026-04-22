import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";
import imageSize from "image-size";

export const runtime = "nodejs";

// Accepts a client-rendered PNG of a PDF site plan's first page.
// The client rasterizes the PDF in-browser using pdfjs-dist, then
// POSTs the image here so we can store it and mark the render READY.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const pf = await db.propertyFile.findFirst({
    where: { propertyId, isFullSitePlan: true, property: { orgId: auth.user.orgId } },
    select: { id: true },
  });

  if (!pf) {
    return NextResponse.json({ error: "no_site_plan" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("render");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_render" }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const dims = imageSize(buf);

    const renderKey = `orgs/${auth.user.orgId}/site-plans/${propertyId}-render.png`;
    const renderBlob = await put(renderKey, buf, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
    });

    await db.sitePlanRender.upsert({
      where: { propertyFileId: pf.id },
      create: {
        propertyFileId: pf.id,
        renderUrl: renderBlob.url,
        renderPathname: renderBlob.pathname,
        width: dims.width ?? 0,
        height: dims.height ?? 0,
        status: "READY",
      },
      update: {
        renderUrl: renderBlob.url,
        renderPathname: renderBlob.pathname,
        width: dims.width ?? 0,
        height: dims.height ?? 0,
        status: "READY",
      },
    });

    return NextResponse.json({ ok: true, width: dims.width, height: dims.height });
  } catch (e) {
    console.error("[site-plan/reprocess] failed:", e);
    return NextResponse.json(
      { error: "reprocess_failed", message: String(e) },
      { status: 502 },
    );
  }
}
