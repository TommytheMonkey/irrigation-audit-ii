import { describe, it, expect } from "vitest";
import { isBotUserAgent } from "./bot-ua";

// Real UA strings lifted from production logs / vendor docs. If a vendor
// changes their UA we'll update the list — false negatives are what hurt
// us (they burn magic-link tokens), so be permissive.
const BOT_UAS = [
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "Slack-ImgProxy 1.129 (+https://api.slack.com/robots)",
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  "TelegramBot (like TwitterBot)",
  "WhatsApp/2.21.12.21 A",
  "SkypeUriPreview Preview/0.5",
  "LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Mozilla/5.0 (compatible; Twitterbot/1.0)",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp) YahooExternalPreview",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; YandexBot/3.0; +http://yandex.com/bots)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/537.36 HeadlessChrome/120.0.0.0 Safari/537.36",
];

const REAL_UAS = [
  // Safari iPhone
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  // Chrome macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  // Firefox Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  // Edge Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  // Chrome Android
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
];

describe("isBotUserAgent", () => {
  it.each(BOT_UAS)("flags bot UA: %s", (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it.each(REAL_UAS)("allows real browser UA: %s", (ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });

  it("treats missing UA as bot (safer default)", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent(undefined)).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isBotUserAgent("SLACKBOT-LINKEXPANDING")).toBe(true);
    expect(isBotUserAgent("slackbot-linkexpanding")).toBe(true);
  });
});
