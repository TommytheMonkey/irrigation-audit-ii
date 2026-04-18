import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST /api/onboarding/complete
//
// Flips the onboarding gate. After this returns, requireAuth() will stop
// redirecting the user to /onboarding and they land on the dashboard.
// Idempotent — safe to call again, no-op if already true.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await db.org.update({
    where: { id: user.orgId },
    data: { onboardingComplete: true },
  });

  return NextResponse.json({ ok: true });
}
