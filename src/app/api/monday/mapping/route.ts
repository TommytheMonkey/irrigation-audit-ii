import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import {
  fetchBoardColumns,
  validateMapping,
  type ColumnMapping,
  type PropertyField,
} from "@/lib/monday";

const KNOWN_FIELDS: PropertyField[] = [
  "address",
  "pmName",
  "pmEmail",
  "pmPhone",
  "city",
  "state",
  "zip",
];

// POST /api/monday/mapping
//
// Persists the user's column mapping after validating that every referenced
// column id still exists on the board. We re-fetch columns rather than trust
// the client because the client list may be stale (a column could have been
// deleted between page load and save).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { mapping?: Record<string, unknown> };
  if (!body.mapping || typeof body.mapping !== "object") {
    return NextResponse.json(
      { error: "invalid_body", message: "mapping object required" },
      { status: 400 },
    );
  }

  // Whitelist incoming keys to known fields. Drops anything unrecognized so
  // a malicious client can't stash arbitrary JSON in the org row.
  const cleaned: ColumnMapping = {};
  for (const field of KNOWN_FIELDS) {
    const v = body.mapping[field];
    if (typeof v === "string" && v.trim() !== "") {
      cleaned[field] = v.trim();
    }
  }

  const org = await db.org.findUniqueOrThrow({
    where: { id: user.orgId },
    select: { mondayApiKeyEnc: true, mondayBoardId: true },
  });
  if (!org.mondayApiKeyEnc || !org.mondayBoardId) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "Save your Monday API key and board id before mapping columns.",
      },
      { status: 400 },
    );
  }

  const apiKey =
    process.env.MONDAY_MOCK === "true" ? "mock" : decrypt(org.mondayApiKeyEnc);

  let columns;
  try {
    columns = await fetchBoardColumns(apiKey, org.mondayBoardId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { error: "monday_error", message: msg },
      { status: 502 },
    );
  }

  const result = validateMapping(cleaned, columns);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "invalid_columns",
        message: `These mapped columns no longer exist on the board: ${result.missing.join(", ")}`,
        missing: result.missing,
      },
      { status: 400 },
    );
  }

  await db.org.update({
    where: { id: user.orgId },
    data: { mondayColumnMapping: cleaned },
  });

  return NextResponse.json({ ok: true, mapping: cleaned });
}
