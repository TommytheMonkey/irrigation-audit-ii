// Regenerate src/lib/catalog-data.ts from the CSVs under parts-catalogs/.
// Run when vendor catalogs change:
//   npx tsx scripts/build-catalog-data.ts
//
// We embed catalog data in a TS module (rather than reading CSV at runtime)
// so Vercel's file tracer always includes it in the serverless bundle and
// there's no filesystem-vs-bundler magic to debug.

import fs from "node:fs";
import path from "node:path";

const FILES: Array<{ source: string; file: string }> = [
  { source: "hunter", file: "Hunter products.csv" },
  { source: "k_rain", file: "K Rain Products.csv" },
  { source: "rainbird", file: "Rain Bird Products.csv" },
  { source: "weathermatic", file: "Weathermatic Products.csv" },
];

const root = process.cwd();
const out: { source: string; symbol: string; display: string }[] = [];

for (const { source, file } of FILES) {
  const full = path.join(root, "parts-catalogs", file);
  const content = fs.readFileSync(full, "utf-8");
  const lines = content.split(/\r?\n/).slice(1); // skip header
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const fields = parseCsvLine(line);
    const symbol = (fields[0] ?? "").trim();
    const display = (fields[1] ?? "").trim();
    if (!display) continue;
    out.push({ source, symbol, display });
  }
}

// Minimal RFC-4180 CSV parser. Handles double-quoted fields with "" escapes,
// which matters because lots of model strings contain inch marks like 1".
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += c;
      }
    } else if (c === ",") {
      fields.push(current);
      current = "";
    } else if (c === '"' && current === "") {
      inQuotes = true;
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields;
}

const body =
  "// Auto-generated from parts-catalogs/*.csv. Re-run scripts/build-catalog-data.ts to refresh.\n\n" +
  'export type CatalogSource = "hunter" | "k_rain" | "rainbird" | "weathermatic";\n\n' +
  "export type CatalogEntry = {\n" +
  "  source: CatalogSource;\n" +
  "  symbol: string;\n" +
  "  display: string;\n" +
  "};\n\n" +
  "export const CATALOG_ENTRIES: CatalogEntry[] = " +
  JSON.stringify(out, null, 2) +
  ";\n";

fs.writeFileSync(path.join(root, "src", "lib", "catalog-data.ts"), body);
console.log(`Wrote src/lib/catalog-data.ts with ${out.length} entries`);
