import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { PropertyProfile } from "./property-profile";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const user = await requireAuth();

  const property = await db.property.findFirst({
    where: { id: propertyId, orgId: user.orgId },
    include: {
      systems: {
        orderBy: { sortOrder: "asc" },
        include: {
          controllers: { orderBy: { sortOrder: "asc" } },
          waterSources: { orderBy: { sortOrder: "asc" } },
          zones: { orderBy: { zoneNumber: "asc" } },
          parts: { orderBy: { createdAt: "asc" } },
          files: { orderBy: { createdAt: "desc" } },
        },
      },
      files: { orderBy: { uploadedAt: "desc" } },
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

  const canEdit = user.role !== "estimator";

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            ← Back to properties
          </Link>
        </div>

        <PropertyProfile
          property={{
            id: property.id,
            name: property.name,
            address: property.address,
            city: property.city,
            state: property.state,
            zip: property.zip,
            setupStatus: property.setupStatus,
            propertyManagerName: property.propertyManagerName,
            propertyManagerEmail: property.propertyManagerEmail,
            propertyManagerPhone: property.propertyManagerPhone,
          }}
          systems={property.systems}
          propertyFiles={property.files}
          audits={property.audits}
          canEdit={canEdit}
        />
      </main>
    </>
  );
}
