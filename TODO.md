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

## Fast-follows

- **Audit-level map view.** Show all pinned findings for an audit on
  one satellite map — lets the crew or PM scan damage distribution at
  a glance. Data model supports it today (every finding with a pin
  has lat/lng + severity); we skipped building the view in the
  map-pins pass so Tyler could try the pin-drop flow first and shape
  the overview around real field usage instead of assumptions.
- **Edit a pin after save.** v1 is add/delete only — to change a
  saved finding's pin, the tech deletes and recreates. If that's
  painful, add an "Edit pin" affordance on the finding row that
  PATCHes `pinLat/Lng/Source/PlacedAt` and busts the static-maps
  thumbnail cache with `&v=<pinPlacedAt>`.
- **Component-level UI tests for the pin flow.** The unit layer
  covers `useGeolocation` + the thumbnail proxy; the integration
  spots ("Save writes all four fields", "Remove clears them",
  "pinSource differentiates") are exercised manually for now.
  Needs Testing Library + a finding form harness.

## Core features (see CLAUDE.md §"What's NOT built")

- Price sync back from sheets (estimator → auditor read-back).
- Edit existing finding (currently add + delete only).
- Offline support (service worker + IndexedDB queue).
- In-app notifications when pricing lands.

## Nits

- `pg` SSL deprecation — pin or switch connection string before pg v9.
