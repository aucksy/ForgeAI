# ForgeAI — Owner Dashboard (Phase 2)

A small **read-only** web dashboard for gym owners: members, last-active, at-risk,
and a streak leaderboard. Vite + React + TypeScript SPA; the browser talks to
Supabase directly with **owner auth** (RLS scopes every read to the owner's own gym).
It reuses the mobile app's theme so it reads as the same product.

> **Self-contained, by design.** This app lives at `apps/dashboard` but is NOT wired
> into a workspace yet and touches **zero** mobile files — the offline mobile demo is
> unaffected. Extracting a shared `packages/theme` and doing the full pnpm-monorepo
> move (`apps/mobile`) is a later, separate step (see `docs/PLAN.md` Phase 2 notes).

## What it shows
- **KPIs:** total members, active this week, at-risk count, best current streak.
- **Members table:** name, last active, current streak, workouts 7d/30d, weight.
- **At risk:** members with no activity for ≥ 7 days (or who never synced).
- **Streak leaders:** top 5 by current streak.
- Members appear once they've synced at least once (the phone pushes a one-row
  `member_summary`; this app never reads raw history — one-way push, summary only).

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

## Deploy — Cloudflare Pages (free, commercial-OK)
- **Framework preset:** Vite (or None).
- **Root directory:** `apps/dashboard`
- **Build command:** `npm install && npm run build`
- **Build output directory:** `dist`
- Path-filter the project to `apps/dashboard/**` so a mobile-only commit doesn't
  rebuild the dashboard.
- Add an SPA fallback so deep links resolve: a `public/_redirects` with
  `/*  /index.html  200` (add if/when client-side routing is introduced).

## Security notes
- Reads are RLS-scoped: an owner sees only their gym's `member_summary`
  (`summary_staff_read` policy), and only their own `gyms` row.
- This is **read-only** for member data. The only write is the owner's own
  `create_gym` onboarding RPC.
