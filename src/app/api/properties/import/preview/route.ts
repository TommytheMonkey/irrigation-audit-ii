import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  parseGoogleSheetForImport,
  parseXlsxForImport,
} from "@/lib/property-import";
import { GoogleAuthError } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/properties/import/preview
//
// Two input shapes — multipart for xlsx, JSON for Sheet URL:
//   Content-Type: multipart/form-data → field "file" = .xlsx
//   Content-Type: application/json    → body { sheetUrl: string }
//
// Response: { columns, rows, totalRows, autoMapping, nameColumn }.
// "rows" is trimmed to the first 10 entries for preview; the client holds
// it along with autoMapping, then POSTs the full result back to /apply.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "no_file" }, { status: 400 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const preview = await parseXlsxForImport(bytes);
      return NextResponse.json(preview);
    }
    // Default: JSON Sheet URL path.
    const body = (await req.json().catch(() => ({}))) as {
      sheetUrl?: string;
    };
    if (!body.sheetUrl) {
      return NextResponse.json(
        { error: "invalid_request", message: "sheetUrl required" },
        { status: 400 },
      );
    }
    const preview = await parseGoogleSheetForImport(user.orgId, body.sheetUrl);
    return NextResponse.json(preview);
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      return NextResponse.json(
        { error: "google_auth", message: e.message },
        { status: 401 },
      );
    }
    console.error("[properties/import/preview] failed:", e);
    return NextResponse.json(
      {
        error: "preview_failed",
        message: e instanceof Error ? e.message : "Preview failed.",
      },
      { status: 400 },
    );
  }
}
