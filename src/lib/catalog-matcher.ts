// Match a free-text PropertyPart (brand + model + size) against the vendor
// catalogs. No fancy ML here — token-overlap scoring is more than enough
// for the ~450-row dataset, and it's deterministic, fast, and zero-dep.
//
// Usage:
//   const hit = matchPart("Rain Bird", "5004-PC 3.0", null)
//   → { source: "rainbird", symbol: "Rain Bird 5004-PC 3.0", score: 1 }
//
// Tune MIN_SCORE if false positives creep in. 0.5 = at least half the
// query tokens land in the catalog entry AND vice versa (we use max of the
// two denominators so a short query can't trivially match a long catalog
// entry by happenstance).

import { CATALOG_ENTRIES, type CatalogSource } from "./catalog-data";

const MIN_SCORE = 0.7;

// Common words in catalog names that don't discriminate between entries.
// Brand words are here too so matches have to agree on the *part* token
// (PGA, 1804, 5004-PC), not just share "rain bird" or "hunter".
const STOP_TOKENS = new Set([
  "series",
  "the",
  "a",
  "and",
  "or",
  "of",
  "rain",
  "bird",
  "rainbird",
  "hunter",
  "k",
  "kra",
  "krain",
  "weathermatic",
]);

// Normalize brand strings to catalog sources so we can pre-filter matching
// to the right vendor — improves precision and eliminates cross-vendor
// false positives on short queries.
const BRAND_TO_SOURCE: Record<string, CatalogSource> = {
  rainbird: "rainbird",
  "rain bird": "rainbird",
  hunter: "hunter",
  krain: "k_rain",
  "k rain": "k_rain",
  "k-rain": "k_rain",
  weathermatic: "weathermatic",
};

export type MatchResult = {
  source: CatalogSource;
  symbol: string; // the full "Rain Bird 5004-PC 3.0" string
  score: number;
};

type Tokenized = {
  entry: (typeof CATALOG_ENTRIES)[number];
  tokens: Set<string>;
};

// Token sets are built once at module load — 445 small sets = trivial memory.
const TOKENIZED: Tokenized[] = CATALOG_ENTRIES.map((entry) => ({
  entry,
  tokens: tokenize(entry.display),
}));

export function matchPart(
  brand: string | null | undefined,
  model: string | null | undefined,
  size: string | null | undefined,
): MatchResult | null {
  const query = [model, size].filter(Boolean).join(" ");
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return null;

  // Resolve the brand to a catalog source; if unknown, search all.
  const normalizedBrand = brand?.toLowerCase().trim();
  const source = normalizedBrand
    ? BRAND_TO_SOURCE[normalizedBrand] ?? null
    : null;
  const candidates = source
    ? TOKENIZED.filter((t) => t.entry.source === source)
    : TOKENIZED;

  // Score = "how many of my query tokens did you cover?" The catalog entry
  // can be longer (that's fine — it just has extra specificity). Tiebreak
  // by entry token count ascending so shorter/more-specific entries win
  // when multiple have full query coverage.
  let best: { t: Tokenized; score: number } | null = null;
  for (const t of candidates) {
    let hits = 0;
    for (const q of queryTokens) {
      if (t.tokens.has(q)) hits++;
    }
    if (hits === 0) continue;
    const score = hits / queryTokens.size;
    const isBetter =
      !best ||
      score > best.score ||
      (score === best.score && t.tokens.size < best.t.tokens.size);
    if (isBetter) {
      best = { t, score };
    }
  }

  if (!best || best.score < MIN_SCORE) return null;
  return {
    source: best.t.entry.source,
    symbol: best.t.entry.display,
    score: best.score,
  };
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      // Keep letters, digits, dot (for "5004-PC 3.0"), hyphen, slash, and
      // whitespace — everything else becomes a boundary.
      .replace(/[^a-z0-9./\-\s]/g, " ")
      .split(/[\s/]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !STOP_TOKENS.has(t)),
  );
}
