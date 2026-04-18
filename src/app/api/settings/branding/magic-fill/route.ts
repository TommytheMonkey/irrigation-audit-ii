import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { extractBrand } from "@/lib/brand-extract";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { url?: string };
  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json(
      { error: "invalid_request", message: "url is required" },
      { status: 400 },
    );
  }

  const result = await extractBrand(body.url);
  if (!result.ok) {
    const status =
      result.error === "not_configured"
        ? 500
        : result.error === "invalid_url" || result.error === "blocked_host"
          ? 400
          : 502;
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status },
    );
  }
  return NextResponse.json({ ok: true, data: result.data });
}
