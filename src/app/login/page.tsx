import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

// Public login page. Server component just decides whether the dev banner +
// dev-login button get rendered (driven by NODE_ENV + DEV_AUTO_LOGIN).
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
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-3 h-12 w-12 rounded-xl"
            style={{ backgroundColor: "#1e6f3a" }}
            aria-hidden
          />
          <h1 className="text-2xl font-semibold tracking-tight">
            Irrigation Audit
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your email
          </p>
        </div>

        {error && <ErrorBanner code={error} />}

        <LoginForm devAutoLoginEmail={devAutoLogin} />
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
    <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
      {message}
    </div>
  );
}
