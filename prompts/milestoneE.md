# Milestone E: Google Sheets Sync — Audit Export + Price Pull-Back

## Context

The audit flow (Milestone D) is complete — auditors can walk a property, log findings zone
by zone, and see a summary. The summary screen has a disabled "Export to Sheets" button
waiting for this milestone.

Google OAuth is wired up (Milestone B) — the org can connect their Google account and
specify a Drive folder ID. `src/lib/google.ts` has helpers for getting a fresh access token
from a stored refresh token.

The config system (Milestone C2) defines component types, quick-picks, and severity levels
that are used in the audit. These same categories should structure the Sheet output.

Read CLAUDE.md, REFERENCE_NOTES.md, prisma/schema.prisma, the audit summary page
(`src/app/audits/[auditId]/summary/page.tsx`), and `src/lib/google.ts` before starting.

---

## 1. The Google Sheets Audit Report

When an auditor completes an audit and clicks "Export to Sheets", the app creates a
formatted Google Sheet in the org's configured Drive folder with this hierarchy:

```
{configured Drive folder}/
  └── Property Reports/
      └── {Property Name}/
          └── audit-{YYYY-MM-DD}/
              └── {Property Name} - Audit Report - {YYYY-MM-DD}    ← the Sheet
```

Create folders as needed. If the "Property Reports" folder doesn't exist, create it.
If the property subfolder doesn't exist, create it. Use Google Drive API to create
folders and move the Sheet into the correct location.

### Sheet Structure

The workbook has these tabs:

#### Tab 1: "Summary"
| Row | Content |
|-----|---------|
| 1 | **{Property Name} — Irrigation Audit Report** (merged across columns, bold, large font) |
| 2 | Audit Date: {date} · Auditor: {name} |
| 3 | Property Address: {address} |
| 4 | Property Manager: {PM name} · {PM email} · {PM phone} |
| 5 | _(blank)_ |
| 6 | **Overall Summary** (section header) |
| 7-N | Stats: Total findings, count by severity, count by category |
| N+1 | _(blank)_ |
| N+2 | **Scoring** (if scoring data exists) |
| N+3-M | Score breakdown by category |

#### Tab 2: "All Findings"
This is the main data tab. One row per finding, with columns:

| Column | Source |
|--------|--------|
| A: Zone | zone name + number |
| B: Category | component category (from reference data) |
| C: Component | component type |
| D: Size | component size (if applicable) |
| E: Issue | deficiency description |
| F: Severity | Minor / Moderate / Critical |
| G: Quantity | count |
| H: Unit | unit of measure (from quick-pick config, default "each") |
| I: Recommended Repair | default solution from quick-pick or custom |
| J: Notes | auditor's notes |
| K: Photo Links | comma-separated URLs to photos (if any) |
| **L: Unit Price** | **BLANK — for estimator to fill in** |
| **M: Extended Price** | **Formula: =G{row}*L{row}** (quantity × unit price) |
| N: Finding ID | the Neon finding ID (hidden column, for sync-back matching) |

Sort rows by: Zone (alphabetical) → Severity (Critical first) → Category

#### Tab 3: "By Zone"
Pivot-style summary, one section per zone:

| Zone Name |  |  |  |
|-----------|--|--|--|
| Finding summary | Count | Severity | Est. Total |
| ... | ... | ... | =SUM |
| **Zone Total** |  |  | **=SUM(zone range)** |

_(blank row between zones)_

**Grand Total** at the bottom.

#### Tab 4: "Pricing Summary"
Rollup for the proposal/report:

| Category | Finding Count | Estimated Total |
|----------|---------------|-----------------|
| Spray Heads | 12 | =SUMIF formula referencing All Findings |
| Rotors | 5 | =SUMIF |
| ... | ... | ... |
| **Grand Total** | **=SUM** | **=SUM** |

