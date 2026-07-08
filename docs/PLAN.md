# ForgeAI B2B2C — Build Plan (Phase 0 output)

Source of truth for the offline demo → multi-tenant B2B2C evolution. Follows
`Resources/B2B2C-BUILD.md` (also copied to `docs/B2B2C-BUILD.md`). Non-negotiables:
**offline-first, ONE-WAY push (phone → cloud), no two-way sync, demo stays 100%
offline after every phase.**

> **BETA MODE (current): everything FREE, < 100 users** — see `docs/DECISIONS.md §0`.
> Beta uses the free-tier variant of every choice below and defers all paid pieces:
> Supabase **Free** tier; **Supabase Auth (email) for members too** (no custom
> JWT-minting Edge Function — 50k MAU free covers <100 users); **join-by-code as a
> Postgres RPC**; AI stays `localCoach` (free/offline) until Phase 3 uses free-tier
> keys; billing/WhatsApp/MSG91 deferred. **$0/month.** The scale-ready deltas below
> are the upgrade path (flip when nearing free-tier limits) — beta is not throwaway.
>
> **Scale-ready decisions locked 2026-07-07 — see `docs/DECISIONS.md`** (web-researched +
> fact-checked). Deltas folded into the phases below:
> - **Backend:** Supabase **Pro, Spend Cap ON**, region **Mumbai `ap-south-1`**.
> - **Members are NOT on Supabase Auth** — a **per-member signed JWT** (gym secret)
>   drives RLS. Only the few thousand **owners** use Supabase Auth (email + phone
>   OTP via **MSG91**). This one call is ~$0 vs ~$650–2,925/mo (MAU counts token
>   refresh). Load-bearing — enforce in review.
> - **AI is Gemini-primary, not Groq:** text = **Gemini 2.5 Flash** (+ Flash-Lite
>   for trivial turns); meal-photo = **Gemini 2.5 Flash → escalate low-confidence /
>   mixed-thali photos to GPT-5.4** (GPT-4o/GPT-5 are delisted), cap ~15–20%;
>   voice = Gemini native audio, **Groq Whisper v3 turbo** fallback. Keep the
>   swappable seam; run a 100-photo Indian-food eval to set the escalation threshold.
> - **Dashboard:** Vite+React+TS SPA on **Cloudflare Pages (free, commercial-OK)**;
>   repo becomes a **pnpm monorepo** (`apps/mobile`, `apps/dashboard`, `packages/theme`).
> - **DPDP:** add a **cloud delete endpoint** + consent logging + breach alerting
>   (one-way sync makes cloud-delete a non-obvious hard requirement).
> - **Billing:** Razorpay Subscriptions + UPI AutoPay. **Reminders:** WhatsApp
>   **Utility** templates via an aggregator BSP.
> - **Cost:** ~$150/mo @10 gyms → ~$1.3k @100 → ~$7.7k–12k @1000; **AI (driven by
>   daily-active users) dominates**, not the 1M records. Backend stays ~$40–85/mo.

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
3. **Push = derived summary upsert via an outbox, not event replay.** After a log we
   recompute the member's rolling summary from existing services and enqueue it in a new
   `sync_outbox` table (status `pending|synced|error`, `client_version`); a connectivity
   listener drains it with an **idempotent** `upsert(onConflict:'member_id')` under the
   member JWT (RLS). The outbox (a non-domain table, **no `user_id`**) gives clean
   retry/error tracking + offline resilience; a monotonic `client_version` guard stops
   stale retries regressing state. **No repo hooks, no domain-schema change** — enqueue
   is triggered from the store/service layer, never inside the frozen repos.
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
- **Goal:** Supabase schema + RLS (Mumbai); **per-member signed JWT** (not Supabase
  Auth); join-gym-by-code; identity in `meta`; **outbox → one-way summary upsert**;
  consent logging + a cloud **delete endpoint**. Demo still 100% offline.
