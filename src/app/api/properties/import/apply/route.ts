import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { applyPropertyImport } from "@/lib/property-import";
import type { ColumnMapping } from "@/lib/monday-types";

export const runtime = "nodejs";
// Geocoding adds ~1 second per row. A 100-row import stays under 60s.
export const maxDuration = 60;

// POST /api/properties/import/apply
// Body: { columns, rows, nameColumn, mapping, geocode }
//
// Inserts one property per row. Name column is the one required field;
// rows without a name are skipped. Imported rows get mondayItemId=null so
// the dashboard's "Manual" source filter picks them up separately from
// Monday-synced ones.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    columns?: string[];
    rows?: string[][];
    nameColumn?: string;
    mapping?: ColumnMapping;
    geocode?: boolean;
  };

  if (
    !Array.isArray(body.columns) ||
    !Array.isArray(body.rows) ||
    !body.nameColumn ||
    !body.mapping
  ) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400 },
    );
  }

  try {
    const result = await applyPropertyImport({
      orgId: user.orgId,
      columns: body.columns,
      rows: body.rows,
      nameColumn: body.nameColumn,
      mapping: body.mapping,
      geocode: body.geocode ?? true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[properties/import/apply] failed:", e);
    return NextResponse.json(
      {
        error: "import_failed",
        message: e instanceof Error ? e.message : "Import failed.",
      },
      { status: 500 },
    );
  }
}
