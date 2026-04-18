import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { CompanyStep } from "./company-step";
import { MondayStep } from "./monday-step";
import { BrandingStep } from "./branding-step";
import { GoogleStep } from "./google-step";
import { DoneStep } from "./done-step";
import { StepIndicator } from "./step-indicator";

export const dynamic = "force-dynamic";

// 5-step onboarding wizard, URL-driven via ?step=N so the back button just
// works. Each step is a small client island that calls a settings API route
// to save its slice of the org config. "Skip" is just a Link to the next
// step — saves nothing.
//
// Non-admin users get bounced to the dashboard since they shouldn't be
// touching org config. The wizard is also reachable AFTER onboarding via
// /onboarding?step=1, in case someone wants to revisit it; the final step
// idempotently flips onboardingComplete.
const STEP_COUNT = 5;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; google_error?: string; google_connected?: string }>;
}) {
  const user = await requireAuth({ allowOnboarding: true });
  if (user.role !== "admin") redirect("/");

  const params = await searchParams;
  const step = clamp(parseInt(params.step ?? "1", 10) || 1, 1, STEP_COUNT);

  const org = await db.org.findUniqueOrThrow({
    where: { id: user.orgId },
    select: {
      id: true,
      name: true,
      emailDomain: true,
      mondayBoardId: true,
      mondayApiKeyEnc: true,
      mondayColumnMapping: true,
      brandColorPrimary: true,
      brandColorSecondary: true,
      primaryLogoUrl: true,
      fontFamily: true,
      googleConnectedEmail: true,
    },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Skip to dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Set up {org.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A few quick steps to get the app talking to your tools. You can
          skip any step and come back later from Settings.
        </p>
      </header>

      <StepIndicator current={step} total={STEP_COUNT} />

      <div className="mt-6">
        {step === 1 && (
          <CompanyStep
            initial={{ name: org.name, emailDomain: org.emailDomain }}
            nextHref="/onboarding?step=2"
          />
        )}
        {step === 2 && (
          <MondayStep
            initial={{
              hasApiKey: org.mondayApiKeyEnc !== null,
              boardId: org.mondayBoardId,
              mapping:
                (org.mondayColumnMapping as Record<string, string> | null) ?? null,
            }}
            nextHref="/onboarding?step=3"
            backHref="/onboarding?step=1"
          />
        )}
        {step === 3 && (
          <BrandingStep
            initial={{
              primaryLogoUrl: org.primaryLogoUrl,
              brandColorPrimary: org.brandColorPrimary,
              brandColorSecondary: org.brandColorSecondary,
              fontFamily: org.fontFamily,
            }}
            nextHref="/onboarding?step=4"
            backHref="/onboarding?step=2"
          />
        )}
        {step === 4 && (
          <GoogleStep
            connectedEmail={org.googleConnectedEmail}
            googleError={params.google_error ?? null}
            justConnected={params.google_connected === "1"}
            nextHref="/onboarding?step=5"
            backHref="/onboarding?step=3"
          />
        )}
        {step === 5 && <DoneStep />}
      </div>
    </main>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}
