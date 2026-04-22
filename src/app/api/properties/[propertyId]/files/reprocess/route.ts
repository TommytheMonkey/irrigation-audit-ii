import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";
import imageSize from "image-size";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const pf = await db.propertyFile.findFirst({
    where: { propertyId, isFullSitePlan: true, property: { orgId: auth.user.orgId } },
    include: { sitePlanRender: true },
  });

  if (!pf) {
    return NextResponse.json({ error: "no_site_plan" }, { status: 404 });
  }

  if (pf.sitePlanRender?.status === "READY") {
    return NextResponse.json({ ok: true, message: "already ready" });
  }

  if (pf.mimeType !== "application/pdf") {
    return NextResponse.json({ error: "not_pdf" }, { status: 400 });
  }

  try {
    const { pdf } = await import("pdf-to-img");
    const pdfRes = await fetch(pf.blobUrl);
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    const doc = await pdf(pdfBuf, { scale: 2 });
    const page1 = await doc.getPage(1);

    const renderKey = `orgs/${auth.user.orgId}/site-plans/${propertyId}-render.png`;
    const renderBlob = await put(renderKey, page1, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
    });

    const dims = imageSize(page1);
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
