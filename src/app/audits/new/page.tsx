import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Step 1 of the new-audit flow: confirm property + (optionally) copy zones
// from a previous audit. Submitting hits the server action below which
// creates the audit row and redirects to the audit hub.
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
    },
  });
  if (!property) notFound();

  const lastAudit = property.audits[0];
  const hasCopyableZones = (lastAudit?._count.zones ?? 0) > 0;

  async function startAudit(formData: FormData) {
    "use server";
    const u = await requireAuth();
    const copyFrom = formData.get("copyFromAuditId") as string | null;

    // Inline the same logic as POST /api/audits to skip a network hop.
    const source = copyFrom
      ? await db.audit.findFirst({
          where: { id: copyFrom, orgId: u.orgId },
          select: {
            systems: {
              orderBy: { createdAt: "asc" },
              select: {
                systemNumber: true,
                systemName: true,
                controllerBrand: true,
                controllerModel: true,
                controllerLocation: true,
                wiringType: true,
                waterSourceType: true,
                zones: {
                  orderBy: { zoneNumber: "asc" },
                  select: {
                    zoneNumber: true,
                    zoneName: true,
                    zoneType: true,
                    zoneSize: true,
                  },
                },
              },
            },
          },
        })
      : null;

    const audit = await db.$transaction(async (tx) => {
      const a = await tx.audit.create({
        data: {
          orgId: u.orgId,
          propertyId: propertyId!,
          auditorUserId: u.id,
        },
        select: { id: true },
      });
      if (source && source.systems.length > 0) {
        for (const s of source.systems) {
          const sys = await tx.auditSystem.create({
            data: {
              auditId: a.id,
              systemNumber: s.systemNumber,
              systemName: s.systemName,
              controllerBrand: s.controllerBrand,
              controllerModel: s.controllerModel,
              controllerLocation: s.controllerLocation,
              wiringType: s.wiringType,
              waterSourceType: s.waterSourceType,
            },
            select: { id: true },
          });
          if (s.zones.length > 0) {
            await tx.auditZone.createMany({
              data: s.zones.map((z) => ({
                auditId: a.id,
                systemId: sys.id,
                zoneNumber: z.zoneNumber,
                zoneName: z.zoneName,
                zoneType: z.zoneType,
                zoneSize: z.zoneSize,
              })),
            });
          }
        }
      } else {
        await tx.auditSystem.create({
          data: { auditId: a.id, systemNumber: "1" },
        });
      }
      return a;
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
          Confirm the property details and start the inspection.
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
          {hasCopyableZones && lastAudit && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-base">Copy from last audit?</CardTitle>
                <CardDescription>
                  Last audited {formatDate(lastAudit.startedAt)} ·{" "}
                  {lastAudit._count.zones}{" "}
                  {lastAudit._count.zones === 1 ? "zone" : "zones"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="copyFromAuditId"
                    value={lastAudit.id}
                    className="h-5 w-5 rounded border-zinc-300"
                    defaultChecked
                  />
                  <span>
                    Copy systems &amp; zones (skip re-entering the layout)
                  </span>
                </label>
              </CardContent>
            </Card>
          )}

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
