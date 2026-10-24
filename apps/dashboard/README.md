# MettleUp for Gyms — admin app (gym owner and staff)

The web app the gym runs on: members, plans, renewals, dues, receipts (GST 5%, financial-year
numbers), visits and QR check-in, staff sign-in by mobile + 6-digit code, roles (owner / staff /
trainer), shop, gym workout plans, Excel import. Vite + React + TypeScript; talks to Supabase
directly (row-level security per gym). Live at app.mettleup.fit (the old forgeai.aakashpahuja.in
keeps answering for good; the brand was ForgeAI until 24 Oct 2026, R-105), served by the Cloudflare
Worker in `deploy/panel` (`npx wrangler deploy` after a checked build: `npx tsc -b`,
`npx vitest run`, `npm run build`). Journeys: `apps/dashboard/e2e` (Playwright).
(Rewritten 19 Oct 2026: the old text described a read-only Phase 2 dashboard on Cloudflare Pages.)

## Run locally
```bash
cd apps/dashboard
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build  → dist/
npm run typecheck  # tsc -b
```

## Config
By default it uses the beta project's **publishable** key (RLS-guarded, safe to ship —
the same key that ships in the mobile `app.json`). Override per environment with a
`.env` (see `.env.example`):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```
The **service-role/secret key is never used here.**

## Owner onboarding (how an owner gets data)
An owner needs a `profiles` row with `role='owner'` + a `gym_id`. Two paths:

1. **In-app (recommended):** sign up (email + password) → the app shows **"Create your
   gym"** → it calls the `create_gym` RPC (which makes the gym and sets you as owner)
   → you get a **join code** to share. Members enter that code in the MettleUp app.
2. **Adopt the existing test gym (IRON01):** after signing up, run this once in the
   Supabase SQL editor to make your account the owner of the seeded test gym:
   ```sql
   update public.profiles
     set role = 'owner',
         gym_id = (select gym_id from public.gyms where join_code = 'IRON01')
     where id = '<your-auth-user-id>';
   ```
   (Direct DML on `profiles` is RLS-blocked for clients by design — this runs as the
   service role in the SQL editor.)

## Deploy — the `forgeai-panel` Worker (rewritten 21 Oct 2026, launch A6)
The old Cloudflare Pages setup is gone. A checked deploy, in this order (stop at the first failure):
```bash
cd apps/dashboard
npx tsc -b                    # never `npm run build | tail`: a piped failure looks green
npx vitest run
npx playwright test           # every journey runs under the live security policy (J29)
                              # owner's PC: E2E_CHROME="C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
                              # (Playwright's own browser download is broken there: launch errors, not test fails)
npm run build
cd ../../deploy/panel
npx wrangler deploy
```
Then open https://app.mettleup.fit, sign in, and check the response has the
`Content-Security-Policy` header. Write the new version id into docs/uat/STATUS.md.

### The addresses (MettleUp, R-105, 24 Oct 2026; one Worker answers all of them: `deploy/panel/hosts.js`)
| Address | What it shows |
|---|---|
| https://mettleup.fit | the landing page (`public/home/`); any other path goes to app.mettleup.fit, same path |
| www.mettleup.fit, mettleup.in, www.mettleup.in | 301 to https://mettleup.fit, same path |
| https://app.mettleup.fit | the admin app, `/sb` (gym server, stamped `X-Forge-Proxy`), `/j`, `/c`, `/api`, `/start`, legal pages, `/.well-known/assetlinks.json`; `/home` goes to mettleup.fit |
| https://forgeai.aakashpahuja.in | the old address, kept for good: `/sb`, `/j`, `/c`, `/api`, `/join`, `/checkin`, the service worker. `/home` goes to mettleup.fit. The admin app moves each desk to app.mettleup.fit in the browser, only once nothing is waiting to be sent (`src/crm/move/`), carrying the sign-in |

The wrangler var `MOVE` ("on") is the kill switch for the old address: "off" keeps it exactly as it
was (no /home redirect, no desk moves). After a deploy that adds an address, check each one answers:
`curl -sI https://mettleup.fit/`, `https://app.mettleup.fit/`, `https://mettleup.in/start` (301),
`https://app.mettleup.fit/.well-known/assetlinks.json` (both packages).

**Android app links** (`public/.well-known/assetlinks.json`, the same file on every address): both
packages, com.mettleup.app and com.forgeai.app, with the upload key's SHA-256 fingerprint.
TODO (Play internal test): when Play App Signing is on, add the **app signing key** SHA-256 from
Play Console → Test and release → App integrity → App signing to com.mettleup.app's
`sha256_cert_fingerprints` (a second entry in the list), or links will not open the Play copy of
the app. `deploy/panel/hosts.test.mjs` checks the file (update its expected fingerprints too).

### Logo
Logo E "Forged" (picked 24 Oct 2026, #61). The brand set lives in `branding/mettleup/` (colours and
text pairings: `branding/mettleup/BRAND.md`); the web files are copies of `branding/mettleup/web/`,
put in place by `python branding/mettleup/install.py --apply --only dashboard`. Never edit the copies:
| File (apps/dashboard/public/) | Size | Used by |
|---|---|---|
| `favicon.svg`, `favicon.ico` | any, 16-48 | browser tab (admin app, landing page) |
| `brand/icon-192.png` | 192 x 192 | favicon fallback, install manifest |
| `brand/icon-512.png` | 512 x 512 | install manifest (install sheet, splash) |
| `brand/icon-maskable-512.png` | 512 x 512 | install manifest "maskable" (Android cuts it) |
| `brand/apple-touch-icon-180.png` | 180 x 180 | iPhone home screen |
| `brand/og-1200x630.png` | 1200 x 630 | link preview of mettleup.fit (WhatsApp, Google) |
| `brand/mark.svg` | 26 x 26 shown | landing page header, beside the words "MettleUp for Gyms" |
| `brand/wordmark-light.svg`, `brand/wordmark-dark.svg` | vector | spare lockups (not shown yet) |
The admin sign-in page shows the name as text. The old `public/icons/admin-*.png` stay on disk for
pages cached before the change. HQ (`apps/hq/public/`) has its own `favicon.svg` copy.

**Roll back** (a deploy broke the panel): from `deploy/panel`,
`npx wrangler deployments list` shows the versions, newest last; then
`npx wrangler rollback <version-id> -m "why"` puts an older one back in seconds. No rebuild,
no database change. Then fix the cause on `main` and deploy again with the steps above.

## Security notes
- **Security policy** (`public/_headers`): the panel runs only its own scripts and talks only to
  the gym server (Supabase) and Google Fonts. A new outside service (a picture host, a chat widget)
  must be added there, or the browser blocks it; J29 fails on any block. The invite and check-in
  pages (`/join`, `/checkin`) go without it: the Worker writes the gym's name into them as a small
  script, and they hold no sign-in.
- **Privacy and terms pages** come from `scripts/legal_pages.py`; while the contact blanks are
  empty they go to `docs/launch/preview/`, never to `public/`.
- Every read and write is row-level-security scoped to the person's own gym (server tests:
  security, uat_access_matrix).
- **AI import (#47):** "Ask AI to match the columns" calls the Worker's `/api/ai/match-columns`
  (`deploy/panel/aiMatch.js`), never an AI company directly; the keys are Worker secrets
  (`GEMINI_API_KEY`, then `ANTHROPIC_API_KEY` as the fallback) and never reach the browser. Only
  column names and 5 masked example rows are sent; owners only; 20 a gym a day (D1 `ai_usage`).
  Without a key, or on any failure, the owner matches the columns by hand as before.
