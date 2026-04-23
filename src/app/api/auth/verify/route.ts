import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyMagicToken,
  signSession,
  setSessionCookie,
} from "@/lib/auth";
import { isBotUserAgent } from "@/lib/bot-ua";
import { seedSampleProject } from "@/lib/sample-seed";

// POST /api/auth/verify
//
// Body: { token: string } (JSON) or application/x-www-form-urlencoded
//   (HTML form submit from /auth/confirm). Both are accepted so JS-off
//   clients still work.
//
// This endpoint is the token-consuming step of the magic-link flow. The
// email no longer links here directly — users land on /auth/confirm
// first (a GET-safe page), and only the explicit POST from that page
// consumes the token.
//
// Behaviour:
//   • Existing user → sign session, 303 redirect /
//   • New user, org with matching emailDomain exists → join as auditor
//   • New user, no matching org → create org + admin user → /onboarding
//
// Bot UA belt-and-suspenders: if something non-human does end up POSTing
// (misconfigured preview proxy, corporate link scanner re-posting forms,
// etc.) we return 200 without consuming so the real user can still click
// Continue. Normal failures still redirect to /login?error=…
export async function POST(req: Request) {
  if (isBotUserAgent(req.headers.get("user-agent"))) {
    // Return 200 with no side effects — the preview fetch is satisfied
    // and the token stays unused for the real click.
    return new NextResponse("bot_ignored", {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const token = await extractToken(req);
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
      // Give first-time orgs a realistic sample property to explore
      // instead of an empty dashboard. Wrapped in try/catch so a seed
      // glitch never blocks the sign-in — worst case the user lands
      // on an empty dashboard and we log the error server-side.
      try {
        await seedSampleProject(db, newOrg.id, user.id);
      } catch (e) {
        console.warn("[sample-seed] failed for new org", newOrg.id, e);
      }
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
  // 303 so the browser uses GET on the redirect target (the POST is done).
  return NextResponse.redirect(`${baseUrl}${dest}`, { status: 303 });
}

// GET /api/auth/verify
//
// Kept for backwards-compatibility with magic-link emails already in the
// wild before this change — just bounces to the confirmation page. The
// new email bodies link straight to /auth/confirm so this path is only
// exercised by in-flight links.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const target = token
    ? `${baseUrl}/auth/confirm?token=${encodeURIComponent(token)}`
    : `${baseUrl}/login?error=missing_token`;
  return NextResponse.redirect(target, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}

async function extractToken(req: Request): Promise<string | null> {
  const ct = req.headers.get("content-type")?.toLowerCase() ?? "";
  try {
    if (ct.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as { token?: string };
      return body.token?.trim() ?? null;
    }
    if (
      ct.includes("application/x-www-form-urlencoded") ||
      ct.includes("multipart/form-data")
    ) {
      const fd = await req.formData();
      const t = fd.get("token");
      return typeof t === "string" && t.trim().length > 0 ? t.trim() : null;
    }
  } catch {
    return null;
  }
  // Last-resort: tolerate ?token= on the POST URL.
  const url = new URL(req.url);
  return url.searchParams.get("token");
}

function redirectToLogin(error: string): NextResponse {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(`${baseUrl}/login?error=${error}`, {
    status: 303,
  });
}

function titlecaseDomain(domain: string): string {
  const root = domain.split(".")[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}
