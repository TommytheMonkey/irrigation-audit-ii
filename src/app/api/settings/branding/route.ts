import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// PATCH /api/settings/branding
//
// Branding shows up on PDF reports + the in-app header. All fields are
// optional; sending null clears, omitting leaves untouched. Logo URLs are
// expected to already be hosted somewhere (Vercel Blob in prod, /uploads
// in dev via the upload route).
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    primaryLogoUrl?: string | null;
    secondaryLogoUrl?: string | null;
    brandColorPrimary?: string | null;
    brandColorSecondary?: string | null;
    fontFamily?: string | null;
  };

  // Loose validation: hex colors must look like #RGB or #RRGGBB if present.
  const colorRe = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  for (const c of [body.brandColorPrimary, body.brandColorSecondary]) {
    if (c && !colorRe.test(c)) {
      return NextResponse.json(
        { error: "invalid_color", message: `${c} is not a valid hex color` },
        { status: 400 },
      );
    }
  }

  const norm = (v: string | null | undefined) =>
    v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim();

  await db.org.update({
    where: { id: user.orgId },
    data: {
      ...(body.primaryLogoUrl !== undefined && { primaryLogoUrl: norm(body.primaryLogoUrl) }),
      ...(body.secondaryLogoUrl !== undefined && { secondaryLogoUrl: norm(body.secondaryLogoUrl) }),
      ...(body.brandColorPrimary !== undefined && { brandColorPrimary: norm(body.brandColorPrimary) }),
      ...(body.brandColorSecondary !== undefined && { brandColorSecondary: norm(body.brandColorSecondary) }),
      ...(body.fontFamily !== undefined && { fontFamily: norm(body.fontFamily) }),
    },
  });

  return NextResponse.json({ ok: true });
}
