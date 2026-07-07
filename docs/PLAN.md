# ForgeAI B2B2C — Build Plan (Phase 0 output)

Source of truth for the offline demo → multi-tenant B2B2C evolution. Follows
`Resources/B2B2C-BUILD.md` (also copied to `docs/B2B2C-BUILD.md`). Non-negotiables:
**offline-first, ONE-WAY push (phone → cloud), no two-way sync, demo stays 100%
offline after every phase.**

## Codebase understanding (what exists today)

- **Expo SDK 56 / RN 0.85 / TS strict** app at repo root (`Codebase/`), shipped
  v0.1.0. `@/*` → `src/*`. Weights kg, `dateISO='YYYY-MM-DD'` local, epoch-ms ts.
- **SQLite is the single source of truth** (`src/db`): `initDb()` opens the DB and
  runs DDL in `_layout.tsx`'s effect, then `ensureSeeded()`. `meta(key,value)` table
  + `getMeta/setMeta` already exist — our identity store. Repos in `src/db/repos/*`
  are CONTRACTS-frozen (do not change signatures).
- **AI seam** (`src/ai`): `orchestrator.sendToCoach` routes by `settings.ai.provider`
  ∈ `anthropic|openai|local`; providers are plain `fetch`; `localCoach` is the
  deterministic offline brain (default provider = `local`). Keys live in SecureStore
  (`src/lib/keys`), never in the settings store.
- **Settings** (`src/store/settingsStore.ts`): zustand + persist to AsyncStorage,
  key `forgeai-settings`. **No network anywhere today** — the app is fully offline.
- **Read-only aggregation already exists**: `services/dashboard.getDashboardData`,
  `services/analytics.getAnalyticsBundle`, `workoutRepo.getStreakDays`,
  nutrition/PR repos. The one-way push can be **derived from these — no repo edits.**

## Cross-cutting architecture decisions (locked for all phases)

1. **`cloudEnabled` = "a member session exists."** Demo mode = no session = **zero
   network**. Every cloud call routes through one guard (`src/cloud/session.ts
   → isCloudActive()`); if false, return early. This is the offline-demo firewall.
2. **Identity lives in `meta`** (`member_id`, `tenant_id`, `gym_code`, `member_name`)
   via the existing `setMeta/getMeta`. **No `user_id`/`tenant_id` on domain tables.**
   The Supabase auth session (a secret) lives in SecureStore, not `meta`.
3. **Push = derived summary upsert, not event replay.** After a log, we recompute the
   member's rolling summary from existing services and **idempotently upsert** one row
   per member to the cloud. Because it's idempotent, we need only a dirty flag
   (`meta.sync_dirty` + `meta.sync_last_pushed_at`) + a connectivity listener — **no
   outbox table, no repo hooks, no domain-schema change.** (An event outbox is a
   Phase 4+ option only if per-session granularity is ever required.)
4. **Supabase URL + anon key ship in `app.json > extra`** (anon key is publishable and
   RLS-guarded). **Service-role key NEVER ships** — Edge Functions / dashboard-server
   only. AI keys move server-side in Phase 3.
5. **Auth is opt-in from Settings**, never a launch gate. The app must open and fully
   work with no account (the sales demo).
6. **New modules only.** Protected (never edit): `src/engine/*`, `src/components/ui/*`,
   `src/components/charts/*`, any CONTRACTS repo signature. Allowed minimal edits:
   `_layout.tsx` (one gated cloud-init call), `settingsStore` (add cloud prefs) or a
   new `cloudStore` — prefer a **new** `src/store/cloudStore.ts` to keep ownership clean.

## Per-phase plan

### Phase 0 — Understand & plan  ✅ (this document)
- **Scope:** read the repo, write this PLAN, stop for approval. No app code.
- **Success:** PLAN covers every phase (scope/files/success/risks); human approves.
- **Deliverables:** `docs/PLAN.md`, `docs/B2B2C-BUILD.md` (copied), PROGRESS note.

