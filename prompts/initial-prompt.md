# Irrigation Audit App — Claude Code Build Prompt

## Step 0: Understand the Reference Material

Before writing ANY code, read every file in `~/Dev/irrigation-audit/reference/`. This folder contains:
- Sample output reports (audit reports with pricing)
- Component definitions, categories, and classes for irrigation systems
- Any existing UI components or data structures I built manually years ago

Study these thoroughly. The entire data model — every irrigation component type, deficiency category, repair classification, scoring rubric, and report format — comes from this reference material. Do NOT invent your own taxonomy. Extract and catalog:
1. All irrigation component types (heads, valves, controllers, pipes, sensors, etc.)
2. All deficiency/issue categories and severity levels
3. All repair/recommendation classifications
4. The structure and layout of the sample audit reports
5. Any scoring or grading methodology present
6. How properties, zones, and areas are organized

Document what you find in a `REFERENCE_NOTES.md` at the project root before proceeding.

---

## Step 1: Tech Stack & Project Structure

This is a Next.js app. Check what's already scaffolded in `~/Dev/irrigation-audit`. Build on top of it using:

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **UI:** shadcn/ui + Tailwind CSS
- **Auth:** Custom email-based auth (no Clerk — keep it simple, JWT-based)
- **Database:** Neon PostgreSQL (connection string below)
- **External integrations:** Monday.com API, Google OAuth + Google Sheets API + Google Drive API
- **Deployment target:** Vercel

The app MUST be mobile-first. Primary use case is a field technician on an iPad or iPhone walking a property. Every interaction — selecting zones, logging deficiencies, taking photos, navigating between areas — must work flawlessly on a touchscreen with large tap targets, minimal typing, and offline-resilient patterns where possible.

---

## Step 2: Database — Neon PostgreSQL

