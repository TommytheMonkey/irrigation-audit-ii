import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const user = await requireAuth();

  // Property + every audit on it. Findings count is computed in SQL via
  // _count so we don't have to round-trip per audit.
  const property = await db.property.findFirst({
    where: { id: propertyId, orgId: user.orgId },
    include: {
      audits: {
        orderBy: { startedAt: "desc" },
        include: {
          auditor: { select: { name: true, email: true } },
          _count: { select: { findings: true, systems: true, zones: true } },
        },
      },
    },
  });

  if (!property) notFound();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to properties
          </Link>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-2xl sm:text-3xl">
                  {property.name}
                </CardTitle>
                {property.address && (
                  <CardDescription className="mt-1 text-base">
                    {property.address}
                  </CardDescription>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Property Manager" value={property.propertyManagerName} />
            <Field label="Email" value={property.propertyManagerEmail} />
            <Field label="Phone" value={property.propertyManagerPhone} />
            <Field
              label="Total audits"
              value={property.audits.length.toString()}
            />
          </CardContent>
          <CardFooter>
            <Button
              size="lg"
              className="h-12 w-full sm:w-auto"
              render={
                <Link href={`/audits/new?propertyId=${property.id}`} />
              }
            >
              Start New Audit
            </Button>
          </CardFooter>
        </Card>

        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          Audit history
        </h2>
        {property.audits.length === 0 ? (
          <Card>
            <CardHeader>
              <CardDescription>
                No audits yet. Tap “Start New Audit” above to begin.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {property.audits.map((a) => {
              const isInProgress = a.status === "in_progress";
              const href = isInProgress
                ? `/audits/${a.id}`
                : `/audits/${a.id}/summary`;
              return (
                <Card key={a.id}>
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {formatDate(a.startedAt)}
                        </span>
                        <AuditStatusBadge status={a.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.auditor.name ?? a.auditor.email} ·{" "}
                        {a._count.systems}{" "}
                        {a._count.systems === 1 ? "system" : "systems"} ·{" "}
                        {a._count.zones}{" "}
                        {a._count.zones === 1 ? "zone" : "zones"} ·{" "}
                        {a._count.findings}{" "}
                        {a._count.findings === 1 ? "finding" : "findings"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-11"
                      render={<Link href={href} />}
                    >
                      {isInProgress ? "Resume" : "View"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{value ?? "—"}</dd>
    </div>
  );
}

function AuditStatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    in_progress: { label: "In progress", variant: "default" },
    completed: { label: "Completed", variant: "secondary" },
    exported: { label: "Exported", variant: "secondary" },
    priced: { label: "Priced", variant: "secondary" },
    report_generated: { label: "Reported", variant: "outline" },
  };
  const cfg = map[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
