import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { PropertyList } from "./property-list";
import { Building2, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireAuth();

  const [properties, org] = await Promise.all([
    db.property.findMany({
      where: { orgId: user.orgId, syncStatus: { not: "removed" } },
      orderBy: { createdAt: "desc" },
      include: {
        audits: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
          },
        },
        _count: { select: { audits: true } },
      },
    }),
    db.org.findUniqueOrThrow({
      where: { id: user.orgId },
      select: { mondayBoardId: true, propertiesSyncedAt: true },
    }),
  ]);

  const mondayConfigured = org.mondayBoardId !== null;
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;
  const isStale =
    mondayConfigured &&
    (org.propertiesSyncedAt === null ||
      Date.now() - org.propertiesSyncedAt.getTime() > STALE_MS);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {/* Page header */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Properties
            </h1>
            <p className="mt-1 text-muted-foreground">
              {properties.length}{" "}
              {properties.length === 1 ? "property" : "properties"} in your portfolio
            </p>
          </div>
        </div>

        {mondayConfigured && (
          <SyncBanner
            syncedAt={org.propertiesSyncedAt}
            isStale={isStale}
            canSync={user.role === "admin"}
          />
        )}

        {properties.length === 0 ? (
          <EmptyState />
        ) : (
          <PropertyList properties={properties} />
        )}
      </main>
    </>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardHeader className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Building2 className="h-7 w-7 text-muted-foreground" />
        </div>
        <CardTitle className="text-xl">No properties yet</CardTitle>
        <CardDescription className="mx-auto mt-2 max-w-sm">
          Connect Monday.com from{" "}
          <Link href="/settings?tab=integrations" className="font-medium text-primary hover:underline">
            Settings
          </Link>{" "}
          to sync your board, or run{" "}
          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
            npm run db:seed:demo
          </code>{" "}
          to load demo properties.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function SyncBanner({
  syncedAt,
  isStale,
  canSync,
}: {
  syncedAt: Date | null;
  isStale: boolean;
  canSync: boolean;
}) {
  return (
    <div
      className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${
        isStale
          ? "bg-accent/50 text-foreground"
          : "bg-muted text-muted-foreground"
      }`}
    >
      <div className="flex items-center gap-2">
        <RefreshCw className={`h-4 w-4 ${isStale ? "text-primary" : ""}`} />
        <span>
          {syncedAt ? (
            <>
              <span className="font-medium">Monday sync:</span>{" "}
              {isStale ? "stale — " : ""}last synced {formatRelative(syncedAt)}
            </>
          ) : (
            <>
              <span className="font-medium">Monday connected</span> but no sync
              has run yet.
            </>
          )}
        </span>
      </div>
      {canSync && (
        <Link
          href="/settings?tab=integrations"
          className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Sync now
        </Link>
      )}
    </div>
  );
}
