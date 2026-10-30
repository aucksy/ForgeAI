# ForgeAI progress

## Done
- 2026-10-30: **T66 built, switch OFF** (#30 option A, Starter vs Pro). One map in packages/theme/src/plans.ts: `PLAN_GATE_ON = false` + `hasFeature(gym, feature)`; Pro = branding, shop, challenge, workoutOffer, trainerPlans (workout + diet plans + measurements), yourNumbers; 'pro' and 'ai' (Pro + AI) get all; founding/Own it are already written as 'pro' (0030). No pack / unknown / missing function / offline = everything on. Reads gyms.plan (0030) through NEW read-only 0046_gym_pack.sql (owner_gym_pack, member_gym_pack) + supabase/tests/0046_gym_pack.sql: NOT applied live. Admin app: GymPackProvider + ProPage on Shop, Challenges, Workouts, Diet, Numbers/Growth, Settings > Branding; ProNote inside Messages (offer), Today (Your numbers), MemberDetail (plans). Member app: hides brand look + home-screen logo, shop, board, offer, plan/diet/measure sync for Starter (no sales note: members cannot buy Pro). Turning on needs the owner's yes: apply 0046, check packs in HQ, flip the switch, ship app + deploy admin. Tests: mobile 3859+ pass (only exercisePictures.test fails in a worktree: its pictures are gitignored), typecheck 0; dashboard 1450 pass, tsc -b 0. Fresh-reader pass fixed 2 lines (where Send feedback is; what the workout offer gives).
- 2026-10-30: **Website prices (#30 A, R-229, T65)**: mettleup.fit and the owner panel now say Starter ₹999/₹9,990, Pro ₹1,499/₹14,990, Pro + AI ₹2,499/₹24,990 (coming), extra branches half price, founding ₹29,999 for the first 25 gyms until 31 Mar 2027 (English + Hindi). Plan table follows the approved Starter/Pro split (the app does not enforce it yet: T66). Added QR check-in, desk webcam photos and the Wear OS watch line; tiles.webp and dues-list.webp re-shot from the admin app. Owner-panel tests 68 pass, landing e2e 8 pass, new price-copy check. Commit ac2873a9, deployed and checked live.
- 2026-10-30: **0.62.1** (R-228): "Check in" / "Scan the poster" opened Android's STILL_IMAGE_CAMERA intent, which on many phones just takes a photo. Now an in-app QR scanner (expo-camera ~56.0.8, CameraView, QR only, live camera only per R-152): new route /scan (ScanPosterScreen.tsx), pure posterRoute() in scanPoster.ts sends /c/CODE to check-in and /j/CODE to join. Permission: asks once, then Allow camera, then Open Settings; re-reads on app resume (review fix). Wrong-QR line clears after 4 s. Fresh-reader word pass applied. Tests: r152 guard + posterRoute cases; settingsJoinGym updated. Also: (1) a crash when a gym push arrived (qa-journeys 41012405375 J3: NPE in expo-task-manager TaskService.executeTask on the Firebase thread, a race on the static sEvents HashMap with notifyTaskFinished on the main thread) is fixed by scripts/patch-native.js, a root postinstall that wraps both sides in synchronized(sEvents) and fails the install if the library changes; (2) phone-test scripts caught up with 0.62.0: part R taps "My gym" before Check in (R-225), part C scrolls to the Easier/Harder line under the new How to pictures (C's stop also failed D and F). Part R's stock-back check can flake when the default and owner runs order the FORGE1 shaker at the same time (run 41012400770: 24 vs 25). (3) Device QA 41025681054 W4: native SIGSEGV in React Native 0.85 FabricUIManagerBinding::findNextFocusableElement (ShadowTreeRegistry::enumerate) as the Rename workout box opened; MainApplication.kt now force-overrides the stable flag set with enableCustomFocusSearchOnClippedElementsAndroid=false (only keyboard/TV focus into clipped rows used it). (4) Part R owner 41025683445 tapped the floating Send feedback button while the list was still scrolling: waitForAnimationToEnd before More for Jaipur. (5) Owner run 41042338951: the stock-back flake again (24 before, 25 after: another run's order was open at the first read); the end check now accepts the first count up to +3, and a lower count still fails. Same run: crash scan clean, so the SIGSEGV fix holds. First try of that check failed in both runs (41058073501/41058076399: SyntaxError, Maestro cuts ${...} at the first closing brace); rewritten as three brace-free evalScripts. Those output.* values were gone ("undefined") at the end check after the sub-flows in between (runs 41077579109/41077583876); the accepted counts are now built inline from maestro.copiedText in the end check itself (tested in node: N..N+3 pass, N-1 and N+4 fail). Also qa_report.py: part P2 runs as part-p2a/part-p2b and showed "no result file" when both passed; it now takes its halves' result. Website test money J1 timed out once on Start demo (CI 41025664836); it passed on the next two commits with the same code.
- 2026-10-30: **0.62.0** (R-224, R-225): Gym tab has its own tabs (Shop first when on, My gym, Leaderboard; gymTab.ts gymSections). Voice feedback falls back to expo-file-system File.upload (native multipart, same form) when the RN FormData fetch throws; both errors go to /api/crash as non-fatal. What's new never waits behind a closed notice. Desk: member report CSV re-written through csvField (formula cells as text); AI import keeps same-kind rule columns. Ships F20, F63, F64, F67, F150, F121 to members. Review fixes: gym reminder taps and What's new Gym buttons open their part (gymSectionRequest.ts store; go.section), My orders shows in My gym when the shop is off, a timed-out voice send is never re-sent (timedOut()), neutral leaderboard empty text. 339 test files / 3862 tests, typecheck clean.
- 2026-10-30: **F121 built** (merged 8971d1f8 + ebe2c43b): desk asks for a member's workout report, member says yes in the app, desk downloads. 0045 on staging twice OK, its test PASS (64 checks), security PASS (9). Fresh-reader word pass done; server date reader now reads only start,end pairs. Live table waits on #77.
- 30 Oct: F150 "Ask the desk to freeze or renew" built on branch feat/freeze-renew-request (NOT merged, NOT applied live). Migration 0044_plan_requests.sql (additive: gym_plan_requests + 6 key-checked functions; RLS on, no grants on the table; one pending request of each kind; 6 a day). Member app: "Pause my plan" / "Renew my plan" on the plan card (pause calendar, plan list, "Request sent. The desk will confirm.", the desk's answer until "Got it"); hidden while the server answers PGRST202. Admin panel: "Requests from the app" card on Today; Approve runs F81's own extendMembership / sellMembership first (renewal: sell-sheet defaults, nothing collected, requestId = request id) and the server checks that record (freeze note mark "app #<8>" / sale requestId) before approving; hidden until 0044. SQL test 63 checks (PGlite, + re-apply). No push notification (in-app message only).
- 30 Oct: F20 merged (Start/End pictures for 243 exercises from RepDB free; pictures are NOT in git, public repo + licence term 3; .github/actions/exercise-pictures fetches RepDB @d5e09343 and shrinks them in every build workflow, cached). F64 merged (speed/incline/level per cardio set, schema 14->15 additive). Main 3834 tests, typecheck clean.
- 29 Oct: F63 1-rep max and % calculator merged (exercise Summary link + plate calculator link; fresh-reader word fixes). F67 watch install prompt merged. Test server "mettleup-staging" made and matched to live (0001-0042).
- 2026-10-29: R-207 watch UI rebuilt to the designer's "Ring" hand-off (direction 2a; not built or
  committed yet, needs the cloud wear build). Glance-only: the app screen's "Complete set" is gone
  (notification buttons kept). Seven screens chosen from state (`ScreenSelector`, WatchLayout.kt):
  heart-rate and rest-alert permission screens (the only taps, replacing the old auto-request),
  phone not connected (NodeClient poll, 2 empty checks), nothing open, rest timer, NEW "Rest is
  over" (orange, overtime counting up; `overAt` set on the buzz, cleared by a new rest, the phone's
  next row changing, or the workout closing), between rests (set segments). Manrope bundled
  (OFL, static 500-800). Render gate now shoots all 12 hand-off screens + ambient twins + 9 edge
  cases at 384/456 round; new JVM `WatchLayoutTest` (ring/segment maths, selector, copy).
  Removed: markSent / sendFailed / sentRecently / Snapshot.done, the "Allow alarms" and
  "Allow notifications" lines.
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

- 2026-07-09: **APK size cut ~105 MB → ~56 MB (v0.9.3).** Diagnosed via `unzip -l` on the release APK: **~88 MB (84%) was native `.so` libs duplicated across 4 ABIs** in the single universal APK (x86_64 24.6 + x86 24.5 + arm64-v8a 23.1 + armeabi-v7a 16.0). It's a proper minified release (CI runs `assembleRelease bundleRelease`), so the bloat was purely the 4× ABI multiplication, not debug. **Fix (owner chose arm64+armv7 via AskUserQuestion): `android/gradle.properties reactNativeArchitectures=armeabi-v7a,arm64-v8a`** — drops the two **emulator-only** x86 ABIs (~49 MB), runs on every real phone incl. old 32-bit. (arm64-only would've been ~40 MB but drops 32-bit devices.) The Play **AAB** (CI already builds it) delivers per-ABI regardless, so Play downloads were already ~30-40 MB; this only shrinks the **direct-download APK**. Note `expo.useLegacyPackaging=false` keeps .so uncompressed in the APK (faster install, bigger file) — flipping to true would compress them further but wasn't done (install-time tradeoff).

- 2026-07-09: **NEXT DIRECTION CHOSEN (owner) — "Elevate the AI Coach."** The Hevy-style manual tracker is
  feature-complete (Phases 1–5c, v0.9.3), so the next track returns to the app's moat: make the AI coach
  proactive + data-grounded, powered by the engine + the owner's Groq key. Plan written to
  **`docs/AI-COACH-PLAN.md`** (phases **C1** coach-at-logging [surface the frozen `computeOverloadTarget` in
  the active-workout UI — deterministic, offline, the USP move] → **C2** post-workout coach note → **C3**
  smarter Groq-powered chat using the new tracker data [routines/RPE/supersets tools + system-prompt upgrade
  + a light grounding guard] → **C4** optional Home nudges). A FRESH CHAT executes it phase by phase (same
  frozen-file rules, offline-first, ship-after-review). No feature code yet.

