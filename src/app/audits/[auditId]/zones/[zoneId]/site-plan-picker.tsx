"use client";

import { useState, useCallback, useRef } from "react";
import {
  TransformWrapper,
  TransformComponent,
} from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import type { Severity } from "@prisma/client";

export type ExistingPin = {
  id: string;
  x: number;
  y: number;
  severity: Severity;
  isCurrentZone: boolean;
};

const SEVERITY_COLORS: Record<Severity, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
};

export function SitePlanPicker({
  renderUrl,
  width,
  height,
  existingPins,
  onConfirm,
  onSkip,
}: {
  renderUrl: string;
  width: number;
  height: number;
  existingPins: ExistingPin[];
  onConfirm: (x: number, y: number) => void;
  onSkip: () => void;
}) {
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const img = imageRef.current;
      if (!img) return;

      const rect = img.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
        setPin({ x, y });
      }
    },
    [],
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between bg-zinc-900 px-4 py-3">
        <p className="text-sm font-medium text-white">
          {pin ? "Pin placed. Tap elsewhere to reposition." : "Tap on the site plan to place a pin."}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onSkip}
          >
            Skip
          </Button>
          {pin && (
            <Button
              type="button"
              size="sm"
              onClick={() => onConfirm(pin.x, pin.y)}
            >
              Confirm
            </Button>
          )}
        </div>
      </div>

      {/* Map area */}
      <div className="relative flex-1 overflow-hidden">
        <TransformWrapper
          minScale={0.5}
          maxScale={5}
          centerOnInit
        >
          <TransformComponent
            wrapperStyle={{ width: "100%", height: "100%" }}
            contentStyle={{ position: "relative" }}
          >
            <div
              style={{ position: "relative", display: "inline-block" }}
              onClick={handleTap}
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

              {/* Existing pins (context) */}
              {existingPins.map((p) => (
                <div
                  key={p.id}
                  style={{
                    position: "absolute",
                    left: `${p.x * 100}%`,
                    top: `${p.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    backgroundColor: SEVERITY_COLORS[p.severity],
                    opacity: p.isCurrentZone ? 0.6 : 0.3,
                    border: "2px solid rgba(255,255,255,0.7)",
                    pointerEvents: "none",
                  }}
                />
              ))}

              {/* New pin */}
              {pin && (
                <div
                  style={{
                    position: "absolute",
                    left: `${pin.x * 100}%`,
                    top: `${pin.y * 100}%`,
                    transform: "translate(-50%, -100%)",
                    pointerEvents: "none",
                  }}
                >
                  <svg width="28" height="36" viewBox="0 0 28 36">
                    <path
                      d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z"
                      fill="#3b82f6"
                      stroke="#fff"
                      strokeWidth="2"
                    />
                    <circle cx="14" cy="14" r="5" fill="#fff" />
                  </svg>
                </div>
              )}

              {/* Crosshair cursor indicator */}
              {!pin && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    cursor: "crosshair",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* Clear pin button */}
      {pin && (
        <div className="bg-zinc-900 px-4 py-2 text-center">
          <button
            type="button"
            onClick={() => setPin(null)}
            className="text-xs text-zinc-400 hover:text-white"
          >
            Clear pin
          </button>
        </div>
      )}
    </div>
  );
}
