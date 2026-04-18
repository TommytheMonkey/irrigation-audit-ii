// "Magic Fill": take a company website URL, extract branding signals (logo,
// brand colors, primary font), and return them for the onboarding form to
// pre-fill. Scraping-heavy so flaky by nature — callers should surface a
// graceful failure that falls back to the manual fields.

import Anthropic from "@anthropic-ai/sdk";

export type BrandResult = {
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFamily: string | null;
};

export type BrandExtractError =
  | "invalid_url"
  | "blocked_host"
  | "fetch_failed"
  | "not_html"
  | "llm_error"
  | "not_configured";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_HTML_TO_LLM = 60_000;

function validateUrl(raw: string): URL | BrandExtractError {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "invalid_url";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "invalid_url";

  // Block obvious SSRF targets. We don't do DNS resolution here — that's a
  // deeper defense that requires resolving + checking every returned IP
  // (including redirects). For an admin-only endpoint against public
  // marketing sites, blocking literal internal hosts is the right level.
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  ) {
    return "blocked_host";
  }
  return u;
}

type FetchHtmlResult =
  | { ok: true; html: string }
  | { ok: false; error: BrandExtractError };

async function fetchHtml(url: URL): Promise<FetchHtmlResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "IrrigationAudit/1.0 (+brand-fill)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return { ok: false, error: "fetch_failed" };
    const ct = res.headers.get("content-type") ?? "";
    if (!/^text\/html|application\/xhtml/.test(ct)) {
      return { ok: false, error: "not_html" };
    }

    const reader = res.body?.getReader();
    if (!reader) return { ok: false, error: "fetch_failed" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    return { ok: true, html: new TextDecoder("utf-8").decode(concatChunks(chunks)) };
  } catch {
    return { ok: false, error: "fetch_failed" };
  } finally {
    clearTimeout(timer);
  }
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// Strip content that's pure noise for brand extraction (scripts, comments,
// noscript). Keep <style> and <link>/<meta> — those are the load-bearing
// signal for logos and colors.
function trimHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .slice(0, MAX_HTML_TO_LLM);
}

function isValidResult(x: unknown): x is BrandResult {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const keys = ["logoUrl", "primaryColor", "secondaryColor", "fontFamily"];
  return keys.every(
    (k) => o[k] === null || typeof o[k] === "string" || o[k] === undefined,
  );
}

function normalize(r: BrandResult, baseUrl: URL): BrandResult {
  const hex = (v: string | null): string | null => {
    if (!v) return null;
    const trimmed = v.trim();
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      // Expand #rgb → #rrggbb to match the color validator in the settings API.
      const m = trimmed.slice(1);
      return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    return null;
  };
  const absUrl = (v: string | null): string | null => {
    if (!v) return null;
    try {
      return new URL(v, baseUrl).toString();
    } catch {
      return null;
    }
  };
  return {
    logoUrl: absUrl(r.logoUrl),
    primaryColor: hex(r.primaryColor),
    secondaryColor: hex(r.secondaryColor),
    fontFamily: r.fontFamily?.trim() || null,
  };
}

export async function extractBrand(
  rawUrl: string,
): Promise<{ ok: true; data: BrandResult } | { ok: false; error: BrandExtractError; message: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: "not_configured",
      message: "ANTHROPIC_API_KEY isn't set. Add it to .env to use Magic Fill.",
    };
  }

  const urlOrErr = validateUrl(rawUrl);
  if (typeof urlOrErr === "string") {
    return {
      ok: false,
      error: urlOrErr,
      message:
        urlOrErr === "invalid_url"
          ? "Enter a valid http(s) URL."
          : "That host isn't allowed.",
    };
  }
  const url = urlOrErr;

  const fetched = await fetchHtml(url);
  if (!fetched.ok) {
    return {
      ok: false,
      error: fetched.error,
      message:
        fetched.error === "not_html"
          ? "That URL didn't return an HTML page."
          : "Couldn't fetch the page. Check the URL and try again.",
    };
  }
  const html = trimHtml(fetched.html);

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system:
        "Extract branding signals from website HTML. Respond with JSON only — no prose, no markdown fences. The JSON must have exactly these keys: logoUrl (string or null), primaryColor (hex like #rrggbb or null), secondaryColor (hex like #rrggbb or null), fontFamily (string or null). For logoUrl prefer an <img> in the site header with 'logo' in the src/alt, else <link rel=\"icon\"> or <link rel=\"apple-touch-icon\">. Relative URLs are fine — the caller will resolve them. For colors, look at CSS custom properties (--primary, --brand), inline styles, and <meta name=\"theme-color\">. For fontFamily, prefer the first font-family used on body or html, stripping quotes and fallbacks (e.g. 'Inter, system-ui, sans-serif' → 'Inter'). Use null when a signal is genuinely not present — do not guess.",
      messages: [
        {
          role: "user",
          content: `Base URL: ${url.origin}\n\nHTML:\n${html}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { ok: false, error: "llm_error", message: "Empty response from Claude." };
    }

    const cleaned = textBlock.text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[magic-fill] non-JSON response:", textBlock.text.slice(0, 500));
      return {
        ok: false,
        error: "llm_error",
        message: "Claude returned invalid JSON.",
      };
    }

    if (!isValidResult(parsed)) {
      console.error("[magic-fill] bad shape:", parsed);
      return {
        ok: false,
        error: "llm_error",
        message: "Claude's JSON didn't match the expected shape.",
      };
    }

    const normalized = normalize(
      {
        logoUrl: (parsed as BrandResult).logoUrl ?? null,
        primaryColor: (parsed as BrandResult).primaryColor ?? null,
        secondaryColor: (parsed as BrandResult).secondaryColor ?? null,
        fontFamily: (parsed as BrandResult).fontFamily ?? null,
      },
      url,
    );
    console.log(
      `[magic-fill] ${url.hostname} → raw=${JSON.stringify(parsed)} normalized=${JSON.stringify(normalized)}`,
    );
    return { ok: true, data: normalized };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return {
        ok: false,
        error: "not_configured",
        message: "ANTHROPIC_API_KEY is invalid.",
      };
    }
    if (e instanceof Anthropic.APIError) {
      console.error("[magic-fill] Anthropic error:", e.status, e.message);
      return {
        ok: false,
        error: "llm_error",
        message: `Claude API error (${e.status}).`,
      };
    }
    console.error("[magic-fill] unexpected error:", e);
    return { ok: false, error: "llm_error", message: "Unexpected error." };
  }
}