### Phase 1 — Cloud foundation (offline stays intact)
- **Goal:** Supabase schema + RLS; member auth; join-gym-by-code; identity in `meta`;
  one-way summary push. Demo still 100% offline.
- **Human provides:** Supabase Project URL + anon key + service-role key
  (`Resources/Supabase/…` already present — I will ask before reading/using).
- **Add (files):**
  - `supabase/migrations/0001_init.sql` — `tenants(id, name, join_code, branding jsonb)`,
    `profiles(id→auth.users, tenant_id, role check owner|trainer|member, name)`,
    `memberships(id, tenant_id, member_id, status, joined_at, renews_at)`,
    `member_summary(member_id pk, tenant_id, last_active, streak_days, workouts_7d,
    weekly_volume_kg, adherence_pct, calories_today, protein_today_g, updated_at)`,
    plus `workout_summary` / `nutrition_summary` / `pr_summary` (member-keyed rollups).
    **RLS on every table: a row is visible only to its `tenant_id` members/staff;**
    a member may upsert only their own summary rows. `join_by_code(code)` RPC.
  - `supabase/README.md` — how to apply migrations + create the first gym.
  - `src/cloud/config.ts` — read URL/anon key from `expo-constants` extra; `isConfigured()`.
  - `src/cloud/client.ts` — `@supabase/supabase-js` + `react-native-url-polyfill`,
    SecureStore session adapter.
  - `src/cloud/session.ts` — `isCloudActive()`, `getIdentity()` (from `meta`),
    `signInMember()`, `joinGymByCode()`, `signOut()`; writes identity to `meta`.
  - `src/cloud/pushSummary.ts` — `markDirty()`, `pushIfDirty()` (debounced, retried),
    derives the summary from `services/dashboard` + `services/analytics` (read-only).
  - `src/cloud/connectivity.ts` — `expo-network` reachability → drains on reconnect.
  - `src/store/cloudStore.ts` — `{ status, identity, gymName, signIn, join, signOut }`.
  - `src/app/(auth)/join.tsx` + `src/components/cloud/*` — join-by-code + sign-in UI
    (reuses `components/ui`, adds nothing to protected dirs).
  - `src/components/settings/CloudCard.tsx` — "Connect to your gym" entry in Settings.
  - Consent copy on join (DPDP 2023): what syncs, why, and a "disconnect & delete".
- **Edit (minimal):** `_layout.tsx` (gated `restoreSession()` + foreground `pushIfDirty()`);
  `app.json` (extra: supabase url/anon key, `expo-network`); add deps
  (`@supabase/supabase-js`, `react-native-url-polyfill`, `expo-network`).
- **Push triggers (no repo edits):** after `chatStore.send` resolves, after a body-weight
  log, after `resetDemoData`, and on app foreground → `markDirty()` then `pushIfDirty()`.
- **Success:** with an account, a member's summary appears in Supabase and updates
  after a log; RLS verified (gym A cannot read gym B); **with no account, the app makes
  zero network calls and every offline feature works.** `npm run typecheck` green.
- **Risks:** supabase-js RN polyfills; RLS mistakes (test with two gyms); summary schema
  churn (keep it additive); make sure `isCloudActive()` guards every call path.
- **Shippable checkpoint** (tag-ready).

### Phase 2 — Owner dashboard (read-only)
- **Goal:** the artifact that sells gyms — members, last-active, streaks, at-risk list.
- **Add:** `Codebase/dashboard/` — Vite + React + TS + `@supabase/supabase-js`; owner
  auth; pages: Members, At-risk (no activity ≥ N days), Streaks/leaderboard, Gym
  branding preview. **Imports `../src/theme/tokens.ts` directly** (pure TS, no RN) for
  visual parity. Its own `package.json`/`tsconfig`; `netlify`/`vercel`-deployable.
- **Edit:** root `tsconfig.json` — **exclude `dashboard/`** so the Expo `tsc` never
  compiles the web app (they have different libs). Metro already ignores non-`src` roots;
  confirm `dashboard/node_modules` is gitignored.
