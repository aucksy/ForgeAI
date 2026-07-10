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

- 2026-07-09: **Manual tracker PHASE 4 DONE (library + custom exercise + richer exercise detail + bodyweight + Excel export) — typecheck green, adversarially reviewed (3 lenses), offline + frozen-clean. Shipped as v0.5.0.**
  Owner scope (locked via AskUserQuestion): (1) exercise-detail = **replace** the 3 fixed charts with **one metric-switcher** chart; (2) bodyweight = **dedicated screen**; (3) export = a real **.xlsx** via the native **share sheet**; (4) IMPORT ("Migrate from Hevy") = **deferred to v0.6.0** (its own tag). Built entirely as NEW modules under `src/tracker/*` + new routes; only additive edits to owned SCREEN files.
  - **4a Library** — `app/library/index.tsx` + `tracker/components/LibraryList.tsx`: search (name+aliases), **2-axis** muscle×equipment `Chip` filter, a **Recent** section (from `getRecentSessionDetails`), rows → `/exercise/[id]`. Entry = a "Exercise library" `GhostButton` on the Workout tab. (Frozen `Icon` has no `search` glyph → used `dumbbell`.)
  - **4b Custom exercise** — `app/library/new.tsx` → frozen `createExercise` (unlimited). Name / primary muscle / equipment / optional secondary muscles / compound-vs-isolation / weight increment (default-by-equipment). **Exact normalized-name** dedup guard (NOT the fuzzy `findExerciseByName` — see review fix).
  - **4c Exercise detail** — `tracker/components/ExerciseMetricChart` (Chip switcher: Weight / Volume / e1RM / Best set over the frozen `LineChart`), `ExercisePrRows` (heaviest-weight + best-e1RM PRs + an xRM **"Set Records"** ladder; tap a record → its session), `tracker/services/exerciseAnalytics.ts` (pure: best-set series + xRM ladder from `ExerciseStats.history`). `exercise/[id].tsx` (owned screen) edited minimally: independent PR load + swapped `ExerciseCharts` → the switcher. **`components/exercise/ExerciseCharts.tsx` is now dead-but-present** (not frozen; optional later delete).
  - **4d Bodyweight** — `app/bodyweight.tsx` (quick-log → frozen `logBodyWeight` upsert-by-day, trend `LineChart`, entries list). Entry = a `scale` `IconButton` in the Progress-tab header. Trend already existed on Progress → not duplicated. *Delta pill shows all-time change (gain=green), consistent with the frozen `BodyWeightSection` + the muscle-oriented persona — deliberate.*
  - **4e Export** — `tracker/services/dataExport.ts` builds a clean, human-readable **.xlsx** (one row per set: Date/Start/End/Day Type/Notes/Exercise/Muscle/Equipment/Set/Set Type/Weight/Reps/Volume) via **SheetJS** → `expo-file-system/legacy` base64 write → **expo-sharing** share sheet. `tracker/components/ExportCard.tsx` in Settings → Backup & restore.
  - **Native deps:** added `xlsx` (pure JS) + `expo-sharing` (`~56.0.21`). **NO prebuild needed** — verified `android/settings.gradle` uses **dynamic autolinking** (`autolinkLibrariesFromCommand` + `useExpoModules()`, resolved from `node_modules` at build) and expo-sharing **ships its own `AndroidManifest.xml`** (SharingFileProvider + `sharing_provider_paths.xml` + SEND `<queries>`) that merges at Gradle build. `expo install` appended `"expo-sharing"` to app.json plugins — inert for this autolinking (non-prebuild) build; only matters if the project ever moves to CNG/prebuild. **BUILD NOTE:** the v0.5.0 tag build must confirm both autolink in the committed `android/` (dynamic autolinking, low risk, netinfo-style); if the share ever crashes with "no FileProvider" the fallback is an `expo prebuild` regen + re-apply the CI signing block.
  - **Adversarial review (3 parallel lenses — correctness / constraints+offline+native / RN-UI+nav):** constraints & RN-UI lenses **CLEAN** (all icons/props/routes verified; no frozen file touched; autolinking claim verified sound; zero network in the tracker). Correctness lens: **2 MED fixed** — (1) empty export opened the share sheet over a header-only file *before* the "nothing to export" guard → early-return in `exportWorkoutsXlsx` when `rowCount===0`; (2) custom-exercise dedup used the fuzzy `findExerciseByName` (would block "Bulgarian Split Squat" because it contains "Squat") → switched to an exact normalized-name check. **2 LOW documented, no change:** bodyweight delta baseline/color (deliberate, see above); the defensive `isWarmup` filter in `exerciseAnalytics` is dead (history is already working-sets-only) but harmless, and bodyweight/0-kg movements get a flat "Best set" line + empty ladder (acceptable — nothing to plot).
  - **Verify:** `npm run typecheck` exit 0; zero network in `src/tracker/*`; no frozen file/schema/native-signature change. `docs/TEST-CHECKLIST.md` updated (Phase-4 section). **NEXT (v0.6.0): Phase 5-adjacent — "Migrate from Hevy" import** (`expo-document-picker` + SheetJS parse of the Hevy `.xlsx`: 14-col schema, kg already, 95→custom-exercise fuzzy match + muscle-keyword classifier + equipment-from-suffix, dayType inference, warmup/dropset→isWarmup, skip duration/distance rows, clear-then-import + idempotent by timestamp). Then Phase 5 (writable routine editor + RPE/set-types).

