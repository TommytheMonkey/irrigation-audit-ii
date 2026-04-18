# Milestone C1: Monday.com Property Sync

## Context

Milestone B wired up auth, onboarding, and settings. The onboarding wizard (Step 2) and
settings integrations tab already let the user enter their Monday API key and board ID,
test the connection, and save the credentials (encrypted) to the org record. The "Test
Connection" button hits Monday's API and confirms the board exists.

What's missing: actually pulling the property items from that board into the `properties`
table in Neon, and keeping them in sync.

Read CLAUDE.md, the current prisma/schema.prisma, and the existing Monday-related code
(check the onboarding wizard step and settings integrations tab) before starting.

---

## 1. Understand the Monday Board Structure

Tyler's Monday board contains maintenance properties. Each item (row) is a property.
The columns will include things like:
- Property name (the item name)
- Address
- Property manager name
- Property manager email
- Property manager phone
- City, State, Zip (may be separate columns or combined)
- Any other metadata (contract type, service frequency, etc.)

The challenge: **every Monday board has different column IDs**. Column IDs in Monday are
short strings like "text0", "email4", "phone_1", etc. They're not human-readable and they
vary per board.

### Column Mapping Approach:
During the onboarding Monday step (or in settings), after the user enters their API key
and board ID and tests the connection:

1. Fetch the board's columns via Monday GraphQL API
2. Display the column names to the user
3. Let them map each column to a property field using dropdowns:
   - Property Name → (always the item name, no mapping needed)
   - Address → [dropdown of board columns]
   - PM Name → [dropdown of board columns]
   - PM Email → [dropdown of board columns]
   - PM Phone → [dropdown of board columns]
   - City → [dropdown of board columns] (optional)
   - State → [dropdown of board columns] (optional)
   - Zip → [dropdown of board columns] (optional)
4. Save the column mapping as JSON in the org record

### Schema Change:
Add to the `orgs` table:
```
mondayColumnMapping  Json?  // e.g., {"address": "text0", "pmName": "text3", "pmEmail": "email4", ...}
```

---

## 2. Property Sync Logic

Create `src/lib/monday.ts` with helpers:

### `fetchBoardColumns(apiKey, boardId)`
- Monday GraphQL query: `{ boards(ids: [$boardId]) { columns { id title type } } }`
- Returns array of `{ id, title, type }`

### `fetchBoardItems(apiKey, boardId, columnMapping)`
- Monday GraphQL query that fetches all items with their column values
- Use cursor-based pagination — Monday limits items per page (default 25, max 500)
- **Important**: Monday's API v2 uses `items_page` with cursor pagination:
  ```graphql
  {
    boards(ids: [$boardId]) {
      items_page(limit: 500) {
        cursor
        items {
          id
          name
          column_values {
            id
            text
            value
          }
        }
      }
    }
  }
  ```
  Then follow up with `next_items_page(cursor: $cursor)` until cursor is null.
- For each item, use the column mapping to extract: address, pmName, pmEmail, pmPhone,
  city, state, zip
- Return normalized property objects

### `syncProperties(orgId)`
- Gets the org's Monday credentials and column mapping from Neon
- Calls fetchBoardItems
- For each Monday item:
  - If a property with that `mondayItemId` exists in Neon → update it
  - If not → create it
