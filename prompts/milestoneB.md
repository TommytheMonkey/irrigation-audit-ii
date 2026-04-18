# Milestone B: Auth + Onboarding Wizard

## Context

We have three milestones built on a dev auth stub (`src/lib/auth-dev.ts`) that hardcodes
Tyler as the logged-in user. That stub needs to die. This milestone replaces it with real
authentication and adds the onboarding wizard that new orgs go through on first signup.

Read CLAUDE.md, REFERENCE_NOTES.md, and the current prisma/schema.prisma before starting.
Familiarize yourself with every file that imports from `auth-dev.ts` — those are all the
callsites you need to migrate.

### What's already built:
- Neon DB with 11+ tables, multi-tenant via org_id
- Dashboard, property detail, audit history pages
- Full audit flow: setup → zones → finding entry → summary
- Config system: initialize/sync/reset with mock JSON backend, org-scoped reference data
- Settings page with config card
- `auth-dev.ts` exporting `getCurrentUser()` — returns hardcoded Tyler + Strata org
- Demo seed: `npm run db:seed:demo` creates Strata Landscape org, Tyler user, 3 properties

### What this milestone delivers:
1. Magic-link email auth (signup + login)
2. JWT session management (httpOnly cookies)
3. Domain-based org matching (same email domain = same org)
4. Onboarding wizard for new org admins
5. All existing pages migrated off the dev stub
6. Protected routes via middleware

---

## 1. Auth System

### Magic Link Flow:
1. User visits `/login` (or `/signup` — same page, the flow handles both)
2. Enters their email address
3. App sends a magic link to that email containing a signed, time-limited token
4. User clicks the link → hits `/api/auth/verify?token=xxx`
5. Server verifies the token, creates or finds the user, issues a JWT session cookie
6. Redirect to dashboard (or onboarding if new org)

### Email Sending:
For dev/local, use one of these approaches (pick whichever is simplest to get working):
- **Console logging**: Just log the magic link URL to the server console. The developer
  clicks it manually. This is the fastest to build and perfectly fine for local dev.
- **Resend**: If you want real emails working immediately, use Resend (free tier, 100 emails/day).
  Add `RESEND_API_KEY` to `.env`. But don't block on this — console logging is fine for now.

