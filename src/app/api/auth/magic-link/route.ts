import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { signMagicToken, magicLinkTtlMinutes } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

// POST /api/auth/magic-link
// Body: { email: string }
//
// Always returns 200 even if the email doesn't exist — we don't want to
// leak which addresses are signed up. The magic link itself handles the
// "create user / create org / join existing org" branching on verify.
export async function POST(req: Request) {
  try {
    console.log("[magic-link] start");
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    console.log("[magic-link] email ok");

    const jti = randomUUID();
    const ttlMs = magicLinkTtlMinutes() * 60 * 1000;
    const token = await signMagicToken(email, jti);
    console.log("[magic-link] signed jwt");

    await db.magicToken.create({
      data: {
        email,
        token: jti,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    console.log("[magic-link] token persisted");

    const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
    const link = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

    await sendEmail({
      to: email,
      subject: "Your Irrigation Audit sign-in link",
      text: `Click the link below to sign in. It expires in ${magicLinkTtlMinutes()} minutes.\n\n${link}\n\nIf you didn't request this, ignore this email.`,
    });
    console.log("[magic-link] email sent");

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[magic-link] threw:", msg, stack);
    return NextResponse.json({ error: "server_error", message: msg }, { status: 500 });
  }
}
