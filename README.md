# Irrigation Audit

A field-first, multi-tenant SaaS for landscape companies to audit irrigation systems on iPad/iPhone, hand pricing off to office estimators via Google Sheets, and generate client-facing PDF reports. First customer: Strata Landscape.

Built and deployed by Takeo (Takeoff Monkey).

Production: [irrigation-audit.takeo.co](https://irrigation-audit.takeo.co)

---

## What it does

- **Dashboard** — grid + map view of every property synced from Monday.com. Search, filter by PM / status / source, sort by name / recency / audit count.
- **Property system profile** — per-property data model describing the irrigation infrastructure itself (separate from audits): controllers, water sources, backflow, zones, parts. Tabbed by system.
  - **Files tab** — upload as-builts, worksheets, photos, emails, spec sheets. System-level or zone-specific. Archive to Google Drive. Stored in Vercel Blob.
  - **Import from file** — upload an `.xlsx` takeoff or a `.pdf` as-built, Claude Opus 4.7 extracts zones and parts.
  - **Import from photo** — upload a photo of the zone chart inside a controller door, Claude vision extracts the zones.
- **Audit flow** — mobile-first, tap-through-the-field. Start a new audit blank, from the last audit, or pre-populated from the system profile. Zone-by-zone findings with quick-picks, custom wizard, photos, severity.
- **Google Sheets export** — handoff to estimators. Each audit becomes a 4-tab spreadsheet in Drive.
- **Report generation** — branded PDF with cover, system summary, zones, parts, audit findings with inline photos. Stored as a `SystemFile` tagged `report`; downloadable or archivable to Drive.
- **Settings** — Monday API key + column mapping, Google OAuth + Drive folder picker, org branding (Magic Fill from a website URL via Claude), config "sheet" (real Google Sheets or DB-backed mock), team/users with email invites.
- **Onboarding wizard** — 5-step walkthrough for fresh orgs (company, Monday, branding, Google, done).

---

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router, `src/` dir, Turbopack) |
| Language | TypeScript |
| UI | shadcn/ui on Base UI + Tailwind v4 |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Database | Neon Postgres (pooled for runtime, direct for migrations) |
| Auth | Magic-link JWT via `jose` + AgentMail for email delivery |
| File storage | Vercel Blob (client-upload for big files) + optional Google Drive mirror |
| PDF | `@react-pdf/renderer` — pure-JS, serverless-friendly |
| Maps | Google Maps JavaScript API + Geocoding API (via `@vis.gl/react-google-maps`) |
| LLM | Anthropic SDK, Claude Opus 4.7 (extraction + vision) and Haiku 4.5 (Magic Fill) |
| External | Monday.com GraphQL, Google Drive + Sheets, AgentMail |
| Hosting | Vercel |

### Key architectural decisions

- **Neon is the source of truth.** Every audit write goes to Neon first. Monday + Google syncs are async side-effects.
- **`PropertySystem` is separate from `AuditSystem`.** The property profile is the steady-state description of the system; an audit is a point-in-time inspection against that description. Audits can bootstrap from the profile but don't mutate it.
- **Vercel Blob for primary file storage.** Reports, photos, uploads all land in Blob. Google Drive mirror is opt-in per file via "Archive to Drive" — user's Drive is never the primary store (so permissions / account disconnect can't break the app).
- **Brand colors flow through CSS vars.** Root layout reads the signed-in org's `brandColorPrimary/Secondary` and injects them into `:root`, so every `bg-primary` / `text-primary` Tailwind class resolves to the customer's palette. Foreground contrast auto-picked per color.
- **Client-side image compression** before upload (`src/lib/image-compress.ts`). iPhone photos drop from 7–11 MB to <1 MB, clearing Vercel's 4.5 MB function body limit on the audit/logo/wizard upload paths.
- **Dev mocks guarded against production.** `isMockMode()` (in `monday.ts` + `dev-export-store.ts`) refuses to take the mock path when `NODE_ENV=production`, so a stray `GOOGLE_MOCK=true` leaking into Vercel env can't silently replace real integrations.