The magic link token should:
- Be a JWT or signed string containing the email + expiration
- Expire after 15 minutes
- Be single-use (track used tokens in a `magic_tokens` table or just check if the
  timestamp is newer than the user's last login)

### JWT Session:
- On successful verification, issue a JWT containing: `userId`, `orgId`, `email`, `role`
- Store in an `httpOnly`, `secure` (in prod), `sameSite: lax` cookie named `session`
- JWT expires after 7 days
- Sign with a `JWT_SECRET` env var (generate a random one for dev, add to `.env`)
- Create a `src/lib/auth.ts` that exports:
  - `getCurrentUser()` — reads the cookie, verifies JWT, returns user object or null
  - `requireAuth()` — same as above but throws/redirects if not authenticated
  - `requireAdmin()` — same but also checks role === 'ADMIN'

### User + Org Resolution:
When a magic link is verified:

1. Look up the user by email in the `users` table
2. **If user exists**: Issue JWT, redirect to `/` (dashboard)
3. **If user doesn't exist**:
   a. Extract the email domain (everything after @)
   b. Look up an org with that `emailDomain`
   c. **If org exists**: Create the user with role `AUDITOR` under that org. Issue JWT,
      redirect to `/` (they join the existing org automatically)
   d. **If no org exists**: Create the user with role `ADMIN` and a placeholder org
      (just the email domain as name). Issue JWT, redirect to `/onboarding` (they need
      to set up their org)

### Schema Changes:
Add to the `users` table if not already present:
```
lastLoginAt   DateTime?
```

Add a table for tracking magic link tokens (optional — you can also just use JWT expiry):
```
model MagicToken {
  id        String   @id @default(cuid())
  email     String
  token     String   @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
}
```

Ensure the `orgs` table has:
```
emailDomain  String   @unique
```

Ensure the `users` table has `role` as an enum: `ADMIN`, `AUDITOR`, `ESTIMATOR`

### Middleware:
Create `src/middleware.ts` (Next.js middleware) that:
- Runs on all routes EXCEPT `/login`, `/api/auth/*`, `/_next/*`, `/favicon.ico`
- Checks for a valid `session` cookie with a non-expired JWT
- If invalid/missing → redirect to `/login`
- If valid → continue (the route can call `getCurrentUser()` to get user details)

---

## 2. Login Page

Route: `/login`

Clean, centered layout. Mobile-friendly.
- App name/logo at top (or just "Irrigation Audit" text for now)
- "Sign in with your email" heading
- Email input field (large, 44px+ height)
- "Send Magic Link" button
- After submission: success state showing "Check your email for a sign-in link"
  with the email address displayed and a "Try a different email" link
- If running in dev mode and using console logging, show a small dev-only banner:
  "Dev mode: check your terminal for the magic link"

No password fields. No social login (Google OAuth is for Drive/Sheets access, not auth).
Keep it dead simple.

---

## 3. Onboarding Wizard

Route: `/onboarding`

Only accessible to users whose org is in a "needs setup" state. Check for this by looking
at whether the org has a `name` set (not just the email domain placeholder), or add an
`onboardingComplete` boolean to the org.

Multi-step wizard with a progress indicator. Each step saves independently so the user
can come back and finish later. Steps:

### Step 1: Company Info
- Company name (text input, pre-filled with email domain titlecased)
- "Continue" button
- Saves to `orgs.name`

### Step 2: Monday.com Integration
- Explanation text: "Connect your Monday.com board to sync your maintenance properties"
- Monday API Key input (password-type field, masked)
- Monday Board ID input (text field)
- "Test Connection" button → calls Monday GraphQL API to fetch the board name
  - Success: shows board name in a green success banner, enables "Continue"
  - Failure: shows error message in red, keeps "Continue" disabled
- "Skip for now" link (saves nothing, moves to next step)
- On save: encrypt the API key before storing in `orgs.mondayApiKey`
  Use a simple encryption approach — AES-256-GCM with a key from env var `ENCRYPTION_KEY`.
  Create `src/lib/encryption.ts` with `encrypt(plaintext)` and `decrypt(ciphertext)` helpers.

### Step 3: Branding (Optional)
- Primary logo upload (drag-and-drop zone or click-to-upload, max 2MB, image/* only)
- Secondary logo upload (same)
- Primary brand color picker (hex input + color swatch preview, default: neutral)
- Secondary brand color picker (same)
- Font selector dropdown: Inter (default), Roboto, Montserrat, Open Sans, Lato, Poppins,
  Merriweather, Source Sans Pro
- Live preview panel showing how the report header would look with current selections
- "Skip for now" / "Continue" buttons
- Saves to `orgs.primaryLogoUrl`, `orgs.secondaryLogoUrl`, `orgs.brandColorPrimary`,
  `orgs.brandColorSecondary`, `orgs.fontFamily`

### Step 4: Google Integration
- Explanation: "Connect your Google account to export audit reports to Google Sheets
  and store them in Google Drive"
- "Connect Google Account" button → initiates Google OAuth 2.0 flow
  - Request scopes: `https://www.googleapis.com/auth/spreadsheets`,
    `https://www.googleapis.com/auth/drive.file`
  - On success: show green checkmark + connected Google account email
- Shared Drive / Folder ID input: "Paste the ID of the Google Drive folder or Shared Drive
  where reports should be saved"
  - Helper text: "You can find this in the URL when you open the folder in Google Drive"
  - "Test Access" button → tries to list the folder contents via Drive API
  - Success: shows folder name, enables Continue
  - Failure: shows error, suggests checking permissions
- "Skip for now" link
- Saves: encrypted Google refresh token to `orgs.googleRefreshToken`, folder ID to
  `orgs.googleDriveFolderId`

### Step 5: Done
- Summary of what's configured (checkmarks for completed steps, "not configured" for skipped)
- "Go to Dashboard" button → marks `orgs.onboardingComplete = true`, redirects to `/`
- "Edit Settings" link → goes to `/settings`

### Google OAuth Implementation:
- Create `/api/auth/google` — redirects to Google OAuth consent screen
- Create `/api/auth/google/callback` — handles the OAuth callback:
  1. Exchanges the authorization code for access + refresh tokens
  2. Encrypts and stores the refresh token in the org record
  3. Stores the connected Google email for display
  4. Redirects back to `/onboarding?step=4&google=success`
- Store OAuth client credentials in env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- The redirect URI will be `{APP_URL}/api/auth/google/callback`
- Create a `src/lib/google.ts` helper that:
  - Gets a fresh access token from a stored refresh token
  - Provides authenticated Google Sheets and Drive API clients
  - Handles token refresh automatically
  - This helper will be used by Milestone E (Sheets export) and the real config sheet sync

---

## 4. Migrate All Existing Pages

This is critical. Every file that imports from `auth-dev.ts` needs to be updated:

1. **Find all imports**: `grep -r "auth-dev" src/` — get the full list
2. **Replace each import** with the new `auth.ts` module
3. **Update each callsite**:
   - Server components: use `requireAuth()` at the top (it reads the cookie server-side)
   - API routes: use `getCurrentUser()` and return 401 if null
   - Client components that need user info: receive it as props from a server component parent
4. **Delete `src/lib/auth-dev.ts`** when all references are gone
5. **Verify**: `grep -r "auth-dev" src/` should return nothing

The demo seed (`seed-demo.ts`) should still work — it creates Tyler's user directly in the DB.
For local dev testing after auth is wired up, you can either:
- Use the magic link flow (click the link from the console log)
- Add a `DEV_AUTO_LOGIN` env var that, when set to an email address, skips the magic link
  and creates a session cookie automatically on visiting `/login`. This is useful for
  fast iteration. Guard it behind `NODE_ENV === 'development'`.

---

## 5. Settings Page Updates

The settings page (`/settings`) already exists with the config card. Add:

### Company tab:
- Edit company name
- Edit/upload logos (same UI as onboarding step 3)
- Edit brand colors and font
- Save button

### Integrations tab:
- Monday.com card: shows connection status, board name if connected. "Update" button
  to change API key / board ID. "Test Connection" button. "Sync Properties" button
  (placeholder — actual sync is Milestone C1).
- Google card: shows connected account email or "Not connected". "Connect" / "Reconnect"
  button (triggers the same OAuth flow). Shared Drive folder ID field with "Test" button.

### Users tab:
- List of users in the org (name, email, role, last login)
- "Invite User" button → email input → sends a magic link to that email with a note
  that they've been invited to {org name}. When they click it, the domain-matching
  logic adds them to the org automatically.
- Role selector dropdown for each user (Admin can change roles of others)
- Admin cannot demote themselves if they're the only admin

### Config tab:
- Already built in C2 — the config card with init/sync/reset. Just make sure it's
  in a tab alongside the new ones.

---

## 6. API Routes

```
POST   /api/auth/magic-link     — sends magic link email
GET    /api/auth/verify          — verifies magic link token, sets session cookie
POST   /api/auth/logout          — clears session cookie
GET    /api/auth/me              — returns current user (for client-side checks)
GET    /api/auth/google          — initiates Google OAuth
GET    /api/auth/google/callback — handles Google OAuth callback
POST   /api/settings/company     — update org name, colors, font
POST   /api/settings/monday      — update Monday API key + board ID (encrypted)
POST   /api/settings/google      — update Google Drive folder ID
GET    /api/settings/users       — list org users
POST   /api/settings/users/invite — send invite magic link
PATCH  /api/settings/users/[userId] — update user role
POST   /api/upload               — (already exists) logo uploads
```

---

## 7. Environment Variables

Add these to `.env` and `.env.example`:
```
JWT_SECRET=           # random 64-char string for signing JWTs
ENCRYPTION_KEY=       # random 32-byte hex string for AES-256-GCM
RESEND_API_KEY=       # optional, for real email sending
GOOGLE_CLIENT_ID=     # Google OAuth client ID
GOOGLE_CLIENT_SECRET= # Google OAuth client secret
APP_URL=http://localhost:3000  # base URL for magic links and OAuth callbacks
```

Generate sensible random defaults for JWT_SECRET and ENCRYPTION_KEY in the `.env` file
so the app works immediately after checkout. Add a comment that these should be rotated
for production.

---

## 8. Technical Requirements

- Use `jose` npm package for JWT signing/verification (works in Edge runtime, unlike `jsonwebtoken`)
- Use Node.js built-in `crypto` for AES-256-GCM encryption
- All auth API routes should be in the Node.js runtime (not Edge) since they need crypto
- Magic link emails should be fire-and-forget (don't block the response on email delivery)
- The login page and onboarding wizard must work on mobile (44px+ tap targets, responsive layout)
- Onboarding wizard state should be URL-driven (`/onboarding?step=2`) so browser back works
- Each onboarding step should show a step indicator (1 of 5, with step names)

---

## 9. Do NOT build yet
- Monday.com property sync (that's Milestone C1 — just test the connection here)
- Google Sheets export (Milestone E — just wire up OAuth and the Drive folder test here)
- Real config sheet creation via Google Sheets API (the mock JSON backend stays for now;
  when Google OAuth is live, we'll swap config-mock.ts for config-google.ts in a later milestone)
- Offline support
- Email templates (plain text magic links are fine for now)
- Password auth, social login, or any auth method other than magic links
- Rate limiting on magic link sends (fast follow, not MVP)

---

## 10. Build Order

1. Schema changes (MagicToken, emailDomain on Org, onboardingComplete, lastLoginAt) → prisma db push
2. `src/lib/encryption.ts` — encrypt/decrypt helpers
3. `src/lib/auth.ts` — getCurrentUser, requireAuth, requireAdmin, JWT helpers
4. Magic link API routes: `/api/auth/magic-link`, `/api/auth/verify`, `/api/auth/logout`, `/api/auth/me`
5. Login page (`/login`)
6. Next.js middleware for route protection
7. Migrate ALL existing pages and API routes off `auth-dev.ts` → delete the stub
8. Google OAuth routes: `/api/auth/google`, `/api/auth/google/callback`
9. `src/lib/google.ts` — token refresh + API client helpers
10. Onboarding wizard (`/onboarding`) — all 5 steps
11. Settings page updates — company, integrations, users tabs
12. Settings API routes
13. Test the full flow: fresh signup → onboarding → dashboard → audit → settings
14. Test domain matching: second user with same domain joins existing org
15. Commit: "feat: auth + onboarding wizard — magic links, JWT, Google OAuth, settings"