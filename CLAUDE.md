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
| Auth | Custom JWT + email magic-link (planned, not built) |
| External | Monday.com GraphQL API, Google OAuth + Sheets + Drive (planned) |
| Deploy | Vercel (planned) |

## Repo layout

```
src/
  app/                # Next.js App Router pages, layouts, route handlers
  components/ui/      # shadcn-generated components
  lib/db.ts           # Prisma client singleton (uses pg adapter)
prisma/
  schema.prisma       # Data model — see §"Data model" below
  seed.ts             # Idempotent global reference seed (run via `npm run db:seed`)
prisma.config.ts      # Prisma 7 datasource + migrations adapter config
.env                  # DATABASE_URL + DIRECT_URL (gitignored)
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

# Dev server
npm run dev

# Open Prisma Studio to inspect Neon directly
npm run db:studio
```

## Data model (see prisma/schema.prisma + REFERENCE_NOTES.md)

Hierarchy: **Org → Property → Audit → AuditSystem → AuditZone → AuditFinding**.

Critical: a property has **1..N irrigation systems**, each with its own controller and zones. The `audit_systems` table is non-negotiable — system-level findings (mainline break, controller dead, backflow status) attach to a system, not a zone. `audit_findings.zone_id` is nullable for that reason; `system_id` is always set.

Multi-tenant scoping: every primary table (`properties`, `audits`, `users`, etc.) carries `org_id`. Reference tables (`component_types`, `quick_pick_findings`) use `org_id = NULL` for global defaults; orgs can add their own overrides on top.

Severity defaults are seeded per `IssueType` (REFERENCE_NOTES.md §3) and overridable per finding. There's no real scoring rubric in the reference material — when scoring lands in a report, it'll be a derived count-weighted score, not from any external source.

UOM quirk: drip tubing and field wire use `sf` (square feet) even though they're linear. **Preserve this** — it matches the reports Tyler's team already uses.

## Key decisions / gotchas

- **Neon is the source of truth.** Every audit write goes to Neon FIRST. Monday.com and Google Sheets sync are async background jobs. If those services are down, the field audit must continue uninterrupted.
- **Prisma 7 schema doesn't hold the URL.** `prisma.config.ts` has `datasource.url` (for `db push`/`migrate`) AND `migrations.adapter`. The runtime client constructs `PrismaClient` with `new PrismaPg({ connectionString: process.env.DATABASE_URL })`.
- **`.env` not `.env.local`** is the file Prisma reads. Both are in `.gitignore`. We keep DB URLs in `.env` so both Next.js and Prisma pick them up.
- **`tsx` for scripts** — when running standalone scripts that use Prisma, use `tsx --env-file=.env <script>` so the env loads.
- **Reference seed is wipe-and-reseed for `org_id = NULL` rows.** Prisma can't `upsert` against a unique key with a nullable column. The `deleteMany({ where: { orgId: null } })` + `create` pattern is intentional.
- **Quick-picks come from the Austin Oaks paper form** (REFERENCE_NOTES.md §7). Each is a one-tap shortcut pre-mapped to (issue, component, solution, severity, UOM).
- **No git repo yet.** The Next.js scaffold tried to init one but I excluded it during the move so the existing files (REFERENCE_NOTES.md, reference/, etc.) wouldn't be hidden by an auto-commit. `git init` is a deliberate next step.
- **`pg` SSL deprecation warning** — current pg version warns that `sslmode=require` will change semantics in v3.0.0/v9.0.0. Either pin pg or update the connection string to `sslmode=verify-full` before the bump. Tracking but not urgent.

## Active branch / worktree notes

- No git yet (see above).
- Future feature work: worktrees under `~/worktrees/irrigation-audit-<feature>` per Tommy's standard pattern.

## What's built (as of 2026-04-09)

- ✅ Reference catalog (`REFERENCE_NOTES.md`)
- ✅ Next.js 16 + TS + Tailwind v4 + shadcn/ui (base-nova) scaffold
- ✅ Prisma 7 + `@prisma/adapter-pg` wired to Neon
- ✅ Full schema pushed to Neon (orgs, users, properties, audits, audit_systems, audit_zones, audit_findings, audit_scores, component_types, quick_pick_findings)
- ✅ Reference seed (18 component types, 31 quick-picks)
- ✅ Demo seed (`npm run db:seed:demo`) — Strata Landscape org + Tyler Demo user + 3 properties
- ✅ Dev auth stub (`src/lib/auth-dev.ts`) — hardcodes the current user. Search for `auth-dev` / `DEV-ONLY` to find every caller before shipping.
- ✅ Mobile-first audit flow (Milestone D):
  - `/` dashboard with property cards
  - `/properties/[id]` property detail + audit history
  - `/audits/new?propertyId=…` confirm + (optional) copy zones from last audit
  - `/audits/[id]` audit hub: zone list + inline add-zone form + complete audit
  - `/audits/[id]/zones/[id]` THE BIG ONE — quick-pick chips, custom finding wizard, severity buttons, quantity stepper, photo upload, optimistic finding list, zone pill nav
  - `/audits/[id]/summary` severity stats, by-category breakdown, zone-by-zone findings
- ✅ API routes: `/api/audits`, `/api/audits/[id]`, `/api/audits/[id]/zones`, `/api/zones/[id]`, `/api/findings`, `/api/findings/[id]`, `/api/upload` (dev-only — writes to `public/uploads/`)

## What's NOT built

- Auth (magic-link / JWT)  ← currently stubbed via `auth-dev.ts`
- Onboarding wizard (Monday API key, Google OAuth, branding)
- Property sync from Monday.com
- Multi-system UI (audit hub assumes one system per audit; system layer exists in schema)
- Edit existing finding (only add + delete in v1)
- Photo upload on Vercel — `/api/upload` writes to disk, won't work in prod. Swap for Vercel Blob.
- Google Sheets sync
- Price sync back from sheets
- PDF report generation
- Settings / admin
- Offline support (service worker + IndexedDB queue)

See `prompts/initial-prompt.md` step-by-step for the full plan.

## Out of scope for Claude (without explicit ask)

- Don't touch `reference/` — read-only ground truth.
- Don't touch `junk/` — deprecated Python template, kept for paranoia.
- Don't `git init` or commit anything without being asked.
- Don't add new top-level dependencies (auth libs, PDF libs, etc.) without flagging the choice first.
