# Milestone F: PDF Report Generation

## Context

The full audit pipeline is built: auditors complete audits (D), data exports to Google
Sheets (E), estimators fill in pricing, and prices sync back to Neon (E). The audit
summary page shows a "Ready to generate report" badge when all findings are priced, with
a placeholder "Generate Report" button.

This milestone builds the client-facing PDF — the deliverable that gets sent to the
property manager. It should look professional enough that Tyler's team can hand it to a
property manager and win the repair work.

Read CLAUDE.md, REFERENCE_NOTES.md (especially the sample report structure), the audit
summary page, the org branding fields in prisma/schema.prisma, and the reference/ folder
for any sample output reports before starting.

---

## 1. Report Design

The PDF is a polished, branded document addressed to the property manager. Study the
sample reports in reference/ and match their level of professionalism. The report has
these sections in order:

### Page 1: Cover Page
- Org's primary logo (centered, large) — fall back to org name in large text if no logo
- Report title: "Irrigation Audit Report" (or from config sheet Report Settings if set)
- Property name (large)
- Property address
- Audit date
- Prepared for: {PM name}, {PM company if available}
- Prepared by: {Auditor name}, {Org name}
- Org's secondary logo or "Powered by {Org name}" at the bottom (small)
- Use org's brand colors for any decorative elements (header bar, accent lines).
  If no brand colors set, use a clean dark navy (#1e293b) + white scheme.
- Use the org's selected font family. Fall back to Inter.

### Page 2: Executive Summary
- **Overall Assessment**: 1-2 sentence summary. Generate this based on the data:
  - If mostly Minor findings: "The irrigation system is in generally good condition
    with minor maintenance items identified."
  - If significant Moderate/Critical: "The irrigation system requires attention.
    Several moderate to critical issues were identified that may be causing water
    waste and landscape damage."
  - Scale the language to the severity distribution.
- **Key Statistics** (clean stat cards or table):
  - Total findings: N
  - Critical: N (red)
  - Moderate: N (yellow)
  - Minor: N (green)
  - Zones inspected: N
  - Total estimated repairs: $X,XXX.XX
- **Score / Grade** (if scoring methodology exists in config):
  - Overall score as a percentage or letter grade
  - Visual indicator (progress bar, gauge, or large grade letter)

### Pages 3+: Findings by Zone
For each zone, a section with:
- Zone header: zone name + number, with a severity summary badge
- Findings table:

| # | Component | Issue | Severity | Qty | Unit Price | Total |
|---|-----------|-------|----------|-----|------------|-------|
| 1 | 4" Spray Head | Broken | Critical | 3 | $12.50 | $37.50 |
| 2 | Rotor | Tilted | Moderate | 1 | $8.00 | $8.00 |

- Severity column: colored text or background (red/yellow/green)
- Zone subtotal row at the bottom (bold)
- If a finding has photos, show them inline or in a grouped photo section after the
  table (thumbnail size, ~2" wide, with a caption: "{Component} — {Issue}")
- Page break between zones if a zone's content would split awkwardly across pages

### Photo Evidence Section (optional — after all zones)
If there are findings with photos, include a dedicated section:
- Grid layout: 2 photos per row
- Each photo: image, zone name, finding description, severity badge
- Photo size: approximately 3" × 2.25" (maintain aspect ratio)
- This section only appears if there are photos. Skip it if no findings have photos.

### Final Page: Pricing Summary
- Table summarizing costs by category:

| Category | Items | Estimated Cost |
|----------|-------|----------------|
| Spray Heads | 8 | $287.50 |
| Rotors | 3 | $145.00 |
| Valves | 2 | $320.00 |
| ... | ... | ... |
| **Total** | **13** | **$752.50** |

- Below the table:
  - "This estimate is valid for 30 days from the date of this report."
    (or configurable text from Report Settings)
  - Space for signature / acceptance (optional — a simple line with "Authorized by:"
    and a date line)

### Footer (every page except cover)
- Left: org name
- Center: "Confidential" (or configurable footer text from Report Settings)
- Right: "Page X of Y"
- Thin line above the footer in the brand's primary color

---

## 2. PDF Generation Approach

Use **React PDF (`@react-pdf/renderer`)** for server-side PDF generation. This gives us:
- React component model for layout (familiar, composable)
- Built-in font registration (for the org's selected font)
- Image embedding (logos + finding photos)
- Page numbering
- No headless browser needed (unlike Puppeteer)

If `@react-pdf/renderer` can't handle the complexity (table formatting, conditional
page breaks, image layout), fall back to **PDFKit** or **jsPDF**. But try React PDF
first — it handles most document layouts well and the component model makes it easier
to maintain.

### Font Registration:
Register the org's selected font family. The available fonts from the onboarding wizard
are all Google Fonts. Download the font files (or bundle the most common ones) and
register them with React PDF's `Font.register()`. At minimum, bundle:
- Inter (default)
- Roboto
- Montserrat
- Open Sans

For others, fall back to Inter.

### Image Handling:
- Logos: stored as URLs in the org record (uploaded during onboarding). Fetch them
  and embed in the PDF.
- Finding photos: stored as URLs or local paths. Fetch and embed. Compress/resize
  if needed to keep PDF size reasonable (target: under 10MB for a typical audit with
  20-30 photos).
- If a photo URL fails to fetch, skip it gracefully (show a placeholder or just omit).

---

## 3. API Route

### `POST /api/audits/[auditId]/generate-report`

1. Verify auth — admin or estimator
2. Verify the audit is in status `PRICED` (all findings have prices)
   - If not fully priced, return 400: "All findings must be priced before generating
     a report. X findings still need pricing."
3. Load the full audit data: audit + property + zones + findings (with prices) + org
   (with branding) + auditor user
4. Load org-scoped config (severity levels, report settings from config sheet)
5. Render the PDF using the React PDF components
6. Upload the PDF to storage:
   - For dev: save to `public/reports/{auditId}.pdf`
   - For production: upload to Google Drive in the same audit folder as the Sheet
     (next to the exported Sheet)
   - Store the URL/path in `audits.reportUrl` and `audits.reportPdfPath`
7. Update audit status to `REPORT_GENERATED`
8. Return `{ reportUrl, reportPdfPath }`

### Schema Changes:
Add to the audits model:
```
reportUrl       String?    // public URL or Drive link to the PDF
reportPdfPath   String?    // local path or Drive file ID
reportGeneratedAt DateTime? // when the report was generated
```

Add `REPORT_GENERATED` to the AuditStatus enum if not already present (the summary page
status indicator already references it).

---

## 4. UI Changes

### Audit Summary Page:
- "Generate Report" button: enabled when status is `PRICED`, disabled with tooltip
  otherwise ("Price all findings first")
- While generating: spinner with "Generating PDF report..." (this may take 5-15 seconds
  for audits with many photos)
- On success: show "Report generated!" banner with:
  - "Download PDF" button (direct download)
  - "Open in Drive" link (if uploaded to Google Drive)
  - "Email to Property Manager" button (placeholder for now — just show the button
    disabled with "Coming soon" tooltip, or wire up a simple mailto: link with the
    PDF attached if feasible)
- On failure: error toast with details
- If already generated: show "Download PDF" + "Regenerate" button

### Report Preview (nice to have):
If time permits, add a "Preview" button that shows the PDF inline in an iframe or
embedded viewer before the user commits to generating the final version. This lets
them catch issues before sending to the client. Not critical for v1.

---

## 5. PDF Component Structure

Organize the React PDF components cleanly:

```
src/lib/pdf/
  report-document.tsx    — top-level <Document> component
  cover-page.tsx         — cover page section
  executive-summary.tsx  — stats + score
  zone-findings.tsx      — per-zone findings table
  photo-evidence.tsx     — photo grid section
  pricing-summary.tsx    — final pricing table
  report-styles.ts       — StyleSheet definitions, brand color helpers
  font-loader.ts         — Font.register calls for bundled Google Fonts
  types.ts               — TypeScript types for report data
```

Each component receives typed props with the data it needs. The top-level
`report-document.tsx` orchestrates everything and handles page breaks.

---

## 6. Branding Application

The report should feel like it came from the org, not from our app.

| Element | Branded | Default (no branding) |
|---------|---------|----------------------|
| Cover logo | Org primary logo | Org name in large text |
| Header color | brandColorPrimary | #1e293b (dark navy) |
| Accent color | brandColorSecondary | #3b82f6 (blue) |
| Font | Org's selected font | Inter |
| Footer logo | Org secondary logo | None |
| Footer text | From config Report Settings | "Confidential — Prepared by {org}" |

If the org has set brand colors but they're too light for text on white, use them
only for headers/accents and keep body text black.

---

## 7. Mock Mode

When generating a report without real Google Drive:
- Save the PDF to `public/reports/{auditId}-report.pdf`
- Return a local URL: `/reports/{auditId}-report.pdf`
- The download button serves the file directly
- No Drive upload attempted

This should work regardless of GOOGLE_MOCK — always save a local copy. Only additionally
upload to Drive if Google is connected and not in mock mode.

---

## 8. Performance Considerations

- **Photo fetching**: Fetch all photos in parallel (Promise.all), with a timeout of
  5 seconds per photo. Skip any that fail.
- **Photo compression**: If photos are large (>500KB), resize to max 800px wide before
  embedding. This keeps PDF size manageable.
- **Caching**: Cache the rendered PDF buffer. If "Download" is clicked multiple times,
  serve the cached version instead of re-rendering.
- **Timeout**: Set a generous API route timeout (60 seconds) for audits with many
  findings and photos. Add a note in CLAUDE.md about Vercel's function timeout limits
  (default 10s on Hobby, 60s on Pro — this route may need Pro plan or background
  processing for large audits).

---

## 9. Do NOT build yet
- Email delivery (just the mailto: link or placeholder for now)
- Report templates / customization UI
- Batch report generation (multiple audits at once)
- Report versioning / history
- Digital signature capture
- Client portal where PMs can view reports online
- Watermarking

---

## 10. Build Order
1. Schema changes (reportUrl, reportPdfPath, reportGeneratedAt, enum update) → prisma db push
2. Install @react-pdf/renderer + bundled fonts
3. `src/lib/pdf/` — build all PDF components starting with cover page
4. Wire up the top-level report-document.tsx that assembles all sections
5. `POST /api/audits/[auditId]/generate-report` — render + save + Drive upload
6. Audit summary page — working Generate Report button, download link
7. Test with mock data: complete an audit, add prices, generate PDF, verify it looks good
8. Test branding: set logo + colors on the demo org, regenerate, verify branding applies
9. Test edge cases: audit with no photos, audit with 50 findings, audit with no brand colors
10. Commit: "feat: PDF report generation with org branding"