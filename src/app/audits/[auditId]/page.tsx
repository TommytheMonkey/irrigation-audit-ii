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
import { AppHeader } from "@/components/app-header";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { AddZoneForm } from "./add-zone-form";
import { CompleteAuditButton } from "./complete-audit-button";
import {
  ArrowLeft,
  Layers,
  AlertCircle,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

export const dynamic = "force-dynamic";

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
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {/* Back link */}
        <Link
          href={`/properties/${audit.property.id}`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {audit.property.name}
        </Link>

        {/* Page header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Audit in progress
            </h1>
            <p className="mt-2 flex items-center gap-4 text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Layers className="h-4 w-4" />
                {audit._count.zones} {audit._count.zones === 1 ? "zone" : "zones"}
              </span>
              <span className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                {audit._count.findings}{" "}
                {audit._count.findings === 1 ? "finding" : "findings"}
              </span>
            </p>
          </div>
          <Badge variant="default" className="rounded-full px-3 py-1 text-xs font-semibold">
            In progress
          </Badge>
        </div>

        {/* System card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              System {primarySystem?.systemNumber ?? "1"}
            </CardTitle>
            <CardDescription>
              {primarySystem?.systemName ??
                "Single irrigation system. Multiple-system support coming soon."}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Zones section */}
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold tracking-tight text-foreground">
            Zones
          </h2>

          {audit.systems.map((system) => (
            <div key={system.id} className="space-y-3">
              {system.zones.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
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
                    <Card className="group transition-all hover:shadow-md active:scale-[0.99]">
                      <CardContent className="flex items-center gap-4 py-4">
                        {/* Zone number badge */}
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold tabular-nums text-primary">
                          {z.zoneNumber}
                        </div>

                        {/* Zone info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-semibold text-foreground">
                              {z.zoneName ?? `Zone ${z.zoneNumber}`}
                            </span>
                            {z.completedAt && (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                            )}
                          </div>
                          <div className="mt-0.5 text-sm text-muted-foreground">
                            {z.zoneType} · {z._count.findings}{" "}
                            {z._count.findings === 1 ? "finding" : "findings"}
                          </div>
                        </div>

                        {/* Arrow */}
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
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
        </div>

        {/* Complete button */}
        <div className="pt-4">
          <CompleteAuditButton
            auditId={audit.id}
            disabled={audit._count.zones === 0}
          />
        </div>
      </main>
    </>
  );
}
