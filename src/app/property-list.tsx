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
import {
  Search,
  LayoutGrid,
  Map,
  ChevronRight,
  Calendar,
  User,
  ClipboardList,
  Plus,
} from "lucide-react";

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
      {/* Search and controls */}
      <div className="mb-6 space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search properties..."
            className="h-12 rounded-xl bg-card pl-11 text-base shadow-sm transition-shadow focus-visible:shadow-md"
            aria-label="Search properties"
          />
        </div>

        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-3">
          <ViewToggle value={view} onChange={setView} />

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <FilterSelect
              value={sort}
              onChange={(v) => setSort(v as SortMode)}
              options={[
                { value: "name", label: "Name" },
                { value: "last_audit", label: "Recent" },
                { value: "total_audits", label: "Most audits" },
              ]}
            />

            {pmOptions.length > 0 && (
              <FilterSelect
                value={pmFilter}
                onChange={setPmFilter}
                options={[
                  { value: "all", label: "All PMs" },
                  ...pmOptions.map((pm) => ({ value: pm, label: pm })),
                ]}
              />
            )}

            <FilterSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as AuditStatusFilter)}
              options={[
                { value: "all", label: "Any status" },
                { value: "none", label: "Never audited" },
                ...AUDIT_STATUSES.map((s) => ({
                  value: s,
                  label: labelForStatus(s),
                })),
              ]}
            />
          </div>

          <span className="text-sm text-muted-foreground">
            {filtered.length} of {properties.length}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="py-12 text-center">
            <CardTitle className="text-lg">No matches</CardTitle>
            <CardDescription>
              {filtersActive
                ? "Try loosening your filters."
                : "No properties to show."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : view === "map" ? (
        <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
          <PropertyMap properties={filtered} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
      className="inline-flex overflow-hidden rounded-lg border border-border bg-card p-1"
    >
      <ToggleButton
        active={value === "list"}
        onClick={() => onChange("list")}
        icon={<LayoutGrid className="h-4 w-4" />}
        label="Grid"
      />
      <ToggleButton
        active={value === "map"}
        onClick={() => onChange("map")}
        icon={<Map className="h-4 w-4" />}
        label="Map"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function PropertyCard({ property: p }: { property: PropertyListItem }) {
  const latest = p.audits[0];
  return (
    // `min-w-0` on the Card itself is critical: CSS Grid items default to
    // min-width:auto, which lets a long property name push the grid column
    // wider than its share. With min-w-0 the card stays exactly in its
    // column and the title's `truncate` can do its job.
    <Card className="group flex min-w-0 flex-col overflow-hidden transition-all hover:shadow-lg">
      <CardHeader className="min-w-0 pb-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg font-semibold">
              {p.name}
            </CardTitle>
            {p.address && (
              <CardDescription className="mt-1 truncate text-sm">
                {p.address}
              </CardDescription>
            )}
          </div>
          <div className="flex max-w-[45%] shrink-0 flex-col items-end gap-1.5">
            {latest && <AuditStatusBadge status={latest.status} />}
            {p.mondayItemId && (
              <span className="max-w-full truncate rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                Monday
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 pb-4">
        <div className="space-y-2">
          <DataRow
            icon={<User className="h-3.5 w-3.5" />}
            label="PM"
            value={p.propertyManagerName ?? "Not assigned"}
          />
          <DataRow
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Last audit"
            value={latest ? formatRelative(latest.startedAt) : "Never"}
          />
          <DataRow
            icon={<ClipboardList className="h-3.5 w-3.5" />}
            label="Total audits"
            value={p._count.audits.toString()}
          />
        </div>
      </CardContent>

      <CardFooter className="gap-2 border-t border-border bg-muted/30 pt-4">
        <Button
          variant="outline"
          size="lg"
          className="h-10 flex-1 rounded-lg font-medium"
          render={<Link href={`/properties/${p.id}`} />}
        >
          View
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
        <Button
          size="lg"
          className="h-10 flex-1 gap-1.5 rounded-lg font-medium shadow-sm transition-all hover:shadow-md"
          render={<Link href={`/audits/new?propertyId=${p.id}`} />}
        >
          <Plus className="h-4 w-4" />
          Audit
        </Button>
      </CardFooter>
    </Card>
  );
}

function DataRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function AuditStatusBadge({ status }: { status: string }) {
  const cfg = statusConfig(status);
  return (
    <Badge
      variant={cfg.variant}
      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
    >
      {cfg.label}
    </Badge>
  );
}

function statusConfig(status: string): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
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
  return map[status] ?? { label: status, variant: "secondary" as const };
}

function labelForStatus(s: string): string {
  return statusConfig(s).label;
}
