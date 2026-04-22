import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  getOrgComponentTypes,
  getOrgQuickPicks,
  getOrgSeverityLevels,
} from "@/lib/config";
import {
  ZoneAudit,
  type ZoneNavItem,
  type QuickPickRow,
  type ComponentTypeRow,
  type FindingRow,
  type SeverityLevelRow,
} from "./zone-audit";

export const dynamic = "force-dynamic";

// THE CRITICAL SCREEN. Server component does all the data fetching; the
// interactive form lives in zone-audit.tsx as a client island so the auditor
// can rapid-fire findings without round-trips for every keystroke.
export default async function ZoneAuditPage({
  params,
}: {
  params: Promise<{ auditId: string; zoneId: string }>;
}) {
  const { auditId, zoneId } = await params;
  const user = await requireAuth();

  // One round-trip via Promise.all. Reference data flows through the
  // org-scoped helpers so any rows the org has synced from their config sheet
  // override the global defaults entirely (see src/lib/config.ts).
  const [audit, zone, siblings, findings, componentTypes, quickPicks, severityLevels, sitePlan] =
    await Promise.all([
      db.audit.findFirst({
        where: { id: auditId, orgId: user.orgId },
        select: {
          id: true,
          property: { select: { id: true, name: true } },
        },
      }),
      db.auditZone.findFirst({
        where: { id: zoneId, audit: { orgId: user.orgId } },
        select: {
          id: true,
          systemId: true,
          zoneNumber: true,
          zoneName: true,
          zoneType: true,
          completedAt: true,
        },
      }),
      db.auditZone.findMany({
        where: { auditId, audit: { orgId: user.orgId } },
        orderBy: { zoneNumber: "asc" },
        select: {
          id: true,
          zoneNumber: true,
          zoneName: true,
          completedAt: true,
          _count: { select: { findings: true } },
        },
      }),
      db.auditFinding.findMany({
        where: { zoneId, audit: { orgId: user.orgId } },
        orderBy: { createdAt: "desc" },
      }),
      getOrgComponentTypes(user.orgId),
      getOrgQuickPicks(user.orgId),
      getOrgSeverityLevels(user.orgId),
      // Site plan for pin-on-map flow
      db.propertyFile.findFirst({
        where: {
          property: { audits: { some: { id: auditId } } },
          isFullSitePlan: true,
        },
        select: {
          id: true,
          blobUrl: true,
          mimeType: true,
          sitePlanRender: {
            select: { renderUrl: true, width: true, height: true, status: true },
          },
        },
      }),
    ]);

  if (!audit || !zone) notFound();

  // Existing pinned findings across all zones in this audit — shown as
  // context markers when the user pins a new finding on the site plan.
  const existingPins = await db.auditFinding.findMany({
    where: { auditId, sitePlanX: { not: null }, sitePlanY: { not: null } },
    select: {
      id: true,
      sitePlanX: true,
      sitePlanY: true,
      severity: true,
      zoneId: true,
    },
  });

  const sitePlanForClient =
    sitePlan?.sitePlanRender?.status === "READY"
      ? {
          fileId: sitePlan.id,
          renderUrl: sitePlan.sitePlanRender.renderUrl,
          width: sitePlan.sitePlanRender.width,
          height: sitePlan.sitePlanRender.height,
          existingPins: existingPins.map((p) => ({
            id: p.id,
            x: p.sitePlanX!,
            y: p.sitePlanY!,
            severity: p.severity,
            isCurrentZone: p.zoneId === zoneId,
          })),
        }
      : null;

  // Strip Decimal types for the client island — Prisma's Decimal isn't
  // serializable across the RSC → client boundary.
  const findingsForClient: FindingRow[] = findings.map((f) => ({
    id: f.id,
    issueType: f.issueType,
    componentCategory: f.componentCategory,
    componentSubtype: f.componentSubtype,
    componentSize: f.componentSize,
    severity: f.severity,
    solutionAction: f.solutionAction,
    quantity: f.quantity ? Number(f.quantity) : null,
    unitOfMeasure: f.unitOfMeasure,
    description: f.description,
    notes: f.notes,
    photoUrls: f.photoUrls,
  }));

  const navItems: ZoneNavItem[] = siblings.map((s) => ({
    id: s.id,
    zoneNumber: s.zoneNumber,
    zoneName: s.zoneName,
    completed: s.completedAt !== null,
    findingCount: s._count.findings,
  }));

  const quickPickRows: QuickPickRow[] = quickPicks.map((q) => ({
    id: q.id,
    section: q.section,
    label: q.label,
    issueType: q.issueType,
    componentCategory: q.componentCategory,
    componentSubtype: q.componentSubtype,
    componentSize: q.componentSize,
    defaultSolution: q.defaultSolution,
    defaultCostModel: q.defaultCostModel,
    defaultUom: q.defaultUom,
    defaultSeverity: q.defaultSeverity,
  }));

  const componentTypeRows: ComponentTypeRow[] = componentTypes.map((c) => ({
    id: c.id,
    category: c.category,
    name: c.name,
    subtypes: Array.isArray(c.subtypes) ? (c.subtypes as string[]) : [],
  }));

  const severityLevelRows: SeverityLevelRow[] = severityLevels.map((s) => ({
    severity: s.severity,
    name: s.name,
    color: s.color,
    label: s.label,
    sortOrder: s.sortOrder,
  }));

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 sm:px-6 sm:py-6">
        <div className="mb-3">
          <Link
            href={`/audits/${audit.id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {audit.property.name}
          </Link>
        </div>

        <ZoneAudit
          auditId={audit.id}
          systemId={zone.systemId}
          zoneId={zone.id}
          zoneNumber={zone.zoneNumber}
          zoneName={zone.zoneName}
          zoneType={zone.zoneType}
          completed={zone.completedAt !== null}
          propertyId={audit.property.id}
          propertyName={audit.property.name}
          navItems={navItems}
          initialFindings={findingsForClient}
          quickPicks={quickPickRows}
          componentTypes={componentTypeRows}
          severityLevels={severityLevelRows}
          sitePlan={sitePlanForClient}
        />
      </main>
    </>
  );
}
