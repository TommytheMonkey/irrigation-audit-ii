import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import crypto from "node:crypto";
import { getCurrentUser } from "@/lib/auth";

// File upload endpoint backed by Vercel Blob. Used for logos and audit photos.
// Requires BLOB_READ_WRITE_TOKEN env var — Vercel provisions it automatically
// when you create a Blob store; for local dev run `vercel env pull` to sync it
// into .env.
//
// Body size is capped at 4.5 MB by Vercel's serverless function limit on the
// Hobby plan. Phone photos almost always fit; if users regularly hit the cap
// we'll switch to @vercel/blob/client upload-tokens so the browser uploads
// directly to Blob and skips the function.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "not_configured", message: "Blob storage isn't configured." },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const safeExt = /^(jpg|jpeg|png|webp|heic|heif)$/.test(ext) ? ext : "jpg";
  const key = `orgs/${user.orgId}/${crypto.randomUUID()}.${safeExt}`;

  try {
    const blob = await put(key, file, {
      access: "public",
      contentType: file.type || undefined,
      addRandomSuffix: false,
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error("[upload] blob put failed", e);
    return NextResponse.json(
      { error: "upload_failed", message: "Upload failed." },
      { status: 502 },
    );
  }
}
