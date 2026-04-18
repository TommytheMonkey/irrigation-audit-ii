import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyMagicToken,
  signSession,
  setSessionCookie,
} from "@/lib/auth";

// GET /api/auth/verify?token=...
//
// Verifies the magic-link JWT, marks the row in magic_tokens used (single-
// use enforcement), then resolves the user via domain matching:
//
//   • Existing user → sign session, redirect /
//   • New user, org with matching emailDomain exists → join as auditor
//   • New user, no matching org → create org (placeholder name = domain) +
//     user as admin → redirect /onboarding
//
// On any failure we redirect back to /login?error=… so the page can render
// a friendly message instead of a JSON 400.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return redirectToLogin("missing_token");

  const payload = await verifyMagicToken(token);
  if (!payload) return redirectToLogin("invalid_token");

  // Single-use: find the row by jti, fail if missing/used/expired.
  const row = await db.magicToken.findUnique({ where: { token: payload.jti } });
  if (!row) return redirectToLogin("invalid_token");
  if (row.usedAt) return redirectToLogin("token_used");
  if (row.expiresAt < new Date()) return redirectToLogin("expired");

  await db.magicToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  const email = payload.email.toLowerCase();
  const domain = email.split("@")[1];
  if (!domain) return redirectToLogin("invalid_email");

  // Resolve or create user.
  let user = await db.user.findUnique({
    where: { email },
    include: { org: true },
  });

  let isNewOrg = false;

  if (!user) {
    // First time this email has signed in. Look for an org by domain.
    const existingOrg = await db.org.findUnique({
      where: { emailDomain: domain },
    });

    if (existingOrg) {
      user = await db.user.create({
        data: {
          email,
          orgId: existingOrg.id,
          role: "auditor",
        },
        include: { org: true },
      });
    } else {
      // Brand new org. Use the domain as a placeholder name; the wizard
      // will collect the real one in step 1.
      isNewOrg = true;
      const newOrg = await db.org.create({
        data: {
          name: titlecaseDomain(domain),
          emailDomain: domain,
        },
      });
      user = await db.user.create({
        data: {
          email,
          orgId: newOrg.id,
          role: "admin",
        },
        include: { org: true },
      });
    }
  }

  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const session = await signSession({
    userId: user.id,
    orgId: user.orgId,
    email: user.email,
    role: user.role,
  });
  await setSessionCookie(session);

  // Onboarding gating: brand-new orgs always go to /onboarding. For users
  // joining an existing org, the org may or may not be set up — let
  // requireAuth on the dashboard enforce that consistently.
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const dest = isNewOrg || !user.org.onboardingComplete ? "/onboarding" : "/";
  return NextResponse.redirect(`${baseUrl}${dest}`);
}

function redirectToLogin(error: string): NextResponse {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(`${baseUrl}/login?error=${error}`);
}

function titlecaseDomain(domain: string): string {
  const root = domain.split(".")[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}