Connection string:
```
postgresql://neondb_owner:npg_y2RtBsETL6ob@ep-soft-brook-amken6tx-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

Design a multi-tenant schema. Every company (org) that signs up gets their data scoped by `org_id`. Key tables:

### Core tables:
- **orgs** — org_id, name, email_domain, monday_api_key (encrypted), monday_board_id, google_credentials (encrypted), google_drive_folder_id, primary_logo_url, secondary_logo_url, brand_color_primary, brand_color_secondary, font_family, created_at, updated_at
- **users** — user_id, org_id (FK), email, name, role (enum: admin, auditor, estimator), created_at
- **properties** — property_id, org_id, monday_item_id, name, address, property_manager_name, property_manager_email, property_manager_phone, synced_from_monday_at, metadata (jsonb)
- **audits** — audit_id, org_id, property_id (FK), auditor_user_id (FK), status (enum: in_progress, completed, priced, report_generated), started_at, completed_at, google_sheet_id, google_sheet_url, notes
- **audit_zones** — zone_id, audit_id (FK), zone_name, zone_number, zone_type, notes
- **audit_findings** — finding_id, zone_id (FK), audit_id (FK), component_type, component_subtype, deficiency_category, severity, quantity, description, recommendation, photo_urls (text[]), repair_price (decimal, nullable — filled by estimator), notes
- **audit_scores** — score_id, audit_id (FK), category, score, max_score, notes

### Reference/lookup tables (populated from reference material):
- **component_types** — id, org_id (nullable for global defaults), category, name, subtypes (jsonb)
- **deficiency_categories** — id, category, severity_levels (jsonb), description
- **repair_classifications** — id, component_type_id (FK), deficiency, recommended_repair, unit_of_measure

Use Prisma as the ORM. Generate the schema from these requirements, then run migrations.

**Critical data flow rule:** When a field tech is auditing, every input goes to Neon FIRST. Then async workers sync to Monday.com and Google Sheets. Neon is the source of truth. If Monday or Google is down, the audit continues uninterrupted.

---

## Step 3: Authentication & Onboarding Flow

### Email-based auth:
1. User goes to `/signup`, enters email
2. System sends a magic link (or 6-digit code) to that email
3. User verifies → JWT issued, stored in httpOnly cookie
4. If the email domain (e.g., `stratalandscape.com`) already has an org, user is added to that org automatically
5. If no org exists for that domain, user becomes the admin of a new org → enters onboarding flow

### Onboarding flow (new org admin only):
Sequential setup wizard, each step saveable independently:

1. **Company Info** — Company name (pre-filled from email domain if possible)
2. **Monday.com Integration** — Input fields for Monday API key and Board ID. On submit, test the connection by fetching the board name. Show success/error. Pull in all maintenance properties from that board and store in `properties` table.
3. **Branding (optional)** — Upload primary logo, secondary logo (drag-and-drop, max 2MB each, stored as URLs via upload to `/api/upload` → saved to `public/uploads/` or a blob store). Color pickers for primary and secondary brand colors. Font selector dropdown (curated list: Inter, Roboto, Montserrat, Open Sans, Lato, Poppins, Merriweather, Source Sans Pro, plus a "Default" option).
4. **Google Integration** — "Connect Google Account" button → OAuth 2.0 flow requesting scopes for Google Sheets (read/write) and Google Drive (file create/read). After auth, prompt for Shared Drive ID or Folder ID where reports should live. Test by listing the drive/folder contents. Store refresh token encrypted in `orgs` table.

After onboarding, redirect to the main dashboard.

---

## Step 4: Main Dashboard

After login, the user sees:

- **Property list** — All properties synced from Monday.com. Search/filter bar at top. Each property card shows: name, address, property manager, last audit date, audit status badge.
- **Quick actions:** "Start New Audit" (pick a property), "Sync Properties" (re-pull from Monday), "View Reports"
- **Top nav:** Company logo (if set), user avatar/initials, settings gear icon

This must look great on iPad in both portrait and landscape.

---

## Step 5: The Audit Flow (This is the core of the app)

When a user taps "Start New Audit" on a property:

### 5a. Audit Setup
- Confirm property details (pre-filled from Monday/Neon)
- Add/edit zones for this property (zone name, number, type). If this property has been audited before, pre-populate zones from the last audit.
- "Begin Audit" button

### 5b. Zone-by-Zone Audit
- Left sidebar (or bottom tab on phone): list of zones, tap to navigate. Show checkmark on completed zones.
- Main area: the active zone's audit form
- For each zone, the auditor logs findings:
  - **Component type** (from reference data — large, tappable category buttons, NOT a dropdown)
  - **Component subtype** (context-dependent, also tappable)
  - **Deficiency** (what's wrong — from reference categories)
  - **Severity** (color-coded tap targets: green/yellow/red or whatever the reference material defines)
  - **Quantity** (stepper or numpad)
  - **Photos** (camera button — use device camera via `<input type="file" capture="environment">`)
  - **Notes** (expandable text field, optional)
  - **"Add Finding" button** → saves to Neon immediately, shows in a running list below the form

- Running findings list for current zone at the bottom, swipe-to-delete or tap-to-edit
- "Complete Zone" button marks zone done, advances to next zone
- "Complete Audit" button appears when all zones are done (but can be tapped early to finish with partial audit)

### 5c. Audit Summary
After completing the audit, show a summary screen:
- Total findings by category/severity
- Score breakdown (if scoring methodology exists in reference)
- "Sync to Google Sheets" button → creates the sheet in the correct Drive folder path: `/property-reports/{property-name}/audit-{date}/property-report-{date}`
- The Google Sheet should be formatted nicely with headers, zone tabs or sections, all findings, and BLANK price columns for the estimator to fill in

### Data persistence:
- Every finding saves to Neon on "Add Finding"
- On "Complete Audit", batch sync to Google Sheets
- Async sync to Monday.com (update the property item with last audit date, status, link to sheet)

---

## Step 6: Estimator Pricing Workflow

After an audit is synced to Google Sheets:
1. An estimator (office role) opens the Google Sheet directly in Google Sheets
2. They fill in the `repair_price` column for each finding
3. Back in the app, on the audit detail page, there's a "Sync Prices from Sheet" button that reads the prices back from Google Sheets into Neon
4. Once prices are synced, a "Generate Report" button becomes active

---

## Step 7: Report Generation

"Generate Report" produces a polished, client-facing PDF audit report. This report:

- Uses the org's primary logo (header), secondary logo (footer or watermark), brand colors, and font
- If no branding is set, use a clean, professional default (dark navy + white, Inter font)
- Is addressed to the property manager (name, email, company) from the Monday/Neon data
- Contains:
  - Cover page with property name, address, audit date, auditor name, company logo
  - Executive summary — overall score/grade, total findings count, total repair estimate
  - Section per zone with findings table: component, deficiency, severity, quantity, recommended repair, price
  - Photo evidence pages (findings with photos get a dedicated section showing the photo with a caption describing the issue)
  - Itemized pricing summary at the end — subtotals by zone, by category, and grand total
  - Footer on every page: company name, confidentiality notice, page numbers

Look at the sample reports in `/reference` and match their structure and level of detail as closely as possible.

Generate the PDF server-side using a library like `@react-pdf/renderer` or `puppeteer` (whichever produces the best-looking output for this use case). Store the generated PDF URL in the audit record. Offer a "Download PDF" and "Email to Property Manager" action.

---

## Step 8: Settings & Admin

`/settings` page with tabs:
- **Company** — Edit company name, logos, colors, font
- **Integrations** — Monday.com (change API key/board ID, re-sync), Google (re-auth, change drive folder)
- **Users** — List org users, invite new users by email, change roles
- **Data** — Export all audits as CSV, manual Neon→Monday sync trigger

---

## Step 9: API Route Structure

```
/api/auth/signup
/api/auth/verify
/api/auth/login
/api/auth/me
/api/onboarding/monday (POST — save & test Monday connection)
/api/onboarding/google (GET — initiate OAuth, callback)
/api/onboarding/branding (POST — save logos, colors, font)
/api/properties (GET — list, POST — manual add)
/api/properties/sync (POST — pull from Monday)
/api/audits (GET — list, POST — create new)
/api/audits/[id] (GET, PATCH)
/api/audits/[id]/zones (GET, POST, PATCH, DELETE)
/api/audits/[id]/findings (GET, POST, PATCH, DELETE)
/api/audits/[id]/sync-sheets (POST — push to Google Sheets)
/api/audits/[id]/sync-prices (POST — pull prices from Google Sheets)
/api/audits/[id]/generate-report (POST — generate PDF)
/api/upload (POST — logo/photo uploads)
/api/settings/... (company, integrations, users)
```

---

## Step 10: Key Technical Decisions

- **Offline resilience:** Use service workers + IndexedDB to cache the current audit in progress. If network drops during a field audit, queue writes locally and sync when back online. This is critical — field techs may be in areas with spotty cell coverage.
- **Photo handling:** Compress photos client-side before upload (max 1200px wide, 80% quality JPEG). Store in Vercel Blob or local `/public/uploads/` during dev.
- **Security:** Encrypt Monday API keys and Google refresh tokens at rest in Neon using AES-256. Never expose them client-side.
- **Monday.com API:** Use their GraphQL API v2. Query the specified board for items (properties) with columns for property name, address, PM name, PM email, PM phone. Map column IDs during onboarding setup.
- **Google Sheets formatting:** Use the Sheets API v4 to create well-formatted sheets with headers, column widths, data validation on price columns (numbers only), conditional formatting on severity columns.

---

## Build Order

Execute in this order, committing after each major milestone:

1. Read all reference material → write REFERENCE_NOTES.md
2. Database schema (Prisma) → migrate to Neon
3. Auth system (signup, verify, login, JWT middleware)
4. Onboarding wizard (company info, Monday, branding, Google OAuth)
5. Monday.com property sync
6. Dashboard with property list
7. Audit flow (setup → zone audit → findings → complete)
8. Google Sheets sync (push audit data)
9. Price sync (pull from sheets)
10. Report generation (PDF)
11. Settings/admin pages
12. Offline support (service worker + IndexedDB queue)
13. Polish — responsive testing, loading states, error handling, empty states

---

## Final Notes

- This app will be used by Tyler's company Strata Landscape as the first customer. Design it to be multi-tenant from day one.
- Prioritize the mobile audit experience above everything else. If it's clunky on an iPad in the field, nothing else matters.
- Use the reference material as gospel for component types, deficiency categories, and report structure. Don't guess or simplify — use what's there.
- Every user-facing string should be clear and jargon-appropriate for irrigation/landscape professionals.