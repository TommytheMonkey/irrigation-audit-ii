"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upload } from "@vercel/blob/client";
import type { PropertyZone, SystemFile } from "@prisma/client";
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

export function SystemFiles({
  systemId,
  zones,
  files,
  canEdit,
}: {
  systemId: string;
  zones: PropertyZone[];
  files: SystemFile[];
  canEdit: boolean;
}) {
  const [filterZoneId, setFilterZoneId] = useState<string>("all");

  const filtered =
    filterZoneId === "all"
      ? files
      : filterZoneId === "system"
        ? files.filter((f) => f.zoneId === null)
        : files.filter((f) => f.zoneId === filterZoneId);

  return (
    <div className="flex flex-col gap-4">
      {canEdit && <UploadCard systemId={systemId} zones={zones} />}

      <Card>
        <CardHeader>
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <CardTitle className="text-base">All files</CardTitle>
              <CardDescription>
                {files.length} {files.length === 1 ? "file" : "files"} total
              </CardDescription>
            </div>
            <select
              value={filterZoneId}
              onChange={(e) => setFilterZoneId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All files</option>
              <option value="system">System-level only</option>
              {[...zones]
                .sort((a, b) => a.zoneNumber - b.zoneNumber)
                .map((z) => (
                  <option key={z.id} value={z.id}>
                    Zone {z.zoneNumber}
                    {z.zoneName ? ` · ${z.zoneName}` : ""}
                  </option>
                ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No files match this filter.
            </p>
          ) : (
            filtered.map((f) => (
              <FileRow key={f.id} file={f} zones={zones} canEdit={canEdit} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload
// ─────────────────────────────────────────────────────────────────────────────

function UploadCard({
  systemId,
  zones,
}: {
  systemId: string;
  zones: PropertyZone[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [targetZoneId, setTargetZoneId] = useState<string>("system");
  const [tagsText, setTagsText] = useState("");

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    let okCount = 0;
    for (const file of Array.from(files)) {
      try {
        // @vercel/blob/client handles the multi-step upload handshake with
        // the server token endpoint, then streams directly to Blob.
        await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/property-files/upload",
          clientPayload: JSON.stringify({
            systemId,
            zoneId: targetZoneId === "system" ? null : targetZoneId,
            tags,
          }),
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
    setTagsText("");
    if (okCount > 0) {
      toast.success(
        `Uploaded ${okCount} file${okCount === 1 ? "" : "s"}. Refreshing…`,
      );
      // Small delay lets the onUploadCompleted webhook land before refresh.
      setTimeout(() => router.refresh(), 800);
    }
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">Upload files</CardTitle>
        <CardDescription>
          As-builts, worksheets, photos, emails, spec sheets — anything. Up
          to 100 MB per file.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="upload-zone">Attach to</Label>
            <select
              id="upload-zone"
              value={targetZoneId}
              onChange={(e) => setTargetZoneId(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={uploading}
            >
              <option value="system">System-level</option>
              {[...zones]
                .sort((a, b) => a.zoneNumber - b.zoneNumber)
                .map((z) => (
                  <option key={z.id} value={z.id}>
                    Zone {z.zoneNumber}
                    {z.zoneName ? ` · ${z.zoneName}` : ""}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label htmlFor="upload-tags">Tags (comma-separated)</Label>
            <Input
              id="upload-tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="asbuilt, drawing, email"
              disabled={uploading}
              className="mt-1.5 h-11"
            />
          </div>
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="h-11 w-full sm:w-auto"
          >
            {uploading ? "Uploading…" : "Choose files"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const f = e.target.files;
              e.target.value = "";
              void onFiles(f);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────────────

function FileRow({
  file,
  zones,
  canEdit,
}: {
  file: SystemFile;
  zones: PropertyZone[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [deletePending, deleteStart] = useTransition();
  const [archivePending, archiveStart] = useTransition();
  const isImage = file.mimeType.startsWith("image/");
  const zone = file.zoneId ? zones.find((z) => z.id === file.zoneId) : null;

  function remove() {
    if (!confirm(`Delete "${file.filename}"?`)) return;
    deleteStart(async () => {
      const res = await fetch(`/api/property-files/${file.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Couldn't delete.");
        return;
      }
      toast.success("Deleted.");
      router.refresh();
    });
  }

  function archiveToDrive() {
    archiveStart(async () => {
      const res = await fetch(
        `/api/property-files/${file.id}/archive-to-drive`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as
        | { ok: true; driveWebViewLink: string }
        | { error: string; message?: string };
      if (!res.ok || !("ok" in data)) {
        const msg =
          "message" in data ? data.message : "Couldn't archive to Drive.";
        toast.error(msg ?? "Couldn't archive to Drive.");
        return;
      }
      toast.success("Archived to Drive.");
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
            alt={file.filename}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            {extOf(file.filename)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <a
          href={file.blobUrl}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-sm font-medium hover:underline"
        >
          {file.filename}
        </a>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            {zone
              ? `Zone ${zone.zoneNumber}${zone.zoneName ? ` · ${zone.zoneName}` : ""}`
              : "System-level"}
          </span>
          <span>·</span>
          <span>{formatBytes(file.sizeBytes)}</span>
          <span>·</span>
          <span>{formatDate(file.createdAt)}</span>
          {file.driveArchivedAt && (
            <>
              <span>·</span>
              <a
                href={file.driveWebViewLink ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 hover:underline dark:text-emerald-400"
              >
                ✓ Drive
              </a>
            </>
          )}
        </div>
        {file.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {file.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        {file.description && (
          <p className="mt-1 text-xs">{file.description}</p>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-col gap-1">
          {!file.driveArchivedAt && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={archiveToDrive}
              disabled={archivePending}
              title="Upload a copy to your connected Google Drive"
            >
              {archivePending ? "Archiving…" : "Drive"}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={remove}
            disabled={deletePending}
            className="text-destructive"
          >
            Delete
          </Button>
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
  if (n === 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
