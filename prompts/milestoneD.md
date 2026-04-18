## Milestone D: Audit Flow — Mobile-First Field UI

### Context
Foundation is complete. Neon has 11 tables, 18 component types, and 31 quick-picks seeded. 
The schema supports Property → Audit → System → Zone → Finding hierarchy. Read REFERENCE_NOTES.md 
and CLAUDE.md for full context. Read all reference material in reference/ again if needed to 
understand the audit workflow and report structure.

### Prerequisites — Stub Data
Before building UI, create a seed addition (or a separate dev seed script) that creates:
- 1 demo org: "Strata Landscape", email domain "stratalandscape.com"
- 1 demo user: "Tyler Demo" tyler@stratalandscape.com, role: auditor
- 3 demo properties with realistic data:
  - "Austin Oaks HOA" — 123 Live Oak Dr, Austin TX — PM: Sarah Chen, sarah@austinpm.com
  - "Lakewood Business Park" — 4500 Lakewood Blvd, Dallas TX — PM: Mike Torres, mike@lakewoodmgmt.com  
  - "Riverside Townhomes" — 890 River Rd, San Antonio TX — PM: Lisa Park, lisa@riversidepm.com
- Skip auth for now — hardcode the demo user session via middleware or a dev-mode cookie. 
  Every page should just assume the logged-in user is Tyler. We'll replace this with real 
  auth later. Make sure this dev-mode bypass is clearly marked and easy to rip out.

### What to Build

#### 1. Dashboard (/)
Replace the smoke-test page with the real dashboard:
- Top bar: "Strata Landscape" text (logo placeholder), user initials avatar "TD"
- Property cards in a responsive grid (1 col phone, 2 col iPad portrait, 3 col iPad landscape)
- Each card: property name, address, PM name, last audit date (or "No audits yet"), status badge
- Big "+" FAB (floating action button) or "Start New Audit" button
- Tapping a property card → goes to property detail with audit history
- Tapping "Start New Audit" → property picker then audit setup

Design this mobile-first. Cards should be large, tappable, with clear visual hierarchy. 
Use shadcn Card components styled with Tailwind.

#### 2. Start New Audit Flow
Route: /audits/new?propertyId=xxx (or property picker if no propertyId)

**Step 1 — Confirm Property:**
Show property details (name, address, PM). "Looks good, continue" button.
If this property has previous audits, show a note: "Last audited on [date]" with option 
to "Copy zones from last audit" so the auditor doesn't have to re-enter zone info.

**Step 2 — Irrigation Systems:**
Before zones, the auditor identifies what irrigation systems exist on the property.
Based on the reference material, this might include: controllers, mainlines, backflow 
preventers, POC (point of connection), master valves, etc. — the "system-level" components 
that aren't zone-specific. Present these as large tappable cards/toggles. The auditor taps 
to confirm which systems are present and can log system-level findings here (e.g., 
"controller is a Hunter Pro-C, needs firmware update").

**Step 3 — Define Zones:**
List zones. Pre-populate from last audit if "Copy zones" was selected.
- "Add Zone" button → zone name, zone number, zone type (from reference data)
- Zones appear as a reorderable list
- Swipe to delete (with confirm)
- "Begin Audit" button when at least 1 zone exists

**Step 4 — Zone Audit (THE CRITICAL SCREEN):**
Route: /audits/[auditId]/zones/[zoneId]

This is where the auditor spends 90% of their time. It must be FAST and FRICTIONLESS.

**Layout:**
- Top: Zone name + number, zone navigation (prev/next arrows, or a scrollable zone pill bar)
- Zone pill bar: horizontal scroll of all zones, active zone highlighted, completed zones 
  show checkmark. Tapping any pill jumps to that zone.
- Main area: finding entry form
- Bottom: running list of findings for this zone

**Finding Entry Form — tap-first, not type-first:**
This is the most important UI in the entire app. Design it as a progressive disclosure flow:

1. **Component Type** — Large tappable buttons in a grid (2x3 or 2x4). Icons + labels. 
   Categories from reference data: Heads/Nozzles, Valves, Piping, Wiring, Drainage, 
   Landscaping Impact, etc. These should be visually distinct (different colors or icons 
   per category).

