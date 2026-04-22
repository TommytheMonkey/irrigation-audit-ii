import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";
import imageSize from "image-size";

export const runtime = "nodejs";

// POST /api/properties/[propertyId]/files/upload
// multipart/form-data: file
// Uploads a site plan image/PDF, creates a PropertyFile with
// isFullSitePlan=true, and auto-creates the SitePlanRender.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const prop = await db.property.findFirst({
    where: { id: propertyId, orgId: auth.user.orgId },
    select: { id: true },
  });
  if (!prop) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  if (!mime.startsWith("image/") && mime !== "application/pdf") {
    return NextResponse.json(
      { error: "invalid_type", message: "Site plan must be an image or PDF." },
      { status: 400 },
    );
  }

  const blobKey = `orgs/${auth.user.orgId}/site-plans/${propertyId}-${file.name}`;

  try {
    const blob = await put(blobKey, file, {
      access: "public",
      contentType: mime,
      addRandomSuffix: false,
    });

    // Clear any existing full site plan on this property
    await db.propertyFile.updateMany({
      where: { propertyId, isFullSitePlan: true },
      data: { isFullSitePlan: false },
    });

    const pf = await db.propertyFile.create({
      data: {
        propertyId,
        uploadedById: auth.user.id,
        fileName: file.name,
        mimeType: mime,
        fileSize: file.size,
        category: "DRAWINGS",
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        isFullSitePlan: true,
      },
    });

    // Auto-create SitePlanRender
    if (mime.startsWith("image/")) {
      const res = await fetch(blob.url);
      const buf = Buffer.from(await res.arrayBuffer());
      const dims = imageSize(buf);
      if (dims.width && dims.height) {
        await db.sitePlanRender.upsert({
          where: { propertyFileId: pf.id },
          create: {
            propertyFileId: pf.id,
            renderUrl: blob.url,
            renderPathname: "",
            width: dims.width,
            height: dims.height,
            status: "READY",
          },
          update: {
            renderUrl: blob.url,
            width: dims.width,
            height: dims.height,
            status: "READY",
          },
        });
      }
    } else {
      // PDF — client-side rasterization needed
      await db.sitePlanRender.upsert({
        where: { propertyFileId: pf.id },
        create: {
          propertyFileId: pf.id,
          renderUrl: "",
          renderPathname: "",
          width: 0,
          height: 0,
          status: "PENDING",
        },
        update: {
          renderUrl: "",
          width: 0,
          height: 0,
          status: "PENDING",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      fileId: pf.id,
      blobUrl: blob.url,
      fileName: pf.fileName,
    });
  } catch (e) {
    console.error("[site-plan/upload] failed:", e);
    return NextResponse.json(
      { error: "upload_failed", message: "Site plan upload failed." },
      { status: 502 },
    );
  }
}
