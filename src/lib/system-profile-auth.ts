// Shared ownership checks for the property-system profile API routes. Every
// sub-entity (controller, water source, zone, part) is reachable only through
// its parent system, and every system belongs to one org — we verify each
// hop so an auditor in org A can't edit org B's data by guessing an id.

import { db } from "./db";
import { getCurrentUser, type CurrentUser } from "./auth";

type SubResource = "controller" | "waterSource" | "zone" | "part";

export type AuthFail = {
  ok: false;
  status: number;
  body: { error: string; message?: string };
};
export type AuthOk = { ok: true; user: CurrentUser };
export type AuthResult = AuthOk | AuthFail;

export async function requireEditor(): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, status: 401, body: { error: "unauthorized" } };
  }
  if (user.role === "estimator") {
    return { ok: false, status: 403, body: { error: "forbidden" } };
  }
  return { ok: true, user };
}

export async function assertSystemInOrg(
  systemId: string,
  orgId: string,
): Promise<true | AuthFail> {
  const sys = await db.propertySystem.findFirst({
    where: { id: systemId, orgId },
    select: { id: true },
  });
  if (!sys) {
    return { ok: false, status: 404, body: { error: "not_found" } };
  }
  return true;
}

export async function assertSubInOrg(
  kind: SubResource,
  id: string,
  orgId: string,
): Promise<true | AuthFail> {
  let sys: { orgId: string } | null = null;
  if (kind === "controller") {
    const row = await db.propertyController.findUnique({
      where: { id },
      select: { system: { select: { orgId: true } } },
    });
    sys = row?.system ?? null;
  } else if (kind === "waterSource") {
    const row = await db.propertyWaterSource.findUnique({
      where: { id },
      select: { system: { select: { orgId: true } } },
    });
    sys = row?.system ?? null;
  } else if (kind === "zone") {
    const row = await db.propertyZone.findUnique({
      where: { id },
      select: { system: { select: { orgId: true } } },
    });
    sys = row?.system ?? null;
  } else if (kind === "part") {
    const row = await db.propertyPart.findUnique({
      where: { id },
      select: { system: { select: { orgId: true } } },
    });
    sys = row?.system ?? null;
  }
  if (!sys || sys.orgId !== orgId) {
    return { ok: false, status: 404, body: { error: "not_found" } };
  }
  return true;
}
