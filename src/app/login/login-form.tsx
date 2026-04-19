"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, ArrowRight, Loader2 } from "lucide-react";

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
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Check your email</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a sign-in link to{" "}
          <span className="font-medium text-foreground">{sentTo}</span>.
          <br />
          It expires in 15 minutes.
        </p>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setEmail("");
          }}
          className="mt-5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
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
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <label
        htmlFor="email"
        className="mb-2 block text-sm font-medium text-foreground"
      >
        Email address
      </label>
      <Input
        id="email"
        type="email"
        autoFocus
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-12 rounded-xl border-border bg-background px-4 text-base transition-all focus-visible:ring-2 focus-visible:ring-primary/20"
        required
      />
      <Button
        type="submit"
        size="lg"
        className="mt-4 h-12 w-full gap-2 rounded-xl text-base font-semibold shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
        disabled={pending}
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            Continue with Email
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>

      {devAutoLoginEmail && (
        <>
          <DevHint />
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-3 h-12 w-full rounded-xl"
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
    <div className="mt-4 rounded-xl bg-accent/50 px-4 py-3 text-xs text-foreground">
      <span className="font-semibold">Dev mode:</span> Magic-link emails are logged to the server console.
    </div>
  );
}
