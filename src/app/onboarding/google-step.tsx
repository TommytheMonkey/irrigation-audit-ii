"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Step 4: Google OAuth. The button just navigates to /api/auth/google?next=…
// which redirects to Google's consent screen and eventually lands back here
// with ?google_connected=1 (or ?google_error=…). Disconnect calls
// DELETE /api/settings/google.
export function GoogleStep({
  connectedEmail,
  googleError,
  justConnected,
  nextHref,
  backHref,
}: {
  connectedEmail: string | null;
  googleError: string | null;
  justConnected: boolean;
  nextHref: string;
  backHref: string;
}) {
  const router = useRouter();

  // Surface the bounce-back result as a toast on first paint, then strip the
  // query params so a refresh doesn't re-fire it.
  useEffect(() => {
    if (justConnected) {
      toast.success("Google account connected.");
      router.replace("/onboarding?step=4");
    } else if (googleError) {
      toast.error(googleErrorMessage(googleError));
      router.replace("/onboarding?step=4");
    }
    // Intentionally only on first mount; the next render won't have these
    // search params anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function connect() {
    window.location.href = `/api/auth/google?next=${encodeURIComponent("/onboarding?step=4")}`;
  }

  function googleErrorMessage(code: string): string {
    switch (code) {
      case "missing_credentials":
        return "Google OAuth isn't configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.";
      case "missing_app_url":
        return "APP_URL isn't set in .env.";
      case "app_url_mismatch":
        return "APP_URL points at localhost but you're connecting from another device. Update APP_URL to your LAN IP and restart.";
      case "config_error":
        return "Google OAuth config is invalid. Check the server logs.";
      case "state_mismatch":
        return "OAuth state check failed. Try again.";
      default:
        return `Google connect failed: ${code}`;
    }
  }

  async function disconnect() {
    const res = await fetch("/api/settings/google", { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't disconnect Google.");
      return;
    }
    toast.success("Disconnected.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Drive &amp; Sheets</CardTitle>
        <CardDescription>
          We use your Google account to sync audits to Google Sheets (so your
          estimator can price them) and to store the config sheet that drives
          the audit UI.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {connectedEmail ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
              Connected as <strong>{connectedEmail}</strong>
            </div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 self-start"
              onClick={disconnect}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="lg"
            className="h-11"
            onClick={connect}
          >
            Connect Google account
          </Button>
        )}

        <div className="mt-6 flex justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-11"
            onClick={() => router.push(backHref)}
          >
            Back
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-11"
            onClick={() => router.push(nextHref)}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
