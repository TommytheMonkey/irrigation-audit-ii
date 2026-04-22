"use client";

import { useState, type ReactNode } from "react";
import { AuditMap, type MapFinding } from "./audit-map";
import { Card, CardContent } from "@/components/ui/card";

export type UnmappedFinding = {
  id: string;
  severity: string;
  description: string;
  zoneNumber: number;
  zoneName: string | null;
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
};

export function FindingsViewToggle({
  listView,
  sitePlan,
  mapFindings,
  unmappedFindings,
  zones,
}: {
  listView: ReactNode;
  sitePlan: {
    renderUrl: string;
    width: number;
    height: number;
  } | null;
  mapFindings: MapFinding[];
  unmappedFindings: UnmappedFinding[];
  zones: { zoneNumber: number; zoneName: string | null }[];
}) {
  const [view, setView] = useState<"list" | "map">("list");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hasMap = sitePlan && mapFindings.length > 0;

  return (
    <div>
      {/* Toggle tabs */}
      {hasMap && (
        <div className="mb-4 flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "list"
                ? "bg-white text-foreground shadow-sm dark:bg-zinc-800"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setView("map")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "map"
                ? "bg-white text-foreground shadow-sm dark:bg-zinc-800"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Map
          </button>
        </div>
      )}

      {view === "list" || !hasMap ? (
        listView
      ) : (
        <div className="flex flex-col gap-3">
          <AuditMap
            renderUrl={sitePlan.renderUrl}
            width={sitePlan.width}
            height={sitePlan.height}
            findings={mapFindings}
            zones={zones}
          />

          {/* Unmapped findings drawer */}
          {unmappedFindings.length > 0 && (
            <Card>
              <CardContent className="py-3">
                <button
                  type="button"
                  onClick={() => setDrawerOpen((o) => !o)}
                  className="flex w-full items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">
                    {unmappedFindings.length} finding
                    {unmappedFindings.length === 1 ? "" : "s"} not on map
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {drawerOpen ? "▲" : "▼"}
                  </span>
                </button>
                {drawerOpen && (
                  <ul className="mt-2 flex flex-col gap-1.5 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                    {unmappedFindings.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              SEVERITY_COLORS[f.severity] ?? "#94a3b8",
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {f.description}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Z{f.zoneNumber}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
