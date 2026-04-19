import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  GoogleAuthError,
  createDriveFolder,
  getAccessTokenForOrg,
  listDriveFolders,
} from "@/lib/google";

// GET /api/settings/google/drive-folder
// Lists folders the app can see (drive.file scope = folders it created or
// the user explicitly picked). Includes a synthetic "My Drive root" entry
// with id "root" so the picker can point at root without a real folder id.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const org = await db.org.findUniqueOrThrow({
    where: { id: user.orgId },
    select: { googleCredentialsEnc: true, googleDriveFolderId: true },
  });
  if (!org.googleCredentialsEnc) {
    return NextResponse.json(
      { error: "not_connected", message: "Connect Google first." },
      { status: 400 },
    );
  }
  try {
    const accessToken = await getAccessTokenForOrg(org.googleCredentialsEnc);
    const folders = await listDriveFolders(accessToken);
    return NextResponse.json({
      folders,
      currentId: org.googleDriveFolderId,
    });
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      return NextResponse.json(
        { error: "google_auth", message: "Reconnect Google." },
        { status: 401 },
      );
    }
    throw e;
  }
}

// PATCH /api/settings/google/drive-folder
// Body: { folderId: string | null } — set/clear the root export folder.
// Special folderId: "__create__:<name>" creates a new folder at root and
// stores its id.
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    folderId?: string | null;
    createFolderName?: string;
  };

  const org = await db.org.findUniqueOrThrow({
    where: { id: user.orgId },
    select: { googleCredentialsEnc: true },
  });
  if (!org.googleCredentialsEnc) {
    return NextResponse.json(
      { error: "not_connected", message: "Connect Google first." },
      { status: 400 },
    );
  }

  let finalFolderId: string | null = null;

  try {
    if (body.createFolderName) {
      const accessToken = await getAccessTokenForOrg(org.googleCredentialsEnc);
      const created = await createDriveFolder(
        accessToken,
        body.createFolderName.trim(),
      );
      finalFolderId = created.id;
    } else if (body.folderId === "root" || body.folderId === null) {
      finalFolderId = null;
    } else if (body.folderId) {
      finalFolderId = body.folderId;
    }
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      return NextResponse.json(
        { error: "google_auth", message: "Reconnect Google." },
        { status: 401 },
      );
    }
    throw e;
  }

  await db.org.update({
    where: { id: user.orgId },
    data: { googleDriveFolderId: finalFolderId },
  });
  return NextResponse.json({ ok: true, folderId: finalFolderId });
}