### Sheet Formatting:
- Use the org's brand colors for headers if set (primary color as header background,
  white text). Fall back to dark navy (#1e293b) if no brand colors.
- Freeze row 1 (headers) on all data tabs
- Auto-size column widths for readability
- Severity column: conditional formatting — green background for Minor, yellow for
  Moderate, red for Critical
- Unit Price column (L): light yellow background to signal "fill this in"
- Extended Price column (M): light gray background (formula, don't edit)
- Number format on price columns: $#,##0.00
- Finding ID column (N): hidden (column width = 0 or use a very small width)
- Bold totals rows
- Tab colors: Summary = blue, All Findings = green, By Zone = orange, Pricing Summary = purple

---

## 2. Export Flow

### API Route: `POST /api/audits/[auditId]/export-sheets`

1. Verify auth — auditor or admin
2. Verify the audit exists and belongs to the user's org
3. Verify the org has Google credentials and a Drive folder configured
   - If not: return 400 with message "Connect Google in Settings before exporting"
4. Get a fresh Google access token from the stored refresh token
5. Create the folder hierarchy in Drive (if it doesn't exist)
6. Create the Google Sheet via Sheets API
7. Populate all 4 tabs with formatted data
8. Apply formatting (colors, conditional formatting, number formats, freezes)
9. Save the Sheet ID and URL to the audit record:
   - `audits.googleSheetId` (add if not in schema)
   - `audits.googleSheetUrl` (add if not in schema)
10. Return `{ sheetId, sheetUrl }`

### Implementation Notes:
- Use Google Sheets API v4 for creating and formatting the sheet
- Use Google Drive API v3 for folder creation and file organization
- Do everything through `src/lib/google.ts` — extend it with Sheets and Drive helpers
- The export should be idempotent-ish: if the audit already has a `googleSheetId`,
  ask the user whether to overwrite or create a new version. For v1, just create a
  new sheet each time and update the stored ID.

### UI Changes — Audit Summary Page:
- Replace the disabled "Export to Sheets" button with a working one
- While exporting: show a spinner with "Creating report in Google Sheets..."
- On success: show a green banner with "Report created!" and an "Open in Google Sheets"
  link that opens the Sheet in a new tab
- On failure: show error toast with details
- If already exported: show "Open in Google Sheets" link + "Re-export" button
- If Google isn't connected: show "Connect Google in Settings" link instead of export button

---

## 3. Price Sync — Sheets → Neon

After an estimator fills in the Unit Price column (L) in Google Sheets, the app needs
to pull those prices back into Neon.

### API Route: `POST /api/audits/[auditId]/sync-prices`

1. Verify auth — admin or estimator role
2. Get the audit's `googleSheetId`
3. Read the "All Findings" tab from the Sheet
4. For each row that has a non-empty Unit Price (column L):
   - Match to the Neon finding by Finding ID (column N)
   - Update `findings.repairPrice` with the unit price value
   - Also store `findings.extendedPrice` (quantity × unit price) for convenience
5. Return summary: `{ priced: N, unpriced: N, total: N }`

### Schema Changes:
Add to the findings model (if not already present):
```
repairPrice      Decimal?   // unit price filled by estimator
extendedPrice    Decimal?   // quantity × unit price (computed on sync)
```

Add to the audits model:
```
googleSheetId    String?
googleSheetUrl   String?
priceSyncedAt    DateTime?  // last time prices were pulled from Sheet
```

### UI Changes — Audit Summary Page:
- After export, show a "Sync Prices" button (disabled until a Sheet exists)
- While syncing: spinner with "Pulling prices from Google Sheets..."
- On success: show price stats — "12 of 15 findings priced ($4,250.00 total)"
- Update the summary display to show pricing totals if available
- If all findings are priced: enable the "Generate Report" button (placeholder for
  Milestone F) and show a green "Ready to generate report" badge

### UI Changes — Findings in Summary:
When prices have been synced, the findings list in the summary should show:
- Unit price next to each finding
- Extended price (qty × unit price)
- Unpriced findings highlighted with an amber "Needs pricing" badge
- Zone totals and grand total at the bottom

---

## 4. Audit Status Flow

Update the audit status enum and transitions:

```
IN_PROGRESS → COMPLETED → EXPORTED → PRICED → REPORT_GENERATED
```

- `COMPLETED`: audit is done, findings locked, ready for export
- `EXPORTED`: Sheet created in Google Drive
- `PRICED`: all findings have prices (or user manually marks as priced)
- `REPORT_GENERATED`: PDF report has been created (Milestone F)

The summary page should show the current status as a step indicator / progress bar
at the top, making it clear what comes next.

---

## 5. Google API Helpers

Extend `src/lib/google.ts` with:

### `createDriveFolder(accessToken, name, parentFolderId)`
- Creates a folder in Google Drive
- Returns the folder ID
- If a folder with that name already exists in the parent, return the existing one
  (don't create duplicates)

### `createSpreadsheet(accessToken, title, folderId)`
- Creates a new Google Sheet
- Moves it to the specified folder
- Returns `{ spreadsheetId, spreadsheetUrl }`

### `writeSheetData(accessToken, spreadsheetId, sheetName, data)`
- Writes a 2D array of values to a named sheet tab
- Uses `spreadsheets.values.update` with `valueInputOption: 'USER_ENTERED'`
  (so formulas like =G2*L2 are evaluated)

### `formatSheet(accessToken, spreadsheetId, requests)`
- Applies batch formatting requests (colors, freezes, column widths, conditional formatting)
- Uses `spreadsheets.batchUpdate`

### `readSheetData(accessToken, spreadsheetId, range)`
- Reads values from a sheet range
- Returns 2D array
- Used by price sync to read the Unit Price column

### `addSheetTab(accessToken, spreadsheetId, title)`
- Adds a new tab to an existing sheet
- Returns the new sheet (tab) ID

All helpers should use raw `fetch()` against the Google APIs (matching the pattern
already established in google.ts). Don't add the `googleapis` npm package.

---

## 6. Mock Mode

When `GOOGLE_MOCK=true` (for testing without real Google credentials):

- Export creates a local JSON file at `dev-exports/{auditId}.json` containing the
  same structured data that would go to the Sheet
- Returns a fake Sheet URL pointing to the local file
- Price sync reads from the local JSON file (you can manually edit it to add prices)
- This lets you test the full export → price → summary pipeline without Google

---

## 7. Error Handling

- **Token expired**: If the Google access token fails with 401, try refreshing it once
  using the refresh token. If that also fails, surface "Google connection expired —
  reconnect in Settings" and clear the stored tokens.
- **Drive folder not found**: If the configured folder ID doesn't exist or isn't
  accessible, show a clear error pointing to Settings.
- **Sheet API quota**: Google Sheets API has a limit of 300 requests per minute per
  project. Our usage is well under this, but add basic retry-with-backoff (1 retry
  after 1 second) for 429 responses.
- **Partial price sync**: If some findings match and others don't (e.g., someone
  deleted rows from the Sheet), sync what you can and report which findings couldn't
  be matched.

---

## 8. Do NOT build yet
- PDF report generation (Milestone F — the "Generate Report" button stays as a placeholder)
- Email delivery of reports
- Two-way sync (don't push price changes from Neon back to Sheets)
- Real-time Sheet monitoring / webhooks
- Audit data push to Monday.com
- Config sheet creation via Google Sheets API (that's a C2 follow-up)
- Offline export queuing

---

## 9. Build Order
1. Schema changes (googleSheetId, googleSheetUrl, priceSyncedAt on audits;
   repairPrice, extendedPrice on findings; audit status enum update) → prisma db push
2. Extend `src/lib/google.ts` with Drive + Sheets helpers
3. Mock mode for testing without Google
4. `POST /api/audits/[auditId]/export-sheets` — full export pipeline
5. Audit summary page — working export button, Sheet link, status indicator
6. `POST /api/audits/[auditId]/sync-prices` — price pull-back
7. Audit summary page — price sync button, pricing display, totals
8. Audit status flow — step indicator on summary page
9. Test end-to-end: complete audit → export → manually add prices → sync → verify totals
10. Commit: "feat: Google Sheets export + price sync"