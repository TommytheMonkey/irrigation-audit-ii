# TODO

Queue of follow-ups that are too big for a drive-by commit but shouldn't
fall off the radar. Append-only; delete an entry when it's done.

## Testing

- **Add Playwright + e2e coverage for audit flow.** Current coverage is
  unit-only (Vitest). The launch-readiness fixes (unsaved-changes guard,
  draft restore on reload, magic-link flow) are manually verified but
  not exercised end-to-end. Setup is non-trivial: install Playwright,
  add a seed/teardown harness against a scratch Neon DB (or mocked
  Prisma), add a CI job. Priority once the current feature surface
  stops churning.

## Core features (see CLAUDE.md §"What's NOT built")

- Price sync back from sheets (estimator → auditor read-back).
- Edit existing finding (currently add + delete only).
- Offline support (service worker + IndexedDB queue).
- In-app notifications when pricing lands.

## Nits

- `pg` SSL deprecation — pin or switch connection string before pg v9.
