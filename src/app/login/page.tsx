import Image from "next/image";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const devAutoLogin =
    process.env.NODE_ENV !== "production" && process.env.DEV_AUTO_LOGIN
      ? process.env.DEV_AUTO_LOGIN
      : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* Subtle gradient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo and branding */}
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
            Irrigation Audit
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to manage your property audits
          </p>
        </div>

        {error && <ErrorBanner code={error} />}

        <LoginForm devAutoLoginEmail={devAutoLogin} />

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Powered by{" "}
          <span className="font-semibold text-primary">Takeo</span>
        </p>
      </div>
    </main>
  );
}

function ErrorBanner({ code }: { code: string }) {
  const message =
    {
      missing_token: "Sign-in link was missing its token. Try again.",
      invalid_token: "That sign-in link isn't valid anymore.",
      token_used: "That sign-in link has already been used.",
      expired: "That sign-in link expired. Request a new one.",
      invalid_email: "Couldn't read the email on that link.",
    }[code] ?? "Sign-in failed. Try again.";
  return (
    <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}
