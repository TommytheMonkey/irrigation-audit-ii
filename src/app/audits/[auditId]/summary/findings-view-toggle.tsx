"use client";

import { useState, type ReactNode } from "react";
import { AuditMap, type MapFinding } from "./audit-map";

export function FindingsViewToggle({
  listView,
  sitePlan,
  mapFindings,
  unmappedCount,
}: {
  listView: ReactNode;
  sitePlan: {
    renderUrl: string;
    width: number;
    height: number;
  } | null;
  mapFindings: MapFinding[];
  unmappedCount: number;
}) {
  const [view, setView] = useState<"list" | "map">("list");
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
          />
          {unmappedCount > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              {unmappedCount} finding{unmappedCount === 1 ? "" : "s"} not pinned on the site plan.{" "}
              <button
                type="button"
                onClick={() => setView("list")}
                className="underline hover:text-foreground"
              >
                View in list
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
