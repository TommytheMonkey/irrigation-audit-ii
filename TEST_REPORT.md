# Test Report — Launch-Readiness Pass (2026-04-23)

Fixed five QA findings ahead of the Strata Landscape launch. Each fix
shipped as its own commit so they can be reviewed / reverted independently.

## Summary

| # | Issue | Severity | Status | Commit |
|---|-------|----------|--------|--------|
| 1 | Finding abandonment data loss | 🔴 blocker | ✅ fixed | `fix: guard finding abandonment with draft persistence` |
| 2 | Magic link burned by link-preview crawlers | 🟠 high | ✅ fixed | `fix: stop link previewers from burning magic-link tokens` |
| 3 | `/audits` route 404 | 🟠 high | ✅ closed (not a bug) + regression test added | `test: catch orphan internal nav links` |
| 4 | Complete Audit button lacks visible feedback | 🟡 medium | ✅ fixed | `fix: add confirm + success feedback to Complete Audit` |
| 5 | Mobile dashboard top-heavy | 🟡 medium | ✅ closed (not reproducible) | — |

Test infrastructure: added Vitest for unit tests (`npm test`). Playwright
e2e coverage is a separate ticket (see `TODO.md`).

---

## Issue 1 — Finding abandonment data loss

**Root cause.** Tapping a quick-pick chip opened an inline form, but the
form state lived only in component memory. Tapping "Complete & next →"
advanced the zone and silently discarded whatever had been typed.

**Fix.** Two layers.

1. **Unsaved-changes guard.** When the in-progress draft differs from
   the snapshot taken at chip-tap time, nav buttons ("Complete & next",
   "Done") open a confirm sheet with **Save finding / Discard / Keep
   editing**. `beforeunload` covers tab close + refresh.
2. **Draft persistence.** `src/lib/finding-draft.ts` writes every form
   edit to `localStorage` under `audit-draft:<auditId>:<zoneId>`
   (debounced 300ms). On zone mount we restore and show a subtle toast.
   Drafts are cleared on save/discard and purged wholesale when the
   audit is completed.

**Automated coverage (`src/lib/finding-draft.test.ts`, 15 tests).**
- `draftKey` / `auditDraftPrefix` scoping
- Save/load round-trip, overwrites, corrupt-JSON handling
- Cross-zone and cross-audit isolation
- `listAuditDraftKeys` + `clearAllDraftsForAudit` selective cleanup
- `isDraftDirty` — clean, any-field-change, null current, null initial

**Manual test checklist (PR reviewer: please run on a mobile viewport).**
- [ ] Tap any quick-pick chip → change severity → tap "Complete & next":
  confirm sheet appears, "Save finding" commits the finding and
  advances, "Discard" drops the draft and advances, "Keep editing"
  stays on the zone.
- [ ] Tap a chip, leave it at defaults (don't touch severity/qty/notes/
  photo), tap "Complete & next" → advances without the confirm sheet.
- [ ] Tap a chip, type something in notes, reload the page → returning
  to the zone shows the "Draft restored" toast and form restores.
- [ ] Save a finding → storage entry for that zone is cleared (inspect
  Application → Local Storage in DevTools).
- [ ] Complete the audit → all `audit-draft:<auditId>:*` entries are gone.

---

## Issue 2 — Magic link burned by link-preview crawlers

**Root cause.** The email link pointed directly at
`/api/auth/verify?token=…`, which consumes the single-use token on GET.
Gmail/Slack/iMessage/LinkedIn fetch URLs in messages to render previews
— those GETs burned the token before the user could click, leaving
them with "link expired."

**Fix.** Emails now land on a new `/auth/confirm?token=…` page. That
page is GET-safe (does no token work) and shows a plain HTML form with
a Continue button. Clicking Continue POSTs to `/api/auth/verify`, which
is where the token is actually exchanged. Bots don't execute form
submits, so they never reach the consuming endpoint.

