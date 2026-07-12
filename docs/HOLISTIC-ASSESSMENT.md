# ForgeAI — Holistic Assessment (apps/mobile)

**Date:** 2026-07-12 · **Scope:** the Expo member app at `apps/mobile` (~22.8k LOC), through v0.13.0.
**Type:** audit only — **no product code was changed.** This is findings + a prioritized plan.
**Baseline:** `npm run typecheck` (tsc --noEmit, strict) is **green (exit 0)**.

> **Frozen-file rule respected throughout.** Every recommended fix below lands as a NEW module,
> an additive edit to a non-frozen screen/store, or an additive runtime-schema change. None touch
> `src/engine/*`, `src/components/ui/*`, `src/components/charts/*`, `src/db/schema.ts`, or a frozen
> repo/service signature. Where a fix would need a frozen edit, it is re-routed (noted per row).

---

## 1. Executive summary

ForgeAI is in genuinely good structural health. The engine/repo/service split holds, the additive
migration path (`trackerSchema.ts`, `TRACKER_SCHEMA_VERSION=2`) is kill- and downgrade-safe, the
offline firewall holds end-to-end (the default keyless/no-account build makes **zero** network calls —
verified site-by-site), Supabase RLS is well-built (no self-escalation, tenant-pinned writes), and the
core set-logging loop is genuinely Hevy-class (2-tap sets, PREVIOUS auto-fill, haptic-on-down, swipe+undo).
The adversarial-review-before-tag discipline shows: most of the obvious correctness classes are already
clean (is_warmup authority, seed/import idempotency, PR upsert keying, double-submit guards).

The improvements cluster into four themes:

1. **Two real data-integrity bugs in the commit/backup paths** — `finish()` commits a workout across
   several autocommitted statements with **no wrapping transaction** (kill/error mid-commit → orphan
   session + a surviving draft that duplicates it on retry), and the **Google Drive snapshot silently
   drops every Phase-5b/5c set field** (`rpe`/`set_type`/`note`/`superset_group`) on restore. Both are
   small, frozen-safe fixes.
2. **The app is structurally still a *demo*, not a *product*.** The profile (name/targets/gym) is seeded
   and **uneditable** (`updateProfile` has zero callers), nutrition rings/charts are prominent but
   **write-only-via-chat and can never be viewed/edited/deleted** (`getMealsForDay`/`deleteMeal` are dead
   exports), and logged workouts **can't be edited**. A real member can never make this their app.
3. **The AI layer has surface-area drift.** The flagship offline `localCoach` **logs phantom workouts
   from questions** ("should I bench 80kg for 8?" → creates a junk exercise + fake sets), the system
   prompt promises capabilities (routine CRUD, target edits, meal delete) the tool surface doesn't
   expose, and a mid-loop provider error discards already-committed tool writes.
4. **Robustness/perf/a11y polish that only bites at scale or on assistive tech** — after the owner's
   8.8k-row Hevy import, several hot reads scan full history; the active-workout screen re-renders every
   second; contrast + touch-target + screen-reader gaps sit on the densest logging UI. And there are
   **zero automated tests** over 22.8k lines, with CI not even running `typecheck` before it ships a tag.

Nothing here is a regression or a "you built it wrong." These are the next layer of hardening for an app
that has cleared its feature-complete milestone and now wants to be trusted with real users' data.

---

## 2. Method & confidence

A 10-dimension multi-agent sweep (one reviewer per dimension over the real code → one adversarial skeptic
per finding, prompted to refute). Usage limits interrupted the run, so coverage is uneven and I closed the
gaps by hand:

- **7 dimensions reviewed** (correctness, robustness, AI, UX, design/a11y, offline-firewall, performance) →
  42 raw findings.
- **1 finding got its full adversarial skeptic** (Drive snapshot — CONFIRMED HIGH). The rest lost their
  verifiers to the limit.
- **I independently verified the 8 heaviest against the code myself** this session (marked ✅V below).
- **3 dimensions never ran** (code-quality, security/privacy, testing-CI) → I audited them directly
  (CI YAML, Supabase RLS, provider key handling, dead-export greps, test inventory).

**Verification legend:** ✅C = adversarially confirmed · ✅V = I traced it against the code this session ·
🔎R = reviewer-reported, plausible, code-cited, but not independently re-verified (treat as high-probability,
confirm the exact line before acting). Confidence (0–1) is the reviewer's/my calibrated estimate.

