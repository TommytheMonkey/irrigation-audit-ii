"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { formatRelative } from "@/lib/format";
import { PropertyMap } from "@/components/property-map";

type AuditLite = {
  id: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
};

export type PropertyListItem = {
  id: string;
  name: string;
  address: string | null;
  propertyManagerName: string | null;
  mondayItemId: string | null;
  latitude: number | null;
  longitude: number | null;
  audits: AuditLite[];
  _count: { audits: number };
};

type ViewMode = "list" | "map";
type SortMode = "name" | "last_audit" | "total_audits";
type SyncFilter = "all" | "monday" | "manual";

const AUDIT_STATUSES = [
  "in_progress",
  "completed",
  "exported",
  "priced",
  "report_generated",
] as const;
type AuditStatusFilter = "all" | (typeof AUDIT_STATUSES)[number] | "none";

export function PropertyList({ properties }: { properties: PropertyListItem[] }) {
  const [view, setView] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [pmFilter, setPmFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<AuditStatusFilter>("all");
  const [syncFilter, setSyncFilter] = useState<SyncFilter>("all");

  // Distinct PM names, sorted alphabetically — drives the PM dropdown.
  const pmOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of properties) {
      if (p.propertyManagerName) set.add(p.propertyManagerName);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [properties]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = properties.filter((p) => {
      if (q) {
        const hit =
          p.name.toLowerCase().includes(q) ||
          (p.address?.toLowerCase().includes(q) ?? false) ||
          (p.propertyManagerName?.toLowerCase().includes(q) ?? false);
        if (!hit) return false;
      }
      if (pmFilter !== "all") {
        if (p.propertyManagerName !== pmFilter) return false;
      }
      if (syncFilter === "monday" && p.mondayItemId === null) return false;
      if (syncFilter === "manual" && p.mondayItemId !== null) return false;
      if (statusFilter !== "all") {
        const latest = p.audits[0];
        if (statusFilter === "none") {
          if (latest) return false;
        } else {
          if (!latest || latest.status !== statusFilter) return false;
        }
      }
      return true;
    });
    const sorted = [...matches];
    sorted.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "last_audit") {
        const ta = a.audits[0]?.startedAt.getTime() ?? 0;
        const tb = b.audits[0]?.startedAt.getTime() ?? 0;
        return tb - ta;
      }
      return b._count.audits - a._count.audits;
    });
    return sorted;
  }, [properties, query, sort, pmFilter, statusFilter, syncFilter]);

  const filtersActive =
    query.trim() !== "" ||
    pmFilter !== "all" ||
    statusFilter !== "all" ||
    syncFilter !== "all";

  return (
    <>
      {/* View toggle */}
      <div className="mb-3 flex items-center gap-2">
        <ViewToggle value={view} onChange={setView} />
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {properties.length}
        </span>
      </div>

      {/* Search + sort + filters */}
      <div className="mb-4 flex flex-col gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, address, or PM…"
          className="h-11"
          aria-label="Search properties"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <LabeledSelect
            label="Sort"
            value={sort}
            onChange={(v) => setSort(v as SortMode)}
          >
            <option value="name">Name (A–Z)</option>
            <option value="last_audit">Last audit (recent)</option>
            <option value="total_audits">Total audits</option>
          </LabeledSelect>

          <LabeledSelect
            label="PM"
            value={pmFilter}
            onChange={(v) => setPmFilter(v)}
          >
            <option value="all">All PMs</option>
            {pmOptions.map((pm) => (
              <option key={pm} value={pm}>
                {pm}
              </option>
            ))}
          </LabeledSelect>

          <LabeledSelect
            label="Last audit"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as AuditStatusFilter)}
          >
            <option value="all">Any status</option>
            <option value="none">Never audited</option>
            {AUDIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {labelForStatus(s)}
              </option>
            ))}
          </LabeledSelect>

          <LabeledSelect
            label="Source"
            value={syncFilter}
            onChange={(v) => setSyncFilter(v as SyncFilter)}
          >
            <option value="all">All sources</option>
            <option value="monday">Monday only</option>
            <option value="manual">Manual only</option>
          </LabeledSelect>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No matches</CardTitle>
            <CardDescription>
              {filtersActive
                ? "Try loosening your filters."
                : "No properties to show."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : view === "map" ? (
        <PropertyMap properties={filtered} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      )}
    </>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="inline-flex overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800"
    >
      <ToggleButton active={value === "list"} onClick={() => onChange("list")}>
        List
      </ToggleButton>
      <ToggleButton active={value === "map"} onClick={() => onChange("map")}>
        Map
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
      }`}
    >
      {children}
    </button>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        {children}
      </select>
    </label>
  );
}

function PropertyCard({ property: p }: { property: PropertyListItem }) {
  const latest = p.audits[0];
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base sm:text-lg">
              {p.name}
            </CardTitle>
            {p.address && (
              <CardDescription className="mt-0.5 truncate">
                {p.address}
              </CardDescription>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {latest && <AuditStatusBadge status={latest.status} />}
            {p.mondayItemId && (
              <span
                className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                title="Synced from Monday.com"
              >
                Monday
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <dl className="grid grid-cols-2 gap-y-1 text-xs sm:text-sm">
          <dt className="text-muted-foreground">PM</dt>
          <dd className="truncate text-right">
            {p.propertyManagerName ?? "—"}
          </dd>
          <dt className="text-muted-foreground">Last audit</dt>
          <dd className="truncate text-right">
            {latest ? formatRelative(latest.startedAt) : "Never"}
          </dd>
          <dt className="text-muted-foreground">Total audits</dt>
          <dd className="truncate text-right tabular-nums">
            {p._count.audits}
          </dd>
        </dl>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          variant="outline"
          size="lg"
          className="h-11 flex-1"
          render={<Link href={`/properties/${p.id}`} />}
        >
          View
        </Button>
        <Button
          size="lg"
          className="h-11 flex-1"
          render={<Link href={`/audits/new?propertyId=${p.id}`} />}
        >
          Start Audit
        </Button>
      </CardFooter>
    </Card>
  );
}

function AuditStatusBadge({ status }: { status: string }) {
  const cfg = statusConfig(status);
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function statusConfig(status: string): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    in_progress: { label: "In progress", variant: "default" },
    completed: { label: "Completed", variant: "secondary" },
    exported: { label: "Exported", variant: "secondary" },
    priced: { label: "Priced", variant: "secondary" },
    report_generated: { label: "Reported", variant: "outline" },
  };
  return map[status] ?? { label: status, variant: "secondary" as const };
}

function labelForStatus(s: string): string {
  return statusConfig(s).label;
}
