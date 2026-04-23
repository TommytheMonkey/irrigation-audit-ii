import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

// Grep-style static check that walks every Link href and router.push
// target and asserts each one resolves to a real App Router page. The
// motivating bug: QA hit /audits and got a 404 — we want future orphan
// links caught before they ship, not on a user's phone.
//
// Intentionally static: no DOM, no Next runtime, runs in ~ms under vitest.

const SRC_ROOT = join(__dirname, "..");
const APP_ROOT = join(SRC_ROOT, "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (
      (p.endsWith(".tsx") || p.endsWith(".ts")) &&
      !p.endsWith(".test.ts") &&
      !p.endsWith(".test.tsx")
    ) {
      out.push(p);
    }
  }
  return out;
}

// Enumerate the set of valid App Router page paths. [param] segments
// become regex placeholders; route groups (parens-wrapped) are flattened
// out since they don't affect URL paths.
function listRoutePatterns(): string[] {
  const patterns: string[] = [];
  function visit(dir: string, parts: string[]) {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (entries.includes("page.tsx") || entries.includes("page.ts")) {
      const normalized = parts.filter(
        (p) => !(p.startsWith("(") && p.endsWith(")")),
      );
      patterns.push("/" + normalized.join("/"));
    }
    for (const e of entries) {
      const p = join(dir, e);
      try {
        if (statSync(p).isDirectory()) visit(p, [...parts, e]);
      } catch {
        // ignore
      }
    }
  }
  visit(APP_ROOT, []);
  // Normalize the empty-path case ("/foo" + no parts → "/")
  return patterns.map((p) => p.replace(/\/+$/g, "") || "/");
}

function patternToRegex(pattern: string): RegExp {
  // [param] → [^/]+, [...slug] → .+
  const re = pattern
    .split("/")
    .map((seg) => {
      if (seg.startsWith("[...") && seg.endsWith("]")) return ".+";
      if (seg.startsWith("[") && seg.endsWith("]")) return "[^/]+";
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp("^" + (re || "/") + "$");
}

function extractLiteralHrefs(src: string): string[] {
  const hrefs: string[] = [];
  // JSX: href="..." or href='...'
  for (const m of src.matchAll(/href=["']([^"'{}\n]+)["']/g)) hrefs.push(m[1]);
  // router.push("...")
  for (const m of src.matchAll(
    /router\.push\(\s*["']([^"'`\n]+)["']\s*[,)]/g,
  ))
    hrefs.push(m[1]);
  // router.replace("...")
  for (const m of src.matchAll(
    /router\.replace\(\s*["']([^"'`\n]+)["']\s*[,)]/g,
  ))
    hrefs.push(m[1]);
  return hrefs;
}

describe("internal nav links", () => {
  const patterns = listRoutePatterns();
  const regexes = patterns.map(patternToRegex);
  const files = walk(SRC_ROOT);

  it("discovers at least one route pattern from the App Router tree", () => {
    // Sanity check — if this fails, the test harness itself is broken.
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns).toContain("/");
  });

  it("every literal href / router.push target resolves to a page", () => {
    const missing: Array<{ href: string; file: string }> = [];
    for (const f of files) {
      const rel = relative(SRC_ROOT, f);
      if (!rel.startsWith("app") && !rel.startsWith("components")) continue;
      const src = readFileSync(f, "utf8");
      for (const href of extractLiteralHrefs(src)) {
        // Skip external URLs, anchors, mailto, tel, protocol-relative, etc.
        if (!href.startsWith("/") || href.startsWith("//")) continue;
        // Skip /api/* — those are route handlers (form actions, not nav).
        if (href.startsWith("/api/")) continue;
        // Strip query / hash before matching.
        const path = href.split("?")[0].split("#")[0] || "/";
        const ok = regexes.some((r) => r.test(path));
        if (!ok) missing.push({ href, file: rel });
      }
    }
    // Pretty-print missing entries on failure so the diff is readable.
    expect(missing, JSON.stringify(missing, null, 2)).toEqual([]);
  });
});
