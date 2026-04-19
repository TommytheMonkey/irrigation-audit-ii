// Turn an org's saved brand colors into a <style> block that overrides the
// Tailwind theme tokens (--primary, --accent, --ring, sidebar variants).
// Injected into <body> by the root layout so every downstream bg-primary /
// text-primary / etc. resolves to the customer's palette instead of Takeo's
// jungle-green default.

export function brandCss(
  primary: string | null,
  secondary: string | null,
): string | null {
  if (!primary && !secondary) return null;

  const rules: string[] = [];
  if (primary) {
    rules.push(`--primary:${primary};`);
    rules.push(`--primary-foreground:${foregroundFor(primary)};`);
    rules.push(`--ring:${primary};`);
    rules.push(`--sidebar-primary:${primary};`);
    rules.push(`--sidebar-primary-foreground:${foregroundFor(primary)};`);
    rules.push(`--sidebar-ring:${primary};`);
    rules.push(`--chart-1:${primary};`);
  }
  if (secondary) {
    rules.push(`--accent:${secondary};`);
    rules.push(`--accent-foreground:${foregroundFor(secondary)};`);
    rules.push(`--chart-2:${secondary};`);
  }

  return `:root{${rules.join("")}} .dark{${rules.join("")}}`;
}

/**
 * Pick black or white text for readable contrast on top of the given hex
 * background. Uses the standard luminance-weighted formula. Threshold of
 * 140 tuned empirically — yellow #f2ec76 comes out bright enough that black
 * wins; dark green #003720 picks white.
 */
function foregroundFor(hex: string): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 140 ? "#000000" : "#ffffff";
}
