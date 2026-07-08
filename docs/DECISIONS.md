# docs/DECISIONS.md — ForgeAI B2B2C Decision Record

_Synthesised 2026-07-07. Every number below reflects the fact-check verdicts (corrections applied inline). Prices verified against live primary sources on 2026-07-07; re-verify the flagged low-confidence items before you spend against them._

---

## 0. BETA MODE — everything free, < 100 users (current phase)

The decisions below are the **scale-ready target**. For the **free beta** we deliberately
pick the free-tier / simplest variant of each and defer all paid pieces. **$0/month.**

| Decision | Scale target (below) | **Beta (now)** |
|---|---|---|
| Supabase | Pro $25 + compute | **Free tier** (500 MB DB, 5 GB egress, 50k MAU) — plenty for <100 users. *Gotcha: a free project pauses after 7 days idle — just un-pause it, or a tiny cron ping.* Region still **Mumbai**. |
| Member auth | per-member signed JWT (avoids MAU bomb) | **Supabase Auth for everyone** (owners + members) — 50k MAU free easily covers <100. **No custom JWT-minting Edge Function** → much less code. Swap members to signed JWT only when nearing ~50k MAU. |
| Auth method | phone OTP via MSG91 (₹/SMS) | **Email (magic-link / OTP)** — free, no SMS cost, no DLT registration. Phone OTP later. |
| join-by-code | Edge Function | **Postgres RPC** (`SECURITY DEFINER`) — no Edge Function needed at beta. |
| AI (Phase 3) | Gemini 2.5 Flash + GPT-5.4 escalation | **`localCoach` stays the free default** (offline, no key). When Phase 3 lands, use **free-tier Gemini / Groq keys**; <100 beta users sit inside free rate limits. |
| Dashboard | Cloudflare Pages (already free) | **unchanged — free.** |
| Billing (Razorpay) | Phase 5 | **deferred** — beta is free, no billing. |
| WhatsApp reminders | Utility templates via BSP (₹/msg) | **deferred** — use free `expo-notifications` local reminders if any are needed. |
| Compliance | full DPDP checklist | **still ship consent + a delete path** (free, just code) — health data goes to cloud the moment a member connects. |

**Net beta cost: $0/month.** The only thing that changes at scale is swapping in the paid/
harder variants above — the schema, RLS, tables, one-way push, and dashboard **all stay**,
so beta is not throwaway. "Later integrate better-quality services" = flip these rows.

---

## 0.1 — AMENDMENT (2026-07-08): member backup & restore via Google Drive

**Decision:** ADD member-owned **full-history backup & restore** via **Google Drive**. This is a
deliberate, owner-approved amendment to the "one-way push / no restore" reading of
`B2B2C-BUILD.md §3.2`. Trigger: reinstall/new-phone must not lose a member's history (people
uninstall/reinstall constantly) — the summary-only cloud row cannot rehydrate the phone.

**Crucially this is NOT two-way sync** (the hard part — conflict resolution — is still deleted):
- The **Supabase** relationship stays **strictly one-way** (phone → cloud *summary*) and unchanged.
  No cloud→phone writes of Supabase data, no merge, no tombstones.
- **Google Drive** holds a full snapshot of the member's local SQLite in **their own** Drive
  (`drive.file` scope). Restore is a **one-time hydrate on a fresh/empty install** (Drive → phone).
  Single-device assumption ⇒ no conflict logic.

**Two permanent stores, never overlapping:**

