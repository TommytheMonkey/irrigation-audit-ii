import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createAudit, type AuditSource } from "@/lib/audit-create";

export const dynamic = "force-dynamic";

// Step 1 of the new-audit flow. Confirms the property, then lets the user
// pick a starting point:
//   - From scratch (empty audit)
//   - Copy from last audit (if there is one with zones)
//   - From system profile (if any PropertySystem exists)
// The radio group defaults to "profile" when available, then "last audit",
// else "blank".
export default async function NewAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = await searchParams;
  if (!propertyId) {
    redirect("/");
  }

  const user = await requireAuth();
  const property = await db.property.findFirst({
    where: { id: propertyId, orgId: user.orgId },
    include: {
      audits: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          id: true,
          startedAt: true,
          _count: { select: { zones: true } },
        },
      },
      _count: { select: { systems: true } },
      systems: {
        orderBy: { sortOrder: "asc" },
        select: { _count: { select: { zones: true } } },
      },
    },
  });
  if (!property) notFound();

  const lastAudit = property.audits[0];
  const hasCopyableZones = (lastAudit?._count.zones ?? 0) > 0;
  const hasProfile = property._count.systems > 0;
  const profileZoneCount = property.systems.reduce(
    (n, s) => n + s._count.zones,
    0,
  );
  const defaultSource = hasProfile
    ? "profile"
    : hasCopyableZones
      ? "last_audit"
      : "blank";

  async function startAudit(formData: FormData) {
    "use server";
    const u = await requireAuth();
    const sourceKind = (formData.get("source") as string) ?? "blank";

    let source: AuditSource;
    if (sourceKind === "profile") {
      source = { type: "profile" };
    } else if (sourceKind === "last_audit" && lastAudit) {
      source = { type: "previous_audit", auditId: lastAudit.id };
    } else {
      source = { type: "blank" };
    }

    const audit = await createAudit({
      orgId: u.orgId,
      propertyId: propertyId!,
      auditorUserId: u.id,
      source,
    });

    redirect(`/audits/${audit.id}`);
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Link
            href={`/properties/${property.id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Cancel
          </Link>
        </div>

        <h1 className="mb-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          New audit
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Confirm the property and pick a starting point.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{property.name}</CardTitle>
            {property.address && (
              <CardDescription>{property.address}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Property Manager
                </dt>
                <dd className="mt-0.5 text-sm">
                  {property.propertyManagerName ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Phone
                </dt>
                <dd className="mt-0.5 text-sm">
                  {property.propertyManagerPhone ?? "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <form action={startAudit}>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">Starting point</CardTitle>
              <CardDescription>
                Pre-populate systems and zones so you&apos;re not re-entering
                the layout from scratch.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {hasProfile && (
                <SourceOption
                  name="source"
                  value="profile"
                  defaultChecked={defaultSource === "profile"}
                  title="From system profile"
                  subtitle={`${property._count.systems} ${property._count.systems === 1 ? "system" : "systems"} · ${profileZoneCount} ${profileZoneCount === 1 ? "zone" : "zones"} already documented`}
                  recommended
                />
              )}
              {hasCopyableZones && lastAudit && (
                <SourceOption
                  name="source"
                  value="last_audit"
                  defaultChecked={defaultSource === "last_audit"}
                  title="Copy from last audit"
                  subtitle={`Last audited ${formatDate(lastAudit.startedAt)} · ${lastAudit._count.zones} ${lastAudit._count.zones === 1 ? "zone" : "zones"}`}
                />
              )}
              <SourceOption
                name="source"
                value="blank"
                defaultChecked={defaultSource === "blank"}
                title="Start blank"
                subtitle="Single system, no zones. Add them as you go."
              />
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              type="submit"
              size="lg"
              className="h-12 flex-1 text-base"
            >
              Begin Audit
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}

function SourceOption({
  name,
  value,
  defaultChecked,
  title,
  subtitle,
  recommended,
}: {
  name: string;
  value: string;
  defaultChecked: boolean;
  title: string;
  subtitle: string;
  recommended?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-3 transition-colors hover:bg-zinc-50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 dark:border-zinc-800 dark:hover:bg-zinc-900/40">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {recommended && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              Recommended
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </label>
  );
}
