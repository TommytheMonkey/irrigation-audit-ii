// Monday.com GraphQL client + property sync.
//
// We talk to https://api.monday.com/v2 directly via fetch — no SDK. The
// queries we need are small (boards/columns + items_page pagination) so the
// runtime cost of pulling the official client isn't worth it.
//
// Mock mode: setting MONDAY_MOCK=true makes every fetch helper return canned
// data so the full sync pipeline can be exercised without a real Monday
// account or API key. Useful for the demo seed and CI.

import { db } from "./db";
import { decrypt } from "./encryption";
import { geocodeAddress } from "./geocode";
import {
  PROPERTY_FIELDS,
  type ColumnMapping,
  type MondayColumn,
  type MondayItem,
  type PropertyField,
} from "./monday-types";

// Re-export the client-safe pieces so existing server callers can keep
// importing from "@/lib/monday" — split lives in monday-types.ts so client
// components can import without dragging Prisma/`pg` into the browser
// bundle.
export {
  PROPERTY_FIELDS,
  type ColumnMapping,
  type MondayColumn,
  type MondayItem,
  type PropertyField,
};

const MONDAY_API = "https://api.monday.com/v2";

// ─────────────────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────────────────

function isMockMode(): boolean {
  // Prod-guarded so a stray MONDAY_MOCK=true in Vercel env can't silently
  // replace the real Monday API with the canned five-property dataset.
  if (process.env.NODE_ENV === "production") return false;
  return process.env.MONDAY_MOCK === "true";
}

const MOCK_COLUMNS: MondayColumn[] = [
  { id: "text_address", title: "Address", type: "text" },
  { id: "text_city", title: "City", type: "text" },
  { id: "text_state", title: "State", type: "text" },
  { id: "text_zip", title: "Zip", type: "text" },
  { id: "text_pm_name", title: "PM Name", type: "text" },
  { id: "email_pm", title: "PM Email", type: "email" },
  { id: "phone_pm", title: "PM Phone", type: "phone" },
  { id: "status_active", title: "Status", type: "status" },
];

