# Irrigation Audit App

> Read this on every session start. Keep it honest and current.

## ⚠️ Next.js version warning

This project uses **Next.js 16** with the App Router. The API surface, file conventions, and config format may differ from your training data. **Before writing Next.js code**, sanity-check against the docs in `node_modules/next/dist/docs/` (or the live docs) — don't assume legacy patterns still work. Heed deprecation notices.

Same applies to **Prisma 7** — the datasource URL has moved out of `schema.prisma` and into `prisma.config.ts`, the runtime client now requires a driver adapter (`@prisma/adapter-pg`), and `db push` reads from `datasource.url` in the config file.

## What this project does

A multi-tenant SaaS for landscape companies (first customer: Strata Landscape) to perform irrigation system audits in the field on iPad/iPhone, hand pricing off to office estimators via Google Sheets, and generate polished client-facing PDF reports. Mobile-first — if it's clunky in the field, nothing else matters.

The complete domain model (component taxonomy, deficiency categories, repair classifications, report structure) lives in **`REFERENCE_NOTES.md`**. That doc is the source of truth — extracted from years-old reference material in `reference/`. Don't invent taxonomy; use what's there.

The full original build spec is in **`prompts/initial-prompt.md`**.

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router, src/ dir) |
| Language | TypeScript |
| UI | shadcn/ui (base-nova preset = Base UI) + Tailwind v4 |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Database | Neon Postgres (pooled @ runtime, direct @ migrations) |
| Auth | Custom JWT session + email magic-link (built — `src/lib/auth.ts`) |
| Email | AgentMail (prod) / console logger (dev) — `src/lib/email.ts` |
| File storage | Vercel Blob for audit photos + site-plan renders |
| Offline (Phase 1) | Service worker (`@serwist/next`) + IndexedDB (Dexie) — see `OFFLINE.md` |
| Testing | Vitest (unit) — `npm test`. No e2e yet; Playwright is a TODO. |
| External | Monday.com GraphQL API, Google OAuth + Sheets + Drive |
| Deploy | Vercel |

## Repo layout

```
src/
  app/                # Next.js App Router pages, layouts, route handlers
    auth/confirm/     # Intermediate magic-link page (GET-safe, keeps
                      # link previewers from burning tokens)
    api/auth/         # magic-link, verify (POST), logout, me, google,
                      # dev-login (env-gated shortcut)
  components/ui/      # shadcn-generated components
  lib/
    auth.ts           # JWT session + magic-link signing/verification
    bot-ua.ts         # Bot UA detection used by verify endpoint
    db.ts             # Prisma client singleton (uses pg adapter)
    email.ts          # sendEmail() — AgentMail in prod, console in dev
    finding-draft.ts  # localStorage persistence + dirty-check for the
                      # in-progress finding form on the zone screen
    report-pdf.tsx    # @react-pdf/renderer PDF template
    sheet-export.ts   # Google Sheets export payload builder
prisma/
  schema.prisma       # Data model — see §"Data model" below
  seed.ts             # Idempotent global reference seed (run via `npm run db:seed`)
  seed-demo.ts        # Demo data — Strata Landscape org + Tyler Demo user + properties
prisma.config.ts      # Prisma 7 datasource + migrations adapter config
.env                  # DATABASE_URL + DIRECT_URL + JWT_SECRET + …  (gitignored)
reference/            # Original Tyler material — domain ground truth
REFERENCE_NOTES.md    # Distilled taxonomy from reference/ — READ THIS
prompts/              # Original build prompts
junk/                 # Deprecated Python template files (do not use)
```

## How to run

```bash
# Install
npm install

# Push schema to Neon (no migrations yet — using db push during early iteration)
npm run db:push

# Seed global reference data (component types, quick-pick findings)
npm run db:seed

# Seed demo data (Strata org + Tyler Demo user + 3 properties)
npm run db:seed:demo

# Dev server
npm run dev

# Unit tests
npm test              # one-shot
npm run test:watch    # watch mode

# Open Prisma Studio to inspect Neon directly
npm run db:studio
```

Dev login shortcut: set `DEV_AUTO_LOGIN=<email>` in `.env`. The login page will show a "Dev login as …" button that hits `/api/auth/dev-login`. Only active when `NODE_ENV !== "production"`.

## Data model (see prisma/schema.prisma + REFERENCE_NOTES.md)

Hierarchy: **Org → Property → Audit → AuditSystem → AuditZone → AuditFinding**.

Critical: a property has **1..N irrigation systems**, each with its own controller and zones. The `audit_systems` table is non-negotiable — system-level findings (mainline break, controller dead, backflow status) attach to a system, not a zone. `audit_findings.zone_id` is nullable for that reason; `system_id` is always set.

