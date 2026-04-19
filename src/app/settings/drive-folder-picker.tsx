"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Folder = { id: string; name: string };

// Picker for the org's Drive export-root folder. drive.file scope only
// returns folders the app has touched, so we expose a "Create new folder"
// action too — first-time users won't see anything in the dropdown.
export function DriveFolderPicker({
  currentFolderId,
  canEdit,
}: {
  currentFolderId: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selected, setSelected] = useState<string>(currentFolderId ?? "root");
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [newName, setNewName] = useState("");
  const [pending, start] = useTransition();
  const [listing, setListing] = useState(false);

  useEffect(() => {
    void loadFolders();
  }, []);

  async function loadFolders() {
    setListing(true);
    try {
      const res = await fetch("/api/settings/google/drive-folder");
      const data = (await res.json()) as
        | { folders: Folder[]; currentId: string | null }
        | { error: string; message?: string };
      if (!("folders" in data)) {
        toast.error("Couldn't list Drive folders.");
        return;
      }
      setFolders(data.folders);
      setSelected(data.currentId ?? "root");
      setLoaded(true);
    } finally {
      setListing(false);
    }
  }

  function save() {
    start(async () => {
      const body =
        mode === "create"
          ? { createFolderName: newName.trim() }
          : { folderId: selected === "root" ? null : selected };
      const res = await fetch("/api/settings/google/drive-folder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.message ?? "Couldn't save.");
        return;
      }
      toast.success("Export folder updated.");
      setMode("pick");
      setNewName("");
      await loadFolders();
      router.refresh();
    });
  }

  const currentLabel =
    currentFolderId === null
      ? "My Drive (root)"
      : folders.find((f) => f.id === currentFolderId)?.name ??
        "Folder (not visible to app)";

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Export folder
          </div>
          <div className="mt-0.5 font-medium">{currentLabel}</div>
        </div>
        {canEdit && loaded && (
          <div className="flex gap-2">
            {mode === "pick" ? (
              <>
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  disabled={pending}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="root">My Drive (root)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={save} disabled={pending}>
                  {pending ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMode("create")}
                  disabled={pending}
                >
                  + New folder
                </Button>
              </>
            ) : (
              <>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Folder name"
                  disabled={pending}
                  className="h-9 w-48"
                />
                <Button
                  size="sm"
                  onClick={save}
                  disabled={pending || !newName.trim()}
                >
                  {pending ? "Creating…" : "Create & use"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMode("pick")}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        )}
        {canEdit && !loaded && listing && (
          <span className="text-xs text-muted-foreground">Loading…</span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        All exported Sheets and reports land under{" "}
        <code>{currentLabel}</code> / Property Reports / &lt;property&gt; /
        audit-&lt;date&gt;. Google&apos;s drive.file scope means only folders
        the app has touched show up — use <strong>+ New folder</strong> to
        create one.
      </p>
    </div>
  );
}