- 2026-07-09: **"Migrate from Hevy" import DONE (v0.6.0) — typecheck green, empirically verified against the owner's real export, offline + frozen-clean.** A shipped, user-facing migration so any user can bring their Hevy history in. Built entirely as NEW modules under `src/tracker/*` + a new route; only additive edits to owned screen files.
  - **Owner decision (AskUserQuestion):** exercise matching = **EXACT normalized-name match else create** (NOT the literal-spec fuzzy `findExerciseByName` — chosen to honor the v0.5.0 dedup lesson: fuzzy would false-merge "Squat (Bodyweight)"/"Incline Bench Press (Barbell)" into base "Squat"/"Bench Press" and pollute PRs with mixed-equipment/0 kg sets).
  - **Added:** `tracker/services/hevyImport.ts` — pure `parseHevyBase64` (SheetJS; groups rows into workouts by `start_time`, oldest→newest so PRs accrue in real order), pure classifiers (`parseHevyDate` "D Mon YYYY, HH:MM"→local ms; `classifyMuscle` ordered keyword rules; `classifyEquipment` "(…)" suffix whitelist; `inferDayType`), `previewImport` (no writes), `runImport` (writes). **Atomic import in ONE `getDb().withTransactionAsync`** (non-exclusive — verified from expo-sqlite source: it brackets BEGIN/COMMIT on the SHARED connection so the `getDb()`-based FROZEN repos participate; `withExclusiveTransactionAsync` uses a NEW connection and WOULD deadlock them, which is why the seed uses raw `tx.*`). Reuses `createSession({source:'manual',startedAt,endedAt})` + `addSets` (its auto set-numbering AND PR detection — no PR code written), `createExercise` (once per distinct title, cached), `deleteSession` (Replace wipe). Idempotent by `startedAt` (skip a workout already present → safe re-run).
  - **Added routes/UI:** `app/import/index.tsx` (auto-registers `/import`: pick → **preview** [workouts/sets/exercises·N new/skipped/date range] → **Replace [default] / Merge** with a destructive warning → determinate **progress** + `useKeepAwake` → result summary); `tracker/components/ImportCard.tsx` mounted in `(tabs)/settings.tsx` → Backup & restore (beside Export).
  - **Native dep:** `expo-document-picker ~56.0.4` via `expo install` — self-contained autolinked module, **NO prebuild** (confirmed `android/settings.gradle` uses `autolinkLibrariesFromCommand`+`useExpoModules`; app.json plugins untouched). Reads a LOCAL file only (`expo-file-system/legacy` base64 → SheetJS); SheetJS auto-detects real Hevy `.csv` (text) OR a mislabelled `.xlsx`.
  - **MAPPING (locked, verified):** title→dayType (+ original kept in `notes`, mojibake emoji stripped); start/end→timestamps+local day; exercise_title→exact match else create (muscle via classifier, equipment via suffix); `warmup`→isWarmup, `normal`+`dropset`→working; null weight (bodyweight)→0; **SKIP rows with null reps** (duration/distance-only: Plank, Treadmill); DROP rpe/superset/notes/description (deferred).
  - **Verification (agents whiffed on an env glitch → did it directly):** (1) pure-logic harness over the REAL 8816-row file → **487 workouts / 8811 sets / 93 exercises** (Plank+Treadmill correctly excluded, all rows skipped), date 2022-05→2026-07, **muscle classifier only 2 harmless fallbacks**, all tricky collisions right (Iso-Lateral Chest→chest, Iso-Lateral Row→back, Face Pull→shoulders, RDL→hamstrings vs Deadlift→back, Seated Incline Curl→biceps), **all 24 dayTypes correct** incl. "Triceps, Upper Chest…"→push & "Lower Body & Core"→lower; (2) orchestration harness mirroring `runImport` → Replace wipes+imports 487/8811, exact-match reuses (92 created when 1 pre-exists), Merge #1 adds 487, **Merge #2 re-run fully idempotent (0 imported / 487 skipped / 0 dup exercises)**; (3) expo-sqlite tx semantics + DocumentPicker/FileSystem-legacy API shapes + Screen scroll-false layout confirmed from installed sources; (4) `npm run typecheck` exit 0; zero network; no frozen file/schema/native-signature change. **Adversarial correctness review (deep, 1 agent — the other two hit an env glitch): NO HIGH; core tx/idempotency/atomicity confirmed correct.** Fixed **1 MED + 2 LOW:** (M1) idempotency keyed on a LOCAL-epoch `startedAt` would let a device-timezone change between a first import and a Merge re-run duplicate the ENTIRE history (breaking the "safe to re-run" promise) → `parseHevyDate` now interprets the wall-clock as **UTC (`Date.UTC`)** + `dateISO` from UTC getters, so a workout's identity + day are timezone-stable (durations/ordering preserved); (L1) `previewImport` dedupes "N new" by normalized name so the preview matches what `runImport` creates; (L3) skip label → "no reps" (accurate); (L4) Replace copy → "Delete ALL N…" (honest for self-logged workouts). Left as deliberate: close-grip bench → chest primary.
  - `app.json` version → **0.6.1**. Ship note: v0.6.0 was tagged first (build #11 = the feature), then the review-fix (M1 tz-idempotency + LOWs) landed; force-moving a PUBLISHED tag is disallowed (rewrites remote history), so the reviewed build ships as **v0.6.1** — the install target. v0.6.0 is the superseded initial tag. **NEXT = Phase 5 (writable routine editor + RPE/set-types + drop/failure set types + supersets).** Deferred still: rpe/superset/exercise-notes carry-over from Hevy; background rest-timer notification; lb units.

- 2026-07-09: **Manual tracker PHASE 5a DONE (writable routine editor) — typecheck green, adversarially reviewed (2 lenses), offline + frozen-clean. Shipped as v0.7.0.**
  Owner decisions LOCKED via AskUserQuestion 2026-07-09: (1) routine model = **edit days within the single active plan** (NOT a multi-plan manager) — preserves the frozen `getActivePlan`/`getTodaysWorkout` rotation exactly; (2) Phase 5 ships **split** — 5a routines (v0.7.0, no schema) then 5b RPE+set-types (v0.8.0, first additive schema); (3) RPE/set-types will be **opt-in, hidden by default** (5b). Built entirely as NEW modules + routes; only additive edits to two owned files.
  - **Added:** `src/tracker/db/routineRepo.ts` — full CRUD over the FROZEN plan tables (`workout_plans`/`plan_days`/`plan_exercises`), the write path the read-only frozen `planRepo` lacks. A "routine" == one `plan_day` in the active plan. Fns: `ensureActivePlanId` (creates a "My Routines" active plan if none; keeps the single-active invariant), `listRoutines`/`getRoutine` (reuse frozen `getActivePlan`), `createRoutine`, `updateRoutine`, `deleteRoutine` (exercises cascade via FK), `duplicateRoutine`, `reorderRoutines`, `addExerciseToRoutine`, `updateRoutineExercise`, `removeRoutineExercise`, `reorderRoutineExercises`. **NO schema change** — writes only to existing tables/columns.
  - **Added routes:** `app/routines/index.tsx` (routine list — start/edit/new, cold-start-safe start-guard), `app/routines/[id].tsx` (editor — rename, day-type chips, per-exercise Sets/Rep-min/Rep-max steppers, up/down reorder, add/remove, duplicate, delete, start), `app/routines/add-exercise.tsx` (routine-scoped `ExercisePickerList`).
  - **Edited (tracker-owned + one allowed screen):** `store/activeWorkoutStore.ts` (new `startFromPlanDay(dayId)` action — start a workout from a SPECIFIC routine, reusing `buildDraftExercise` for PREVIOUS prefill); `(tabs)/workout.tsx` (added a "Routines" `GhostButton`).
  - **Adversarial review (2 lenses — correctness/logic + constraints/frozen-file):** constraints lens **CLEAN** (git-verified: only the 4 new files + 2 allowed edits changed; no frozen/schema/network touched; every UI-kit prop + Icon name + route verified). Logic lens: **3 fixed, 2 accepted-as-documented, 0 HIGH.** Fixed: (1) **MED** rapid reorder taps opened overlapping `withTransactionAsync` → nested BEGIN throws + double ROLLBACK → optimistic UI silently diverged from DB → added a module-level `serialize()` promise-chain in routineRepo so reorder transactions never overlap (+ `.catch(reload)` on the caller); (2) **LOW/MED** add-exercise had no `.catch` → a DB-write failure froze the picker (stuck `picked` ref) → added catch that resets + alerts; (3) **LOW** an uncommitted rename was clobbered by the on-focus reload when returning from Add-exercise → seed the name field **once per routine id** (ref-keyed, reseeds on duplicate's `router.replace`) + commit the rename before that push. **Accepted (documented, consistent with house style):** an empty new routine can surface as "No plan for today" on its rotation slot (the frozen coach can't be edited to skip empty days; user adds exercises or deletes — self-correcting); optimistic local-state + fire-and-forget local-SQLite writes (same pattern as the existing `void persistDraft` in the store — local writes ~never fail).
  - **Verify:** `npm run typecheck` exit 0; zero network in `src/tracker/*` + `app/routines/*`; no frozen file/schema/native-signature change. `docs/TEST-CHECKLIST.md` updated (Phase-5a section). **NEXT = Phase 5b (RPE + drop/failure set types)** — introduces `src/tracker/db/trackerSchema.ts → initTrackerSchema()` (idempotent, PRAGMA-guarded `ALTER TABLE set_entries ADD COLUMN rpe/set_type/note`, called once from `app/_layout.tsx` after `initDb()`; `is_warmup` stays authoritative so drop/failure are working sets and all frozen volume/PR queries are unaffected) + a new `addSetsWithMeta` write path (reuse frozen `addSets` for set# + PRs, then UPDATE the new columns by id) + opt-in RPE/set-type UI + the deferred Hevy `rpe` carry-over. Then optional 5c (supersets + per-set notes).

- 2026-07-09: **Manual tracker PHASE 5b DONE (RPE + drop/failure set types — FIRST additive schema) — typecheck green, adversarially reviewed (2 lenses, both clean), offline + frozen-clean. Shipped as v0.8.0.**
  The first tracker phase to add DB columns — done purely ADDITIVELY, `schema.ts` + every frozen signature untouched. Owner decision (2026-07-09): RPE/set-types are **opt-in, hidden by default**.
  - **Migration (the headline):** `src/tracker/db/trackerSchema.ts → initTrackerSchema()` — idempotent, PRAGMA-`table_info`-guarded `ALTER TABLE set_entries ADD COLUMN rpe REAL / set_type TEXT / note TEXT` (nullable, no default), gated by a `meta['tracker_schema_version']` flag, called **once from `app/_layout.tsx` after `initDb()`, before `ensureSeeded()`**. `schema.ts` is NEVER edited. Safe because: new cols are nullable → existing/seed rows get NULL; frozen `SELECT *` readers use hand-written mappers that ignore extra cols; the seed's `batchInsert` names its 7 columns explicitly; a kill mid-migration self-heals (flag stamped only after all cols exist).
  - **The invariant that makes it free:** `is_warmup` stays **authoritative** — every frozen "working set" query filters `is_warmup = 0` and never reads `set_type`. So `set_type` is a pure decoration: warm-up ⟺ `is_warmup=1`+`set_type='warmup'`; **drop/failure are WORKING sets** (`is_warmup=0`, `set_type='drop'|'failure'`) that correctly count toward volume/PRs. **Zero frozen query changed.**
  - **New write/read path (frozen `addSets` signature can't change):** `src/tracker/db/trackerSets.ts → addSetsWithMeta` REUSES frozen `addSets` (keeping its auto set-numbering **and** PR detection), then UPDATEs rpe/set_type/note on the returned rows **by id** (order-safe; `created[i]↔sets[i]`). `getSessionSetMeta` reads them back (older rows default to `'normal'`/null).
  - **Threaded through:** `DraftSet` gains optional `rpe`/`setType` (old drafts still hydrate); store actions `setSetType`/`setRpe`; `finish()` builds `RichSet[]` → `addSetsWithMeta`. `SetRow` (opt-in via `trackerPrefsStore.advancedSets`): SET cell shows the type glyph W/D/F, a compact 2nd line adds Normal·Warm·Drop·Fail chips + an RPE input (Android-safe inline chips, NOT a >3-button Alert). `SessionSummary`/`finishSummary` overlay D/F prefixes + `@RPE` on the recap chips (read via `getSessionSetMeta`). New `src/tracker/store/trackerPrefsStore.ts` (zustand+persist, key `forgeai-tracker-prefs`), toggle mounted in `(tabs)/settings.tsx` → new "Workout" group. **Landed the deferred Hevy carry-over:** `hevyImport` now parses `rpe` + `dropset`/`failure` set types → `addSetsWithMeta` (superset/notes still deferred to 5c).
  - **Edited (tracker-owned + 2 sanctioned screens):** `store/activeWorkoutStore.ts`, `components/{SetRow,SessionSummary}.tsx`, `services/{finishSummary,hevyImport}.ts`, `app/_layout.tsx` (the one migration call), `(tabs)/settings.tsx` (the toggle). NEW: `db/{trackerSchema,trackerSets}.ts`, `store/trackerPrefsStore.ts`.
  - **Adversarial review (2 lenses — correctness + constraints):** constraints **CLEAN** (git-verified: `schema.ts` diff EMPTY, frozen `addSets` signature unchanged, no new native dep, no network, all UI-kit props valid). Correctness **0 HIGH / 0 MED**, 2 LOW: (1) RPE was persisted on warm-up rows (hidden — the only reader gates on `!isWarmup`) → **fixed** (`rpe: isWarmup ? null : …` in both `finish()` and `hevyImport`, mirroring how `setType` is nulled); (2) one UPDATE-per-set on a big import (~8.8k extra statements, atomic in the one tx) → **accepted** (folding into the insert would touch frozen `addSets`).
  - **Verify:** `npm run typecheck` exit 0; zero network in `src/tracker/*`; **no frozen file/schema/native-signature change** (columns exist only at runtime via the additive ALTER). `docs/TEST-CHECKLIST.md` updated (Phase-5b section incl. an **upgrade-over-prior-build** migration check). **NEXT = optional Phase 5c** (supersets — `set_entries.superset_group` via `TRACKER_SCHEMA_VERSION` bump to 2 — + per-set/exercise notes + their Hevy carry-over) OR pivot to the deferred AI/nutrition track. Await direction.

- 2026-07-09: **Manual tracker PHASE 5c DONE (supersets + per-exercise notes) — typecheck green, adversarially reviewed (constraints CLEAN, correctness 0 HIGH/MED), offline + frozen-clean. Shipped as v0.9.0.** The second additive-schema bump. Completes the Hevy carry-over (superset/notes were the last deferred bits).
  - **Migration (`TRACKER_SCHEMA_VERSION` 1→2):** `initTrackerSchema()` gains an idempotent PRAGMA-guarded `ALTER TABLE set_entries ADD COLUMN superset_group INTEGER` (nullable). All four ensureColumn calls run when `stored<2` (rpe/set_type/note no-op via the PRAGMA guard); stamped 2 after. `schema.ts` still NEVER edited; the `_layout.tsx` call was already there from 5b (unchanged). Upgrade paths verified: fresh / 5b-install(stored=1) / pre-5b(stored=0→jumps straight to v2) all converge.
  - **Supersets:** a "routine"-style per-workout grouping. `set_entries.superset_group` (int; same int = same superset, NULL = ungrouped). `DraftExercise.supersetGroup`; store `setSupersetGroup`; `finish()` stamps every set of a grouped exercise. New `components/SupersetSheet.tsx` (a plain RN Modal chooser — Start new / Join existing / Remove; NOT a Compose sheet, so no swipe-veto risk) + `lib/superset.ts` (`supersetLabel` 1→A). `ExerciseLogCard` gains an accent left-border + "Superset A" header badge + a "Superset" action; `active.tsx` computes the workout's distinct groups once and passes them down (no per-card store subscription). `SessionSummary` shows the badge (read from `getSessionSetMeta`).
  - **Per-exercise notes:** reuses the `note` column added (but unused) in 5b — no new column. `DraftExercise.note`; store `setExerciseNote`; `finish()` writes it to the exercise's **first committed set** (becomes set_number 1); `ExerciseLogCard` gets an "Add note" toggle → a multiline field (local-state + sync-back, SetRow pattern); `SessionSummary` reads the first non-null note per exercise + renders it under the name.
  - **Hevy carry-over (the last deferred bits, now landed):** `hevyImport` parses `superset_id` (remapped per workout to distinct group ints 1..n, so exercises sharing a Hevy superset get the same group) + `exercise_notes` → per-exercise note on set 1; both via `addSetsWithMeta`. Safe when the columns are absent (asString(undefined)→null). Owner's real file has all-null supersets → no-op (correct). Idempotency/atomicity unchanged (one `withTransactionAsync`).
  - **Files:** NEW `tracker/lib/superset.ts`, `tracker/components/SupersetSheet.tsx`; EDITED `tracker/db/{trackerSchema,trackerSets}.ts`, `tracker/store/activeWorkoutStore.ts`, `tracker/components/{ExerciseLogCard,SessionSummary}.tsx`, `tracker/services/hevyImport.ts`, `app/session/active.tsx`. (No `_layout.tsx`/`settings.tsx` change — 5c needed neither.)
  - **Adversarial review (2 lenses):** constraints **CLEAN** (verified directly after the 2nd agent hit the known env-glitch: `git diff schema.ts` EMPTY, frozen `addSets` sig unchanged, package.json diff EMPTY = no new native dep, zero network, all Icon/Badge props valid incl. `zap`/`chat`). Correctness **0 HIGH / 0 MED, 1 LOW** (accepted+documented): if the **same exercise is added twice** in one workout, the frozen `buildDetail` groups by `exercise_id`, so the summary shows the first instance's badge/note — values still persist correctly per row; inherent to the frozen grouping model.
  - **Verify:** `npm run typecheck` exit 0; zero network in `src/tracker/*`; no frozen file/schema/native-signature change (`superset_group` exists only at runtime). `docs/TEST-CHECKLIST.md` updated (Phase-5c section incl. upgrade-migration + duplicate-exercise checks). **The manual tracker is now feature-complete vs the Hevy target** (spine · rest timer/plate/warm-up · history/calendar/streak · library/custom/detail/bodyweight/export · Hevy migration · writable routines · RPE/set-types · supersets/notes). **NEXT = owner's call:** pivot to the deferred **AI/nutrition track** (B2B2C Phase 3 Gemini proxy, or nutrition logging) now that the tracker is solid, or polish/settle.

- 2026-07-09: **Groq AI provider added (v0.9.2) — typecheck green, adversarially reviewed (no bugs), no frozen tracker file touched.** Owner will use **Groq** (not the B2B2C-planned Gemini) for the in-app coach. Groq is OpenAI-compatible, so the OpenAI provider was refactored into a reusable `chatOpenAiCompatible(cfg{baseUrl,label,maxTokensField})` core; `ai/providers/groq.ts` wraps it (base `https://api.groq.com/openai/v1/chat/completions`, `max_tokens`, label 'Groq'). Wiring: `AiProviderId += 'groq'` + `AiSettings.groqModel`; `ai/models.ts` `DEFAULT_GROQ_MODEL='llama-3.3-70b-versatile'` + `GROQ_MODELS` (Llama 3.3 70B / GPT-OSS 120B / Kimi K2 / Llama 3.1 8B — slugs editable if Groq rotates them); `lib/keys.ts` `get/setGroqKey` (SecureStore `forgeai.groq_api_key`, `gsk_…`); `orchestrator` routes provider 'groq' (key→chatGroq→groqModel; no key → local fallback + hint); Settings gets a **Groq** provider chip + model picker + API-key field. `settingsStore` persist gained a `merge` that deep-merges the nested `ai` object so existing users backfill `groqModel` (verified: keeps their prefs + the store's action fns; fresh install OK). **Groq guard:** its text models can't see images → a meal photo on Groq replaces the photo prompt with a "photo needs Claude/OpenAI" note instead of a 400. Review (1 focused agent): **0 correctness bugs**; the photo-vision limitation was the only finding (now handled). Not a tracker phase — the AI layer legitimately uses network; offline demo unaffected (defaults to local until a key is set).

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
