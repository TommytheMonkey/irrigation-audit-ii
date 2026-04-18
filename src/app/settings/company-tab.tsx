"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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

// Settings → Company tab. Same fields as the onboarding wizard's company
// step but without the Continue/Skip buttons — this is just a save form.
export function CompanyTab({
  initial,
  canEdit,
}: {
  initial: { name: string; emailDomain: string | null };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [domain, setDomain] = useState(initial.emailDomain ?? "");
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, emailDomain: domain || null }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(json.message ?? "Couldn't save.");
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company info</CardTitle>
        <CardDescription>
          Display name and the email domain that controls auto-join on
          first sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="org-name">Company name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={!canEdit}
              className="mt-1.5 h-11"
            />
          </div>
          <div>
            <Label htmlFor="email-domain">Email domain</Label>
            <Input
              id="email-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="yourcompany.com"
              disabled={!canEdit}
              className="mt-1.5 h-11"
            />
          </div>
          {canEdit && (
            <div className="flex justify-end pt-1">
              <Button type="submit" size="lg" className="h-11" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