- 2026-07-11: **AI Coach PHASE C1 DONE (coach at the point of logging) — typecheck green, adversarially reviewed (0 HIGH/MED), offline + frozen-clean. Shipped as v0.10.0.**
  The USP move: surface the FROZEN progressive-overload prescription **inside the active-workout screen**, not just the Coach tab. Built as ONE new tracker read service + additive edits to two owned files; **no frozen file / schema / network touched** (deterministic, offline).
  - **Added:** `src/tracker/services/coachTargets.ts` — `getTargetsForPlanDay(planDayId): Promise<Map<exerciseId, OverloadTarget>>`. Pure read: `getActivePlan()` → find the day → for each `PlanExercise` drive the **frozen** `computeOverloadTarget` with `getExerciseHistory(id,5)` filtered `dateISO < today` `.slice(0,4)` — **byte-identical inputs to `services/coach.ts`**, so for today's rotation day the numbers match the Coach tab exactly, and for any other routine day it's the correct prescription for THAT day's rep ranges. Empty map when `planDayId==null` (Start-Empty / repeat-session / ad-hoc) → those exercises simply get no prescription (a rep range only lives in the plan).
  - **Edited (owned):** `tracker/components/ExerciseLogCard.tsx` — new optional `target?: OverloadTarget | null` prop renders one **inline line** between the header and the SET/PREV column header: `target` icon + `Target 82.5 kg × 8` (accentBright) + an action `Badge` (Progress/Hold/Deload/Start — same `ACTION_BADGE` tones as the Coach tab's `WorkoutPlanCard`), **tap to expand the coach's one-sentence `reason`** (the "why"). Null target → renders nothing → Start-Empty is byte-for-byte the prior 2-tap flow. `app/session/active.tsx` — subscribes `planDayId`, loads the targets map in an effect keyed on `planDayId` + the exercise-id list (recomputes when a plan exercise is added mid-session; editing weights/reps does NOT refetch), `cancelled` guard vs setState-after-unmount, passes `target={targets.get(ex.exerciseId) ?? null}` per card. Not persisted in the draft, not in `finish()` — purely derived display.
  - **UI fork (owner via AskUserQuestion):** inline always-visible line + tap-for-why (over a collapsed "Coach" chip) — keeps the number glanceable while logging, the reason opt-in.
  - **Adversarial review (1 focused agent):** **0 HIGH / 0 MED**; verified number-parity with the Coach tab, all planDayId start-paths (startFromPlan = today's rotation day; startFromPlanDay = a routine day, always present in the active plan by construction; hydrate/deleted-plan → empty map, graceful), the effect's race/deps, the null-target byte-for-byte path, and every Icon/Badge/token exists. 2 LOW cosmetic (mid-session plan-edit staleness = unreachable from the full-screen session; dedup comment wording — tightened). No fix needed.
  - **Verify:** `npm run typecheck` exit 0; zero network in the 3 touched files; git-confirmed no `engine`/`services`/`components/ui`/`components/charts`/`schema.ts`/CONTRACTS change. **NEXT = Phase C2** (post-workout coach note on the finish screen — `engine/buildInsight` offline, richer Groq note when a key is set).

- 2026-07-11: **AI Coach PHASE C2 DONE (post-workout coach note) — typecheck green, adversarially reviewed (0 HIGH/MED), offline-firewall intact. Shipped as v0.11.0.**
  A short coach-voice line on the **finish screen** grounded in the just-saved session. Two layers, offline-first: a deterministic engine note that **always shows** + an **opt-in** richer Groq note. Built as ONE new tracker service + additive edits to 3 owned files; **no frozen file / schema touched**.
  - **Added:** `src/tracker/services/coachNote.ts`. `buildSessionNote(data, prevSameType)` — PURE, deterministic, offline; priority **PR > volume vs last same day-type > recovery/next-focus cue** (weight PR headline → e1RM PR → ±5% volume delta vs `getLastSessionOfDayType(dayType, dateISO)` [the `date_iso < beforeISO` filter excludes today's just-saved session] → top-muscle recovery cue). `getSessionCoachNote(data)` returns the engine line (wrapped so the read failing still returns a note → the card ALWAYS shows). `getCloudCoachNote(data)` = **opt-in** richer note: returns null **before any network** unless `trackerPrefs.coachNotes` is on AND a Groq key is set; builds a grounded fact-sheet (only real numbers) → `chatGroq` one-shot (no tools) → returns the sentence, or null on empty/error (deterministic line stands).
  - **Open-question-2 decision:** the AI note is **opt-in (default OFF)** so a keyless / offline / "just the tracker" user never waits on a network call — the deterministic note is instant + free and always renders; the Groq layer only *replaces* it when enabled+keyed.
  - **Edited (owned):** `tracker/store/trackerPrefsStore.ts` (+`coachNotes` bool default false + `setCoachNotes`; flat key → backfills via zustand default shallow merge). `app/session/finish.tsx` (a `GlassCard` "COACH" note between the hero and summary; effect shows the engine line on load, then swaps in the Groq note when opted-in — `alive` guard vs setState-after-unmount, dep on the pref so toggling self-heals). `(tabs)/settings.tsx` (a "AI coach notes" `ToggleRow` in the Workout group).
  - **Adversarial review (1 focused agent):** **0 HIGH / 0 MED**; verified the offline firewall (gates before any fetch; pure path never networks), the volume-delta math (guarded vs /0 + NaN), PR priority, the beforeISO exclusion, finish.tsx unmount/dep safety, the pref backfill, and every token/prop/Icon(`sparkle`)/GlassCard export. 2 LOW addressed: hardened `getSessionCoachNote` with a try/catch so the card is truly always-shown; added the `divider` on the new ToggleRow for visual consistency.
  - **Offline note:** this is the first tracker file to import a network fn (`chatGroq`), but the firewall holds — the default build (pref OFF / no key) makes **zero** network calls; the fetch is doubly gated (pref + key) and lives only in `coachNote.ts`.
  - **Verify:** `npm run typecheck` exit 0; git-confirmed no `engine`/`services`/`components/ui`/`components/charts`/`schema.ts` change. **NEXT = Phase C3** (smarter Groq-powered chat: extend `COACH_TOOLS` with routines/RPE/superset/recent-workout memory + upgrade `ai/system.ts` + a light grounding guard — this one legitimately edits `src/ai/*`, which the AI track owns).

- 2026-07-11: **AI Coach PHASE C3 DONE (smarter cloud coach — data-grounded) — typecheck green, adversarially reviewed (1 MED fixed), offline path untouched. Shipped as v0.12.0.**
  Make the Groq/Claude/OpenAI chat coach actually use the new tracker memory (routines, RPE, supersets, recent workouts) + coach in that voice + a light grounding guard. All within `src/ai/*` (the AI module owns it — this track edits it); **no frozen file / schema change; the offline localCoach path is untouched.**
  - **New COACH_TOOLS (2):** `get_routines` (lists the member's saved routines/plan days with target sets × rep ranges via `routineRepo.listRoutines`), `get_recent_workouts(limit=5,1-10)` (recent sessions with per-exercise working sets, **avg RPE**, **supersets** [grouped exercise names], and exercise **notes** — via frozen `getRecentSessionDetails` + `getSessionSetMeta`). Answers "how did my last workout go?", "did I overreach (RPE)?", superset/routine questions.
  - **RPE-aware `get_exercise_stats`:** each recent session now carries `avgRpe` (working-set mean from the additive `rpe` column; null when unrecorded). **Review MED fix:** aligned RPE to sessions BY INDEX (`progress` tail ↔ reversed `history`) instead of a date-keyed join — a date join collided/overwrote when two sessions share one calendar day.
  - **System prompt (`ai/system.ts`):** added operating rules for progressive-overload targets (coach to the `get_todays_workout` numbers), RPE interpretation (9-10 = near failure/overreach → hold/deload; 6-7 = push), routines, recent-workout memory — reinforcing "never invent stored numbers; only cite RPE the tools return (many are null)".
  - **Grounding guard (`ai/grounding.ts`, NEW):** pure `checkGrounding(reply, sources)` flags "data-like" numbers (decimals / 2+ digit ints) in the reply absent from the system prompt + tool outputs. Wired NON-INTRUSIVELY: the orchestrator only `console.warn`s in `__DEV__` — it never rewrites/blocks a user reply (a false positive must not degrade chat). A testable seed for a later eval harness; corpus is only built in dev (LOW nit fixed).
  - **Adversarial review (1 focused agent, ran real `tsc`):** **0 HIGH, 1 MED (fixed above), 2 LOW** (grounding substring/prior-turn false pos-neg — accepted, dev-only + non-intrusive; corpus-in-prod nit — fixed). Verified: both tools conform to `CoachTool`; **no circular import** (`ai/tools`→`tracker/db/*`→`@/db/*`, tracker never imports `@/ai`); limit clamping (undefined→5, '3'→3, 0→1, 99→10, NaN→5); superset/note/avgRpe correctness; the **local/offline coach path returns before the cloud loop and is provably unaffected**; no frozen edit / schema / signature change.
  - **Verify:** `npm run typecheck` exit 0; git-confirmed only `src/ai/*` changed. **NEXT = Phase C4 (optional)** — Home proactive "coach" card (plateau/PR/deload/streak nudges from `buildInsight`/`computeRecovery`/PR timeline; engine-only, cloud can enrich when keyed).

- 2026-07-11: **AI Coach PHASE C4 DONE (Home proactive coach nudge) — typecheck green, adversarially reviewed (CLEAN), offline-safe. Shipped as v0.13.0. "Elevate the AI Coach" track (C1–C4) COMPLETE.**
  The Home "COACH INSIGHT" card already surfaced the deterministic `buildInsight` nudge (PR > plateau > protein > volume > streak); C4 makes it **proactive/actionable** — tap it → opens the coach chat and auto-asks "What should I focus on today, and why?" so the coach elaborates (grounded via tools, richer with a key). Two files, additive, no engine/schema/network change.
  - **Edited:** `components/dashboard/InsightCard.tsx` (optional `onPress`; wraps content in a `Pressable`; adds an "Ask your coach ›" footer when interactive — byte-identical when `onPress` is absent). `app/(tabs)/index.tsx` (`goInsightCoach` → `router.push('/coach', { prompt })`, reusing the SAME proven deep-link path as the hero's `goCoach`; passes `onPress` to the card).
  - **Adversarial review (1 focused agent): CLEAN** — 0 HIGH/MED. Verified types (onPress/Pressable/`chevron-right`), the absolute-gradient overlay still stacks correctly with the new Pressable, the deep-link auto-sends once (coach's `consumedPrompt` ref guard → no loop/double-send on re-focus). 1 LOW informational: a second tap is a harmless no-op (params.prompt unchanged) — identical to the existing `goCoach`, so consistent, not a regression.
  - **Verify:** `npm run typecheck` exit 0; no frozen file (`components/dashboard/*` is dashboard-owned, not frozen); deterministic — the nudge text is engine-computed, tapping only opens the existing chat. **The "Elevate the AI Coach" plan (docs/AI-COACH-PLAN.md) is now fully executed: C1 targets-at-logging (v0.10.0) · C2 post-workout note (v0.11.0) · C3 data-grounded cloud coach (v0.12.0) · C4 Home nudge (v0.13.0).** NEXT = owner's call (gather feedback; or the deferred tracks: nutrition UI / B2B2C Phase 3 Gemini proxy / Play prep / iOS).

- 2026-07-12: **Holistic audit → HARDENING PASS 1 (data integrity + coach correctness) — typecheck green, adversarially reviewed (CLEAN), offline + frozen-clean. Shipped as v0.14.0.**
  A whole-app holistic assessment (`docs/HOLISTIC-ASSESSMENT.md`, 10-dimension multi-agent sweep + hand-verification) found the app structurally healthy but surfaced two real data-integrity bugs + coach-correctness gaps. This pass fixes the highest-value, lowest-risk, frozen-safe subset; each fix was independently verified against the code and the whole diff passed a clean adversarial review. **No frozen file touched** (only `tracker/store`, `ai/*`, `cloud/*`, `components/dashboard/*`, one screen).
  - **Data integrity (the two real bugs):** (1) **`finish()` now commits atomically** — `createSession` + `addSetsWithMeta` + draft-clear run in ONE `getDb().withTransactionAsync` (non-exclusive, the proven `hevyImport.runImport` pattern → frozen repos join the ambient BEGIN/COMMIT), so a kill/error mid-commit rolls back cleanly instead of leaving an orphan session + a surviving draft that duplicated it on retry; `active.tsx onFinish` wraps `finish()` in try/catch (alert + retry, no dead-end). (2) **Drive backup is lossless again** — `cloud/snapshot.ts` `set_entries` cols were written against the 7-col base schema and silently dropped every Phase-5b/5c field (`rpe`/`set_type`/`note`/`superset_group`) on restore; added them (backward-compatible via `batchInsert`'s `?? null`; no `SCHEMA_VERSION` bump).
  - **Correctness/UX:** (3) **Midnight rollover** — `finish()` now stamps `dateISO` from the START timestamp (`toISO(new Date(startedAt))`), not the commit instant, so a workout crossing midnight no longer splits from its own `started_at`. (4) **Blank-set phantom** — `toggleDone` no-ops instead of faking a `0×0` "done" state (which `isCommittable` then silently dropped) when a first-time set has no value and no PREVIOUS.
  - **Offline coach (the flagship no-key path):** (5) **Phantom-workout guard** — `localCoach` no longer logs a junk exercise + fake sets from a *question* ("should I bench 80kg for 8?" → coined "should bench"); interrogatives (`?`/should/shall/can i/kya/karu…, but NOT past-tense kiya/kiye) now route to guidance. (6) **Meal photos acknowledged** — offline mode replies "I can't read photos… describe it / add a cloud key" instead of the generic help blurb.
  - **Cloud coach:** (7) **Mid-loop error preserves committed writes** — `orchestrator` hoists `cards` to fn scope and surfaces already-saved tool cards in the error path (no more "it failed" → user re-logs a duplicate). (8) **Live units** — the system prompt reads the live Settings `unitSystem` (not the never-updated seeded profile) + a lb→kg conversion rule. (9) **Hero CTA** — Home's flagship card said "Open your coach" but opened the Workout tab → relabeled "Start workout".
  - **Verify:** `npm run typecheck` exit 0; adversarial review CLEAN (all 6 change-areas SOUND, 0 frozen violations); zero new network (offline firewall intact — the only touched network file is `orchestrator`, still key-gated). Direct APK: https://github.com/aucksy/ForgeAI/releases/download/v0.14.0/forgeai-v0.14.0.apk (build pending).
  - **Deferred to a later pass (from the assessment, ranked):** product-fit HIGHs (editable profile / "start fresh" #2, nutrition view-edit-delete #5, edit-a-logged-workout #12), the AI tool-surface batch (routine CRUD / target edits / meal delete #7, tool-round-exhaustion summary #19, OpenAI token-cap #21), a perf pass (#8/#9/#16/#29), an a11y pass (#18 contrast, #24 SR labels, #25 touch targets, #26 font-scaling), a pure-TS test seam + CI typecheck gate (#10), and the .xlsx export 5b/5c columns. Note (not a bug): a draft *started* days ago then resumed now dates to its start day (intended, matches Hevy/import semantics).

- 2026-07-12: **HARDENING PASS 2 (product fit — make it a real app, not a demo) — typecheck green, adversarially reviewed (CLEAN), offline + frozen-clean. Shipped as v0.15.0.**
  The two product HIGHs from the holistic assessment (#2, #5): the app was structurally a permanent demo — the profile was seeded + uneditable and nutrition was write-only-via-chat with no view/edit/delete. Both fixed as NEW screens over the FROZEN repos (updateProfile/logMeal/deleteMeal, which existed but had zero UI callers); no frozen file touched.
  - **Editable profile (#2):** NEW `components/settings/ProfileCard.tsx` — edit name · goal · the 4 daily targets (calories/protein/carbs/fat) via the frozen `userRepo.updateProfile`; mounted as the **first section of the Profile tab** (`settings.tsx`). Validated (integer, in-range), no-change is a no-op, unseeded-DB safe (Save disabled). On save it refreshes the dashboard so the Home greeting + calorie/protein rings reflect the member's real numbers instead of "Arjun / 2600 kcal".
  - **Nutrition manager (#5):** NEW route `app/nutrition.tsx` — today's totals vs targets, a quick-add form (description + macros → frozen `logMeal`), and a deletable meal list (frozen `deleteMeal`, with confirm); refreshes the dashboard after every write. Wired the prominent Home **calorie/protein rings to be tappable** → open it (`StatGrid` gained an optional `onPressNutrition`; byte-identical when absent). Meals are no longer a chat-only black box.
  - **Verify:** `npm run typecheck` exit 0; a focused adversarial review came back CLEAN (all 5 change-areas SOUND, 0 frozen violations, the dashboard data-flow round-trip confirmed); offline (no network in either screen). Direct APK: https://github.com/aucksy/ForgeAI/releases/download/v0.15.0/forgeai-v0.15.0.apk (build pending).
  - **Still deferred (assessment, ranked):** edit-a-logged-workout (#12), the "start fresh" empty-state reset (the other half of #2), the AI tool-surface batch (routine CRUD / target edits / meal delete tools #7, tool-round-exhaustion summary #19, OpenAI token-cap #21), a perf pass (bounded `getExerciseHistory` #8, memoize the active screen #9, batch `getRecentSessionDetails` #16, skip no-meta UPDATEs #29), an a11y pass (inkMuted contrast #18, SR labels #24, touch targets #25, font-scaling #26), and a pure-TS test seam + CI typecheck gate (#10).

- 2026-07-12: **AI Coach PHASE C5 (coach tool-surface + provider robustness) — typecheck green, adversarially reviewed (0 HIGH/MED; 4 LOW fixed), offline + frozen-clean. Shipped as v0.16.0.**
  Closed the drift where `ai/system.ts` promised capabilities the tools couldn't perform, and hardened the cloud providers. **Entirely within `src/ai/*`** (the AI module owns it) — git-confirmed only the 5 `src/ai/*` files changed; no frozen file, no schema, no existing signature.
  - **#7 — new write/edit/delete COACH_TOOLS (wrap EXISTING repo fns, zero new business logic):** `create_routine` · `add_exercise_to_routine` (creates the exercise if new; dedupes by `exerciseId`; swaps an inverted rep range) · `update_routine_exercise` · `remove_exercise_from_routine` · `delete_routine` (all over `tracker/db/routineRepo`), `update_targets` (`userRepo.updateProfile` — name/goal/4 daily macros, goal-enum-validated + clamped), `delete_meal` (`nutritionRepo.deleteMeal`), `delete_session` (`workoutRepo.deleteSession`). Routines are addressed **by name** (new `resolveRoutine`/`findRoutineExercise`/`routineSummary` helpers resolve name→plan-day/plan-exercise), and `get_nutrition` now returns a compact `mealsList` so the coach can reference/delete a specific meal. Every tool returns a compact `resultForModel`; mutation tools echo the updated routine/summary (re-read by id, so duplicate names can't mis-report).
  - **Destructive-tool UX (decision):** a **confirm-first rule in the system prompt** (no new card kind / no frozen UI touched) — the coach must state exactly what it will delete and get a yes BEFORE calling `delete_*`/`remove_*`, unless the member already asked unambiguously. `delete_meal`/`delete_session` also report leftovers/multiplicity so the coach never assumes it cleared more than one row.
  - **#19 — tool-round exhaustion:** when the loop hits `MAX_TOOL_ROUNDS` (6) still wanting tools, its last `text` is stale interim reasoning; the orchestrator now makes ONE final `chat()` with an **empty tools array** (both providers guard `if (tools.length)`, so `[]` cleanly omits the field on a valid tool-result-terminated wire) to force a real prose summary. A throw there is caught → keeps interim text + already-saved cards.
  - **#21 — OpenAI robustness (`chatOpenAiCompatible`, shared w/ Groq):** completion cap 1024→**4096**; `reasoning_effort:'low'` for `gpt-5*` only (`/^gpt-5/i` never matches Groq's `llama-*`/`openai/gpt-oss-*` or `gpt-4.1`); reads `finish_reason` and, when `'length'` with no usable content/tool-calls, surfaces **"that answer was cut off…"** instead of an empty reply.
  - **#33 — local-coach parity (offline, read-only):** new intents in `localCoach.ts` — **routines** (`routineRepo.listRoutines`), **streak** (`getStreakDays`), **last-workout** (`getRecentSessionDetails(1)`), and **per-exercise progress** ("am I progressing on bench?" → `getExerciseStats` for THAT lift via a conservative `matchExerciseInMessage`: names/aliases ≥4 chars, word-boundary, longest-wins — falls back to the global trend). Ordered before `parseWorkout`, all `\blog\b`-guarded; the last-workout intent also bows out on week/month phrasing (that's `summaryDays`). The default no-key build stays a superset, not a silent subset — and still makes **zero** network calls.
  - **Adversarial review (1 focused agent, git-diff + full-file read):** all 5 hard constraints **PASS** (frozen-clean; no circular import — `routineRepo`/`analytics`/`exerciseRepo`/`planRepo` never import `@/ai`; offline firewall intact — new tools reachable only via the key-gated cloud loop, new local intents are pure DB reads; compact `resultForModel`; both providers accept `tools:[]`). **0 HIGH/MED; 4 LOW all fixed:** last-workout hijacking a "last week" summary (week/month guard); `create_routine`/mutation summaries mis-reporting on duplicate routine names (re-read by returned id); missing `repRangeMin ≤ repRangeMax` guard (swap on invert); `delete_meal` multi-match transparency (reports kept leftovers).
  - **Verify:** `npm run typecheck` exit 0 (before + after fixes); grep-confirmed no `fetch`/provider import in `localCoach.ts` and no `@/ai` import in the new deps. Direct APK: https://github.com/aucksy/ForgeAI/releases/download/v0.16.0/forgeai-v0.16.0.apk (build pending). **NEXT (assessment leftovers):** edit-a-logged-workout (#12) · "start fresh" reset · perf pass (#8/#9/#16/#29) · a11y pass (#18/#24/#25/#26) · pure-TS test seam (#10) · chat-append-into-finished-session (#22).

- 2026-07-12: **HARDENING PASS 3 (workout-logging correctness) — typecheck green, adversarially reviewed (1 MED found + fixed), offline + frozen-clean. Shipped as v0.17.0.**
  Two real data-wrongness bugs from `docs/HOLISTIC-ASSESSMENT.md`, both about workout-session integrity. Fixed by REUSING frozen repo fns (no signature/schema change); touches only `src/ai/tools.ts`, `src/app/session/[id].tsx`, and one new `src/tracker/services/prRebuild.ts`.
  - **#22 — chat logging no longer corrupts a finished session:** `logWorkoutCore` reused `existing[0]` (the day's first session), so "log 3×10 squats" at 8pm appended squats into the morning's FINISHED manual session — poisoning its finish summary, day type and duration. Now it reuses only an **OPEN chat session** (`source === 'chat' && endedAt == null`) and otherwise creates a fresh chat session; manual/seed sessions are never touched. (Verified: chat sessions are created open — `endedAt` null, `source:'chat'` — so the normal "append to today's running chat log" flow is unchanged.)
  - **#13 — deleting a PR-holding session no longer understates the PR list:** PRs are an EVENT log (`personal_records` row only when a lift first beats the prior best); `deleteSession` drops the deleted session's rows, so a lower-but-record-worthy set logged AFTER a now-deleted higher PR (which never earned its own row) left `getAllPrs` reporting below the true best still in `set_entries`. New `prRebuild.ts`: `deleteSessionAndReconcile(id)` reads the session's exercise ids → `deleteSession` → `reconcilePrsForExercises`, which for each affected exercise re-runs the **frozen, idempotent `checkAndRecordPrs`** on the session holding the best surviving set by weight and by e1RM. Bounded (≤2 re-checks/exercise), can't overstate (only records surviving-set values), no-op when already correct. Wired into the History-screen delete (`session/[id].tsx`) AND the C5 `delete_session` coach tool. (Hevy-import Replace still wipes-all directly — no reconcile needed.)
  - **Adversarial review (1 focused agent):** all hard constraints PASS (frozen-clean, no circular import — `prRebuild` never imports `@/ai`; offline — pure SQLite; e1RM SQL matches `epleyE1rm`, `30.0` float; ids read before delete; `== null` catches null+undefined; bounded perf). **1 MED found + fixed:** on an **exact-value tie** across surviving sessions the reconcile picked the LATEST holder, whose prior equals its own top → `checkAndRecordPrs` (strict-beat only) recorded nothing, leaving the PR uncorrected. Fix: pick the **EARLIEST** holder of the max (join `workout_sessions`, `ORDER BY value DESC, ws.started_at ASC`), so its prior sits strictly below and the row is recorded. 0 HIGH.
  - **Verify:** `npm run typecheck` exit 0 (before + after the fix); git-confirmed only the 3 files changed; no `engine`/`components/ui`/`components/charts`/`schema.ts`/frozen-signature touch. Direct APK: https://github.com/aucksy/ForgeAI/releases/download/v0.17.0/forgeai-v0.17.0.apk (build pending). **NEXT (assessment leftovers):** edit-a-logged-workout (#12) · "start fresh" reset · perf pass (#8/#9/#16/#29) · a11y pass (#18/#24/#25/#26) · pure-TS test seam (#10).

- 2026-07-16: **HARDENING PASS 4 (performance) — typecheck green, read-parity differentially verified, adversarially reviewed (0 confirmed defects; 1 critic finding = my own docblock, fixed), offline + frozen-clean. Shipped as v0.18.0.**
  The four PERF findings from `docs/HOLISTIC-ASSESSMENT.md` (#8/#9/#16/#29) — the reads that only bite at the owner's 8.8k-row Hevy-import scale, and the active-workout screen re-rendering every node every second. All landed as NEW bounded/batched read modules + additive edits to non-frozen tracker/screen files; **the frozen repos keep their existing fns and callers**. Assessment line numbers had drifted — every call site was re-grepped against current source before coding.
  - **#8 — `getExerciseHistory` trimmed in JS, not SQL:** NEW `tracker/db/exerciseHistory.ts` → `getBoundedExerciseHistory(id, limit?)` pushes the session cap into SQL (`session_id IN (SELECT … GROUP BY session_id ORDER BY MAX(started_at) DESC LIMIT ?)`). Repointed the 2 non-frozen callers: `activeWorkoutStore.buildDraftExercise` (limit 1) + `coachTargets` (limit 5). **Honest scoping (from the review):** the start-from-plan tap issues **18** history reads for its 6 lifts; this bounds **12**. The other 6 (+ a 21-round-trip `getRecentSessionDetails(10)` N+1) sit inside the FROZEN `services/coach.ts → getTodaysWorkout()`, which `startFromPlan` calls only to read `planDayId`; bounding them needs an `services/*` unfreeze or a fork of the frozen rotation logic — deliberately NOT done. Also documented honestly: the new SQL scans the lift's rows **twice** (subquery + outer) — the win is the JS↔native bridge + object materialisation (~2,800 row objects → ~144), not "fewer rows read"; still ~1.7× faster inside SQLite alone (361µs vs 634µs @ 600 sessions, measured by the review agent via EXPLAIN QUERY PLAN).
  - **#16 — `getRecentSessionDetails` N+1:** NEW `tracker/db/sessionDetails.ts` → `getRecentSessionDetailsBatched(limit)`: 1 sessions query + all sets in one chunked `WHERE session_id IN (…)` + all exercises in one query, grouped in JS = **~3 queries instead of 1 + 2×N** (History focus: 101 → 3). Chunked at 400 ids (SQLITE_MAX_VARIABLE_NUMBER), by SESSION so a session's rows never split and per-session `rowid` order survives. Repointed the 3 non-frozen callers: `(tabs)/history.tsx` (50), `LibraryList` (12), the C3 `get_recent_workouts` tool. **Left on the frozen fn (deliberate):** `services/dashboard.ts` (12) + `services/coach.ts` (10) are `src/services/*` = frozen-by-house-rule (so Home's read is unchanged), and `localCoach` (1) gains nothing. `tracker/services/dataExport.ts` (1M → ~975 round-trips) is non-frozen and the biggest N+1 left — a 1-line repoint onto this verified read whenever wanted.
  - **#9 — active screen re-rendered every second:** NEW `tracker/components/ElapsedClock.tsx` owns the 1 Hz interval + the ELAPSED Text, so the tick stops at that node instead of reconciling ~24 SetRows + Swipeables + the focused TextInput mid-typing. `ExerciseLogCard` + `SetRow` wrapped in `React.memo` — which pays off because the store already rebuilds only the touched exercise/set (`list.map(e => e.key === k ? {...e} : e)`), so untouched props keep identity. `active.tsx` memoises `existingGroups` on a **primitive** `groupsKey` (a plain `[exercises]` dep would hand every card a fresh array each keystroke and make memo a silent no-op); `target` was already stable (state-held Map). Haptic-on-down, Swipeable+undo, RestTimerBar and the C1 targets map all verified intact.
  - **#29 — redundant metadata UPDATEs:** `addSetsWithMeta` now skips the per-set UPDATE when a set has no metadata (`rpe`/`note`/`supersetGroup` all null AND `setType === 'normal'` — which also covers warm-ups, since `isWarmup ⇒ 'warmup' ≠ 'normal'`). Safe because the frozen `addSets` INSERT already leaves those 4 columns NULL and `getSessionSetMeta` — grep-confirmed the ONLY mapped reader — coerces NULL → `'normal'`/null, exactly as it already does for every seed row. Drops ~8.8k statements from a Hevy import.
  - **Parity gate (the real gate for a perf pass — not wall-clock):** built a throwaway differential harness on `node:sqlite` porting BOTH the frozen and new implementations verbatim against the real DDL → **5,289 comparisons byte-identical** across randomized data, empty DB, warm-up-only history, orphaned sets, duplicate exercises, zero-set sessions, `limit` 0/negative/undefined/oversized, and forced IN-list chunking (CHUNK=3); plus a #29 suite proving `getSessionSetMeta` output is identical with the UPDATE run vs skipped. The review agent independently rebuilt its own harness (900 + 800 comparisons) and reached the same conclusion.
  - **The one divergence, characterised not assumed:** on an EXACT `(started_at, date_iso)` tie, 20/984 tie-cases differ — **18 are the FROZEN fn truncating a session mid-way** (its `break` fires once `out.length >= limit`, dropping real sets), 2 are which of two identically-ranked sessions is picked (frozen's order is unspecified there anyway). The new read returns whole sessions in every case. Reachable only by logging the same lift twice on the same *backdated* day (`defaultStartedAt` = date+12h collides); no reviewer found a real path.
  - **Adversarial review (5 lenses → 2 refute-prompted skeptics per finding → completeness critic; 18 agents):** **0 confirmed defects** — all 6 raised findings refuted by both skeptics (negative-limit divergence: unreachable, all callers literal-positive; `push(...rows)` spread: conditioned on a repoint not in this diff; dataExport: true but not a defect of this change). All 5 hard constraints PASS (git-confirmed zero frozen paths touched, no schema change, no `tracker → @/ai` import, zero network in the 3 new modules). The critic's one real hit was **my own docblock overclaiming the start-tap win (12× ≠ 18×)** → rewritten to state the true scope + the double-scan.
  - **Caught during review:** a review agent ran Expo's lint, which auto-installed `eslint`/`eslint-config-expo`, generated `eslint.config.js` and churned `package-lock.json` (**5,698 insertions / 1,695 deletions**). Agent side-effect, not part of this change — all three reverted before commit; the diff is exactly 10 edits + 3 new files. (The critic had waved the lockfile through as "clean, 257 additions, dev-scoped" — it wasn't. Verify your own diff.)
  - **Verify:** `npm run typecheck` exit 0 (before + after fixes); no `engine`/`services`/`components/ui`/`components/charts`/`schema.ts`/`db/repos` change; offline (pure SQLite + local state). Direct APK: https://github.com/aucksy/ForgeAI/releases/download/v0.18.0/forgeai-v0.18.0.apk (build pending). **NEXT (assessment leftovers):** edit-a-logged-workout (#12) · "start fresh" reset · a11y pass (#18 contrast / #24 SR labels / #25 touch targets / #26 font-scaling) · pure-TS vitest seam (#10 — this pass's parity harness is a ready-made first test) · the `dataExport` repoint · the frozen `getTodaysWorkout` third of the start-tap (needs a scope call on `services/*`).

- 2026-07-22: **MAJOR PIVOT DECLARED (owner) — B2B2C SaaS platform. Kickoff brief written; NO code.**
  ForgeAI becomes a three-pillar ecosystem: (1) **Gym Management CRM** (web-first, the gym's
  operating system), (2) the existing **member app** as a gym-membership benefit, (3) a **premium
  AI layer** as the upgrade. Revenue = owner SaaS subscription + member AI upgrades (model open to
  refinement; owner asked for assumptions to be challenged). Process = research → strategy docs →
  approval → build. **Entrypoint for this track: `docs/overhaul/OVERHAUL-BRIEF.md`** — contains the
  directive, the co-founder position (free/paid seam already exists in the code; gym SaaS carries
  revenue; payments-rail + white-label as candidate revenue; two-way-sync reversal is the big
  technical implication; India-first assumed), the head-start map (Pillars 2+3 largely built,
  Pillar 1 ~10%), the **carried-forward weakness log W1–W10 with dispositions** (owner asked to
  keep it: fake-seed onboarding W1 dissolved by invitation flow; frozen-files W2 to be formally
  unfrozen behind tests W3; edit-workout W4; a11y W5; perf W6; PRD drift W7 resolved by pivot;
  one-way-sync W8 re-architect; member-identity W9 re-decide; owner-gated setup W10), the
  reuse-don't-redo pointer to `docs/DECISIONS.md` (2026-07-07 infra research stays valid), and the
  **Phase R1 research plan** (8 areas A–H → 6 strategy docs, each with a plain-English executive
  summary). **Owner gates ANSWERED same day: (1) research = FULL deep-dive (agent fleet authorized);
  (2) pilot gym = YES — the owner has one → design partner + first pilot; (3) 6-month goal = FREE
  PILOTS FIRST (learning-optimized roadmap, billing later).** R1 research launched (9 area
  researchers → adversarial fact-check of load-bearing claims → completeness critic).

- 2026-07-22: **R1 RESEARCH COMPLETE + `docs/overhaul/VISION.md` written — AWAITING OWNER APPROVAL.**
  37 agents / 9 areas / 51 fact-checks / 2.2M tokens. **Verdicts: 12 CONFIRMED · 35 CORRECTED · 4
  REFUTED** — the fact-check layer paid for itself. Raw record preserved in
  `docs/overhaul/research/` (area summaries · findings · verdicts · completeness-critic JSON).
  ⚠ **Ops note: the first run HUNG** — the india-market agent died mid-flight at 11:07 and the
  pipeline waited on it ~4h; caught by checking file mtimes (a progress list alone looked healthy).
  Fixed via TaskStop + `resumeFromRunId` (32 cached agents replayed free, only 5 ran live).
  **LESSON: for long workflows, verify liveness by file mtime, not by counting completed agents.**
  - **What the research killed/changed (detail in VISION.md §1):** (1) **member-paid AI is out** —
    RevenueCat 2026 median H&F download→paid is 2.9%, AND every AI *upsold* on top of a paid product
    drew revolt (Garmin Connect+, Strava) while every *bundled* one earned goodwill (Whoop, EGYM) →
    AI becomes an **owner-paid** line; (2) **payments-as-revenue dropped** — not for the reason first
    researched (the "0.1% India cap" was REFUTED — it was a hypothetical in Razorpay partner docs)
    but because Indian gyms already collect by **direct UPI QR at zero cost**; (3) **billing inverted**
    — Indian gyms sell **annual lump sums at 20–30% discount**, so the CRM's job is renewal-chasing +
    part-payment/dues + cash-vs-UPI reconciliation, NOT a dunning engine; (4) **the member-app wedge
    was REFUTED as stated** — Wodify Client is 4.9/5 on 16K ratings with PRs/leaderboards, PushPress
    ships Train, Virtuagym/Exercise.com unify natively → wedge survives only vs **value-gym +
    India-local** tooling; (5) **WhatsApp reminders reframed** — generic prompts have trivial effect,
    nudge effects decay (8% of 53 megastudy arms persisted), and naive at-risk outreach **increased**
    churn in a field experiment (10% vs 6%); (6) **PT sizing corrected** 14–20% → **~10% median**
    (IHRSA) → demoted to Phase 2; (7) ⭐**Daxko (US, PE-backed) acquired FitnessForce on 2026-06-23**
    — India's leader, 1,000+ gyms — explicitly for its UPI/GST/WhatsApp/biometric local rails. The
    "India-localized rails nobody has" differentiator was bought five weeks ago; (8) **GST on gym
    services fell to 5% WITHOUT ITC (2025-09-22)** → our SaaS fee is no longer creditable for gyms.
  - **VISION.md's co-founder challenge (the core call):** building a full CRM points the only
    founder's time at the most commoditised/lowest-ARPU/hardest-to-support layer while giving away
    the one rare asset. **Recommendation = be the gym's MEMBER-FACING product, not its back office**:
    member app (built) + engagement-depth attendance signal + renewal/dues ledger + a daily
    "talk to these members" list driven by days-since-last-visit (the only churn signal with
    peer-reviewed support, AUC 0.86) + WhatsApp. **~8 features, not the brief's ~40**; explicit NO to
    POS/inventory/access-control/payroll/multi-branch/class-booking-first/white-label.
  - **Business model:** single line = **owner-paid flat INR SaaS, published price** (Pilot free →
    Core ₹1,499 ≤200 members → Growth ₹2,999 → AI add-on ₹999–1,999, owner-paid). **Honest ceiling
    stated for the owner: ₹1–4 Cr/yr at multi-year heroic execution, India-only** (500 gyms ≈ the
    18-yr category leader's size). Export door kept open (Zenoti/FitBudd/FitnessForce all monetised
    OUTSIDE India; Western gyms pay ~10x) → **keep currency/language/tax/payment rails pluggable**.
  - **Named kill-risks:** solo-founder support load (the #1 documented reason owners leave this
    category; gyms run 5am–10pm multilingual) · Daxko moving first · unchecked regulatory walls (RBI
    PA rules, DPDP on biometric data, TRAI DLT, 2025 WhatsApp price change may break the message
    unit-economics) · **cost-to-serve never modelled** (AI inference + WhatsApp + infra + support vs
    ₹1,499) · biometric integration may be impossible from a browser (ESSL/ZKTeco = Windows/on-prem).
  - ⭐**NEXT = PRIMARY RESEARCH, NOT CODE.** The critic's sharpest hit: zero primary research —
    9 desk-research areas over Western sources while a live design-partner gym sits unobserved.
    `docs/overhaul/FIELDWORK.md` written (watch-don't-ask kit; owner runs ~1 week incl. a month-end
    and a 6–9am peak) to settle **D1 phone-first vs computer-first** (desk research contradicted
    itself; wrong answer = months wasted) · **D2 the real daily mess** (cash/UPI reconciliation was
    ASSUMED, never observed) · **D3 will members install the app** (the whole wedge) · **D4 real
    willingness to pay**. Highest-value artifact = a copy of the gym's actual register/Excel = the
    true data model. **Remaining brief deliverables (MVP def, architecture, DB, API, UI/design
    system, migration, sprints) are deliberately NOT written yet — writing them pre-fieldwork would
    be fiction.**
  - ✅ **VISION.md APPROVED by owner same day. Three decisions LOCKED (recorded in VISION.md header):
    (1) MARKET = India-first with the export door kept open** → currency/language/tax/payment rails
    must stay pluggable; no India-specific assumptions baked into the core. **(2) SCOPE = NARROW** —
    the §3 recommendation adopted: ~8 features, explicit NO to POS/inventory/access-control/payroll/
    multi-branch/class-booking-first/white-label/campaign-builders/lead-scoring/waivers. **(3)
    FIELDWORK FIRST** — owner runs `FIELDWORK.md` at the design-partner gym within ~1–2 weeks; **no
    platform code until those notes return.** ▶ **NEXT = await fieldwork answers (D1 phone-vs-computer
    · D2 real daily mess · D3 will members install · D4 willingness to pay) → then MVP-ROADMAP.md +
    ARCHITECTURE.md.** No-regret work available meanwhile (owner's call): **W3 test lane** (still zero
    tests; also the prerequisite for the W2 frozen-file unfreeze) and **W1 real onboarding** (a member
    invited by their real gym must never see the fake "Arjun" seed — disqualifying under any version
    of the plan).

- 2026-07-22: **Owner said "start building" → OVERHAUL GROUNDWORK track begins (no-regret, fieldwork-
  independent). Recommended order LOCKED: O1 test lane FIRST, then O2 real onboarding.** Rationale:
  tests are the safety net that makes O2 (which touches the seed path) and the later W2 frozen-file
  unfreeze safe; the v0.18.0 perf pass already built a differential parity harness (5,289 comparisons)
  = a ready-made first test. **▶ NEXT CHAT = Phase O1** (see the kickoff handoff). Platform code still
  gated on fieldwork; O1/O2 are pure app-quality work valid under every plan.
  - **O1 scope (test lane + CI gate, W3 + assessment #10):** stand up **vitest** in `apps/mobile`
    (pure-TS, no native/RN render — extract/import pure fns only); cover the historically-buggy pure
    logic first: `tracker/services/{plateMath,warmupMath,history.getWeekStreak,exerciseAnalytics,
    coachNote.buildSessionNote}`, `tracker/services/hevyImport` classifiers (parseHevyDate UTC-basis,
    classifyMuscle, classifyEquipment, inferDayType), `ai/grounding.checkGrounding`, `engine/*`
    (epleyE1rm, computeOverloadTarget, roundToIncrement); port the perf-pass parity harness as the
    first DB-logic test if feasible. Add a `test` job to `.github/workflows/release-apk.yml` gated
    BEFORE the Gradle build (typecheck already runs there). **Frozen files stay read-only — tests
    IMPORT them, never edit them** (testing frozen pure fns is explicitly allowed and desirable).
    NOT in scope: RN component/render tests, unfreezing anything, any behavior change. Ship = a tagged
    release once green (bump app.json; direct APK link per [[always-direct-apk-link]]).
  - **O2 (next after O1) = W1 real onboarding:** replace the auto-seed-on-first-launch with a real
    empty start + an explicit "Load demo data" for sales; "Reset" must clear to empty, not regenerate
    fake data. Design against the fieldwork if it has landed by then.

- 2026-07-26: **Phase O1 DONE (automated-test lane + CI gate) — 61 tests green, typecheck green, adversarially reviewed (0 correctness defects), frozen-clean. Shipping as v0.19.0.**
  The app had ZERO automated tests (assessment #10 / weakness W3). O1 stands up a **pure-TypeScript
  vitest lane** (no RN render, no native, no emulator) over the historically-buggy CORE LOGIC and
  wires it into CI **before** the Gradle build, so a logic regression can't become a shipped APK.
  This is the safety net that makes O2 (touches the seed path) and the later W2 frozen-file unfreeze
  safe.
  - **Harness (new, no source touched):** `apps/mobile/vitest.config.ts` (node env, `@/`→`src`
    alias, `define __DEV__`) + `apps/mobile/test/stubs/native.ts` (a throwing Proxy). The pure fns
    under test are the REAL implementations, but their MODULES transitively import native packages
    (`@/db`→expo-sqlite; `@/lib/keys`→expo-secure-store; `@/lib/uuid`→**expo-crypto→react-native**;
    stores→async-storage). Those five are aliased to the stub so a service file can be imported to
    reach its pure exports; a stub is only ever imported, never CALLED (any call throws loudly). The
    `react-native` alias also dodges its Flow-syntax `index.js` that the bundler can't parse.
  - **Tests (`apps/mobile/test/**`, 61 across 9 files):** `engine/overload` (Epley, roundToIncrement
    float-noise + inc≤0 passthrough, all overload branches: start/increase/deload/hold-at-floor/
    plateau-deload/plateau-chase/default), `engine/strength` (benchmark match, 1.2 cap, **reuse guard
    via "Overhead Row" matching two benchmarks**, score 0 paths), `plateMath` (exact/closest/at-bar/
    custom set/concrete greedy pick), `warmupMath` (ramp, ≥work-weight drop, light-lift dedup, **2.5
    fallback pinned by a value only reachable at inc=2.5**), `exerciseAnalytics` (warm-up/zero skip,
    chrono order, xRM cap), `coachNote.buildSessionNote` (weight-PR>e1RM-PR>volume±5%>first-time),
    `hevyImport` classifiers (**parseHevyDate UTC-basis** = the tz-idempotency fix, muscle-collision
    order, equipment suffix+name fallback, dayType priority), `history.getWeekStreak` (mocked
    `getSessionsBetween` + frozen clock: in-progress week doesn't break, gap breaks, multi-session
    week counts once, restDays), `ai/grounding` (ungrounded flag, single-digit ignore, dedup).
  - **Two latent quirks FOUND + PINNED (not fixed — O1 is tests-only):** (1) `classifyEquipment('Dips')`
    → `'other'` because the calisthenics rule matches only the singular `\bdip\b` (Hevy names it the
    plural "Dips") — a real misclassification, candidate fix for a later phase; (2) `checkGrounding`
    treats a number that is a SUBSTRING of a source number as grounded (`corpus.includes(n)`) — lenient
    by design (never blocks a reply), pinned so a future tightening is a conscious change. Also caught
    **my own** arithmetic error while writing (deload FLOORS to the increment: 80→70, not 72.5).
  - **CI gate:** `.github/workflows/release-apk.yml` — new "Unit tests (mobile)" step (`npm test`,
    working-dir `apps/mobile`) mirroring the existing Typecheck step, placed AFTER typecheck and
    BEFORE the ~10-min Gradle build (same job = sequential gating: tests fail → job fails → no APK/AAB).
    (Used a step, not a separate `needs:` job, to mirror typecheck 1:1 and avoid a second `npm ci`.)
  - **Adversarial review (1 focused agent, read-only, no install):** **0 correctness defects — every
    expected value re-derived by hand matched the source; no coincidental greens.** Frozen files
    git-confirmed untouched; functions under test confirmed REAL (not stubbed). 3 MED "weak/tautological
    test" findings TIGHTENED (plate symmetry→concrete plates; strength reuse guard now actually
    exercised; warm-up 2.5 fallback now discriminating) + LOW comment/coverage fixes + the two quirk
    pins above added. Re-ran green.
  - **Parity harness (v0.18.0 perf pass) DEFERRED (as flagged in the O1 plan):** it used Node's
    experimental `node:sqlite`, unavailable on CI's Node 20; porting it needs a new SQLite devDep and
    covers query-plumbing, not the buggy-core. The e1RM SQL it guarded is pinned indirectly by the
    `epleyE1rm` unit tests. Clean follow-up if the DB layer needs coverage.
  - **Verify:** `npx vitest run` → 61/61 pass; `npm run typecheck` exit 0 (test files + config now in
    the `**/*.ts` include). Only new files + `package.json` (test script + `vitest` devDep) + lockfile
    + the CI edit changed; **no frozen file / schema / existing signature touched; no behavior change.**
    **NEXT = Phase O2 (W1 real onboarding):** replace the fake-"Arjun" auto-seed with a real empty
    start + an explicit "Load demo data" for sales; "Reset" must clear to empty, not regenerate fake data.

- 2026-07-26: **Phase O2 DONE (W1 real onboarding) — 142 tests green (61 O1 + 81 new), typecheck
  green, adversarially reviewed (2 HIGH + 5 MED + 6 LOW found; all HIGH/MED fixed), frozen-clean.
  Shipping as v0.20.0.**
  The app auto-seeded a fake "Arjun Mehra" 13-week history on FIRST LAUNCH, and Settings → "Reset
  demo data" wiped everything and **regenerated** it. Under the B2B2C pivot a member handed the app
  by their real gym would see someone else's numbers — weakness **W1**, "disqualifying". O2 replaces
  that with a real empty start, an explicit demo action for sales, and an erase that clears to EMPTY.
  Fieldwork had NOT landed (FIELDWORK.md is still the blank kit), so this was built
  fieldwork-independent as planned.
  - **Boot gate (the load-bearing decision):** `hasMemberProfile()` — *is there a row in
    `user_profile`* — is the ONLY onboarding signal. Not a flag, because every pre-O2 install
    (incl. the owner's phone with 487 imported Hevy workouts) already has a profile and must
    upgrade straight into the app. `app/_layout.tsx` no longer calls `ensureSeeded()`; it renders
    `<WelcomeScreen>` **instead of** the `<Stack>` when there is no profile (not a route push — so
    the tabs never mount over an empty DB and an erase returns there with no restart/nav race).
  - **Owner decision (AskUserQuestion 2026-07-26): welcome captures NAME + MOBILE NUMBER.** The
    owner asked for SMS OTP + "one install per number". Pushed back in chat and he agreed to
    collect-now-verify-later: an OTP proves phone ownership, **not gym membership** (only the gym's
    roster does that); it needs a backend + provider + **TRAI DLT** registration + per-message cost
    (VISION §6 risk 4) before fieldwork D3 has told us members will even install; and it would break
    the offline-first first launch. The number is stored locally as the identity the gym roster will
    verify against when the platform track opens. Recommended replacement for OTP when we get there:
    **gym approves / roster match** (₹0, proves more). Also locked: erase = fresh-install semantics;
    "Load demo data" appears on BOTH the welcome screen and Settings.
  - **New (`src/onboarding/*`):** `form.ts` (PURE — name/phone validation, E.164 normalisation,
    optional age/height/weight parsing, `computeTargets` by goal × body weight), `db/memberSchema.ts`
    (**additive** `ALTER TABLE user_profile ADD COLUMN phone TEXT`, PRAGMA-guarded + meta-versioned,
    exact `initTrackerSchema` pattern — `schema.ts` never edited), `db/catalog.ts` (inserts the
    ~40-movement catalog, imported read-only from `db/seed/exercises`), `db/dataActions.ts` (the
    three lifecycle actions + `WIPE_TABLES_IN_ORDER` / `OWNED_META_KEYS`), `store/onboardingStore.ts`,
    `components/{WelcomeScreen,BootErrorScreen}.tsx`. Plus `components/settings/DataCard.tsx` and
    `components/dashboard/FirstRunCard.tsx`.
  - **The three flows.** *Empty start*: ONE exclusive tx writes exactly 1 profile row + the exercise
    catalog + (only if given) 1 body-weight row — **zero** session/set/PR/meal/chat/plan rows.
    *Load demo*: erase → flag → the EXISTING generator via `forceReseed()` (seed files untouched
    beyond comments). *Erase*: one tx clears all 11 domain tables + `sync_outbox` child-first, and
    deletes **only** `seeded`/`demo_data`/`activeWorkoutDraft` from `meta` — the blanket `DELETE FROM
    meta` the old reset did would have taken `cloud_client_version` with it, and resetting that
    monotonic counter makes every later push look STALE to the server (owner dashboard frozen on
    pre-erase numbers). Gym link + Drive settings therefore survive an erase by design.
  - **Also:** `ensureSeeded()` **deleted** (dead after the boot change; leaving it exported invited
    someone to re-wire auto-seeding). Optional-field honesty: `ai/system.ts` omits unknown age/height
    /gym from the prompt instead of telling the model "0 y/o, 0 cm"; `GymCard`/`coach.tsx` handle an
    empty gym name. `snapshot.ts` adds `phone` to the user_profile column list (lossless Drive
    backup; old envelopes restore it NULL — same precedent as the 5b/5c columns, no SCHEMA_VERSION
    bump). Phone is editable in Settings → Your profile.
  - **Adversarial review (1 deep agent, read-only) — 13 findings; every HIGH and MED fixed:**
    **H1 (the dangerous one)** `boot()` mapped ANY read failure to `status:'welcome'`, and
    `completeOnboarding` wiped unconditionally → one transient SQLITE_BUSY on the owner's phone
    would have offered a first-run screen over 487 workouts and destroyed them on "Start training".
    Fixed twice over: a read failure now lands on a new **BootErrorScreen** (retry), and
    `completeOnboarding` re-verifies **inside** the transaction (`ExistingDataError` if any profile
    or session exists, caller recovers by re-booting into the app). **H2** a real Indian mobile in
    the `91xxxxxxxx` series was mangled by the duplicate-country-code strip → that member could
    never finish onboarding; `normalizePhone` now tries ordered candidates and keeps the number
    as-typed when it is already valid. **M1** an `initMemberSchema` failure froze the app on a blank
    splash (boot was inside the try) → init failures now fall through to the retry screen.
    **M2** a cache-reset failure after a COMMITTED erase reported "could not erase" over an emptied
    DB → best-effort. **M3** loading the demo on a gym-linked phone pushed Arjun's numbers to the
    owner dashboard under the member's real name → `maybeSync()` now returns early while
    `demo_data` is set. **M4** the demo flag was written AFTER the seed (kill in between = unlabelled
    fake data) → flagged first. **M5** a Drive restore / Hevy import left the demo badge over real
    data → `clearDemoFlag()` called from both. LOW fixed: blank phone no longer blocks unrelated
    profile saves; erase navigates Home before unmounting the navigator; the demo alert re-checks
    `busy`; optional-number parsing rejects `0x20`/`1e2` and accepts a decimal comma.
    **Lenses CLEAN:** transactions/nesting (no `getDb()` inside an exclusive tx — the documented
    deadlock), FK wipe order (verified against every `REFERENCES` clause), empty-DB crashes across
    every screen, double-tap re-entry, the additive phone column, and **frozen-file compliance
    (git-verified: `src/engine`, `src/components/{ui,charts}`, `schema.ts`, `src/db/repos`,
    `src/services` all untouched; no exported signature changed).**
  - **Tests (`test/onboarding/**`, 81 new):** the W1 promise asserted directly (empty start writes
    NOTHING to the 8 history tables), the guard against wiping a populated DB, wipe order vs a
    hand-built FK map, `meta` survivors, demo flag before-seed + cleared-by-erase, boot never
    falling back to 'welcome' on a read error, committed-erase-survives-cache-failure, the
    `91xxxxxxxx` regression, and `computeTargets` pinned to hand-derived numbers (incl. both
    clamps). Review also flagged 6 weak/tautological assertions from my first pass — all replaced
    with pinned values or real state checks; the erase DELETE list is now spelled out rather than
    derived from the constant it tests.
  - **Deliberately deferred (noted, not bugs):** SMS/OTP + roster verification (platform track);
    "Restore from Drive" on the welcome screen (the Drive card is gated on an unset
    `googleWebClientId`, so it would be dead UI today) — a reinstalling member must onboard first,
    then Settings → Backup; onboarding hardcodes `unit_system:'metric'`/`language:'en'` (app is
    kg-only, the UI reads `settingsStore`); `discard()` re-creates `activeWorkoutDraft=''` in meta
    after an erase (falsy → no restore).

- 2026-07-26: **Phase W4 DONE (edit a logged workout) — 199 tests green (142 + 57 new across 4
  files), typecheck green, adversarially reviewed (1 HIGH + 5 MED + 6 LOW; all HIGH/MED fixed),
  frozen-clean. Shipping as v0.21.0.**
  A finished workout was immutable (weakness **W4** / assessment #12): a wrong weight or a forgotten
  exercise could only be fixed by deleting the whole session and re-logging it. Owner picked the
  full scope (AskUserQuestion 2026-07-26): sets, exercises, date, day type and notes.
  - **Design:** no second editor. History → a session → **Edit** loads it back into the EXISTING
    logging screen (`app/session/active.tsx`) via the same draft store, so a correction gets the
    real set rows, PREVIOUS column, plate calculator, warm-up ramp, RPE, set types and supersets
    instead of a weaker parallel UI. "Finish workout" becomes "Save changes"; the Workout tab and
    the discard copy are edit-aware; `finish()` hard-refuses while `editingSessionId` is set so an
    edit can never create a duplicate session.
  - **New:** `services/draftSets.ts` (PURE — `isCommittable`/`draftToRichSets`/`hasWorkingSet`,
    extracted verbatim from `finish()` so both write paths share ONE definition of what gets
    logged), `services/editDraft.ts` (PURE — `buildEditDraft` rebuilds the draft from
    `SessionDetail` + `getSessionSetMeta` incl. 5b/5c metadata; `previousExcludingSession`;
    `uneditableReason`), `services/sessionTiming.ts` (PURE — the date move),
    `db/sessionEdit.ts` (`saveSessionEdits`), `components/EditSessionHeader.tsx` (±1-day stepper,
    day-type chips, notes — a real date picker would mean a new native module).
  - **The save:** sets are REPLACED wholesale (ids are internal and `addSets` renumbers anyway), in
    ONE non-exclusive transaction on the shared connection so the frozen repos join it: UPDATE the
    session → DELETE its `personal_records` → DELETE its `set_entries` → `addSetsWithMeta` (frozen
    `addSets` = set numbering + PR detection). Session-first ordering matters: `checkAndRecordPrs`
    reads `started_at` back off the row. Then, OUTSIDE the transaction, the pre-existing
    `reconcilePrsForExercises` runs for every exercise the edit touched **or removed** — a lowered
    lift must be able to promote a later, smaller one that never earned its own row.
  - **Adversarial review (1 deep agent, read-only) — 12 findings; all HIGH/MED fixed:**
    **H1 (would have corrupted the owner's own history):** the date shift was measured from the
    LOCAL calendar day of `started_at`, but the Hevy import stores `started_at`/`date_iso` on a UTC
    basis (deliberately — that's the tz-idempotency fix from v0.6.1). On an IST device every
    imported evening session's local day is one AHEAD of its stored day, so a save that changed
    NOTHING would have moved it 24 h earlier — reordering history, PREVIOUS and PR comparisons, and
    breaking Hevy Merge idempotency (`startedAt`-keyed) so a re-import would duplicate it. Fixed by
    keeping the session's stored `date_iso` (`editOriginalDateISO`, persisted in the draft) and
    measuring the move from that; pinned by a regression test in `sessionTiming.test.ts`.
    **M2** two cards of the same exercise collapse into one on load (`getSessionDetail` groups by
    exercise id), so saving would silently destroy the second block's note/superset → `uneditableReason`
    now refuses those sessions with a named reason. **M3** PREVIOUS used "newest session that isn't
    this one", so editing an OLD workout quoted the most recent one — and ticking a blank set
    auto-fills from PREVIOUS, writing future numbers into the past; now filtered to sessions
    strictly before the edited day (the test that blessed the old behaviour was replaced).
    **M4** a post-commit failure (reconcile / draft clear / dashboard refresh) told the member "the
    workout is unchanged" over a workout that WAS changed → `saveSessionEdits` returns
    `{reconciled}` instead of throwing, and the screen reports a records lag, not a failure.
    **M5** deleting the session elsewhere left an editor that could only ever fail → `SessionGoneError`
    is caught, the draft dropped, and the member routed to History. **M6** moving a workout onto
    today could put `started_at` in the FUTURE, hiding it from its own PR comparison and handing out
    a fake PR → clamped to now. LOW fixed: `discard()`/`saveEdits` now clear every edit field;
    one shared re-entry ref for Edit/Repeat; `canFinish` now calls the shared `hasWorkingSet` so the
    button can't enable on a set the save would drop; the date is clamped in the store as well as
    the header; the disabled "next day" chevron is inert rather than greyed-but-tappable.
    **Lenses CLEAN:** transactions (the exclusive-vs-shared choice verified against the frozen call
    chain), DST/midnight-crossing, the empty-save path, set-level round trip, nav/props/icons, and
    frozen-file compliance (git-verified). The reviewer also confirmed the DISPLAYED best PR stays
    correct in all six edit shapes it constructed — only record *attribution* can drift, same as the
    pre-existing delete path.
  - **Tests (57 new across 4 files):** the full open→save round trip writes byte-identical rows
    (incl. warm-ups, RPE, drop/failure, notes, supersets); a no-op save moves nothing even when
    `date_iso` disagrees with the timestamp's local day (the H1 regression); the future-clamp; the
    midnight-crossing shift; the merge guard; reconcile covering removed exercises; a reconcile
    failure not failing the save.
  - **Known limits (documented, not bugs):** record *attribution* can drift after a move (the
    displayed best stays right — same property as the existing delete path); a workout with the
    same exercise logged as two separate blocks can't be edited yet; the date stepper is ±1 day at
    a time.

- 2026-07-26: **Phase P1 DONE (gym CRM roster spine) — 183 CRM tests + 199 mobile tests green,
  both typechecks green, production build green, adversarially reviewed (7 HIGH + 18 MED + 13 LOW;
  every HIGH and MED fixed). Web app — no tag, no APK; the mobile app is untouched.**
  **Owner directive 2026-07-26 (AskUserQuestion): stop asking what to build next, self-prioritise
  and keep shipping; and "don't hold the crm on field work…just build one basis online research…a
  crm that does all they need it to do".** That waives `VISION.md` locked decision 3 (the fieldwork
  gate). `FIELDWORK.md` is still the blank kit; the R1 corpus (`docs/overhaul/research/`, 37 agents,
  51 fact-checks) is the evidence base. VISION's NARROW scope decision still governs — nothing on
  its explicit NO list (POS, inventory, door hardware, payroll, multi-branch, white-label) is built.
  Full architecture + phase plan: **`docs/overhaul/CRM-BUILD.md`**. Checklist: `docs/CRM-TEST-CHECKLIST.md`.
  - **The load-bearing schema decision.** `supabase/migrations/0001_init.sql` keys members off
    `auth.users` (`member_summary.member_id references auth.users`), so a member only exists once
    they install the app. A value gym's roster is mostly people who never will. `Member` is now a
    **gym-owned row standing on its own** (keyed gym+phone), with `appUserId` linking to an account
    only if one appears; memberships/payments/visits hang off `Member.id`, never an auth id. Purely
    additive — `member_summary` is untouched and folds back in at P7 as an "app activity" view.
  - **Decisions made without fieldwork** (all recorded in CRM-BUILD.md §"Three decisions"):
    **responsive web, one codebase** (D1 phone-vs-desktop is unanswered; `AppShell` renders a real
    bottom-nav+cards phone app under 861px and a sidebar+tables console above it, not a squashed
    desktop); **integer paise everywhere** (not reversible later without a data migration);
    **a local browser adapter beside the cloud one** (the build machine can't run Postgres — no
    Docker, 5.9 GB RAM — so this is also the only way the CRM could be run or verified at all, plus
    it is the zero-signup sales demo).
  - **New (`apps/dashboard/src/crm/**`, ~4.6k lines):** `logic/{money,dates,membership,members,
    receipts,selling}.ts` (all PURE), `data/{adapter,local,demo}.ts`, `store.tsx`, `CrmApp.tsx`,
    `ui/{kit,AppShell,router,Welcome}` + screens `{Today,Members,MemberDetail,Plans,Settings}` +
    forms `{MemberFormSheet,SellMembershipSheet,CollectPaymentSheet}`. A ~70-line hash router and an
    in-repo UI kit rather than dependencies (hash routing also means the built SPA serves from any
    static host with no rewrite rules — it will sit on a gym's shared PC).
  - **Rules the code enforces** (each is a bug class, not a preference): inclusive `endsOn` (last
    valid day, so renewals are back-to-back with no gap and no double-charged overlap); `addMonths`
    clamps (31 Jan + 1mo = 28 Feb) and renewal chains settle on a stable anniversary; memberships
    **snapshot** plan name + price at sale so a price rise never rewrites an issued receipt; money is
    **append-only** (void with a reason, never edit/delete, and a voided receipt number is consumed
    not reissued); status follows the **coverage chain** not the term running today; the daily chase
    list **forgets** after `WINBACK_WINDOW_DAYS` (45).
  - **Found by using it, before review:** the call list was led by members who lapsed 2 years ago
    (`compareByAttention` sorted expired the same direction as expiring — it now flips direction per
    state, and `needsAttentionToday` windows it); a member who renewed EARLY still read "expiring"
    and stayed on the chase list (`coverageEndsOn` now walks the chain); on a phone the desktop
    sidebar stayed rendered and the page scrolled sideways 42px (`useMediaQuery` listened only to the
    MediaQueryList `change` event, which is not dependable — it now also listens to `resize`).
  - **Adversarial review (1 deep agent, read-only) — 38 findings; all 7 HIGH and all 18 MED fixed:**
    **H1 (the data-destroying one)** a schema-version mismatch threw nothing, so the corrupt-backup
    path never ran and `read()` seeded a fresh gym straight over the real blob — a stale cached
    bundle or a rolled-back deploy would have erased every member, payment and receipt. Now backs up
    and **throws `FutureSchemaError`** rather than replacing data it cannot read. **H2** every
    mutation pushed to the in-memory cache BEFORE `setItem`, so a quota failure left phantom records
    in memory and the retry wrote them twice — rewritten as read-modify-**persist-then-adopt**, with
    `StorageFullError`. **H3** two tabs on a shared front-desk PC clobbered each other and minted
    duplicate receipt numbers — every read now re-reads when storage has moved (residual
    non-atomicity documented; `localStorage` has no compare-and-swap). **H4** the sell sheet
    defaulted a second renewal to a start date INSIDE the renewal already sold (a year sold twice) —
    defaults now come from `coverageEndsOn` via the new PURE `logic/selling.ts`, and `validateSale`
    refuses an overlap outright. **H5** `validateMember` returned `archived:false` unconditionally,
    so editing an archived member's typo silently un-archived them — lifecycle state removed from the
    form's draft type entirely. **H6** archiving a member deleted their dues from the gym's
    money-owed total — totals now run over `allMemberViews`, plus an "Archived" filter. **H7**
    cancelling a membership was one unconfirmed click with no undo — confirm sheet + typed reason +
    `uncancelMembership`. MED highlights: **M4** `recordPayment`/`voidPayment` existed in the adapter
    but nothing in the UI called them, so a part-payer's balance could never be settled (new
    `CollectPaymentSheet`); **M3** the joining-fee guard asked "has a live membership?" instead of
    "has ever paid a fee?", double-charging after a cancellation and skipping it after a fee-free
    plan; **M1** `today` was frozen at mount, so a desk open past midnight stamped everything with
    yesterday; **M7** `MAX_PAISE` was ten times its own docstring (₹10 crore, not ₹1 crore); **M14**
    the modal had no focus trap or focus restore.
  - **Four of my tests could not fail** (the review's sharpest finding, all fixed): the two timezone
    tests passed under the exact bug they guarded because CI runs UTC — `vitest.config.ts` now pins
    **`TZ=Asia/Kolkata`** and the tests assert the naive UTC result explicitly; the "voided receipt"
    test passed rows with no `voided` field at all and was byte-identical to the test above it; the
    "91xxxxxxxx series" test could not fail under either candidate ordering (the strict 10-digit rule
    is what actually protects it — now pinned, with a `+44` case that genuinely exercises ordering);
    and `expect(0.1 + 0.2).not.toBe(0.3)` asserted a property of JavaScript, not of this repo.
    **`test/**` was also never typechecked** (`tsconfig.app.json` includes only `src`) — new
    `tsconfig.test.json` fixes that, and it caught real drift immediately.
  - **CI:** new `.github/workflows/ci.yml` typechecks, tests **and builds** both workspaces on every
    push/PR. `release-apk.yml` only runs on a `v*` tag, and the CRM ships without one — it would
    otherwise have had no gate at all.
  - **Verified in a real browser, not just by tests:** every screen against an empty gym and a bogus
    member id (no errors); the sell → part-pay → renew → collect → cancel round trip; the overlap
    refusal; duplicate-phone refusal naming the existing member; phone layout at 375px (bottom nav,
    cards, zero horizontal overflow, no target under 44px) and desktop at 1280px (sidebar, table).
  - **Deliberately deferred:** no UI-render tests (the lane is Node-only, so `src/crm/ui/**` is
    gated by `tsc` + `vite build` + manual browser checks — the mitigation was extracting form
    decisions into pure `logic/selling.ts`); no `deletePlan` (retire only); receipt numbering is
    derived from the ledger rather than a counter; multi-user safety waits for P7's Postgres adapter.

- 2026-07-26: **Phase P2 DONE (gym CRM money) — 300 CRM tests + 199 mobile tests green, both
  typechecks green, production build green, adversarially reviewed (1 HIGH + 4 MED + 5 LOW, every
  one fixed, plus 5 tests that could not fail). Web app — no tag, no APK; the mobile app is
  untouched.** Architecture + decisions: `docs/overhaul/CRM-BUILD.md` §"P2 — the money decisions".
  Checklist: `docs/CRM-TEST-CHECKLIST.md` §P2.
  - **What the owner gets.** A **Money** section with two views. **Collections** is the cash book:
    pick a period (Today / Last 7 days / This month / Last month / This financial year / Custom) and
    see what came in, split by cash / UPI / card / bank, with every receipt listed under it and a CSV
    export for the accountant. **Dues** is who owes, led by **how long** they have owed it (over 60 /
    31–60 / up to 30 days), with a Collect button on each row. Every receipt number is now a link to
    a **printable receipt** on white paper — letterhead, term dates, joining fee disclosed, amount in
    figures *and* words — with a **GST breakup** when the gym is registered.
  - **New (`apps/dashboard/src/crm/**`, ~2.0k lines):** `logic/{gst,words,collections,csv,receiptDoc,
    payments}.ts` (all PURE), `ui/screens/{Money,Receipt}.tsx`, `ui/forms/VoidPaymentSheet.tsx`,
    `ui/download.ts`, print styles in `src/index.css`. Routes `#/money`, `#/money/dues`,
    `#/receipts/:paymentId`.
  - **The load-bearing money decision: GST is INCLUSIVE.** An Indian value gym quotes "₹1,500 a
    month" and takes ₹1,500. Adding 5% on top would print a receipt claiming the gym collected
    ₹1,575 — a wrong number on a document that leaves the building. So the tax is back-calculated
    *out* of the amount received: taxable is rounded once and the tax is the remainder (never rounded
    independently), so the two always add back to the paisa; CGST is floored and SGST takes what is
    left, so an odd paisa lands somewhere rather than vanishing. The consequence that matters most is
    what this does NOT touch: prices, part-payments and dues stay the gross the member pays, so
    nothing about GST can move a balance.
  - **Rules the code enforces** (each a bug class): the **rate follows the payment date** (18% before
    22 Sep 2025, 5% after — 56th GST Council, from the R1 corpus), pinned by a test on 21/22/23 Sep;
    **no valid GSTIN, no tax lines**, with the mod-36 check digit verified because a transposed digit
    printed on a year of receipts is something the gym hears about from its accountant; **reports and
    rows reconcile** — every filter narrows the totals *and* the list together; **voided money is
    reported, never netted off**; **dues age from the term start**, and a term not yet started is a
    **sale, not a debt**, so the owner never chases someone who is not late; ageing runs over
    **archived members too** — archiving is not forgiveness.
  - **Found by using it, before review:** the CSV export corrupted **every mobile number** —
    the formula-injection guard correctly fired on the leading `+` and wrote `'+91 …`; the guard
    stayed strict and `phoneForExport` bends around it instead. And several tap targets on the new
    phone cards were 19–22px against the kit's 44px floor; measuring properly also caught **two
    pre-existing P1 misses on the Today screen** (an 18px "See all", 36px member rows), fixed here.
  - **Adversarial review (1 deep agent, read-only) — 10 findings, all fixed:**
    **H1 (the one that would have left the building):** the receipt read the gym's GSTIN **live**, so
    a gym that registered for GST in August would, on reprinting a June receipt, hand the member a
    tax document asserting tax had been collected on a supply where none was — and the reverse when a
    typo'd GSTIN was corrected. This broke the codebase's own "snapshots, not references" rule; the
    *rate* followed the payment date correctly but the *registration status* followed nothing.
    `Payment.gstinAtSale` now snapshots the GSTIN at the moment the receipt is issued (absent ⇒ fall
    back to the gym, which is the old behaviour and no worse). **M2** an unpadded financial year meant
    a mistyped date (`0002-01-01`) produced receipt `1-02/0001`, which `parseReceiptNo` could not read
    back — so the **next receipt reused the same number**, the exact duplicate the file exists to
    prevent; `financialYear` now pads, and the adapter refuses a date that is unreal or outside
    2000–2100 (`InvalidDateError`) rather than trusting the form. **M3** the Dues CSV exported all 42
    dues from a list filtered to 5, and said so in the toast. **M4** the Money toast had no timer, so
    "Receipt voided" pinned itself over the content for the rest of the session. **M5**
    `phoneForExport` fixed `+91` but handed Excel a bare 12-digit integer for every foreign member —
    `+971501234567` rendered as `9.71501E+11`; it now splits on the dial code so every number
    contains a space and stays text. LOW fixed: a cleared date field surfaced the raw
    "Not a YYYY-MM-DD date:" to the front desk; "Total owed" ignored the age filter above a filtered
    list; the void sheet promised the money would go back on the member's dues even for a **cancelled**
    term, where it does not; the Money badge counted unpaid *terms* while the list it opens shows
    *people*; and the receipt's Amount column stacked the gross above the taxable+CGST+SGST, so
    reading down it gave ₹3,000 against a ₹1,500 total (the breakup now sits in its own labelled block
    below the total).
    **Lenses CLEAN:** the GST arithmetic across 0 / 1 paisa / MAX_PAISE / negatives; that voiding
    restores dues on all six surfaces that show them; `collectionSummary` conserving money between
    the total and the method split (including an unrecognised method, which gets its own row rather
    than being dropped); date arithmetic across year boundaries and short Februaries; double-click;
    the CSV injection guard; React deps, leaks and the focus trap; receipt numbering under the
    two-tab race.
  - **Five tests that could not fail** (found by the review's sharpest lens, all replaced):
    a "the document is reproducible" test asserting `buildReceiptDoc(base)` equals itself — a property
    of pure functions in JavaScript that holds for *any* implementation, and it advertised precisely
    the invariant H1 had broken; a CSV `startsWith('"')` assertion strictly implied by the
    exact-equality test above it; a GST test comparing the implementation against its own constants
    (passes for any cutover date); a `bucketFor(-7)` duplicating the `-1` branch four lines up; and a
    `phoneForExport` case fed an input `normalizePhone` cannot produce, while the reachable case was
    the one actually broken. Each was replaced with a test that exercises the real invariant.
  - **Verified in a real browser, not just by tests:** the full void → dues → collect cycle (voiding
    2026-27/0070 put ₹1,370 back on the member's page, in Dues and on the badge; re-collecting issued
    2026-27/**0071**, not a reuse, with zero duplicate numbers across 202 payments); registering for
    GST leaving an existing receipt **byte-identical**, while the next receipt carries the snapshot
    and the tax block; both CSV exports opened and read; filtering Dues dropping Total owed from
    ₹1.4L to ₹6.5k in step with its 2 rows and its 2-line export; all three bad-date messages; an
    empty gym and a bogus receipt id on every route with no console errors; and 375px across all six
    routes with **zero targets under 44px and zero horizontal overflow**.
  - **Deliberately deferred:** this is a **payment receipt, not a tax invoice** — a full invoice needs
    its own sequential series and B2B recipient details, which is P6's job, so the heading says what
    it is; dues age from the term start (a gym that invoices separately would want an invoice date,
    which does not exist in this model); still no UI-render tests (the Node-only lane gates
    `src/crm/ui/**` by `tsc` + `vite build` + browser checks).

- 2026-07-26: **Phase P3 DONE (gym CRM attendance + the daily at-risk list) — 403 CRM tests + 199
  mobile tests green, both typechecks green, production build green, 69/69 mutations killed across
  two harnesses, adversarially reviewed (3 HIGH + 5 MED + 7 LOW; every HIGH and MED fixed).
  Web app — no tag, no APK; the mobile app is untouched.** Architecture + decisions:
  `docs/overhaul/CRM-BUILD.md` §"P3 — the attendance decisions". Checklist:
  `docs/CRM-TEST-CHECKLIST.md` §P3.
  - **What the owner gets.** A **Visits** section with two views. **Register** is the front desk:
    type three letters of a name or the last four digits of a mobile, tap, done — the box clears
    itself for the next person, the day's list builds underneath with real clock times, and every
    row has an **Undo** (a mis-tapped name was previously impossible to take back; check-in had no
    delete path at all). It shows an expired plan or an unpaid balance before you wave somebody
    through, and blocks neither — deciding who trains is the owner's call, not the software's.
    Yesterday and any past day can be caught up when the desk PC was down. **At risk** is the daily
    action list: paying members who have stopped coming, each with how long they have been away
    *and their own usual gap*. Plus check-ins per day over 30 days and the gym's peak hour —
    `checkedInAt` had been recorded since P1 and nothing had ever read it.
  - **The load-bearing decision: absence is measured PER MEMBER, not against one threshold.**
    Days-without-attendance is the only churn signal with peer-reviewed multi-country support
    (35–54% of feature importance in a deployed dropout model over 5,209 members, AUC 0.86 — R1
    findings 116/164/166). But a single "flag at 14 days" rule is wrong in both directions at once:
    a four-times-a-week member absent eight days has already broken their habit, while a Sunday-only
    member at eight days is exactly on schedule. Each member is judged against the median gap
    between their own last several visits, with a fixed fallback only for somebody too new to have
    a rhythm, and a floor so nobody is chased sooner than ten days.
  - **The rhythm is sampled from their LAST VISITS, not from a window ending today** — caught while
    writing the tests, and the whole feature turns on it. A fortnightly member needs four visits
    spanning six weeks to have a measurable rhythm, so an eight-week window anchored on today holds
    that history for at most a fortnight of absence. Measured that way the personal baseline
    evaporates on the very day the member starts drifting, dropping them onto the generic threshold
    — flagging somebody one day late, which is precisely the failure the baseline exists to prevent.
  - **Rules the code enforces** (each a bug class): the list says **nothing at all** until the gym
    has used the register on 5 separate days (see H1 below); it holds only members whose cover runs
    **beyond the renewals window**, so nobody is on this list and the chase list at once;
    **archived members are excluded**, the opposite of the dues rule and deliberately so (archiving
    does not forgive a debt, but you do not phone somebody you have archived about their workouts);
    nobody is flagged before they have had **a covered week** in which they could have come, or if
    they trained **today or yesterday**; **a visit dated in the future is refused**
    (`FutureVisitError`) while back-dating is allowed, because a desk that was down still has to be
    caught up and attendance is what the whole list is computed from; check-in now takes the same
    `requireDay` guard as the money paths.
  - **The copy is a design constraint, and a test enforces it.** A randomised field experiment found
    proactive retention outreach *raised* churn — 10% against 6% for untouched controls, because
    risk and responsiveness are different things (R1 finding 173). The rule taken from it: talk to
    an at-risk member about their **training**, never about their membership. Every generated reason
    string is asserted against `/renew|membership|expir|pay|due|₹/i`.
  - **New (`apps/dashboard/src/crm/**`, ~1.5k lines):** `logic/attendance.ts` (PURE — profiles,
    personal-baseline rhythm, risk bands, register, trend, peak-hour histogram),
    `ui/screens/Attendance.tsx`; `logic/dates.ts` gains `hourOfEpoch`; the adapter gains
    `undoCheckIn` and a `today` argument on `checkIn`; the kit's `Button` gains `ariaLabel`.
    Routes `#/attendance`, `#/attendance/risk`.
  - **Mutation-tested before being trusted:** 69 mutations across two harnesses broke each new
    function in turn (UTC instead of local hours, unmerged overlapping terms, off-by-one band
    boundaries, undo filtered on one key instead of two, the register gate, the expiring handover)
    and confirmed the test named after it fails. All 69 killed. The first pass had **four
    survivors**, each resolved honestly: two were tests that could not discriminate, and two were
    **guards that turned out to be provably dead code** — clipping every term to the window already
    handles a backwards range, and only in-range days are ever read out of the daily-counts map — so
    the dead lines were deleted rather than given tests that pretend to cover them.
  - **Found by using it, not by tests:** a member three weeks in with exactly one visit was flagged
    **on the day that visit happened** — the card read "Only 1 visit since joining 22 days ago"
    above "last in: today", two true facts making one absurd suggestion, since they were in the
    building. The **"Another day" chip was completely dead** — the chip state was derived back out
    of the date, so clicking it changed nothing and the date field it reveals was unreachable; and
    fixing that surfaced worse, because a date cleared mid-typing fell back to **today** while the
    banner still said another day, so a check-in would have silently landed on the wrong date (the
    day is now explicitly unusable and the whole write path disappears until it is real). The sixth
    navigation item **overflowed its 62px column** at 375px, bleeding over its neighbour.
  - **Adversarial review (1 deep agent, read-only) — 15 findings; all 3 HIGH and all 5 MED fixed:**
    **H1 (the one that would have greeted every existing gym):** the list had no notion of whether
    the gym uses the register at all. Until this phase check-in was a button buried on a member's
    profile, so a P1/P2 gym has an empty `visits` table — and judged on that, **79 of 83 covered
    members were flagged**, with a red tile telling the owner most of their gym had stopped coming
    on the day the feature arrived. No attendance is an absent signal, not a negative one
    (`isRegisterInUse`, and an empty state that says so instead of claiming everybody is training).
    **H2** the two-lists-must-not-overlap rule excluded only the *expired*; a member whose cover
    ends this week is `expiring`, which the chase list also matches, so "plan about to lapse AND
    stopped coming" — the canonical pre-churn member — landed on both cards with contradictory
    advice one scroll apart. The handover now sits on the same constant the chase list uses, pinned
    by a property test rather than examples. **H3** `RISK_LABEL.ok` rendered as a green **Training**
    pill for members who demonstrably were not: `ok` covers "training", "no plan running" and "too
    new to judge", so a member who lapsed two months ago and never once checked in got a green
    pill above "0 visits in the last 56 days" (`patternSummary`). MED: **M5** `weeklyRate` divided
    every visit in the window by only the *covered* days, reporting a member who trained through a
    lapse and renewed six days ago as training **20 times a week**; **M4** "haven't trained lately"
    was wrong for a third of the list — a new member two visits in has not stopped, they never
    started, so the copy now covers both; **M8** forty identical "Undo" buttons with no accessible
    name, on the only destructive control in the product.
  - **Two of my tests could not fail, and the review found both:** the demo "believable hours" test
    asserted only that the *busiest* hour was between 6 and 21, which survives the exact UTC bug it
    named (the demo peaks at 9pm; read as UTC that shifts to 15:30, still inside the band) — it now
    asserts every visit, since a 6am check-in read as UTC becomes 00:30. And the demo test whose
    comment claimed to guard the chase-list overlap asserted `!member.archived` instead — a
    tautology already covered elsewhere, and the invariant it named was the one actually broken
    (H2). It now checks real disjointness over the whole demo gym.
  - **Verified in a real browser, not just by tests:** the full desk cycle (search → check in →
    "✓ Already in" on a second search → real clock times in the register → undo, with storage moving
    33 → 34 → 33 each time); a back-dated check-in landing on 24 July; a future date and a cleared
    date both removing the write path; **two tabs** checking different members in without either
    clobbering the other (33 → 34 → 35, both present); the H1 case reproduced by emptying `visits`
    on a full 128-member gym, now reading **0** with no badge; the H2 case reconstructed (cover
    ending in 3 days + 30 days absent) appearing on the renewals card **only**; the H3 member now
    reading "No plan running"; 33 Undo buttons with 33 distinct accessible names; and every route at
    375px with **zero targets under 44px, zero horizontal overflow and zero console errors**. Peak
    hour reads "4 pm–5 pm" on the demo gym — a UTC-parsed timestamp would put an Indian gym's rush
    hour near midnight.
  - **Deliberately deferred:** no outcome logging on the at-risk list (whether the owner called, and
    what happened) — the closed loop the research says the whole category is missing, which needs
    P5's staff model to record *who* called; no holdout group to measure the churn delta honestly
    (same dependency); `isRegisterInUse` cannot detect *partial* adoption, where the desk records
    some members and not others; still no UI-render tests, so `src/crm/ui/**` is gated by `tsc` +
    `vite build` + browser checks. LOW findings left open and recorded: shared error state on the
    register means a failed action's banner is cleared by the next successful one.

- 2026-10-05: **Tracker Phase 1 DONE — the live workout screen, Hevy parity, kept calm (v0.22.0).**
  Owner brief: "focus on the workout tracker … match Hevy … UI should not look busy and full of
  options … Do proper QA". Research behind it: `Resources/Hevy-Research-v1.docx` (outside the repo).
  - **Calmer exercise card:** one "more" menu (note · rest timer · warm-up sets · plate calculator ·
    superset · remove) replaces four always-visible buttons; only "Add set" stays. Rest time sits
    beside the muscle tag. Set type by tapping the set number (sheet: normal/warm-up/drop/failure/
    remove) for everyone; "Track RPE" (old `advancedSets` key) now only adds a coloured RPE column.
  - **Rest timer:** per-exercise length (`exercise_prefs`, tracker schema v3), default in Profile,
    no rest before a drop set, supersets rest per round + scroll to the next exercise. Countdown
    lives in `restTimerStore` (survives leaving the screen). `expo-notifications` schedules "Rest is
    over"; a quiet sticky "Workout in progress" card; tapping either reopens the workout (never a
    duplicate screen). Bell + record chime via `expo-audio` (generated wavs, duck the music).
  - **Minimise:** chevron leaves the workout running; a bar above the tabs (hidden on the Workout
    tab, which has its own Resume card). Discard moved to a quiet link under the exercises.
  - **Notes carry forward** from the last workout with that exercise. **Live records** on tick
    (same comparisons as frozen `prRepo`), medal on the row + toast. **"Update routine?"** at finish
    when exercises were added/removed/reordered or set ROWS added/removed (blank planned sets =
    skipped, not re-planned); occurrence-aware for a lift listed twice. **Save as routine** from a
    saved workout's menu. Extra sets show the set above as a grey hint (filled only on tick;
    untick gives it back). Edit mode: month calendar for any past day + editable minutes.
  - **QA:** 231 vitest (32 new; each review fix has a test that fails on the code before it).
    Adversarial review: 9 findings → 8 fixed; 1 confirmed by measurement and left open: on
    Android 14+ without the exact-alarm permission (denied by default) the locked-phone "Rest is
    over" alert is inexact — **~10 s and ~17 s late on a 30 s rest in two emulator runs** (it
    always arrived). Fix needs the owner's call (one-time "allow on-time alerts" system page via a
    small local native module, vs. accept the delay). New **`qa-device.yml`**: x86_64 APK → API 34 emulator → Maestro
    (`apps/mobile/qa/`), sleeps the phone through a 30 s rest and reads `dumpsys notification`,
    uploads screenshots + logcat as `qa-out`. Final emulator run (1286693) passed both parts end to end. Device runs found two real bugs unit tests could not:
    the expiry clean-up dismissed "Rest is over" the instant it posted (fixed + regression test),
    and the routine prompt firing on skipped sets (fixed).
  - **Infra:** Gradle heap 2 → 4 GB (`packageRelease` OOM'd once at 2 GB). `SCHEDULE_EXACT_ALARM`
    + POST_NOTIFICATIONS declared; vector `notification_icon`; `res/raw/keep.xml` keeps the sounds
    through resource shrinking. The member web build cannot run the app (`withExclusiveTransaction
    Async` unsupported on web) — the emulator is the QA path. Lessons: `D:\Brain\Lessons\
    forgeai-device-qa-on-a-cloud-emulator.md`.
  - **Moved / dropped on purpose:** stopwatch for timed holds → Phase 2 (with timed exercise
    types); "previous from the same routine" setting dropped (workouts don't record their routine);
    ticking a set from the lock screen not built (needs custom native code).

- 2026-10-06: **Progression v2 — smarter Target line, goal-based rep ranges (v0.23.0).**
  Owner brief: research progressive overload (done: `Resources/Progressive-Overload-Research-v3.docx`,
  outside the repo), then "Start the new rules fix" (its Phase 1 polish list).
  - **New pure engine `tracker/engine/progression.ts`** drives every Target the member sees: the
    workout screen (`coachTargets.getTargetsForPlanDay`) and the chat reply + `get_todays_workout`
    tool (`getTodaysWorkoutWithTargets` = frozen `getTodaysWorkout()` rotation with its targets
    swapped). Frozen `engine/overload.ts` untouched — still builds the demo history. (Its
    first-time start weight was used for rule R0 in v0.23.0 only; replaced in v0.23.1, below.)
  - Rules (spec §4): main weight = most counted sets (ties heaviest; ramps judged on the top set);
    drop sets ignored; score = reps + min(2, 10 − RPE) for RPE 6–10; step learned from repeated
    workout-to-workout increases, else catalogue; step > 20% of the weight → reps first (max+2, jump
    at max+4, then aim min−2); beginner double step within 10%; 21–41 days off hold, 42+ ≈10%
    lighter; under range twice and not climbing → ≈10% lighter in nearest whole steps; stall needs
    4 workouts and never fires within one rep of the top; unloaded bodyweight → reps to a cap
    (15 pull/dip/row, 25 push, else 20) then "harder version", never kilos.
  - **Target line:** "42.5 kg · aim for 9" / "Bodyweight · aim for 11"; badge only Up / Lighter /
    Start; reason behind a new `info` glyph. Chat card uses the same words; cards saved before v2
    keep their old badge (no `change` key).
  - **Rep ranges for NEW routine rows** from goal × exercise kind (`tracker/engine/repRanges.ts`;
    big = compound barbell + leg press). Saved ranges never change; the demo routine is untouched.
  - **History read** `tracker/db/progressionHistory.ts` adds `rpe` + `set_type` (12 sessions: 4 for
    the rules, the rest to learn the step).
  - **QA:** 274 vitest (43 new). Each defect from the research (drop set blocks increase, pull-up
    told "+2.5 kg", 5 → 7.5 kg dumbbell, cut after three steady workouts, "three weeks" copy, heavy
    top single as working weight) has a test asserting the OLD engine's wrong answer and the new
    right one. Adversarial review: 2 HIGH (lb-converted weights like 61.2244898 kg emptied the main
    sets → wrong cut; pyramids cut at the top of the range), 4 MED (big jump undone two workouts
    later; cut one rep from moving up; once-loaded dips showing "0 kg"; a comeback ramp teaching a
    10 kg step), 5 LOW — all fixed with regression tests. Building found one more: at a 10% big-jump
    line the empty 20 kg bar could never step to 22.5 kg, so the line is 20% (spec updated to v2).
    Device QA (`qa/phase1-a.yaml`) now asserts the Target line and photographs its reason; final
    run 37415011848 on 8d0f15e passed both parts (screens: Target 75 kg · aim for 5, Up, reason
    shown; rows hint 75 × 5; one tick logged 75 × 5 with a heaviest-weight medal).
  - **Set rows follow the Target:** device QA showed "75 kg · aim for 5" above rows hinting
    72.5 × 8, so working rows now hint (and a tick on a blank row fills) the Target weight + rep
    goal; a weight typed higher up wins; warm-up and drop rows keep the old hints; PREVIOUS still
    shows last time. The row passes its own fill to `toggleDone`, so hint and tick cannot differ.
    Second review (0 HIGH): a first-time start weight and a pyramid's top weight are never filled
    into rows (`targetFill` → null; the line still shows them); the live workout's Target now
    counts a workout finished earlier the same day (chat stays on before-today). A one-tap tick at
    a raised Target can fire a "Heaviest weight" record — intended (the tick claims the lift).
  - **Left open:** assisted exercises from a Hevy import progress the wrong way (no
    assisted type until Phase 2); dumbbell weight per hand vs pair not made explicit (Phase 2).

- 2026-10-06: **First time on an exercise shows no kilos (v0.23.1).** Owner picked Option A from
  research v3 §12. Rule R0 no longer borrows the frozen engine's guessed start weight (20 kg on
  every barbell/machine, 7.5 kg on dumbbells): the Target line reads "First time · find a weight
  for 8–12 reps" (bodyweight: "First time · bodyweight, 8–12 reps"), the reason says "pick a weight you
  could lift about 2 more times", rows keep no Target hint, and the "Start" badge is gone (the line
  already says "First time"). Same words in the chat card, chat reply and AI tool. Tests 282.
  Third review (1 HIGH): the **Home card** still printed the frozen engine's targets (guessed
  start weights, "0 kg" for bodyweight, and since v0.23.0 different numbers from the workout
  screen) — `dashboardStore` now swaps in `getTodaysWorkoutWithTargets()` and the card renders
  `targetLine` (kg or lb). Old saved chat cards hide a first-time reason that names a guessed
  weight, drop the "Start" badge, and read a 0 kg first-time row as bodyweight (`planRowView`).
  Tests 286. Device QA cannot reach R0 with demo data (every demo lift has history); its copy is
  covered by unit tests, and the Home screenshot shows the swapped targets.

- 2026-10-06: **Tracker Phase 2 — exercises (v0.24.0).** Owner brief: library 38 → 400+ with steps
  and a moving demo behind a tap, seven exercise types + stopwatch/countdown, §4.4/§4.5 rules,
  body weight in pull-up/dip volume, custom exercises with own photo/video, clear dumbbell
  counting, finer muscles, Hevy import keeping timed/distance sets.
  - **Demo source (licence research, `docs/exercise-library/LICENSES.md`):** free-exercise-db /
    wrkout are NOT public domain — photos and text copied from bodybuilding.com (author's own
    note, pixel match 3/3). ExerciseDB GIFs are Gymvisual's art (re-hosts show no consent).
    Free + legal: **Everkinetic** line drawings, CC BY-SA 4.0 (start/end frames on a shared
    canvas → 2-frame cross-fade loop), recoloured for the dark theme; credit line on every demo.
    Paid option NOT bought (owner gate): Gymvisual ~$405 for 450 GIFs vs ExerciseAnimatic $599;
    side-by-side of the same 5 exercises: `Resources/Exercise-Demo-Options-v1.html`.
  - **Library:** 402 entries written for ForgeAI (5 parts in `docs/exercise-library/part_*.json`,
    spec `SPEC.md`), generated to `src/tracker/catalog/catalogData.ts` by
    `scripts/build-exercise-catalog.py` (validator: unique keys/names/link names, muscles, types,
    caps, links, 2–4 steps ≤110 chars, every old seed name maps). 176 have a drawing (each checked
    by eye; 4 back drawings assigned from mislabelled or unused Everkinetic titles), built by
    `scripts/build-exercise-media.py` → `assets/exercises/*.webp` (528 files, **4.3 MB bundled**,
    offline-first; `res/raw/keep.xml` keeps `assets_exercises_*` through the resource shrinker).
    Pictures: still thumbnail in lists, moving demo only on tap (`ExerciseDemoSheet`).
  - **Sync (`catalogSync.ts`):** once per catalogue version at launch (after a profile exists),
    after demo data and after a Drive restore: link rows by name / link names (owner's Hevy
    titles), never rename; log type only when history can be read that way; a member's own
    dumbbell history keeps "weight as typed"; insert missing entries. New members get the full
    library at onboarding.
  - **Types (`engine/logTypes.ts`):** weight×reps, reps, weighted (+kg), assisted (help stored
    negative), time (microwave entry "130" = 1:30), distance, time+distance. Schema additive
    (tracker v4/v5: exercise catalog_key/log_type/load_mode/bw_share/muscles/media; set
    duration_sec/distance_m/load_mode). Hold timer sheet: stopwatch or countdown from the Target.
  - **Rules (`progression.ts`):** holds +5 s when every planned set hit the target, capped by the
    catalogue (custom exercises uncapped), never below last time; reps to a cap → "try a harder
    version" (named, opens it); 4 workouts under range → easier version; assisted: help goes
    down, then "Try it without help". Distance work and timed cardio get no Target line.
  - **Volume (`engine/volume.ts`, one rule everywhere):** pull-up/chin-up/dip/muscle-up families
    add body weight (bodyweight timeline; a hint when none logged); "kg each" counts both
    dumbbells; time/distance 0 kg. Applied on Home (volume, recovery, insight), History, finish,
    Progress, exercise page (incl. Best set), coach tools, export.
  - **Counting (dumbbells):** Counting sheet on the card: one weight / two dumbbells (each) / one
    side at a time / two dumbbells, one side. Each set can carry the counting it was logged with
    (`set_entries.load_mode`): switching stamps the old way on past sets first, so history never
    re-reads. Hevy imports read "as typed" (fresh library rows frozen to 'one').
  - **Muscles:** 20 finer muscles (front/side/rear shoulders…); sets per muscle count 1 for the
    main muscle, 0.5 for helpers (bench: chest 1, triceps 0.5).
  - **Custom exercises:** type, finer muscles, body-weight switch, own photo (gallery/camera) or
    video (camera ≤30 s; gallery clips over 30 s / 80 MB refused), copied into app storage.
  - **Hevy import:** keeps timed/distance rows (and carried weight), assisted help, link names;
    a one-time Merge backfill adds timed rows older versions dropped (never again after).
  - **Review (3 adversarial reviewers):** 4 HIGH (2 app, 2 device-QA flow), 11 MED, 12 LOW — fixed with tests: Hevy import
    doubled dumbbell volume on a fresh phone; hold Target clamped below last time (+ cap lost
    after one workout, one set counted as a hit); cardio dropped from today's workout lists;
    Counting change re-read history; edit Save dropped rows that didn't fit the type; chat logged
    assisted help as added weight and reps on timed exercises; "Plank 0 kg" records in Home
    insight/coach; Home recovery on the old volume; Best set chart on weight×reps; demo/restore
    stamp reset too late; timer kept running after closing; camera could only take photos;
    the device-QA flow (Pull Up name, scrolling, anchors). New cards now scroll into view.
    Not fixed (LOW): SetRow re-renders on each keystroke within one card; the demo seed's chat
    "workout logged" card still shows weight × reps volume.
  - **Tests:** 381 vitest (95 new). Device QA part C (`qa/phase2-c.yaml`): run 37446849032 on 33ed600 passed parts A, B and C, no crash (rest alert ~19 s late, as before).
    The first run failed before part C's first step: part B's Maestro driver still held its port
    (fixed in `run-device-qa.sh`: force-stop + 10 s). Run 37442830906's screens showed the library
    chip rows clipped at the bottom (the 400-row list's flex basis squeezed them) — fixed with
    `flexShrink: 0`, confirmed in the final run. Screens: `Resources/Phase2-screens/` (library,
    demo sheet, pull-up page with easier/harder, plank stopwatch, assisted row, Counting sheet,
    KG EACH + KM/TIME cards, finish 1,082 kg = 8 pull-ups at body weight + 8 assisted at body
    weight − 20 kg, sets per muscle in halves, custom timed exercise).

- 2026-10-07: **Tracker Phase 3 — progress (v0.25.0).** Owner brief (tracker plan, Phase 3): more
  record types, a body map of the last 7 days, measurements and progress photos, a monthly report
  and a year in review, a workout picture to share, charts spaced by real date.
  - **Records (`tracker/engine/records.ts`, one rule):** seven kinds — heaviest weight, best 1-rep
    max, best set, best session, most reps, longest time, longest distance — picked by how the
    exercise is logged (`recordKindsFor`). Derived from the sets, never stored: an edit, a delete
    or a date move can't leave one behind. A first workout sets bests quietly (as the live pop-up
    always has). Feeds the live pop-up, the finish and saved-workout screens, the exercise page,
    Progress, the reports and the share picture; the frozen `personal_records` table keeps its old
    readers (coach list, Home PR line, strength score). `recordsService` keeps the full read in
    memory until the data changes (fingerprint, see round 3).
  - **Charts by real date:** `DateLineChart` / `DateSparkline` over `lib/chartTime`; a test fails
    if a screen goes back to the index-spaced frozen charts.
  - **Body map:** last 7 days on Progress, front and back, shaded by working sets (1–2 / 3–5 /
    6–9 / 10+) with a "Not trained" line. Drawing from react-native-body-highlighter 3.2.0 (MIT;
    its licence ships in the bundle as `BODY_MAP_LICENSE`), generated onto ForgeAI's finer muscles
    by `scripts/build-body-map.cjs`.
  - **Body:** 10 measurement kinds (tracker schema v6, additive; in the Drive backup). Progress
    photos are copied into app storage: phone-only, left out of the Drive backup, shown with a
    memory-only image cache, deleted by Erase all data. Demo data adds measurements, never photos.
  - **Reports:** monthly report (calendar, against last month, records, sets per muscle, most
    trained, body weight) and year in review (workouts each month, days, streak, records, biggest
    gain). The coach note is written by fixed rules (no AI call). Progress offers last month's
    report and this year so far.
  - **Share picture:** 1080 × 1350 PNG of a workout, a month or a year, drawn as an SVG scene
    (`share/scene.ts` → `SceneSvg` → react-native-svg `toDataURL` → expo-sharing), no new native
    module. Text widths come from the app's own fonts (`scripts/build-font-metrics.mjs`). No name,
    no gym, and (round 3) nothing that gives away body weight.
  - **Review rounds 1–2** (records/charts; data/privacy/reports), commit 949d272: same lift on two
    cards; no pop-up for a set already beaten; record order on two-workout days; records kept
    between Progress visits; photos memory-only and erase empties the image caches; gallery photos
    take their EXIF date; a failed save no longer loses the photo; a Hevy import drops the demo's
    measurements; report wording; the month Volume tile wrap; "1 set".
  - **Review round 3** ("will it work on a real phone": share picture, report / records /
    measurement / photo screens, Progress layout, device QA parts D and E; 3 reviewers), commit
    db7e966. Fixed, each with a test that fails on 949d272 (`test/tracker/phase3PhoneReview.test.ts`):
    - **Records after an edit** (found checking round 2's cache): saving an edited workout deletes
      and re-inserts its sets; for the newest workout SQLite hands out the same row numbers, so the
      cache's counts didn't move and Progress, the records list, the reports and the next
      workout's pop-up kept the old record ("600 kg") until a restart. The fingerprint now adds
      `total_changes()` and `PRAGMA data_version` (proven on real SQLite with the app's query).
      Cost: any write now redoes the full read on the next visit (correctness over speed).
    - **Share picture privacy (HIGH):** KG LIFTED counted body weight on pull-ups and dips, so a
      pull-up workout read "KG LIFTED 3,104" beside "40 reps" = 77.6 kg, the member's body weight
      (seen on the emulator). The picture now counts only the weight on the bar, dumbbells,
      machine or belt (`liftedOnPicture`), shows REPS when only body weight moved, and leaves
      "Best session … kg" on weighted pull-ups and dips off (still counted in RECORDS). The finish
      screen keeps the full volume.
    - **Keyboard (swept app-wide):** the app draws edge to edge, where Android no longer shrinks
      the window, so the keyboard covered the bottom of every screen — the lower measurement
      boxes and Save, the last sets of a workout, long forms (seen: the workout screen's Finish
      bar sat behind the keyboard in run 37582659374). One `components/KeyboardRoom` at the app
      root pads by the covered part; the tab bar and workout bar step aside while typing; the
      chat drops its own Android padding (one handler). Sheets are separate windows that still
      resize themselves (RN Modal turns edge-to-edge off for them).
    - **Photo lost when Android closes the app behind the camera (swept to all 3 pickers):**
      progress photo, exercise photo/video and chat meal photo note who asked
      (`lib/pendingPick`) and take the picture back with `getPendingResultAsync` — into the
      photo grid, the exercise form, or the chat box (never sent on its own).
    - **Erase all data** also deletes the picker's temporary copies (`cache/ImagePicker/`, where a
      camera photo lands first) and the share pictures (now in `cache/share/`).
  - **Known, not fixed** (wording, layout, speed or test coverage — recorded per the review rule):
    the year picture says "1 days trained" and HOURS "0" for a short year; the month picture's
    TIME shows the bare total when some workouts weren't timed (the screen says "in N timed
    workouts"); a cardio-only workout picture shows an empty MUSCLES WORKED and KG LIFTED 0; the
    "Against <month>" Volume tile still wraps on a 360 dp phone and at font ×1.3; chart axes,
    photos and measurement entries show dates without a year ("12 Mar"); at 360 dp × 1.3 the year
    "Most trained" names cut to "Barb…" and the body-weight line wraps; with 3-button navigation
    the bottom ~20 dp of a long screen sits under the bar; Progress takes ~0.3–1 s on the first
    visit with ~40k imported sets; share pictures stay in `cache/share/` until an erase.
    Device QA flows: the share-menu and photo-picker waits can pass on our own text, the
    measurement save and the all-records page aren't asserted, the "Best set" / "Best session"
    scrolls stop early (65 and 66 show less than their names), part E depends on part C, the crash
    check reads only part E's log (every part's log was read by hand for the passing runs), and
    longest time / longest distance and the year picture aren't exercised on the phone.
  - **Tests:** 480 vitest (99 new in Phase 3). Device QA: run 37582659374 on 949d272 passed parts
    A–E; run 37588017274 on db7e966 passed parts A–E plus the new keyboard steps — the workout
    screen's Finish bar and the bottom measurement box now sit above the keyboard (08b, 51b), the
    chat box too (67) — and the share picture reads REPS 40 through Android's share menu (62, 63).
    No crash or app error in any part's log. Screens: `Resources/Phase3-screens/` — 25 phone
    screens from parts D and E (42 and 53 left out: byte-for-byte copies of 41 and 52), 08b from
    part A, the year picture drawn on a computer with sample data, and `key-screens.png`. Seen in
    that run, not fixed (layout): while typing in the chat, the suggestion chips above the box are
    squeezed to half height.
  - **Owner decisions (7 Oct, after the release; to build as v0.25.1):** time + distance exercises
    swap "Longest time" for "Best pace"; report notes stay rule-written until the AI layer ships;
    the body map (and share picture) gets a male / female figure chosen in Profile.

- 2026-10-07: **Tracker v0.25.1 — the owner's three Phase 3 decisions.** Owner brief: build the
  decisions recorded in afbe15a (tracker plan, Phase 3 "Decided by the owner"), fix the share
  picture's recorded wording slips, one review round, phone test with the figure switch and a
  run's Best pace.
  - **Best pace for runs (`tracker/engine/records.ts`):** time + distance exercises keep "Longest
    distance" and swap "Longest time" for "Best pace" (kind `pace`, kept as speed so "bigger is
    better" stays one rule, shown as minutes per km at the whole second). Only sets of 1 km or
    more count (`PACE_BASIS`, typed per distance unit), so a sprint can't set it; the exercise
    page says so behind an i beside "Records" (`InfoHeading`) and shows a "—" row until a 1 km
    set. Time-only exercises (plank) and loaded carries (farmer's walk) keep "Longest time".
    Everywhere records show: live pop-up, finish screen, exercise page, records list, reports,
    share picture, and the coach's exercise facts (`overviewFacts`).
  - **Report notes:** stay rule-written. No change.
  - **Body figure:** Profile → "Body figure: Male / Female" (tracker prefs, default male; Erase
    all data resets it). `scripts/build-body-map.cjs` also builds the female drawing from
    react-native-body-highlighter 3.2.0's bodyFemaleFront/Back (MIT), mapped onto the same finer
    muscles; the male paths are byte-identical. The Progress body map and the workout share
    picture follow the choice. The body map is now one labelled image for screen readers
    ("…, female figure, front and back").
  - **Share picture wording:** "1 day trained"; a short year shows TIME in minutes (was "HOURS
    0"); a month or year with untimed workouts says "N workouts, M timed"; a cardio-only workout
    lists Cardio under MUSCLES WORKED and shows DISTANCE (was an empty heading and "KG LIFTED
    0"). Swept: the month and year pictures counted body weight on pull-ups and dips in KG
    LIFTED (the workout picture's round-3 privacy rule now covers all three); count words come
    from one helper (`lib/words.countWord`) on every screen a member reads one.
  - **Review (one round, three reviewers), commit 3b07b5a:** pace on time-only bikes, carries,
    same-looking "new" pace, a set that beat pace and distance, the coach's facts, pace before
    distance, the finish screen's "0 kg moved" after a run, "Busiest month · 1" → "1 workout".
  - **Known, not fixed:** the app has no mile unit yet (`DistUnit` is km or m), so every pace is
    per km — adding miles must add its own pace line (the type forces it); rowing and swimming
    pace is per km now (the old tile said /500 m); a workout draft started before the update
    gets no Best pace pop-up (its saved bests lack the kind); a mistyped run (2 km in 0:30) can
    set an absurd Best pace — no cut-off, because a cut-off is a product rule.
  - **Tests:** 509 vitest (29 new). Device QA run 37608864153 on 4439825 passed parts A–F
    (no app crash in any part's log): Female in Profile → the female figure on Progress (70,
    71); a 400 m sprint sets no record (72); 2 km in 9:00 → "New record · Best pace · 4:30 /km"
    (73), on the finish screen (74) and the share picture, drawn on the female figure (75); the
    run's page shows Best pace 4:30 /km and Longest distance, the 1 km rule behind the i (76,
    77). Earlier run 37604234721 (91ad7a6) failed only its own check: the figure's label sat on
    a view screen readers skip (fixed in 4439825). Screens: `Resources/v0.25.1-screens/` (8 from
    the phone, 8 share pictures drawn on a computer with sample data in `computer-drawn/`).

- 2026-10-07: **Tracker Phase 4 — routines and plans (v0.26.0).** Owner brief (tracker plan,
  Phase 4): routine folders; a library of ready programs (home, dumbbells only, beginner to
  advanced); a plan builder better than Hevy Trainer (equipment, injuries, exercises to avoid,
  swap, deload weeks, split choice, overload for pull-ups and push-ups, from the research v3);
  share a routine as a file or text.
  - **Folders (tracker schema v7, additive):** a folder is a `workout_plans` row; the folder the
    member FOLLOWS is the active plan, so the frozen rotation (`services/coach.getTodaysWorkout`)
    gives "Today" from it unchanged. New columns: `workout_plans.folder_order / source /
    settings` (JSON: program or builder answers, easy-week rhythm, start day, one-off easy week)
    and `workout_sessions.easy_week`; all in the Drive backup (`cloud/snapshot.ts`). The member's
    old routines are one followed folder. Routines screen: the followed folder first and open,
    the rest folded under name + count; a folder's menu follows it, turns easy weeks on/off,
    takes or skips an easy week, adds a routine, renames, shares or deletes it; "+" adds a
    routine, a folder or a shared file. A routine in any folder opens, starts and gets Targets
    (`getRoutine` → `folderRepo.getRoutineAnywhere`). Routine editor menu: share, move to folder,
    duplicate (same folder), delete; "Swap" on each library exercise (for good: sets and reps stay).
  - **Ready programs (`plans/programs.ts`):** 11 programs in three groups — Gym, Dumbbells only,
    Home — each beginner to advanced; every exercise a library key (test-checked), rep ranges
    from the research table by the program's style and level. Follow it (its routines become
    "Today") or add it to your routines.
  - **Plan builder (`plans/builder.ts`, `plans/fit.ts`, rules only, offline):** goal, level, days
    (2–6), split (best for my days / full body / upper-lower / push-pull-legs), equipment (full
    gym, dumbbells and a bench, dumbbells only, pull-up bar, none), time (30–75 min), "go easy
    on" 7 joints (moves that load them are left out; the i says to stop anything that hurts),
    "leave out" any library exercise, easy weeks. Every input visibly changes the plan (Hevy
    Trainer's review: level and goal barely change it): the level picks the rung (machines →
    barbells; incline push-ups → archer push-ups; negatives → weighted pull-ups), the goal the
    rep ranges, the time the exercise count, the main muscles get a weekly set dose (research
    §5), and plain notes say what the kit cannot cover. The plan screen: each routine with sets
    × reps, "Then: …" ladders for body-weight moves (the i explains reps → harder version →
    weight, the caps from the library), Swap on every exercise, weekly sets per muscle folded.
  - **Easy weeks (research §6.4):** every 6 weeks (default on — the owner's open decision 2,
    Option A, one constant `EASY_WEEKS_DEFAULT`): half the sets, the same weights; the Target
    reads "Easy week · 60 kg · 2 sets", the Workout tab and the live workout show the note
    (why behind the i), "Train normally this week" skips it. Easy-week workouts stay out of
    records, the Target's history, PREVIOUS and the exercise page's numbers and charts (still in
    the history list), give no record pop-up or medal, and never offer "update the routine".
    Offered early when 3 or more lifts of the plan stall (R3/R4), at least two normal weeks
    after the last easy week — also when the rhythm is off (a one-off easy week).
  - **Effort per week (research §5):** members who log RPE see this plan week's effort on the
    Target ("· RPE 7" in week 1 → "· RPE 9" by the block's end; 4-week waves without easy weeks).
  - **Swap for today:** the live workout's exercise menu swaps an un-ticked library exercise for
    one that fits the plan's equipment, sore joints and "leave out" list; the routine stays.
  - **Sharing (`plans/routineFile.ts`):** a routine or a whole folder as plain text (any app) or
    as a `.forgeai.json` file another member opens with "Import a routine file": each exercise
    lands on the same library exercise (by key, else library name), the member's own by name,
    or is added as their own (name, how it's logged, main muscles from the file). Odd numbers
    are brought into range; unusable files are refused in plain words. No web link (no server).
  - **Review round (one reviewer; 2 HIGH, 5 MEDIUM, 5 LOW, 1 unverified), all fixed, each with a
    test that fails before** (`phase4Review.test.ts`, `phase4ReviewStore.test.ts`,
    `sessionEdit.test.ts`): a plan followed before Phase 4 had no start day, so easy weeks never
    came and "Take an easy week now" did nothing (weeks now start the first day the app reads
    the plan); the easy-week note hid on a day with no "Today" (seen: part F's off-plan workout
    emptied "Today" for the push/pull/legs plan); Home and the coach showed normal Targets in an
    easy week; an easy hold asked for last time + 5 s; a new empty folder vanished behind "No
    routines yet"; easy-week workouts reached the frozen PR log (finish, edit and the rebuild
    after a delete), so Home's PR count and the strength score counted them; swaps in a ready
    program ignored its kit (a home program was offered a barbell); "Its 1 routine go too"; a
    swap in an easy week brought back last time's full set count; a 30 dp swap button; the move
    sheet could not scroll; a double tap made two folders; a huge file picked by mistake was read
    whole (now refused over 1 MB). Swept: every on/off switch now has a screen-reader name.
  - **Known, not built / limits:** easing ONE sore exercise for a week (research §6.4, users ask
    for it) is not built — owner choice below; no gym equipment profile (the learned weight step
    stays); no web link for sharing (no server); plans made before this update keep easy weeks
    off until switched on (new plans start on); the chat coach lists only the followed folder's
    routines; the frozen PR check still compares against easy-week sets, so an impossible
    easy-week set could hold back Home's PR count (the app's own records are unaffected);
    "several lifts" is 3 and the offer waits two normal weeks after an easy week (the research
    gives no number); a swap for good keeps the member's sets and rep range; home programs
    assume a pull-up bar (the advanced one also two chairs for dips, said on its card).
  - **Open owner choices (listed, not decided):** (1) easy weeks on by default for new plans
    (built, research option A) or off; (2) add "easy today" for one sore exercise, or keep easy
    weeks plan-wide only; (3) an optional gym equipment profile, or keep the learned step only;
    (4) share by web link once the cloud backend exists, or text and file only.
  - **Found by the phone test (part G), fixed:** the plan opened mid-way after "Build my plan"
    (the answers and the plan returned the same `<Screen>`, so React kept one ScrollView and
    its offset — each now has its own `key`); with a plan followed but nothing planned today
    (part F's off-plan workout), the Workout tab offered "Ready programs" / "Build a plan" as if
    there were no plan — now only when the followed plan has no routines; the frozen `Badge`
    pins itself to the top of a row, so the program page's day tag sat above its line (wrapped);
    after an easy-week workout the finish screen's coach line read "Volume was 80% down on last
    time — fine on a heavy or short day" — it now says the week was lighter on purpose (the
    summary carries `easy_week`; the opt-in cloud note's facts too). Four other stops were the
    flow's own (an off-screen wait, a tap under the status bar, a long scroll slowed by the
    ticking clock, a file the picker could not list until a media scan; lesson recorded).
  - **Tests:** 594 vitest (85 new in Phase 4; 5 preview renders skipped). Device QA run 37643924405
    on 0e4989d passed parts A–G with no app crash in any part's log (part G: 29 screens, below).
    Screens: `Resources/Phase4-screens/`. Effort per week is checked by logic tests only (the
    phone test does not switch on Track RPE); the early easy-week offer needs weeks of stalled
    history, so it is logic-tested too.

- 2026-10-08: **Tracker v0.26.1 — the rest timer on the watch (Phase 5, option A).** Owner brief:
  log on the phone, start rests there; while a rest runs his Wear OS watch shows it, stays in
  sync and buzzes at the end; no logging on the watch.
  - **The rest card:** Wear OS copies a phone alert only when it can be swiped away (ongoing /
    no-clear never), so a rest now posts a quiet swipe-away card (channel `rest-card`, LOW: no
    sound, no banner): title "Rest 1:30 · ends 4:12 pm" (12/24-hour from the phone), text "Next:
    Bench Press, set 3" (`restRules.nextUpLabel`: the next working set; the next exercise down
    the list after an exercise's last set), a count-down chronometer, buttons "+15 s" and
    "Skip". The length in the title is end − start, so +15 s / −15 s move it.
  - **Native piece:** local Expo module `apps/mobile/modules/forge-rest` (Kotlin, autolinked from
    `modules/`): `RestCard` keeps the rest in SharedPreferences, posts/updates/removes the card,
    arms the end (an in-process timer for on-the-second, plus an AlarmManager alarm — exact only
    with "Alarms & reminders", else inexact), and posts "Rest is over". `RestActionReceiver`
    (not exported) runs the buttons — from the shade or a watch (a tap on a copied alert runs on
    the phone) — with the app in the background or its JS stopped. `ForgeRestModule`: show /
    clear / getState / takeOpenRequest + events. "Rest is over" is posted also with the app on
    screen (channel `rest-over-open`: vibrate, no sound — the app rings itself; removes itself
    after a minute) because a posted alert is what buzzes the watch; screen off or app away → the
    loud `rest-timer` channel as before. Tapping the card or the alert opens the workout.
  - **App side:** `services/restCard.ts` (bridge + pure `reconcileWithCard`); the timer store keeps
    `startedAt` and takes card changes (`fromCard`); `workoutAlerts.scheduleRestEnd` hands the rest
    to the card (falls back to the Phase 1 expo alert without it); presence catches up on resume
    and after the saved workout is read back (no clean-up before that any more), and re-posts an
    adopted rest.
  - **Review (one round, one reviewer), all fixed** (`restCard.test.ts`, `hydrateFailure.test.ts`):
    an adopted rest after a force-stop had no card or alarm (M1); show/fireEnd could interleave
    across threads (M2, `@Synchronized`); a failed draft read never ended the restore (L1);
    stale saved rests (L2); the QA script's notification checks matched channel NAMES printed
    after the record list, so they could pass with nothing posted (H1/H2 → `qa/notif.py` reads
    records only); part H's rest too short for the kill-and-restart (M3).
  - **Device QA run 37719613104 on eaf255f passed parts A–H**, no app crash in any part's log.
    Part A: the card during a 30 s rest (`Rest 0:30 · ends …`, flags 0x8 = swipe-away, both
    buttons, chronometer counting down), "Rest is over" on the locked phone (loud channel). Part
    H (`v0261-h.yaml`, `v0261-h2.yaml`): the card in the shade with the app in the background
    (111), "+15 s" from the shade → "Rest 3:15" (112), the app process stopped, then "Skip" from
    the shade → card gone (113), the app reopened with no rest running (114), a 30 s rest with
    the app OPEN → "Rest is over" posted on `rest-over-open`, no card left (115, 116). Screens:
    `Resources/v0.26.1-screens/`.
  - **Known, not fixed:** the cloud phone cannot pair a watch — the watch side is the owner's
    check; with the app's process stopped, a Skip from the watch leaves the "Workout in progress"
    card saying "Resting" until the app is opened (113); without "Alarms & reminders" a locked
    phone's "Rest is over" can be ~10–17 s late (unchanged from Phase 1); some Samsung watches
    do not forward alerts while the phone is in use — then "Rest is over with the app open" will
    not buzz (a watch setting).

- 2026-10-08: **Tracker v0.27.0 — the rest of Phase 5 (around the phone).** Owner brief: Health
  Connect, home-screen widgets, workout reminders, import from Strong, pounds and miles.
  - **Pounds and miles:** Profile → Units "kg, km" / "lb, miles" (the frozen settings store's
    `unitSystem`, also offered on the welcome form — it asks body weight). `src/lib/units.ts` is
    pure and fed by `lib/useUnits.startUnitSync`; stored kg / metres / cm never change. Set rows
    typed and shown in lb (`tracker/components/unitText.ts`), km exercises shown/typed in miles
    (`logTypes.shownDistUnit`; metre exercises stay metres), pace per mile on display (the record
    basis stays 1 km whatever is shown), Targets on pound steps (`stepFor`, a learned step kept),
    plates (45 lb bar, 45/35/25/10/5/2.5) and warm-ups, records, reports, share pictures ("LB
    LIFTED"), coach notes, the chat coach (a bare "135" is lb; "kg"/"lb" words win), body weight,
    measurements in inches. Metric output byte-identical (all earlier tests unchanged). Swept by
    three parallel agents on disjoint files.
  - **Import from Strong** (`strongImport.ts` → the Hevy import's `ParsedHevy`): older comma file
    (units asked once in the preview) and Strong 6 semicolon file (units from headers, comma
    decimals, rest-timer rows skipped). Hevy files exported in pounds/miles read too. Profile →
    Backup → "Import from Strong".
  - **Importing again (owner, mid-session):** a workout already in ForgeAI is skipped — the same
    start (imported before) or the same workout logged in ForgeAI too (same day, start within 30
    min on the clock, `isAlreadyHere`); the preview counts "Already in ForgeAI"; with the member's
    own workouts the import starts on Merge, not Replace.
  - **Health Connect** (native `modules/forge-phone`, connect-client 1.1.0, `overrideLibrary` +
    rationale filter + VIEW_PERMISSION_USAGE alias in the app manifest; JS `tracker/phone/*`):
    Profile → Around your phone → Connect (Health Connect's own screen) → each finished workout is
    a strength session + estimated active calories (`calories.ts`: 2.5 MET strength, 6 cardio,
    above resting, × body weight × time; owner's open choice); an edit re-sends (client id +
    version), a delete removes it; "Send past workouts"; never demo data; imported workouts sent
    at their real time (`realStart`). Missing Health Connect → its Play Store page.
  - **Home-screen widgets:** "Today" (the plan's workout, "6 exercises · Bench Press first",
    done once trained; tap → Workout tab) and "This week" (done days Monday–Sunday against the
    plan); the app pushes their data (launch, resume, background, finish, delete); a widget left
    past its day says "Open ForgeAI…". Added from Profile (`requestPinAppWidget`) or the home screen.
  - **Workout reminders:** off until switched on; weekdays + time (default Mon/Wed/Fri 6:00 pm —
    owner's open choice); the next 14 set as single alerts and redone on launch / finish, so a
    trained day gets none; tap → Workout tab.
  - **Review (one round, one reviewer; 5 MEDIUM), all fixed with failing-first tests**
    (`phase5Review.test.ts`, `reimport.test.ts`): pounds stored two ways (typed vs
    imported/rounded) read as new records — `records.beats` now ties within 1 part in 10,000 and
    imports keep pounds unrounded; 165 lb at the welcome form came back as 164.9; demo workouts
    reached Health Connect; Health Connect missing was a dead end; the pace record basis followed
    the shown unit. Also: accents kept in Strong names, calories record always re-sent, the
    permission screen started on the UI thread.
  - **Device QA run 37732903490 on 2b063af passed parts A–I**, no app crash in any part's log.
    Part I (`qa/v0270-i.yaml`): a Strong file (older layout) imported as pounds (120–122), Units
    lb, miles (123), history (124), a run's Best pace per mile (125), Health Connect on and 9
    workouts sent (126, 128, 129), reminders on — "Next: Tomorrow 6:00 pm" (130), the Today widget
    added and on the home screen (131, 132), a set typed in lb and the finish screen "725 lb
    moved" (133, 134); 28 app alarms after (the reminders). Two earlier runs stopped on the flow
    (a 30 s scroll too short for Profile; the cloud phone pre-grants Health Connect, so the card
    showed "Turn on"). Screens: `Resources/Phase5-screens/` (+ `key-screens.png`).
  - **Known, not built / limits:** Health Connect copies stay if the member erases data or
    Replace-imports; time-only cardio (no distance) counts at the strength rate; reminders stop
    if the app is not opened for two weeks; old chat cards keep the unit they were written in;
    a workout logged by chat does not refresh reminders.
  - **Owner, mid-session — planned (tracker plan, Phase 5 "Next"):** bring his Hevy/Strong
    ROUTINES in (the export has none; study below), share an export straight to ForgeAI, and see
    today's workout before starting it from Home.
  - **Tests:** 661 vitest.

- 2026-10-08: **Tracker v0.28.0 — Phase 6: the member's own routines in, and the gaps found in the
  gym** (owner, mid-session: Hevy routines not imported; see today's workout before starting;
  share an export to ForgeAI; Create from a workout's search).
  - **Routines rebuilt from the export** (`tracker/services/routineRebuild.ts`, pure): a routine =
    a title used 3+ times that is not an app's free-workout name; ticked = the last workout of
    that name; offered = up to 5 more done under it, newest first; sets / rep range = working
    sets of the last time; rotation order by most-common successor (last year); older names
    (no use for a year) fold unticked. Scored on the owner's export vs his saved folder
    (`Resources/Hevy Backups/`): 34/36 shown, 22/24 ticked right, rotation and next-up right
    (`routineRebuild.test.ts` runs that check on the owner's PC only — personal data).
  - **Guided steps** `tracker/components/RoutineImportSteps.tsx` after the import (found → one
    per screen → follow? → done); saved by `services/routineImport.ts` → `folderRepo.saveAppFolder`
    (FolderSettings.fromApp; a re-import refills the same folder in one transaction, keeps
    followed/startISO; nothing ticked saves nothing). Exercise ids via
    `hevyImport.exerciseIdsForTitles` (same `matchTitle` as the history import). The done screen
    shows the frozen rotation's own answer (`homeToday`), not a guess.
  - **Bug found on the owner's file:** a Hevy .csv read 0 workouts — SheetJS turned "5 Oct 2026,
    11:10" into a date number. `XLSX.read(..., { raw: true })` + `parseHevyDate` takes a
    spreadsheet date number (`hevyCsvDates.test.ts`, fails before).
  - **Today preview** `src/app/today.tsx` (Home hero via `tracker/lib/todayLink.ts`, Workout tab
    "See the exercises"). **Create from search** `exerciseSearch.createOffer` + picker footer →
    `library/new?for=workout&name=` (Save adds to the open workout). **km or metres** for own
    distance exercises: tracker schema v8 `exercises.dist_unit` (also in the Drive backup; a
    derived test checks every tracker ensureColumn is backed up).
  - **Share to ForgeAI:** SEND intent-filter (.csv / .xlsx types; no VIEW — a content:// VIEW
    would reach the router), `modules/forge-phone/.../Share.kt` copies the stream to the cache,
    taken once (not again when rebuilt from Recents), `phone/sharedImport.ts` → `/import?file=`.
  - **Reviews (two rounds, two reviewers): 13 findings fixed** — e.g. the next-up text could
    disagree with Home's rotation; an all-unticked save unfollowed the plan; a re-import silently
    replaced edits (now said); Hevy's "Chest Fly (Machine)" is the library's Pec Deck Fly; the
    backup dropped dist_unit; a closed workout behind the Create form.
  - **Device QA:** parts J (`qa/v0280-j.yaml`) and K (`qa/v0280-k.yaml`, Files app → Share →
    ForgeAI); part A opens the Today page. Lessons: a shell `am start` SEND with a MediaStore
    uri did not reach the app's read (use the Files app); test workouts must avoid the demo's
    10 am / 6:30 pm starts or the 30-minute same-workout rule skips them.
  - **Device QA run 37763356020 passed parts A–K**, no app crash. Screens:
    `Resources/Phase6-screens/` (+ `key-screens.png`). Earlier runs stopped on the flows only
    (test workouts clashing with the demo's times; a shell SEND not readable; chips below the
    fold; one flaky notification-shade pull in part H that passed on the rerun).
  - **Tests:** 685 vitest.
  - **Owner choices (Phase 6):** read a Hevy folder link (needs an in-app browser part);
    which routines start ticked. Phase 4's and Phase 5's stay open.

- 2026-10-09: **Tracker v0.28.1 — end-to-end audit after the tracker plan was built.** Four
  read-only reviewers (plan Phases 1–3, 4–6 vs the code; data safety; live workout + phone) and
  one adversarial review of the fixes. No Done row missing or unreachable. Fixed:
  - `forge-rest` `setQuiet` (own prefs file): "Workout sounds" off → "Rest is over" on the
    vibrate-only channel; `showRestCard(..., quiet?)` from `workoutAlerts` and the catch-up re-post
    in `workoutPresence`.
  - Start on `today.tsx` / Workout tab awaits `hydrate()` (a draft saved before a kill was
    overwritten); Start failures alert (also `routines/[id]`). `todayLink.doneToday` →
    "You did this today" / "Start … again".
  - `BackupCard` refuses a restore while a workout is open (its exercise ids would vanish → Finish
    always failed). `snapshot.ts` backs up `exercise_prefs` (`keepWhenAbsent` for old backups;
    derived test: every tracker CREATE TABLE is backed up except progress_photos).
  - `hevyImport`: plain UTF-8 text decoded by `base64Utf8` (SheetJS read a BOM-less CSV as
    Latin-1); spreadsheets, UTF-16 and non-UTF-8 text keep the old path. `sanitizeTitle` keeps
    every alphabet and in-word joiners, drops emoji. Notes keep emoji. A second block of the same
    exercise in one workout sorts after the first. Month names de/fr/es/it/pt/nl.
    `replacedSessionIds` → the import screen removes replaced workouts from Health Connect in
    the background (not for demo data). Demo check failing → Merge. Cached copy deleted.
  - `strongImport.num`: comma decimals in a comma file, thousands marks; one "72,5" in the file
    makes it comma-decimal.
  - `activeWorkoutStore.liveStart`: a live start is never a whole second (`realStart` read such
    a start as an import → Health Connect hours off).
  - Create-from-workout with a taken name → "Add it to the workout". Editing an old workout shows
    EDITING instead of the elapsed clock.
  - Expo patch versions brought in line (`expo install --fix`; app.json plugin change not taken).
  - Plan rows corrected (sounds; volume bars). Left as known: lock-screen card text while JS
    sleeps, pace wording under miles (engine, frozen), From Hevy re-import replaces edits (said),
    late rest alert on Android 14+ (open decision).
  - **Tests:** 702 vitest (`v0281.test.ts`, one per fix).
  - **Device QA run 37912268388 passed parts A–K**, no app crash. The first run (37906347375)
    stopped in part I only: the demo, dated from today, put a 6:30 pm workout on qa-strong.csv's
    22 Sep, and the 30-minute rule rightly skipped its 6:10 pm one — fixture moved to 5 am.

- 2026-10-09: **Tracker v0.29.0 — Import routines from a Hevy share link** (owner: build it;
  research Strong too).
  - `src/app/import/routines.tsx` (paste → reading → steps), entry from Profile's ImportCard and
    Routines "+" sheet. `tracker/components/HevyLinkReader.tsx`: hidden `react-native-webview`
    (13.16.1, new native dependency) on the public page with `Accept-Language: en`, navigation
    limited to hevy.com, incognito; `routineLink.READ_PAGE_JS` waits until the h3 count reaches
    the page's `metadata.routine_count` (or 20 s), posts h1–h5 (+ each h5's box text).
  - `services/routineLink.ts` (pure): `parseRoutineLink`, `parseExerciseBox` ("4 sets · 11-20
    reps", "Rest 2m 15s"; a timed exercise shows sets only — Hevy's own page code read),
    `parseHevyPage` (h2 name, h3 routines, h5 with a sets box = exercise; a routine link = one
    routine), `linkedToFound`, `linkedRests`, `readProblem`.
  - Saving: `routineImport.saveLinkedRoutines` → `hevyImport.exerciseIdsCreating` (match, else a
    custom exercise) → `folderRepo.saveLinkFolder` (FolderSettings.fromLink; same link refills;
    `saveAppFolder` and it share `refillOrCreate`); rest from the link only where none is set.
    `RoutineImportSteps` takes `link` (everything ticked; "As saved in Hevy").
  - **Strong researched:** link.strong.app/<id> serves the same 118-byte redirect for any id —
    no data; templates need Strong's private servers; the CSV has workouts only. Not built.
  - Proven: the exact script run on the live page in a real browser (6 routines, 36 exercises);
    a fake-DOM test runs it on the captured page (`test/fixtures/hevy-folder-page.json`).
  - Device QA part L (`qa/v0290-l.yaml`): paste the owner's link, check, follow, folder Jaipur.
  - Review: 3 fixed (blank-reps exercise made timed; bodyweight asked for a weight; re-import kept old rests) + the sets line read from its own line.
  - **Tests:** 718 vitest.
  - **Device QA run 37953954911 passed parts A–L**, no app crash. Earlier runs found: the done
    screen after a file import read "routines in" (a `{ ...(await x) }` result inside a conditional
    lost its fields on the phone — written out plainly; part J caught it) and two part-L selector
    slips (below the fold; the library name "Cable Triceps Kickback" for Hevy's "Triceps Kickback (Cable)").

- 2026-10-10: **Tracker v0.29.1 — continuity with imported history; exercises new to ForgeAI**
  (owner: after importing routines and history, a routine's session must show the previous
  figures; offer to create exercises ForgeAI lacks).
  - Continuity holds by design (link: `exerciseIdsCreating`; file: `exerciseIdsForTitles`;
    history: `runImport` — all `matchTitle` on `readLibrary`; PREVIOUS =
    `getBoundedExerciseHistory`, imported sessions are source 'manual'). Proven on the phone:
    part L starts the linked Push 1 after part J's history → Skull Crusher PREVIOUS shows the
    fixture's 12 kg × 11 (26.5 × 11 in lb) — `qa-hevy.csv` gained that set on 29 Sep.
  - `RoutineImportSteps` step "N exercises are new to ForgeAI" (link only; `newExercisesIn` →
    `hevyImport.titlesNotInLibrary`, `newExerciseAbout`); left-out ones are filtered at save.
    History import preview: folded "N new to ForgeAI: see them".
  - Review: routines-before-history guessed types from names ("Cable Crunch" ~ "run" → timed,
    PREVIOUS blank). Now `GUESSED_TYPE_KEY` (meta) lists link-made exercises; `runImport` sets
    their type from the real sets when nothing was logged on them; whole-word name check.
  - **Tests:** 723 vitest.

- 2026-10-10: **Audit Phase 0: ready the ground** (shipped in v0.31.0; the v0.30.0 tag was withdrawn —
  its release check found library permissions missing from the approved list) (owner: "go with your picks and start fixing";
  audit plan kept outside this public repo, see CONTEXT.md; decisions D1–D13 = A).
  - D4: coach, nutrition and gym sync hidden behind `src/lib/features.ts` (Home, Profile, Progress
    nutrition charts, Profile daily targets; coach/nutrition routes redirect Home; gym push and the
    Groq finish note gated). A `forgeai://coach?prompt=` link only fills the box (SH-01).
  - `+not-found.tsx` → Home + "That link didn't work." (SH-29). Fonts failing no longer trap the
    splash (`fontGate.ts`, SH-02).
  - Shared blocks: greys raised to ≥ 4.5:1 (`inkMuted`, `inkFaint`; new `inkDisabled`) with a
    contrast test (SH-19, LW-14); `Screen` status-bar strip (SH-28, PG-29); `Sheet` (scrolls, 90 %
    cap) behind `TrackerSheet` (LW-16); `ConfirmSheet`/`askConfirm` (+`ConfirmHost` in the root),
    `LoadError`, `UndoBar`, `FoldSection`; `docs/DESIGN-LANGUAGE.md`.
  - Rest card (Kotlin): a late "Rest is over" alarm is no longer dropped after 60 s; `settle()` on
    getState; exact → inexact alarm fallback; "Ended N min ago" when ≥ 1 min late (RT-01).
  - Credits page (`/credits`, Everkinetic CC BY-SA 4.0, body map MIT, fonts OFL) + readable
    `DrawingCredit` under drawings (EX-05); demo sheet scrolls (EX-11).
  - Safety net: `gen-keystore.yml` deleted (public repo; DS-03). Release needs a green phone test on
    the tagged commit or its paperwork-only parent (`scripts/ci/phone_gate.py`), then
    `release_checks.py` (cert allow-list, version only up, approved permissions, 16 KB, size).
    Phone test: `qa_report.py` crash/ANR/JS-error scan of every part, skipped steps listed,
    rest-alert lateness budget 5 s, share-sheet checks that only Android's sheet passes.
    Unit tests: sql.js real database (`test/helpers/realDb.ts`), migrations from 6 past versions,
    backup round trip, 19 known defects as `it.fails`, CI runs under 3 time zones.
  - Review: 0 blockers; fixed: JS-error scan missed the default logcat layout; off switches and
    disabled arrows used the raised grey (now `inkDisabled`); nutrition charts/targets hidden;
    rest-lateness fallback read the alert's own due time; nested folder list scroll.
  - **Tests:** 871 vitest (5 skipped), dashboard 403.
  - Phone test run 38038041222 on c24ec89: crash/ANR/JS scan clean; E (looked for the hidden coach card)
    and H1/H2 (shade swipe hit the launcher) were test slips — fixed in f819be0, re-run before tagging.

- 2026-10-10: **v0.31.0 — Audit Phases 0, 1 and 2** (one release; Phase 0 above).
  - **Phase 1, never lose data** (5ac6b1a): Android's own backup now carries the database + settings
    (forgeai_backup_rules / forgeai_data_extraction_rules, config plugin `plugins/backup-rules`;
    SecureStore and photos excluded) — phone part M: backupnow → uninstall → reinstall → "76 workouts"
    back (run 38042806197, restored at install). "Save my history" = Hevy-format CSV, exact round trip.
    One app-wide write queue (`src/db/writeQueue.ts`, never nested) + queued single writes
    (`queuedWrites.ts`); debounced draft saves; SaveProblemBanner (storage-full wording). Start-up:
    open/upgrade/read failures → BootErrorScreen with a real retry (`resetDb`) and "Save my data file";
    ScreenErrorBoundary per screen. Demo is a sandbox (welcome-only load + hidden long-press, demo
    strip, removal keeps own data, import over demo removes all demo rows; Replace confirm + safety
    copy + Undo that carries newer workouts forward; Erase all data erases everything). LoadError on
    every reading screen; guarded actions. Review: 10 findings fixed.
  - **Phase 2, the live workout** (d7276b1): FinishSheet (D6), one hint rule + tick saves the hint,
    typing that can't go negative, typo check (D7), same exercise twice (schema v10 card_index),
    workout names (schema v9 title), weight ladder Targets (owner's export: 18 → 0 never-used "Up"
    weights on lifts with 3+ weights), rest timer (D8 ask once, status row, countdown card,
    rest-card-v2 LOW, rests to 10:00), move/multi-add/swap-after-tick/Resume-Discard/double-tap guards.
    Review: 13 findings fixed. Phone flows updated (Finish sheet, labels, demo removal on import).
  - **Tests:** 1,109 vitest. Phone test run 38052813715 on d7276b1.

- 2026-10-10: **Audit Phases 3, 4 and 5** (shipped in v0.33.0; the planned v0.32.0 tag was never made —
  its phone runs kept finding flow slips while Phases 6–8 landed, so all ship together).
  - **Phase 3, trust every number** (5f4b05b): schema v11 `routine_id` — a workout remembers its
    routine; one `todayPlan()` answer for Home, Workout tab, Today, Start, reminders and widgets.
    One rule per number (records D10, weeks streak D9, body-weight change, Latin digits with the
    phone's grouping, a single is its own 1RM). History: endless list with month headers, calendar,
    search across all years. Editing the past + Log a past workout. Review: 1 blocker + 10 fixed.
  - **Phase 4, exercises, routines and imports** (0308758): search that understands people (word
    order, plurals, typos, Hevy/Strong names; ~1 ms), merge/hide exercises; routines keep set types,
    targets, rest, supersets and notes (schema v12); plan builder; imports exactly as saved (dates,
    units, names, repairs). Review: 1 blocker + 10 fixed. New phone part N (History).
  - **Phase 5, Progress and body** (86697b1): "This week so far vs your usual", Your lifts, body map;
    edit/re-date/delete weigh-ins and measurements with Undo; photo dates; opt-in photo backup with
    shrunk copies (expo-image-manipulator); share picture carries the workout's name. Review:
    1 blocker + 10 fixed.
  - Phone flows matched to the new screens (5a421b0): a workout without a routine keeps its
    time-of-day name (LW-10, e.g. "Afternoon workout"); Routines list scroll.
  - **Tests:** 1,438 vitest at Phase 5.

- 2026-10-11: **v0.33.0 — Audit Phases 3–8 and the private signing key** (one release).
  - **Phase 6, around the phone** (39dbe48): weekly reminders (a skipped day bridged 52 weeks),
    7-day widgets with a one-shot per-install key on "Start", honest Health Connect, Done / +15 s /
    Skip on the rest card (Done ticks with the numbers the card showed). Review: 3 + 7 fixed.
  - **Phase 7, calm and usable by everyone** (26203d1): Welcome in 3 steps (D12: optional
    any-country number), Profile autosave + fold, Home's one answer card, one design language
    (workout / record / kg lifted; back arrow; the app's own confirm sheet everywhere; one icon
    per meaning), text grows with the phone's size up to caps, headings, chip states, spoken
    numbers and errors, reduced motion, 48 dp targets. Review: 5 + 8 fixed. Phone part P7: the
    main screens at font size 200 % (and 3-button navigation).
  - **Phase 8, fast with years of data** (a12e149): schema v13 `training_changes` + triggers,
    records cache that catches up per lift, batched Targets/Start, import 5 years ~14 s → ~2 s
    (68k → 490 statements, proven row-for-row equal), export in pages, Home 1 read on refocus,
    photos grid virtualised. Review: a rollback could leave phantom records — fixed in the write
    queue.
  - **Signing key switch** (2eaf220; DS-02, QA-01, QA-26): APK v1/v2 = the old public debug key
    (Android 7–8 update as before), v3 = the private release key with a rotation lineage
    (Android 9+ move over in place). versionCode = semver (33000). A new update-proof job installs
    the previous release on an emulator, then this one with `adb install -r`: same install, data
    kept, new key with the old one in its history (dry run 38082880514).
  - **Phone-run fixes** (7c085a5, 6d3c6aa): History search no longer drops its box mid-word;
    "Rest is over" lost its Done button (Android 14 removed the alert seconds after posting it on
    a locked phone) and each alert has its own tag (an old setTimeoutAfter timer can't remove the
    next one).
  - **Phone-run fixes, part 2** (b80bff1, 795e3e4, 8010982): every sheet rises above the keyboard and
    takes it away when it closes (it covered
    "Fix this weigh-in"); Profile says "Notifications are off" as soon as it opens
    (two independent checks); GWP-ASan off (5f84646: Android 14 crashed the app at launch inside
    Hermes while sampling); flow slips.
  - **Tests:** 1,682 vitest (three time zones) + perf suite (`test/perf`). Phone test run 38109963100 on 5f84646: all 21 parts passed (incl. P7 at font size 200 % with gesture and 3-button navigation, backup restore, rest alert on time, crash scan clean).

- 2026-10-11: **v0.33.1 — the audit's small follow-ups** (97d790b).
  - **Backup text a page at a time:** `exportSnapshot` (Drive backup, the safety copy before a
    restore and before Replace) reads 2,000 rows at a time and turns each page into text at once.
    Same JSON (a test holds it equal to `JSON.stringify` of the whole at any page size). Peak
    held for 5 years: 34.7 → 22.2 MB (`test/perf/phase8snapshotMem.perf.ts`, a process each);
    time unchanged.
  - **"usually under 1 by Saturday"** (was "usually 0.3"), "usually none", whole numbers from 10.
  - Review: no blockers, 2 nits applied. **Tests:** 1,685 vitest. Phone test run 38117252758 on
    97d790b: all 21 parts passed, crash scan clean.

- 2026-10-11: **v0.34.0 — Audit Phase 9, beyond Hevy** (b5ea5a6; owner: "You decide what part").
  - **Entry bar** on the keyboard for the set box with the cursor: − / + the exercise's step (kg,
    or the lb step Targets use), reps ± 1, time ± 15 s, "Copy to sets below" with Undo.
  - **"+2.5 kg on last time"**: a quiet line after a tick that beats the same set last time (a
    record always wins; never warm-ups, drop sets, easy weeks, corrections).
  - **Weekly goal** (Profile → Workout, Off / 1–7): Home, Progress and the This week widget count to
    it. **Milestones** on the finish screen: 1st, 10th, 25th, 50th, 100th, 250th, 500th, 750th,
    1,000th workout, then every 500 (the demo's never count).
  - **Share as text** for any AI chat (workout page, finish, month and year report); body weight
    never derivable.
  - **Start records fresh** per exercise (tracker schema v14 `exercise_prefs.records_from` + 3
    triggers): records, live pop-ups, finish and the record log count from that day; History and
    charts keep everything; backup, merge, erase, imports and an open workout handled.
  - **App icon shortcuts**: "Start <today's routine>" / "Resume workout" / "Start workout", and
    "Log body weight".
  - Not built (owner's call or not provable yet): exercise animations (~$405), Health Connect
    weight read, Hindi screens, Android 16 status-bar countdown, a Wear OS app.
  - Review: no blockers; 3 should-fix + 3 nits fixed. **Tests:** 1,793 vitest. Phone test run
    38127032189 on b5ea5a6: all 22 parts passed (new part P9 + the shortcuts in Android's list),
    crash scan clean.
- 2026-10-11: **v0.35.0 — redesign: 3 tabs like Hevy, demo Shop, rest alert fix** (141fc8a,
  7a27f70, d88651e, 2c0217b, e2e0405, 37ba976, 33328d9; plan in the private audit folder).
  - **Tabs: Workout / Profile / Shop** (Home, History and Progress are gone; old links redirect).
    Workout: the **Up next** card (the next routine of the folder trained last), Start empty
    workout, folders and routine cards inline, Explore for programs and the plan builder.
  - **Profile like Hevy**: photo, name, bio, link; Workouts / Weeks in a row / Records; the
    weekly chart (Duration / Kg lifted / Reps; 12 weeks, year, all time; tap a bar); Dashboard
    tiles Statistics, Exercises, Measures, Calendar; the workout feed with a menu (edit, share,
    delete). Settings are their own pages. Member schema v2: `photo_uri`, `bio`, `link`.
  - **Demo Shop** (S1): sample products, bag, "Place demo order", My orders, cancel. Nothing is
    charged or sent to the gym; the real gym shop is S2–S5.
  - **Rest alert (owner: no buzz on the watch, no sound with the screen off)**: USE_EXACT_ALARM
    and `setAlarmClock` first, so the alert is on time on a fresh install with nothing to allow
    (the "Get rest alerts on time?" question and the test button are gone; a status row shows
    only when something is broken). Doze cannot hold it: Android stays out of deep sleep while
    the rest alarm is pending. Needs a Play Console declaration before any Play upload.
  - **Load retries** (0.3 s / 1 s / 2.5 s) for the Workout tab, Up next and Profile.
  - **Tests:** 1,937 vitest, typecheck clean. Phone runs: 38144864717 (10 parts red, fixed),
    38150955406 (2 flow slips, fixed), **38157467872 on 33328d9: all 23 parts passed**, sound and
    vibrate = "Rest is over" with nothing granted by hand, 41 redesign screenshots, crash scan
    clean.
- 2026-10-12: **v0.36.0 — the gym's own Shop, live, with the owner's web panel** (0b8e03c …
  4bfadf4; owner: "GYM shop ready and the admin panel demo hosted … Member Management and Shop
  Management and working app").
  - **Backend (Supabase, migrations 0002–0004)**: no accounts — the panel's "Start demo" gets an
    OWNER KEY, a member's Join (gym code + name) gets a MEMBER KEY; only SHA-256 hashes stored;
    every call is a key-checked SECURITY DEFINER function, tables closed to the public roles.
    Prices and stock checked server-side under row locks; cancel restocks; stale saves refused
    (CHANGED); 15 orders an hour per member; product photos in a public bucket, uploads only with
    a 15-minute ticket from the owner key. Test gym FORGE1 for the phone test.
  - **Panel** at https://forgeai.aakashpahuja.in (Worker `forgeai-panel`, deploy/panel): the CRM
    (members, plans, payments, receipts, visits, money) plus Shop — live orders (5 s), New →
    Ready → Collected / Cancel, products with flavours/sizes, stock, hide, photo upload — and
    "Joined in the app" members, the join code on Today.
  - **App**: the Shop tab joins the gym with its code; real products and photos (cached for
    offline), bag, "Place order" (pay at the desk), My orders updating every 10 s, cancel,
    leave; "See a sample shop" keeps the S1 demo.
  - Reviews: SQL + panel (no security holes; 4 should-fix fixed), app (2 fixed). **Tests:** app
    1,977 vitest, panel 442. Phone runs 38171234386 and **38177927296 on 4bfadf4: all parts
    passed**, the shop tour joins FORGE1, orders and cancels, the shaker's photo shows; rest
    alert sound + vibrate; crash scan clean.
- 2026-10-15: **Exercise demo clips — pipeline + first 2 clips (no app change yet)** —
  `tools/exercise-anim/`: Blender 4.5 LTS + MPFB (CC0 MakeHuman athlete, CC0 Mindfront "Aksel"
  muscle normal map, our own shorts/dumbbell/bench/shaders), 19 muscle masks keyed to the app's
  muscle names, IK hands locked to the handles, JSON recipe per exercise, Cycles CPU (8 s/frame,
  ~12 min/clip locally). Clips: `incline_dumbbell_press` (WebP 305 KB, MP4 100 KB) and
  `lateral_raise` (247 / 92 KB), 3 s seamless loops, 480 px WebP for expo-image. Cloud batch:
  `.github/workflows/exercise-clips.yml` (manual; one job per recipe, publishes to the
  `exercise-clips` release). How-to: the `making-forgeai-exercise-clips` skill. Not wired into the
  app yet: the demo sheet still shows the Everkinetic drawings.
- 2026-10-16: **v0.45.0 — member icon inside the launcher's trim; the rep range in use everywhere** (73e738a, a6f35a8).
  Member app icon: hexagon 0.80 -> 0.62 of the adaptive layer (its points no longer touch a round
  launcher's edge). Settings -> Rep range on Strength / Muscle / Higher reps: the routine editor
  shows "3–6 reps, from Settings -> Workouts -> Rep range (Strength)." instead of steppers that
  changed nothing; the AI coach's routine lines use the range in use.
- 2026-10-16: **Admin app import: payments lists** (e539077, 68d4ece, 5deb551; deployed). One row per
  payment: a repeated mobile WITH the same name adds its plan and payment to that member (a
  different name is skipped: families share mobiles); "Payment date" column dates receipts; a
  running total or falling balance adds only the new money, capped at the price; typos within 3
  days match the same plan; a failed run says Undo first. Lesson a-piped-build-hides-its-failure.
- 2026-10-16: **Admin app import: several sheets, old .xls, web pages and Excel 2003 XML saved as .xls** (bc7f4b6, 990e5a3; deployed).
  Every sheet is read; the import opens the sheet with the most DIFFERENT mobile numbers (fewest
  repeats breaks a tie, so Payments never beats Members) and a Sheet picker switches. Old .xls,
  web-page .xls and SpreadsheetML go through SheetJS 0.20.3 (cdn.sheetjs.com tarball, lazy 500 KB
  chunk) with RAW day numbers: cellDates put every date a day early in India (review; lesson
  excel-dates-can-land-a-day-early-in-india). Pressed through: a 3-sheet .xls opened "Members".
- 2026-10-16: **Admin app: "Undo this import"; admin app icon** (73e738a, a66c162, 3dbd9d4, d3a181d + this commit).
  - Members -> Import -> "Past imports": each import still in the gym (time, counts) with "Undo this
    import" -> what goes and what stays -> "Yes, undo it". Owner only. logic/undoImport.ts keeps
    everything the gym used since: a term with a desk receipt or any later save (extra days,
    freeze, cancel, PT) keeps its imported receipts; a used imported member (check-in, enquiry,
    desk sale) keeps all the file gave them; a plan a kept term uses stays. Online in 900-row parts.
  - Server 0017 (APPLIED LIVE 16 Oct): crm_push lets the owner delete member / plan / membership /
    payment rows only when the stored data has an importId; front desk OWNER_ONLY. Test
    supabase/tests/0017_undo_import.sql passes in CI and on the live database (no rows left).
  - Pressed through locally (demo gym, server answers faked like the CI crawl): import 2 -> undo ->
    both members and the new plan gone, the gym's own plan kept; Keep it; Hinglish at 375 px.
  - Admin app icon (the panel installed from the website; never "team"): ember tile + dark hexagon,
    admin-*.png. Member app icon: hexagon 0.80 -> 0.62 of the adaptive layer (ships in v0.45.0).
- 2026-10-16: **Wear OS watch app (v0.46 scope; ships with the next tag)** (2fea79f, a8bffcc, c420de0,
  3065ce2, d42f2e2, 34119fe + this commit). Owner's scope: the watch shows and buzzes for rest timers
  and shows heart rate from the watch sensor. Why an app: a bridged phone alert is muted on a Pixel
  Watch while the phone is in use (Lesson pixel-watch-mutes-while-the-phone-is-in-use).
  - Phone (modules/forge-rest, WearSync.kt + play-services-wearable 20.0.1): urgent Data Layer items.
    `/forge/rest` {startedAt, endsAt, next, ended, seq} from RestCard.show / add; {endsAt: 0, ended:
    false} from clear / settle; {endsAt: 0, ended: true} from fireEnd. `/forge/workout` {active, title
    (the live card's exercise), seq} from WorkoutCard.show / hide (with words) / clear, sent only on a
    change. seq = the clock or last+1. No Play services: logs only; API_NOT_CONNECTED stops it for the
    run. Phone permission list unchanged (38, checked in CI).
  - Watch (apps/mobile/android/wear; Kotlin 2.1.20, Compose for Wear 1.4.1, AGP 8.12; applicationId
    com.forgeai.app, namespace com.forgeai.wear, minSdk 30, target 35; versions from
    appVersionCode/Name). ForgeListenerService -> WatchState (prefs + Compose state, older seq
    dropped); the screen also reads the phone's items on open. RestAlerts: alarm-clock alarm at the
    end, Ongoing Activity "Rest #time#" countdown (watch face / Recents, tap opens the app), at the
    end a 3-pulse ~1.5 s buzz (alarm usage) + "Rest is over · Next: ...". A phone "ended" buzzes the
    watch only if its own alarm has not and the end is within 60 s; a rest that arrives already over
    buzzes only within 5 s. Screen: resting = countdown in an ember (#F26B2A) ring (+ small heart
    rate); workout open = live BPM (Health Services MeasureClient, only while visible; BODY_SENSORS +
    health.READ_HEART_RATE asked on first open with notifications; "—" until a reading, plain words
    when refused, tap re-asks or opens settings); nothing open = "Start a workout in ForgeAI on your
    phone". Vector icon traced from the ForgeAI mark. RestTextTest (JVM, 7 tests).
  - settings.gradle includes :wear only with -PwithWear=true: phone-only builds unchanged.
  - CI: wear-build.yml (manual) builds :wear:assembleRelease + :app:assembleDebug, runs the watch
    tests, checks package + phone permissions, and same_signer.py (phone and watch must show the same
    certificate on API 30-36), as Gradle signs them and after a key-rotation dry run with a throwaway
    key through sign_rotated.sh. Runs 38858485944, 38859248515, 38859850478 failed (Guava not on the
    compile classpath; TimerPart has no countDown flag; `visible` clashed with Activity.setVisible;
    lint wanted androidx.fragment 1.3+); **run 38860483576 on 34119fe green** (watch APK 0.9 MB).
  - release-apk.yml: `assembleRelease :app:bundleRelease -PwithWear=true`; the watch APK is signed in
    the same step with the phone's OLD/NEW signers and lineage (sign_rotated.sh), checked by
    same_signer.py, uploaded and published as forgeai-<tag>-wear.apk. release_checks and the update
    proof now pick the phone APK by name (phone_apk_asset; unit-tested), never the -wear one. Not run
    (no tag).
  - Review fixes (9389df0, def26f1; **wear-build run 38863936120 green**): the phone's "Rest is over"
    carries bridge tag "rest-over" and the watch excludes it (BridgingManager, wear-phone-interactions
    1.1.0) only while its own notifications are allowed, so one card and one buzz; the rest card
    (Done / +15 s / Skip) still bridges. /forge/rest carries ringThroughDnd: the watch buzz is
    notification usage (DND / Bedtime silence it) unless that is on (alarm usage + alarm category). A
    saved rest 60 s+ past its end reads as none; BootReceiver (BOOT_COMPLETED, MY_PACKAGE_REPLACED)
    and opening the screen re-arm a running rest and drop a lost one. Heart rate: status reset on
    each start, Health Services capabilities checked first ("This watch has no heart-rate sensor").
    Notifications off: idle and heart screens say the watch-face countdown needs them + Allow.
- 2026-10-16: **End-to-end audit C1 (live workout) + C2 (numbers) fixed** (6d68d32, 05177bf, 215b263,
  179375e; ships with the next tag). Findings and statuses: Audit/e2e-v2/C1-live-workout.md, C2-numbers.md.
  - Live workout: a past workout being logged starts no rest / "Rest is over" (afterTick moved to
    services/tickFollowUp.ts, skips every correction); "Count it" stays counted (countedUntil);
    PREVIOUS matches drops to drops (PrevSet.setType); an edit leaves out saved sets you untick (and
    says so over Save; rows typed while editing still save); record pop-ups never replay; RPE on an
    empty row says what is missing; a new drop row never hints the top set's weight; Target line
    41.25 kg (not 41.3); card tags wrap; Finish counts warm-ups apart; empty time box "—"; deleting
    a ticked set ends its rest; the typo question follows every tick path (RPE sheet, rest card).
  - Numbers: one "Last 12 months" rule (the 12 months ending today, lib/date twelveMonthsFrom) on
    Profile (first bar cut to the span), Statistics and exercise charts; Statistics headline counts
    each set once; the overload gate now covers "Estimated 1-rep max" (owner rule: never a lighter
    set doing more reps; records are derived, nothing to repair); record and chart weights 61.25 kg;
    Measures "since 12 Mar 2023"; streak / rest days read with no 3-year window; exercise chart "12
    months"; Statistics week labels day first; "Records" counts lifts per workout (D10).
  - Kept: C2-2 (owner rule: 12 full weeks ending this week = the current bars). Skipped: C1-10 (DND
    bell) needs native — forge-rest must report Do Not Disturb to JS.
  - **Tests:** 2,702 vitest green (auditC1LiveWorkout 18, auditC2Numbers 13, each failed before its
    fix); typecheck 0; silent-catch and promise ratchets at baseline.
- 2026-10-16: **End-to-end audit C7 (admin app) fixed: 44 of 45** (1d44899, 62945f0, a11e32d, 131e15a,
  57b7b33, 32f6f7f, aef56e8, 3918a08, efeceba, 9e873f3, a334deb; panel NOT deployed). Statuses:
  Audit/e2e-v2/C7-admin-app.md.
  - Money: a fee pressed again after "no internet" is saved once (C7-1: each sheet press has a
    requestId kept on the record; the push id only de-duplicates the same push). Imported members
    are not charged the joining fee again; a cancelled unpaid plan's fee is charged on the right one.
    No plan on top of one paid ahead. Wrong GSTIN / blank gym name refused. Profit counts shop
    orders handed over. Receipts carry who took them (Money: "Taken by", filter, Excel column).
  - Front desk: at most 10% off the plan price, joining fee as listed for a new member (owner:
    anything). Panel says so; server 0019 enforces it and stamps who took the money.
  - Import: Rs. 1,500/- style fees, Total/Paid/Due Fees, Joining Fee and Member ID columns,
    family mobiles, gym vs PT on the same dates, running "paid so far", split files, hand-typed
    duplicates, US dates, discounts, undatable plans, newest-first lists, UTF-16 files, old .xls
    birthdays; imported receipts get an IMP/ series; Undo keeps edited members and voided receipts.
  - Screens: every sheet fits 390 px (overlay column minmax(0,1fr)); typing keeps focus on redraws
    (Sheet onClose in a ref — the root cause, verified live across the 30 s shop tick); cancel
    busy/one save; Starts in N days; Cash default; "Kis din mile" on sale; above-price asks once;
    Hinglish for branding/photo/save/message words and plan history.
  - Skipped: C7-34 (two members on one mobile) — owner decision, touches QR check-in and app links.
  - **DB:** supabase/migrations/0019_staff_discount_and_taker.sql + tests/0019 (RESULT PASS 26 checks,
    CI run 38876053168); the 0018 test's desk discount moved to 10%. **Not applied live.**
  - Review fixes (0a0b004, 7d03e14): a PT plan on a gym plan's dates is never merged into it (hand-sold
    or an earlier file); the same file imported twice adds nothing (a day with a receipt is skipped);
    the desk asks the joining fee only of a member with no plan yet; going online never stamps the
    owner on old receipts and sales; a desk receipt is always stamped, import mark or not.
  - **Tests:** panel 806 vitest green (71 in auditC7*/sheet tests, each failed before its fix);
    tsc -b 0; panel silent catches and promise ratchet at baseline.
- 2026-10-16: **Audit v2 phase B: new automatic test gates** (1da755f, 90dbbfb, 5e46c99, d5492d3).
  Findings: Audit/e2e-v2/B-gate-findings.md.
  - qa-device.yml inputs: `api` 34/35/36 (google_apis x86_64), `profile` default/owner (density 480
    = 360 dp, font 1.3, Asia/Kolkata for EVERY part; P7 puts back the profile's font), `only` = a
    list (w, dnd, longrest, anim, mk), `extra` = opt-in parts added to a whole run. Only a whole
    API 34 default-profile run can open the release gate; all others are named "(partial ...)".
    Job limit 170 → 240 min. The default whole run is unchanged.
  - New parts (opt-in): DND (priority-only DND; Ring through off = reminder on rest-over-sound,
    silent; on = alarm on rest-over-alarm-sound, sounds; notif.py over-is), LONGREST (2:00 rest
    asleep, a 0:30 rest right after inside Android 15's cooldown window, then the 2-min alert
    timeout brings the live card back), ANIM (animation scales 1: reduce motion off; live workout,
    sheet, record pop-up), MK (Monkey, app only, seed 20261016, 12,000 events ≈ 10.5 min; fails on
    crash/ANR or the qa_report scan of its logcat).
  - ci.yml: expo-doctor warn-only (3 of 22 fail, incl. the Hermes V1 memory regression in expo
    56.0.23). Panel crawl: axe-core (@axe-core/playwright 4.13.0) on 22 pages × 2 widths × 2
    languages; critical fails (0), serious warns (receipt grey text 3.89:1).
  - Runs: 38866487837 (longrest, API 35) green; 38866490224 (mk) green; 38870022515 (dnd+anim, API
    36) green after fixing `set_dnd on` = total silence (38866492454, 38866485489 red on that).
    **Owner whole run 38870025551 (API 34, profile=owner, + all extras): 23 of 54 parts red.** The
    new parts passed. The old flows assume 411 dp / font 1.0 (checks below the fold, then cascades
    from part A). Monkey logged `[ForgeErr] workout photo` for a refused camera permission.
    Unconfirmed: W3 keypad over "Skip rest", I2 missing "Notifications are off", P9 toast.
- 2026-10-15: **v0.44.0 — owner's gym-test fixes: RPE one-tap sheet; the rest sound never changes**
  (34db130 + this commit). Owner testing in the gym ("Keep adding the improvements I send in the plan").
  - RPE: the RPE cell opens its own sheet (RpeSheet.tsx): 10 -> 6 with meanings, ONE tap saves and
    closes, no check mark; Clear RPE when set. The set-type sheet is set type only and closes on a tap.
  - Rest sound: with the screen off "Rest is over" played the phone's default tone; the open app
    plays its own rest-done.wav. New channels rest-over-sound / rest-over-alarm-sound play that same
    sound (module raw forge_rest_done, kept from the shrinker); old rest-timer / rest-over-alarm
    deleted; the JS no longer makes rest-timer on a build with the native card. Phone test checks
    the channel's sound URI after part A.
  - Watch did not buzz (no watch workout): code checked against Google's bridging rules — "Rest is
    over" is not local-only, not ongoing, clearable, HIGH (DEFAULT with the app open). Most likely
    the Pixel Watch app's "Mute notifications" under Watch (mutes the watch while the phone is in
    use, i.e. app open in the gym), or ForgeAI off under its phone-app list. The cloud phone cannot
    pair a watch, so this stays the owner's check.
  - Also in v0.44.0 (56fb3c4, 8b7c0c9, e83e470, 0bc15c0 + this commit):
    - Record pop-up: confetti and the record type named ("Most reps", "Heaviest weight", "Most
      lifted in one set / workout"); 4.2 s, an X button; last-time pop-up 3 s.
    - Exercise History during a workout shows the current workout first, marked as current.
    - Press-and-hold drag of exercises in the LIVE workout (all cards shrink to their name row, a
      buzz at each crossing), like routines. Phone part J3.
    - Rest starts on the RPE tap (no second tap on the check); checks no longer buzz on scroll.
    - Science-based suggestions: Settings -> Workouts -> Weight jumps (Small / Standard / Large,
      ~2.5/5/10%) and Rep range (Match my goal / Strength / Muscle / Higher reps). Review fixes:
      gym plates only when Plates and bars was changed, every barbell suggestion loadable, Small
      caps the beginner fast lane, an explicit rep range applies to every row (the routine view
      shows it), warm-ups scale with the working weight, later sets never below the range.
    - Forgotten Finish: no set ticked or typed for an hour pauses the workout timer itself,
      back-dated to the last set + its rest ("Paused at 7:12 pm: no sets for an hour"). A tick or
      typing resumes it; then "Timer paused 7:12 pm to 8:10 pm while no sets were logged. Count it"
      on the workout screen and the Finish sheet gives the time back (a member who logs at the
      end). Not while the hold timer is open; checked 3 s after coming back so shade/watch ticks
      land first; no auto-pause when a manual pause ended after the last set (Finish asks instead).
    - Phone test: J3's screen read retries and falls back to `maestro hierarchy` (the live clock
      can stop uiautomator finding an idle screen; run 38692714816 got no file).
- 2026-10-15: **v0.43.0 — QR self check-in; database safety check and promise ratchet in CI**
  (49fcac0, e93a2cd, 4f4420a, 34dcbd8).
  - QR check-in: panel Attendance -> Check-in QR poster (print / picture) of
    forgeai.aakashpahuja.in/c/<JOIN CODE>. The app opens "Check in at <gym>" (App Link /c/), one tap,
    asks the mobile once; the server (0015 + 0016) matches it to the roster by number and writes one
    visit a day (source 'app', India's date) under the gym lock. The register shows an "App" tag
    and, for app check-ins, the member's plan state and money due. Phones without the app get a
    web page (worker /c/*). Phone part INV-f (F1 join, F2 tap + number + first name + "see the
    desk", F3 already in + Leave).
  - Safety review (1 high, 3 medium, 4 low), all fixed in 0016 + app: the number from Join is not
    trusted (only a number that matched once); 3 typed numbers a day per member and 20 misses an
    hour per gym (stops a script making new keys to guess numbers); code required; a number is kept
    only when it matches; Leave clears it; planOk; TOO_MANY_NUMBERS; lock only before the write;
    one tap so a forwarded link checks nobody in; exact 6-character code. KNOWN LIMIT: the poster
    code never changes, so a member who has the link can still check in from home with one tap; a
    code that changes daily would close it.
  - CI database job (audit pick 6): a throw-away local Supabase applies every migration, runs the
    plpgsql lint, then supabase/tests/*.sql (security.sql: RLS on, fixed search paths, the exact
    anon / signed-in function lists, every table empty for anon, gym A never reads or writes gym B;
    the check-in test, 24 checks). Same tests pass on the live database.
  - CI promise ratchet (audit pick 4): type-aware ESLint (floating / misused promises, empty
    catch); mobile 0 (5 fixed); panel 37 -> 0 (Button catches and logs an async handler's error).
  - Branding leftover (queue item 2, 0986822 + review fixes ce8783e): on Android 13+ a phone in a
    branded gym starts on a plain screen (setSplashScreenTheme, Theme.App.SplashPlain kept from the
    release shrinker), so the gym's logo is the first logo; Leave brings ForgeAI's back. Phone part
    BR checks the ForgeSplash log order.
  - First phone run 38660884469 on 8f95a62 failed: INV-f2 typed the second number after the first
    (test fixed: clear the box); part A got "Couldn't start the workout" with no reason logged, and
    B0/B/H3B/H3C/P2/W followed. Every failed guarded action now logs [ForgeErr] (lib/guardedAction.ts)
    so the next run shows the cause.
  - Rerun 38671642219 on c7e6f8f: every part passed (P2/W rows are the summary's usual split into
    P2A/P2B and w1-w4); no [ForgeErr]; the start failure did not come back (cause unknown, now
    logged if it does). INV-f screens read; BR start-up screen order OK. Tagged v0.43.0 on c7e6f8f.
- 2026-10-15: **v0.42.0 — the small Hevy gaps: pause the workout, your gym's plates and bars, share
  picture Story size and See-through, photos on a workout** (94bdf98, fb73ad5, 1f05da3, cab3c94, 67d5925).
  - Pause (Hevy: tap the duration -> Pause / Resume): pausedAt + pausedTotalMs on the draft (survives
    a restart); saved ended_at = start + time trained so every reader shows the real duration; rest
    timers keep running; a tick resumes. Phone part P2: label unchanged after 70 s, then resume.
  - Plates and bars: switch off plates the gym lacks, add custom plates, pick or type the bar (kg and
    lb kept apart); calculator uses only plates that are on, fills heaviest-first exactly as before
    and searches only when that cannot make the weight; nearest loads below/above. Phone part P1.
  - Share picture: Post (1080x1350) or Story (1080x1920, clear of Instagram's bars); Dark or
    See-through (transparent PNG, white words + shadow); no new figures. Phone steps in part D.
  - Reviewed: no high findings; lb stacks restored; P1 checks the switch really turned off.
  - Photos on a workout (67d5925): up to 4, private, on Workout complete / workout page / Edit;
    feed thumbnails; removed with the workout and by Erase all data; not in the Drive backup.
  - First phone run 38631192810 failed only P1/P2A: their YAML could not be parsed (a heredoc ate a
    backslash); fixed 637b45b, and CI now parses every qa/*.yaml first. Panel (live): Front desk
    (Staff) limits, panel crawl in CI (51903dd).
  - Phone run 38648169401 on 9dedb0a: all parts passed (P1 plate off, P2 9:32 held while paused, photo
    sheet on Workout complete read from the screenshots). Tagged v0.42.0 on 9dedb0a.
- 2026-10-15: **v0.41.0 — press-and-hold drag to reorder routines; Save my measurements; panel steps
  3-5 (live) + 0012/0013** (owner asleep: "continue working till end").
  - Routines: hold a routine card ~350 ms, drag within its folder (as Hevy: "tap and hold on a routine
    to activate drag-and-drop"); DragList (gesture-handler Pan + reanimated; heights on the UI thread,
    held card keyed by id, only a real release saves); maths in tracker/lib/dragOrder.ts (tested).
    Phone test part J2 drags Push A below Pull A with stepped motion events, reads the order back from
    a uiautomator dump, drags it back. Reviewed (1 high, 2 medium) and fixed.
  - Save my measurements (Settings -> Export & import): CSV of weight, fat %, measurements by day,
    Hevy API field names, units by the app setting, refuses on the sample member.
  - Server: 0012 security advisor clean-up (no unintended anon-callable functions; fixed search_path
    on 7); 0013 enquiry/expense record kinds.
  - Panel (live): step 3 home tiles in the rivals' order with lists that match each number, 5-item
    phone bar + More; step 4 WhatsApp typed messages (fees, ending, ended, birthday, welcome,
    receipt) + one-by-one queue; step 5 Enquiries, Expenses (profit), Freeze / Extra din. Reviewed
    (9 findings) and fixed.
- 2026-10-14: **v0.40.0 — audit toolkit first picks, 9 silent failures fixed; panel English | Hinglish
  + install as an app** (8e6c84d, ae7aebc, f8e5ad3, 05a3a95 + this commit; owner: "research skills /
  repos for professional audit... enough is enough", then "go ahead").
  - Audit toolkit (Audit/audit-toolkit/RESEARCH.md): silent-catch ratchet in CI (app TS 304, panel 12,
    Kotlin 60; may only fall; a deliberate quiet catch says `quiet:` + why); the phone test fails on
    any ForgeErr/ForgeHealth warn line, native or JS ([ForgeErr] in ReactNativeJS); new part P0 takes
    the camera permission away and requires Android's camera question + the app's "Camera not
    allowed." message; release gate (phone_gate.py) now also requires a green ci.yml run.
  - CI had been red since v0.38.0 (panel tests could not load on Node 20: the Supabase client was made
    at import and needs WebSocket) — client now made on first use; lesson
    D:/Brain/Lessons/release-gate-ignored-red-ci.md.
  - Silent-failure sweep (Audit/audit-toolkit/SILENT-FAILURES.md), fixed: Erase all data / Remove demo
    leave only after success and name what failed; reminders say "Couldn't set reminders. Try again."
    instead of "Set."; widget Add re-counts on return and shows the long-press hint if none was added;
    "Open Health Connect" failing says where to go; workouts that miss Health Connect are kept (newest
    500) with "Send again" (only while on; Stop clears); Coach mic no longer vanishes (says why; voice
    typing off has its own words); food-photo upload failure says so; import kg/lb or date answer
    re-read blocks Import while reading and undoes on failure; widget/shortcut Start failing says
    "Couldn't start <routine>." Reviewed (3 medium + 5 low), all fixed.
  - Panel (live 14 Oct): English | Hinglish switch (~1,050 strings, CSVs and the printed receipt stay
    English, switch redraws without reloading the gym), install as an app (manifest, icons,
    pass-through service worker, "Phone par app lagao" card + phone banner). Reviewed, fixed.
- 2026-10-14: **v0.39.0 — Gym panel step 1 (records online + sign-in with an owner-made code), and
  the Health Connect "Connect" fix** (76e1a2a 0010, c68eba9 0011, 07dbe13; owner: "give GYM owner the
  option to generate the OTP to give to user till we integrate real OTP service").
  - Server 0010 + 0011 (live, tested in rolled-back blocks): gym_staff (name, Indian mobile, owner |
    staff), gym_signin_codes (6 digits, one use, 30 min, hash only), gym_sessions (session keys;
    _owner_gym accepts them so every owner_* call works), crm_records + gyms.crm_version
    (crm_pull since a version; crm_push all-or-nothing with a base version -> STALE, and a push id
    remembered a day -> a resent push returns its first version). Only owners manage people/codes.
    Sign-in tries counted per mobile per caller IP (5 / 15 min) and per mobile overall (50 / 30 min),
    advisory lock per mobile, one reply for no/wrong code, wrong guesses never burn a code, a new
    code clears the tries. Only check-ins can be deleted (data kept). New gyms: 5 an hour per caller.
    owner_retire_key after a gym goes online. support_make_signin_code for a lost-every-device owner
    (SQL editor only).
  - Panel: CloudCrmData runs each action on a private LocalCrmData copy (same checks + receipt
    series), pushes only changed rows; STALE -> pull + redo; failure -> same push resent twice, then
    kept and sent first (if it lands then, the next action stops and says so); 15 s refresh; one
    queue. Welcome: Sign in / Set up your gym (online) / demo. Settings: Put your records online
    (re-reads the browser copy until stable; demo gym excluded), Staff & sign-in screen (add, make
    code with a WhatsApp message in English + Hinglish, sign out everywhere, remove). Tested live end
    to end: create gym -> member + check-in on the server -> staff added -> code -> wrong code
    message -> staff signed in, sees the owner's member, cannot make codes -> demo gym (1,909 rows)
    copied up in 2.5 s -> reopens in 2 s. Test gyms deleted after. Review: 8 findings, all fixed.
  - App: Health Connect "Connect" did nothing on Android 14+ since v0.27.0 (androidx-only
    REQUEST_PERMISSIONS intent sent by startActivityForResult -> ActivityNotFoundException,
    swallowed). Now launched through the activity-result registry; errors logged (ForgeHealth);
    "Open Health Connect" offered after Connect when access is still off; on 14+ it opens ForgeAI's
    own permission page first. QA part I now revokes the health permissions first, requires
    "Connect" and the system permission screen, and fails on a ForgeHealth "did not open" line.
    Why the audits missed it: Maestro's launchApp grants every permission by default (now denied for
    the two health permissions in part I), so Connect was never pressed with nothing allowed (Audit/audit-toolkit/RESEARCH.md; queue item 0).
- 2026-10-14: **v0.38.0 — invite link + front-desk QR, and gym messages (Phase 1: inbox)**
  (49db908, 1561d2e, a17e394, e21ec07; phone run 38537123277 passed every part incl. new INV; owner: "Start the invite link and front-desk QR, then gym
  notifications").
  - Invite link: one link per gym, https://forgeai.aakashpahuja.in/j/<CODE> (0007 gym_preview).
    Android App Link (autoVerify; assetlinks.json with the release key, Google's checker accepts
    it) opens "Join <gym>": the gym's name and logo first, then Join / "already in" / Switch gyms
    (the new gym is joined before the old key goes, so a failed join never leaves the member in no
    gym). A phone still in the welcome flow keeps the code and opens the screen after it.
    Without the app: the panel Worker (deploy/panel/worker.js, main + run_worker_first) serves
    join.html with the gym filled in (WhatsApp link preview with the gym's name and logo, the gym's
    colours), an intent:// "Join in the ForgeAI app" button that falls back to "First, get the app"
    (/app = 302 to the newest release APK), and the code as the way in. English + Hinglish.
    Panel: Settings → Invite members (the link, a WhatsApp message in English + Hinglish, copy,
    an A4 QR poster to print or save as a picture), buttons on every join-code card, and "Send app
    invite" on a member's page (wa.me only with a full +country number).
  - Gym messages Phase 1 (0008 + 0009): panel Shop → Messages (6 types with ready words, [blanks]
    must be filled, a phone preview, "Goes to N members. Send now?", Sent list with "Seen by x of
    y", Take back; offers/events 1 a day and 3 a week per gym, India days, a quick take-back within
    10 min frees the slot; 20 a day as a runaway stop; sends queue on the gym row). App: a bell beside
    the bag with the unread count, a badge on the Shop tab, the Messages inbox (shows what the gym
    sent from 14 days before joining; marks shown messages seen; a missed "seen" is sent again and
    never lost to a late list); cleared on Leave and Erase all data. member_leave now stamps
    left_at; left members are not counted or shown in the panel. Push to the shade (Phase 1b)
    waits for the owner's Firebase project.
  - Security: the /j/ page's injected JSON escapes "<" (found by review; a hostile gym name could
    have run script on the panel origin for ~40 min before the fix went live; no gym name holds <
    or >). Every new SQL function is SECURITY DEFINER with search_path and RLS on, no table grants.
  - QA: new part INV (a-e): join FORGE1 from its link, the same link says "already in", RAMS01's
    link switches gyms (then Leave), an unknown code says so, and a fresh demo gym's message reaches
    the inbox and the bell's count (a demo gym per run: a lasting owner key for FORGE1 was refused).
    Two adversarial reviews (invite: 8 findings; messages: 11), all real ones fixed.
  - Research (no code): Audit/crm-research/RESEARCH.md — Jaipur gym software (GoGym4U/GGMS made in
    Jaipur lead, GymBook second), the tile home owners know, a 63-term Hinglish glossary, a gap table
    against our panel; owner doc https://claude.ai/artifact/NqVVc5LMWQmd1gT1zeayA8; queue item 6 is
    now "Gym Panel for Jaipur owners".
- 2026-10-13: **v0.37.1 — audit of v0.37.0 "the improved way" (owner: "There should be no bugs")**
  (85840de … d4fff30; findings log: Audit/v037-audit/FINDINGS.md).
  - How: 4 read-only helpers (live workout, records/charts, notifications, branding) with the
    lesson's lens; NEW phone-test part W = one real workout on a phone set like the owner's
    (~360 dp, font 1.3) pinned to Monday 1 March 2027 IST with a ~500-workout Hevy history
    (qa/tools/make_big_hevy.py), every rest waited out, the shade checked after ticks (incl. what
    a watch gets: notif.py watch), screenshots read number-by-label; partial runs via
    qa-device.yml input only=w (named "(partial w)", never opens the release gate); one
    adversarial review round (9 findings, all fixed). ~60 defects fixed in all.
  - Live workout: typed numbers shrink to fit their box (22.5/102.5 were cut at 360 dp);
    Repeat/edit of an imported workout and routine rename keep "Same routine/folder" history;
    Create keeps ticked picks; no Name box on a Repeat of a routine workout; routines rebuilt from
    a Hevy export KEEP their warm-ups / drop / failure sets (found by part W: warm-up PREVIOUS never
    showed for them); import preview label/value no longer run together.
  - Records/charts: e1RM counts reps above 12 as 12 (a lighter high-rep set is no "Estimated
    1-rep max" record; stored records rebuilt once); Profile chart: no "No workouts yet" with
    history, "—" while loading, even bar gaps; chart taps (hold keeps, scroll restores, metric
    change clears); Set records wording (+ / each), rep-record line, Statistics "12 months";
    record subtitles wrap at large text.
  - Notifications: "Complete set" / "Done" work with ForgeAI closed (OfflineTick.kt + queued tick
    applied once at next start, with the tap's own time); "Rest is over" times out (2 min) and
    clears on foreground/tick so the live card returns; one-at-a-time for notes; "All sets done"
    after the last set; cards in the gym's accent. QA: alone fails when nothing shows, live-back,
    new part H3 (Complete set with the app killed).
  - Branding: looks change only at a safe moment (≥60 s away, no workout; under the logo),
    hourly foreground re-check, unlink deferred; palette checks (accent on tint, rounded hex,
    near-white accents); logo must be in the gym-logos bucket (0006_brand_logo_check.sql, applied
    live); logo prefetch; wide logos; widgets/reminders tinted; panel redeployed.
  - Kept/for the owner: Chip outline (frozen, waiting "yes"); shortcut icons orange; reboot
    mid-rest (needs a permission); "Best workout" can pop for a lighter but bigger-volume workout.
- 2026-10-13: **v0.37.0 — the owner's first real gym session, fixed** (7e91df6 … afe840b; owner used
  the app for a full workout and compared it with Hevy screen by screen).
  - Workout: rest starts after EVERY set type (warm-ups and before drops used to start none); warm-up
    rows show last time's warm-ups; RPE in PREVIOUS ("30 × 15 / @ 9") and the RPE column at every
    width (it hid under 380 dp — his Pixel at large display size); "Last: 3 Oct · Push 1A" and a
    first-time hint; Set type sheet ✓ beside ✕, RPE 3×3; target row aligned; Create in both
    add-exercise pickers.
  - "Previous values" setting (Any workout / Same routine / Same folder — his one-folder-per-gym
    setup), frozen per workout; scopes PREVIOUS, warm-ups, Target and notes (historyScope.ts).
  - Records: new "Rep record" (heavier for at least that many reps); "Most reps"/"Best set" only
    announce at no lighter weight; the bar never drops (review HIGH). Records are derived, so old
    workouts' counts can change.
  - Exercise page: Last time as a set table; chart point stays after one tap (every line chart);
    grouped numbers; range control in the chart card; chart on the History tab too.
  - Notifications: live workout card like Hevy's (exercise, next set, picture, Complete set;
    WorkoutCard.kt, channel workout-live, phone only); every "Rest is over" is CATEGORY_ALARM
    (Notification cooldown exemption) and vibrates. Watch buzz during a Pixel exercise: owner to
    turn off Notification cooldown and "Mute notifications from phone"; a watch app if not enough.
  - Review (9 findings) fixed with regression tests. 2,134 tests.
  - Also in this release: "ELAPSED" → "WORKOUT DURATION"; Finish asks for a name only without a
    routine + "Rename workout" on a workout's page; ONE ForgeAI workout notification at a time (the
    first phone run showed the live card and the rest card grouped and collapsed, hiding the rest
    buttons — 1608189); gym branding Level 1 (ed251eb: palette engine with WCAG nudging, colours
    read at draw time — ~75 load-time copies swept, logo opening, panel Settings → Branding with
    live preview, 0005_gym_theme.sql applied live, test gym RAMS01 = RAM'S FITNESS CLUB IMPACT with
    logo). 2,190 tests.
  - Process lesson: Brain/Lessons/forgeai-audits-missed-what-a-real-workout-shows.md + CLAUDE.md rule.
- 2026-10-12: **v0.36.2 — Profile chart shows the range's total; Statistics audit** (9f338ee + review
  fixes; owner: "I selected All Time … why is it showing the total KG lifted just for Oct", "gaps
  between the months not equal", "Last 12 Weeks … showing 0 for all 3 modes").
  - Root cause: the big number was the LATEST bar (this month / this week); on a Monday the new
    week is empty, so Last 12 weeks read 0. Now: the range's total ("Kg lifted since Jan 2023 ·
    509 workouts"), a tapped bar shows that bar, "Show all-time total" (or the same bar) goes
    back. A fixed one-line caption + a fixed-height hint/back line, so a tap never moves the bars.
    "Year" → "Last 12 months" (it always was). Bars pixel-snapped; empty periods get a faint
    baseline mark; the last x label sits under its bar. Real-SQL test: all-time workouts = header.
  - Review fixes: the bars carry the range they were read for (no old bars under a new range
    name); a tap resets when the bars change; the hint is plain text, not a disabled button.
  - Statistics (helper audit): sets chart starts on a whole week/month; an empty current bar is
    not highlighted; "N sets since <date>"; no "vs before" arrows when the log is younger than
    the earlier period; "Last 12 months, against the 12 months before"; dates with a year.
  - Left: Statistics "Year" chip vs "Last 12 months" naming (3 flows tap "^Year$"); All time by
    week is ~150+ bars in the frozen BarChart; the heading "Sets this period against the one
    before" stays when nothing compares (a flow anchors on it).
- 2026-10-12: **v0.36.1 — design pass on every screen** (7b4a085 … fbe7e00; owner, on his phone's
  Profile at large text: "are you not able to judge how assymtrical and bad this looks").
  - Owner's screenshot: name twice, title wrapping with the buttons floating, "Records" alone on a
    second row. Now: title "Profile", name once, Workouts · Streak · Records in one shrink-to-fit
    row; the chart's number gets a caption ("Kg lifted in Jan 2023 · 19 workouts") — 1,67,252 kg
    was checked against his Hevy export (Jan 2023, warm-ups not counted) and is correct.
  - A designer critique of all 46 tour screens + the large-text tour found 18 issues; fixed: one-
    row rest bar, even month-report cards, weekly goal stepper, no eyebrow over Up next, finish
    summary without the duplicate record, readable disabled finish button, tiles that never break
    words, a calm exercise chart (one point per day, inside its plot, metric picker sheet,
    segmented ranges), even Calendar cards with periods, Statistics switches on the title row,
    feed share in the card's top row, workout/product titles on their own row, one status per
    order card, the placed banner clearing, even shop rows, day-first dates everywhere.
  - Panel (deployed): 21 fixes from its own critique — even card grids, readable greys,
    clearer numbers, segmented section tabs, drawn icons, product cards with aligned buttons.
  - Process: Brain rule judge-every-screenshot-like-a-designer; impeccable skill updated and
    wired to every screen review. **Tests:** 2,000 vitest; panel 450. Phone run **38219118445 on
    fbe7e00: all 23 parts passed**; screenshots reviewed by hand at normal and large text.
- 2026-10-16: **End-to-end audit C3 (routines, suggestions) + C4 (import/export) fixed: 38 of 42**
  (97a10fd, 67f1259, 4a84120, 085b8c6, 91e34c6, 8cc33c0, 2461cf6, ff42681, adddfe5, d1a1ea7, 241b344,
  cac9909, 42c14c7, daf1bca; wave-1 review items 3d8f1bd, d30722c; ratchet f043732; ships with the
  next tag). Statuses: Audit/e2e-v2/C3-routines-suggestions.md, C4-import-export.md.
  - Targets: never more than one size step from his real weight (a 1400 kg typo, a 225 kg
    "dumbbell" or an old best are skipped; heavy/light days never teach a 20 kg step; Up walks from
    a clean rung after a unit switch; past the top a bar steps by the smallest plate pair so
    Weight jumps chooses). Back-off and top sets judged apart (their rows hint last time's set; a
    routine's own per-set numbers come first); longer breaks cut more (10/20/30%); a changed rep
    range is never "Reps fell" (rule R6); goals from the last full workout; an extra set never
    blocks; the reason names the shown weight; a routine's Target reads that routine first under
    "Any workout".
  - Routines: "Follow it" and re-opening a shared file keep his edits (file imports remembered per
    row like Hevy links); a Hevy link copied again keeps renamed/reordered routines and a deleted
    second copy; editor Sets then Warm-ups; Duplicate to My routines; "Other routines" label; names
    on 2 lines, steppers wrap; the coach sees every folder's routines, each card of a lift twice,
    the plan week's RPE, and no rep range on holds; warm-ups never under the bar.
  - Import/export: PREVIOUS by set type (a trailing W row reads last time's unclaimed drop;
    rebuilt routines take each set's usual type; old drafts pair by place); Repeat keeps every
    row's type; a time-zone move never re-imports bare "Push" workouts; lb export exact; .xlsx
    emoji/accents; restore says how many workouts go; Strong keeps every set note and blocks.
  - Wave-1 review: a lighter set never sets or holds a 1-rep-max record live, in the list or in
    personal_records (e1rmRecordOf shared by save, rebuild and import; once-per-install log fix);
    a second drop row takes the drop typed above; one-day chart bar "31 Oct 2025".
  - Owner decisions (safest default built): C3-3 routine-first Target under "Any workout" (setting
    line changed). Kept: C3-17 (Rep range sets every row), C4-8 (export keeps ForgeAI
    names). Skipped: C3-31 (not reproduced, frozen Chip), C4-10 (warm-up RPE needs a reader audit).
  - **Tests:** 2,778 vitest pass (69 in the new audit files, each failed before its fix); the 3
    failing source checks (liveCard, offlineTick, v0281) read another helper's uncommitted Kotlin.
    typecheck 0; silent-catch 302 and promise 0 at baseline.
  - Wave-2 review fixes (ebdd038, b8c06fe, d5b6382, da5928d, 738dfa5): a stale routine plan wins
    only on back-off / top-set rows (main rows follow the Target and the row above); a long break
    is judged from the lift's newest workout anywhere; R6 never after a workout at that weight
    reached the range, and a 1-rep-max test day (singles/doubles) is skipped; the one-time
    lighter-set record fix runs per lift in a transaction, marks done last, 5 s after start-up;
    TG-01 restored — the gym's smallest plates only with a custom Plates and bars setup (50 -> 55).
- 2026-10-16: **End-to-end audit C6 (gym side of the member app) fixed: 14 of 16** (5bbada1,
  d69284f, 0ba67af, 2895d7f; ships with the next tag). Statuses: Audit/e2e-v2/C6-gym-side.md.
  - **DB 0020 (`0020_gym_side_retries.sql`) — NOT applied live yet (owner applies).** Green in CI
    run 38878216376 (`0020_gym_side_retries.sql` RESULT PASS 25 checks; 0015-0019 + security
    unchanged). Optional new arguments only, so old apps keep working: `member_place_order(...,
    p_order_id uuid)` returns the member's existing order for a repeated id (C6-1; unique index
    on member + id; looked up after the gym lock); `member_join(..., p_join_id uuid)` gives back
    the same member with a new key within a day (C6-6; only a hash kept); `member_check_in` counts
    one typed number once a day per member and once an hour for the gym (C6-8; md5 tag of gym +
    number) and sends `checkedInAt: null` for a visit with no real time (C6-12). The 2-argument
    `member_place_order` and 3-argument `member_join` are dropped (two overloads would make old
    apps' calls ambiguous). The app retries without the new argument on PGRST202, so a new APK
    works before 0020 is applied.
  - App: order id kept (persisted) until confirmed and a lost answer also checks My orders (C6-1);
    Leave/Erase keep only the member key until the gym confirms (`shop/pendingLeave.ts`), retried
    in `refreshGymNow` (start + hourly), join card and Erase confirm say so (C6-2); new-price line
    (C6-3); list age + product page refresh on focus (C6-4); pasted invite link (C6-5); pending
    links saved 7 days (C6-7); strict invite code (C6-9); badge = orderable count (C6-10);
    "Join <gym>?" for a typed code (C6-11); no 1970 time (C6-12); emoji-safe tile (C6-13); inbox
    cleared with a lost key (C6-15); poster join returns to the check-in (C6-16).
  - Skipped C6-14 (per-card seen + seen marks across re-joins: needs member identity on the
    server). Kept: the 90-day server purge of idle members' numbers (C6-2, needs a scheduled job)
    and Leave keeping the public logo in the image cache (Erase already empties it).
  - **Tests:** 4 new vitest files (32 tests, each failed before its fix); full suite 2,808 pass —
    the 3 failures (memberWords, unitsCoach, coachNote) read another helper's uncommitted words.ts
    work. typecheck 0; silent-catch 302 and promise 0 at baseline.
  - Wave-4a review (4b8e7d9, 14d82bb): BLOCKER fixed — a kept order id is reused only for the same
    bag within 15 min and dropped once My orders shows its order (orders carry client_order_id);
    0020 hands back only an Ordered/Ready order from the last 24 h (index no longer unique). Join
    id kept in storage 15 min; pending Leaves retried after the gym check in the background (4 s);
    another site's link leaves the code box empty, www./:443/scheme-less ForgeAI links read; md5
    tag comment says it is reversible. CI run **38882279748** on 14d82bb all green (0020: 29
    checks). Full suite 2,851 pass, typecheck 0, ratchets at baseline.

- 2026-10-16: **End-to-end audit C5 (notifications, watch) fixed: 13 of 15, plus C1-10** (bd05f96
  phone, d90d16f watch; ships with the next tag — the WATCH app must be updated too). Statuses:
  Audit/e2e-v2/C5-notifications-watch.md. Cloud build wear-build run 38879158104 green (:app debug,
  :wear release, watch unit tests; phone permissions = the approved 38, unchanged).
  - C5-1: "Rest is over" carries the live card's "Complete set" (WorkoutCard.completeAction). The
    11 Oct removal of "Done" from this alert (run 38081757903) is the device risk: if Android
    removes it early, its delete intent brings the live card back.
  - C5-3: countdown on new DEFAULT channel `rest-card-live` (silent), bridge tag `rest-card`; LOW
    `rest-card-v2` only while a watch WITHOUT the ForgeAI watch app is connected (WearSync.probeWatch:
    capability `forgeai_watch_app` from wear/res/values/wear.xml, else NodeClient).
  - C5-4 + C1-10: app on screen → new channel `rest-over-open-sound` (rest sound, notification
    usage, no vibration); `CH_OVER_OPEN` renamed "Rest is over, sounds off". `restBell()` →
    "native" / "hold" (DND, ring-through off) / "app"; restCard.ts `ringerMode()` answers 'silent'
    for the first two (raw ringer: `phoneRingerMode()`), so restTimerStore's bell follows DND. Its
    own `success()` haptic is now the one buzz with the app open. DND + ring-through + app open now
    uses the alarm channel (heads-up).
  - C5-2 + C5-6: watch app shows its own Done / +15 s / Skip (countdown) and "Complete set" (its
    "Rest is over" and workout screen), sent as Wear messages `/forge/act/{done,add,skip}` →
    phone `WearActionService` → the same RestActionReceiver broadcasts. /forge/workout gains
    text + done, /forge/rest gains done. Bridging excludes "rest-over" and "rest-card" ALWAYS.
  - C5-5 `RestBootReceiver` (BOOT_COMPLETED, MY_PACKAGE_REPLACED → RestCard.recover); C5-7
    ring-through re-sent mid-rest, Data Layer pause 5 min; C5-8 same-start re-post keeps
    allDone; C5-9 watch Finish clears its "Rest is over"; C5-10 live card delete intent re-posts;
    C5-11 OfflineTick refuses a card over 1 h old; C5-14 every usable channel checked; C5-15 rest
    card delete intent → live card back (`cardGone`).
  - Open: C5-12 (live card re-posted after "Rest is over" — lessened, needs a one-notification
    redesign); skipped C5-13 (Health Connect, outside this packet's files).
  - **Tests:** auditC5RestBell (6) + 3 source-text tests updated; watch RestTextTest +1; full
    suite 2,800 pass; typecheck 0 apart from another helper's untracked test/_audit_probes;
    silent-catch native-kt 60 → 57. All phone/watch behaviour is [device]: checklist at the end of
    the C5 file.
  - **Review round** (9e5328c qa/notif.py, 8bd051d app; wear-build 38883332525 green; partial
    phone run 38883335192 `only=dnd,longrest` green): notif.py wants `rest-card-live` /
    `rest-over-open-sound`, over-locked FAILS with no card during the rest, requires "Complete set",
    and (asleep) re-snapshots 60 s after the end (`*-hold60.txt`). Both LONGREST alerts were still up
    at +60 s with the button: the 11 Oct removal did not recur on API 34. Watch: bridging excludes
    only while the watch app's notifications are allowed, else it skips its own buzz; allow chip
    beside Complete set. Countdown = lone child of group `forgeai-rest-countdown` with
    GROUP_ALERT_SUMMARY (a fresh post per rest never alerts / wakes the screen). restTimerStore's
    haptic held on restBell "hold". WorkoutCard.hide keeps the live card while the rest card is
    cleared. Watch probe per connected node, also at OnCreate.

- 2026-10-16: **End-to-end audit C9 (every word) fixed: 38 of 48** (e18ef9d, cf19fa4, 29e4f30,
  04272e1, 2a1c412, ab229e8, 03381b3; ships with the next tag). Statuses: Audit/e2e-v2/C9-words.md.
  - S2 Drive backup: new `src/cloud/backupWords.ts` (PlainError, DriveError with a logged
    `detail`, driveStatusWords by HTTP status, backupVersionWords, shownBackupError). drive.ts
    never shows SHA-1 / OAuth / Google JSON / raw sign-in text; a fetch failure is "check your
    internet". parseSnapshot accepts schema_version <= current (older backups restore, added
    columns come back NULL) and refuses only a NEWER one with "Update ForgeAI from the Play Store".
  - Guard (memberWords.test.ts): BANNED moved to `src/lib/words.ts` (BANNED_MEMBER_WORDS +
    usesBannedWord, case-insensitive PR, 1RM/e1RM/est-1RM, "notification volume" exempt), shared
    with coachNote's noteAllowed. New readers in test/helpers/visibleText.ts: kotlinTextOf (skips
    logs, comments, @Suppress, Regex, JSON keys), stringsXmlTextOf, appJsonTextOf, plus words
    given to countWord/tell/say. Allow entries `untilCoach` (engine, services) drop out when
    FEATURES.coach is true; src/ai and the seed chat are read always (swept: record, kg lifted,
    workout, estimated 1-rep max — the design-language term).
  - Admin app: test/crm/adminWords.test.ts (C9-7 guard, green); Close = "Rehne do", record
    cancel = "Cancel karo", "Sign in/out karo"; the owner's tool is "admin app" on screen (title,
    manifest "ForgeAI Admin", install card); "Join code" → "Gym code"; payments show the year
    when the range spans years. Member app: tinyDateWithYear on records, photos, measurements,
    chart readouts, undo bars, share text; routine-from-workout names use dateWithYear; import /
    routine-file errors through importProblem.ts / routineFileProblemText (raw text logged).
  - Deferred (files busy with other helpers): C9-23 (src/shop/checkIn.ts), C9-26 (RestCard.kt
    channel name), C9-34 (src/shop Invite/CheckIn buttons). Skipped: C9-19 (design language),
    C9-20 (Hevy "RPE" header), C9-25 (owner D10). Already fixed by C7: C9-37, 38, 39.
  - **Tests:** member 2,851 pass (+ backupWords 10, auditC9Words 4, guard +16); admin 806 + 4;
    typecheck 0 apart from another helper's untracked test/_audit_probes; tsc -b 0; silent-catch
    and promise ratchets at baseline.

- 2026-10-16: **Phone test green on the owner's phone; the release gate now needs it** (32ca5ae,
  daf8090, 020d173, 02d066b, cf2c080, dd9d1eb, 5938d85, 797a336, b796539 + this commit).
  - Whole runs on 77d5c5d, API 34: **owner profile + Monkey 38921849919 GREEN**, **default
    38921852434 GREEN**. scripts/ci/phone_gate.py: PHONES = default AND owner, each covered on its
    own (the commit or a paperwork-only parent); qa-device.yml names a whole owner run
    "Device QA (owner phone, api 34 ...)"; scripts/ci/test_phone_gate.py (unittest, 9 tests).
  - Flows: sub-find.yaml (scroll to a check's element, down then up, centred, then assert) at every
    below-the-fold check; header buttons brought back centred; chart captions found upward; `only`
    takes any whole-run part (a b c d e f g h h3 p1 p2 i link i2 j j2 j3 k l n p9 r br inv invf p7
    p0 m; demo seeded first when `a` is absent). New app words picked up: C3-3 "Any workout" line,
    C6-11 "Join <gym>?". W3 types the drop set (C1-7: an empty drop row's tick opens the pad).
  - App: routine-import steps open at their top (each step its own keyed ScrollView;
    routineImportStepKey.ts + test); workout photo: a refused camera is info + plain words, not
    [ForgeErr] (permissionRefusal.ts + tests); admin receipt grey 3.9:1 -> 8.2:1 (receiptContrast test).
  - Settled, not app bugs: W3 keypad (flow ticked an empty drop row), I2 "Notifications are off"
    (cascade: reminders never turned on), P9 toast (cascade: 3 sets, so "2 sets below").
  - qa_report.py: three exact React Native touch-bookkeeping lines from Monkey are warnings.
  - Audit file: Audit/e2e-v2/B-gate-findings.md ("Resolved").
- 2026-10-16: **Drive backup/restore review fixes (3)** (ships with the next tag).
  - Repairs re-run after a restore: `RERUN_AFTER_RESTORE` (snapshot.ts) clears the marks
    pr_single_e1rm_fix / pr_long_set_e1rm_fix / pr_lighter_set_e1rm_fix / link_folder_repair_v1 in
    every `replaceAllInTransaction` (Drive restore, its Undo, import Undo); a Drive restore also runs
    them at once (backupStore `rerunRepairs`, after the clock repair). Not cleared on purpose:
    hevy_timed_backfill_done (a guard, not a repair), link_guessed_exercise_types (data).
  - Backups now carry `tracker_schema_version` (14) and `member_schema_version` (2); parseSnapshot
    refuses a newer one with backupVersionWords' "made by a newer ForgeAI"; absent = older, restores.
    Caveat: apps already installed still read only `schema_version` (still 1).
  - A step after the data swap failing (clearDemoFlag) throws `RestoredUntidyError` ("Restored. ...
    Tap Restore again to finish it."); BackupCard refreshes the screens and shows it as a note. The
    retry keeps the pre-restore safety copy (in-memory `untidyRestore`, unless a workout was saved since).
  - **Tests:** test/cloud/restoreRepairs.test.ts (7, failed first); full suite 226 files green;
    typecheck 0; silent-catch and promise ratchets at baseline.
- 2026-10-16: **v0.46.0 — audit v2 fixes, the Wear OS watch app, owner-phone release gate** (tag commit below).
  - Member app: audit v2 waves 1-4 (C1-C6, C9; Audit/e2e-v2/REGISTER.md), C9-23 membership line,
    C9-26 "Rest is over" channel name (3c330f7 keeps its full settings on rename), owner-profile
    fixes (camera refusal logged, routine-import step 2 opens at its top, receipt contrast).
  - Watch app: forgeai-v0.46.0-wear.apk, same key and lineage as the phone APK.
  - Gate: a release needs a whole API 34 phone run on BOTH profiles (default + owner 360 dp/1.3/IST).
  - Admin app (deployed, not in the APK): English only (Hinglish removed on the owner's word),
    Dark | Light switch where the language switch was (color.* are CSS variables; light palette
    4.5:1+ on every plane), ~300 sentences in plainer English, "Void" -> "Cancel receipt".

- 2026-10-17: **v0.47.0 — UAT finish (cloud session), the owner's asks of 16-17 Oct** (tag commit below).
  - Member app: Settings -> Your gym has "Join your gym" with the gym code for a member in no gym
    (U-G5; the join box was only on the Shop tab). RPE tap: the sheet closes, then the set's ✓ pops
    and ticks in front of the member, then the rest starts. A small drag bar on draggable exercise
    and routine cards. Phone icon in the admin app's look. Fixes: the save-problem banner no longer
    takes taps (U-M5); no ghost keyboard / missing tab bar after the app-icon shortcut + Minimise
    (U-M6); "Coming from Hevy or Strong?" wraps at big text; 4 controls given labels / 48 dp targets
    (WP13 lint); shop buttons say "Join this gym" / "Switch to this gym" / "Open the shop" (C9-34).
  - Tests: WP4b phone parts for the last high-risk member gaps (start-up error, auto-pause, "Ended
    at", refused Finish, edit while open, merge, widget/shortcuts, photo backup); WP7 phone
    conditions (qa-conditions.yml); WP13 label/touch-target lint; WP14 pairwise phone settings (11
    rows, docs/uat/ENV-MATRIX.md). Coverage 219/330 tasks on a real screen (66%, was 209).
  - Phone test split into 4 shards in one run (build once, sha256-checked; qa_shards.py check proves
    every part ran): a whole run ~2 h instead of ~3 h 30 min. Owner decision (OWNER-INBOX #14).
  - Owner tools: docs/OWNER-INBOX.md (every idea + answer first), the private Owner inbox page
    (pick and send answers), the /inbox desktop mod (plugins/owner-inbox).
  - Research only (no build): entry machines (P8), GGMS, QR at the gate, gym icon, machine-free
    times, faster CI. Open owner decisions: docs/OWNER-INBOX.md.
  - Admin app: no code change in this release (last deployed 1f2897c5 at 8672a6b).
  - Gate runs (commit 52e8f43, the split phone test): default 39020754722 (green on attempt 2:
    shard 1's part B0 died before its first step on attempt 1; B, H3B, H3C followed from it),
    owner 39020756689, journeys 39020758474. Release review: no blockers; 3 minor items logged
    (FINDINGS U-M7, U-M8, U-G6) for the next release.

- 2026-10-18: **v0.47.1 — the three items from v0.47.0's release review, and sturdier phone tests** (tag commit below).
  - Member app: the RPE tick's ✓ pop plays once (no replay after a drag or a reopen; never on an
    unticked set) — U-M7. The RPE auto-tick fills from the set as it is when it fires (numbers typed
    in the 0.35 s wait are kept) — U-M8. Switching gyms with open orders asks the new gym first: if it
    can't be reached nothing is cancelled and the member is told, naming the new gym — U-G6.
  - Phone tests (U-T1): J3 reads the order from the list's top when no name row is on screen; UF3
    waits for any Workout-tab part; C and G use sub-find for rows that can't be centred. Same checks.
  - Gate runs (commit b43a095, first attempt): default 39074784648, owner 39074786096, journeys
    39074787606. Release review of 7af1403: no blockers; its 3 minor items fixed in f349b7c.
  - v0.47.0 published 17 Oct (release run 39052565058): phone + watch APKs and the AAB.
- 2026-10-18: **Owner inbox #12 step 1 + #11 welcome join** (not released; for v0.48.0).
  - Check-in "You're in ✓" offers the next step (pure `afterCheckIn`, shop/checkIn.ts, from the
    Workout tab's own getTodayPlan): "Back to your workout" / "Start <routine>" / "Add Push Pull Legs"
    (opens programs/gym_ppl_intermediate, which asks follow or keep) / nothing after today's workout.
  - Welcome step 1: folded "Have a gym code? Join your gym" (onboarding/components/WelcomeGymCode.tsx)
    keeps the code in shop/pendingInvite.ts like an invite link; /j/CODE opens after setup. No network.
  - Gym logo home-screen shortcut (#11 icon A): forge-phone GymShortcut.kt (requestPinShortcut,
    adaptive bitmap from the logo, redraw without asking, grey out on leave), shop/gymShortcut.ts,
    once-per-gym offer on the Shop tab, Settings → Your gym row. Kotlin compiled only by CI.
  - Owner inbox page #17 (scripts/owner_inbox_page.py): mark as read, replies, comment-only answers,
    computed "Waiting for you", `--absorb` (CLAUDE.md rule).
- 2026-10-18: **v0.48.0 — gym workout plans end to end, kg to beat, My membership** (tag commit below).
  - Gym workout plans (#6, #19): a trainer builds a plan in the admin app (/workouts) with
    exercises, start sets and kg, or starts from a ready plan, and sends it to members or a whole
    membership plan in one tap. It arrives on the member's phone as a "From <gym> · <trainer>"
    folder; a first time says the routine's start weight. Server 0024 LIVE since 18 Oct (PC,
    tests pass); admin app deployed 3944c634.
  - Kg to beat (#9): Start / Resume shows the kg to beat per exercise with the % over last time and
    a per-set plan; during the workout "done of total · next". U-M9 (line moved while typing) fixed.
  - My membership (#6): plan, end date, days left, PT used, days at the gym this month (0023 LIVE).
  - Check-in offers the workout next (#12 step 1); welcome gym code and the gym-logo home-screen
    shortcut (#11); see the entry above.
  - U-M10 (S2): a routine's own per-set weights no longer come back as stale "back-off" numbers.
  - Release review fixes (2391daf): a deleted gym plan stays deleted; old gym folders say "No
    longer sent" after leaving / removal / switching; hand-typed admin exercises need a main
    muscle so they reach the member; dumbbell kg line wording.
  - Phone flows U-Q1 (4f9434c): INV-c Leave not centred; part B drags from the list edge. No check
    removed.
  - Gate: first runs on 2391daf red on two test steps (U-Q2 part D tap under the status bar; U-Q3
    J3 at 360 dp / font 1.3: first card taller than the list), fixed in the flows at 4d651d6. Green
    on 4d651d6: default 39120213047, owner 39120214610 (J3 found the next name row after 1 scroll,
    dragged, order kept after a restart), journeys 39120216807, CI 39120212122.
  - Tag commit is made directly on 4d651d6 (this entry + the version line), because main moved on
    with notes and the inbox page script (not paperwork to phone_gate); main carries the same two
    changes. The APK's code is the same.
  - Admin app: journey J27c covers the "Ending in 1-3 / 4-7 / 8-15 days" tiles (live since 15 Oct).
  - PUBLISHED 18 Oct (release run 39128079580, attempt 2 after a hand-started CI 39128144598 on the
    tag: ci.yml ignores v* tags and d62c4a4 is on no branch): phone APK 68,975,318 B and watch APK
    2,033,849 B answer 200.

- 2026-10-21: **v0.49.0 — join with 18+ and the terms, "new version ready", Send feedback, no microphone** (tag commit below).
  - Joining a gym (Shop tab and invite link) needs one tick first: "I'm 18 or older, and I agree to
    ForgeAI's terms and privacy notice", with links to both (launch D5/D6; shop/joinTerms.ts,
    JoinAgreement.tsx). A wrong gym code is still told first. Phone flows tick it (qa/sub-agree.yaml).
  - "A new version of ForgeAI is ready" card on the Workout tab (launch C6; lib/appUpdate.ts): GitHub's
    latest release, at most every 6 hours; Get it opens the phone APK; Later hides it until the next
    version. release-apk.yml now refuses a tag that differs from app.json (review MUST-FIX).
  - Settings → Send feedback (launch H7; lib/feedback.ts): typed or spoken with the keyboard's mic, to
    the panel Worker's /api/feedback (Cloudflare D1), no name or number.
  - Microphone permission removed (launch C5; manifest tools:node="remove", approved-permissions list).
  - Keyboard (U-M6b, S2): the screen is padded for the keyboard, and the tab bar hides, only while one
    of our text boxes has the focus; after the app-icon "Resume workout" shortcut the resumed workout
    no longer has a blank band and Minimise keeps the tab bar (KeyboardRoom, keyboardIfTyping).
  - Settings → Send feedback: a very fast double tap sends once.
  - Reviews: three subagent rounds; fixes applied (version check, invite-c scroll, logged update reads,
    Worker hardening, keyboard focus check reviewed clean). Test-script faults found by the gate and
    fixed: U-Q4 (sub-agree pressed Back), U-Q5 (Leave scroll could never be centred).
  - Gate on 28dcf00: default 39621314089, owner 39621317566, journeys 39621321348, CI 39621312862
    (all green). Tag commit = 28dcf00 + paperwork (HANDOFF, this entry). Earlier gate on 7d5ea4d was
    red (UK2, BR/INV, UR) and is the reason for U-M6b and U-Q5.
  - PUBLISHED 21 Oct (release run 39638183366, tag on main, no hand-started CI needed): phone APK
    68,991,702 B and watch APK 2,033,849 B answer 200; GitHub's latest release is v0.49.0.

- 2026-10-22: **v0.50.0 — Machine in use, rest change moves the timer, Save as routine, automatic Drive backup** (tag commit below; built overnight on the owner's R-51 "keep building").
  - "Machine in use": during rest, a tap on the rest clock fills the screen with "IN USE · Back in
    1:32", the machine's name (the lift whose tick started the rest) and the live timer; I'm back,
    Back or the end of the rest closes it (MachineInUse, RestTimerBar).
  - Changing an exercise's rest moves its running rest by the difference (2:30 -> 3:00 adds 30 s;
    Off leaves it alone; the old length is the running card's own) (restRules.runningRestShift).
  - Finish screen: a member with no routines who finished an empty workout can keep its exercises as
    a routine in My routines (a button, never a pop-up) (saveFirstRoutine).
  - Automatic Google Drive backup when leaving the finish screen, for members who linked Drive AND
    whose phone has backed up before (review MUST-FIX: a new phone must never bury the real backup);
    a Workout-tab card when the last backup is over 3 days old, with the error's own words; offline
    at start no longer shows a linked member as unlinked (cloud/autoBackup, BackupNudgeCard,
    backupStore.init).
  - "What's new" card (lib/whatsNew): the first version an install meets is remembered, never
    announced, so news shows from 0.50 -> 0.51 on.
  - Send feedback and the update check give up after 15 s (lib/fetchTimeout).
  - Reviews: two subagent rounds (one MUST-FIX, minors fixed). Test-script fault found by the gate:
    U-Q6 (UF5 looked under the wrong day when a run crossed midnight in India).
  - Gate on 5a8375b: default 39647353406, journeys 39647362273, CI 39647345689 (green); owner
    39647358581 red only on U-Q6, repeated on the same code as 39664337093 (tag qa-v050-owner).
    Tag commit = 5a8375b + this entry (main moved on with the U-Q6 script fix, not paperwork).
  - PUBLISHED 22 Oct (release run 39680117943; CI 39680118695 dispatched on the tag): phone APK
    69,012,182 B and watch APK 2,033,849 B answer 200; GitHub's latest release is v0.50.0.
- 2026-10-22: **Landing page live** (owner's yes, Project Tracker #40). deploy/panel wrangler.jsonc
  vars.LANDING "live"; Worker forgeai-panel version d88dc22f (no asset changed; dist built after the
  last admin change 0379acf). Checked deploy: tsc, vitest 929 (one unnamed red on the first run, then
  5 green), journeys 45 passed (E2E_CHROME = the installed Chrome: Playwright's own chromium-1187 is
  incomplete on this PC), build. Live: /home/ 200 with the CSP, no console errors at 375 px, the top
  form refuses a short number in the page; /api/lead 400 / 201 (bot) / 405 (GET). No test lead written.
  Tracker: "How it will work" column for every backlog row not built (R-52); "Several branches"
  Planned; decision #41 (branch pricing).
- 2026-10-22: **Landing page says what it is** (owner R-54): "Gym software + member progress app" as the
  tub's statement of identity directly under the headline (never above it: no kicker), English + Hindi;
  the same words lead the page title and og:title (the WhatsApp link preview). To keep "Call me for a
  free demo" on the first screen: hero spacing tightened, headline 16vw -> 15vw, the claim and the band
  hint shortened (same facts). Button bottom at 360 px wide: 749 of 757 (was 773, below the fold
  before this change). Checked deploy: tsc, vitest 929, build, journeys 45; Worker 4af80c65.

- 2026-10-22: **R-55 batch (owner: "all the planned features and to do tasks you can finish")** — admin side live,
  member side = v0.51.0 candidate 4e5983d (gate running).
  - Block-proof address: panel Worker /sb/* -> Supabase (deploy/panel/proxy.js, stamps answers X-Forge-Proxy);
    admin (on our domain) and member app use it, switching to the direct address for 10 min on no answer, an
    unstamped answer or (member) a 10 s hang, never resending; sessions kept under the old storage key; logos
    and photos SAVED with Supabase's address (review MUST-FIX), loaded through ours in the member app.
  - Admin: GST tax invoice (title, place of supply from the GSTIN, reverse charge No, signature line).
  - Offline front desk step 1 (live 23f1fb7d): IndexedDB copy of the online gym (savedCopy.ts, keyed by a hash of
    the key, cleared on sign-out / dead key), opens offline under an "Offline mode" bar, saves refused in plain
    words; service worker keeps the shell network-first. Step 2 (main, not deployed): desk check-ins kept offline
    and sent later with their own time (flushQueued), J34 covers it. Privacy notice EN + HI updated.
  - Landing (main, not deployed): dedicated played sections (workout + new record, shop order, free notices,
    lock screen + watch), impeccable finish review round fixed; captures in apps/dashboard/.impeccable/review.
  - Research: R-google-login.md (#43), R-brand-name.md (#44); found Drive backup hidden (googleWebClientId
    placeholder) -> owner task #42 with the release key's SHA-1 (97:F8:...:88).

- 2026-10-22: **v0.54.0 — one release for 0.52 + 0.53 + R-77 + R-78** (0.52.0 and 0.53.0 were never tagged on their own).
  - 0.52.0 lines: warm-ups keep last time's numbers, dumbbell totals split, last-done from any folder,
    the progress box at the top of each exercise, "Last" beside the rest timer, bodyweight reps to beat,
    Health Connect past-workouts question, In use after each set (Settings → Workouts).
  - 0.53.0 (R-75): the finish screen's comparison opens into a per-exercise list (CompareNote, workoutCompare
    deltaReason only gives a reason that moved with the row); muscle tips for groups the last 3 weeks left out
    (muscleTipsStore hydration wait, snooze/mute keep the weekly clock); the workout code for the desk
    (shop/claimCode, same file in the admin app; nothing leaves the phone).
  - R-77: joining a gym shows the welcome opening ("Welcome to <gym>", 1.8 s) then the home-screen icon
    pop-up once per gym (GymIconOfferHost: add → confirm → how to remove the plain icon; Android cannot
    swap the app's own icon for a downloaded logo); no gym = no third tab, Gym tab, Shop once the gym lists a
    product (shop/gymTab); GymOnly guards bag, product, orders; Settings → Your gym has its own Leave row.
  - R-78: one tab-bar highlight that slides to the tapped tab, its leading edge faster than its trailing edge
    so it stretches as it moves (lib/tabPill, Reanimated springs; reduce motion jumps).
  - Undone: f98d8df made number boxes ignore touches until opened (so a drag on a box scrolls); it broke
    typing in 15 phone-test parts (run 39758056150) and was reverted in 9258c49. Known issue kept in
    CLAUDE-NOTES: a drag that starts on a box does not scroll; P7BIG falls back to a side swipe.
  - Gate on 9258c49: default 39772408594, owner 39772411860, journeys 39772415575, CI 39772408248 (all green).
    Tag commit = 9258c49 + this entry.
  - PUBLISHED 22 Oct (release run 39789841069; CI 39789833624 on main): phone APK 69,508,190 B, watch APK
    2,033,849 B, AAB 56,641,375 B; the APK link answers 200; GitHub's latest release is v0.54.0.
  - Admin + landing deployed the same evening (version bc42db80): offers step 1, claim-code check, R-76 holding
    pages (/privacy.html and /terms.html checked live), offline step 2, landing sections.

- 2026-10-23: **v0.54.1 — a drag that starts on a set box scrolls the workout page** (R-79, built while the owner rested).
  - Cause: on Android a one-line TextInput with centred text counts as able to scroll sideways (its layout is
    VERY_WIDE), so ReactEditText.onTouchEvent never gives the drag back to the ScrollView. The set boxes
    (SetRow) are multi-line now: the layout is exactly the box's width; Enter still blurs (submitBehavior
    blurAndSubmit), a pasted line break is dropped. Not pointerEvents (that broke typing, run 39758056150).
  - Proof: P7BIG swipes FROM the set 1 weight box and asserts the page moved; on the owner profile both
    navigation modes took 03a-swiped-from-box and passed (the default phone already showed the link).
  - Gate on 2385142: default 39814847937, owner 39814851301, journeys 39814871703, CI 39814846871 (all green).
    Tag commit = 2385142 + this entry (main moved on with CLAUDE.md + owner_inbox_page.py, not paperwork).
  - PUBLISHED 23 Oct (release run 39834068476; CI 39834082014 dispatched on the tag): phone APK 69,508,190 B;
    the APK link answers 200; GitHub's latest release is v0.54.1.

- 2026-10-23: **#47 AI import live (admin app)** (owner R-82: cheapest AI first, Claude fallback).
  - Panel Worker /api/ai/match-columns (deploy/panel/aiMatch.js): owners only (staff_me via the device key),
    masked headers + 5 rows (phones in any script, emails, ID numbers hidden twice), Gemini gemini-3.1-flash-lite
    (thinking minimal, 8192 out) then claude-haiku-5-5 (effort low, JSON format), 10 s each; 20 reads a gym an
    India day + 1,000 total, one atomic D1 statement (forgeai-web migration 0003_ai_usage applied 23 Oct).
  - Admin: AI fills only columns the rules left empty (marked AI); extra columns kept in the member record;
    Aadhaar/PAN columns by content (60%), numbers cut out of every value; manual matching always works.
  - Review (subagent): 1 MUST-FIX (ID column dropped by its name) + 2 SHOULD-FIX (masking gaps, Gemini thinking)
    + 4 NITs, all fixed (fc063d7). Checks: tsc -b, vitest 1032, playwright 50, panel node --test 37.
  - Deployed 23 Oct (version a2f535d8). Keys not set yet: the endpoint answers "not switched on" (503).
  - Keys set by the owner 23 Oct (GEMINI_API_KEY, ANTHROPIC_API_KEY secrets). Proved live: qa-journeys 39895450334
    step XJ7 (e2e-live/xj-aiimport.live.mjs; vite preview proxies /api to the panel Worker) matched a test
    register with Hindi column names in 6 s.

- 2026-10-23: **#49 offers step 2 built** (owner R-82: A + automatic or manual giving). Not switched on.
  - Server: supabase/migrations/0025_workout_offer.sql (NOT APPLIED; offers, members, counted dates, consent/
    reward log, group + timed messages); tests supabase/tests/0025_workout_offer.sql (71 checks on PGlite).
  - Member app: Gym tab offer card, consent first, dates only after Join, same set at most once a day; hidden
    while the server lacks 0025. Admin: Messages & offers → Workout offer (auto/manual, Ready, one-tap Give,
    owner take-back), group and timed messages; old server = "not switched on".
  - Review: 1 MUST-FIX (desk could re-give a taken-back reward) + 4 SHOULD-FIX + NITs, all fixed (30b7c36,
    a8b2928, 22f6d29). Checks: mobile 3186, dashboard 1053, journeys 53. Admin deployed 23 Oct (4d5be99a).
  - Next: owner OKs the consent words (#49) -> apply 0025 + its test in the SQL editor -> privacy notice lines ->
    member release (version bump, phone gate).

- 2026-10-23: **#49 step 2 switched on**: 0025_workout_offer.sql applied LIVE from the SQL editor (pasted in
  parts, sha256 prefix 32a6d47197e9f34a checked in the browser before running); tests on LIVE: 0025 RESULT PASS
  (71 checks), security.sql as of 22f6d29 RESULT PASS (9 checks; main's copy already lists the not-yet-live HQ
  functions). Privacy notice EN + HI got the 4 approved lines (Last updated 23 Oct). Member app v0.55.0 (offer
  card) bumped; gate dispatched.
- 2026-10-23: **#51 HQ server parts 2 and 3 LIVE** (owner R-87: "yes, apply the owner panel database parts 2 and 3").
  0027_hq_actions.sql (sha256 86004f236272103b) and 0028_hq_breakglass_and_logs.sql (abd06ca14fd6faf6) applied from
  the SQL editor; all 217 existing gyms = 'active'. Live tests: 0027 RESULT PASS (64), 0028 RESULT PASS (49);
  security.sql (main) fails ONLY on the 3 not-yet-live 0029 functions. Public key: hq_* = permission denied;
  owner_hq_access answers BAD_KEY. D1 0004_ai_limits applied. Admin app deployed (version c6fbc814: ForgeAI access
  card). HQ Worker deployed (1a94b03f) at forgeai-hq.aakashpahuja.in, fail-closed 503 until SUPABASE_HQ_KEY +
  GOOGLE_CLIENT_ID/SECRET (owner task #52); HQ_ALLOWED_EMAIL + HQ_SESSION_SECRET set. 0029 asked as #53.
- 2026-10-23: **HQ sign-in live + 0029 reminders LIVE** (owner: "B, HQ Keys are in", "yes to #53"). HQ secrets all set
  (owner pasted SUPABASE_HQ_KEY + GOOGLE_CLIENT_SECRET, type Secret); Google returned the Chrome profile account, so
  HQ_ALLOWED_EMAIL = both owner accounts; signed in, gym list loads (223 gyms, most are QA journey gyms). 0029 applied
  (sha256 8bb3d9a2725ada57); live tests 0029 PASS (60), security.sql (main) PASS (9).
- 2026-10-24: **v0.55.0 released** (tag on the PROGRESS commit after e0f701a; only notes after the tested commit).
  Member app: the workout offer card on the Gym tab (#49 step 2), automatic gym reminders scheduled by the phone with
  the owner's switches (R-86, 0029 live), paused-gym words (HQ #51), and U-M6c (no ghost keyboard room after the app was
  away or a typing screen closed: Keyboard.dismiss on background + a 0.5 s focus check). Gate on e0f701a: default
  40019013968, owner 40034087489 (rerun via qa-e0f701a-owner; first owner run's emulator never booted), journeys
  40019021892, CI 40019026334. On the way: 5 test races/infra fixes (brand-welcome pop-up, part L sheet, J38b
  headings, aiMatch hang on Node 22.23, UR typing check) and run-device-qa.sh retries a part once on Maestro's
  DeviceServerDiedException only.

- 2026-10-24: **R-97 live (web): free 3-month trial + public prices + HQ trial controls** (commit 9b3fc87, panel
  661f4677, HQ b0a35c8a). Landing: trial is the first door (hero + lid "Start free" -> /start), one layout for every
  played section (words left, stage right; phone: words, stage, list), scenes loop while on screen (stop off screen on
  the finished state, tap to pause), loosened spacing, desk-work list, "moving in privately" (AI import; claim true to
  aiMatch.js), "Pick your pack" (Starter 999 / Pro 1,999 / AI 2,999 coming / founding lifetime 29,999; prices decided
  by Claude, #30, after a 12-product market check). Finish review (impeccable-finish-reviewer, 4 captures) fixes
  applied. Admin app: /start opens Start my gym; Today trial banner (after 0030); manifest linked only once signed in.
  HQ: summary, search, filters, sort, gym CSV export (gym facts only, audited), trial and plan controls, confirms;
  works before 0030. **0030_plans_and_trials.sql NOT APPLIED** (tracker #55). Tests: dashboard vitest 1081, e2e 62,
  HQ 48, panel 40, PGlite migrations 20 files (0030 PASS 41).
- 2026-10-24: **R-98: member-facing English** — every What's new line (0.44-0.55) rewritten in plain words and checked by
  a fresh-reader subagent; lines carry an optional `go` button (opens the screen/setting); Settings -> What's new and
  the card show the last 3 updates. Global skills: obra writing-clearly-and-concisely + own `member-words` (Gemini
  second opinion via gemini_rewrite.py once the owner sets GEMINI_API_KEY, tracker #56). App 0.55.1 prepared.
- 2026-10-24: App 0.56.0 prepared (MettleUp rebrand: package com.mettleup.app, E Forged icons, Release A layout with 4 tabs, Health Connect fix, Play-install detection, APK published as mettleup-<tag>.apk). Domains mettleup.fit + mettleup.in moved to Cloudflare (registry confirmed). Gate: CI + Device QA default/owner api 34 + journeys.
- 2026-10-24: **0.56.0 gate red, all test-side (Release A flows had never run on a phone).** Device QA 40097554901
  (default) + 40097556274 (owner) and journeys 40101624114 read part by part, no app bug found:
  (1) Back from a Settings page lands on Settings mid-page, where sub-settings-open saw none of its rows and waited
  for the tab bar Settings hides (parts B, I, W1; I2 failed after it as part I never turned reminders on): it now
  looks UP for "Your profile" first. (2) Gym tab "No gym? Everything else works without one." sits below the edge
  at 360 dp / font 1.3 / font 2.0 (R, UE, BR, INV-e, INV-f3, P7BIG, P7NAV3, journeys J1 and so J2-J6):
  sub-gym-none scrolls to it, then back to the top. (3) Leaving a gym (Settings since Release A) redraws the app
  (RootFrame keyed on the theme epoch) and Settings comes back at its top: BR-WELCOME, BR, INV-c and xj-5-leave
  accept "Your profile" too. (4) Part D: "Weeks in a row" is on the Profile tab, Charts on Progress: tap Profile
  first. (5) Part UD: the export is mettleup-history-<date>.csv since R-105. Owner BR "start-up screen not
  switched" = BR stopped before its join. mobile vitest 3395 pass, typecheck 0.
- 2026-10-24: **0.56.0 gate round 2 (56880ca): default Device QA + journeys green; owner Device QA red, all test-side.**
  Owner run 40107401680: BR's Gym tab "Shop" heading and R's first product ("Whey protein 1 kg") sit below the edge
  at 360 dp / font 1.3 (membership, Check in, My orders come first): scroll to them. BR stopping there left the phone
  in RAMS01, so INV-a..f3 all met "You're in RAM'S ... Switching" (cascade; their screenshots show it) and P7BIG's
  clean-up Leave (branded: Settings comes back at its top) waited for "Join your gym": it accepts "Your profile" too.
  CI J26 (desk2.spec, 7 vs 6 pushes, also on 318905b; green on b69cf0d/6b397d6): the extra push is the desk's own
  receipt-series claim (`deskseries-2`, cloud.ts ensureDesk, sent when a money sheet opens), landing after the
  count; the refused payments sent nothing (trace). The test now waits for both claims, then also asserts no
  payment dated 7 Sep / 18 Oct ever reached the server. J26 x6 locally green.
- 2026-10-25: **0.56.1 prepared: no USE_EXACT_ALARM (Google Play blocked the closed test over it).** Play allows
  USE_EXACT_ALARM only for alarm-clock / calendar apps. Removed from forge-rest's manifest and approved-permissions.txt;
  the app manifest strips any library's copy (`tools:node="remove"`); release_checks.py FORBIDDEN fails on it even if
  re-approved (+ test_release_checks ForbiddenPermissionTests, vitest phase2RestTimer guard). Without "Alarms &
  reminders" (SCHEDULE_EXACT_ALARM, OFF by default on Android 14+) the rest's alarm stays inexact (setAndAllowWhileIdle,
  unchanged). The rest bar asks 'Hear "Rest is over" on time' (Allow opens ACTION_REQUEST_SCHEDULE_EXACT_ALARM; Not now
  waits 7 days: restAlertPrefs.exactAskedAt + shouldAskExact cooldown); Settings → Rest timer and sounds keeps the
  "Rest alerts: May be late" row. RestBootReceiver now takes SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED and re-arms
  a running rest exactly (getState already re-armed on return). QA: device/journeys/conditions allow the app-op before
  every Maestro flow; C6a denies it, checks no USE_EXACT_ALARM is installed, and the ask (new qa/xc-6-ask-rest.yaml),
  waits up to 15 min for the inexact alert. What's new 0.56.1: one line. The watch APK (sideloaded, not in the AAB)
  still declares USE_EXACT_ALARM: change it before the watch app ever goes to Play.
- 2026-10-25: **0.57.0 prepared: backup FILE for every member (R-123).** Settings → Back up and restore → "Save a backup"
  writes ONE stored ZIP (src/backup/zipStore.ts, chunked, no new native module; expo-file-system File handles) =
  backup.json (format mettleup-backup v1, packVersion 1: pack.ts records 'w' 'r' 'x' 'p' 'b' 'm' 'u' + hiddenExercises and
  libraryEdits by ref + import meta + meals/chat rows + settings per SETTINGS_KEYS) + photos/ (progress, workout, profile,
  exercise media) and opens the share sheet; free space checked first, "Saving 37 of 210 photos…". "Restore from a backup"
  (also on the welcome screen, which makes the profile from the backup): summary + who made it, Replace (wipe except
  library, photos, gym folders and gym link; same ids so order and routine links stay) or Add (same id / same content /
  isAlreadyHere start rule skip), records rebuilt (reconcilePrsForExercises), settings through each store's merge,
  Health Connect never switched on by a restore, Undo via importSafety's safety copy. Guard test backupCoverage.test.ts
  derives every stored key/field/table from the source. Tests: test/backup/* (round trip on sql.js with non-default
  next-weight rules, ForgeAI-made file, Add, Undo, no space, junk/newer refused). QA part UBK (qa/uat-bk.yaml, fixture
  qa/tools/make_backup_zip.py). copyLocal applyInTransaction caches library refs. What's new 0.57.0 +2 lines.
- 2026-10-25: **Drive backup = the backup file (R-123, coordinator).** Settings -> Backup -> "Back up now" now makes the
  same ZIP as "Save a backup" (photos + settings) and uploads it with Drive's resumable upload straight from disk
  (cloud/drive.ts uploadBackupFile, FileSystem.uploadAsync BINARY_CONTENT; mettleup-backup-<date-time>.zip, 5 kept);
  "Restore from Drive" downloads the newest to disk (downloadNewestBackup) and restores it with backup/backupRestore.ts;
  the 24-hour "Undo the last restore" copy also records the photo rows, picture files and settings it added. Old
  database-only forgeai-backup-*.json copies are still listed and restored the old way. Restoring a backup file never
  lets the import clock repair move its workouts again (import_clock_real_v1 defaults to done). Tests:
  test/backup/driveBackup.test.ts (back up -> restore on a second phone -> undo), driveUpload.test.ts.
- 2026-10-25: **0.57.0 review fixes (review subagent, 8 findings, 7 fixed).** The automatic Drive backup waits for
  Wi-Fi (the file holds every photo); a phone short of room for its photos still backs up the rest; Drive builds its
  file in cache/drive-upload/ so it never deletes a file "Save a backup" is sharing; a Drive restore checks room before
  replacing the last undo copy; a welcome-screen restore that fails removes the profile it made (no stray "Member");
  Back is held while a welcome restore runs; save and restore pause between 1 MB chunks (no frozen screen on a video);
  utf8Encode writes into one Uint8Array (no number list). Left: a failed records rebuild after Replace is only logged.
  Phone test: part W (clock in 2027) excuses only its own certificate errors (the account calls run since R-128).
- 2026-10-25: **v0.57.0 RELEASED** (tag on b0befd4, pushed from the owner's PC: the cloud session's proxy refused tag
  pushes). Play upload did not start by itself (workflow_run never fired); run by hand it crashed in the AAB upload
  (httplib2 followed Google's 308 "Resume Incomplete" as a redirect): play_common.service() drops 308 (aeef836, guard
  test). Then 57000 committed on internal + alpha. APK: releases/download/v0.57.0/mettleup-v0.57.0.apk
- 2026-10-29: **"Your growth" BUILT on branch feat/business-growth (on top of feat/owner-analytics; not merged, not deployed).**
  Owner, 30 Oct: "does buying our system truly impact their revenue and growth?" Owner-only page `/growth` (canOpen:
  seeTotals), reached from a link under "Your numbers" on Today, More, and the side menu; `/growth/print` = one A4 page
  (gym name + logo from ownerGym brand, summary, before/since table, 2 charts, months) for browser Print / PDF.
  Logic `logic/businessGrowth.ts` (pure): per month money (non-voided receipts by paidOn), active members on month end
  (gym terms, not cancelled, >= 7 days; archived members kept in the past), joined, renewed/lost/waiting by the month
  the plan ended (renewed = a later plan starting <= endsOn + 15 days, early renewal included), visits / active.
  Start = gym createdAt or the earliest non-imported member/membership/payment createdAt. Before = up to 6 months before
  the start month that have a plan ending in them (a day-one roster has none, so it never fakes an empty past); needs 2,
  else "first N vs latest N finished months" (N <= 3) and an "Add old records" card -> /members/import. Since = finished
  months after the start month (latest 12); renewals/lost use only months past the 15-day window, and the table/charts
  show "–" for those. Summary lines only with both sides; "since", never "because of"; season/prices note. CSV of every
  month. Demo: gym made 214 days ago, everything dated before marked with one importId, plus check-ins 60-400 days back
  from a second PRNG (register rows before the start, checkedInAt 0). Coordinator follow-up: the demo is what prospects
  see, so its story is a believable success: plans ending before the start lapse at 33% (+14% break), since at 20%
  (+6%), joins lean less to recent months (curve 1.1). Demo story (today 17 Oct): money +27%, active 55 -> 78,
  renewals 60% -> 76%, members lost 2.8 -> 2.2 a month, visits 6.1 -> 7.9; Sep still has a high-loss month.
  Words: member-words + Gemini 3.8 Flash pass. Research: docs/overhaul/research/R-business-growth.md.
  Checks: tsc -b 0, vitest 1356 (businessGrowth.test.ts 27 new; demo.test.ts register rows have no time), playwright
  103 passed + 1 skipped (growth.spec.mjs J-G1..3 new), crawl 33 pages x 2 widths clean, axe 0 serious.
- 2026-10-28: **0.58.1 prepared: gym notices pop up on the phone (R-153 step 1, no Firebase).** Root cause of R-151:
  push was never built (no FCM token, no sender; the inbox was read only while the app ran). expo-background-task +
  expo-task-manager (new native modules, autolinked): task mettleup-gym-notices (shop/noticeTask.ts, imported by
  index.js), registered every 15 min while in a gym with "Messages from my gym" on (Settings → Reminders; carried in
  backups); runs refreshInbox() and pops one local notification per new notice on channel gym-messages (HIGH), >3 = one
  summary; first look / notices > 7 days old are marked without a pop-up; never twice; foreground marks without a
  pop-up; tap opens /shop/inbox. Step 2 (real FCM push) planned in CLAUDE-NOTES R-153.
- 2026-10-28: **R-153 step 2 BUILT (not live): gym messages AND offers push to members' phones (Firebase FCM).**
  Sender in the HQ Worker (deploy/hq/push.js: own RS256 JWT, FCM HTTP v1 data-only messages, cron every minute + POST
  /push/run kicked by the panel proxy after owner_send_message / owner_save_offer via service binding HQ_PUSH). Server
  0038_member_push.sql NOT APPLIED (member_push_tokens, push_jobs by triggers, member_save/clear_push_token,
  hq_push_next/drop). App: google-services plugin + google-services.json, shop/pushToken.ts (save/refresh/clear the
  FCM address), push task in noticeTask.ts (marks shown so the 15-min check never repeats it). Left: live 0038 (owner
  yes), FCM_SERVICE_ACCOUNT secret, privacy line OK, release. Details CLAUDE-NOTES R-153.
- 2026-10-29: **v0.60.0 RELEASED to testers; watch app NOT on Play yet (owner must answer Play's health question).**
  Tag on af5dd2c = tested 81697eb + one release self-test fix (tracker page test read the old Waiting filter after R-184).
  Phone gate on 81697eb: Device QA default+clip 40799027591 green, owner 40824664436 green, journeys 40799034012 green,
  CI 40795951095 green. Two real app bugs found by the gate and fixed first: the feedback button covered the Calendar's
  Sunday column (hidden on Calendar) and a row's "More" button (default spot moved). Flaky steps shipped under the
  test-only rule (same step passed on the same commit, cause outside the app): owner part R (shared test gym stock 25 vs
  24, the parallel default run ordered the same shaker), owner part J ("Save and add to workout" not found; passed on
  the same commit before and after), UK2/UK3 shortcut (passed alone on 0.60.0 both profiles and on v0.59.0), journeys
  J1/J5 (passed on 81697eb). Release run 40838435757: gate, build, publish green; phone 60000 on Play internal + alpha.
  Tag was re-made lightweight (an annotated tag made the Play job's tag fetch refuse; deleting it drafted the release,
  re-published). Watch: Play answered "Track not found: wear:qa" (Google's docs name) - Play's own list for this app is
  wear:production / wear:beta / wear:internal, so the upload now targets wear:internal (50035a8). Re-run 40843843284
  uploaded the watch bundle (1000060000) to wear:internal, then Play refused the commit: "You must let us know whether
  your app includes any health features." Nothing changed on Play. After the owner answers that in Play Console (App
  content), re-run "Play upload" for tag v0.60.0 with dry run off. Admin app deployed (forgeai-panel b1724ef3); HQ unchanged.
  APK: https://github.com/aucksy/ForgeAI/releases/download/v0.60.0/mettleup-v0.60.0.apk
- 2026-10-29: **0.60.0 prepared (R-187): seven built branches on main, cherry-picked in order onto 0cafe18.** Feedback button
  (R-149), progress trio (finish-screen kg vs last time, kg per workout on exercise History, body-weight moves read every
  workout), how busy the gym is (0039 live), gym-mate profiles (0040 live), admin What's new + crash/outage alerts (#34),
  exercise clip player (lateral_raise + incline_dumbbell_press v6), watch app (next set with last time, ambient, signed Wear
  OS AAB in the release, Play track wear:qa). Conflicts: main's APPLIED LIVE 0039/0040 files and main's approved privacy
  text kept (branch PROPOSAL blocks dropped; legal_pages.py stripping kept); security.sql has both 0039 and 0040 lines.
  Watch track name checked against developers.google.com/android-publisher/tracks (prefix "wear", internal "qa"):
  play_upload.py refuses phone-style lookalikes (wear:internal...) and an unlisted custom wear: track; the watch step
  is no longer continue-on-error (red job + error annotation), it runs after the phone edit is committed.
  FEEDBACK.md release rule = R-175. Review subagents (2, one round), fixed: a mate could divide a shared workout's kg by
  its reps to get body weight (share bar weight only); busy answer >30 min old hid offline; "Fewer reps" wording; watch
  buzz late in ambient without exact alarms (partial wake lock until the rest ends) and heart-rate sensor off in ambient;
  card re-sent when only the watch lines change; crash reports never send a non-Error's details, keep stack columns,
  public crash issues carry no reported text; a failed gh call no longer skips the watch upload. Left (low): release
  run does not repeat wear-build's watch-APK permission checks; clip QA "moving" check compares whole screenshots.
  Gate: mobile vitest 3751 pass + typecheck 0; dashboard tsc -b 0, vitest 1322, e2e 99 (+1 skipped); panel 70+, HQ 53,
  watch scripts 5, CI Python 80. Release route (R-175): testers first (Play internal + alpha only), shared parts changed.
- 2026-10-28: **v0.59.0 RELEASED** (tag on c6131ba). J7 had failed on the live AI import (Gemini 3.1 Flash-Lite 503
  "high demand", Claude fallback out of credit): panel Worker now asks a busy Gemini again after 1.5 s, then
  gemini-3.5-flash-lite and gemini-3.5-flash on the same key (timeouts move to the next model, 32 s budget), then Claude
  (73b4ed6, 717958f; deployed forgeai-panel b9b74a67; live log showed 503 then ok on the retry). Journeys 40695620891 green,
  release run 40751061345 green incl. play-upload (59000 on internal + alpha).
  APK: https://github.com/aucksy/ForgeAI/releases/download/v0.59.0/mettleup-v0.59.0.apk
- 2026-10-28: **0.59.0 prepared (replaces 0.58.1, which was tagged on fecd97b but never published: its phone gate failed
  and journeys 40678520480 died on a Gradle transform flake).** Holds R-153 step 1 (15-min check + local pop-up) and
  step 2 (FCM push for gym messages and offers; 0038 live, HQ FCM secret set, admin app deployed), R-138 kg to beat =
  PREVIOUS's last time (57f3639), R-143, R-146, R-138 tail, R-145, R-152. Review subagent (one round): 3 findings, 2 fixed:
  a push before the first look whose inbox read failed saved only that notice, so the next 15-min check popped up every
  older unread one (now saves nothing; test added); the root sync acted on empty defaults after a 5 s hydration timeout
  (forgot shown notices; now waits for the real load). Left (product, LOW): the switch is on by default but permission is
  asked only when flipped. Device-only unknown: data-only push with the app fully closed. typecheck 0, vitest 3651 pass.
  What's new 0.59.0 replaces 0.58.1's line (member-words, Gemini 3.8 Flash pass).
  NOT TAGGED: Device QA default 40695609894 + owner 40695615918 green on c6131ba; journeys 40695620891 red on J7 only
  (live AI import: Gemini 503 high demand + Anthropic credit balance too low). Details CLAUDE-NOTES R-162.
- 2026-10-26: **v0.58.0 RELEASED** (tag on 33cabec; CI, Device QA default + owner, journeys all green after the
  brand-welcome flow fix). Release run 40302380878: phone-gate, build, update-proof, publish and the NEW job
  "play-upload / upload" all green: Play upload ran BY ITSELF for the first time (58000 on internal + alpha).
  APK: https://github.com/aucksy/ForgeAI/releases/download/v0.58.0/mettleup-v0.58.0.apk
- 2026-10-26: **Gym leaderboard + challenges (R-133): server 0037 LIVE, admin app deployed; member app next release.**
  Spec docs/research/R-leaderboard.md. Server: gym_member_days (per day workouts + kg, 31 days, plausibility: <=3
  workouts, <=60000 kg a day), gym_member_board (name opt-in, hidden by the gym), gym_challenges (+ results kept in
  gym_challenge_hits at the end), deletes on leave (trigger) and after 62 days (on push and reads, once a minute per gym),
  push throttle 15 s. Live tests 0037 PASS 221, security PASS 9 (CI database job too). Admin app: Challenges page.
  Member app: Gym tab card, day push after a save / on start / foreground / Gym tab, Settings → Your gym → What my gym
  can see, join screen line. Privacy notice EN + HI (owner "as written"), privacy.html rebuilt. Review: 18 findings fixed.
  Deployed forgeai-panel version ef1ac74f from a clean worktree of 835a2da.
- 2026-10-26: **v0.57.1 RELEASED** (tag on 6eef21a; CI, Device QA default + owner, journeys all green after the
  flow fixes in 6eef21a). Release run 40225623184; play-upload again did not start by itself (workflow_run never
  fires: open item), run by hand 40228526554: 57001 committed on internal + alpha.
  APK: https://github.com/aucksy/ForgeAI/releases/download/v0.57.1/mettleup-v0.57.1.apk
- 2026-10-25: **0.57.1 prepared (R-131, R-132).**
  - Welcome start view before the 3 steps: "Sign in with Google" (WelcomeGoogle: Drive for everyone,
    drive.peekNewestDriveBackup without making a folder, "We found your backup from <day> with N workouts" ->
    checkForBackup + restoreFound + refreshAfterRestore + boot; "Not now" keeps it on offer; "Use another Google
    account"; gym members keep the server-copy sign-in), "Do you train at a gym?" (WelcomeGymCode inSection), "Already
    have workouts?" (backup file, From Hevy / From Strong -> step 1), "Start fresh", demo link. A running Google restore
    holds Back and the rest of the start view; a restore forgets a Hevy/Strong pick. Words: welcomeStart.ts (Gemini).
  - Progress: SegmentedTabs Kg lifted / Sets / Duration on top; TodayGoalCard = today's Up next (getTodaysWorkoutWithTargets)
    Targets summed by the one volume rule (volumeService.plannedVolumeKg) vs the last workout of that routine with a
    working set (getLastRoutineTotals); new / pyramid (topSetOnly) / version-switch lifts are left out and named; assisted
    keeps its negative help; easy week said. History chart: 'sets' metric (SessionTotals.sets), chips hidden on Progress;
    Profile maps a stored 'sets' back to Kg lifted; the chart is read again only when the history stamp changes.
  - Review subagent (19 findings): fixed the welcome restore race, double taps, refresh after restore, the Hevy pick after a
    restore, assisted/pyramid/new-lift math, the load-mode lookup (removed), untrue lines, Profile 'sets', empty last
    workouts, chart re-reads. Left: dead WELCOME_GYM_ASK path; gym members can't pick Drive on the welcome.
  - Phone flows: 12 welcome flows walk the start view (helper). What's new 0.57.1: 3 lines (fresh-reader checked).
- 2026-10-24: **v0.55.1 RELEASED** (tag on 4aa917b; CI, Device QA default + owner api 34, journeys all green).
  APK: https://github.com/aucksy/ForgeAI/releases/download/v0.55.1/forgeai-v0.55.1.apk

- 2026-10-24: **#41 multi-branch + #36 import that never fails + #38 terms online (built, NOT APPLIED, not committed).**
  - Server: `supabase/migrations/0031_branches.sql` (gym_groups + gyms.group_id/receipt_prefix/branch_no; a branch is a gym;
    owners own every branch, desk staff per branch; owner_branches/add/open/rename_group; branch_* visitor check-in;
    B2/ receipt series enforced by trigger; member_check_in accepts another branch's QR for allBranches members;
    hq_groups). `0033_terms_acceptance.sql` (append-only acceptance with version, how, sha256(gym:ip);
    gym_create_online gains p_terms_version). Tests: 0031 PASS 115, 0033 PASS 27, all 23 suites pass on PGlite.
  - Admin app: `src/crm/branches/*` (provider + keyring, switch at the top, All branches page, Settings -> Branches,
    Visits -> Member from another branch), receipts.ts prefixes, member "Can train at every branch", TermsGate +
    Create my gym tick box, Settings line. Import (subagent): branch column / sheet per branch, Rows to check, every
    extra column kept, 13 fixtures. HQ: groups with branches and members per branch, price per branch as info.
  - Review fixes (same day): "Paid" column read by its contents (money <= Amount / yes-no flag / dates; new
    paidFlag field); paused branch no longer blocks owner removal; one lock per business for people changes;
    visitor look-ups 30/hour/branch; terms versions only from _terms_versions(); new branch copies HQ status,
    plan, trial and GSTIN. Terms check waits at most 4 s, then opens the panel (offline desks) and asks next
    open; old admin apps are not refused by the server (a gym made without a version is asked later).
  - Checks: dashboard vitest 1157, e2e 72 (+1 skipped), HQ 51, panel 40, crawl clean, ratchets at baseline.
  - Waiting: owner yes for 0031 + 0033 live; terms/privacy pages are still holding pages and have no gym-owner
    data agreement text (owner wording); deploy admin app + HQ + panel Worker (AI branch field) after the yes.

- 2026-10-29: **Gym colour from its logo (R-160), branch `feat/gym-colour-webcam` (not merged, not deployed).**
  - `packages/theme/src/logoColour.ts` (pure, no AI): opaque pixels -> 5-bit-per-channel boxes -> drop near white
    (OKLCH L>0.93), near black (L<0.17), greys (C<0.04) -> merge look-alikes (OKLab dE<12) -> score share x (1 + 0.5
    vividness), drop <2 % -> top 4. `suggestBrandColour` = the shared palette engine's own dark-app nudge (lightness
    only, hue kept) so the suggestion is exactly what members get; reports text-in-colour ratio on the dark planes
    (4.5), the colour as a shape on white (3, the printed ID card bar; yellow is reported pale, not hidden) and the
    words on it (4.5).
  - Admin app, Settings -> Branding: the logo is read from a 64 px canvas while it uploads (`readLogoColours`); a box
    under Colour shows the suggestion, "Use this colour", the logo's other colours as swatches, and plain checks;
    a saved logo can be read with "Suggest a colour from my logo" (fetches the public logo, CORS). Nothing auto-saves.
  - Storage: the existing brand accent (owner_set_brand, 0005). No server change, no migration. The member app
    already repaints with the gym accent (apps/mobile theme/brandTokens.ts), so no mobile code changed.
  - Tests: dashboard vitest +14 (`test/crm/logoColour.test.ts`), e2e `e2e/logocolour.spec.mjs` (2 journeys).
- 2026-10-29: **Webcam photo at the desk: NOT built, stopped.** No member-photo storage exists: `Member.photoUri` is
  never set (not in the form, import sets null) and only the ID card reads it; there is no member-photos bucket (only
  public `product-photos` and `gym-logos`); records are capped at 20 kB each and pulled whole, and the privacy notice
  does not cover gym-held member photos. Needed first: a PRIVATE bucket + staff-session upload/read rules (migration),
  a retention/delete rule with member delete, and the owner's privacy-notice wording.
- 2026-10-29: **Offline front desk step 3 finish (#7, R-185/R-186), branch feat/offline-desk-3, not merged/deployed.**
  - Found: step 3 itself (payments, sales, new members, edits offline; per-device receipt series D1/D2; conflicts) was
    built 24 Oct (9c832be) and is in the live admin bundle; the tracker row was stale.
  - Added: bar headline "Offline: N waiting to send." + "See what is waiting" list (outbox.ts waitingList, DeskState.list,
    ui/offline.tsx); over-paid note when two desks took money for one plan (outbox.ts overPaidP in replayRecords).
  - Server: 0041_offline_desk_receipts.sql (NOT APPLIED LIVE): an offline-series receipt of a claimed desk skips
    OVER_DUE. Test 0041 PASS 18 on PGlite; fails 4 against the 0021 rule.
  - Design doc: docs/overhaul/OFFLINE-DESK.md. Checks: tsc -b, vitest 1311, panel 63, e2e (J34b list + phone fit).
- 2026-10-30: **Message calm (R-195), branch feat/message-calm, NOT merged, 0042 NOT APPLIED.** (1) Admin app Messages:
  messages.calmNudge = one calm line above "Send in the app" from the 3rd in-app message of the India day (or the 8th in
  the 7 days ending that day); counted like capProblem (appear day, taken-back not counted); the pop-up sentence only
  once the server's rows carry "quiet" (0042 live); Sent list pill "No phone pop-up". (2) Quiet after 2 a day:
  supabase/migrations/0042_message_calm.sql adds gym_messages.quiet (BEFORE INSERT trigger: 2+ not-taken-back messages
  already on its India day), _push_job_message finishes a quiet message's push job at once ('quiet'), _message_json
  carries "quiet"; member app noticeAlerts.planNoticeAlerts never pops up a quiet one (the 15-minute check; needs the
  next member release, older apps still pop it up from that check). (3) DAY_MAX and the server's TOO_MANY 20 -> 10
  (0025's owner_send_message copied, one number changed). Tests: 0042 PASS 22 and all 32 DB suites on PGlite (0038 test
  moves its first two messages to yesterday before the paging step); dashboard vitest 1331, e2e J35c (nudge + shot).

## Next (pre-B2B2C, still valid)
- The release key is made privately on the owner's PC (never in this repo or a workflow log);
  only its encrypted Actions secrets reach GitHub.
- Candidate follow-ups: full lb unit support, richer AI coaching prompts,
  onboarding for a real (non-seeded) member, Play Store prep.

## Deliberately deferred (not bugs - scoped for the demo)
- (Pounds and miles shipped in v0.27.0 — no longer deferred.)
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

- 2026-10-29: **Admin branches merged to main and deployed.** Merged in order: feat/owner-analytics, feat/business-growth, feat/gym-colour-webcam, feat/offline-desk-3, feat/message-calm (mobile test files of message-calm kept; they ship in the next phone release). Conflicts: crawl.mjs route list (kept /settings/news and the numbers routes), PROGRESS.md (kept both sides), migrations 0041/0042 add/add (kept main's "applied live" copies; no SQL run). Landing page: the lock-screen messages line now shows as available (English + Hindi). Checks: tsc -b 0, vitest 1396 pass, build 0, e2e 107 pass + 1 skipped (Edge via E2E_CHROME). Deployed with wrangler from deploy/panel.
- 2026-10-29: **0.61.0 prepared.** Contents since v0.60.0: spoken feedback through our Worker to Groq Whisper (R-206; his own
  Groq key, ZDR on), crash reports kept 90 days (#72 A), quiet gym messages never pop up (R-195; 0042 live), watch Ring
  redesign (R-207, glance-only), watch buzz long-pause-short. Adversarial review (1 HIGH, 3 MED, 6 LOW): fixed the HIGH
  (a 2-minute note read length 0 after expo-audio's own stop and was deleted as too short), privacy line matches the
  approved notice (#73 A), watch rest screens beat "phone not connected", "Rest alerts" also asks Alarms & reminders
  once (askedExact), double start/finish guards, clip deleted on leave even if stop fails. LOW left: dimmed phone check,
  late-answer retry, long "Rest is over" with an old phone app. Play Data safety updated and sent for review (voice
  ephemeral optional; crash logs + diagnostics). Checks: tsc 0, vitest 3761 pass.
- 2026-10-29: **F67 Install the watch app from the phone, branch feat/watch-install-from-phone (not merged).**
  - Native (modules/forge-rest, NOT compiled locally): WearSync.watchAppState (NodeClient connected nodes + CapabilityClient
    "forgeai_watch_app" FILTER_REACHABLE -> none / installed / missing; unknown on error or 8 s) and WearSync.installOnWatch
    (RemoteActivityHelper + market://details?id=<phone package = com.mettleup.app, the watch's id> on each connected watch
    without the app -> opened / installed / none / failed after 15 s / unknown); pure WearWire.watchAppState / installTargets /
    playStoreUri with JVM tests; ForgeRestModule AsyncFunctions watchAppState, installOnWatch. wear.xml already declared the capability.
  - JS: tracker/services/watchInstall.ts (pure watchCardShows etc., meta `watch_install_card` = 'done' after Not now, the Play
    Store opening, or the app seen); components/WatchInstallCard.tsx in the Workout tab's one notice slot (NOTICE_ORDER: link,
    update, whatsNew, watch, backup); Settings -> Reminders and phone -> "Your watch" (Installed / Install on watch; left out
    with no watch or no answer). Every failure shows "Open Play Store on your watch and search MettleUp." The watch app is
    not on Play yet: the link is right for when it is.
