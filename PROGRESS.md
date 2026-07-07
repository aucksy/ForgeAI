# ForgeAI progress

## Done
- 2026-07-04: Scaffolded (Expo SDK 56, deps incl. expo-speech-recognition),
  contract layer, docs. `tsc` green.
- 2026-07-05: Wave 1 (DB repos, overload/recovery/strength engine + services,
  premium UI kit + SVG charts, AI layer w/ Anthropic+OpenAI REST + offline
  localCoach, 3-month demo seed, brand icons). Wave 2 (dashboard, coach chat
  w/ rich cards + voice + photo, analytics, exercise + settings screens).
- 2026-07-05: `expo prebuild` android/ committed with CI-driven signing
  (release keystore from Actions secrets, debug-signing fallback when absent).
- 2026-07-05: Adversarial review (5 finders -> per-finding skeptics -> fixes).
  19 confirmed findings fixed (2 HIGH, 6 MED, 11 LOW); 5 refuted. `tsc` green.
- 2026-07-05: **v0.1.0 SHIPPED green (first-try after a CI fix).** Debug-signed
  APK + AAB, no secrets needed. Direct APK:
  https://github.com/aucksy/ForgeAI/releases/download/v0.1.0/forgeai-v0.1.0.apk

## B2B2C evolution (guide: docs/B2B2C-BUILD.md)
- 2026-07-05: **Phase 0 (plan) done** — `docs/PLAN.md` (offline-first, one-way
  push, no two-way sync; phases 1-6).
- 2026-07-07: **Phase 0 (research+decisions) done** — 23-agent web-research
  workflow (6 areas → fact-check → synthesis), all pricing verified live 2026-07.
  `docs/DECISIONS.md` written; PLAN updated. Key calls: Supabase Pro (Mumbai),
  **members on a signed JWT NOT Supabase Auth** (avoids a $650-2925/mo MAU bomb),
  **AI = Gemini 2.5 Flash primary** (not Groq) w/ GPT-5.4 photo-escalation,
  dashboard = Vite SPA on Cloudflare Pages in a pnpm monorepo, Razorpay+UPI,
  WhatsApp Utility templates, DPDP checklist + cloud delete endpoint. Cost:
  ~$150/$1.3k/$7.7k-12k per mo @ 10/100/1000 gyms (AI-dominated). **Awaiting
  "go" to start Phase 1** (will read the Supabase creds in `Resources/Supabase/`).

- 2026-07-07: **Phase 1 done (cloud foundation)** — Supabase (free tier, Mumbai)
  schema+RLS+RPCs (`supabase/migrations/0001_init.sql` + README), mobile
  `src/cloud/*` (lazy client, email auth + join-by-code, SQLite outbox → one-way
  idempotent upsert, NetInfo-gated drain, consent + cloud-delete), `cloudStore`,
  Settings `CloudCard`. Push piggybacks `dashboardStore.refresh` (no frozen-repo
  edits). Fully gated by `isCloudActive` — **offline demo makes zero network
  calls, untouched**. Adversarial review (4 finders + skeptics): 15 fixed / 5
  refuted, incl. 2 HIGH RLS holes (member could self-escalate to owner + read all
  co-members' health data; unpinned gym_id cross-tenant injection). typecheck green.
  **HUMAN STEPS (supabase/README.md):** apply the SQL, turn OFF email confirmation
  for beta, `insert into gyms(name,join_code) values('Iron Temple Fitness','IRON01');`,
  then test Settings → Gym sync. **BUILD NOTE:** next tag build must confirm
  `@react-native-community/netinfo` autolinks in the committed `android/` (dynamic
  autolinking, low risk); if it fails, `expo prebuild` regen + re-apply the
  build.gradle signing block.

## Next (pre-B2B2C, still valid)
- Gather demo feedback. For a properly release-signed build: run the "Generate
  release keystore" workflow once, set the 4 ANDROID_* Actions secrets
  (owner-gated) -> the next tag auto-signs with the real key.
- Candidate follow-ups: full lb unit support, richer AI coaching prompts,
  onboarding for a real (non-seeded) member, Play Store prep.

## Deliberately deferred (not bugs - scoped for the demo)
- Pounds (lb) units: shipped kg-only. Full lb needs input parsing + every
  localCoach reply string (both languages) + cards + analytics + profile sync;
  half-doing it is worse than kg-only. Settings shows "lb coming soon".
- A/B plan-day tie-break when a chat log contains only exercises shared by both
  variants (LOW, self-corrects on the next full log; rotation fix mitigates).
- Strength-benchmark name-matching could over-match accessories IF a main lift
  is missing (unreachable with the seed; hardening item if real onboarding lands).

## Gotchas / lessons
- CI: the `secrets` context is NOT allowed inside a step `if:` -> route it via a
  job-level `env:` and gate on `env.X != ''` (else the run is a 0-job startup fail).
- `@react-navigation/bottom-tabs` isn't hoisted - TabBar uses a structural type.
- Keep `chart.series` order (CVD-validated). Dark-only UI.
- Demo must impress with NO API key: provider defaults to `local`, seeded data.
- Seed is DELETE-first + idempotent; reset uses forceReseed() (bypasses memo).
- Commit messages with inner double-quotes: use `git commit -F <file>`, not a
  PowerShell here-string (the quotes word-split the -m arg).
- Node not on default PATH: prepend `%LOCALAPPDATA%\nodejs`.