Multi-tenant scoping: every primary table (`properties`, `audits`, `users`, etc.) carries `org_id`. Reference tables (`component_types`, `quick_pick_findings`, `severity_levels`) use `org_id = NULL` for global defaults; orgs can add their own overrides on top.

Severity defaults are seeded per `IssueType` (REFERENCE_NOTES.md §3) and overridable per finding. There's no external scoring rubric; when scoring lands in a report, it'll be a derived count-weighted score.

Auth tables: `users`, `orgs`, `magic_tokens` (single-use, TTL 15m, tracked by `jti`). Session is a JWT in an httpOnly cookie, 7-day TTL. Domain-based org resolution on first sign-in (existing org with matching `emailDomain` → auditor; no match → new org, user = admin).

UOM quirk: drip tubing and field wire use `sf` (square feet) even though they're linear. **Preserve this** — it matches the reports Tyler's team already uses.

## Key decisions / gotchas

- **Neon is the source of truth.** Every audit write goes to Neon FIRST. Monday.com and Google Sheets sync are async background jobs. If those services are down, the field audit must continue uninterrupted.
- **Prisma 7 schema doesn't hold the URL.** `prisma.config.ts` has `datasource.url` (for `db push`/`migrate`) AND `migrations.adapter`. The runtime client constructs `PrismaClient` with `new PrismaPg({ connectionString: process.env.DATABASE_URL })`.
- **`.env` not `.env.local`** is the file Prisma reads. Both are in `.gitignore`. We keep DB URLs in `.env` so both Next.js and Prisma pick them up.
- **`tsx` for scripts** — when running standalone scripts that use Prisma, use `tsx --env-file=.env <script>` so the env loads.
- **Reference seed is wipe-and-reseed for `org_id = NULL` rows.** Prisma can't `upsert` against a unique key with a nullable column. The `deleteMany({ where: { orgId: null } })` + `create` pattern is intentional.
- **Quick-picks come from the Austin Oaks paper form** (REFERENCE_NOTES.md §7). Each is a one-tap shortcut pre-mapped to (issue, component, solution, severity, UOM).
- **Magic-link emails link to `/auth/confirm?token=…`, not `/api/auth/verify` directly.** That intermediate page exists because Gmail/Slack/iMessage prefetch URLs to render link previews, which burned the one-time token before the user clicked. The token is only consumed on an explicit POST from the Continue button, and the POST handler also rejects known bot UAs as belt-and-suspenders.
- **In-progress finding drafts are persisted to IndexedDB** via Dexie (`src/lib/finding-draft.ts` → `src/lib/offline/db.ts` `drafts` store, keyed `<auditId>:<zoneId>`). Restored on mount; cleared on save/discard; purged wholesale on audit completion. `beforeunload` guards tab close / refresh; in-app navigation is intercepted by an unsaved-changes confirm sheet. Note: prior to Phase 1 offline work, drafts lived in localStorage under `audit-draft:*` keys; those are migrated once on app load by `src/lib/offline/migrate.ts`.
- **Offline support is Phase 1.** Read-side only — see `OFFLINE.md`. The build script passes `--webpack` because `@serwist/next` doesn't yet support Next 16's Turbopack production builds. `public/sw.js` is a generated artifact (gitignored). Write-side queueing is Phase 2.
- **Finding location pins.** `AuditFinding` has two independent pin systems: the legacy `sitePlan{X,Y,FileId}` set (PDF site-plan pinning, still wired into the existing UI) and the newer `pin{Lat,Lng,Source,PlacedAt}` set (real-world coords from the satellite modal or GPS fallback). The two are additive — a finding can have both, either, or neither. `PinSource` enum is `map | gps`. Drop/Edit/Remove lives in the LOCATION row of the finding draft form; the modal is `src/components/map/satellite-pin-modal.tsx`; the GPS sheet is `src/components/map/gps-capture-sheet.tsx`; the canonical geolocation hook is `src/lib/hooks/use-geolocation.ts`. Per-finding thumbnails come from the server-side Static Maps proxy at `/api/maps/static-thumbnail?findingId=…` (uses `GOOGLE_MAPS_SERVER_API_KEY`). Browser-side map views use `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (this replaces the old `NEXT_PUBLIC_MAPS_API` — sync `.env.local` and Vercel on upgrade).
- **`pg` SSL deprecation warning** — current pg version warns that `sslmode=require` will change semantics in v3.0.0/v9.0.0. Either pin pg or update the connection string to `sslmode=verify-full` before the bump. Tracking but not urgent.

## Active branch / worktree notes

- Git is set up (`git@github.com:TommytheMonkey/irrigation-audit-ii`). Main is deploy-tracking; feature work happens on branches or worktrees.
- Future feature work: worktrees under `~/worktrees/irrigation-audit-<feature>` per Tommy's standard pattern.

## What's built (as of 2026-04-23)

- ✅ Reference catalog (`REFERENCE_NOTES.md`)
- ✅ Next.js 16 + TS + Tailwind v4 + shadcn/ui (base-nova) scaffold
- ✅ Prisma 7 + `@prisma/adapter-pg` wired to Neon
- ✅ Full schema (orgs, users, magic_tokens, properties, property_systems / controllers / zones / water_sources / parts / files, site_plan_renders, audits, audit_systems, audit_zones, audit_findings, audit_scores, component_types, quick_pick_findings, severity_levels)
- ✅ Reference seed + demo seed (`npm run db:seed:demo` — Strata Landscape org + Tyler Demo user + 3 properties)
- ✅ **Auth** — email magic-link + JWT session (`src/lib/auth.ts`, `/api/auth/magic-link`, `/api/auth/verify` POST, `/auth/confirm` intermediate page). Domain-based org resolution on first sign-in. Dev-login shortcut behind `DEV_AUTO_LOGIN` env var.
- ✅ Onboarding wizard (`/onboarding`) — company, Monday, Google, branding, done
- ✅ Settings (`/settings`) — company, integrations (Monday + Google), users, config tabs; Drive folder picker; property import card
- ✅ Mobile-first audit flow:
  - `/` dashboard with property cards + Monday sync banner
  - `/properties/[id]` property detail + audit history + files + zones + site plan
  - `/audits/new?propertyId=…` confirm + (optional) copy zones from last audit
  - `/audits/[id]` audit hub: zone list + inline add-zone form + **Complete Audit (with confirm dialog + unsaved-draft warning)**
  - `/audits/[id]/zones/[id]` THE BIG ONE — quick-pick chips, custom finding wizard, severity buttons, quantity stepper, photo upload, optimistic finding list, zone pill nav, site-plan pin placer, **unsaved-changes sheet + localStorage draft persistence**
  - `/audits/[id]/summary` severity stats, by-category breakdown, zone-by-zone findings
- ✅ API routes: `/api/audits`, `/api/audits/[id]` (incl. PATCH to complete), `/api/audits/[id]/zones`, `/api/zones/[id]`, `/api/findings`, `/api/findings/[id]`, `/api/audit-photos` (Vercel Blob), `/api/upload` (dev-only — writes to `public/uploads/`), `/api/properties`, `/api/property-systems`, `/api/property-controllers`, `/api/property-zones`, `/api/property-water-sources`, `/api/property-parts`, `/api/property-files`, `/api/monday`, `/api/config`, `/api/onboarding`, `/api/settings`
- ✅ Monday.com property sync (`/api/monday/*`)
- ✅ Google OAuth + Drive + Sheets integration (onboarding Google step + sheet export pipeline)
- ✅ PDF report generation (`src/lib/report-pdf.tsx`, via `@react-pdf/renderer`) — invoked per property system
- ✅ Audit photos on Vercel Blob (`@vercel/blob`, `/api/audit-photos`)
- ✅ Google Sheets export (`src/lib/sheet-export.ts` + route handler) — Summary, All Findings, By Zone, Pricing Summary tabs with formatting
- ✅ Unit tests (Vitest) — `src/lib/finding-draft.test.ts`, `src/lib/bot-ua.test.ts`, `src/__tests__/nav-links.test.ts`, plus `src/lib/offline/*.test.ts` for the offline layer
- ✅ **Offline Phase 1** — service worker via `@serwist/next`, IndexedDB via Dexie, offline indicator in AppHeader, "Download for offline" button on property detail, "Offline ready" badge on property cards, localStorage→IndexedDB draft migration. See `OFFLINE.md`.
- ✅ **Finding location pins** — real-world lat/lng on findings. Satellite-map "Drop pin" modal online, GPS capture sheet offline (killer UX — standing on the defect = one-tap accurate coords). Static-maps thumbnail proxy for per-finding row previews. See the Key decisions entry above for the data model + env vars.

## What's NOT built

- Price sync back from sheets (estimator → auditor read-back of unit costs)
- Edit existing finding (only add + delete in v1 — tap-to-edit is a TODO)
- Offline write-side queue (Phase 2 — mutations offline still fail today; read-only offline works via Phase 1)
- Photo caching offline (Phase 3)
- Playwright e2e coverage for the audit flow (ticket filed in `TODO.md` — add it if you touch the audit flow)
- In-app push notifications for price-back events

See `prompts/initial-prompt.md` step-by-step for the full historical plan.

## Out of scope for Claude (without explicit ask)

- Don't touch `reference/` — read-only ground truth.
- Don't touch `junk/` — deprecated Python template, kept for paranoia.
- Don't add new top-level dependencies (auth libs, PDF libs, state libs, etc.) without flagging the choice first.