- For any Neon property whose `mondayItemId` is NOT in the fetched items → soft delete
  or mark as `syncStatus: 'removed'` (don't hard delete — there may be audits linked to it)
- Update `orgs.propertiesSyncedAt` timestamp
- Return summary: { created: N, updated: N, removed: N, total: N }

---

## 3. API Routes

### `POST /api/properties/sync`
- Requires auth (admin only)
- Calls `syncProperties(orgId)`
- Returns the sync summary
- If Monday credentials or column mapping are missing, return 400 with a clear message
  pointing the user to settings

### `GET /api/monday/columns`
- Requires auth (admin only)
- Takes boardId as query param (or uses the org's saved boardId)
- Returns the board's columns for the mapping UI
- Used by the onboarding wizard and settings page

### `POST /api/monday/mapping`
- Requires auth (admin only)
- Saves the column mapping JSON to the org record
- Validates that all mapped column IDs actually exist on the board

---

## 4. UI Changes

### Onboarding Step 2 (Monday.com) — enhance the existing step:
After the "Test Connection" succeeds:
1. Automatically fetch the board columns
2. Show the column mapping UI:
   - Each property field (Address, PM Name, PM Email, PM Phone, City, State, Zip) gets
     a dropdown populated with the board's column names
   - Try to auto-match by column title (if a column is called "Address" or "Property Address",
     pre-select it for the Address field; same for email, phone, etc.)
   - Let the user adjust any mappings
3. "Save & Sync Properties" button:
   - Saves the API key, board ID, and column mapping
   - Triggers the initial property sync
   - Shows a progress indicator while syncing
   - On success: "Synced X properties!" with a count
   - On failure: error message with details

### Settings Integrations Tab — enhance the Monday card:
- Show current connection status: board name, last synced date, property count
- "Sync Now" button → triggers `/api/properties/sync`, shows spinner + result toast
- "Edit Column Mapping" button → opens the same mapping UI from onboarding
- "Disconnect" option → clears Monday credentials (with confirmation dialog)

### Dashboard — enhance property cards:
- Properties from Monday should show a small Monday icon badge so users know the
  data source
- "Last synced: {relative time}" text somewhere on the dashboard
- If properties haven't been synced in 7+ days, show a subtle warning

---

## 5. Schema Changes

```
// Add to Org model:
mondayColumnMapping   Json?
propertiesSyncedAt    DateTime?

// Add to Property model (if not already present):
mondayItemId          String?    // Monday item ID for sync matching
syncStatus            String?    @default("active")  // "active", "removed"
city                  String?
state                 String?
zip                   String?
```

Run `prisma db push` after changes.

---

## 6. Monday API Details

**Auth**: All requests go to `https://api.monday.com/v2` with header `Authorization: {apiKey}`
(no "Bearer" prefix for Monday API tokens — just the raw token, though some versions accept
both; test which format works).

**Rate limits**: Monday allows ~5M complexity points per minute. Our queries are simple,
so this won't be an issue unless the board has thousands of items.

**Column value parsing**: Monday's `column_values` return both `text` (display string) and
`value` (JSON string with structured data). For simple text/email/phone columns, `text`
is sufficient. For location or complex columns, you may need to parse `value`. Start with
`text` and only parse `value` if the data is incomplete.

**Error handling**: Monday returns errors in the response body even with 200 status codes.
Always check for `errors` array in the response alongside `data`.

---

## 7. Testing

1. If you have a real Monday board, test with it. You'll need a Monday API key from
   monday.com > Admin > API.
2. If not, create a mock mode:
   - When `MONDAY_MOCK=true` in env, the fetch functions return fake data:
     5 properties with realistic names, addresses, and PM info
   - This lets you test the full sync pipeline without a Monday account
3. Test cases:
   - Initial sync: 0 properties → N properties created
   - Re-sync with no changes: N properties, 0 created, 0 updated
   - Re-sync after Monday edit: property address changed → updated in Neon
   - Re-sync after Monday delete: property removed from board → marked as removed in Neon,
     but still visible in audit history
   - Missing column mapping: returns clear 400 error
   - Bad API key: returns clear auth error
   - Board with 500+ items: pagination works correctly

---

## 8. Do NOT build yet
- Two-way sync (Neon → Monday). We only read from Monday, never write back (for now).
- Webhook-based real-time sync (polling/manual sync is fine for v1)
- Monday automations or recipes
- Property create/edit UI in the app (Monday is the source of truth for property data)

---

## 9. Build Order
1. Schema changes → prisma db push
2. `src/lib/monday.ts` — fetchBoardColumns, fetchBoardItems, syncProperties
3. API routes: /api/monday/columns, /api/monday/mapping, /api/properties/sync
4. Mock mode for testing without Monday credentials
5. Enhance onboarding Step 2 with column mapping UI + initial sync
6. Enhance settings Monday card with sync button + mapping editor
7. Dashboard property card enhancements (Monday badge, sync status)
8. Test full flow: onboarding → map columns → sync → properties appear on dashboard
9. Commit: "feat: Monday.com property sync with column mapping"