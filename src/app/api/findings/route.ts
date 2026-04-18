import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type {
  IssueType,
  SolutionAction,
  Severity,
  CostModel,
  UnitOfMeasure,
} from "@prisma/client";

// POST /api/findings — create a finding on a zone (or system-only).
// Body: {
//   auditId, systemId, zoneId?,
//   issueType, componentCategory, componentSubtype?, componentSize?,
//   severity, solutionAction, costModel?, quantity?, unitOfMeasure?,
//   description?, notes?, photoUrls?
// }
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    auditId: string;
    systemId: string;
    zoneId?: string | null;
    issueType: IssueType;
    componentCategory: string;
    componentSubtype?: string | null;
    componentSize?: string | null;
    severity?: Severity;
    solutionAction: SolutionAction;
    costModel?: CostModel;
    quantity?: number | null;
    unitOfMeasure?: UnitOfMeasure;
    description?: string | null;
    notes?: string | null;
    photoUrls?: string[];
  };

  // Tenancy check: ensure the audit belongs to this org.
  const audit = await db.audit.findFirst({
    where: { id: body.auditId, orgId: user.orgId },
    select: { id: true },
  });
  if (!audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const finding = await db.auditFinding.create({
    data: {
      auditId: body.auditId,
      systemId: body.systemId,
      zoneId: body.zoneId ?? null,
      issueType: body.issueType,
      componentCategory: body.componentCategory,
      componentSubtype: body.componentSubtype ?? null,
      componentSize: body.componentSize ?? null,
      severity: body.severity ?? "medium",
      solutionAction: body.solutionAction,
      costModel: body.costModel ?? "time_materials",
      quantity: body.quantity ?? 1,
      unitOfMeasure: body.unitOfMeasure ?? "ea",
      description: body.description ?? null,
      notes: body.notes ?? null,
      photoUrls: body.photoUrls ?? [],
    },
  });
  return NextResponse.json(finding);
}