| Store | Holds | For | Cost to us |
|---|---|---|---|
| **Supabase** | 1-row summary | the **gym owner** (dashboard) | tiny (one row/member) |
| **Google Drive** | full history snapshot | the **member** (restore) | **$0** (member's own Drive) |

**Why Drive, not a Supabase snapshot blob:** (1) storage stays **$0 to us at any scale** — the
backup lives in the member's Drive, so Supabase storage stays flat (summary only); (2) cleaner
DPDP posture — the gym never holds a member's raw history; (3) reuses the proven **ColorCloset**
Drive pattern; owner has set up Google OAuth clients many times.

**Why Drive can't replace Supabase:** the owner dashboard needs a **shared, owner-queryable**
server across *all* members ("who's at-risk / streak leaderboard"); a member's private Drive can't
serve cross-member queries. **Both are required.**

**Gate (owner):** Drive OAuth needs the build's **signing-key SHA-1** registered as an Android
OAuth client + a Web client id in `app.json > extra`. ForgeAI is currently **debug-signed** →
register the debug SHA-1 for testing OR stand up the release keystore first. `google-signin` is a
**native module** ⇒ testable only via a **cloud dev/preview build** (not Expo Go, not local).

---

## 1. TL;DR decisions

| Decision | Choice | Why (one line) | ~Cost at our scale |
|---|---|---|---|
| Backend platform | **Supabase Pro**, Spend Cap ON | SQL = the read-replica IS the dashboard; predictable resource pricing, not per-op | $25 base + $15–60 compute |
| Region | **South Asia / Mumbai `ap-south-1`** | Only India region; data-residency default + low latency | included |
| Owner auth | **Supabase Auth (email + phone OTP via MSG91)** — owners only | Few thousand owners stay inside free 100k MAU | ~$0 |
| Member auth | **Per-member signed JWT, NOT Supabase Auth** | Avoids the MAU cost bomb (token refresh counts as MAU) | ~$0 vs ~$650+/mo |
| Mobile→cloud | **Local SQLite outbox → direct RLS `upsert`** (supabase-js), NetInfo-gated, SecureStore session | One-way, idempotent, no Edge Function hop/cost | ~$0 |
| AI text | **Gemini 2.5 Flash** (+ Flash-Lite for trivial turns) | Cheapest credible multimodal + best Hinglish | see §5 |
| AI vision | **Gemini 2.5 Flash default → escalate hard/low-confidence photos to GPT-5.4** | Buy accuracy only where it matters, cap escalation ~15–20% | see §5 |
| AI voice | **Gemini 2.5 Flash native audio; Groq Whisper v3 turbo fallback** | Handles Hinglish code-switch (Whisper's weakness) | see §5 |
| Dashboard | **Vite + React + TS SPA on Cloudflare Pages** | Read-mostly/no-SEO; commercial-OK free tier, India PoPs | $0 |
| Repo | **pnpm-workspace monorepo** (apps/mobile, apps/dashboard, packages/theme) | Single-sourced theme tokens, atomic versioning | — |
| Multi-tenant | **Shared-table + RLS, gym_id-led indexes; rollup row + partitioned events** | O(members-in-gym) reads, no MV needed | — |
| Billing | **Razorpay Subscriptions + UPI AutoPay** (card e-mandate fallback) | Fastest Indian onboarding, cheapest recurring rail | ~1% of GMV |
| Reminders | **Utility-category WhatsApp templates via aggregator BSP** (AiSensy/Interakt) | Utility ~7x cheaper than marketing; free in 24h window | see §5 |
| Compliance | **DPDP checklist now** (consent log, cloud delete endpoint, RLS, breach runbook) | All engineering, no legal spend; May-13-2027 deadline | ~₹0 infra |

---

## 2. Decision detail

### Backend (platform + plan + region + auth)
- **Supabase Pro, $25/mo, Spend Cap ON.** Verified: 8 GB DB then $0.125/GB, 250 GB egress then $0.09/GB, 100k MAU then $0.00325/MAU, 2M Edge fn invocations then $2/1M ([supabase.com/pricing](https://supabase.com/pricing), confirmed). With Spend Cap ON, overages are **capped, not billed** — monitor and raise deliberately.
- **Region = Mumbai `ap-south-1`** — the only India region (no Pune), confirmed ([regions doc](https://supabase.com/docs/guides/platform/regions)).
- **Members do NOT use Supabase Auth.** This is load-bearing for the cost model: MAU counts any user who logs in **or refreshes a token** in the cycle ([MAU doc](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users), confirmed). A member app doing background token refresh would each count — 300k active ≈ **$650/mo**, 1M ≈ $2,925/mo. Instead: per-member JWT signed with the gym secret, RLS keyed on `gym_id + member_id`.
- **Owners use Supabase Auth** (email + phone OTP). A few thousand owners sit inside the free 100k MAU.
- **Phone OTP via MSG91** through the Send-SMS-Hook → Edge Function ([phone-login doc](https://supabase.com/docs/guides/auth/phone-login), confirmed). Corrected pricing: MSG91 India OTP ≈ **₹0.15–0.20** (even cheaper than the ₹0.25 assumed) vs ~$0.10 all-in Twilio Verify. Requires TRAI **DLT template registration** — a setup step, not just an API key.
- **"Join by code"** = a `gym_invite_codes` table validated in an Edge Function (not native Supabase).

### Mobile↔cloud (packages + one-way push)
- **Packages:** `@supabase/supabase-js` v2 + `react-native-url-polyfill` (import before `createClient`) + `expo-secure-store` (encrypted **LargeSecureStore**, since SecureStore caps at 2048 B) + `@react-native-community/netinfo` (more reliable on Android than expo-network). Client config: `autoRefreshToken:true, persistSession:true, detectSessionInUrl:false` + the AppState start/stopAutoRefresh listener + `processLock`. Confirmed against the [official Expo+Supabase tutorial](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native).
- **Lazy-init the Supabase client only after a gym is linked** so the zero-network/no-account offline demo never constructs it or attempts session restore. Guard every push path behind the "linked" flag — protects the existing offline-first behaviour.
- **Push design:** every workout/meal log writes a local SQLite **outbox** row (`pending|synced|error`). A NetInfo `isInternetReachable` listener + drain-on-launch/reconnect worker does an **idempotent direct upsert** `upsert(row, { onConflict: 'member_id' })` under the member JWT + RLS. No Edge Function (saves a hop + cold-start + cost; RLS `auth.uid()=member_id` already secures a self-owned single row), no pull, no conflict resolution, no tombstones.
- **Never ship the service_role key** in the app. Ship only the publishable/anon key. (Supabase is migrating anon/service_role → publishable/secret naming — confirm which your project issues; flagged confidence:low.)
- Treat `isInternetReachable === null` as "don't push yet"; the outbox retry self-heals a missed signal.

### AI (models + meal-photo fallback rule + per-day cost)
- **Reverse the plan's Groq-primary assumption → Gemini-primary.** Groq's only edge is latency; its Llama models are weaker on Hinglish and its vision (Llama 4 Scout) is Preview-grade.
- **Text:** Gemini 2.5 Flash — **$0.30 in / $2.50 out** per 1M (confirmed, [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)). Route trivial turns (nudges, yes/no, simple parsing) to **Flash-Lite ($0.10/$0.40)** to cut ~3x.
- **Vision (meal photo):** Gemini 2.5 Flash is the default estimator (~258 tokens/image, near-free per photo). **FALLBACK RULE:** if the model returns low self-reported confidence **OR** the photo is a mixed thali/multi-katori plate, re-send that one photo to **GPT-5.4** ($2.50/$15) and keep the higher-confidence answer. **Cap escalation at 15–20% of photos.**
  - _Correction applied:_ the plan/research named "GPT-5 or GPT-4o" as the escalation target — **both are delisted** from OpenAI's current pricing ([OpenAI pricing](https://developers.openai.com/api/docs/pricing), verdict: outdated). Current flagship-vision tier is **GPT-5.4 $2.50/$15**; cheaper tiers are GPT-5.4-mini $0.75/$4.50, GPT-5.4-nano $0.20/$1.25. Do **not** escalate to Gemini 2.5 Pro (statistically tied with Flash on food).
- **Voice:** Gemini 2.5 Flash native audio primary (does transcribe+parse in one call, handles Hinglish). **Correction:** Gemini 2.5 Flash **audio-in is billed $1.00/1M, not $0.30** (fact-check) — still ~$0.001 for a 30s clip, but if voice volume grows, the **Groq Whisper v3 turbo ($0.04/hr)** fallback gets more attractive. Gate Whisper to detected pure-Hindi/English clips only.
- **Per-active-member-day ≈ $0.008–0.010** (Gemini path): chat ~$0.0037, vision ~$0.0027 incl. escalation, voice ~$0.001. Batch API (**−50%**, confirmed for both Gemini and OpenAI; Groq Batch is also −50%, not −25%) + prompt-caching the coach system prompt (−75–90% on the cached prefix) roughly halves this.
- **Keep the swappable AiProvider seam**; the lineup shifts monthly. **Make-or-break validation:** run a 100-photo roti/dal/biryani/thali eval through Gemini 2.5 Flash vs GPT-5.4 and set the escalation threshold from real numbers — the only public food benchmark is Western-skewed and its winner (GPT-4o) is now delisted.

### Dashboard (framework + host + repo layout)
- **Vite + React + TypeScript SPA, client-only (no SSR)** — read-mostly, authenticated, no-SEO: SSR adds cost for zero benefit. Supabase-js talks browser→Supabase directly (RLS-scoped owner reads).
- **Host = Cloudflare Pages (free).** Hard reasons: Vercel Hobby is **non-commercial** (a paid B2B product forces Pro $20/mo); Netlify free moved to a credit model that **takes the site offline** past ~15 GB/mo. Cloudflare allows commercial use free, unlimited static bandwidth, 500 builds/mo, India PoPs <50 ms.
- **Monorepo (pnpm workspaces) inside the existing Expo repo:** `apps/mobile`, `apps/dashboard`, `packages/theme` (extract `tokens.ts` here — the dashboard must **not** import `../src` of the Expo app, or RN/Metro types pollute the dashboard tsc). Metro `watchFolders` = root + `packages/*` only; hoisted node-linker. Cloudflare project root = `apps/dashboard`, build `pnpm --filter dashboard build`, path-filtered so a mobile commit doesn't rebuild the dashboard.
- **Cost: $0/mo** at target scale (static assets edge-cached; API traffic bypasses Pages). Keep heavy member media/exports on R2/Supabase Storage, not this Pages project (ToS).

### Multi-tenant & scale (tables + indexes + at-risk/leaderboard + cost math)
- **Shared-table multi-tenancy, one Postgres instance, keyed by `gym_id` + RLS.** Schema-per-tenant explodes migrations/connections at 200–1000 gyms.
- **Tables:** `gyms`, `members(gym_id, ...)`, and the core **`member_summary`** = one rollup row per member (`last_active_at`, `workouts_7d/30d`, `current_streak`, `weight_kg`, `client_version`, `updated_at`), `fillfactor=90` for HOT updates. Append-only **`check_in_events`** declaratively **range-partitioned monthly**, ~90-day retention via **DROP PARTITION** (never DELETE).
- **Indexes:** `gym_id` **leads every composite index** — `(gym_id, last_active_at)` for at-risk, `(gym_id, current_streak DESC)` for leaderboard. Unindexed policy columns or per-row `auth()` = ~100x slowdown; **wrap `auth.jwt()` in `SELECT`** so it runs once as an initPlan (Supabase reports >100x from indexing alone — confirmed, [RLS best-practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)).
- **Idempotent upserts:** summary `ON CONFLICT (member_id) DO UPDATE ... WHERE excluded.client_version > member_summary.client_version` (monotonic guard stops stale retries regressing state); events `ON CONFLICT (client_event_id) DO NOTHING`.
- **At-risk / leaderboard** are plain indexed scans scoped to one gym (≤3000 rows, single-digit ms) — **no materialized views**; reserve MVs + pg_cron for cross-gym platform admin analytics only.
- **Phones never open raw PG connections** — funnel through PostgREST/Edge behind **Supavisor transaction-mode pooler**.
- **Cost math (~1M records, 50–100k active/day):** storage ≈ 4–5 GB (summary ~0.7 GB + 90-day events ~3–4 GB) → **≤ 8 GB included, ~$0 overage**; ingest inbound = free egress; dashboards a few hundred KB/session ≪ 250 GB. **Compute is the only real lever:** Micro (credit-covered) → Small $15 → Medium $60. Total **~$40–85/mo** for the whole cloud at 1M members. Design is compute-bound, not storage/egress-bound.

### India compliance & billing (DPDP + Razorpay + WhatsApp)
- **DPDP checklist (ship now; substantive obligations enforceable May 13 2027, ~18-mo runway; penalties up to ₹250 cr — all confirmed, [PIB notification](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)):**
  1. **Explicit unbundled consent** at member join + itemized notice; log consent version+timestamp on **phone AND cloud row**.
  2. **Cloud delete endpoint** — a "Delete my data" action must erase both SQLite **and** the cloud replica. Because sync is one-way, deleting the local row will **not** propagate — this is an easy-to-miss hard requirement.
  3. **RLS** so an owner reads only their gym; members not owner-editable.
  4. **India-region cloud** (`ap-south-1`) — **not** legally mandated (DPDP uses a permissive negative-list model, confirmed; use official [MeitY Act s.16 text](https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf) for citation, not the aggregator URL) but the cheap, low-regret default.
  5. **Breach runbook:** notify Board + affected members without delay; detailed report within **72h** — needs automated logging from day one.
  6. Purpose-limited **retention/auto-purge**; published **grievance contact** (≤90-day resolution).
  - DPDP has **no "sensitive data" tier** — fitness data is ordinary personal data, so no special-category burden. SDF status near ~1M records could later add DPO/DPIA/localization duties — budget as we scale.
- **Billing = Razorpay Subscriptions + UPI AutoPay** (card e-mandate/e-NACH fallback). Confirmed: 2% standard platform fee, card-subscription add-on **0.9% (currently a 0.5% promo)**, UPI/NACH subscription pricing on request, 18% GST on fee, ₹0 setup/AMC ([razorpay pricing](https://razorpay.com/pricing/)). Stripe is invite-only in India with a 26h card delay; Cashfree is payout-focused — Razorpay wins for owner billing.
- **WhatsApp = Utility-category templates via aggregator BSP (AiSensy/Interakt)** at launch, migrate to Cloud API direct at scale. **Corrected rates** (fact-check, [Meta pricing](https://developers.facebook.com/docs/whatsapp/pricing/)): Marketing ≈ **₹0.78**, Utility/Auth ≈ **₹0.115**, Service free; utility **free inside the 24h service window**. **⚠️ Pull the live Meta India rate card** — INR native billing since Jan 1 2026 and a **new rate card took effect July 1 2026** (treat exact paise as confidence:medium). **Never send workout nudges as Marketing** (~7x costlier + opt-out/quality-rating risk).

---

## 3. Answers to the 4 open questions (from PLAN.md)

1. **Dashboard host?** → **Cloudflare Pages, free tier.** Commercial-use-allowed (unlike Vercel Hobby), no bandwidth-kill (unlike Netlify's new credit model), India PoPs <50 ms. $0/mo at our scale.
2. **In-repo vs separate repo?** → **In-repo, pnpm-workspace monorepo.** `apps/mobile` + `apps/dashboard` + `packages/theme`. Single-sourced theme tokens, atomic versioning, path-filtered CI. Keep Metro watchFolders to root+packages and never cross-import `../src`.
3. **Meal-photo fallback — yes/no?** → **YES, cross-provider.** Gemini 2.5 Flash default; escalate low-confidence/mixed-thali photos to **GPT-5.4** (not the delisted GPT-4o/GPT-5), capped at 15–20%. Escalating to Gemini Pro is pointless (tied with Flash on food). Validate the threshold on your own 100-photo Indian eval first.
4. **Supabase region?** → **South Asia / Mumbai `ap-south-1`.** Only India region; data-residency default + latency.

---

## 4. What changes in the PLAN

- **AI phase (Phase 3): biggest revision.** Plan assumed **Groq-primary**; switch to **Gemini-primary** for text/vision/voice, with **GPT-5.4 as the photo-escalation route only** and Groq Whisper turbo as a voice fallback. Provider choice barely moves cost (~$0.003/day either way) — it moves **quality** (Hinglish + food accuracy). Update the escalation target from "GPT-4o/GPT-5" (both delisted) to **GPT-5.4**.
- **Auth phase:** Plan should explicitly state **members are NOT on Supabase Auth** — per-member signed JWT instead. This single choice is the difference between ~$0 and $650–2,925/mo.
- **Backend push phase:** confirm **direct RLS upsert from an SQLite outbox**, not an Edge Function, for the summary write.
- **Dashboard phase:** lock **Vite SPA + Cloudflare Pages + monorepo** (plan left host open).
- **Add a DPDP sub-phase:** cloud **delete endpoint** + consent logging + breach alerting are net-new work the one-way-sync architecture makes non-obvious.
- **Add a pre-launch AI eval task:** 100-photo Indian-food benchmark to set the escalation threshold (make-or-break, currently inferred).

---

## 5. Cost trajectory (rough monthly USD)

_Assumes ~800 members/gym avg, ~5% DAU, ~30% MAU, ~8 utility WhatsApp msgs/active-member/mo. AI at $0.008/active-member-day; halve AI with Batch+caching._

| Line | 10 gyms (~8k members, ~400 DAU) | 100 gyms (~80k, ~4k DAU) | 1000 gyms (~800k, ~40k DAU) |
|---|---|---|---|
| Supabase (Pro + compute) | ~$25 | ~$40 | ~$85 |
| AI (Gemini + escalation) | ~$96 | ~$960 | ~$9,600 (→ ~$5k batched) |
| Dashboard (Cloudflare) | $0 | $0 | $0 |
| WhatsApp reminders (utility) | ~$27 | ~$265 | ~$2,650 (less if in-window free) |
| Razorpay fees | ~1% of GMV | ~1% of GMV | ~1% of GMV |
| **Infra + AI + msg total** | **~$150/mo** | **~$1,270/mo** | **~$12,300/mo (~$7.7k batched)** |

**Dominant cost is AI, driven by DAU — not the 1M records.** The two levers: (1) Batch API + prompt-caching (~halves AI), (2) hard-cap the GPT-5.4 photo-escalation rate. Backend/storage/egress/dashboard stay rounding-error.

---

## 6. Open risks / validate during build

- **[HIGH] Food-photo accuracy is inferred, not proven.** The only public benchmark is Western-skewed and its winner (GPT-4o) is delisted. Run your own Indian eval before launch and set the escalation threshold from real numbers.
- **[HIGH] MAU cost bomb** if members ever get put on Supabase Auth (background token refresh counts). Enforce the signed-JWT design in code review.
- **[HIGH] Cloud delete endpoint (DPDP).** One-way sync means deleting the local row won't clear the cloud — a required, easy-to-miss path.
- **[MED] RLS perf:** every table needs `gym_id`-leading indexes + `auth.jwt()` wrapped in `SELECT`; test isolation as a **non-privileged role** (superusers/owners bypass RLS and make tests falsely pass).
- **[MED] Compute tier sizing** (flagged confidence:low) — the one variable cost; size against real concurrent-dashboard + ingest load, don't assume Micro suffices at 1M rows.
- **[MED] WhatsApp exact rates** — pull the live **July-1-2026 Meta India rate card** before finalizing cost math (paise are confidence:medium; the model/window-free rules are confirmed).
- **[MED] Razorpay UPI/NACH recurring rate is "on request"** — confirm the real take-rate in a sales quote (public 2% is card/rack and negotiable).
- **[LOW] Supabase key-naming migration** (anon/service_role → publishable/secret) — confirm which key your project issues; ship only the publishable key.
- **[LOW] Model lineup churn** — Gemini 3.x and GPT-5.5/5.6 exist; keep the swappable seam and re-benchmark quarterly.
- **[LOW] MSG91 DLT registration** and offline-demo regression (guard all push paths behind the "gym linked" flag) — one-time setup items.

_Load-bearing citations: [supabase.com/pricing](https://supabase.com/pricing) · [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) · [OpenAI pricing](https://developers.openai.com/api/docs/pricing) · [Groq pricing](https://groq.com/pricing) · [RLS best-practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) · [Meta WhatsApp pricing](https://developers.facebook.com/docs/whatsapp/pricing/) · [Razorpay pricing](https://razorpay.com/pricing/) · [DPDP PIB notification](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)._