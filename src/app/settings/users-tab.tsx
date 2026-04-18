"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  lastLoginAt: Date | null;
  createdAt: Date;
};

const ROLES: UserRole[] = ["admin", "auditor", "estimator"];

// Settings → Users tab. Lists every member of the org with inline role
// editing + delete, plus an invite form at the top. The server has the
// final say (last-admin guard etc.) so client-side is intentionally trusting.
export function UsersTab({
  initialUsers,
  currentUserId,
  canEdit,
}: {
  initialUsers: UserRow[];
  currentUserId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("auditor");
  const [invitePending, inviteStart] = useTransition();

  function invite(e: React.FormEvent) {
    e.preventDefault();
    inviteStart(async () => {
      const res = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const json = (await res.json().catch(() => ({}))) as
        | UserRow
        | { error: string; message?: string };
      if (!res.ok || "error" in json) {
        const msg = "message" in json ? json.message : "Couldn't invite user.";
        toast.error(msg ?? "Couldn't invite user.");
        return;
      }
      toast.success(`Invited ${json.email}.`);
      setInviteEmail("");
      router.refresh();
    });
  }

  async function changeRole(userId: string, role: UserRole) {
    // Optimistic: update local state, roll back on error.
    const prev = users;
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, role } : x)));
    const res = await fetch(`/api/settings/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      toast.error(json.message ?? "Couldn't update role.");
      setUsers(prev);
      return;
    }
    router.refresh();
  }

  async function remove(userId: string, email: string) {
    if (!confirm(`Remove ${email} from the org?`)) return;
    const prev = users;
    setUsers((u) => u.filter((x) => x.id !== userId));
    const res = await fetch(`/api/settings/users/${userId}`, { method: "DELETE" });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      toast.error(json.message ?? "Couldn't remove user.");
      setUsers(prev);
      return;
    }
    toast.success(`${email} removed.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>
              They&apos;ll join the org the first time they sign in with this
              email. No invitation email yet — just tell them to head to the
              login page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={invite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  required
                  className="mt-1.5 h-11"
                />
              </div>
              <div className="sm:w-40">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  className="mt-1.5 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" size="lg" className="h-11" disabled={invitePending}>
                {invitePending ? "Inviting…" : "Invite"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {users.length} {users.length === 1 ? "member" : "members"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {u.name ?? u.email}
                    {u.id === currentUserId && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </div>
                  {u.name && (
                    <div className="truncate text-xs text-muted-foreground">
                      {u.email}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canEdit ? (
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                      className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {u.role}
                    </span>
                  )}
                  {canEdit && u.id !== currentUserId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(u.id, u.email)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
