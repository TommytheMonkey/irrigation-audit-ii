// Tiny email shim. In dev (no AGENTMAIL_API_KEY / INBOX_ID) it logs the link
// to the server console. In prod, it POSTs to AgentMail. Fire-and-forget;
// callers don't await delivery because we don't want a flaky email provider
// blocking the login response.

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

export function sendEmail(payload: EmailPayload): void {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  const inboxId = process.env.AGENTMAIL_INBOX_ID;

  if (!apiKey || !inboxId) {
    console.log("\n──────── EMAIL (dev console) ────────");
    console.log(`To:      ${payload.to}`);
    console.log(`Subject: ${payload.subject}`);
    console.log(payload.text);
    console.log("─────────────────────────────────────\n");
    return;
  }

  const url = `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`;
  fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[email] agentmail ${res.status}:`, body.slice(0, 500));
      }
    })
    .catch((err) => {
      console.error("[email] agentmail failed:", err);
    });
}
