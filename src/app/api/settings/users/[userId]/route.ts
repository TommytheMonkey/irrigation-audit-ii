import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { UserRole } from "@prisma/client";

// PATCH /api/settings/users/[userId] — update a user's role. Admin only,
// scoped to the caller's org. The caller can't demote themselves out of
// admin if they're the only admin left (avoid orphaning the org).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (me.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { role?: UserRole };
  if (!body.role) {
    return NextResponse.json({ error: "missing_role" }, { status: 400 });
  }

  const target = await db.user.findFirst({
    where: { id: userId, orgId: me.orgId },
    select: { id: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Last-admin guard.
  if (
    target.role === "admin" &&
    body.role !== "admin" &&
    target.id === me.id
  ) {
    const adminCount = await db.user.count({
      where: { orgId: me.orgId, role: "admin" },
    });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "last_admin", message: "Can't demote the only admin." },
        { status: 400 },
      );
    }
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: { role: body.role },
    select: { id: true, role: true },
  });
  return NextResponse.json(updated);
}

// DELETE /api/settings/users/[userId] — remove a user from the org. Same
// guard against deleting the last admin (and yourself, just to be safe).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (me.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (userId === me.id) {
    return NextResponse.json(
      { error: "self_delete", message: "You can't delete your own account from here." },
      { status: 400 },
    );
  }

  const target = await db.user.findFirst({
    where: { id: userId, orgId: me.orgId },
    select: { id: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (target.role === "admin") {
    const adminCount = await db.user.count({
      where: { orgId: me.orgId, role: "admin" },
    });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "last_admin", message: "Can't remove the only admin." },
        { status: 400 },
      );
    }
  }

  await db.user.delete({ where: { id: userId } });
  return NextResponse.json({ ok: true });
}
