import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";

export const runtime = "nodejs";

// PATCH /api/property-files/[fileId]
// Body: { tags?: string[]; description?: string | null; zoneId?: string | null }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const file = await db.systemFile.findFirst({
    where: { id: fileId, system: { orgId: auth.user.orgId } },
    select: { id: true },
  });
  if (!file) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    tags?: string[];
    description?: string | null;
    zoneId?: string | null;
  };

  const updated = await db.systemFile.update({
    where: { id: fileId },
    data: {
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(body.description !== undefined && {
        description: body.description?.trim() || null,
      }),
      ...(body.zoneId !== undefined && { zoneId: body.zoneId }),
    },
  });
  return NextResponse.json(updated);
}

// DELETE /api/property-files/[fileId]
// Removes the Blob + DB row. Drive mirror (if any) is left in place —
// users often archive intentionally and deleting the original shouldn't
// wipe the off-platform backup.
export async function DELETE(
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
    select: { id: true, blobUrl: true },
  });
  if (!file) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Best-effort Blob delete. If Blob returns 404 the file was already gone.
  try {
    await del(file.blobUrl);
  } catch (e) {
    console.warn("[property-files/delete] blob del failed (non-fatal):", e);
  }

  await db.systemFile.delete({ where: { id: fileId } });
  return NextResponse.json({ ok: true });
}
