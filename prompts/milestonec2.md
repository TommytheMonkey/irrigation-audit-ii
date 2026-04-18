# Milestone C2: Config Sheet — Google Sheets as the Reference Data Admin UI

## Context

The foundation (Milestone A) seeded 18 global component types and 31 quick-picks into Neon from
the reference material. Milestone D built the audit flow using that data — quick-pick chips,
category → component → size → issue wizard, severity buttons. All of that reference data currently
lives in Neon as org_id=NULL global rows.

We want to move the source of truth for each org's reference data into a Google Sheet that
non-technical users can edit. The app reads from that sheet, validates it, and caches it in Neon.
This way Tyler (or any customer) can add components, tweak quick-picks, rename categories, and
adjust severity levels without ever touching the app's admin UI or database.

This milestone requires Google OAuth to be wired up first (Milestone C1 / auth work). If that's
not done yet, stub the Google Sheets API calls behind an interface so the config sheet logic can
be built and tested against a local mock, then connected to real Sheets later.

Read REFERENCE_NOTES.md and the current prisma/schema.prisma before starting. Read the zone-audit
component (src/app/audits/[auditId]/zones/[zoneId]/zone-audit.tsx) to understand exactly how
reference data is consumed in the UI — that's what this config sheet needs to feed.

---

## 1. Config Sheet Structure

When an org first connects Google (or when an admin clicks "Initialize Config Sheet"), the app
creates a Google Sheet called "{Org Name} — Irrigation Audit Config" in their configured Drive
folder. The sheet has these tabs:

### Tab: Components
| Column | Type | Required | Description |
|--------|------|----------|-------------|
| Category | text | yes | Top-level grouping shown in the audit UI (e.g., "Spray Heads", "Rotors", "Valves", "Drip", "Controller", "Mainline", "Lateral Line", "Drainage") |
| Component | text | yes | Specific component type (e.g., "Pop-up Spray Head", "Impact Rotor", "Gate Valve") |
| Sizes | text | no | Comma-separated sizes/variants (e.g., "4 in, 6 in, 12 in" or "3/4 in, 1 in, 1.5 in, 2 in"). If blank, the audit UI skips the size selection step. |
| System Level | yes/no | no | If "yes", this component appears in the system-level audit step rather than in zones. Default: no |
| Active | yes/no | no | If "no", component is hidden from the audit UI but preserved in historical data. Default: yes |
| Notes | text | no | Internal notes, not shown in the audit UI |

### Tab: Quick Picks
| Column | Type | Required | Description |
|--------|------|----------|-------------|
| Category | text | yes | Must match a Category from the Components tab |
| Component | text | no | If specified, must match a Component from the Components tab. If blank, this quick-pick applies to all components in the category. |
| Size | text | no | If specified, must match one of the Sizes for this component. If blank, applies to all sizes. |
| Issue | text | yes | The deficiency/problem description shown as a chip (e.g., "Broken", "Tilted", "Sunken", "Wrong nozzle") |
| Default Severity | text | yes | One of the names defined in the Severity Levels tab (e.g., "Minor", "Moderate", "Critical") |
| Default Solution | text | no | Recommended repair action (e.g., "Replace head", "Adjust grade", "Flush and clean") |
| Unit | text | no | Unit of measure for pricing (e.g., "each", "linear ft", "per zone"). Default: "each" |
| Active | yes/no | no | Default: yes |

### Tab: Severity Levels
| Column | Type | Required | Description |
|--------|------|----------|-------------|
| Level | number | yes | Sort order (1, 2, 3) |
| Name | text | yes | e.g., "Minor", "Moderate", "Critical" |
| Color | text | yes | Hex color code (e.g., "#22c55e", "#eab308", "#ef4444") |
| Label | text | no | UI display text if different from Name (e.g., "🟢 Minor") |
| Description | text | no | Tooltip or helper text (e.g., "Cosmetic issue, low priority") |

### Tab: Report Settings
| Column | Type | Required | Description |
|--------|------|----------|-------------|
| Setting | text | yes | Setting key |
| Value | text | yes | Setting value |

Pre-populate with rows:
- company_name | {org name}
- report_title | Irrigation Audit Report
- footer_text | Confidential — Prepared by {org name}
- show_photos | yes
- show_scores | yes
- score_method | percentage (or "letter_grade" or "pass_fail")

---

## 2. Sheet Initialization

Create an API route: `POST /api/config/initialize`

This route:
1. Checks that the org has valid Google credentials
2. Creates the Google Sheet in the org's configured Drive folder (or Shared Drive)
3. Populates all four tabs with:
   - Headers (bold, frozen first row)
   - Column widths set appropriately (Category: 150px, Component: 200px, etc.)
   - Data validation where applicable (Severity dropdown in Quick Picks, yes/no dropdowns)
   - Conditional formatting: Active=no rows get gray background
   - The global default data currently seeded in Neon (18 component types → Components tab, 31 quick-picks → Quick Picks tab, 3 severity levels → Severity Levels tab)
4. Stores the sheet ID in the org record: `config_sheet_id`
5. Returns the sheet URL so the UI can show a "Open Config Sheet" link

If the sheet already exists (config_sheet_id is set), do NOT overwrite it. Return an error
with a link to the existing sheet. Provide a separate `POST /api/config/reset` route that
explicitly recreates it (with a confirmation step in the UI).

---

## 3. Config Sync — Sheet → Neon

Create an API route: `POST /api/config/sync`