- **Auth model (locked):** members get a JWT minted by a `mint-member-jwt` Edge
  Function (signed with the gym secret, claims `gym_id`+`member_id`) at join; the app
  sets it on the supabase-js client and RLS enforces `auth.jwt()->>'gym_id'`. Owners
  (dashboard) use Supabase Auth (email + phone OTP via MSG91). Never ship service_role.
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
  - `src/cloud/outbox.ts` — new SQLite `sync_outbox(id, status pending|synced|error,
    payload, attempts, updated_at)`; `enqueueSummary()` snapshots the member summary
    (derived read-only from `services/dashboard`+`analytics`); `drain()` does an
    **idempotent** `upsert(row,{onConflict:'member_id'})` under the member JWT (RLS),
    guarded by `client_version` monotonic bump so stale retries can't regress state.
  - `src/cloud/connectivity.ts` — `@react-native-community/netinfo` `isInternetReachable`
    → drains the outbox on launch/reconnect (treat `null` as "don't push yet").
  - `src/cloud/deleteMyData.ts` — erases local SQLite AND calls the cloud delete
    endpoint (one-way sync means a deleted local row never propagates — DPDP requirement).
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

### Phase 1.5 — Member backup & restore (Google Drive)  [AMENDMENT — see DECISIONS §0.1]
- **Goal:** a member's **full local history survives uninstall/reinstall/new phone** by backing up
  to their **own Google Drive** and restoring on a fresh install. **Supabase summary push
  UNCHANGED (still one-way).** NOT two-way sync — Drive→phone restore is a one-time hydrate of an
  empty DB; no conflict resolution.
- **Non-negotiables preserved:** offline demo makes **zero network/Drive calls** with no account +
  no Google link; protected dirs (`engine`/`components/ui`/`components/charts`/CONTRACTS) untouched;
  the Supabase relationship stays strictly one-way.