---

## 3. Findings — ranked by (impact × confidence ÷ effort)

Ranked most-actionable first. Severity: **HIGH** = data loss/corruption/crash/security/user-visible
wrongness · **MED** = degraded correctness/UX/robustness in realistic use · **LOW** = polish/debt.
Effort: **S** < 0.5d · **M** = 0.5–2d · **L** > 2d.

| # | Finding · `file:line` | Dim | Sev | Conf | Eff | Vfy | Why it matters | Frozen-safe fix |
|--|--|--|--|--|--|--|--|--|
| 1 | **`finish()` commits non-atomically** — createSession → addSetsWithMeta → clear-draft are separate autocommits with no wrapping tx · `tracker/store/activeWorkoutStore.ts:483` | Correct | HIGH | 0.75 | S | ✅V | Kill/SQL-error mid-commit leaves an orphan/partial session; the draft is **not** cleared, so on relaunch the user finishes again → duplicate session. Reset-demo mid-session hits the same path (orphan empty session + the throw is uncaught in `active.tsx onFinish`). | Wrap createSession+addSetsWithMeta+`setMeta(DRAFT_KEY,'')` in `getDb().withTransactionAsync` (non-exclusive, like `hevyImport.runImport` — frozen repos join the ambient BEGIN/COMMIT). Add try/catch around `await finish()` in `active.tsx`. |
| 2 | **No real-user path — permanent demo identity** — profile seeded & uneditable; `userRepo.updateProfile` has **zero callers** · `db/seed/profile.ts:5` | UX | HIGH | 0.95 | M | ✅V | Home forever greets "Arjun"; calorie/protein/target math runs on fixed seed values; the only "reset" regenerates fake data. The app **structurally cannot become the user's own** — the top blocker to the "real Hevy-class tracker" bar. | New `components/settings/ProfileCard.tsx` (editable name/goal/targets → existing `updateProfile`) + a "Start fresh" danger-zone action (new tracker module clearing domain tables, keeping `meta`). No frozen edit. |
| 3 | **`localCoach` logs phantom workouts from questions** — "should I bench 80kg for 8?" → junk "should bench" exercise + real sets · `ai/localCoach.ts:640` | AI | HIGH | 0.8 | S | ✅V | `parseWorkout` runs (line 640) **before** the `?`/"should" question guard (line 649, which only protects the food path). `cleanExerciseName` doesn't strip "should" (`NAME_FILLERS`, :72). Junk exercises pollute the library/PRs **forever**, fake sets inflate volume/streak — on the **default offline build**, the source of truth. | In `localCoach.ts` (signature unchanged): before `parseWorkout`, if the message is interrogative (`/\b(should|shall|can i|could|kya main)\b/` or ends `?`) route to guidance, not logging — mirroring the food path's existing `question` guard. |
| 4 | **Drive backup drops all 5b/5c set data** — snapshot `set_entries` cols omit `rpe`/`set_type`/`note`/`superset_group` · `cloud/snapshot.ts:48` | Correct | HIGH | 0.9 | S | ✅C ✅V | Restore-on-new-phone returns those four columns as NULL: notes gone, supersets ungrouped, drop/failure indistinguishable, all RPE lost. It's the **only** cross-device recovery path (the .xlsx export omits them too). *Latent* — Drive is gated off today (placeholder client ID), so fix it **before** wiring the real client ID (owner-TODO). | Add the 4 names to the `set_entries` cols array in `snapshot.ts` (cloud, not frozen). `batchInsert`'s `row[c] ?? null` makes old backups restore as NULL — fully backward/forward compatible. Add the same columns to `dataExport.ts`. |
| 5 | **Nutrition is prominent but unmanageable** — rings/charts driven by meals that can only be created via chat; `getMealsForDay`/`deleteMeal` are **dead exports** · `components/dashboard/StatGrid.tsx:76` | UX | HIGH | 0.9 | M | ✅V | With Coach demoted off the tab bar, Home leads with two large nutrition rings + two analytics sections the user can't operate — data that *looks* trackable with no view/edit/delete surface. Reads as broken. | New `app/nutrition.tsx` + `tracker/components/MealList.tsx`: list today's meals (existing reads), swipe-delete (existing `deleteMeal`), 4-field quick-add (existing `logMeal`, `source:'manual'`). Make the Home rings tappable → this route. |
| 6 | **Mid-loop provider error discards already-committed tool writes** · `ai/orchestrator.ts:246` | AI | HIGH | 0.85 | S | 🔎R | Round-1 `log_workout` writes to SQLite + pushes a card; round-2 fetch throws (429/blip); the catch persists only an error msg — the success card vanishes, user is told it failed and **retries into a duplicate**. | Hoist `cards` above the cloud `try`; in the catch, if `cards.length`, persist "connection dropped, but these were saved:" + the cards before the error line. `orchestrator.ts` not frozen; `sendToCoach` signature unchanged. |
| 7 | **System prompt promises writes the tools can't do** — no tool for routine CRUD, target/profile edits, or meal/session delete · `ai/system.ts:29` | AI | MED | 0.9 | M | 🔎R | "add face pulls to my Pull day" / "set protein to 180g" / "delete that meal" → model claims success with no DB write, or refuses. The UI *has* all these functions (`routineRepo.*`, `updateProfile`, `deleteMeal`) — the tool surface just doesn't wrap them. | Additive: append `CoachTool` entries wrapping the **existing** functions. Purely `src/ai/*` (ai owns it). Pairs with #2/#5 (which add the UI for the same ops). |
| 8 | **After the 8.8k-row import, hot reads scan full history** — `getExerciseHistory` applies `limit` in JS, not SQL · `db/repos/workoutRepo.ts:266` | Perf | MED | 0.8 | M | 🔎R | Start-from-plan calls `getExerciseHistory(id,1)`×6 + coachTargets `(id,5)`×6; each materializes the lift's *entire* working-set history (Bench ≈ hundreds of rows) before JS trims. Perceptible lag on the workout-start tap. | New bounded read module (e.g. `tracker/db/exerciseHistory.ts`) pushing `session_id IN (SELECT … ORDER BY started_at DESC LIMIT ?)` into SQL; point `coachTargets` + `buildDraftExercise` at it. Frozen `workoutRepo` untouched. |
| 9 | **Active-workout screen re-renders the whole tree every second** — unmemoized `ExerciseLogCard`/`SetRow`/`Swipeable`, driven by the elapsed clock · `app/session/active.tsx:23` | Perf | MED | 0.85 | S | 🔎R | 6 exercises × ~4 sets = ~24 SetRows + gesture components + focused TextInputs reconcile every 1000ms while the user types weights — the most-used flow's biggest perf cost. | Isolate the tick into a tiny `<ElapsedClock/>` that owns the interval + the ELAPSED Text; wrap `ExerciseLogCard`/`SetRow` in `React.memo`. Non-frozen tracker files. |
| 10 | **No automated tests over 22.8k LOC; CI doesn't run `typecheck` before shipping a tag** · `.github/workflows/release-apk.yml:38` | Test | MED | 0.9 | M | ✅V | Zero `*.test.*`/jest/vitest; the tag build goes `npm ci` → `gradlew` with no tsc/lint gate — the human ship-gate is the *only* guard against a type/logic regression reaching an APK. The pure, high-blast-radius, historically-buggy logic is untested. | Add a vitest lane (pure TS, mock/extract-pure — no native) over `hevyImport` classifiers, `plateMath`, `warmupMath`, `history.getWeekStreak`, `exerciseAnalytics`, `coachNote.buildSessionNote`, `grounding`, `engine/*`; add a `typecheck` job to CI gated before release. |
| 11 | **Midnight rollover: `finish()` stamps `dateISO = todayISO()` (commit day), not the start day** · `activeWorkoutStore.ts:485` | Correct | MED | 0.75 | S | ✅V | Start 23:30, finish 00:20 → `date_iso` = next day while `started_at` = prev day. Streak/consistency/weekly-volume buckets and "trained today" all credit the wrong day; exports show mismatched Date vs Start. | One-liner: `dateISO: toISO(new Date(s.startedAt))` (existing `lib/date.ts`). `createSession` already accepts any `dateISO`. Fold into the #1 edit. |
| 12 | **Logged workouts can't be edited** — session detail is read-only · `app/session/[id].tsx:99` | UX | MED | 0.9 | L | ✅V | A fat-fingered 210 vs 110 kg bakes a wrong e1RM PR + volume + strength score + future coach targets; the only recourse is delete-the-whole-session-and-re-log. Post-hoc edit is Hevy table-stakes. | New edit flow: "Edit workout" on `session/[id]` → load `SessionDetail` into a new `editSessionStore` (mirrors the draft) → save = `deleteSession(id)` then `createSession`+`addSetsWithMeta` with the original timestamps. No frozen edit. |
| 13 | **Deleting a PR-holding session understates the PR list** · `db/repos/workoutRepo.ts:294` | Correct | MED | 0.7 | M | 🔎R | PRs are an event log (row only when a lift beats the prior best). Delete the session that set the 105 kg PR → `getAllPrs` shows 100 kg even though 103 kg sets remain in history; a later 104 kg is falsely announced as a PR. | New `tracker/services/prRebuild.ts` run after the frozen `deleteSession`: recompute best remaining working weight/e1rm from `set_entries`, backfill a `personal_records` row when the survivors understate it. Frozen `deleteSession` untouched. |
| 14 | **Rest-timer default is not configurable (dead `setDefaultSec`) and the timer is foreground-only** · `tracker/store/restTimerStore.ts:43` | UX | MED | 0.85 | M | 🔎R | Fixed 90s (`FALLBACK_SEC`); `setDefaultSec` is exported+persisted with **zero UI callers**. A 3-min-rest lifter taps +15 six times per set; expiry off-screen is silent. Rest is a core per-set loop in a Hevy-class app. | S: a "Rest timer" seconds stepper in Settings→Workout (`settings.tsx` unfrozen) wired to `setDefaultSec`. M: schedule a local `expo-notifications` alert in `start()`, cancel in `skip()`/`addSec` (local-only, offline-safe). |
| 15 | **Home hero CTA says "Open your coach" but opens the Workout tab** · `components/dashboard/HeroWorkoutCard.tsx:175` | UX | MED | 0.95 | S | ✅V | The most prominent tap target on the default screen mislabels its destination (`onPress=goWorkout` → `/workout`). Leftover pre-pivot copy that mis-trains users on day one. | Change the footer label to "Start workout" (and the stale JSDoc), or accept a `cta` prop from `index.tsx`. `dashboard/*` not frozen. |
| 16 | **`getRecentSessionDetails` is an N+1** — 2 sequential queries/session, on every History/Home/Library focus · `db/repos/workoutRepo.ts:238` | Perf | MED | 0.85 | M | 🔎R | `getRecentSessionDetails(50)` on History focus = 1 + 2×50 = 101 awaited SQLite round-trips over the JS↔native bridge, recurring on every tab switch. | New batched read: all sets for the N session ids in one `WHERE session_id IN (…)`, all exercises in one query, group in JS (~3 queries). Consumed by History/Home/Library; frozen fn stays. |
| 17 | **Coach `unitSystem` comes from the dead seeded profile, not the live settings toggle** · `ai/system.ts:15` | AI | MED | 0.7 | S | 🔎R | Switch Settings→lb (every dashboard card follows) but the prompt still says "metric (kg)" because `profile.unit_system` is the seed value and `updateProfile` is never called — lb users get kg coaching / lb numbers logged as kg. | Build the prompt with the live setting: `buildSystemPrompt({...profile, unitSystem: useSettings.getState().unitSystem}, …)` in `orchestrator.ts` (frozen `buildSystemPrompt` signature kept). |
| 18 | **`inkMuted` (#6C7383) fails WCAG AA (~3.9:1) for the 11px caption text it drives** · `packages/theme/src/index.ts:22` | Design | MED | 0.8 | S | 🔎R | It's the PREVIOUS column + SET/PREV/KG headers + settings captions — the anchor numbers you read to decide what to lift, at the hardest-to-read contrast in the most-used flow. | Bump `inkMuted` → ~#7E8597 (~5.0:1 on surface); in `SetRow` use `inkMuted` (not `inkFaint`) for the placeholder since it carries real info. `packages/theme` is **not** frozen. |
| 19 | **Tool-round budget exhaustion runs the final round's tools but never shows the model the results** · `ai/orchestrator.ts:231` | AI | MED | 0.75 | S | 🔎R | Round-6 tool calls execute (incl. writes) then the loop ends with no final `chat()` — the reply is stale interim text or a bare "Done!", precisely on the complex questions that needed the most steps. | On the last round with tool calls, make one extra `chat()` with an empty tools array (both providers accept `tools.length===0`) to force a plain-text summary. |
| 20 | **Local (no-key) mode silently ignores meal photos** · `ai/orchestrator.ts:148` | AI | MED | 0.9 | S | 🔎R | Default build: snap lunch, no caption → `localCoachReply('')` → generic help blurb; the photo is never acknowledged. The flagship offline demo looks broken (the Groq path already handles this). | In the local branch: if `imageUri` is set, reply with the existing meal-guidance copy ("photo estimation needs a cloud key — describe it and I'll log it"), localized. |
| 21 | **OpenAI 1024-token completion cap + no `finish_reason` handling** — GPT-5 (the default) can spend it all on reasoning → empty reply · `ai/providers/openai.ts:112` | AI | MED | 0.6 | S | 🔎R | `max_completion_tokens` includes reasoning tokens; >1024 → `finish_reason:'length'`, empty content, no diagnostics; a truncated `tool_calls` args string also parses to `{}` and fires the tool empty. | Raise cap to ~4096, pass `reasoning_effort:'low'` for gpt-5*, read `finish_reason`/`stop_reason` and surface "answer was cut off" / retry once. All in the non-frozen `chatOpenAiCompatible`. |
| 22 | **Chat logging appends sets into any existing session of the day — including a finished manual session** · `ai/tools.ts:147` | Correct | MED | 0.5 | S | 🔎R | Finish a manual Push at 08:00, then "log 3×10 squats" at 20:00 → squats appended to the morning session; its finish-summary volume/day-type/duration are now wrong. The reuse-today heuristic predates first-class tracker sessions. | In `logWorkoutCore` (body only, signature unchanged): only reuse a session when `source==='chat'` (and/or `endedAt` is null); else create a new session. `ai/tools.ts` not frozen. |
| 23 | **Hevy import stores UTC-basis `started_at` epochs, mis-ordering imports vs live sessions** · `tracker/services/hevyImport.ts:126` | Correct | MED | 0.55 | M | 🔎R | Live logging uses true local epochs; import parses wall-clock-as-UTC (a v0.6.1 idempotency fix). In IST a 09:00 Hevy workout sorts *after* a 13:00 live one in `ORDER BY started_at` — wrong PREVIOUS/PR ordering across the seam. | Parse to a local-basis epoch and preserve tz-independent idempotency by deduping on the raw `start_time` string (or `date_iso`+title) rather than the epoch. `hevyImport.ts` not frozen. |
| 24 | **Screen-reader gaps on the mid-workout + destructive flows** — unlabeled sheet-close buttons & Settings Switches; Replace/Merge import choice announces no selection state · `PlateCalcSheet.tsx:58`, `import/index.tsx:70`, `settings/SettingRow.tsx:89` | Design | MED | 0.85 | S | 🔎R | TalkBack users hit "unlabeled" close buttons (trapped in sheets), bare "switch" rows in Settings, and a **data-wiping** Replace/Merge choice conveyed by color only. | Add `accessibilityRole`/`accessibilityLabel`/`accessibilityState={{checked/disabled}}` on the non-frozen call sites (frozen `Chip`/`IconButton` stay; wrap them). |
| 25 | **Sub-44dp touch targets in the logging loop** — rest-timer ±15/Skip (~38dp), sheet close (~38dp), SetRow warm-up SET cell (~30dp) · `RestTimerBar.tsx:24` | Design | MED | 0.7 | S | 🔎R | Sweaty-finger mid-set taps miss; the frozen kit's own `IconButton` (~54dp effective) sets a higher bar these copies undercut. `hitSlop` doesn't extend past the parent. | Give `TimerBtn` `minHeight:44`, box the sheet-close icons to 44dp, add vertical padding/`hitSlop` to the SET cell. Non-frozen components. |
| 26 | **No font-scaling policy — fixed-height inputs/rows clip at large OS font sizes** · `tracker/components/SetRow.tsx:278` | Design | MED | 0.8 | M | 🔎R | RN text scales but the 38dp SetRow inputs / 32dp RPE field don't; at 1.5–2.0× the money screen clips. `grep allowFontScaling|maxFontSizeMultiplier` = **zero** matches app-wide. | New `theme/fontScalePolicy.ts` imported once in `_layout.tsx`: cap `Text`/`TextInput` `defaultProps.maxFontSizeMultiplier = 1.3` (covers frozen kit without editing it); switch key fixed heights to `minHeight`. |
| 27 | **Voice input streams mic audio to Google's cloud recognizer in the default build** (no offline-preference flag) · `lib/voice.ts:56` | Sec/Off | MED | 0.6 | S | 🔎R | The one default-prefs path where user data leaves the device without a key — hold-to-talk to the *offline* coach still hands audio to Google's recognizer. Technically Google's service, not the app, but it dents the "zero network" story. | Pass `androidIntentOptions:{EXTRA_PREFER_OFFLINE:true}` (and/or `requiresOnDeviceRecognition` where available) to `ExpoSpeechRecognitionModule.start`, keeping graceful `available=false`. `voice.ts` not frozen. |
| 28 | **Root layout swallows DB init/migration failures** → Home shows an infinite skeleton · `app/_layout.tsx:23` + `store/dashboardStore.ts:26` | Robust | MED | 0.55 | S | 🔎R | `initDb`/`initTrackerSchema` reject but the `finally` still sets `dbReady=true` and the IIFE has no catch → app renders against a missing schema; `getDashboardData` rejects → `data=null` → perpetual `<DashboardSkeleton/>` with no message/retry. | Catch the init chain, keep `dbReady=false`, render a minimal "storage failed — retry" screen; add an `error` flag to `dashboardStore` and an inline Retry card in `index.tsx`. |
| 29 | **Hevy import: ~34k sequential ops incl. O(N²) PR MAX-scan + 8.8k redundant meta UPDATEs on the JS thread** · `db/repos/prRepo.ts:115` | Perf | MED | 0.72 | M | 🔎R | 487 workouts → `checkAndRecordPrs` MAX-scans ~2,900×, each scanning all PR rows; every set gets a metadata UPDATE even when it has none. One-time, but tens of seconds with a stalling bar on a mid device. | In non-frozen `addSetsWithMeta`, skip the UPDATE for rows with no metadata (`rpe==null && note==null && supersetGroup==null && setType==='normal' && !isWarmup`) — readers already default null→'normal'. |
| 30 | **Mid-workout picker has no "create custom exercise" path** · `tracker/components/ExercisePickerList.tsx:16` | UX | MED | 0.85 | M | 🔎R | Search "landmine press" mid-session → dead-end empty state; the only way to add a missing movement is to abandon the flow through 3 screens. A signature Hevy strength (create-from-picker). | Add an optional `onCreateNew` prop rendering a `Create "{query}"` row in the empty state + a persistent footer → `library/new` with a `returnTo` param. Non-frozen. |
| 31 | **Coach has no plain entry point; its only header action destroys history** · `app/(tabs)/index.tsx:80` | UX | MED | 0.85 | S | 🔎R | Both routes into chat (NextUpRow, InsightCard) auto-fire a canned prompt on arrival (wastes tokens/money, pollutes the thread); the coach header "X" clears the whole conversation with no undo. | Add a prompt-less coach entry (sparkle button / "Chat with coach" row) pushing `/coach` with no params; replace the header X with an explicit "Clear conversation" in a menu. Both files unfrozen. |
| 32 | **Checking a blank set on a first-time exercise → done as 0×0, then silently dropped at finish** · `tracker/store/activeWorkoutStore.ts:444` | UX | LOW | 0.8 | S | ✅V | New exercise (no PREVIOUS): tap ✓ → row greens as `0 ?? 0`, but `isCommittable` needs `reps>0` (:112) → the "done" set vanishes at save. The done-state is the app's strongest "saved" signal; disagreeing with what commits erodes trust. | In `toggleDone`, make a no-value/no-previous tap a no-op (warn haptic) or leave `done=false`; and/or Alert at finish when done-count > committable-count. Non-frozen store/SetRow. |
| 33 | **Local-coach parity gaps** — routines, streak, last-workout, per-exercise progress, "calories in X" all degrade to generic/wrong · `ai/localCoach.ts:625` | AI | LOW | 0.85 | M | 🔎R | The cloud coach answers these via tools; the default build's abilities are a strict, undocumented subset — and "am I progressing on bench?" answers with *global* trends, not bench. | Additive local intents reusing existing services (`routineRepo.listRoutines`, `getStreakDays`, `getRecentSessionDetails(1)`, per-exercise `getExerciseStats`). `localCoach.ts` signature unchanged. |
| 34 | **Dashboard/History refetch heavy assemblies on every tab focus (uncached)** · `app/(tabs)/index.tsx:58` | Perf | LOW | 0.7 | S | 🔎R | Home↔tab re-runs `getDashboardData` (25+ queries incl. 3 unbounded plateau scans) even when nothing changed — compounds #8/#16. | A `dirty` flag in `dashboardStore` set by logging mutations; skip focus-refresh when clean. Additive. |
| 35 | **History feed: up to 50 `WorkoutCard`s via `.map` in a ScrollView (not virtualized)** · `app/(tabs)/history.tsx:87` | Perf | LOW | 0.6 | M | 🔎R | Fine at 50 today, but the one large list that isn't a FlatList — a latent scaling cliff if the cap ever rises. | `FlatList`/`FlashList` with the streak/heatmap as `ListHeaderComponent` (the pattern chat + LibraryList already use). |
| 36 | **`hydrate()` validates only the top-level draft shape** · `tracker/store/activeWorkoutStore.ts:204` | Robust | LOW | 0.4 | S | 🔎R | A draft whose `exercises[]` holds a malformed element (field rename / tamper) passes the guard, then crashes later in render outside the try/catch — unrecoverable without clearing app data. | Validate each element (`key`/`exerciseId` strings, `Array.isArray(sets)`) in `hydrate`; drop bad ones or start clean. Keeps the crash inside the existing try. |
| 37 | **Dead exports + non-frozen theme-literal duplication** — `updateProfile`/`getMealsForDay`/`deleteMeal` unreferenced (until #2/#5/#7); `components/exercise/ExerciseCharts.tsx` dead; ink-on-ember `#1F0D05` hand-copied in 7 places · `app/(tabs)/workout.tsx:82` | Code | LOW | 0.8 | S | ✅V | Debt: dead exports read as "unused" and rot; the hand-duplicated accent-ink literals drift on any theme retune (the dark-only ember theme's exact rot vector). | Wiring #2/#5/#7 revives the repo exports; delete `ExerciseCharts.tsx`; add `inkOnAccent`/`accentBorder`/etc. tokens to `packages/theme` and replace the literals. All non-frozen. |
| 38 | **`cloudStore.init()` runs on a failed DB init; its rejection is unhandled** · `app/_layout.tsx:32` | Off | LOW | 0.65 | S | 🔎R | If `initDb` rejects, `init()` still runs → `getMeta` throws → the void'd promise's `set({ready:true})` never runs → a linked member silently stops pushing all session (offline default build unaffected — fails safe). | `try/catch` in `init()` with `set({ready:true})` in `finally`, or `.catch(()=>{})` on line 32. Store internals, not a contract. |

---

## 4. Top-5 "do next" shortlist

Chosen for the best ratio of (data-integrity/product-impact) to effort, and because each is a clean,
frozen-safe, independently shippable change.

1. **Make `finish()` atomic + fix the midnight `dateISO`** (#1 + #11, effort **S**). One
   `withTransactionAsync` wrap plus a one-line date fix closes the only two real *data-integrity* bugs in
   the everyday commit path. Highest value-per-hour in the whole list. Ship first.
2. **Give the app a real user: editable profile + operable nutrition** (#2 + #5, effort **M**). This is the
   single biggest gap between "impressive demo" and "app a member keeps." Both reuse existing repo
   functions that are currently dead — mostly UI work, no new data layer.
3. **Stop the offline coach from writing junk** (#3, effort **S**). A HIGH data-corruption bug on the
   *flagship default build*, fixed by one interrogative guard. Cheap, embarrassing if left.
4. **Fix the Drive snapshot columns before Drive is enabled** (#4, effort **S**). Four strings in
   `snapshot.ts`. Do it now so the latent data-loss landmine is defused before the owner wires the real
   Google client ID (already on `OWNER-TODO`).
5. **Stand up a pure-TS test seam + a CI typecheck gate** (#10, effort **M**). 22.8k lines, zero tests, and
   CI ships tags without running `tsc`. A vitest lane over the pure functions (import classifiers, plate/
   warm-up math, streak, coach note, grounding, engine) + a pre-release typecheck job is the highest-leverage
   *durable* safety investment — and it makes every future phase's "adversarial review before tag" cheaper.

A natural sequencing: **#1+#11 and #3 and #4** are all small and land in one focused session (data
integrity). **#2+#5** is the next phase (product-fit). **#10** runs in parallel as infrastructure. The AI
tool-surface + prompt cluster (#6, #7, #17, #19, #20, #21) is a good "AI Coach C5" batch once the tracker
data-integrity items are in.

---

## 5. Verified solid — do **not** invent work here

The sweep specifically checked these and found them genuinely correct (don't "fix" them):

- **Offline firewall holds end-to-end.** The default keyless/no-account/no-Drive build makes **zero**
  network calls — verified site-by-site: AI providers are hard key-gated (default provider `local`,
  keyless selection downgrades to `localCoach` before any fetch); Supabase client is lazily built and
  unreachable unless `isCloudActive()`; the NetInfo listener isn't even installed unless linked; the
  `dashboardStore.refresh → maybeSync` piggyback re-gates on `isCloudActive()`; Drive is double-gated
  (`isDriveConfigured()` placeholder + `drive_linked` marker); no telemetry/OTA/remote assets; fonts are
  bundled. (The only caveat is voice, #27.)
- **The additive migration is kill- and downgrade-safe.** `initTrackerSchema` fast-paths on
  `stored ≥ VERSION`, `ensureColumn` introspects `PRAGMA table_info` (idempotent), the version flag is
  stamped only after all columns exist, and `_layout.tsx` orders it `initDb → initTrackerSchema →
  ensureSeeded`. `is_warmup` stays authoritative so drop/failure correctly remain working sets.
- **Coach-target math parity is real**, not just claimed — `coachTargets.ts` feeds `computeOverloadTarget`
  byte-identical inputs to the Coach tab; the engine handles empty history, 0-kg bodyweight, and
  `incrementKg ≤ 0` cleanly.
- **Seed + Hevy import idempotency/atomicity** — DELETE-first in one exclusive tx with the `seeded` flag
  written last; import is one `withTransactionAsync`, keyed on `startedAt` with an in-file dup guard,
  exercise-create deduped by normalized name (matching the preview count). Re-runs are safe.
- **PR upsert + delete cleanup** — `upsertSessionPr` is keyed per (session, exercise, kind) and only
  upgrades (no dup PR rows on `addSets` re-run); `deleteSession` manually removes PR rows first (no FK).
  *(The one gap is the historical-understate case, #13.)*
- **Double-submit / draft-race guards** — `committing` is set synchronously before the first await;
  `hydrate` re-checks `active` after its await; `routineRepo` serializes reorder transactions via an
  op-chain. Route screens resolve deleted/unknown ids to EmptyStates, not crashes.
- **Supabase RLS is well-built** — `profiles` writes revoked (no self-escalation to owner);
  `member_summary` pinned to `auth_gym_id()` via `WITH CHECK`; SECURITY DEFINER helpers with pinned
  `search_path`; a monotonic `client_version` guard; `join_gym_by_code` never demotes staff; a DPDP
  `delete_my_cloud_data` RPC. No keystore committed to the repo; providers cap error bodies and never
  echo the API key.
- **CI mechanics are sound** — tag-driven (`v*`), correct monorepo paths (`apps/mobile/android`), optional
  keystore with a debug-sign fallback, and the `secrets`-context-in-`if:` trap correctly routed via a
  job-level `env`. *(The gaps are the missing typecheck gate + no tests, #10.)*

---

## 6. Coverage caveats (be honest about the audit itself)

- **Adversarial verification is incomplete.** Usage limits killed all but one skeptic. I re-verified the 8
  highest-impact findings by hand (✅V/✅C); the 🔎R rows are reviewer-reported with a code citation but not
  independently re-run — high-probability, but confirm the exact line/branch before you code the fix. A
  fresh session can finish the verification pass cheaply (the workflow resumes from cache:
  `resumeFromRunId: wf_6d6e0f24-cb4`).
- **Three dimensions (code-quality, security/privacy, testing-CI) were audited by me directly** rather than
  by a dedicated agent, so their finding count is lighter than the others — not because they're cleaner,
  but because I prioritized the RLS/CI/keys/dead-export essentials over an exhaustive sweep.
- **Device-only behavior is out of scope** (this is a static read): actual haptic feel, real font-scaling
  clipping, TalkBack focus order, and on-device import timing should still be validated against
  `docs/TEST-CHECKLIST.md`.
- No product code was modified and no release was tagged, per the request.
