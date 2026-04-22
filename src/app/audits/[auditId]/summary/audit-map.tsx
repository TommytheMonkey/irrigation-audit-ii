"use client";

import { useRef, useState, useCallback } from "react";
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

export function AuditMap({
  renderUrl,
  width,
  height,
  findings,
}: {
  renderUrl: string;
  width: number;
  height: number;
  findings: MapFinding[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isPanning = useRef(false);

  const selected = selectedId
    ? findings.find((f) => f.id === selectedId) ?? null
    : null;

  const handleTap = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isPanning.current) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-pin]")) return;
      setSelectedId(null);
    },
    [],
  );

  return (
    <div className="flex flex-col gap-3">
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

              {findings.map((f) => (
                <button
                  key={f.id}
                  data-pin
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(selectedId === f.id ? null : f.id);
                  }}
                  style={{
                    position: "absolute",
                    left: `${f.x * 100}%`,
                    top: `${f.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                    width: selectedId === f.id ? 22 : 16,
                    height: selectedId === f.id ? 22 : 16,
                    borderRadius: "50%",
                    backgroundColor: SEVERITY_COLORS[f.severity],
                    border: selectedId === f.id
                      ? "3px solid #fff"
                      : "2px solid rgba(255,255,255,0.8)",
                    boxShadow: selectedId === f.id
                      ? `0 0 0 3px ${SEVERITY_COLORS[f.severity]}`
                      : "0 1px 3px rgba(0,0,0,0.3)",
                    cursor: "pointer",
                    transition: "width 0.15s, height 0.15s",
                  }}
                />
              ))}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* Detail card for selected pin */}
      {selected && (
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
                <span>Zone {selected.zoneNumber}{selected.zoneName ? ` — ${selected.zoneName}` : ""}</span>
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
        {(["high", "medium", "low"] as Severity[]).map((s) => {
          const count = findings.filter((f) => f.severity === s).length;
          if (count === 0) return null;
          return (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SEVERITY_COLORS[s] }}
              />
              {s} ({count})
            </span>
          );
        })}
        <span className="text-muted-foreground/60">
          {findings.length} pinned
        </span>
      </div>
    </div>
  );
}
