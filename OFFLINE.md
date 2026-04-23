# Offline Support

Status as of Phase 1 (shipped on branch `feat/offline-phase-1`).

This app is built for field work — iPads and phones in neighborhoods
where signal drops. The offline layer lands in phases so we can ship
risk-managed slices:

| Phase | Scope | Status |
|------|------|--------|
| 1 | Read-side: service worker, IndexedDB, offline indicator, Download for offline | **Shipped** (this branch) |
| 2 | Write-side: mutation queue, conflict resolution, per-finding sync badges | Not started |
| 3 | Photo caching, auth-token expiry handling, background sync on reconnect | Not started |

## What works offline today (Phase 1)

- **App shell loads.** Navigating to `/`, `/properties/[id]`, and any
  page you've visited while online returns the cached HTML even with
  no signal. Static JS/CSS/fonts/icons are cache-first with long TTL.
  See `src/app/sw.ts`.
- **Download for offline.** On each property detail page there's a
  "Download for offline use" button in the header card. Tapping it
  fetches `GET /api/properties/[id]/offline-bundle` and writes every
  row the auditor needs (audits, zones, findings, taxonomy) into
  IndexedDB via Dexie. See `src/lib/offline/sync.ts`.
- **Offline indicator.** An online/offline pill lives in the app
  header. Always visible on mobile; desktop only shows it when
  offline. Tapping opens a bottom sheet with status details. See
  `src/components/offline-indicator.tsx`.
- **Offline-ready badge.** Property cards show a small "Offline"
  chip when an offline copy exists in IndexedDB for that property.
  The chip updates reactively via `useLiveQuery`.
- **In-progress finding drafts.** Zone-level drafts from Issue 1 now
  live in IndexedDB (table: `drafts`, keyed `audit:zone`). Any
  localStorage drafts from a pre-Phase-1 build are migrated once on
  app load — see `src/lib/offline/migrate.ts`.
- **GPS pin capture works offline.** When the auditor taps "Drop pin"
  on a finding and the device has no signal, the satellite modal is
  skipped and a GPS capture sheet opens directly. `navigator.geolocation`
  doesn't need the network — only the satellite tiles do. Captured
  coords (`pinSource: "gps"`) are written to the draft, which is
  already auto-persisted to IndexedDB via Phase 1's draft layer. See
  `src/lib/hooks/use-geolocation.ts` and
  `src/components/map/gps-capture-sheet.tsx`.

## What's NOT offline yet

- **Mutations offline.** If you're offline and create a finding, the
  `/api/findings` POST will fail. The draft stays in IndexedDB so you
  don't lose work, but the finding isn't committed to the server
  until you're back online and save it manually. Phase 2 will queue
  POST/PATCH/DELETE and replay on reconnect.
- **Photos offline.** Image uploads need network and Vercel Blob.
  The Download bundle skips photos. Phase 3 adds a local image cache.
- **Satellite pin placement offline.** The satellite modal streams
  live tiles from Google and can't work offline. Offline, tapping
  "Drop pin" routes straight to the GPS sheet (see above). Once
  back online, the tech can use the satellite view normally.
- **Per-finding pin thumbnails offline.** The thumbnails served from
  `/api/maps/static-thumbnail` need network (and the 7-day CDN cache
  only covers previously-viewed thumbnails). Offline, finding rows
  fall back to a text-only `📍 GPS` / `📍 Map` pill so the auditor
  still knows which findings are pinned.
- **Fresh reads from IndexedDB when offline.** Pages that you haven't
  visited online and haven't downloaded will fail to load when
  offline — the service worker has nothing to serve. The spec flagged
  a reactive IndexedDB read path as Phase 1 scope; it was descoped
  because it implies rewriting server-rendered pages as client
  components. Phase 2 revisits alongside the write queue.
- **Authentication when offline.** Session JWTs stay valid for 7
  days, so a tech who signs in at the yard before driving out will
  stay authenticated all day. But if the cookie expires while
  offline, navigation redirects to `/login` and they can't get back
  in until signal returns. Phase 3 adds a gentler expired-while-
  offline UX.

## How to debug

### Check service worker registration

1. DevTools → Application → Service Workers.
2. Should see one registration at scope `/` pointing at
   `https://<your-domain>/sw.js` (or `http://localhost:3000/sw.js`
   on a local prod build — the SW is disabled in `next dev`).
3. Status should be "activated and is running". If it's "redundant"
   or the worker is missing, reload once to let the updated SW take
   over (we set `skipWaiting` + `clientsClaim`).

### Check IndexedDB state

1. DevTools → Application → IndexedDB → `irrigation-audit-offline`.
2. You should see 8 object stores: `properties`, `audits`, `zones`,
   `findings`, `quickPickFindings`, `componentTypes`,
   `severityLevels`, `drafts`.
3. Tap "Download for offline use" on a property detail page, then
   inspect the `properties` store — your property row should appear
   with `downloadedAt` set.
4. In the `drafts` store, any in-progress finding is keyed
   `<auditId>:<zoneId>`.

### Simulate offline in DevTools

1. DevTools → Network → Throttling → **Offline**. (Chromium-based
   browsers; Safari's "Develop → Enter Responsive Design Mode"
   has an equivalent toggle.)
2. The offline indicator in the header should flip to red "Offline"
   within a few seconds.
3. Reload the current page — the service worker should serve the
   cached HTML.
4. Navigate to a property you've downloaded — content renders from
   the SW cache.
5. Turn Network back to Online — indicator goes green.

### Reset offline state

If something looks wrong on a device, nuke the offline state and try
again:

1. DevTools → Application → Storage → **Clear site data**.
2. Reload the page.
3. Log back in; Downloads start from scratch.

### Verify the SW build locally

`next dev` disables the service worker (via `disable:
process.env.NODE_ENV !== "production"` in `next.config.ts`) so HMR
isn't poisoned by cache-first behavior. To exercise the SW locally:

```bash
npm run build    # prod build, emits public/sw.js
npm run start    # serves the prod build on :3000
```

Then load `http://localhost:3000` and check
`Application → Service Workers`.

### Check migration logs

Open the console on first load after this branch deploys. Migration
emits:

```
[offline] migrated draft from localStorage: audit-draft:<audit>:<zone>
[offline] migrated N drafts to IndexedDB
```

If a draft fails to migrate you'll see
`[offline] failed to migrate draft: <key> <error>`. Migration errors
don't block the app — the auditor can keep working; worst case a
single stale draft stays in localStorage and the next load tries
again.

## Build gotchas

- **Turbopack.** `@serwist/next` doesn't support Next 16's default
  Turbopack production builds. Our `build` script passes `--webpack`
  explicitly. `next dev` stays on Turbopack (SW disabled anyway).
- **`public/sw.js` is generated.** It's in `.gitignore` along with
  `swe-worker-*.js`. Don't commit it.
- **Service worker updates need a full reload.** `skipWaiting` +
  `clientsClaim` let a new SW take over immediately, but open tabs
  that are already running the old SW will keep running it until
  next navigation.

## Testing

Unit tests use `fake-indexeddb` to exercise the Dexie layer:

```bash
npm test                 # one-shot
npm run test:watch       # watch mode
```

Covered: schema contract, CRUD, draft migration, bundle writes,
fetch flow error handling. See `src/lib/offline/*.test.ts` and
`src/lib/finding-draft.test.ts`.

End-to-end coverage (real browser, real Vercel build) is a
[TODO.md](TODO.md) item — Playwright harness is deferred until the
feature surface stabilizes.
