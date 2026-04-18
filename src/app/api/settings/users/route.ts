import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { UserRole } from "@prisma/client";

// GET /api/settings/users — list every user in the caller's org. Used by
// the settings → users tab.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const users = await db.user.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json(users);
}

// POST /api/settings/users — invite (i.e. create) a new user with a chosen
// role. The first time they hit /login and request a magic link they'll be
// matched on email and dropped into the org. Admin only.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    email: string;
    role?: UserRole;
    name?: string;
  };
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // Email is globally unique. If the address already exists in any org we
  // can't poach them — surface that as a conflict.
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "email_taken", message: "A user with that email already exists." },
      { status: 409 },
    );
  }

  const created = await db.user.create({
    data: {
      orgId: user.orgId,
      email,
      name: body.name?.trim() || null,
      role: body.role ?? "auditor",
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  return NextResponse.json(created);
}
