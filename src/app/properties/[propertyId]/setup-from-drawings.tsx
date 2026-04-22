"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { compressImage } from "@/lib/image-compress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// ── Types matching the API response ─────────────────────────────────────────

type ExtractedPOC = {
  pocNumber: number;
  waterMeterSize: string | null;
  staticPressure: string | null;
  flowAvailable: string | null;
  serviceLineSize: string | null;
  notes: string | null;
};

type ExtractedValve = {
  pocNumber: number;
  valveNumber: string;
  manufacturer: string | null;
  model: string | null;
  size: string | null;
  type: string | null;
  zoneType: "spray" | "drip" | "bubbler" | "rotor" | "other";
  gpm: number | null;
  psi: number | null;
  precipitationRate: number | null;
  sqft: number | null;
  notes: string | null;
};

type ExtractedPipe = {
  pocNumber: number | null;
  material: string;
  size: string;
  length: number | null;
  usage: string | null;
};

type DrawingExtraction = {
  pocs: ExtractedPOC[];
  valves: ExtractedValve[];
  pipes: ExtractedPipe[];
  summary: string | null;
};

type Step = "upload" | "extracting" | "review";

export function SetupFromDrawings({
  propertyId,
  onClose,
}: {
  propertyId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<Step>("upload");
  const [committing, setCommitting] = useState(false);
  const [extraction, setExtraction] = useState<DrawingExtraction | null>(null);

  async function extract() {
    if (files.length === 0) {
      toast.error("Add at least one image.");
      return;
    }
    setStep("extracting");

    const form = new FormData();
    for (const f of files) {
      const compressed = await compressImage(f);
      form.append("files", compressed);
    }

    try {
      const res = await fetch(
        `/api/properties/${propertyId}/setup-from-drawings`,
        { method: "POST", body: form },
      );
      const data = (await res.json().catch(() => ({}))) as
        | { ok: true; extraction: DrawingExtraction }
        | { error: string; message?: string };

      if (!res.ok || !("ok" in data)) {
        const msg =
          "message" in data ? data.message : "Extraction failed.";
        toast.error(msg ?? "Extraction failed.");
        setStep("upload");
        return;
      }

      setExtraction(data.extraction);
      setStep("review");
    } catch {
      toast.error("Network error during extraction.");
      setStep("upload");
    }
  }

  async function commit() {
    if (!extraction) return;
    setCommitting(true);

    try {
      const res = await fetch(
        `/api/properties/${propertyId}/setup-from-drawings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(extraction),
        },
      );
      const data = (await res.json().catch(() => ({}))) as
        | { ok: true; systemsCreated: number; zonesCreated: number }
        | { error: string };

      if (!res.ok || !("ok" in data)) {
        toast.error("Failed to save.");
        setCommitting(false);
        return;
      }

      toast.success(
        `Created ${data.systemsCreated} system${data.systemsCreated === 1 ? "" : "s"} with ${data.zonesCreated} zones.`,
      );
      router.refresh();
      onClose();
    } catch {
      toast.error("Network error.");
      setCommitting(false);
    }
  }

  if (step === "upload" || step === "extracting") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Set Up From Drawings</CardTitle>
          <CardDescription>
            Upload one or more screenshots of irrigation schedules, valve
            schedules, or watering schedules. Claude will extract POCs, zones,
            and valve data for review.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={step === "extracting"}
              className="h-11"
            >
              {files.length > 0
                ? `${files.length} file${files.length === 1 ? "" : "s"} selected`
                : "Choose images"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const f = e.target.files;
                if (f) setFiles(Array.from(f));
                e.target.value = "";
              }}
            />
          </div>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {f.name}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={step === "extracting"}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={extract}
              disabled={step === "extracting" || files.length === 0}
            >
              {step === "extracting" ? "Extracting..." : "Extract"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "review" && extraction) {
    return (
      <ReviewScreen
        extraction={extraction}
        onChange={setExtraction}
        onConfirm={commit}
        onBack={() => setStep("upload")}
        committing={committing}
      />
    );
  }

  return null;
}

// ── Review screen ───────────────────────────────────────────────────────────

function ReviewScreen({
  extraction,
  onChange,
  onConfirm,
  onBack,
  committing,
}: {
  extraction: DrawingExtraction;
  onChange: (e: DrawingExtraction) => void;
  onConfirm: () => void;
  onBack: () => void;
  committing: boolean;
}) {
  function updateValve(idx: number, field: string, value: string) {
    const valves = [...extraction.valves];
    const v = { ...valves[idx] } as Record<string, unknown>;
    if (field === "gpm" || field === "psi" || field === "precipitationRate" || field === "sqft") {
      const n = parseFloat(value);
      v[field] = Number.isFinite(n) ? n : null;
    } else {
      v[field] = value || null;
    }
    valves[idx] = v as ExtractedValve;
    onChange({ ...extraction, valves });
  }

  function updatePOC(idx: number, field: string, value: string) {
    const pocs = [...extraction.pocs];
    const p = { ...pocs[idx] } as Record<string, unknown>;
    p[field] = value || null;
    pocs[idx] = p as ExtractedPOC;
    onChange({ ...extraction, pocs });
  }

  function removeValve(idx: number) {
    const valves = extraction.valves.filter((_, i) => i !== idx);
    onChange({ ...extraction, valves });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review Extraction</CardTitle>
          <CardDescription>
            {extraction.summary ??
              `${extraction.pocs.length} POC${extraction.pocs.length === 1 ? "" : "s"}, ${extraction.valves.length} valves extracted. Edit any values before saving.`}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* POCs */}
      {extraction.pocs.map((poc, pi) => (
        <Card key={pi}>
          <CardHeader>
            <CardTitle className="text-sm">POC {poc.pocNumber}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <EditField
              label="Meter size"
              value={poc.waterMeterSize ?? ""}
              onChange={(v) => updatePOC(pi, "waterMeterSize", v)}
            />
            <EditField
              label="Static pressure"
              value={poc.staticPressure ?? ""}
              onChange={(v) => updatePOC(pi, "staticPressure", v)}
            />
            <EditField
              label="Flow available"
              value={poc.flowAvailable ?? ""}
              onChange={(v) => updatePOC(pi, "flowAvailable", v)}
            />
            <EditField
              label="Service line"
              value={poc.serviceLineSize ?? ""}
              onChange={(v) => updatePOC(pi, "serviceLineSize", v)}
            />
          </CardContent>
        </Card>
      ))}

      {/* Valves table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Valves / Zones ({extraction.valves.length})
          </CardTitle>
          <CardDescription>
            Each valve becomes a zone. Edit or remove any rows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-2">POC</th>
                  <th className="py-1.5 pr-2">Valve #</th>
                  <th className="py-1.5 pr-2">Brand</th>
                  <th className="py-1.5 pr-2">Model</th>
                  <th className="py-1.5 pr-2">Size</th>
                  <th className="py-1.5 pr-2">Type</th>
                  <th className="py-1.5 pr-2">Zone Type</th>
                  <th className="py-1.5 pr-2">GPM</th>
                  <th className="py-1.5 pr-2">PSI</th>
                  <th className="py-1.5 pr-2">Precip</th>
                  <th className="py-1.5 pr-2">Sqft</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {extraction.valves.map((v, vi) => (
                  <tr
                    key={vi}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-1 pr-1">
                      <span className="text-muted-foreground">
                        {v.pocNumber}
                      </span>
                    </td>
                    <td className="py-1 pr-1">
                      <input
                        className="w-12 rounded border border-input bg-transparent px-1 py-0.5"
                        value={v.valveNumber}
                        onChange={(e) =>
                          updateValve(vi, "valveNumber", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <input
                        className="w-20 rounded border border-input bg-transparent px-1 py-0.5"
                        value={v.manufacturer ?? ""}
                        onChange={(e) =>
                          updateValve(vi, "manufacturer", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <input
                        className="w-28 rounded border border-input bg-transparent px-1 py-0.5"
                        value={v.model ?? ""}
                        onChange={(e) =>
                          updateValve(vi, "model", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <input
                        className="w-14 rounded border border-input bg-transparent px-1 py-0.5"
                        value={v.size ?? ""}
                        onChange={(e) =>
                          updateValve(vi, "size", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <input
                        className="w-28 rounded border border-input bg-transparent px-1 py-0.5"
                        value={v.type ?? ""}
                        onChange={(e) =>
                          updateValve(vi, "type", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <select
                        className="w-16 rounded border border-input bg-transparent px-1 py-0.5"
                        value={v.zoneType}
                        onChange={(e) =>
                          updateValve(vi, "zoneType", e.target.value)
                        }
                      >
                        <option value="spray">Spray</option>
                        <option value="rotor">Rotor</option>
                        <option value="drip">Drip</option>
                        <option value="bubbler">Bubbler</option>
                        <option value="other">Other</option>
                      </select>
                    </td>
                    <td className="py-1 pr-1">
                      <input
                        className="w-12 rounded border border-input bg-transparent px-1 py-0.5"
                        value={v.gpm ?? ""}
                        onChange={(e) =>
                          updateValve(vi, "gpm", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <input
                        className="w-12 rounded border border-input bg-transparent px-1 py-0.5"
                        value={v.psi ?? ""}
                        onChange={(e) =>
                          updateValve(vi, "psi", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <input
                        className="w-12 rounded border border-input bg-transparent px-1 py-0.5"
                        value={v.precipitationRate ?? ""}
                        onChange={(e) =>
                          updateValve(vi, "precipitationRate", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <input
                        className="w-14 rounded border border-input bg-transparent px-1 py-0.5"
                        value={v.sqft ?? ""}
                        onChange={(e) =>
                          updateValve(vi, "sqft", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => removeValve(vi)}
                        className="text-destructive hover:underline"
                        title="Remove"
                      >
                        x
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pipes (read-only summary) */}
      {extraction.pipes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Pipe / Mainline ({extraction.pipes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1 text-xs">
              {extraction.pipes.map((p, i) => (
                <div key={i} className="flex gap-3 text-muted-foreground">
                  {p.pocNumber != null && <span>POC {p.pocNumber}</span>}
                  <span>
                    {p.material} {p.size}
                  </span>
                  {p.length != null && <span>{p.length} LF</span>}
                  {p.usage && <span>{p.usage}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onConfirm} disabled={committing}>
          {committing
            ? "Saving..."
            : `Create ${extraction.pocs.length} system${extraction.pocs.length === 1 ? "" : "s"} with ${extraction.valves.length} zones`}
        </Button>
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 text-sm"
      />
    </div>
  );
}
