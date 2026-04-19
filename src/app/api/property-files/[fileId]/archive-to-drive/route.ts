import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";
import { getAccessTokenForOrg, GoogleAuthError } from "@/lib/google";

export const runtime = "nodejs";
// Large files → longer transfer. Allow ample time for Drive upload.
export const maxDuration = 60;

// POST /api/property-files/[fileId]/archive-to-drive
//
// Fetches the file from Vercel Blob, uploads a copy to the org's connected
// Google Drive (into googleDriveFolderId if set, else My Drive root), and
// records the Drive file id + webViewLink on the SystemFile row.
//
// Idempotent by effect (re-running overwrites the drive fields with a new
// Drive file), but doesn't clean up the previous Drive file — that rarely
// matters since "Archive to Drive" is meant as a one-shot.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const file = await db.systemFile.findFirst({
    where: { id: fileId, system: { orgId: auth.user.orgId } },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      blobUrl: true,
      system: { select: { orgId: true } },
    },
  });
  if (!file) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const org = await db.org.findUniqueOrThrow({
    where: { id: file.system.orgId },
    select: { googleCredentialsEnc: true, googleDriveFolderId: true },
  });
  if (!org.googleCredentialsEnc) {
    return NextResponse.json(
      {
        error: "google_not_connected",
        message: "Connect Google in Settings → Integrations first.",
      },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    accessToken = await getAccessTokenForOrg(org.googleCredentialsEnc);
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      return NextResponse.json(
        {
          error: "google_auth",
          message: "Reconnect Google in Settings → Integrations.",
        },
        { status: 401 },
      );
    }
    throw e;
  }

  const blobRes = await fetch(file.blobUrl);
  if (!blobRes.ok) {
    return NextResponse.json(
      { error: "blob_fetch_failed", message: "Couldn't fetch file from Blob." },
      { status: 502 },
    );
  }
  const fileBytes = new Uint8Array(await blobRes.arrayBuffer());

  // Multipart/related body: metadata part + media part, bound by a random
  // string so it can't appear in either part.
  const boundary = `boundary${randomUUID().replace(/-/g, "")}`;
  const metadata: { name: string; parents?: string[] } = { name: file.filename };
  if (org.googleDriveFolderId) {
    metadata.parents = [org.googleDriveFolderId];
  }
  const header =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${file.mimeType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const headerBytes = new TextEncoder().encode(header);
  const footerBytes = new TextEncoder().encode(footer);
  const body = new Uint8Array(
    headerBytes.length + fileBytes.length + footerBytes.length,
  );
  body.set(headerBytes, 0);
  body.set(fileBytes, headerBytes.length);
  body.set(footerBytes, headerBytes.length + fileBytes.length);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    console.error(
      `[archive-to-drive] upload failed ${uploadRes.status}: ${text.slice(0, 500)}`,
    );
    return NextResponse.json(
      {
        error: "drive_upload_failed",
        message: `Drive rejected upload (${uploadRes.status}).`,
      },
      { status: 502 },
    );
  }
  const created = (await uploadRes.json()) as {
    id: string;
    webViewLink?: string;
  };

  await db.systemFile.update({
    where: { id: fileId },
    data: {
      driveFileId: created.id,
      driveWebViewLink: created.webViewLink ?? null,
      driveArchivedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    driveFileId: created.id,
    driveWebViewLink: created.webViewLink ?? null,
  });
}