- **Success:** owner logs in, sees only their gym's members (RLS), at-risk list matches
  the data; dashboard reads summaries written in Phase 1; Expo `typecheck` still green;
  offline member demo unaffected (dashboard is a separate app).
- **Risks:** token cross-import from an RN src into Vite (keep tokens pure — it is);
  auth/role gating (owner vs member); deploy target is human-gated.
- **Shippable checkpoint.**

### Phase 3 — Groq AI proxy (members stop pasting keys)
- **Goal:** server-side AI so the member app ships no key; keep `localCoach` free tier.
- **Human provides:** Groq API key (Edge Function secret).
- **Add:** `supabase/functions/ai-proxy/` — Groq proxy (text: Llama 3.3 70B; voice:
  Groq Whisper; meal photos: Groq vision Llama 4 Scout/Maverick), per-gym rate limits,
  key server-side. `src/ai/providers/backend.ts` — new provider hitting the proxy with
  the member session token. Extend `AiProviderId` with `'backend'` (type addition only)
  + one `orchestrator` branch + a Settings toggle ("Gym AI Coach"). 
- **Edit:** `orchestrator.sendToCoach` (add the `backend` branch alongside existing);
  `types/models.ts` `AiProviderId` union; Settings provider list.
- **Success:** with a session, chat + meal-photo + voice work via the proxy with **no
  local key**; `localCoach` still works offline with no account; rate limit enforced.
  **If Indian-food macro accuracy from Groq vision is weak in testing, route only photos
  to Claude/OpenAI via the proxy and keep text/voice on Groq** (decision recorded then).
- **Risks:** vision macro accuracy (have the fallback ready); proxy latency; never leak
  the key to the client; keep the offline path untouched.
- **Shippable checkpoint.**

### Phase 4 — Owner operations
- **Goal:** operational lock-in — memberships, renewals, attendance in the dashboard;
  WhatsApp reminders via an approved provider.
- **Add:** dashboard membership/renewal/attendance views + writes (owner→cloud only,
  not phone); `supabase/functions/whatsapp-reminders/` (approved BSP, opt-in templates);
  check-in capture (QR or manual). Attendance may add a phone→cloud `checkins` push
  (still one-way).
- **Success:** owner manages renewals/attendance; reminders send to opted-in members;
  RLS holds; offline member demo intact.
- **Risks:** WhatsApp provider approval + template policy; PII handling; consent.

### Phase 5 — Billing
- **Goal:** revenue — Razorpay (UPI, subscriptions, GST) to convert free gyms to paid.
- **Add:** `supabase/functions/billing-webhook/`, plan/subscription tables + RLS,
  dashboard billing UI, entitlement gating of paid features.
- **Success:** a gym subscribes via UPI; webhook flips entitlement; GST invoice; free
  gyms keep working until upgrade prompts.
- **Risks:** webhook idempotency/signature verify; tax config; never gate the offline demo.
- **Shippable checkpoint.**

### Phase 6 — Scale (DO NOT START without explicit go-ahead)
- True white-label, member premium + revenue share, academies. Deferred by default.

## Privacy & compliance (from Phase 1 on) — DPDP Act 2023
- Consent at join (plain-language: what syncs, why, retention). RLS tenant isolation
  enforced + tested. Self-serve "disconnect & delete my cloud data" path. No health
  data leaves the phone until the member has an account and has consented.

## Verification ritual (every phase)
`npm run typecheck` green · **offline demo makes zero network calls and fully works**
(log workout/meal, dashboard, analytics, `localCoach`) · no protected file touched ·
phase success criteria met · `PROGRESS.md` updated · small committed steps · STOP + report.

## Open questions for the human (before Phase 1)
1. Dashboard hosting target (Vercel / Netlify / Cloudflare Pages)? Affects Phase 2 deploy.
2. Confirm dashboard lives in-repo at `Codebase/dashboard/` (monorepo-lite) vs a new repo.
3. Groq vs Claude/OpenAI for meal-photo macros — accept the "photos-only fallback" rule?
4. Region/data-residency preference for Supabase (India vs nearest) for DPDP posture.
