"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { formatDate } from "@/lib/format";

export type ReportWizardAudit = {
  id: string;
  startedAt: Date;
  status: string;
  auditorName: string | null;
  findingsCount: number;
};

export function ReportWizard({
  systemId,
  audits,
  propertyName,
  systemName,
}: {
  systemId: string;
  audits: ReportWizardAudit[];
  propertyName: string;
  systemName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [auditId, setAuditId] = useState<string>(audits[0]?.id ?? "");
  const [title, setTitle] = useState(
    `${propertyName} — ${systemName} Report`,
  );
  const [sections, setSections] = useState({
    zones: true,
    parts: true,
    auditFindings: true,
    photos: true,
  });
  const [pending, start] = useTransition();

  function toggle(k: keyof typeof sections) {
    setSections((s) => ({ ...s, [k]: !s[k] }));
  }

  function generate() {
    start(async () => {
      const res = await fetch(
        `/api/property-systems/${systemId}/generate-report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            auditId: auditId || undefined,
            sections,
            title: title.trim() || undefined,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as
        | { ok: true; url: string; filename: string; sizeBytes: number }
        | { error: string; message?: string };
      if (!res.ok || !("ok" in data)) {
        const msg = "message" in data ? data.message : "Report generation failed.";
        toast.error(msg ?? "Report generation failed.");
        return;
      }
      toast.success(`Report ready: ${data.filename}`, {
        action: {
          label: "Download",
          onClick: () => window.open(data.url, "_blank"),
        },
        duration: 10000,
      });
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    // bg-accent = org secondary (dark green for Takeo).
    // text-primary = org primary (yellow for Takeo).
    // For orgs with different palettes this still picks their most
    // prominent brand pair — a real CTA instead of a gray outline.
    // self-start stops the flex parent from stretching it full-width.
    return (
      <Button
        type="button"
        size="lg"
        onClick={() => setOpen(true)}
        className="h-11 self-start bg-accent px-5 font-semibold text-primary shadow-sm transition-opacity hover:bg-accent hover:opacity-90"
      >
        Generate report
      </Button>
    );
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Generate report</CardTitle>
            <CardDescription>
              PDF with cover, system summary, zones, parts, and optional audit
              findings. Branded with your org colors and logo. Saved to Files.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Label htmlFor="report-title">Title</Label>
          <Input
            id="report-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
            className="mt-1.5 h-11"
          />
        </div>

        <div>
          <Label htmlFor="report-audit">Audit</Label>
          <select
            id="report-audit"
            value={auditId}
            onChange={(e) => setAuditId(e.target.value)}
            disabled={pending}
            className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">No audit — profile only</option>
            {audits.map((a) => (
              <option key={a.id} value={a.id}>
                {formatDate(a.startedAt)} · {a.findingsCount}{" "}
                {a.findingsCount === 1 ? "finding" : "findings"} ·{" "}
                {a.status.replace("_", " ")}
                {a.auditorName ? ` · ${a.auditorName}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Include</div>
          <div className="grid grid-cols-2 gap-2">
            <SectionToggle
              label="Zones table"
              checked={sections.zones}
              onChange={() => toggle("zones")}
              disabled={pending}
            />
            <SectionToggle
              label="Parts in use"
              checked={sections.parts}
              onChange={() => toggle("parts")}
              disabled={pending}
            />
            <SectionToggle
              label="Audit findings"
              checked={sections.auditFindings}
              onChange={() => toggle("auditFindings")}
              disabled={pending || !auditId}
            />
            <SectionToggle
              label="Finding photos"
              checked={sections.photos}
              onChange={() => toggle("photos")}
              disabled={pending || !auditId || !sections.auditFindings}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={generate} disabled={pending}>
            {pending ? "Generating…" : "Generate PDF"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800 ${
        disabled ? "opacity-50" : "cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}
