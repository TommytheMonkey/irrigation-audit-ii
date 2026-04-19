// Document → system profile extractor. Takes an XLSX takeoff worksheet OR
// an as-built PDF drawing and returns structured zones + parts that we can
// insert straight into PropertyZone / PropertyPart.
//
// XLSX path: exceljs reads the workbook, we flatten every cell into a
// newline-delimited text blob, and hand that to Claude with a strict JSON
// schema prompt. Manual parsing of the MTO format would be brittle — every
// estimator's template has different column order, section headers,
// section numbering — so we let the LLM do the shape-matching.
//
// PDF path: Anthropic's document input accepts PDFs directly (vision + OCR
// server-side). Same prompt, same output schema.

import Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";

export type ExtractedZone = {
  zoneNumber: number;
  zoneName: string | null;
  zoneType: "spray" | "drip" | "bubbler" | "rotor" | "other";
  valveBrand: string | null;
  valveModel: string | null;
  valveSize: string | null;
  ballValvePresent: boolean | null;
  headCount: number | null;
  coverage: string | null;
  notes: string | null;
};

export type ExtractedPart = {
  category: string | null;
  brand: string | null;
  model: string | null;
  size: string | null;
  quantity: number | null;
  notes: string | null;
};

export type ExtractedProfile = {
  zones: ExtractedZone[];
  parts: ExtractedPart[];
  summary: string | null;
};

const EXTRACT_SYSTEM = `You extract irrigation system profile data from takeoff worksheets (Excel/CSV) and irrigation as-built drawings (PDF plan sets). Respond ONLY with JSON matching the requested shape — no prose, no markdown fences.

Rules for zones:
- Only return zones explicitly listed in a zone schedule, valve schedule, or legend. Do not invent zones.
- zoneType: "spray" for fixed-spray heads, "rotor" for MP/I-series/5004 rotors, "drip" for point-source or subsurface drip (including "XFS"-style driplines and XCZ drip valves), "bubbler" for low-volume tree bubblers, "other" for anything else.
- Valve fields: brand (e.g. "Rain Bird"), model (e.g. "PGA" or "XCZ-075-PRF"), size (e.g. "1\\"") — null when not shown.
- ballValvePresent: true/false/null. Most schedules don't list it; use null.
- headCount: total heads/emitters on the zone, integer — null if not shown.
- coverage: short text like "~2,000 sq ft" or area name — null if not shown.

Rules for parts (from the takeoff worksheet or part schedule on the drawing):
- category: short lowercase noun: "pipe", "lateral", "backflow", "controller", "decoder", "sensor", "wire", "valve", "head", "rotor", "drip", "sleeve", "valve_box", "fitting", "bubbler", or "other".
- brand: manufacturer ("Rain Bird", "Hunter", "Wilkins", etc.) or null if generic pipe/fittings.
- model: specific model name/number (e.g. "1804", "ESP-2WIRE", "XFS-CV-06-18"). Strip size suffixes that already go in \`size\`.
- size: size/length designation (e.g. "1\\"", "12\\"", "08" for spray nozzle radius) — null if absent.
- quantity: integer or decimal. Round decimals to nearest integer where sensible (linear-feet totals can stay decimal).
- notes: UOM + any remarks (e.g. "738 LF · Mainline") — null if nothing to add.

If a section of the worksheet has no rows, don't emit parts for it.`;

const EXTRACT_USER = `Return JSON with this exact shape:
{
  "zones": [ { "zoneNumber": int, "zoneName": string|null, "zoneType": "spray"|"drip"|"bubbler"|"rotor"|"other", "valveBrand": string|null, "valveModel": string|null, "valveSize": string|null, "ballValvePresent": bool|null, "headCount": int|null, "coverage": string|null, "notes": string|null } ],
  "parts": [ { "category": string|null, "brand": string|null, "model": string|null, "size": string|null, "quantity": number|null, "notes": string|null } ],
  "summary": string|null
}

"summary" is a one-sentence description of the system (water source / controller / scale), or null. Omit zones or parts arrays for whichever you can't determine from the input — but return an empty array, never drop the key.`;

async function callClaude(
  messageContent: Anthropic.ContentBlockParam[],
): Promise<ExtractedProfile> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: EXTRACT_SYSTEM,
    messages: [{ role: "user", content: messageContent }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block");
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
    throw new Error("Claude returned invalid JSON");
  }
  const result = parsed as Partial<ExtractedProfile>;
  return {
    zones: Array.isArray(result.zones) ? result.zones : [],
    parts: Array.isArray(result.parts) ? result.parts : [],
    summary: result.summary ?? null,
  };
}

/**
 * Flatten every cell of every sheet into a plain-text representation that
 * preserves row structure. Numbers are formatted to 2 decimals max. Merged
 * cells and formatting are dropped — the LLM just needs the values + layout.
 */
function flattenWorkbook(workbook: ExcelJS.Workbook): string {
  const lines: string[] = [];
  for (const sheet of workbook.worksheets) {
    lines.push(`===== Sheet: ${sheet.name} =====`);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        let v: string;
        if (cell.value === null || cell.value === undefined) {
          v = "";
        } else if (typeof cell.value === "number") {
          v = Number.isInteger(cell.value)
            ? String(cell.value)
            : cell.value.toFixed(2).replace(/\.?0+$/, "");
        } else if (cell.value instanceof Date) {
          v = cell.value.toISOString().slice(0, 10);
        } else if (typeof cell.value === "object" && "text" in cell.value) {
          v = String(cell.value.text);
        } else if (typeof cell.value === "object" && "result" in cell.value) {
          v = String(cell.value.result ?? "");
        } else {
          v = String(cell.value);
        }
        cells.push(v.trim());
      });
      // Skip rows that are entirely blank.
      if (cells.some((c) => c !== "")) {
        lines.push(cells.join(" | "));
      }
    });
  }
  return lines.join("\n");
}

export async function extractFromXlsx(
  bytes: Buffer,
  filename: string,
): Promise<ExtractedProfile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(bytes).buffer as ArrayBuffer);
  const text = flattenWorkbook(workbook);
  if (!text.trim()) {
    throw new Error("Workbook has no content");
  }
  return callClaude([
    {
      type: "text",
      text: `${EXTRACT_USER}\n\n---\n\nSource file: ${filename}\nTakeoff worksheet contents (pipe-delimited cells per row):\n\n${text}`,
    },
  ]);
}

export async function extractFromPdf(
  bytes: Buffer,
  filename: string,
): Promise<ExtractedProfile> {
  const pdfB64 = bytes.toString("base64");
  return callClaude([
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: pdfB64,
      },
    },
    {
      type: "text",
      text: `${EXTRACT_USER}\n\n---\n\nSource file: ${filename} (irrigation as-built PDF). Extract every zone in the zone/valve schedule. Also pull any parts from the legend / part schedule / quantity table if one is present.`,
    },
  ]);
}
