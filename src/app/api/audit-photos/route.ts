import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/audit-photos
// multipart/form-data: file, propertyId, zoneNumber, auditDate, propertyName
//
// Uploads the photo to Vercel Blob with a standardized filename and creates
// a PropertyFile row with category=PHOTO. Returns the blob URL so the caller
// can add it to AuditFinding.photoUrls[].
//
// Filename convention:
//   {PropertyName} - Audit {MM-DD-YY} - Z{zone}_{seq}.jpg
// Sequence auto-increments per (property, zone, auditDate).

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const file = form.get("file");
  const propertyId = form.get("propertyId") as string | null;
  const zoneNumberStr = form.get("zoneNumber") as string | null;
  const auditDateStr = form.get("auditDate") as string | null;
  const propertyName = form.get("propertyName") as string | null;

  if (!(file instanceof File) || !propertyId || !zoneNumberStr) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const prop = await db.property.findFirst({
    where: { id: propertyId, orgId: user.orgId },
    select: { id: true },
  });
  if (!prop) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const zoneNumber = parseInt(zoneNumberStr, 10);
  const auditDate = auditDateStr
    ? new Date(auditDateStr + "T00:00:00")
    : new Date();
  const dateForName = auditDate.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
  const dateForFolder = auditDate.toISOString().slice(0, 10);

  // Auto-increment sequence per (property, zone, auditDate)
  const existing = await db.propertyFile.count({
    where: {
      propertyId,
      category: "PHOTO",
      zoneNumber,
      auditDate,
    },
  });
  const sequence = existing;
  const seqStr = String(sequence).padStart(2, "0");

  const safeName = sanitizeFilename(propertyName ?? "Property");
  const fileName = `${safeName} - Audit ${dateForName} - Z${zoneNumber}_${seqStr}.jpg`;

  const blobKey = `orgs/${user.orgId}/photos/audit-${dateForFolder}/${fileName}`;

  try {
    const blob = await put(blobKey, file, {
      access: "public",
      contentType: file.type || "image/jpeg",
      addRandomSuffix: false,
    });

    const pf = await db.propertyFile.create({
      data: {
        propertyId,
        uploadedById: user.id,
        fileName,
        mimeType: file.type || "image/jpeg",
        fileSize: file.size,
        category: "PHOTO",
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        zoneNumber,
        photoSequence: sequence,
        auditDate,
      },
    });

    return NextResponse.json({ url: blob.url, propertyFileId: pf.id });
  } catch (e) {
    console.error("[audit-photos] upload failed:", e);
    return NextResponse.json(
      { error: "upload_failed", message: "Photo upload failed." },
      { status: 502 },
    );
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim();
}
