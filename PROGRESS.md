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

- 2026-07-08: **Phase 1.5 DONE (Drive backup & restore) — typecheck green, adversarially reviewed.**
  Owner decided reinstall/new-phone MUST restore full history (summary-only cloud row can't
  rehydrate the phone). Plan: `PLAN.md → Phase 1.5`; decision `DECISIONS.md §0.1`. **NOT two-way
  sync** — member-owned **Google Drive** full-history snapshot + restore-on-fresh-install (one-time
  hydrate); **Supabase stays one-way summary-only**; **$0 storage to us** (member's own Drive).
  - **Added:** `src/cloud/drive.ts` (Drive v3 REST, `drive.file`, one canonical `forgeai-backup.json`
    in a "ForgeAI" folder; ported from ColorCloset `@react-native-google-signin/google-signin`),
    `src/cloud/snapshot.ts` (11 domain tables → versioned JSON; export reads + import writes each in
    ONE exclusive transaction, FK-safe orders from the seed; **excludes `meta`+`sync_outbox`** so a
    restore can't clobber the gym link or re-trigger the seed), `src/store/backupStore.ts`,
    `src/components/settings/BackupCard.tsx`.
  - **Edited (minimal):** `app.json` (google-signin plugin + `extra.googleWebClientId` placeholder),
    `package.json` (dep `^16.1.2`, installed), `src/app/(tabs)/settings.tsx` (mounted `BackupCard`).
  - **Offline firewall INTACT:** BackupCard returns null unless `isDriveConfigured()`; `init()` only
    touches Google if a local `drive_linked` marker exists → no-account/no-Google demo makes **zero**
    Drive/network calls. No protected file (`engine`/`components/ui`/`components/charts`/CONTRACTS)
    touched. Verified by a dedicated offline-firewall review lens (came back clean).
  - **Adversarial review** (5 finders → per-finding skeptics, 10 agents): **4 LOW confirmed + fixed,
    1 refuted, 0 HIGH/MED survived.** Fixes: (1) `exportSnapshot` now transactional (consistent
    point-in-time snapshot, else a concurrent write could orphan a child → restore FK-fail);
    (2) `accessToken` inspects `signInSilently()` result type (v16 resolves `noSavedCredentialFound`
    instead of throwing) + wraps `getTokens` → friendly error; (3) `ensureFolderId` `orderBy=createdTime`
    (deterministic when duplicate folders race); (4) `restoreFound` returns boolean + ghost buttons
    gated on `busy` → no false "Restored" on a no-op double-tap.
  - **BUILD/OWNER GATES (before Drive works in a build):** ① set a real `extra.googleWebClientId`
    (card stays hidden until then — so the CURRENT placeholder build is SAFE: card hidden, demo
    unaffected). ② register the build's signing **SHA-1** as an Android OAuth client (`com.forgeai.app`)
    — debug SHA-1 for testing, or stand up the release keystore. ③ **native module: the committed
    `android/` must be regenerated (`expo prebuild`) to autolink google-signin, then re-apply the CI
    signing block** — until then a tag build ships without the module (still safe: card hidden). Test
    Drive only via a **cloud** dev/preview build (not Expo Go, not local).
  - **Deferred (noted, not bugs):** no auto-backup scheduler yet (manual "Back up now" + a last-backup
    timestamp); `photo_uri`/`image_uri` are local file paths that won't resolve on a new phone (rows
    restore fine, images just missing) — acceptable for beta.

- 2026-07-08: **Phase 2 DONE (owner dashboard) — standalone `apps/dashboard`, build green,
  adversarially reviewed.** Vite + React + TS SPA reading Supabase with owner auth (RLS-scoped).
  DECISION: built **STANDALONE** (the plan's sanctioned lower-risk alternative) — touches **ZERO
  mobile files**; the full pnpm-monorepo move + `packages/theme` extraction is **DEFERRED** (theme
  mirrored locally in `apps/dashboard/src/theme.ts`). Offline mobile demo provably unaffected.
  - **Built:** owner sign-in/create-account (`Login`), session (`useSession`), "Create your gym"
    onboarding via the `create_gym` RPC → join code (`Onboarding`); `Dashboard` = KPI tiles
    (members / active-7d / at-risk / longest-streak) + members table + at-risk list + streak
    leaderboard; RLS-scoped reads via `useGymData` (profiles → gym + member_summary). Cloudflare
    Pages deploy steps + owner-onboarding SQL in `apps/dashboard/README.md`.
  - **Verified:** dashboard `npm run build` → **0 type errors** + Vite bundle OK; **mobile
    typecheck exit 0** after adding root tsconfig `exclude:["node_modules","apps"]` (hygiene so the
    two apps' typechecks never cross-pollute). No mobile source changed → offline demo intact.
  - **Adversarial review** (5 finders → skeptics, 10 agents): **3 LOW fixed / 2 refuted / 0
    HIGH-MED**; the **rls-schema-match** and **build-isolation** lenses came back CLEAN. Fixes:
    (1) `Login` shows a "check your email" notice when sign-up returns no session (confirm-ON /
    already-registered) instead of a silent no-op; (2) the "Longest streak" tile now reads
    `longest_streak` (was `current_streak` → collapsed when a streak broke); (3) `useGymData`
    generation guard + `<Authed key={userId}>` kill a cross-tab stale-response race.
  - **Owner setup to see data:** sign up → "Create your gym" (or adopt the IRON01 test gym via the
    one-line SQL in the README) → share the join code → members sync from the app.
  - **Deploy gate (owner):** create a Cloudflare Pages project (root `apps/dashboard`, build
    `npm install && npm run build`, output `dist`). No secrets — publishable key only.
  - **NEXT candidates:** the deferred **full monorepo move** (apps/mobile + packages/theme) if/when
    justified; or **Phase 3** (Gemini AI proxy). Await direction.

- 2026-07-08: **Monorepo move — Stage 1 (structural) DONE.** Converted to **npm workspaces**
  (owner-approved choice over the DECISIONS-locked pnpm — lower RN/Metro risk, no new tooling).
  Mobile app git-moved from repo root → **`apps/mobile/`** (202 tracked renames incl. `android/`);
  dashboard already at `apps/dashboard/`. Added root workspace `package.json` (workspaces
  `apps/*` + `packages/*`), `apps/mobile/metro.config.js` (watch workspace root + resolve hoisted
  `node_modules`), split `.gitignore` (root + `apps/mobile`), single root lockfile. CI
  `release-apk.yml` paths updated (`working-directory: apps/mobile/android`, keystore + artifact
  finds); `gen-keystore.yml` needed no change; `make-icons.mjs` is script-relative (moved with
  `scripts/`+`assets/`). **Android build is monorepo-SAFE** — `settings.gradle` + `app/build.gradle`
  resolve every dep via Node `require.resolve` (follows npm hoisting to the root `node_modules`),
  NO hardcoded `../node_modules`. **Verified locally:** `npm install` (663 pkgs, one lockfile) clean;
  **mobile typecheck exit 0**; **dashboard build exit 0**; `npx expo config` resolves (ForgeAI /
  com.forgeai.app / 8 plugins). **NOT locally verifiable:** the Gradle APK/AAB build (cloud-only) —
  needs a test tag to confirm CI paths hold.
- 2026-07-08: **Monorepo move — Stage 2 (shared theme) DONE.** Extracted the platform-neutral
  primitives (full `color` palette + `space` + `radius`, VERBATIM) into **`packages/theme`**
  (`@forgeai/theme`, source-only `.ts`). Both apps now single-source them: `apps/mobile/src/theme/
  tokens.ts` re-exports `{color,space,radius}` from the package and keeps its mobile-only bits
  (CVD `chart` palette, RN `gradients`/`shadow`/`motion`/`type`); `apps/dashboard/src/theme.ts`
  re-exports them + keeps its web `font`/CSS-`gradients`. Added `@forgeai/theme:*` dep to both.
  **Verified:** `npm install` links the package; **mobile typecheck exit 0**; **dashboard build
  exit 0** (Vite resolves the shared `.ts` package as source — 83 modules). No token VALUES changed;
  the mobile chart-series order is untouched.
- 2026-07-08: **Monorepo move — adversarial review CLEAN.** 5 finders (ci-android-build,
  native-metro-resolution, stale-path-refs, theme-fidelity, gitignore-hygiene) → **0 findings /
  0 HIGH-MED-LOW** (each did heavy file-read + grep investigation). Move committed in two stages:
  `c929f06` (structural) + `d237754` (theme). **ONE residual, inherent to cloud-only builds: the
  Gradle APK/AAB build is unverifiable locally — the owner should push a TEST TAG (e.g. a throwaway
  `v0.1.1-mono`) to confirm the updated CI paths produce a signed APK before relying on it.** All
  commits remain LOCAL/unpushed (see docs/OWNER-TODO.md).

- 2026-07-08: **PRODUCT PIVOT (owner) — manual workout tracker first, AI + nutrition last.**
  Near-term focus = a **Hevy-like manual workout tracker + analytics** (simple, clean, user-friendly,
  robust). **AI coaching AND nutrition/calorie tracking DEFERRED to the end** (chat/`localCoach` stays
  but isn't the focus; B2B2C **Phase 3 AI proxy moves after** the manual-tracker track). Recorded in
  `CONTEXT.md` (▶ CURRENT FOCUS) + `docs/PLAN.md` (PRODUCT PIVOT). **NEXT SESSION (fresh chat):
  deep-research Hevy + peers → write a manual-tracker PRD + phased plan → build phase by phase.**
  Note: workouts today are logged via the AI chat; a first-class manual flow (routines → active-session
  set logging → history/PRs/charts) mostly needs BUILDING on top of the existing DB + `src/engine`
  (all CONTRACTS-frozen — reuse via services, don't rewrite). B2B2C work (Phases 1/1.5/2 + monorepo)
  stays done and valid; all commits remain LOCAL/unpushed (see `docs/OWNER-TODO.md`).

- 2026-07-08: **Manual-tracker RESEARCH + PRD done — AWAITING OWNER APPROVAL (no feature code yet).**
  Deep Hevy/peers research via a 27-agent workflow (8 areas → 18 adversarial fact-checks vs primary
  sources → synthesis; 1 REFUTED = Strong uses Brzycki-only not Brzycki/Epley, so KEEP frozen Epley
  `epleyE1rm`; Hevy Pro = $2.99/mo & CSV export is FREE). Wrote **`docs/HEVY-RESEARCH.md`** (cited,
  grounded to the frozen schema) + **`docs/TRACKER-PRD.md`** (current-state assessment + 5-phase plan).
  **Codebase assessment:** the DB tables + `src/engine` + UI kit are all frozen and sufficient;
  `workoutRepo.addSets` already auto-numbers sets + runs PR detection; `exercise/[id]` already renders
  per-exercise analytics; **key gaps** = NO manual active-workout screen, NO history/library list, NO
  rest timer, and `planRepo` is READ-ONLY (no routine CRUD). Plan = NEW modules under a `src/tracker/`
  namespace (draft-in-memory active workout → `createSession`+`addSets` on Finish; prefs/draft in the
  frozen `meta` table; Phase-5 schema additions are purely additive via a new `initTrackerSchema`,
  never editing `schema.ts`/frozen signatures). **Open decisions for owner** (in PRD §8): tab structure
  (new tracker tab bar since frozen `TabBar` hardcodes icons), routine-editor placement (Phase 5a vs
  earlier), `expo-notifications`/`expo-keep-awake` for the rest timer, Home hero CTA repoint.
  Phasing: P1 log-a-workout (spine) → P2 rest timer + plate/warm-up math → P3 history + calendar →
  P4 library + exercise detail + export → P5 additive depth (routine editor, RPE, set types, ...).
  **Owner decisions LOCKED (2026-07-08):** (1) navigation = **new `TrackerTabBar`** → Home · Workout ·
  History · Progress · Profile, Coach demoted to a Home button (frozen `TabBar` untouched); (2) writable
  **routine editor = Phase 5a** (logger first; v1 substitute = seeded plan + Start-From-Plan +
  repeat-workout); (3) add `expo-notifications`+`expo-keep-awake` in P2; (4) repoint Home hero CTA to
  Start Workout (keep "Ask coach").

- 2026-07-08: **Manual tracker PHASE 1 DONE (log-a-workout spine) — typecheck green, adversarially reviewed, offline-firewall clean. Awaiting "continue" for Phase 2.**
  Owner approved the plan ("Go"). Built the first manual logging flow entirely as NEW modules (no frozen
  file edited): active-workout draft held in a Zustand store (`src/tracker/store/activeWorkoutStore.ts`),
  autosaved to the frozen `meta` table (`activeWorkoutDraft`) for crash recovery, committed on Finish via
  the FROZEN `workoutRepo.createSession({source:'manual'})` + `addSets` (auto set# + PR detection — no PR
  code written). PREVIOUS column + one-tap ✓ (haptic on finger-DOWN) + warm-up toggle; Start-Empty and
  Start-From-Plan (`coach.getTodaysWorkout` + `getActivePlan`).
  - **Added:** `src/tracker/` = store/activeWorkoutStore, services/finishSummary (session-scoped muscle
    split + `getSessionPrs` direct read of `personal_records`), components/{SetRow, ExerciseLogCard,
    ExercisePickerList, SessionSummary, WorkoutCard, **TrackerTabBar**}; routes `app/session/{active,
    add-exercise,finish,[id]}.tsx`; tabs `app/(tabs)/{workout,history}.tsx`.
  - **Edited (minimal, screens only):** `(tabs)/_layout.tsx` → new `TrackerTabBar` + tabs **Home · Workout ·
    History · Progress · Profile** (Coach hidden from the bar via a name filter, still navigable); `(tabs)/
    index.tsx` hero CTA → Start Workout.
  - **Nav note:** frozen `TabBar` hardcodes its icon map, so `TrackerTabBar` is a same-visuals copy with
    proper icons (History uses `calendar` — the Icon set has no `history` glyph). Full-screen logging flow
    lives under `app/session/*` to avoid a `/workout` tab collision.
  - **Review (5 lenses → 11 candidates → adversarial verify → 7 CONFIRMED, all fixed):** HIGH finish
    double-submit (added a `committing` guard in the store + disabled Finish while saving); MED PREVIOUS
    off-by-one once a warm-up precedes a working set (now mapped by WORKING-set ordinal in both
    `ExerciseLogCard` display and store `prevForSet` auto-fill); MED hydrate TOCTOU (post-await re-check +
    `hydrated` set on start/finish/discard); MED no KeyboardAvoidingView (added, iOS `padding`); muscle
    split day-scoped → **session-scoped** in finishSummary (day-range double-counted 2 same-day sessions);
    finish error-branch dead-end (added Done button); add-exercise double-tap pop (re-entry ref). The
    router-nav + frozen-file lenses came back CLEAN.
  - **Verify:** `npm run typecheck` exit 0; tracker has ZERO network imports (offline firewall intact —
    `dashboardStore.refresh` only piggybacks the pre-existing gated `maybeSync`). **Shipped as `v0.2.0`
    (first monorepo tag build GREEN → CI paths confirmed). APK:
    https://github.com/aucksy/ForgeAI/releases/download/v0.2.0/forgeai-v0.2.0.apk** — owner testing pending.

- 2026-07-08: **Manual tracker PHASE 2 DONE (rest timer + barbell math) — typecheck green, adversarially reviewed, offline + frozen-clean. Committed as v0.3.0; awaiting owner "tag it" for a test APK + "continue" for Phase 3.**
  Foreground rest timer + plate/warm-up calculators + swipe-to-delete/undo + keep-awake — **deliberately
  built with ZERO new native modules** (background/lock-screen notification via `expo-notifications` is
  DEFERRED because it forces an `expo prebuild` android/ regen, unverifiable locally). `expo-keep-awake` is
  already an autolinked transitive dep of expo (no android/ change).
  - **Added:** `services/plateMath.ts` (kg greedy per-side + closest-achievable), `services/warmupMath.ts`
    (40/60/80% ramp, reuses frozen `engine.roundToIncrement`; drops steps ≥ working weight / duplicates),
    `store/restTimerStore.ts` (ephemeral countdown; default in `meta['restTimerDefaultSec']`),
    `components/RestTimerBar.tsx` (±15/skip, haptic at zero), `components/PlateCalcSheet.tsx` (Modal).
  - **Edited (tracker-owned + the one allowed screen):** `store/activeWorkoutStore.ts` (DraftExercise gains
    optional `incrementKg`; `insertWarmupSets` prepend; `deleteSetWithUndo`/`undoDelete`/`dismissUndo` +
    `lastDeleted`); `SetRow.tsx` (gesture-handler `Swipeable` delete + auto-start rest timer on ✓);
    `ExerciseLogCard.tsx` (barbell plate button + Warm-up action); `app/session/active.tsx` (`useKeepAwake`,
    `<RestTimerBar>`, undo snackbar, load rest default, **skip() rest timer on unmount**).
  - **Adversarial review (3 parallel lenses — logic / RN-gesture / constraints):** constraints lens **CLEAN**
    (no frozen edit, no network, no schema change, no new native dep, only `meta` keys `activeWorkoutDraft`
    + `restTimerDefaultSec`). **6 confirmed bugs FIXED, 0 HIGH:** (1) rest-timer state leaked across workouts
    → phantom bar/haptic (fixed: `skip()` on active-screen unmount); (2) undo restored at a stale index after
    a warm-up prepend → corrupted set order/PREVIOUS (fixed: clear `lastDeleted` on prepend/remove-exercise
    of that exKey); (3) undo dead after removing the exercise (same fix); (4) warm-up-ONLY workout was
    finishable but invisible to history (fixed: `canFinish`/`finish` now require ≥1 working set); (5) warm-ups
    could meet/exceed the work weight on light lifts (fixed in `computeWarmups`); (6) first-frame inflated
    timer display (fixed: clamp to `durationSec` + reset baseline). **Deliberately NOT fixed (LOW):** a stray
    finger-down haptic if a swipe starts exactly on the ✓ — fixing needs the haptic on release, which breaks
    the [[android-haptic-on-down]] crispness rule; tradeoff favors crisp.
  - **Test tracking:** consolidated **`docs/TEST-CHECKLIST.md`** (Phase 1 untested items + Phase 2), owner to
    tick through on device. **NEXT:** owner "tag it" → tag `v0.3.0` for the APK; then "continue" → Phase 3
    (history calendar + weekly-streak + repeat/delete). Later P4 library/export, P5 routine editor + RPE.

- 2026-07-08: **Manual tracker PHASE 3 DONE (history calendar + weekly-streak + repeat/delete) — typecheck green, adversarially reviewed, committed local as v0.4.0 (NOT yet tagged). v0.3.0 (Phase 1+2) was pushed+tagged (build ran). Awaiting owner "tag it" (→ v0.4.0 APK) + "continue" for Phase 4.**
  - **Added:** `services/history.ts` (`getWeekStreak` — Hevy WEEKLY-streak semantics: consecutive weeks with
    ≥1 session, in-progress current week doesn't break; `restDays` since last workout; distinct from the frozen
    day-based `getStreakDays`). `finishSummary.ts` gains `volumeComparison` (playful weight tiers).
  - **Edited:** `store/activeWorkoutStore.ts` (`startFromSession` = repeat-a-workout: rebuilds a fresh draft
    from a past `SessionDetail` via `buildDraftExercise`); `(tabs)/history.tsx` (Week-streak + Rest-days
    StatTiles + a **13-week `Heatmap` calendar** via frozen `getConsistency(91)` + the feed); `session/[id].tsx`
    (**Repeat** + **Delete** — `deleteSession` frozen); `session/finish.tsx` (comparison hero line).
  - **Adversarial review (2 lenses: logic + nav/constraints) — constraints CLEAN; 1 MED + 4 LOW fixed, 0 HIGH.**
    **MED (both agents):** Repeat guarded on in-memory `active`, but the draft only hydrates on the Workout tab
    → cold-start → History → Repeat could OVERWRITE a persisted in-progress draft. **Fix: `await hydrate()`
    before the guard in `onRepeat` + a re-entry ref.** LOW: delete had no error path (added `.catch`); streak
    window capped ~53wk (→ ~3yr); history `Promise.all` over-broad catch could blank the feed if the streak read
    failed (→ per-promise catches).
  - `docs/TEST-CHECKLIST.md` updated (Phase-3 section, "needs v0.4.0"). typecheck green; zero network; no frozen
    file/schema/native change. **Deferred:** anatomical muscle-map SVG (frozen `Heatmap` + muscle `HBarList`
    suffice). **NEXT:** owner "tag it" → tag `v0.4.0`; "continue" → Phase 4 (exercise library tab + custom
    exercises + richer exercise detail + bodyweight + CSV/JSON export).

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