2. **Component Subtype** — After tapping a category, show subtypes as a secondary grid or 
   list. Example: tapping "Heads" shows "Spray Head", "Rotor", "Drip Emitter", "Bubbler", etc.
   This comes from the component_types reference data.

3. **Deficiency / Issue** — After selecting component, show common deficiencies for that 
   component type as tappable chips. Example for "Spray Head": "Broken", "Tilted", 
   "Wrong nozzle", "Obstructed", "Sunken", "Missing". These are the quick_picks from 
   the seed data. Also include a "Custom" option that opens a text field.

4. **Severity** — Three large buttons: 
   - 🟢 Minor (cosmetic, low priority)  
   - 🟡 Moderate (functional issue, should fix)  
   - 🔴 Critical (system failure, fix immediately)
   Color-coded, hard to miss.

5. **Quantity** — Stepper (- / number / +), default 1. Large tap targets.

6. **Photo** — Camera button. Uses `<input type="file" accept="image/*" capture="environment">` 
   to open device camera. Compress client-side to max 1200px wide, 80% JPEG quality before 
   storing. Support multiple photos per finding. Show thumbnails after capture.
   For now during dev, store photos as base64 in the finding record or as files in /public/uploads/. 
   We'll move to blob storage later.

7. **Notes** — Optional expandable text area. Collapsed by default to save space.

8. **"Add Finding" button** — Saves to Neon immediately via API call. Shows brief success 
   toast. Resets the form for the next finding. The new finding appears in the running list below.

**The form should NOT be a traditional stacked form.** It should feel like a wizard or a 
point-of-sale system — tap tap tap done. Each step transitions smoothly to the next. 
Consider using a horizontal step indicator or accordion-style progressive reveal.

**Running Findings List (below the form):**
- Cards showing: component icon, type/subtype, deficiency, severity badge, quantity, 
  thumbnail if photo exists
- Tap to expand/edit
- Swipe left to delete (with confirm)
- Count badge showing total findings for this zone

**Zone Completion:**
- "Complete Zone" button at bottom → marks zone complete, auto-advances to next zone
- "Complete Audit" button accessible from any zone → confirms, marks audit as completed

#### 3. Audit Summary Screen
Route: /audits/[auditId]/summary

After completing the audit:
- Property info header
- Score/grade display (if scoring methodology exists in reference — check REFERENCE_NOTES.md)
- Findings breakdown: count by severity, count by component category
- Visual summary (maybe a simple bar chart or colored stat cards)
- Zone-by-zone findings list (collapsed by default, expandable)
- Action buttons:
  - "Back to Dashboard"
  - "Export" (placeholder — will connect to Google Sheets in Milestone E)
  - "View All Findings" (full scrollable list)

#### 4. Audit History on Property Detail
Route: /properties/[propertyId]

- Property header with details
- List of past audits: date, auditor, status, finding count, score
- Tap an audit → audit summary screen
- "Start New Audit" button

### Technical Requirements

- All data writes go to Neon via API routes in /api/audits/*, /api/findings/*, etc.
- Use React Server Components for data fetching where possible, Client Components for 
  interactive UI (the audit form must be a client component)
- Use shadcn/ui components (Button, Card, Badge, Dialog, Sheet, Tabs, Toast) styled 
  with Tailwind
- Every interactive element must have a minimum 44x44px tap target (Apple HIG)
- Test the layout at these viewports: 375px (iPhone SE), 390px (iPhone 14), 
  768px (iPad mini), 1024px (iPad), 1366px (iPad Pro landscape)
- Loading states: use shadcn Skeleton components while data loads
- Error states: toast notifications for API failures, with retry option
- Optimistic updates: when adding a finding, show it in the list immediately, 
  then confirm with the API response (or roll back on error)

### Do NOT build yet:
- Real authentication (use the dev stub)
- Monday.com integration
- Google OAuth / Sheets sync
- PDF report generation
- Offline support / service workers
- Settings pages

### Build order within this milestone:
1. Stub data seed + dev auth bypass
2. Dashboard with property cards
3. Property detail + audit history
4. New audit setup flow (confirm property → systems → zones)
5. Zone audit screen — finding entry form (THE BIG ONE — spend the most time here)
6. Finding CRUD API routes
7. Audit summary screen
8. Test everything at mobile viewports, iterate on tap targets and flow
9. Commit with message "feat: audit flow — mobile-first field UI"