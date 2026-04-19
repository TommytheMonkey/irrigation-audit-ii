"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type {
  PropertySystem,
  PropertyController,
  PropertyWaterSource,
  PropertyZone,
  PropertyPart,
  SystemFile,
  ZoneType,
  WiringType,
} from "@prisma/client";
import { SystemFiles } from "./system-files";
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
import { formatDate } from "@/lib/format";

// Single big client component driving the property system profile UI.
// Outer tabs = one per system. Inner sub-tabs = Overview | Parts. Everything
// here talks to the /api/property-* endpoints and does router.refresh() on
// success so the server component re-reads the DB for truth.

type SystemFull = PropertySystem & {
  controllers: PropertyController[];
  waterSources: PropertyWaterSource[];
  zones: PropertyZone[];
  parts: PropertyPart[];
  files: SystemFile[];
};

type AuditRow = {
  id: string;
  status: string;
  startedAt: Date;
  auditor: { name: string | null; email: string };
  _count: { findings: number; systems: number; zones: number };
};

export function PropertyProfile({
  property,
  systems,
  audits,
  canEdit,
}: {
  property: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    propertyManagerName: string | null;
    propertyManagerEmail: string | null;
    propertyManagerPhone: string | null;
  };
  systems: SystemFull[];
  audits: AuditRow[];
  canEdit: boolean;
}) {
  const [activeSystemId, setActiveSystemId] = useState<string | null>(
    systems[0]?.id ?? null,
  );
  const [subTab, setSubTab] = useState<"overview" | "parts" | "files">(
    "overview",
  );
  const [addingSystem, setAddingSystem] = useState(false);

  const activeSystem = systems.find((s) => s.id === activeSystemId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* Property basics */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-2xl sm:text-3xl">
                {property.name}
              </CardTitle>
              {property.address && (
                <CardDescription className="mt-1">
                  {[property.address, property.city, property.state, property.zip]
                    .filter(Boolean)
                    .join(", ")}
                </CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Property Manager" value={property.propertyManagerName} />
          <Field label="PM Email" value={property.propertyManagerEmail} />
          <Field label="PM Phone" value={property.propertyManagerPhone} />
        </CardContent>
      </Card>

      {/* System tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {systems.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setActiveSystemId(s.id);
              setSubTab("overview");
            }}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              s.id === activeSystemId
                ? "border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {s.name}
          </button>
        ))}
        {canEdit && !addingSystem && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddingSystem(true)}
          >
            + Add system
          </Button>
        )}
      </div>

      {addingSystem && (
        <AddSystemWizard
          propertyId={property.id}
          onCancel={() => setAddingSystem(false)}
          onCreated={(id) => {
            setAddingSystem(false);
            setActiveSystemId(id);
          }}
        />
      )}

      {/* Active system */}
      {activeSystem ? (
        <>
          <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
            <SubTabButton active={subTab === "overview"} onClick={() => setSubTab("overview")}>
              Overview
            </SubTabButton>
            <SubTabButton active={subTab === "parts"} onClick={() => setSubTab("parts")}>
              Parts in use ({activeSystem.parts.length})
            </SubTabButton>
            <SubTabButton active={subTab === "files"} onClick={() => setSubTab("files")}>
              Files ({activeSystem.files.length})
            </SubTabButton>
          </div>

          {subTab === "overview" ? (
            <SystemOverview system={activeSystem} canEdit={canEdit} />
          ) : subTab === "parts" ? (
            <SystemParts system={activeSystem} canEdit={canEdit} />
          ) : (
            <SystemFiles
              systemId={activeSystem.id}
              zones={activeSystem.zones}
              files={activeSystem.files}
              canEdit={canEdit}
              propertyName={property.name}
              systemName={activeSystem.name}
              audits={audits.map((a) => ({
                id: a.id,
                startedAt: a.startedAt,
                status: a.status,
                auditorName: a.auditor.name ?? a.auditor.email,
                findingsCount: a._count.findings,
              }))}
            />
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardDescription>
              No irrigation systems yet. {canEdit ? 'Click "Add system" above to create one.' : ''}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Audit history (property-level, bottom) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Audit history</CardTitle>
              <CardDescription>
                {audits.length} {audits.length === 1 ? "audit" : "audits"} on this property
              </CardDescription>
            </div>
            <Button
              size="lg"
              className="h-11"
              render={<Link href={`/audits/new?propertyId=${property.id}`} />}
            >
              Start New Audit
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {audits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audits yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              {audits.map((a) => {
                const isInProgress = a.status === "in_progress";
                const href = isInProgress
                  ? `/audits/${a.id}`
                  : `/audits/${a.id}/summary`;
                return (
                  <li
                    key={a.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {formatDate(a.startedAt)}
                        </span>
                        <Badge variant={isInProgress ? "default" : "secondary"}>
                          {a.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {a.auditor.name ?? a.auditor.email} · {a._count.systems}{" "}
                        sys · {a._count.zones} zones · {a._count.findings}{" "}
                        findings
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={href} />}
                    >
                      {isInProgress ? "Resume" : "View"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Add-system wizard
// Two paths: blank create (POST /api/property-systems) or zone-chart photo
// (POST /api/property-systems/from-photo — creates the system AND extracts
// zones from the photo via Claude vision). After creation the parent
// switches the active tab to the new system so the user lands on it.
// ─────────────────────────────────────────────────────────────────────────────

function AddSystemWizard({
  propertyId,
  onCancel,
  onCreated,
}: {
  propertyId: string;
  onCancel: () => void;
  onCreated: (systemId: string) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [method, setMethod] = useState<"blank" | "photo">("blank");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give the system a name first.");
      return;
    }

    if (method === "photo") {
      if (!photoFile) {
        toast.error("Pick a photo to extract from.");
        return;
      }
      start(async () => {
        const form = new FormData();
        form.append("file", photoFile);
        form.append("propertyId", propertyId);
        form.append("name", trimmed);
        const res = await fetch("/api/property-systems/from-photo", {
          method: "POST",
          body: form,
        });
        const data = (await res.json().catch(() => ({}))) as
          | { ok: true; systemId: string; zonesCreated: number }
          | { error: string; message?: string };
        if (!res.ok || !("ok" in data)) {
          const msg = "message" in data ? data.message : "Couldn't create system.";
          toast.error(msg ?? "Couldn't create system.");
          return;
        }
        toast.success(
          `${trimmed} added with ${data.zonesCreated} ${data.zonesCreated === 1 ? "zone" : "zones"} extracted.`,
        );
        onCreated(data.systemId);
        router.refresh();
      });
    } else {
      start(async () => {
        const res = await fetch("/api/property-systems", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId, name: trimmed }),
        });
        const data = (await res.json().catch(() => ({}))) as PropertySystem & {
          error?: string;
        };
        if (!res.ok || !data.id) {
          toast.error("Couldn't create system.");
          return;
        }
        toast.success(`${data.name} added.`);
        onCreated(data.id);
        router.refresh();
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a system</CardTitle>
        <CardDescription>
          Name it, then either start blank or upload a zone-chart photo to
          pre-populate zones.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="new-system-name">System name</Label>
            <Input
              id="new-system-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Front, Rear, System 1"
              autoFocus
              required
              className="mt-1.5 h-11"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-zinc-200 p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5 dark:border-zinc-800">
              <input
                type="radio"
                name="add-method"
                checked={method === "blank"}
                onChange={() => setMethod("blank")}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">Start blank</div>
                <div className="text-xs text-muted-foreground">
                  Add zones manually as you walk the site.
                </div>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-zinc-200 p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5 dark:border-zinc-800">
              <input
                type="radio"
                name="add-method"
                checked={method === "photo"}
                onChange={() => setMethod("photo")}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">From zone-chart photo</div>
                <div className="text-xs text-muted-foreground">
                  Upload a photo of the chart inside the controller door —
                  Claude will extract the zones.
                </div>
              </div>
            </label>
          </div>

          {method === "photo" && (
            <div className="rounded-md border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={pending}
                className="h-11"
              >
                {photoFile ? `Change photo — ${photoFile.name}` : "Choose photo"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f && f.size > 4 * 1024 * 1024) {
                    toast.error(
                      `${f.name} is ${(f.size / 1024 / 1024).toFixed(1)} MB — over the 4 MB limit for this path. Resize the photo or upload a smaller one.`,
                    );
                    return;
                  }
                  setPhotoFile(f ?? null);
                }}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? method === "photo"
                  ? "Extracting…"
                  : "Adding…"
                : method === "photo"
                  ? "Extract & create"
                  : "Create system"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SubTabButton({
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
      className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
          : "border-transparent text-muted-foreground hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{value ?? "—"}</dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// System overview (general info, contact, backflow, controllers, sources, zones)
// ─────────────────────────────────────────────────────────────────────────────

function SystemOverview({
  system,
  canEdit,
}: {
  system: SystemFull;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [deletePending, deleteStart] = useTransition();

  function deleteSystem() {
    if (!confirm(`Delete system "${system.name}"? All controllers, zones, and parts will be removed.`)) {
      return;
    }
    deleteStart(async () => {
      const res = await fetch(`/api/property-systems/${system.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Couldn't delete system.");
        return;
      }
      toast.success(`${system.name} deleted.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && <ImportDocumentCard systemId={system.id} />}
      <SystemHeaderCard system={system} canEdit={canEdit} onDelete={deleteSystem} deletePending={deletePending} />
      <OnSiteContactCard system={system} canEdit={canEdit} />
      <BackflowCard system={system} canEdit={canEdit} />
      <ControllersCard system={system} canEdit={canEdit} />
      <WaterSourcesCard system={system} canEdit={canEdit} />
      <ZonesCard system={system} canEdit={canEdit} />
      {system.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{system.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ImportDocumentCard({ systemId }: { systemId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  function pick() {
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm") && !lower.endsWith(".pdf")) {
      toast.error("Upload an .xlsx or .pdf file.");
      return;
    }
    // Vercel Hobby has a ~4.5 MB body limit. Warn the user before wasting a
    // Claude call on a request that'll be rejected at the edge.
    if (file.size > 4.4 * 1024 * 1024) {
      toast.error(
        `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — over the 4.5 MB upload limit on this plan.`,
      );
      return;
    }

    start(async () => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/property-systems/${systemId}/import-document`,
        { method: "POST", body: form },
      );
      const data = (await res.json().catch(() => ({}))) as
        | {
            ok: true;
            zonesCreated: number;
            zonesSkipped: number;
            partsCreated: number;
            fileKind: string;
          }
        | { error: string; message?: string };
      if (!res.ok || !("ok" in data)) {
        const msg = "message" in data ? data.message : "Import failed.";
        toast.error(msg ?? "Import failed.");
        return;
      }
      const skipped = data.zonesSkipped
        ? ` (${data.zonesSkipped} zones skipped — numbers already in use)`
        : "";
      toast.success(
        `Imported ${data.zonesCreated} zones, ${data.partsCreated} parts${skipped}.`,
      );
      router.refresh();
    });
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle className="text-base">Import from file</CardTitle>
            <CardDescription>
              Upload an .xlsx takeoff worksheet or a .pdf as-built. Claude
              will extract zones and parts and append them to this system.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={pick}
            disabled={pending}
            className="h-11 w-full sm:w-auto"
          >
            {pending ? "Reading…" : "Choose file"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm,.pdf"
            className="hidden"
            onChange={onFile}
          />
        </div>
      </CardHeader>
    </Card>
  );
}

function SystemHeaderCard({
  system,
  canEdit,
  onDelete,
  deletePending,
}: {
  system: SystemFull;
  canEdit: boolean;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(system.name);
  const [notes, setNotes] = useState(system.notes ?? "");
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await fetch(`/api/property-systems/${system.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, notes: notes || null }),
      });
      if (!res.ok) {
        toast.error("Couldn't save.");
        return;
      }
      toast.success("Saved.");
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{system.name}</CardTitle>
          {canEdit && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
                {editing ? "Cancel" : "Edit"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                disabled={deletePending}
                className="text-destructive hover:text-destructive"
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      {editing && (
        <CardContent>
          <form onSubmit={save} className="flex flex-col gap-3">
            <div>
              <Label htmlFor={`sys-name-${system.id}`}>Name</Label>
              <Input
                id={`sys-name-${system.id}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1.5 h-11"
              />
            </div>
            <div>
              <Label htmlFor={`sys-notes-${system.id}`}>Notes</Label>
              <textarea
                id={`sys-notes-${system.id}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="General notes about this system…"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  );
}

function OnSiteContactCard({
  system,
  canEdit,
}: {
  system: SystemFull;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(system.onSiteContactName ?? "");
  const [email, setEmail] = useState(system.onSiteContactEmail ?? "");
  const [phone, setPhone] = useState(system.onSiteContactPhone ?? "");
  const [role, setRole] = useState(system.onSiteContactRole ?? "");
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await fetch(`/api/property-systems/${system.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onSiteContactName: name || null,
          onSiteContactEmail: email || null,
          onSiteContactPhone: phone || null,
          onSiteContactRole: role || null,
        }),
      });
      if (!res.ok) {
        toast.error("Couldn't save.");
        return;
      }
      toast.success("Saved.");
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">On-site contact</CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
              {editing ? "Cancel" : "Edit"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" />
            </div>
            <div>
              <Label>Role</Label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Maintenance lead, etc." className="mt-1.5 h-11" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="mt-1.5 h-11" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className="mt-1.5 h-11" />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" value={system.onSiteContactName} />
            <Field label="Role" value={system.onSiteContactRole} />
            <Field label="Email" value={system.onSiteContactEmail} />
            <Field label="Phone" value={system.onSiteContactPhone} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BackflowCard({
  system,
  canEdit,
}: {
  system: SystemFull;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState(system.backflowType ?? "");
  const [size, setSize] = useState(system.backflowSize ?? "");
  const [status, setStatus] = useState(system.backflowStatus ?? "");
  const [lastTestedAt, setLastTestedAt] = useState(
    system.backflowLastTestedAt
      ? system.backflowLastTestedAt.toISOString().slice(0, 10)
      : "",
  );
  const [notes, setNotes] = useState(system.backflowNotes ?? "");
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await fetch(`/api/property-systems/${system.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backflowType: type || null,
          backflowSize: size || null,
          backflowStatus: status || null,
          backflowLastTestedAt: lastTestedAt || null,
          backflowNotes: notes || null,
        }),
      });
      if (!res.ok) {
        toast.error("Couldn't save.");
        return;
      }
      toast.success("Saved.");
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Backflow / RPZ</CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
              {editing ? "Cancel" : "Edit"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Type</Label>
              <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="RPZ, DCV, PVB…" className="mt-1.5 h-11" />
            </div>
            <div>
              <Label>Size</Label>
              <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder='1", 1.5"…' className="mt-1.5 h-11" />
            </div>
            <div>
              <Label>Status</Label>
              <Input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Passing, failing, not tested…" className="mt-1.5 h-11" />
            </div>
            <div>
              <Label>Last tested</Label>
              <Input value={lastTestedAt} onChange={(e) => setLastTestedAt(e.target.value)} type="date" className="mt-1.5 h-11" />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Type" value={system.backflowType} />
            <Field label="Size" value={system.backflowSize} />
            <Field label="Status" value={system.backflowStatus} />
            <Field
              label="Last tested"
              value={
                system.backflowLastTestedAt
                  ? formatDate(system.backflowLastTestedAt)
                  : null
              }
            />
            {system.backflowNotes && (
              <div className="sm:col-span-2">
                <Field label="Notes" value={system.backflowNotes} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Controllers
// ─────────────────────────────────────────────────────────────────────────────

function ControllersCard({
  system,
  canEdit,
}: {
  system: SystemFull;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Controllers</CardTitle>
            <CardDescription>
              {system.controllers.length}{" "}
              {system.controllers.length === 1 ? "controller" : "controllers"}
            </CardDescription>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>
              {adding ? "Cancel" : "+ Add"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {adding && (
          <ControllerForm
            systemId={system.id}
            onDone={() => setAdding(false)}
          />
        )}
        {system.controllers.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">None yet.</p>
        )}
        {system.controllers.map((c) => (
          <ControllerRow key={c.id} controller={c} canEdit={canEdit} />
        ))}
      </CardContent>
    </Card>
  );
}

function ControllerRow({
  controller,
  canEdit,
}: {
  controller: PropertyController;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deletePending, deleteStart] = useTransition();

  function remove() {
    if (!confirm(`Delete controller "${controller.name ?? "untitled"}"?`)) return;
    deleteStart(async () => {
      const res = await fetch(`/api/property-controllers/${controller.id}`, {
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

  if (editing) {
    return (
      <ControllerForm
        systemId={controller.systemId}
        initial={controller}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {controller.name ?? (`${controller.brand ?? ""} ${controller.model ?? ""}`.trim() || "Controller")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {[
              controller.brand && `${controller.brand}${controller.model ? ` ${controller.model}` : ""}`,
              controller.stationCount && `${controller.stationCount} stations`,
              controller.wiringType,
              controller.location,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
          {controller.rainSensorPresent && (
            <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              Rain sensor
            </span>
          )}
          {controller.notes && (
            <p className="mt-1.5 text-xs">{controller.notes}</p>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={deletePending} className="text-destructive">
              Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ControllerForm({
  systemId,
  initial,
  onDone,
}: {
  systemId: string;
  initial?: PropertyController;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [stationCount, setStationCount] = useState(
    initial?.stationCount?.toString() ?? "",
  );
  const [location, setLocation] = useState(initial?.location ?? "");
  const [wiringType, setWiringType] = useState<WiringType | "">(
    initial?.wiringType ?? "",
  );
  const [rainSensor, setRainSensor] = useState(initial?.rainSensorPresent ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const body = {
        name: name || null,
        brand: brand || null,
        model: model || null,
        stationCount: stationCount ? parseInt(stationCount, 10) : null,
        location: location || null,
        wiringType: wiringType || null,
        rainSensorPresent: rainSensor,
        notes: notes || null,
      };
      const res = initial
        ? await fetch(`/api/property-controllers/${initial.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/property-controllers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, systemId }),
          });
      if (!res.ok) {
        toast.error("Couldn't save.");
        return;
      }
      toast.success("Saved.");
      onDone();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={save}
      className="grid grid-cols-1 gap-3 rounded-md border border-zinc-300 bg-zinc-50/60 p-3 sm:grid-cols-2 dark:border-zinc-700 dark:bg-zinc-900/40"
    >
      <div>
        <Label>Label</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Main, Satellite 1…" className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>Location</Label>
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Garage, east wall…" className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>Brand</Label>
        <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Rain Bird, Hunter…" className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>Model</Label>
        <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>Station count</Label>
        <Input
          value={stationCount}
          onChange={(e) => setStationCount(e.target.value)}
          type="number"
          min={0}
          className="mt-1.5 h-11"
        />
      </div>
      <div>
        <Label>Wiring</Label>
        <select
          value={wiringType}
          onChange={(e) => setWiringType(e.target.value as WiringType | "")}
          className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">—</option>
          <option value="conventional">Conventional</option>
          <option value="two_wire">Two-wire</option>
        </select>
      </div>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input
          type="checkbox"
          checked={rainSensor}
          onChange={(e) => setRainSensor(e.target.checked)}
        />
        <span className="text-sm">Rain sensor present</span>
      </label>
      <div className="sm:col-span-2">
        <Label>Notes</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Water sources
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_TYPES = [
  { value: "city_meter", label: "City meter" },
  { value: "well", label: "Well" },
  { value: "cistern", label: "Cistern" },
  { value: "pond", label: "Pond / lake" },
  { value: "fire_hydrant", label: "Fire hydrant" },
  { value: "reclaimed", label: "Reclaimed" },
  { value: "other", label: "Other" },
];

function WaterSourcesCard({
  system,
  canEdit,
}: {
  system: SystemFull;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Water sources</CardTitle>
            <CardDescription>
              {system.waterSources.length}{" "}
              {system.waterSources.length === 1 ? "source" : "sources"}
            </CardDescription>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>
              {adding ? "Cancel" : "+ Add"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {adding && (
          <WaterSourceForm systemId={system.id} onDone={() => setAdding(false)} />
        )}
        {system.waterSources.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">None yet.</p>
        )}
        {system.waterSources.map((s) => (
          <WaterSourceRow key={s.id} source={s} canEdit={canEdit} />
        ))}
      </CardContent>
    </Card>
  );
}

function WaterSourceRow({
  source,
  canEdit,
}: {
  source: PropertyWaterSource;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  function remove() {
    if (!confirm("Delete this water source?")) return;
    start(async () => {
      const res = await fetch(`/api/property-water-sources/${source.id}`, {
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

  if (editing) {
    return (
      <WaterSourceForm
        systemId={source.systemId}
        initial={source}
        onDone={() => setEditing(false)}
      />
    );
  }

  const typeLabel =
    SOURCE_TYPES.find((t) => t.value === source.sourceType)?.label ??
    source.sourceType;

  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {source.label ?? typeLabel}
            {!source.permanent && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                Temporary
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {[
              typeLabel,
              source.gpm && `${source.gpm} GPM`,
              source.psi && `${source.psi} PSI`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          {source.notes && <p className="mt-1.5 text-xs">{source.notes}</p>}
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={pending} className="text-destructive">
              Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function WaterSourceForm({
  systemId,
  initial,
  onDone,
}: {
  systemId: string;
  initial?: PropertyWaterSource;
  onDone: () => void;
}) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState(initial?.sourceType ?? "city_meter");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [gpm, setGpm] = useState(initial?.gpm?.toString() ?? "");
  const [psi, setPsi] = useState(initial?.psi?.toString() ?? "");
  const [permanent, setPermanent] = useState(initial?.permanent ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const body = {
        sourceType,
        label: label || null,
        gpm: gpm ? parseFloat(gpm) : null,
        psi: psi ? parseFloat(psi) : null,
        permanent,
        notes: notes || null,
      };
      const res = initial
        ? await fetch(`/api/property-water-sources/${initial.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/property-water-sources", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, systemId }),
          });
      if (!res.ok) {
        toast.error("Couldn't save.");
        return;
      }
      toast.success("Saved.");
      onDone();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={save}
      className="grid grid-cols-1 gap-3 rounded-md border border-zinc-300 bg-zinc-50/60 p-3 sm:grid-cols-2 dark:border-zinc-700 dark:bg-zinc-900/40"
    >
      <div>
        <Label>Source type</Label>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {SOURCE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main meter, east cistern…" className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>GPM</Label>
        <Input value={gpm} onChange={(e) => setGpm(e.target.value)} type="number" step="0.01" className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>PSI</Label>
        <Input value={psi} onChange={(e) => setPsi(e.target.value)} type="number" step="0.01" className="mt-1.5 h-11" />
      </div>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input
          type="checkbox"
          checked={permanent}
          onChange={(e) => setPermanent(e.target.checked)}
        />
        <span className="text-sm">Permanent source (uncheck for temporary setups like a fire hydrant)</span>
      </label>
      <div className="sm:col-span-2">
        <Label>Notes</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Zones
// ─────────────────────────────────────────────────────────────────────────────

function ZonesCard({
  system,
  canEdit,
}: {
  system: SystemFull;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const sortedZones = [...system.zones].sort((a, b) => a.zoneNumber - b.zoneNumber);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Zones</CardTitle>
            <CardDescription>
              {system.zones.length} {system.zones.length === 1 ? "zone" : "zones"}
            </CardDescription>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>
              {adding ? "Cancel" : "+ Add"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {adding && (
          <ZoneForm systemId={system.id} onDone={() => setAdding(false)} />
        )}
        {system.zones.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">None yet.</p>
        )}
        {sortedZones.map((z) => (
          <ZoneRow key={z.id} zone={z} canEdit={canEdit} />
        ))}
      </CardContent>
    </Card>
  );
}

function ZoneRow({ zone, canEdit }: { zone: PropertyZone; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  function remove() {
    if (!confirm(`Delete zone ${zone.zoneNumber}?`)) return;
    start(async () => {
      const res = await fetch(`/api/property-zones/${zone.id}`, {
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

  if (editing) {
    return (
      <ZoneForm
        systemId={zone.systemId}
        initial={zone}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 min-w-[2rem] items-center justify-center rounded-md bg-zinc-900 px-1.5 text-xs font-semibold text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
              {zone.zoneNumber}
            </span>
            <span className="font-medium">
              {zone.zoneName ?? zone.zoneType}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {zone.zoneType}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {[
              [zone.valveBrand, zone.valveModel, zone.valveSize].filter(Boolean).join(" ") || null,
              zone.ballValvePresent === true && "ball valve",
              zone.ballValvePresent === false && "no ball valve",
              zone.headCount && `${zone.headCount} heads`,
              zone.coverage,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
          {zone.notes && <p className="mt-1.5 text-xs">{zone.notes}</p>}
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={pending} className="text-destructive">
              Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const ZONE_TYPES: ZoneType[] = ["spray", "drip", "bubbler", "rotor", "other"];

function ZoneForm({
  systemId,
  initial,
  onDone,
}: {
  systemId: string;
  initial?: PropertyZone;
  onDone: () => void;
}) {
  const router = useRouter();
  const [zoneNumber, setZoneNumber] = useState(initial?.zoneNumber?.toString() ?? "");
  const [zoneName, setZoneName] = useState(initial?.zoneName ?? "");
  const [zoneType, setZoneType] = useState<ZoneType>(initial?.zoneType ?? "spray");
  const [valveBrand, setValveBrand] = useState(initial?.valveBrand ?? "");
  const [valveModel, setValveModel] = useState(initial?.valveModel ?? "");
  const [valveSize, setValveSize] = useState(initial?.valveSize ?? "");
  const [ballValve, setBallValve] = useState<string>(
    initial?.ballValvePresent === true
      ? "yes"
      : initial?.ballValvePresent === false
        ? "no"
        : "unknown",
  );
  const [headCount, setHeadCount] = useState(initial?.headCount?.toString() ?? "");
  const [coverage, setCoverage] = useState(initial?.coverage ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const body = {
        zoneNumber: zoneNumber ? parseInt(zoneNumber, 10) : undefined,
        zoneName: zoneName || null,
        zoneType,
        valveBrand: valveBrand || null,
        valveModel: valveModel || null,
        valveSize: valveSize || null,
        ballValvePresent:
          ballValve === "yes" ? true : ballValve === "no" ? false : null,
        headCount: headCount ? parseInt(headCount, 10) : null,
        coverage: coverage || null,
        notes: notes || null,
      };
      const res = initial
        ? await fetch(`/api/property-zones/${initial.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/property-zones", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, systemId }),
          });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(data.message ?? "Couldn't save.");
        return;
      }
      toast.success("Saved.");
      onDone();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={save}
      className="grid grid-cols-1 gap-3 rounded-md border border-zinc-300 bg-zinc-50/60 p-3 sm:grid-cols-3 dark:border-zinc-700 dark:bg-zinc-900/40"
    >
      <div>
        <Label>Zone #</Label>
        <Input value={zoneNumber} onChange={(e) => setZoneNumber(e.target.value)} type="number" min={1} placeholder="auto" className="mt-1.5 h-11" />
      </div>
      <div className="sm:col-span-2">
        <Label>Name</Label>
        <Input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="Front lawn, back drip…" className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>Type</Label>
        <select
          value={zoneType}
          onChange={(e) => setZoneType(e.target.value as ZoneType)}
          className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {ZONE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Valve brand</Label>
        <Input value={valveBrand} onChange={(e) => setValveBrand(e.target.value)} className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>Valve model / size</Label>
        <div className="mt-1.5 flex gap-2">
          <Input value={valveModel} onChange={(e) => setValveModel(e.target.value)} placeholder="PGV" className="h-11 flex-1" />
          <Input value={valveSize} onChange={(e) => setValveSize(e.target.value)} placeholder='1.5"' className="h-11 w-20" />
        </div>
      </div>
      <div>
        <Label>Ball valve</Label>
        <select
          value={ballValve}
          onChange={(e) => setBallValve(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="unknown">Unknown</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>
      <div>
        <Label>Head count</Label>
        <Input value={headCount} onChange={(e) => setHeadCount(e.target.value)} type="number" min={0} className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>Coverage</Label>
        <Input value={coverage} onChange={(e) => setCoverage(e.target.value)} placeholder="~2000 sq ft" className="mt-1.5 h-11" />
      </div>
      <div className="sm:col-span-3">
        <Label>Notes</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="sm:col-span-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Parts
// ─────────────────────────────────────────────────────────────────────────────

function SystemParts({
  system,
  canEdit,
}: {
  system: SystemFull;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const [matchPending, matchStart] = useTransition();

  function runCatalogMatch() {
    matchStart(async () => {
      const res = await fetch("/api/property-parts/match-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemId: system.id }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | { ok: true; scanned: number; matched: number; unmatched: number }
        | { error: string; message?: string };
      if (!res.ok || !("ok" in data)) {
        toast.error("Couldn't run catalog matcher.");
        return;
      }
      if (data.scanned === 0) {
        toast.message("All parts already matched to a catalog entry.");
      } else {
        toast.success(
          `Matched ${data.matched} of ${data.scanned} unmatched parts.`,
        );
      }
      router.refresh();
    });
  }

  const unmatchedCount = system.parts.filter((p) => !p.catalogSymbol).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Parts in use</CardTitle>
            <CardDescription>
              Every part & piece used throughout this system. Imported from
              Excel / as-builts when available; matched against vendor
              catalogs for canonical part IDs.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {canEdit && unmatchedCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={runCatalogMatch}
                disabled={matchPending}
                title={`${unmatchedCount} part${unmatchedCount === 1 ? "" : "s"} without a catalog match`}
              >
                {matchPending ? "Matching…" : "Match catalog"}
              </Button>
            )}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>
                {adding ? "Cancel" : "+ Add part"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {adding && <PartForm systemId={system.id} onDone={() => setAdding(false)} />}
        {system.parts.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No parts recorded yet.</p>
        )}
        {system.parts.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-muted-foreground dark:border-zinc-800">
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Brand</th>
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">Size</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  {canEdit && <th className="py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {system.parts.map((p) => (
                  <PartRow key={p.id} part={p} canEdit={canEdit} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PartRow({ part, canEdit }: { part: PropertyPart; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  function remove() {
    if (!confirm(`Delete part "${[part.brand, part.model].filter(Boolean).join(" ") || "this part"}"?`)) return;
    start(async () => {
      const res = await fetch(`/api/property-parts/${part.id}`, {
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

  if (editing) {
    return (
      <tr>
        <td colSpan={canEdit ? 6 : 5}>
          <PartForm
            systemId={part.systemId}
            initial={part}
            onDone={() => setEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-900">
      <td className="py-2 pr-3">{part.category ?? "—"}</td>
      <td className="py-2 pr-3">
        <div className="flex flex-col gap-0.5">
          <span>{part.brand ?? "—"}</span>
          {part.catalogSymbol && (
            <span
              className="text-[10px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300"
              title={`Matched to ${part.catalogSource}: ${part.catalogSymbol}`}
            >
              ✓ Catalog
            </span>
          )}
        </div>
      </td>
      <td className="py-2 pr-3">{part.model ?? "—"}</td>
      <td className="py-2 pr-3">{part.size ?? "—"}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{part.quantity ?? "—"}</td>
      {canEdit && (
        <td className="py-2">
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={pending} className="text-destructive">
              Delete
            </Button>
          </div>
        </td>
      )}
    </tr>
  );
}

function PartForm({
  systemId,
  initial,
  onDone,
}: {
  systemId: string;
  initial?: PropertyPart;
  onDone: () => void;
}) {
  const router = useRouter();
  const [category, setCategory] = useState(initial?.category ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [size, setSize] = useState(initial?.size ?? "");
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const body = {
        category: category || null,
        brand: brand || null,
        model: model || null,
        size: size || null,
        quantity: quantity ? parseInt(quantity, 10) : null,
        notes: notes || null,
      };
      const res = initial
        ? await fetch(`/api/property-parts/${initial.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/property-parts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, systemId }),
          });
      if (!res.ok) {
        toast.error("Couldn't save.");
        return;
      }
      toast.success("Saved.");
      onDone();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={save}
      className="grid grid-cols-1 gap-3 rounded-md border border-zinc-300 bg-zinc-50/60 p-3 sm:grid-cols-5 dark:border-zinc-700 dark:bg-zinc-900/40"
    >
      <div>
        <Label>Category</Label>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="head, valve…" className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>Brand</Label>
        <Input value={brand} onChange={(e) => setBrand(e.target.value)} className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>Model</Label>
        <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>Size</Label>
        <Input value={size} onChange={(e) => setSize(e.target.value)} className="mt-1.5 h-11" />
      </div>
      <div>
        <Label>Qty</Label>
        <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min={0} className="mt-1.5 h-11" />
      </div>
      <div className="sm:col-span-5">
        <Label>Notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-11" />
      </div>
      <div className="sm:col-span-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
