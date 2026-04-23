import Image from "next/image";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

// Intermediate sign-in confirmation page.
//
// Why: magic-link emails used to point straight at /api/auth/verify, which
// consumes the one-time token. Gmail, Slack, iMessage etc. prefetch URLs
// in messages to render previews — those prefetches burned the token
// before the user could click. This page is GET-safe (no token work) and
// requires an explicit POST (form submit from the Continue button) to
// exchange the token. Bots don't execute form submits, so the token
// survives the preview fetch.
//
// The dynamic export keeps this page out of any CDN/proxy cache.
export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/login?error=missing_token");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mb-6 inline-flex items-center justify-center">
            <Image
              src="/takeo-icon.jpg"
              alt="Takeo"
              width={64}
              height={64}
              className="rounded-2xl shadow-lg"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Sign in to Irrigation Audit
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Click continue to finish signing in. This link can only be used once.
          </p>
        </div>

        {/*
          Plain HTML form so this works with JavaScript disabled. The POST
          to /api/auth/verify is what actually consumes the token; link
          previewers only perform GET, so they never reach it.
        */}
        <form
          method="POST"
          action="/api/auth/verify"
          className="rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <input type="hidden" name="token" value={token} />
          <Button
            type="submit"
            size="lg"
            className="h-12 w-full rounded-xl text-base font-semibold shadow-sm"
          >
            Continue
          </Button>
        </form>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Powered by <span className="font-semibold text-primary">Takeo</span>
        </p>
      </div>
    </main>
  );
}
