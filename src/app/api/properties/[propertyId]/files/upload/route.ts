import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";
import type { FileCategory } from "@prisma/client";
import imageSize from "image-size";

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set<FileCategory>([
  "DRAWINGS",
  "CUTSHEET",
  "MANUAL",
  "PHOTO",
  "OTHER",
]);

// POST /api/properties/[propertyId]/files/upload
// multipart/form-data: file, [category]
// - If `category` is present: general PropertyFile upload (Files tab).
// - If `category` is absent: site plan upload — sets isFullSitePlan=true,
//   clears any existing full site plan, and creates the SitePlanRender.
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

  const categoryRaw = form?.get("category");
  const asSitePlan = categoryRaw == null;
  const mime = file.type || "application/octet-stream";

  if (asSitePlan && !mime.startsWith("image/") && mime !== "application/pdf") {
    return NextResponse.json(
      { error: "invalid_type", message: "Site plan must be an image or PDF." },
      { status: 400 },
    );
  }

  let category: FileCategory = "OTHER";
  if (!asSitePlan) {
    const c = String(categoryRaw);
    if (!VALID_CATEGORIES.has(c as FileCategory)) {
      return NextResponse.json(
        { error: "invalid_category" },
        { status: 400 },
      );
    }
    category = c as FileCategory;
  } else {
    category = "DRAWINGS";
  }

  const folder = asSitePlan ? "site-plans" : "property-files";
  const blobKey = `orgs/${auth.user.orgId}/${folder}/${propertyId}-${crypto.randomUUID()}-${file.name}`;

  try {
    const blob = await put(blobKey, file, {
      access: "public",
      contentType: mime,
      addRandomSuffix: false,
    });

    if (asSitePlan) {
      // Clear any existing full site plan on this property
      await db.propertyFile.updateMany({
        where: { propertyId, isFullSitePlan: true },
        data: { isFullSitePlan: false },
      });
    }

    const pf = await db.propertyFile.create({
      data: {
        propertyId,
        uploadedById: auth.user.id,
        fileName: file.name,
        mimeType: mime,
        fileSize: file.size,
        category,
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        isFullSitePlan: asSitePlan,
      },
    });

    if (asSitePlan) {
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
        // PDF — render will be provided by the client after rasterizing page 1
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
    }

    return NextResponse.json({
      ok: true,
      fileId: pf.id,
      blobUrl: blob.url,
      fileName: pf.fileName,
    });
  } catch (e) {
    console.error("[properties/files/upload] failed:", e);
    return NextResponse.json(
      { error: "upload_failed", message: "Upload failed." },
      { status: 502 },
    );
  }
}
