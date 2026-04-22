"use client";

import { useRef, useState, useCallback, useMemo } from "react";
import {
  TransformWrapper,
  TransformComponent,
} from "react-zoom-pan-pinch";
import { Card, CardContent } from "@/components/ui/card";
import type { Severity } from "@prisma/client";

export type MapFinding = {
  id: string;
  x: number;
  y: number;
  severity: Severity;
  zoneNumber: number;
  zoneName: string | null;
  description: string;
  componentCategory: string;
  quantity: number;
  unitOfMeasure: string;
  solutionAction: string;
  photoUrl: string | null;
};

const SEVERITY_COLORS: Record<Severity, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
};

const SEVERITY_RANK: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

type Cluster = {
  key: string;
  cx: number;
  cy: number;
  findings: MapFinding[];
  worstSeverity: Severity;
};

function buildClusters(findings: MapFinding[], scale: number): Cluster[] {
  // Grid cell size in normalized 0-1 space. Shrinks as you zoom in.
  const cellSize = 0.06 / Math.max(scale, 0.5);
  const buckets = new Map<string, MapFinding[]>();

  for (const f of findings) {
    const col = Math.floor(f.x / cellSize);
    const row = Math.floor(f.y / cellSize);
    const key = `${col},${row}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(f);
    } else {
      buckets.set(key, [f]);
    }
  }

  const clusters: Cluster[] = [];
  for (const [key, items] of buckets) {
    const cx = items.reduce((s, f) => s + f.x, 0) / items.length;
    const cy = items.reduce((s, f) => s + f.y, 0) / items.length;
    let worst: Severity = "low";
    for (const f of items) {
      if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst]) {
        worst = f.severity;
      }
    }
    clusters.push({ key, cx, cy, findings: items, worstSeverity: worst });
  }
  return clusters;
}

export function AuditMap({
  renderUrl,
  width,
  height,
  findings,
  zones,
}: {
  renderUrl: string;
  width: number;
  height: number;
  findings: MapFinding[];
  zones: { zoneNumber: number; zoneName: string | null }[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(
    new Set(["high", "medium", "low"]),
  );
  const [zoneFilter, setZoneFilter] = useState<number | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isPanning = useRef(false);

  const filtered = useMemo(
    () =>
      findings.filter(
        (f) =>
          severityFilter.has(f.severity) &&
          (zoneFilter === null || f.zoneNumber === zoneFilter),
      ),
    [findings, severityFilter, zoneFilter],
  );

  const clusters = useMemo(
    () => buildClusters(filtered, scale),
    [filtered, scale],
  );

  const selected = selectedId
    ? findings.find((f) => f.id === selectedId) ?? null
    : null;

  const handleTap = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isPanning.current) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-pin]")) return;
      setSelectedId(null);
      setExpandedCluster(null);
    },
    [],
  );

  function toggleSeverity(s: Severity) {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        if (next.size > 1) next.delete(s);
      } else {
        next.add(s);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Severity filter chips */}
        {(["high", "medium", "low"] as Severity[]).map((s) => {
          const count = findings.filter(
            (f) =>
              f.severity === s &&
              (zoneFilter === null || f.zoneNumber === zoneFilter),
          ).length;
          const active = severityFilter.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleSeverity(s)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-zinc-400 bg-white text-foreground dark:border-zinc-600 dark:bg-zinc-800"
                  : "border-zinc-200 bg-zinc-100 text-muted-foreground/50 dark:border-zinc-800 dark:bg-zinc-900"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: SEVERITY_COLORS[s],
                  opacity: active ? 1 : 0.3,
                }}
              />
              {s} ({count})
            </button>
          );
        })}

        {/* Zone filter */}
        {zones.length > 1 && (
          <>
            <span className="mx-1 h-4 w-px bg-zinc-300 dark:bg-zinc-700" />
            <select
              value={zoneFilter ?? ""}
              onChange={(e) =>
                setZoneFilter(e.target.value ? Number(e.target.value) : null)
              }
              className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z.zoneNumber} value={z.zoneNumber}>
                  Zone {z.zoneNumber}
                  {z.zoneName ? ` — ${z.zoneName}` : ""}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Map */}
      <div
        className="relative overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
        style={{ height: "min(60vh, 500px)" }}
      >
        <TransformWrapper
          minScale={0.5}
          maxScale={5}
          centerOnInit
          onPanningStart={() => {
            isPanning.current = true;
          }}
          onPanningStop={() => {
            setTimeout(() => {
              isPanning.current = false;
            }, 50);
          }}
          onTransform={(_ref, state) => {
            setScale(state.scale);
          }}
        >
          <TransformComponent
            wrapperStyle={{ width: "100%", height: "100%" }}
            contentStyle={{ position: "relative" }}
          >
            <div
              style={{ position: "relative", display: "inline-block" }}
              onPointerUp={handleTap}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={renderUrl}
                alt="Site plan"
                width={width}
                height={height}
                style={{ display: "block", maxWidth: "none" }}
                draggable={false}
              />

              {clusters.map((cluster) =>
                cluster.findings.length === 1 ? (
                  <button
                    key={cluster.key}
                    data-pin
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const f = cluster.findings[0];
                      setSelectedId(selectedId === f.id ? null : f.id);
                      setExpandedCluster(null);
                    }}
                    style={{
                      position: "absolute",
                      left: `${cluster.findings[0].x * 100}%`,
                      top: `${cluster.findings[0].y * 100}%`,
                      transform: "translate(-50%, -50%)",
                      width:
                        selectedId === cluster.findings[0].id ? 22 : 16,
                      height:
                        selectedId === cluster.findings[0].id ? 22 : 16,
                      borderRadius: "50%",
                      backgroundColor:
                        SEVERITY_COLORS[cluster.findings[0].severity],
                      border:
                        selectedId === cluster.findings[0].id
                          ? "3px solid #fff"
                          : "2px solid rgba(255,255,255,0.8)",
                      boxShadow:
                        selectedId === cluster.findings[0].id
                          ? `0 0 0 3px ${SEVERITY_COLORS[cluster.findings[0].severity]}`
                          : "0 1px 3px rgba(0,0,0,0.3)",
                      cursor: "pointer",
                      transition: "width 0.15s, height 0.15s",
                    }}
                  />
                ) : (
                  <button
                    key={cluster.key}
                    data-pin
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedCluster(
                        expandedCluster === cluster.key
                          ? null
                          : cluster.key,
                      );
                      setSelectedId(null);
                    }}
                    style={{
                      position: "absolute",
                      left: `${cluster.cx * 100}%`,
                      top: `${cluster.cy * 100}%`,
                      transform: "translate(-50%, -50%)",
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      backgroundColor:
                        SEVERITY_COLORS[cluster.worstSeverity],
                      border: "2px solid rgba(255,255,255,0.9)",
                      boxShadow:
                        expandedCluster === cluster.key
                          ? `0 0 0 3px ${SEVERITY_COLORS[cluster.worstSeverity]}`
                          : "0 1px 4px rgba(0,0,0,0.4)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#fff",
                      lineHeight: 1,
                    }}
                  >
                    {cluster.findings.length}
                  </button>
                ),
              )}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* Expanded cluster list */}
      {expandedCluster && (() => {
        const cluster = clusters.find((c) => c.key === expandedCluster);
        if (!cluster) return null;
        return (
          <Card>
            <CardContent className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{cluster.findings.length} findings at this location</span>
                <button
                  type="button"
                  onClick={() => setExpandedCluster(null)}
                  className="hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              {cluster.findings.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(f.id);
                    setExpandedCluster(null);
                  }}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SEVERITY_COLORS[f.severity] }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {f.description}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Z{f.zoneNumber}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {/* Detail card for selected pin */}
      {selected && !expandedCluster && (
        <Card className="animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CardContent className="flex items-start gap-3">
            {selected.photoUrl && (
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.photoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {selected.description}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                  style={{
                    backgroundColor: `${SEVERITY_COLORS[selected.severity]}2E`,
                    color: SEVERITY_COLORS[selected.severity],
                  }}
                >
                  {selected.severity}
                </span>
                <span>
                  Zone {selected.zoneNumber}
                  {selected.zoneName ? ` — ${selected.zoneName}` : ""}
                </span>
                <span className="tabular-nums">
                  qty {selected.quantity} {selected.unitOfMeasure}
                </span>
                <span>· {selected.solutionAction}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              ✕
            </button>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <span>{filtered.length} of {findings.length} shown</span>
      </div>
    </div>
  );
}