- **Reuse:** ColorCloset's `src/lib/drive.ts` almost verbatim — `@react-native-google-signin/
  google-signin`, `drive.file` scope, ONE canonical backup file in a dedicated "ForgeAI" Drive
  folder, direct Drive v3 REST, overwrite-on-update, `DEVELOPER_ERROR → "register the SHA-1"` msg.
- **Add (files):**
  - `src/cloud/drive.ts` — port of ColorCloset drive.ts: `isDriveConfigured()` (firewall on
    `extra.googleWebClientId`), configure/sign-in/silent/sign-out, `backupToDrive(json)`,
    `restoreFromDrive()`. Constructs nothing until the user taps a Drive action.
  - `src/cloud/snapshot.ts` — `exportSnapshot(): Promise<string>` serializes the **domain** tables
    (`user_profile, body_weight, exercises, workout_sessions, set_entries, personal_records,
    workout_plans, plan_days, plan_exercises, meals, chat_messages`) to a versioned envelope
    `{ schema_version, exported_at, tables:{…} }`. **Excludes** `sync_outbox` and the cloud-identity
    `meta` key (identity is re-established at sign-in). `importSnapshot(json)` = DELETE-first + bulk
    INSERT in **FK-safe order** inside one `withExclusiveTransactionAsync` (mirrors the seed's
    idempotent DELETE-first); refuses/upgrades on `schema_version` mismatch.
  - `src/store/backupStore.ts` — `{ googleEmail, lastBackupAt, status, linkGoogle, backupNow,
    checkForBackup, restoreNow, unlinkGoogle }`; persists `lastBackupAt` in `meta`.
  - `src/components/settings/BackupCard.tsx` — "Back up & restore" card: link Google · Back up now
    (+ last-backup time) · Restore from Drive (shows found-backup date + confirm) · unlink. Reuses
    `components/ui` only.
- **Edit (minimal):** `app.json` (add `extra.googleWebClientId` + the google-signin plugin/dep);
  `src/app/(tabs)/settings.tsx` (mount `BackupCard`). Auto-backup on background is **deferred** —
  v1 = manual "Back up now" + backup-on-launch-if-linked-and-dirty; harden later.
- **Restore UX:** in Settings, and offered on first gym-connect: if a Drive backup exists AND the
  local DB is demo-only/empty, prompt "Restore your history? (backed up <date>)". Restore replaces
  demo data. **Never auto-overwrite existing real data — always confirm.**
- **Success:** (1) link Google → Back up now → one file in the member's Drive/ForgeAI folder;
  (2) clear data / reinstall → link the **same** Google → Restore → full history returns (workouts,
  meals, PRs, body-weight, chat); dashboard/analytics show real data; summary re-pushes to Supabase;
  (3) offline demo (no account, no Google) → zero network/Drive calls, every feature works;
  (4) `npm run typecheck` green.
- **Risks / gotchas:** **SHA-1 gate** (Drive OAuth needs the signing-key SHA-1 as an Android OAuth
  client + Web client id; ForgeAI is debug-signed → register debug SHA-1 or stand up release
  keystore); **native module** (google-signin must autolink in the committed `android/` — likely
  `expo prebuild` regen + re-apply the build.gradle signing block; test only via a **cloud**
  dev/preview build); **snapshot FK order** (exercises→sessions→set_entries/PRs; plans→plan_days→
  plan_exercises); **identity note** (backup is tied to the member's **Google** account, which may
  differ from their Supabase email — document "restore uses the Google account that made the backup").
- **Verify:** typecheck + offline-zero-network + logic review locally; **live Drive test needs a
  cloud build.** **Shippable checkpoint — build only AFTER the Phase 1 live loop is confirmed.**

### Phase 2 — Owner dashboard (read-only)
- **Goal:** the artifact that sells gyms — members, last-active, streaks, at-risk list.
- **Restructure to a pnpm monorepo** (locked): move the Expo app to `apps/mobile/`,
  extract `src/theme/tokens.ts` → `packages/theme/`, add `apps/dashboard/` (Vite+React+TS
  + supabase-js). Both consume `packages/theme` (dashboard must NOT import `apps/mobile`'s
  RN `src`). Careful migration — update CI paths, `android/`, `app.json`, Metro
  `watchFolders` (root + `packages/*`). Alternative if the move is too risky pre-revenue:
  keep mobile at root, add only `dashboard/` + a shared `packages/theme` (partial workspace).
- **Host = Cloudflare Pages (free, commercial-OK):** project root `apps/dashboard`,
  build `pnpm --filter dashboard build`, path-filtered so a mobile commit doesn't rebuild.
  Browser talks to Supabase directly (RLS-scoped owner reads); Pages serves static only.
- **Pages:** Members, At-risk (no activity ≥ N days), Streaks/leaderboard, Gym branding.
- **Success:** owner logs in, sees only their gym's members (RLS), at-risk list matches
  the data; dashboard reads summaries written in Phase 1; Expo `typecheck` still green;
  offline member demo unaffected (dashboard is a separate app).
- **Risks:** token cross-import from an RN src into Vite (keep tokens pure — it is);
  auth/role gating (owner vs member); deploy target is human-gated.
- **Shippable checkpoint.**

### Phase 3 — AI proxy (Gemini-primary; members stop pasting keys)
- **Goal:** server-side AI so the member app ships no key; keep `localCoach` free tier.
- **Human provides:** Gemini (Google AI) key; OpenAI key (photo escalation); optional
  Groq key (Whisper fallback) — all Edge Function secrets, never shipped.
- **Add:** `supabase/functions/ai-proxy/` — **Gemini-primary**: text = Gemini 2.5 Flash
  (trivial turns → Flash-Lite); meal-photo = Gemini 2.5 Flash, **escalate low-confidence
  / mixed-thali photos to GPT-5.4** (cap 15–20%); voice = Gemini native audio, **Groq
  Whisper v3 turbo** fallback. Per-gym rate limits; keys server-side. Batch API + prompt
  caching on the coach system prompt to ~halve cost. `src/ai/providers/backend.ts` — new
  provider hitting the proxy with the member JWT. Extend `AiProviderId` with `'backend'`
  (type addition) + one `orchestrator` branch + a Settings toggle ("Gym AI Coach").
- **Pre-flight (make-or-break):** a **100-photo Indian-food eval** (roti/dal/biryani/thali)
  comparing Gemini 2.5 Flash vs GPT-5.4 to SET the escalation confidence threshold.
- **Success:** with a session, chat + meal-photo + voice work via the proxy with **no
  local key**; `localCoach` still works offline with no account; rate limit enforced;
  escalation stays under the cap.
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

## Open questions — RESOLVED 2026-07-07 (see docs/DECISIONS.md §3)
1. Dashboard host → **Cloudflare Pages** (free, commercial-OK, India PoPs).
2. Repo → **in-repo pnpm monorepo** (`apps/mobile` + `apps/dashboard` + `packages/theme`).
3. Meal-photo fallback → **YES, cross-provider**: Gemini 2.5 Flash → GPT-5.4 on
   low-confidence/mixed-thali, capped 15–20%; validate on a 100-photo Indian eval first.
4. Supabase region → **Mumbai `ap-south-1`** (only India region).

Nothing blocks Phase 1. Human still provides: Supabase keys (present in
`Resources/Supabase/`, unread), later the Groq/Gemini/OpenAI keys + MSG91 + Razorpay.