const MOCK_ITEMS: MondayItem[] = [
  {
    id: "mock-1",
    name: "Austin Oaks",
    columnValues: {
      text_address: "1234 Oak Hill Dr",
      text_city: "Austin",
      text_state: "TX",
      text_zip: "78704",
      text_pm_name: "Sarah Chen",
      email_pm: "sarah@oakhillproperties.com",
      phone_pm: "(512) 555-0102",
    },
  },
  {
    id: "mock-2",
    name: "Cedar Park HOA",
    columnValues: {
      text_address: "880 Cypress Ln",
      text_city: "Cedar Park",
      text_state: "TX",
      text_zip: "78613",
      text_pm_name: "Mike Alvarez",
      email_pm: "mike@cedarparkhoa.org",
      phone_pm: "(512) 555-0177",
    },
  },
  {
    id: "mock-3",
    name: "Westlake Office Park",
    columnValues: {
      text_address: "455 Westlake Pkwy",
      text_city: "Westlake Hills",
      text_state: "TX",
      text_zip: "78746",
      text_pm_name: "Janet Lee",
      email_pm: "jlee@westlakeop.com",
      phone_pm: "(512) 555-0144",
    },
  },
  {
    id: "mock-4",
    name: "Round Rock Plaza",
    columnValues: {
      text_address: "2200 Plaza Dr",
      text_city: "Round Rock",
      text_state: "TX",
      text_zip: "78664",
      text_pm_name: "Carlos Reyes",
      email_pm: "carlos@rrplaza.com",
      phone_pm: "(512) 555-0119",
    },
  },
  {
    id: "mock-5",
    name: "Lakeway Estates",
    columnValues: {
      text_address: "77 Lakeshore Blvd",
      text_city: "Lakeway",
      text_state: "TX",
      text_zip: "78734",
      text_pm_name: "Priya Patel",
      email_pm: "priya@lakewayest.com",
      phone_pm: "(512) 555-0188",
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL helper
// ─────────────────────────────────────────────────────────────────────────────

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

async function gql<T>(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: {
      // Monday accepts the raw token (no "Bearer " prefix). Sending it
      // either way works in practice but the docs are explicit about raw.
      Authorization: apiKey,
      "Content-Type": "application/json",
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });
  // Monday returns 200 even when the query fails — always inspect the body.
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Monday API: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!res.ok || !json.data) {
    throw new Error(`Monday API HTTP ${res.status}`);
  }
  return json.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the columns for a given board. Used by the column-mapping UI.
 */
export async function fetchBoardColumns(
  apiKey: string,
  boardId: string,
): Promise<MondayColumn[]> {
  if (isMockMode()) return MOCK_COLUMNS;

  type R = {
    boards: { columns: { id: string; title: string; type: string }[] }[];
  };
  const data = await gql<R>(
    apiKey,
    `query ($boardId: [ID!]) {
      boards(ids: $boardId) {
        columns { id title type }
      }
    }`,
    { boardId: [boardId] },
  );
  if (!data.boards || data.boards.length === 0) {
    throw new Error(`Monday board ${boardId} not found or no access`);
  }
  return data.boards[0].columns;
}

/**
 * Fetch every item on the board, paged via Monday's cursor API. We use the
 * max page size (500) to keep the round-trip count down — most Strata-style
 * boards have fewer than 500 properties so this usually completes in a
 * single request.
 */
export async function fetchBoardItems(
  apiKey: string,
  boardId: string,
): Promise<MondayItem[]> {
  if (isMockMode()) return MOCK_ITEMS;

  type Page = {
    cursor: string | null;
    items: {
      id: string;
      name: string;
      column_values: { id: string; text: string | null }[];
    }[];
  };
  type FirstPageR = {
    boards: { items_page: Page }[];
  };
  type NextPageR = {
    next_items_page: Page;
  };

  const all: MondayItem[] = [];

  const first = await gql<FirstPageR>(
    apiKey,
    `query ($boardId: [ID!]) {
      boards(ids: $boardId) {
        items_page(limit: 500) {
          cursor
          items {
            id
            name
            column_values { id text }
          }
        }
      }
    }`,
    { boardId: [boardId] },
  );
  if (!first.boards || first.boards.length === 0) {
    throw new Error(`Monday board ${boardId} not found or no access`);
  }
  pushPage(all, first.boards[0].items_page);
  let cursor = first.boards[0].items_page.cursor;

  while (cursor) {
    const next = await gql<NextPageR>(
      apiKey,
      `query ($cursor: String!) {
        next_items_page(cursor: $cursor, limit: 500) {
          cursor
          items {
            id
            name
            column_values { id text }
          }
        }
      }`,
      { cursor },
    );
    pushPage(all, next.next_items_page);
    cursor = next.next_items_page.cursor;
  }

  return all;
}

function pushPage(
  out: MondayItem[],
  page: { items: { id: string; name: string; column_values: { id: string; text: string | null }[] }[] },
): void {
  for (const it of page.items) {
    const cv: Record<string, string | null> = {};
    for (const c of it.column_values) cv[c.id] = c.text;
    out.push({ id: it.id, name: it.name, columnValues: cv });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-match columns to property fields
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Best-effort guess: scan column titles for keywords and pre-fill the
 * mapping. The user can override anything — this just gives them a head
 * start so a board with conventional column names "just works".
 *
 * Monday location columns (`type: "location"`) always win the address slot
 * when present — they hold the full formatted address as `text`, which is
 * exactly what Geocoding needs.
 */
export function autoMatchColumns(columns: MondayColumn[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  // 1. Monday "location" column type wins for address, unconditionally.
  const locationCol = columns.find((c) => c.type === "location");
  if (locationCol) {
    mapping.address = locationCol.id;
  }

  // 2. Title-based matching fills the rest. Order matters: more-specific
  //    matches go first so "PM Email" beats a generic "Email" later.
  const rules: { field: PropertyField; needles: string[] }[] = [
    { field: "pmEmail", needles: ["pmemail", "manageremail", "contactemail"] },
    { field: "pmPhone", needles: ["pmphone", "managerphone", "contactphone"] },
    { field: "pmName", needles: ["pmname", "propertymanager", "manager", "contactname"] },
    { field: "address", needles: ["location", "streetaddress", "address", "street"] },
    { field: "city", needles: ["city"] },
    { field: "state", needles: ["state", "province"] },
    { field: "zip", needles: ["zip", "postal"] },
  ];

  for (const rule of rules) {
    if (mapping[rule.field]) continue;
    for (const col of columns) {
      const t = norm(col.title);
      if (rule.needles.some((n) => t.includes(n))) {
        mapping[rule.field] = col.id;
        break;
      }
    }
  }

  return mapping;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync
// ─────────────────────────────────────────────────────────────────────────────

export type SyncSummary = {
  total: number;
  created: number;
  updated: number;
  removed: number;
};

export type SyncResult =
  | { ok: true; summary: SyncSummary }
  | { ok: false; error: "not_configured" | "missing_mapping" | "monday_error"; message: string };

/**
 * Pull every item off the org's Monday board and reconcile against the
 * `properties` table. Items that are present become creates or updates;
 * Neon rows that no longer have a matching Monday item get marked
 * `syncStatus="removed"` (we never hard-delete because audits link to
 * properties).
 */
export async function syncProperties(orgId: string): Promise<SyncResult> {
  const org = await db.org.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      mondayApiKeyEnc: true,
      mondayBoardId: true,
      mondayColumnMapping: true,
    },
  });

  if (!org.mondayBoardId || !org.mondayApiKeyEnc) {
    return {
      ok: false,
      error: "not_configured",
      message: "Monday API key or board ID not set. Configure them in Settings → Integrations.",
    };
  }
  if (!org.mondayColumnMapping || typeof org.mondayColumnMapping !== "object") {
    return {
      ok: false,
      error: "missing_mapping",
      message: "Column mapping not set. Map your Monday columns to property fields first.",
    };
  }

  const apiKey = isMockMode() ? "mock" : decrypt(org.mondayApiKeyEnc);
  const mapping = org.mondayColumnMapping as ColumnMapping;

  let items: MondayItem[];
  try {
    items = await fetchBoardItems(apiKey, org.mondayBoardId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return { ok: false, error: "monday_error", message: msg };
  }

  // Pull existing rows once so we can decide create-vs-update without N+1.
  // Include the address fields + lat/lng so we only re-geocode when the
  // address actually changed.
  const existing = await db.property.findMany({
    where: { orgId },
    select: {
      id: true,
      mondayItemId: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      latitude: true,
      longitude: true,
    },
  });
  const byMondayId = new Map<string, (typeof existing)[number]>();
  for (const p of existing) {
    if (p.mondayItemId) byMondayId.set(p.mondayItemId, p);
  }
  const seenMondayIds = new Set<string>();

  let created = 0;
  let updated = 0;

  for (const item of items) {
    seenMondayIds.add(item.id);
    const address = pick(item, mapping.address);
    const city = pick(item, mapping.city);
    const state = pick(item, mapping.state);
    const zip = pick(item, mapping.zip);
    const existingRow = byMondayId.get(item.id);

    // Geocode only when the address is new/changed or we're missing coords.
    const addressChanged =
      !existingRow ||
      existingRow.address !== address ||
      existingRow.city !== city ||
      existingRow.state !== state ||
      existingRow.zip !== zip;
    const missingCoords =
      !existingRow ||
      existingRow.latitude === null ||
      existingRow.longitude === null;
    const shouldGeocode = addressChanged || missingCoords;

    let geoPatch: {
      latitude?: number | null;
      longitude?: number | null;
      geocodedAt?: Date | null;
    } = {};
    if (shouldGeocode) {
      const coords = await geocodeAddress(address, city, state, zip);
      if (coords) {
        geoPatch = {
          latitude: coords.lat,
          longitude: coords.lng,
          geocodedAt: new Date(),
        };
      } else if (addressChanged) {
        // Address changed but geocoding failed — clear stale coords so we
        // don't keep a marker pinned to the old location.
        geoPatch = { latitude: null, longitude: null, geocodedAt: null };
      }
    }

    const data = {
      name: item.name,
      address,
      city,
      state,
      zip,
      propertyManagerName: pick(item, mapping.pmName),
      propertyManagerEmail: pick(item, mapping.pmEmail),
      propertyManagerPhone: pick(item, mapping.pmPhone),
      syncedFromMondayAt: new Date(),
      syncStatus: "active" as const,
      ...geoPatch,
    };
    if (existingRow) {
      await db.property.update({ where: { id: existingRow.id }, data });
      updated++;
    } else {
      await db.property.create({
        data: { ...data, orgId, mondayItemId: item.id },
      });
      created++;
    }
  }

  // Soft-remove anything we previously synced from Monday but didn't see
  // on this run. Manual rows (mondayItemId === null) are left alone.
  const toRemove = existing.filter(
    (p) => p.mondayItemId !== null && !seenMondayIds.has(p.mondayItemId),
  );
  if (toRemove.length > 0) {
    await db.property.updateMany({
      where: { id: { in: toRemove.map((p) => p.id) } },
      data: { syncStatus: "removed" },
    });
  }

  await db.org.update({
    where: { id: orgId },
    data: { propertiesSyncedAt: new Date() },
  });

  return {
    ok: true,
    summary: {
      total: items.length,
      created,
      updated,
      removed: toRemove.length,
    },
  };
}

function pick(item: MondayItem, columnId: string | undefined): string | null {
  if (!columnId) return null;
  const v = item.columnValues[columnId];
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Validate that every column id referenced by a mapping actually exists on
 * the board. Used by the mapping save endpoint to fail loud if a column was
 * deleted between the user opening the mapping UI and clicking save.
 */
export function validateMapping(
  mapping: ColumnMapping,
  columns: MondayColumn[],
): { ok: true } | { ok: false; missing: string[] } {
  const valid = new Set(columns.map((c) => c.id));
  const missing: string[] = [];
  for (const [field, colId] of Object.entries(mapping)) {
    if (colId && !valid.has(colId)) {
      missing.push(`${field}: ${colId}`);
    }
  }
  return missing.length > 0 ? { ok: false, missing } : { ok: true };
}
