import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { AddZoneForm } from "./add-zone-form";
import { CompleteAuditButton } from "./complete-audit-button";

export const dynamic = "force-dynamic";

// Audit hub: collapses "systems" and "zones" steps from the spec into a
// single editable page. The auditor lands here right after creating an
// audit, sees their zones, can add more, and taps any zone to begin
// inspecting it. "Complete Audit" lives at the bottom.
export default async function AuditHubPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const user = await requireAuth();

  const audit = await db.audit.findFirst({
    where: { id: auditId, orgId: user.orgId },
    include: {
      property: true,
      systems: {
        orderBy: { createdAt: "asc" },
        include: {
          zones: {
            orderBy: { zoneNumber: "asc" },
            include: { _count: { select: { findings: true } } },
          },
        },
      },
      _count: { select: { findings: true, zones: true } },
    },
  });
  if (!audit) notFound();

  const primarySystem = audit.systems[0];

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Link
            href={`/properties/${audit.property.id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {audit.property.name}
          </Link>
        </div>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Audit in progress
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {audit._count.zones} {audit._count.zones === 1 ? "zone" : "zones"}{" "}
              · {audit._count.findings}{" "}
              {audit._count.findings === 1 ? "finding" : "findings"}
            </p>
          </div>
          <Badge variant="default">In progress</Badge>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">
              System {primarySystem?.systemNumber ?? "1"}
            </CardTitle>
            <CardDescription>
              {primarySystem?.systemName ??
                "Single irrigation system. Multiple-system support coming soon."}
            </CardDescription>
          </CardHeader>
        </Card>

        <h2 className="mb-3 text-lg font-semibold tracking-tight">Zones</h2>

        {audit.systems.map((system) => (
          <div key={system.id} className="mb-4 flex flex-col gap-2">
            {system.zones.length === 0 ? (
              <Card>
                <CardContent className="text-sm text-muted-foreground">
                  No zones yet. Add the first zone below.
                </CardContent>
              </Card>
            ) : (
              system.zones.map((z) => (
                <Link
                  key={z.id}
                  href={`/audits/${audit.id}/zones/${z.id}`}
                  className="block"
                >
                  <Card className="transition-colors hover:bg-muted/50 active:bg-muted">
                    <CardContent className="flex items-center justify-between gap-3">
                      <div className="flex flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold tabular-nums text-primary">
                          {z.zoneNumber}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {z.zoneName ?? `Zone ${z.zoneNumber}`}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {z.zoneType} ·{" "}
                            {z._count.findings}{" "}
                            {z._count.findings === 1 ? "finding" : "findings"}
                            {z.completedAt && " · ✓ done"}
                          </div>
                        </div>
                      </div>
                      <span className="text-xl text-muted-foreground">›</span>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
            <AddZoneForm
              auditId={audit.id}
              systemId={system.id}
              nextZoneNumber={
                (system.zones[system.zones.length - 1]?.zoneNumber ?? 0) + 1
              }
            />
          </div>
        ))}

        <div className="mt-8">
          <CompleteAuditButton
            auditId={audit.id}
            disabled={audit._count.zones === 0}
          />
        </div>
      </main>
    </>
  );
}
