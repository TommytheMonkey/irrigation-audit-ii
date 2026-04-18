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

// Server component — runs on every request, queries Neon directly via the
// pg adapter. Mobile-first dashboard: property cards, tap to drill in.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireAuth();

  // Pull properties + the org's Monday sync state in parallel. We exclude
  // properties whose Monday item was removed since the last sync (still in
  // the table for audit-history continuity, but shouldn't clutter the grid).
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
  // 7-day staleness threshold — beyond that we nudge the user to re-sync.
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;
  const isStale =
    mondayConfigured &&
    (org.propertiesSyncedAt === null ||
      Date.now() - org.propertiesSyncedAt.getTime() > STALE_MS);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Properties
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {properties.length}{" "}
              {properties.length === 1 ? "property" : "properties"}
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
    <Card>
      <CardHeader>
        <CardTitle>No properties yet</CardTitle>
        <CardDescription>
          Connect Monday.com from{" "}
          <Link href="/settings?tab=integrations" className="underline">
            Settings → Integrations
          </Link>{" "}
          to sync your board, or run{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            npm run db:seed:demo
          </code>{" "}
          to load demo properties.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

// Banner above the property grid that shows last-sync state. Stale (>7d) or
// never-synced gets an amber tint to nudge the user; healthy is plain.
function SyncBanner({
  syncedAt,
  isStale,
  canSync,
}: {
  syncedAt: Date | null;
  isStale: boolean;
  canSync: boolean;
}) {
  const tone = isStale
    ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
    : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300";
  return (
    <div
      className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-2.5 text-sm ${tone}`}
    >
      <div>
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
      </div>
      {canSync && (
        <Link
          href="/settings?tab=integrations"
          className="text-xs font-medium underline"
        >
          Sync now
        </Link>
      )}
    </div>
  );
}

