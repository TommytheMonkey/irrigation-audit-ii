import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertSystemInOrg, requireEditor } from "@/lib/system-profile-auth";

type Body = {
  name?: string;
  onSiteContactName?: string | null;
  onSiteContactEmail?: string | null;
  onSiteContactPhone?: string | null;
  onSiteContactRole?: string | null;
  backflowType?: string | null;
  backflowSize?: string | null;
  backflowStatus?: string | null;
  backflowLastTestedAt?: string | null;
  backflowNotes?: string | null;
  notes?: string | null;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ systemId: string }> },
) {
  const { systemId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const owns = await assertSystemInOrg(systemId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const norm = (v: string | null | undefined) =>
    v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim();

  const updated = await db.propertySystem.update({
    where: { id: systemId },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.onSiteContactName !== undefined && {
        onSiteContactName: norm(body.onSiteContactName),
      }),
      ...(body.onSiteContactEmail !== undefined && {
        onSiteContactEmail: norm(body.onSiteContactEmail),
      }),
      ...(body.onSiteContactPhone !== undefined && {
        onSiteContactPhone: norm(body.onSiteContactPhone),
      }),
      ...(body.onSiteContactRole !== undefined && {
        onSiteContactRole: norm(body.onSiteContactRole),
      }),
      ...(body.backflowType !== undefined && {
        backflowType: norm(body.backflowType),
      }),
      ...(body.backflowSize !== undefined && {
        backflowSize: norm(body.backflowSize),
      }),
      ...(body.backflowStatus !== undefined && {
        backflowStatus: norm(body.backflowStatus),
      }),
      ...(body.backflowLastTestedAt !== undefined && {
        backflowLastTestedAt: body.backflowLastTestedAt
          ? new Date(body.backflowLastTestedAt)
          : null,
      }),
      ...(body.backflowNotes !== undefined && {
        backflowNotes: norm(body.backflowNotes),
      }),
      ...(body.notes !== undefined && { notes: norm(body.notes) }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ systemId: string }> },
) {
  const { systemId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const owns = await assertSystemInOrg(systemId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }

  await db.propertySystem.delete({ where: { id: systemId } });
  return NextResponse.json({ ok: true });
}
