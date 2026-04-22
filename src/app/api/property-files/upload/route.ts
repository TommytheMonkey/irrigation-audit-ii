import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import {
  assertSystemInOrg,
  assertSubInOrg,
  requireEditor,
} from "@/lib/system-profile-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const file = form.get("file");
  const systemId = form.get("systemId") as string | null;
  const zoneId = (form.get("zoneId") as string | null) || null;
  const tagsRaw = form.get("tags") as string | null;

  if (!(file instanceof File) || !systemId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const ownsSystem = await assertSystemInOrg(systemId, auth.user.orgId);
  if (ownsSystem !== true) {
    return NextResponse.json({ error: "system_not_found" }, { status: 404 });
  }

  if (zoneId) {
    const ownsZone = await assertSubInOrg("zone", zoneId, auth.user.orgId);
    if (ownsZone !== true) {
      return NextResponse.json({ error: "zone_not_found" }, { status: 404 });
    }
  }

  let tags: string[] = [];
  if (tagsRaw) {
    try {
      tags = JSON.parse(tagsRaw) as string[];
    } catch {
      tags = tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }
  }

  const blobKey = `orgs/${auth.user.orgId}/system-files/${crypto.randomUUID()}-${file.name}`;

  try {
    const blob = await put(blobKey, file, {
      access: "public",
      contentType: file.type || "application/octet-stream",
      addRandomSuffix: false,
    });

    const record = await db.systemFile.create({
      data: {
        systemId,
        zoneId,
        uploadedById: auth.user.id,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        tags,
      },
    });

    return NextResponse.json({ ok: true, file: record });
  } catch (e) {
    console.error("[property-files/upload] failed:", e);
    return NextResponse.json(
      { error: "upload_failed", message: "File upload failed." },
      { status: 502 },
    );
  }
}
