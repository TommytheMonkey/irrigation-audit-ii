import { Card, CardContent } from "@/components/ui/card";
import { ConfigCardActions } from "./config-card-actions";

// Settings → Config tab. Lifted out of the original settings/page.tsx so the
// page is now just a tab dispatcher. Functionality is unchanged.
export function ConfigTab({
  initialized,
  isMock,
  syncedAt,
  mockPath,
  hasMockFile,
  componentCount,
  quickPickCount,
  severityCount,
}: {
  initialized: boolean;
  isMock: boolean;
  syncedAt: Date | null;
  mockPath: string | null;
  hasMockFile: boolean;
  componentCount: number;
  quickPickCount: number;
  severityCount: number;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Config sheet</h2>
            <p className="text-sm text-muted-foreground">
              Reference data for components, quick-picks, and severity levels.
              Edit the sheet, then sync to apply changes to the audit UI.
            </p>
          </div>
          <StatusPill initialized={initialized} isMock={isMock} syncedAt={syncedAt} />
        </div>

        {initialized ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Components" value={componentCount} />
            <Stat label="Quick picks" value={quickPickCount} />
            <Stat label="Severity levels" value={severityCount} />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-muted-foreground dark:border-zinc-700">
            Not initialized yet. Click below to snapshot the global defaults
            into your org&apos;s config so you can start editing.
          </div>
        )}

        {isMock && mockPath && (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>Dev mode:</strong> the &quot;sheet&quot; is a JSON file at
            <code className="ml-1 break-all rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/40">
              {mockPath}
            </code>
            . Edit it by hand, then click <em>Sync now</em>.
          </div>
        )}

        <ConfigCardActions initialized={initialized} hasMockFile={hasMockFile} />
      </CardContent>
    </Card>
  );
}

function StatusPill({
  initialized,
  isMock,
  syncedAt,
}: {
  initialized: boolean;
  isMock: boolean;
  syncedAt: Date | null;
}) {
  if (!initialized) {
    return (
      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        Not initialized
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
      {isMock ? "Mock" : "Synced"}
      {syncedAt && ` · ${formatRelative(syncedAt)}`}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function formatRelative(d: Date): string {
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