This route:
1. Reads all four tabs from the org's config sheet
2. Validates the data:
   - Required columns present and non-empty
   - Categories in Quick Picks match Categories in Components
   - Severity names in Quick Picks match names in Severity Levels
   - No duplicate Component+Category combinations
   - Colors are valid hex codes
3. If validation passes:
   - Upsert all rows into the Neon reference tables, scoped to this org_id
   - Deactivate (soft delete) any Neon reference rows that no longer exist in the sheet
   - Store a `config_synced_at` timestamp on the org record
   - Return a summary: X components synced, Y quick-picks synced, Z changes detected
4. If validation fails:
   - Return detailed errors with row numbers and column names
   - Do NOT update Neon — the last good config remains active
   - Format errors clearly for display in a toast or error panel

### Caching strategy:
- On audit start, the app loads the org's reference data from Neon (NOT from the Sheet)
- The Sheet is the authoring tool; Neon is the runtime cache
- A "Sync Config" button in the app triggers the sync
- Auto-sync on audit start if config_synced_at is older than 24 hours (with a toast notification)

---

## 4. Schema Changes

Add to the `orgs` table:
```
config_sheet_id    String?    // Google Sheet ID for the config sheet
config_synced_at   DateTime?  // Last successful sync timestamp
```

Update the reference tables to support org-scoped overrides:
- `component_types`: ensure org_id is nullable. Global defaults have org_id=NULL. Org-synced
  rows get org_id={their org}. Query logic: return org-scoped rows if they exist, otherwise
  fall back to global defaults.
- `quick_picks` (or whatever the current table name is): same org_id scoping pattern.
- If there's no `severity_levels` table yet, create one:
```
severity_levels:
  id          String   @id @default(cuid())
  org_id      String?
  level       Int      // sort order
  name        String   // "Minor", "Moderate", "Critical"
  color       String   // hex
  label       String?  // display override
  description String?

  @@unique([org_id, name])
```

Run `prisma db push` after schema changes. Update the demo seed to still work.

---

## 5. UI Touchpoints

### Settings page (or onboarding step):
- "Config Sheet" card showing:
  - Status: "Not initialized" / "Last synced: {relative time}" / "Sync error: {details}"
  - "Initialize Config Sheet" button (if no sheet exists yet)
  - "Open Config Sheet" link (opens Google Sheets in new tab)
  - "Sync Now" button (triggers /api/config/sync, shows spinner, then success/error toast)
  - "Reset Config Sheet" button (danger zone — confirmation dialog required)

### Audit flow:
- zone-audit.tsx currently reads reference data. Update it to:
  1. Query org-scoped reference data from Neon (server-side, passed as props)
  2. Fall back to global defaults if org has no config synced
  3. The UI rendering logic (chips, category buttons, severity buttons) should NOT change —
     it just receives different data. The config sheet controls WHAT exists; the UI controls
     HOW it's displayed.

### Dashboard:
- If config_synced_at is NULL and the org has existed for more than 1 day, show a subtle
  banner: "Tip: Customize your components and quick-picks in your Config Sheet" with a link.

---

## 6. Data Flow

```
Google Sheet (edit)         Neon (runtime cache)         Audit UI (read)
───────────────────────────────────────────────────────────────────────
Tyler edits sheet   →   "Sync Now" button        →   org-scoped rows   →   chips, buttons,
(add component,         POST /api/config/sync         upserted in            categories in
 rename issue,          validates then writes          Neon tables            zone-audit.tsx
 tweak severity)
                        Also: auto-sync on
                        audit start if stale >24h
```

---

## 7. Testing Without Google OAuth

Since Google OAuth may not be wired yet, build a mock/dev mode:

1. `POST /api/config/initialize?mock=true` — instead of creating a real Google Sheet, writes
   the default config to a local JSON file at `dev-config/{orgId}-config.json` with the same
   tab structure (Components array, QuickPicks array, SeverityLevels array, ReportSettings array)
2. `POST /api/config/sync?mock=true` — reads from that local JSON file instead of Google Sheets
3. This lets you test the full pipeline: edit JSON → sync → Neon upsert → UI reflects changes
4. The mock flag should be auto-detected from an env var (e.g., `GOOGLE_MOCK=true`) so you
   don't have to pass the query param manually

### Test cases:
- Edit mock config, sync, verify audit UI shows the changes
- Add a new component category, sync, verify it appears as a new button group in the audit
- Delete a quick-pick from the config, sync, verify it disappears from chips but historical
  findings that used it are still visible
- Put invalid data in the config (missing required column, bad severity name, duplicate
  component), sync, verify clear error messages and Neon data unchanged
- Org with no config synced → verify audit flow still works with global defaults
- Re-initialize when sheet already exists → verify error with link, not overwrite

---

## 8. Do NOT build yet
- Real Google OAuth (use mock mode)
- Google Sheets export for audit reports (Milestone E)
- Offline config caching
- Config version history or change tracking
- Per-user config permissions (any org member can sync for now)
- Webhook or auto-sync on sheet edit (polling/manual sync is fine for v1)

---

## Build order:
1. Schema changes (config_sheet_id, config_synced_at, severity_levels table) → prisma db push
2. Config data model — helper functions to query org-scoped reference data with global fallback
3. Config sync logic — the validator and Neon writer (/api/config/sync)
4. Mock/dev mode for testing without Google
5. Config initialization — sheet creation with formatting (/api/config/initialize) + mock mode
6. Update zone-audit.tsx data loading to use org-scoped queries
7. Settings UI section for config management
8. Test end-to-end: edit mock config → sync → audit UI reflects changes
9. Commit: "feat: config sheet — Google Sheets as reference data admin UI"