### Domain / data model

See [`REFERENCE_NOTES.md`](./REFERENCE_NOTES.md) for the irrigation domain taxonomy (components, deficiency types, repair classifications, severity). Extracted from Tyler's years-old reference material. That doc is the source of truth for the vocabulary — don't invent, use what's there.

The Prisma data model at a glance:

```
Org
 ├── User (admin / auditor / estimator)
 ├── Property
 │    ├── PropertySystem          ← the system profile
 │    │    ├── PropertyController
 │    │    ├── PropertyWaterSource
 │    │    ├── PropertyZone
 │    │    ├── PropertyPart
 │    │    └── SystemFile         ← Blob-backed, optional Drive mirror
 │    └── Audit
 │         ├── AuditSystem        ← per-audit snapshot (legacy naming)
 │         ├── AuditZone
 │         ├── AuditFinding       ← the heart of an audit
 │         └── AuditScore
 ├── ComponentType / QuickPickFinding / SeverityLevel  ← config "sheet" reference data
 └── MagicToken                   ← single-use magic-link bookkeeping
```

---

## Repo layout

```
src/
  app/                   # Next.js App Router pages + route handlers
    api/                 # API routes, grouped by domain
    audits/              # Audit flow pages (new, hub, zone, summary)
    onboarding/          # 5-step wizard
    properties/          # Property list + detail (system profile UI)
    settings/            # Config / users / integrations / company
    login/               # Magic-link auth
  components/            # Shared UI
    ui/                  # shadcn-generated primitives
    app-header.tsx       # Top nav with org logo + user initials
    logo-field.tsx       # Upload/URL input used by Magic Fill + Branding
    magic-fill.tsx       # Website URL → brand extraction via Claude
    property-map.tsx     # Google Maps view with pins + popovers
  lib/
    auth.ts              # JWT + magic-link token issuance
    db.ts                # Prisma client singleton (pg adapter)
    google.ts            # OAuth + Drive + Sheets helpers
    monday.ts            # GraphQL client + property sync + geocoding
    geocode.ts           # Google Geocoding helper
    image-compress.ts    # Client-side photo compression
    catalog-matcher.ts   # Token-overlap match against parts-catalogs/*.csv
    catalog-data.ts      # Auto-generated from the CSVs
    system-extract.ts    # Claude document/image → zones + parts
    report-data.ts       # Report shape contract
    report-pdf.tsx       # @react-pdf/renderer template
    config-sheet.ts      # Google Sheets backend for org config
    config-mock.ts       # DB-backed mock fallback when Google not connected
    brand-theme.ts       # Per-org CSS variable injection
  proxy.ts               # Edge middleware (renamed from middleware.ts in Next 16)
prisma/
  schema.prisma          # Data model
  seed.ts                # Reference seed (component types, quick-picks)
  seed-demo.ts           # Strata Landscape demo org + Tyler user
prisma.config.ts         # Prisma 7 datasource + migrations adapter
parts-catalogs/          # Vendor CSVs (Hunter, K-Rain, Rain Bird, Weathermatic)
scripts/
  build-catalog-data.ts  # Regen src/lib/catalog-data.ts from parts-catalogs/
  seed-cascia.ts         # One-shot seed from sample_systems PDF + xlsx
reference/               # Tyler's original material — gitignored
REFERENCE_NOTES.md       # Distilled taxonomy
```

---

## Running it

### Prerequisites

- Node 20+
- Access to the Neon database (URLs in `.env`)
- Access to the Vercel project (for env vars + Blob token)

### First-time setup

```bash
npm install               # prisma generate runs on postinstall
npm run db:push           # syncs schema to Neon
npm run db:seed           # reference data (component types, quick-picks)
npm run db:seed:demo      # optional: Strata Landscape org + Tyler user
```

### Dev server

```bash
npm run dev
```

Opens at `http://localhost:3000`. To access from another device on the same network (iPad testing), either:

