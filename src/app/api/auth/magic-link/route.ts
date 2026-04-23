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
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const jti = randomUUID();
  const ttlMs = magicLinkTtlMinutes() * 60 * 1000;
  const token = await signMagicToken(email, jti);

  await db.magicToken.create({
    data: {
      email,
      token: jti,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  // Link points at the confirmation page, not the token-consuming endpoint —
  // that way Gmail/Slack/iMessage link previewers don't burn the one-time
  // token before the real user clicks. See /auth/confirm/page.tsx.
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const link = `${baseUrl}/auth/confirm?token=${encodeURIComponent(token)}`;

  await sendEmail({
    to: email,
    subject: "Your Irrigation Audit sign-in link",
    text: `Click the link below to sign in. It expires in ${magicLinkTtlMinutes()} minutes.\n\n${link}\n\nIf you didn't request this, ignore this email.`,
  });

  return NextResponse.json({ ok: true });
}
