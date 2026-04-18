import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/google";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/settings";

  // Surface env-var misconfiguration as a toast on the return page instead of
  // a 500 that renders as "page not found" in some browsers.
  const envErr = checkEnv(req);
  const redirectBase = process.env.APP_URL ?? new URL(req.url).origin;
  if (envErr) {
    const u = new URL(next, redirectBase);
    u.searchParams.set("google_error", envErr);
    return NextResponse.redirect(u);
  }

  const state = randomBytes(16).toString("hex");
  const c = await cookies();
  c.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  c.set("google_oauth_next", next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  try {
    return NextResponse.redirect(buildAuthUrl(state));
  } catch (e) {
    console.error("[google oauth] buildAuthUrl threw:", e);
    const u = new URL(next, redirectBase);
    u.searchParams.set("google_error", "config_error");
    return NextResponse.redirect(u);
  }
}

function checkEnv(req: Request): string | null {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return "missing_credentials";
  }
  const appUrl = process.env.APP_URL;
  if (!appUrl) return "missing_app_url";
  // If the request host isn't localhost but APP_URL points at localhost, the
  // callback will come back to a host the iPad/phone can't reach. Catch that
  // up front so the user gets a specific hint.
  const reqHost = new URL(req.url).hostname;
  const appHost = new URL(appUrl).hostname;
  if (reqHost !== "localhost" && appHost === "localhost") {
    return "app_url_mismatch";
  }
  return null;
}
