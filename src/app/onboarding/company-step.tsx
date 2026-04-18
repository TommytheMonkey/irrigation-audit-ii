"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Step 1: company name + email domain. Saves to /api/settings/company on
// "Continue" then advances to step 2. Skip just navigates without saving.
export function CompanyStep({
  initial,
  nextHref,
}: {
  initial: { name: string; emailDomain: string | null };
  nextHref: string;
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
        toast.error(json.message ?? "Couldn't save company info.");
        return;
      }
      router.push(nextHref);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company info</CardTitle>
        <CardDescription>
          The display name shows up in the app header and on PDF reports.
          The email domain controls who auto-joins your org when they sign in
          for the first time.
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
              className="mt-1.5 h-11"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Anyone who signs in with an email at this domain will join this
              org as an auditor. Leave blank to disable.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11"
              onClick={() => router.push(nextHref)}
              disabled={pending}
            >
              Skip
            </Button>
            <Button type="submit" size="lg" className="h-11" disabled={pending}>
              {pending ? "Saving…" : "Continue"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
