import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import { fetchBoardColumns, autoMatchColumns } from "@/lib/monday";

// GET /api/monday/columns?boardId=…
//
// Returns the list of columns on the given Monday board plus an auto-matched
// mapping suggestion. The board id may be passed as a query param (used by
// onboarding before the board id has been persisted) or omitted to use the
// org's saved board id (used by settings re-mapping).
//
// Admin-only: this is a config-surface read, not used by audit-flow pages.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const queryBoardId = url.searchParams.get("boardId");

  const org = await db.org.findUniqueOrThrow({
    where: { id: user.orgId },
    select: { mondayApiKeyEnc: true, mondayBoardId: true },
  });

  const boardId = queryBoardId?.trim() || org.mondayBoardId;
  if (!boardId) {
    return NextResponse.json(
      { error: "missing_board", message: "No board id provided or saved." },
      { status: 400 },
    );
  }
  if (!org.mondayApiKeyEnc) {
    return NextResponse.json(
      { error: "missing_api_key", message: "Monday API key not set." },
      { status: 400 },
    );
  }

  const apiKey =
    process.env.MONDAY_MOCK === "true" ? "mock" : decrypt(org.mondayApiKeyEnc);

  try {
    const columns = await fetchBoardColumns(apiKey, boardId);
    const suggested = autoMatchColumns(columns);
    return NextResponse.json({ columns, suggested });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { error: "monday_error", message: msg },
      { status: 502 },
    );
  }
}
