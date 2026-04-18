import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signSession, setSessionCookie } from "@/lib/auth";

// POST /api/auth/dev-login
//
// DEV ESCAPE HATCH. Reads DEV_AUTO_LOGIN env (an email), looks up the user,
// and signs a session. Disabled in production. The login page calls this
// when DEV_AUTO_LOGIN is set so iteration stays fast — no flipping back to
// the terminal to copy a magic link.
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  }
  const email = process.env.DEV_AUTO_LOGIN;
  if (!email) {
    return NextResponse.json({ error: "DEV_AUTO_LOGIN not set" }, { status: 400 });
  }
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { org: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: `user ${email} not found — run npm run db:seed:demo` },
      { status: 404 },
    );
  }
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  const token = await signSession({
    userId: user.id,
    orgId: user.orgId,
    email: user.email,
    role: user.role,
  });
  await setSessionCookie(token);
  return NextResponse.json({
    ok: true,
    redirect: user.org.onboardingComplete ? "/" : "/onboarding",
  });
}
