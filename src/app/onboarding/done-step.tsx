"use client";

import { useTransition } from "react";
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

// Step 5: confirm + flip the gate. POST /api/onboarding/complete sets
// onboardingComplete=true on the org so requireAuth() stops sending
// people back here. Then we router.refresh() and push to the dashboard.
export function DoneStep() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function finish() {
    startTransition(async () => {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      if (!res.ok) {
        toast.error("Couldn't finish onboarding. Try again?");
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;re all set</CardTitle>
        <CardDescription>
          You can revisit any of these settings later under Settings →
          Integrations. Your seeded properties are waiting on the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          size="lg"
          className="h-12 w-full text-base"
          onClick={finish}
          disabled={pending}
        >
          {pending ? "Finishing…" : "Go to dashboard"}
        </Button>
      </CardContent>
    </Card>
  );
}
