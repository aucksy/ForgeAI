# ForgeAI — admin app (gym owner and staff)

The web app the gym runs on: members, plans, renewals, dues, receipts (GST 5%, financial-year
numbers), visits and QR check-in, staff sign-in by mobile + 6-digit code, roles (owner / staff /
trainer), shop, gym workout plans, Excel import. Vite + React + TypeScript; talks to Supabase
directly (row-level security per gym). Live at forgeai.aakashpahuja.in, served by the Cloudflare
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
   → you get a **join code** to share. Members enter that code in the ForgeAI app.
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
Then open https://forgeai.aakashpahuja.in, sign in, and check the response has the
`Content-Security-Policy` header. Write the new version id into docs/uat/STATUS.md.

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