Belt-and-suspenders: the POST endpoint also checks `User-Agent` against
a list of known preview bots (Slackbot, facebookexternalhit,
LinkedInBot, Twitterbot, Googlebot, Bingbot, Discordbot, WhatsApp,
Telegram, …) and returns a no-op 200 if matched, so a misrouted
preview POST can't burn the token either. The GET endpoint is kept as
a 302 → `/auth/confirm` so any already-delivered emails still work.

**Automated coverage (`src/lib/bot-ua.test.ts`, 21 tests).**
- 13 real bot UA strings recognized
- 5 real browser UA strings allowed
- Missing / empty UA treated as bot (safer default)
- Case-insensitive matching

**Manual test checklist.**
- [ ] Request a sign-in link. In a terminal,
  `curl -A "Slackbot-LinkExpanding" -sI <the confirm URL>` — responds 200,
  no DB write to `magic_tokens.usedAt`.
- [ ] `curl -X POST -A "Slackbot" -d "token=<token>" <verify URL>` —
  responds 200 with body `bot_ignored`, token stays unused.
- [ ] Click the real link in a real browser → confirm page → Continue →
  signed in and redirected to `/` or `/onboarding`.

---

## Issue 3 — `/audits` route 404

**Investigation.** No `href`, `router.push`, or `Link` in the repo
targets the bare `/audits` path. QA likely typed it manually. No orphan
links to remove.

**Fix.** No code change; added `src/__tests__/nav-links.test.ts`, a
static-analysis test that walks every `*.tsx`/`*.ts` under `src/app`
and `src/components`, extracts literal `href=` values and
`router.push`/`.replace` targets, and asserts each one resolves to a
real App Router page (accounting for `[param]` and `[...slug]`
segments). A future orphan link fails this test.

---

## Issue 4 — Complete Audit button lacks visible feedback

**Root cause.** The button silently mutated the audit record and
navigated, with no confirmation, no loading state beyond the button
label, and no success toast. On a mobile list view it could read as a
no-op.

**Fix.**
- Tapping now opens a confirmation dialog ("Complete this audit? You
  won't be able to add more findings.")
- If any zone drafts exist in `localStorage` for the audit (per Issue
  1), the dialog surfaces the count as a warning.
- On confirm: "Completing…" state on the button, then a success toast
  + navigation to the summary page. Drafts are purged on success.
- On error: the dialog stays open and a toast appears with a Retry
  action so the user doesn't lose their place.

No analytics/observability layer exists in this repo, so the "log
completion events" bullet is a no-op here — flagged for when that
layer lands.

**Manual test checklist.**
- [ ] Tap Complete Audit → dialog opens; Cancel closes it.
- [ ] Start a finding on a zone, return to the audit, tap Complete
  Audit → dialog shows "you have 1 unsaved finding…" warning.
- [ ] Confirm → success toast, navigate to summary, drafts are cleared
  from storage.
- [ ] Kill the API (offline) and try to complete → error toast with
  Retry; dialog remains; Retry fires the same request again.

---

## Issue 5 — Mobile dashboard top-heavy

**Closed as not reproducible on current build.**

Ticket described a first-property-card y-position >500px at 393×852
caused by a stack of "header + search + filter chips + sync badge +
view toggle." The current dashboard has none of those except the
header and an optional sync banner — no search, no filter chips, no
view toggle.

Static measurement from Tailwind utility values at 393px wide:

| Element | Height |
|---|---|
| `AppHeader` (sticky, `h-14` mobile) | 56px |
| Main `py-8` top padding | 32px |
| Page title block (`text-3xl` h1 + `mt-1` + subtitle) | ~60px |
| `mb-8` between title and content | 32px |
| SyncBanner (when Monday configured) + `mb-6` | ~68px |

Worst case (banner shown): first card ≈ **248px from top** — well
under 500px. No shrinking needed. If the dashboard ever gains the
filters described in the original ticket, re-open.

---

## Out of scope this pass

- Playwright e2e coverage — ticket filed in `TODO.md`.
- Offline support (original Issue 6 — explicitly deferred).
- Changes to the quick-pick finding chip UI — QA flagged it as the
  strongest screen in the app, deliberately untouched.
- The login flow's "check your email" identical-response behavior for
  known/unknown emails is intentional (avoids enumeration); kept as-is.
