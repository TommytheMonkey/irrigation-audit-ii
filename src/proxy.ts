// Edge-runtime proxy: gates every page on a valid session JWT.
//
// (Renamed from middleware.ts in Next.js 16 — the file convention changed
// from `middleware` to `proxy`. Same Edge runtime, same matcher semantics.)
//
// We can't touch Neon here (the Edge runtime can't run pg), so the proxy
// only verifies the JWT signature/expiry — it doesn't load the user. The
// per-request user lookup happens in src/lib/auth.ts via getCurrentUser/
// requireAuth, which run on the Node runtime in server components.
//
// jose runs in Edge — that's why we picked it over jsonwebtoken.

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "session";

// Public paths that bypass auth entirely. Anything not matched here gets
// gated. The matcher at the bottom already excludes _next + favicon, so we
// only need to list app-level public routes.
//
// /auth/confirm is the intermediate magic-link page — users are literally
// unauthenticated when they click the link, so gating it on a session
// cookie would bounce them straight to /login and the token never gets
// consumed. Keep this path public alongside /login and /api/auth/*.
const PUBLIC_PATHS = new Set<string>(["/login", "/auth/confirm"]);
const PUBLIC_PREFIXES = ["/api/auth/", "/auth/"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return redirectToLogin(req);

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("[proxy] JWT_SECRET not set");
    return redirectToLogin(req);
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    return redirectToLogin(req);
  }
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Match everything except Next.js internals + static assets. Public app
  // routes are filtered by isPublic() above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