- `npm run dev -- -H 0.0.0.0` + iPad on `http://<mac-lan-ip>:3000`, OR
- `cloudflared tunnel --url http://localhost:3000` for a public HTTPS URL

For iPad testing make sure `APP_URL` in `.env` points at whatever the iPad hits, otherwise magic-link emails embed the wrong host.

### Useful scripts

```bash
npm run db:studio                                  # Prisma Studio — inspect Neon directly
npm run build                                      # prisma generate && next build
npm run lint
npx tsc --noEmit                                   # type check
npx tsx scripts/build-catalog-data.ts              # regen catalog data from CSVs
npx tsx --env-file=.env scripts/seed-cascia.ts     # populate a demo system from the sample as-built
vercel logs --follow                               # stream prod logs
```

---

## Environment variables

Everything lives in `.env` locally (gitignored) and in the Vercel project env vars in prod. Full list:

### Required

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Neon pooled URL (runtime) |
| `DIRECT_URL` | Neon direct URL (for `prisma db push` / migrations) |
| `JWT_SECRET` | Session + magic-link signing — rotate invalidates all sessions |
| `ENCRYPTION_KEY` | 64-char hex (32 bytes). AES-256-GCM for encrypting integration secrets at rest. **Rotate = existing encrypted rows become unreadable** — plan a re-encrypt migration before doing so in prod. |
| `APP_URL` | Canonical public URL. Baked into magic-link emails, Google OAuth `redirect_uri`, report links, everything outbound. **Must match the Vercel domain / your dev tunnel exactly.** |
| `ANTHROPIC_API_KEY` | Claude API (Magic Fill, document/photo extraction, report content if ever used) |
| `AGENTMAIL_API_KEY` | Transactional email (magic links, invites) |
| `AGENTMAIL_INBOX_ID` | Sending inbox on AgentMail |
| `NEXT_PUBLIC_MAPS_API` | Browser-side Google Maps JS + Geocoding API key — referrer-restricted to the app's domain in Cloud Console. Shared by the portfolio map, the finding-pin satellite modal, and server-side geocoding. |
| `GOOGLE_MAPS_SERVER_API_KEY` | Server-side Static Maps API key used by `/api/maps/static-thumbnail` to render per-finding pin thumbnails. IP-restricted, not referrer-restricted — keep off the client. |
| `GOOGLE_CLIENT_ID` | OAuth client for Drive + Sheets |
| `GOOGLE_CLIENT_SECRET` | Paired with the above |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access. **Auto-provisioned by Vercel when a Blob store is connected** — don't set manually. |

### Optional

| Variable | What it does |
|---|---|
| `DEV_AUTO_LOGIN` | Dev-only email to auto-login as. Renders a "Dev login" button on `/login`. Rejected in production. |
| `GOOGLE_MOCK` | Dev-only. Skips real Google API calls, writes payloads to `dev-exports/{id}.json`. Force-disabled in production via `NODE_ENV` guard. |
| `MONDAY_MOCK` | Dev-only. Returns 5 canned properties instead of hitting Monday. Force-disabled in production. |

### Provisioning a new Vercel deployment

1. Create the project, connect GitHub repo.
2. Storage tab → create a Blob store (public access) → connect it. Vercel injects `BLOB_READ_WRITE_TOKEN` automatically.
3. Set every "Required" env var above for Production + Preview + Development.
4. Set `APP_URL` to your Vercel domain (`https://<project>.vercel.app` or a custom domain).
5. Redeploy (uncheck "Use existing Build Cache" so env vars are picked up).
6. Register the following in Google Cloud Console → Credentials:
   - Authorized redirect URI: `https://<your-domain>/api/auth/google/callback`
   - HTTP referrer restriction on the Maps key: `https://<your-domain>/*`

### Custom domain

Vercel → Settings → Domains → Add. Update `APP_URL` + Google OAuth redirect URI to match. The old `*.vercel.app` URL keeps serving the app as a secondary (optionally redirect it to canonical via the Domains page).

---

## Integrations — state of play

### Anthropic Claude

