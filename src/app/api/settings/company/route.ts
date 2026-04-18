import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// PATCH /api/settings/company
//
// Updates the org's basic info: display name and (optionally) the email
// domain that controls auto-join on signup. Both onboarding and the
// settings → company tab post here.
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    name?: string;
    emailDomain?: string | null;
  };

  if (body.name !== undefined && body.name.trim().length === 0) {
    return NextResponse.json(
      { error: "name cannot be empty" },
      { status: 400 },
    );
  }

  // Domain is stored lower-cased and stripped of any leading "@" so users
  // can paste either "company.com" or "@company.com".
  const cleanDomain =
    body.emailDomain === undefined
      ? undefined
      : body.emailDomain === null || body.emailDomain.trim() === ""
        ? null
        : body.emailDomain.replace(/^@/, "").toLowerCase().trim();

  try {
    const updated = await db.org.update({
      where: { id: user.orgId },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(cleanDomain !== undefined && { emailDomain: cleanDomain }),
      },
      select: { id: true, name: true, emailDomain: true },
    });
    return NextResponse.json(updated);
  } catch (e: unknown) {
    // Most likely cause: unique constraint on emailDomain.
    const msg = e instanceof Error ? e.message : "unknown";
    if (msg.includes("Unique")) {
      return NextResponse.json(
        { error: "domain_taken", message: "That email domain is already linked to another org." },
        { status: 409 },
      );
    }
    throw e;
  }
}
