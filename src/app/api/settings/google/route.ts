import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// DELETE /api/settings/google
//
// Disconnects the org's Google account: nukes the encrypted refresh token
// and the connected email. The actual OAuth grant on Google's side is left
// alone — the user can revoke it from their Google account if they want a
// fully clean break.
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await db.org.update({
    where: { id: user.orgId },
    data: {
      googleCredentialsEnc: null,
      googleConnectedEmail: null,
      googleDriveFolderId: null,
    },
  });

  return NextResponse.json({ ok: true });
}