- Used for: Magic Fill (website → brand), Excel/PDF/image extraction to zones + parts, zone-chart photo wizard.
- Models: **Opus 4.7** for extraction (vision + structured output, adaptive thinking), **Haiku 4.5** for Magic Fill (simple JSON extraction, cheap).
- Keys: `ANTHROPIC_API_KEY`.

### Monday.com

- Properties are sourced from a Monday board via GraphQL. Column mapping lives on `Org.mondayColumnMapping`. Sync is one-way (Monday → Neon) with soft-delete for vanished items.
- Auto-maps the Monday **location column type** to address if present — the `text` field of a location column returns the full formatted address, perfect for geocoding.
- Geocoding happens inline during sync: new addresses go through Google Geocoding and lat/lng is cached on Property. "Geocode now" button in Settings backfills orphans.

### Google (Drive + Sheets)

- Connected via OAuth in onboarding step 4 or Settings → Integrations. Refresh token encrypted at rest (`googleCredentialsEnc`). Scopes: `drive.file`, `spreadsheets`, `userinfo.email`.
- **Drive folder picker** (Settings → Integrations → Google) sets the export root. Defaults to My Drive root if none picked. All exports + reports land in `{root}/Property Reports/{property}/audit-{date}/`.
- **Config sheet** — each org gets a spreadsheet with 4 tabs (Components, QuickPicks, SeverityLevels, ReportSettings) that drives the audit UI's reference data. Edit in Google, click Sync to apply. Falls back to a DB-backed mock JSON column when Google isn't connected.

### AgentMail

- Powers magic-link login emails + new-user invite emails. POST `/v0/inboxes/{inbox_id}/messages/send`, bearer auth.
- `src/lib/email.ts` falls back to console logging if `AGENTMAIL_API_KEY` / `AGENTMAIL_INBOX_ID` are unset. Useful for local dev without burning email quota.

### Vercel Blob

- All file storage — audit photos, uploaded as-builts/worksheets, generated PDF reports, logos.
- Client-upload flow (`@vercel/blob/client`) for the Files tab, which bypasses Vercel's 4.5 MB function body limit.
- Server-side `put()` for reports (PDF rendered on the server) and for photos (which now pass through client-side image compression so they fit under the body limit).

---

## Common gotchas

- **Next.js 16 `proxy.ts`** replaces the old `middleware.ts`. Same Edge runtime, same matcher semantics, new filename.
- **Prisma 7 moved the datasource URL out of `schema.prisma`** into `prisma.config.ts`. Runtime uses `new PrismaPg({ connectionString: process.env.DATABASE_URL })` from `@prisma/adapter-pg`.
- **`.env` not `.env.local`** is what Prisma reads for `db push`. Both are gitignored; we keep DB URLs in `.env` so both Next.js and Prisma CLI pick them up.
- **HEIC photos** aren't decodable in canvas on most browsers. `compressImage()` returns the original file for HEIC; iOS Safari auto-converts HEIC to JPEG when selecting from the photo library, so usually this is a non-issue. Files picked from iOS Files app stay HEIC.
- **Vercel function body limit is 4.5 MB** on Hobby. Photo uploads, wizard photos, and logos go through `compressImage()` first to stay under. File-tab uploads use client-upload so they're exempt.
- **Vercel function timeout is 60s** on most routes. Report generation and PDF/XLSX extraction approach this on big files — large audits with 50+ findings + photos may time out. Splitting into resumable render would be a follow-up.
- **Vercel env var changes require a redeploy** to take effect; the running function reads its process.env from the build that produced it.
- **`postinstall` runs `prisma generate`** so Vercel always has a fresh client. If you edit the schema, push to Neon with `db:push` before deploying.

---

## Out of scope for AI coding assistants without explicit ask

- Don't touch `reference/` — read-only ground truth (gitignored anyway).
- Don't touch `junk/` — deprecated Python template.
- Don't add top-level dependencies (auth libs, ORMs, PDF libs) without flagging the choice first.
- Don't `git push` or create commits without being asked.

See `CLAUDE.md` for full session-bootstrapping notes.
