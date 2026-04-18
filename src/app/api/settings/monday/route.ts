import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";

// PATCH /api/settings/monday
//
// Stores the Monday.com integration creds. The API key is encrypted at rest
// (Monday.com keys are sensitive — they grant full board access). Sending
// `apiKey: null` clears it; sending no `apiKey` field leaves it untouched.
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    apiKey?: string | null;
    boardId?: string | null;
  };

  await db.org.update({
    where: { id: user.orgId },
    data: {
      ...(body.apiKey !== undefined && {
        mondayApiKeyEnc:
          body.apiKey === null || body.apiKey.trim() === ""
            ? null
            : encrypt(body.apiKey.trim()),
      }),
      ...(body.boardId !== undefined && {
        mondayBoardId:
          body.boardId === null || body.boardId.trim() === ""
            ? null
            : body.boardId.trim(),
      }),
    },
  });

  return NextResponse.json({ ok: true });
}
