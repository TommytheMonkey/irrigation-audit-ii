// Tiny email shim. In dev (no RESEND_API_KEY) it logs the link to the
// server console — the developer clicks it manually. In prod, it fires off
// to Resend. Either way it's fire-and-forget; callers don't await delivery
// because we don't want a flaky email provider blocking the login response.

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

export function sendEmail(payload: EmailPayload): void {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev mode: log it. The magic link is the only thing that matters.
    console.log("\n──────── EMAIL (dev console) ────────");
    console.log(`To:      ${payload.to}`);
    console.log(`Subject: ${payload.subject}`);
    console.log(payload.text);
    console.log("─────────────────────────────────────\n");
    return;
  }

  // Fire-and-forget Resend call. We deliberately don't await; logging the
  // failure is enough — the user will retry the magic link if it never lands.
  fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "auth@irrigation-audit.app",
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    }),
  }).catch((err) => {
    console.error("[email] resend failed:", err);
  });
}
