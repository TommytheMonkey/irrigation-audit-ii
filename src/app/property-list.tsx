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
  audits: AuditLite[];
  _count: { audits: number };
};

export function PropertyList({ properties }: { properties: PropertyListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        (p.address?.toLowerCase().includes(q) ?? false) ||
        (p.propertyManagerName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [properties, query]);

  return (
    <>
      <div className="mb-4">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search properties by name, address, or PM…"
          className="h-11"
          aria-label="Search properties"
        />
        {query && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {filtered.length} of {properties.length}
          </p>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No matches</CardTitle>
            <CardDescription>
              No properties match &ldquo;{query}&rdquo;.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const latest = p.audits[0];
            return (
              <Card key={p.id} className="flex flex-col">
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
          })}
        </div>
      )}
    </>
  );
}

function AuditStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    in_progress: { label: "In progress", variant: "default" },
    completed: { label: "Completed", variant: "secondary" },
    exported: { label: "Exported", variant: "secondary" },
    priced: { label: "Priced", variant: "secondary" },
    report_generated: { label: "Reported", variant: "outline" },
  };
  const cfg = map[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
