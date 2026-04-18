// JWT sessions in an httpOnly cookie. Magic-link tokens are also JWTs but
// short-lived (15m) and tracked in the magic_tokens table for single-use.
// jose is used for sign/verify because it works in the Edge runtime, which
// matters for src/middleware.ts.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import type { UserRole } from "@prisma/client";

const SESSION_COOKIE = "session";
const SESSION_TTL_DAYS = 7;
const MAGIC_LINK_TTL_MIN = 15;

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET env var is not set");
  return new TextEncoder().encode(secret);
}

// ─────────────────────────────────────────────────────────────────────────────
// Session JWTs
// ─────────────────────────────────────────────────────────────────────────────

export type SessionPayload = {
  userId: string;
  orgId: string;
  email: string;
  role: UserRole;
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  orgId: string;
  org: {
    id: string;
    name: string;
    onboardingComplete: boolean;
  };
};

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(getJwtSecret());
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Sets the session cookie. Call from a route handler or server action.
 * httpOnly so JS can't read it; secure in prod; sameSite=lax so OAuth
 * redirects survive.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}

// ─────────────────────────────────────────────────────────────────────────────
// Magic-link JWTs
// ─────────────────────────────────────────────────────────────────────────────

export type MagicTokenPayload = {
  email: string;
  // jti — matched against the magic_tokens table for single-use enforcement
  jti: string;
};

export async function signMagicToken(email: string, jti: string): Promise<string> {
  return new SignJWT({ email, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAGIC_LINK_TTL_MIN}m`)
    .sign(getJwtSecret());
}

export async function verifyMagicToken(
  token: string,
): Promise<MagicTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (typeof payload.email !== "string" || typeof payload.jti !== "string") {
      return null;
    }
    return { email: payload.email, jti: payload.jti };
  } catch {
    return null;
  }
}

export function magicLinkTtlMinutes(): number {
  return MAGIC_LINK_TTL_MIN;
}

// ─────────────────────────────────────────────────────────────────────────────
// Caller helpers (server components / route handlers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads the session cookie and resolves the current user from Neon.
 * Returns null if no cookie, invalid JWT, or the user no longer exists.
 *
 * Use this in route handlers where you want to return 401 manually.
 * In server components prefer requireAuth() which redirects.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { org: true },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgId: user.orgId,
    org: {
      id: user.org.id,
      name: user.org.name,
      onboardingComplete: user.org.onboardingComplete,
    },
  };
}

/**
 * Server-component helper: returns the user or redirects to /login.
 * Also forces unfinished orgs through /onboarding (except the wizard itself).
 */
export async function requireAuth(opts?: { allowOnboarding?: boolean }): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.org.onboardingComplete && !opts?.allowOnboarding) {
    redirect("/onboarding");
  }
  return user;
}

/**
 * Same as requireAuth but also enforces admin role. Use this on settings
 * tabs that mutate org-wide config (users, integrations, branding).
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireAuth();
  if (user.role !== "admin") redirect("/");
  return user;
}
