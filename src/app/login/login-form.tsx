"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Two states: collecting an email vs. "we sent it, check your inbox".
// The dev shortcut button only renders when DEV_AUTO_LOGIN is set on the
// server (passed in by the page).
export function LoginForm({
  devAutoLoginEmail,
}: {
  devAutoLoginEmail: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    startTransition(async () => {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(data.message ?? "Couldn't send the link — check the email and try again.");
        return;
      }
      setSentTo(email.trim());
    });
  }

  function devLogin() {
    startTransition(async () => {
      const res = await fetch("/api/auth/dev-login", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirect?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Dev login failed");
        return;
      }
      router.push(json.redirect ?? "/");
      router.refresh();
    });
  }

  if (sentTo) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-5 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 text-2xl">📬</div>
        <div className="font-medium">Check your email</div>
        <div className="mt-1 text-sm text-muted-foreground">
          We sent a sign-in link to <strong>{sentTo}</strong>. It expires in 15
          minutes.
        </div>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setEmail("");
          }}
          className="mt-4 text-sm text-primary underline"
        >
          Try a different email
        </button>
        {devAutoLoginEmail && <DevHint />}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <label
        htmlFor="email"
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Email
      </label>
      <Input
        id="email"
        type="email"
        autoFocus
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-12 text-base"
        required
      />
      <Button
        type="submit"
        size="lg"
        className="mt-3 h-12 w-full text-base"
        disabled={pending}
      >
        {pending ? "Sending…" : "Send Magic Link"}
      </Button>

      {devAutoLoginEmail && (
        <>
          <DevHint />
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-2 h-12 w-full"
            onClick={devLogin}
            disabled={pending}
          >
            Dev login as {devAutoLoginEmail}
          </Button>
        </>
      )}
    </form>
  );
}

function DevHint() {
  return (
    <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <strong>Dev mode:</strong> magic-link emails are logged to the server
      console. Or use the dev login button below.
    </div>
  );
}
