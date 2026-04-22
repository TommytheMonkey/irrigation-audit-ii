"use client";

import { useRef, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upload } from "@vercel/blob/client";
import type { PropertyFile, FileCategory } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const CATEGORY_LABELS: Record<FileCategory, string> = {
  DRAWINGS: "Drawings",
  CUTSHEET: "Cut Sheets",
  MANUAL: "Manuals",
  PHOTO: "Photos",
  OTHER: "Other",
};

const CATEGORY_ORDER: FileCategory[] = [
  "DRAWINGS",
  "CUTSHEET",
  "MANUAL",
  "PHOTO",
  "OTHER",
];

export function PropertyFiles({
  propertyId,
  files,
  canEdit,
}: {
  propertyId: string;
  files: PropertyFile[];
  canEdit: boolean;
}) {
  const grouped = new Map<FileCategory, PropertyFile[]>();
  for (const cat of CATEGORY_ORDER) {
    grouped.set(cat, []);
  }
  for (const f of files) {
    const arr = grouped.get(f.category) ?? [];
    arr.push(f);
    grouped.set(f.category, arr);
  }

  // Photos: sub-group by audit date
  const photos = grouped.get("PHOTO") ?? [];
  const photosByDate = new Map<string, PropertyFile[]>();
  const photosNoDate: PropertyFile[] = [];
  for (const p of photos) {
    if (p.auditDate) {
      const key = new Date(p.auditDate).toISOString().slice(0, 10);
      const arr = photosByDate.get(key) ?? [];
      arr.push(p);
      photosByDate.set(key, arr);
    } else {
      photosNoDate.push(p);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && <UploadZone propertyId={propertyId} />}

      {CATEGORY_ORDER.map((cat) => {
        const catFiles = grouped.get(cat) ?? [];
        if (catFiles.length === 0) return null;

        if (cat === "PHOTO") {
          return (
            <Card key={cat}>
              <CardHeader>
                <CardTitle className="text-base">
                  {CATEGORY_LABELS[cat]}
                </CardTitle>
                <CardDescription>
                  {catFiles.length}{" "}
                  {catFiles.length === 1 ? "photo" : "photos"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {[...photosByDate.entries()]
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, datePhotos]) => (
                    <PhotoDateGroup
                      key={date}
                      date={date}
                      files={datePhotos}
                      propertyId={propertyId}
                      canEdit={canEdit}
                    />
                  ))}
                {photosNoDate.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Ungrouped
                    </p>
                    {photosNoDate.map((f) => (
                      <FileRow
                        key={f.id}
                        file={f}
                        propertyId={propertyId}
                        canEdit={canEdit}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        }

        return (
          <Card key={cat}>
            <CardHeader>
              <CardTitle className="text-base">
                {CATEGORY_LABELS[cat]}
              </CardTitle>
              <CardDescription>
                {catFiles.length}{" "}
                {catFiles.length === 1 ? "file" : "files"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {catFiles.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  propertyId={propertyId}
                  canEdit={canEdit}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}

      {files.length === 0 && (
        <Card>
          <CardHeader>
            <CardDescription className="py-4 text-center">
              No files yet.{" "}
              {canEdit ? "Upload drawings, cut sheets, or photos above." : ""}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload zone with drag-and-drop
// ─────────────────────────────────────────────────────────────────────────────

function UploadZone({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<FileCategory>("OTHER");
  const [dragOver, setDragOver] = useState(false);

  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      setUploading(true);
      let okCount = 0;
      for (const file of files) {
        try {
          await upload(file.name, file, {
            access: "public",
            handleUploadUrl: `/api/properties/${propertyId}/files/upload`,
            clientPayload: JSON.stringify({ category }),
          });
          okCount++;
        } catch (e) {
          console.error("[upload] failed for", file.name, e);
          toast.error(
            `Upload failed for ${file.name}: ${e instanceof Error ? e.message : "unknown"}`,
          );
        }
      }
      setUploading(false);
      if (okCount > 0) {
        toast.success(
          `Uploaded ${okCount} file${okCount === 1 ? "" : "s"}.`,
        );
        setTimeout(() => router.refresh(), 800);
      }
    },
    [propertyId, category, router],
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void processFiles(e.dataTransfer.files);
  }

  return (
    <Card
      className={`border-dashed transition-colors ${dragOver ? "border-primary bg-primary/5" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <CardHeader>
        <CardTitle className="text-base">Upload files</CardTitle>
        <CardDescription>
          Drag and drop or click to choose. Drawings, cut sheets, manuals, photos
          — up to 100 MB per file.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="prop-file-category"
            className="mb-1.5 block text-sm font-medium"
          >
            Category
          </label>
          <select
            id="prop-file-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as FileCategory)}
            disabled={uploading}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="h-11 w-full sm:w-auto"
          >
            {uploading ? "Uploading..." : "Choose files"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const f = e.target.files
                ? Array.from(e.target.files)
                : [];
              e.target.value = "";
              if (f.length > 0) void processFiles(f);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Photo date group (collapsible)
// ─────────────────────────────────────────────────────────────────────────────

function PhotoDateGroup({
  date,
  files,
  propertyId,
  canEdit,
}: {
  date: string;
  files: PropertyFile[];
  propertyId: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(true);
  const d = new Date(date + "T00:00:00");
  const label = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <span className="text-xs">{open ? "▼" : "▶"}</span>
        Audit {label} ({files.length})
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 pl-4">
          {files
            .sort(
              (a, b) => (a.zoneNumber ?? 0) - (b.zoneNumber ?? 0) ||
                (a.photoSequence ?? 0) - (b.photoSequence ?? 0),
            )
            .map((f) => (
              <FileRow
                key={f.id}
                file={f}
                propertyId={propertyId}
                canEdit={canEdit}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// File row
// ─────────────────────────────────────────────────────────────────────────────

function FileRow({
  file,
  propertyId,
  canEdit,
}: {
  file: PropertyFile;
  propertyId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [deletePending, deleteStart] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const isImage = file.mimeType.startsWith("image/");

  function remove() {
    if (!confirm(`Delete "${file.fileName}"?`)) return;
    deleteStart(async () => {
      const res = await fetch(
        `/api/properties/${propertyId}/files/${file.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast.error("Couldn't delete.");
        return;
      }
      toast.success("Deleted.");
      router.refresh();
    });
  }

  function toggleFullSitePlan() {
    deleteStart(async () => {
      const res = await fetch(
        `/api/properties/${propertyId}/files/${file.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isFullSitePlan: !file.isFullSitePlan }),
        },
      );
      if (!res.ok) {
        toast.error("Couldn't update.");
        return;
      }
      toast.success(
        file.isFullSitePlan
          ? "Unmarked as full site plan."
          : "Marked as full site plan.",
      );
      router.refresh();
    });
  }

  function changeCategory(cat: FileCategory) {
    deleteStart(async () => {
      const res = await fetch(
        `/api/properties/${propertyId}/files/${file.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: cat }),
        },
      );
      if (!res.ok) {
        toast.error("Couldn't update category.");
        return;
      }
      toast.success(`Moved to ${CATEGORY_LABELS[cat]}.`);
      setMenuOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={file.blobUrl}
            alt={file.fileName}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            {extOf(file.fileName)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <a
            href={file.blobUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm font-medium hover:underline"
          >
            {file.fileName}
          </a>
          {file.isFullSitePlan && (
            <Badge variant="default" className="shrink-0 text-[10px]">
              Full Site Plan
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{formatBytes(file.fileSize)}</span>
          <span>·</span>
          <span>
            {new Date(file.uploadedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          {file.zoneNumber != null && (
            <>
              <span>·</span>
              <span>Zone {file.zoneNumber}</span>
            </>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="relative flex flex-col gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setMenuOpen(!menuOpen)}
            disabled={deletePending}
          >
            ...
          </Button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-10 flex min-w-[160px] flex-col rounded-md border border-zinc-200 bg-white py-1 shadow-md dark:border-zinc-700 dark:bg-zinc-900">
              <button
                type="button"
                onClick={toggleFullSitePlan}
                className="px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {file.isFullSitePlan
                  ? "Unmark full site plan"
                  : "Mark as full site plan"}
              </button>
              <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
              <p className="px-3 py-1 text-[10px] font-medium text-muted-foreground">
                Move to:
              </p>
              {CATEGORY_ORDER.filter((c) => c !== file.category).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => changeCategory(c)}
                  className="px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
              <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
              <button
                type="button"
                onClick={remove}
                className="px-3 py-1.5 text-left text-xs text-destructive hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function extOf(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "file";
}

function formatBytes(n: number): string {
  if (n === 0) return "--";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
