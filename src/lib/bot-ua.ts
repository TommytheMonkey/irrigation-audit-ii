// Heuristic User-Agent check used by the magic-link verify endpoint.
//
// Why this exists: Slack, iMessage, Gmail and friends fetch any URL in an
// incoming message to render a preview. If the magic-link URL is the
// actual token-consumption endpoint, those fetches burn the one-time
// token before the user ever clicks — the user then gets "link expired."
//
// Primary mitigation is a GET-safe confirmation page that only consumes
// the token on an explicit POST. This function is the belt-and-suspenders
// guard on the POST endpoint for cases where something weird does hit it
// (misconfigured preview service, corporate proxy re-posting forms, etc).
//
// The matcher is intentionally loose — false positives are cheap (the
// "bot" just has to click Continue again), false negatives are what burns
// tokens. Keep the list long and lowercase-compared.

const BOT_PATTERNS = [
  // Messaging / social previews
  "slackbot",
  "slack-imgproxy",
  "discordbot",
  "telegrambot",
  "whatsapp",
  "skypeuripreview",
  "linkedinbot",
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "redditbot",
  "pinterestbot",
  "snapchat",

  // Mail providers prefetching links
  "googleimageproxy",
  "outlook",
  "yahooexternalpreview",

  // Generic crawlers / link-unfurlers
  "googlebot",
  "bingbot",
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "applebot",
  "ia_archiver",
  "semrushbot",
  "ahrefsbot",
  "mj12bot",
  "dotbot",
  "petalbot",

  // Generic tokens common in crawlers
  "headlesschrome",
  "phantomjs",
  "puppeteer",
  "prerender",
  "preview",
  "crawler",
  "spider",
  "scraper",
] as const;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) {
    // Missing UA header is almost never a real browser — treat as suspicious.
    return true;
  }
  const lower = ua.toLowerCase();
  return BOT_PATTERNS.some((p) => lower.includes(p));
}
