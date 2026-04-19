"use client";

import { useRef, useState, useTransition } from "react";
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
import {
  PROPERTY_FIELDS,
  type ColumnMapping,
} from "@/lib/monday-types";

// One-off property import from an .xlsx upload or a Google Sheet URL.
// Reuses the Monday column-mapping pattern: Preview endpoint returns
// headers + auto-matched mapping + data rows; this component lets the
// user adjust the mapping and pick the name column, then POSTs it all
// back to the Apply endpoint. Imported rows land with mondayItemId=null
// so they sit under the dashboard's "Manual" source filter.

type Preview = {
  columns: string[];
  rows: string[][];
  totalRows: number;
  autoMapping: ColumnMapping;
  nameColumn: string | null;
};

type Mode = "xlsx" | "sheet";

export function PropertyImportCard({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("xlsx");
  const [sheetUrl, setSheetUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [nameColumn, setNameColumn] = useState<string>("");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [geocode, setGeocode] = useState(true);
  const [previewPending, previewStart] = useTransition();
  const [applyPending, applyStart] = useTransition();

  function resetPreview() {
    setPreview(null);
    setNameColumn("");
    setMapping({});
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) {
      toast.error("Upload an .xlsx file.");
      return;
    }
    previewStart(async () => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/properties/import/preview", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as
        | Preview
        | { error: string; message?: string };
      if (!res.ok || !("columns" in data)) {
        const msg = "message" in data ? data.message : "Preview failed.";
        toast.error(msg ?? "Preview failed.");
        return;
      }
      loadPreview(data);
    });
  }

  function handleSheetUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetUrl.trim()) return;
    previewStart(async () => {
      const res = await fetch("/api/properties/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: sheetUrl.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | Preview
        | { error: string; message?: string };
      if (!res.ok || !("columns" in data)) {
        const msg = "message" in data ? data.message : "Preview failed.";
        toast.error(msg ?? "Preview failed.");
        return;
      }
      loadPreview(data);
    });
  }

  function loadPreview(p: Preview) {
    setPreview(p);
    setNameColumn(p.nameColumn ?? p.columns[0] ?? "");
    setMapping(p.autoMapping);
  }

  function runImport() {
    if (!preview || !nameColumn) return;
    applyStart(async () => {
      const res = await fetch("/api/properties/import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columns: preview.columns,
          rows: preview.rows,
          nameColumn,
          mapping,
          geocode,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | { ok: true; created: number; skipped: number; geocoded: number }
        | { error: string; message?: string };
      if (!res.ok || !("ok" in data)) {
        const msg = "message" in data ? data.message : "Import failed.";
        toast.error(msg ?? "Import failed.");
        return;
      }
      toast.success(
        `Imported ${data.created} ${data.created === 1 ? "property" : "properties"}${
          data.skipped ? ` · ${data.skipped} skipped (missing name)` : ""
        }${data.geocoded ? ` · ${data.geocoded} geocoded` : ""}.`,
      );
      resetPreview();
      setSheetUrl("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import properties</CardTitle>
        <CardDescription>
          Upload an Excel workbook or paste a Google Sheet URL. Imported
          properties live alongside anything synced from Monday and can be
          edited or deleted like manual entries.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!preview ? (
          <>
            {/* Mode picker */}
            <div className="flex flex-wrap gap-2">
              <ModeButton
                active={mode === "xlsx"}
                onClick={() => setMode("xlsx")}
              >
                Upload .xlsx
              </ModeButton>
              <ModeButton
                active={mode === "sheet"}
                onClick={() => setMode("sheet")}
              >
                Google Sheet URL
              </ModeButton>
            </div>

            {mode === "xlsx" ? (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canEdit || previewPending}
                  onClick={() => fileRef.current?.click()}
                  className="h-11"
                >
                  {previewPending ? "Reading…" : "Choose file"}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xlsm"
                  className="hidden"
                  onChange={handleFile}
                />
              </div>
            ) : (
              <form
                onSubmit={handleSheetUrl}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <Input
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  disabled={!canEdit || previewPending}
                  className="h-11 flex-1"
                />
                <Button
                  type="submit"
                  disabled={!canEdit || previewPending || !sheetUrl.trim()}
                  className="h-11"
                >
                  {previewPending ? "Reading…" : "Next"}
                </Button>
              </form>
            )}

            {mode === "sheet" && (
              <p className="text-xs text-muted-foreground">
                Uses your connected Google account. The sheet&apos;s first
                tab is read from A1 to Z1000.
              </p>
            )}
          </>
        ) : (
          <PreviewEditor
            preview={preview}
            nameColumn={nameColumn}
            onNameColumn={setNameColumn}
            mapping={mapping}
            onMapping={setMapping}
            geocode={geocode}
            onGeocode={setGeocode}
            applyPending={applyPending}
            onCancel={resetPreview}
            onApply={runImport}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ModeButton({
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
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview editor — name column + PROPERTY_FIELDS mapping + row preview
// ─────────────────────────────────────────────────────────────────────────────

function PreviewEditor({
  preview,
  nameColumn,
  onNameColumn,
  mapping,
  onMapping,
  geocode,
  onGeocode,
  applyPending,
  onCancel,
  onApply,
}: {
  preview: Preview;
  nameColumn: string;
  onNameColumn: (s: string) => void;
  mapping: ColumnMapping;
  onMapping: (m: ColumnMapping) => void;
  geocode: boolean;
  onGeocode: (b: boolean) => void;
  applyPending: boolean;
  onCancel: () => void;
  onApply: () => void;
}) {
  const previewRows = preview.rows.slice(0, 5);
  const previewColumns = new Set<string>();
  if (nameColumn) previewColumns.add(nameColumn);
  for (const col of Object.values(mapping)) {
    if (col) previewColumns.add(col);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        Detected <strong>{preview.columns.length}</strong> columns and{" "}
        <strong>{preview.totalRows}</strong> rows. Map each property field to
        a column below — skip anything your sheet doesn&apos;t have.
      </div>

      <div>
        <Label>Property name column <span className="text-destructive">*</span></Label>
        <select
          value={nameColumn}
          onChange={(e) => onNameColumn(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {preview.columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PROPERTY_FIELDS.map((field) => (
          <div key={field.id}>
            <Label>{field.label}</Label>
            <select
              value={mapping[field.id] ?? ""}
              onChange={(e) =>
                onMapping({
                  ...mapping,
                  [field.id]: e.target.value || undefined,
                })
              }
              className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Skip —</option>
              {preview.columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Preview table of first 5 rows, only mapped columns */}
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left uppercase tracking-wide text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900">
              {preview.columns
                .filter((c) => previewColumns.has(c))
                .map((c) => (
                  <th key={c} className="px-2 py-1.5">
                    {c}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900"
              >
                {preview.columns
                  .map((c, idx) =>
                    previewColumns.has(c) ? (
                      <td
                        key={c}
                        className="truncate px-2 py-1.5"
                        title={row[idx] ?? ""}
                      >
                        {row[idx] ?? ""}
                      </td>
                    ) : null,
                  )
                  .filter(Boolean)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={geocode}
          onChange={(e) => onGeocode(e.target.checked)}
          disabled={applyPending}
        />
        <span>
          Geocode addresses on import (~1 sec per property, uses Google
          Geocoding quota)
        </span>
      </label>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={applyPending}
        >
          Cancel
        </Button>
        <Button type="button" onClick={onApply} disabled={applyPending || !nameColumn}>
          {applyPending
            ? "Importing…"
            : `Import ${preview.totalRows} ${preview.totalRows === 1 ? "property" : "properties"}`}
        </Button>
      </div>
    </div>
  );
}
