# ForgeAI Manual Workout Tracker — PRD & Phased Build Plan

**Status:** DRAFT for approval (2026-07-08). No feature code until the owner approves.
**Companion docs:** research → `docs/HEVY-RESEARCH.md`; frozen APIs → `docs/CONTRACTS.md`;
pivot record → `docs/PLAN.md → PRODUCT PIVOT`; live status → `PROGRESS.md`.

---

## 1. Goal & non-goals

**Goal.** Make ForgeAI's **manual workout logging + its analytics** best-in-class — *simple, clean,
fast, one-handed, robust, offline* — with the **Hevy** feel: log a set in ~2 taps, see last time
inline, auto rest timer, celebratory finish, browsable history/PRs/charts. Build it as **new UI +
services on top of the existing, frozen SQLite tables + `src/engine`** — reuse the engine/repos via
services; never rewrite them.

**Non-goals (this track).** AI coaching (chat/`localCoach` stays but is not the focus), nutrition/
calorie tracking, and the B2B2C cloud work (done, valid, untouched). Social features, cardio/duration
exercise types, imperial units, and paywalls are **out of scope by constraint** (see §6).

**Hard rules (non-negotiable, every phase).**
- **Offline-first:** the app fully works with **no network/account** after every phase (trivially
  satisfied — the tracker writes only to local SQLite; there is no network path in it).
- **Frozen files — add NEW modules only, never edit:** `src/engine/*`, `src/components/ui/*`,
  `src/components/charts/*`, or any existing repo/service **signature** in `docs/CONTRACTS.md`.
- TypeScript strict; **kg** weights; `dateISO='YYYY-MM-DD'`; `@/* → apps/mobile/src/*`.
- **Cloud builds only** (GitHub Actions on tag `v*`); verify locally via `npm run typecheck` (in
  `apps/mobile`) + an offline check + adversarial logic/compile review **before any tag**. Owner tags.

---

## 2. Current-state assessment (what exists vs the gap)

### 2.1 What exists today
- **5 route files, 4 tabs.** `app/(tabs)/_layout.tsx` registers **Home** (`index.tsx`), **Coach**
  (`coach.tsx`), **Progress** (`analytics.tsx`), **Settings** (`settings.tsx`); plus one stack route
  `app/exercise/[id].tsx`. **Workouts are logged ONLY through the AI chat** (`coach.tsx` →
  `orchestrator.sendToCoach` → `COACH_TOOLS.log_workout`). There is **no** manual active-workout
  screen, routine editor, history list, exercise-library list, rest timer, or plate calculator.
- **The data layer is complete and frozen.** SQLite (`src/db/schema.ts`) already has every table the
  tracker needs: `workout_sessions` (with `source` supporting `'manual'`), `set_entries`
  (`isWarmup`), `exercises`, `personal_records`, `workout_plans`/`plan_days`/`plan_exercises`,
  `body_weight`, `meta(key,value)`. Repos (`src/db/repos/*`) and services (`src/services/*`) are
  CONTRACTS-frozen.
- **The engine already does progressive overload** — `engine/computeOverloadTarget`, `epleyE1rm`,
  `computeRecovery`, `computeStrengthScore`, and `services/coach.getTodaysWorkout` (plan rotation +
  targets). This is ForgeAI's edge over pure loggers.
- **The premium UI kit + SVG charts are built and frozen** (`Screen`, `Card`, `GlassCard`, `HeroCard`,
  `StatTile`, `RingGauge`, `Chip`, `PrimaryButton`, `GhostButton`, `IconButton`, `Icon`,
  `AnimatedNumber`, `Skeleton`, `EmptyState`, `Badge`, `TabBar`; charts `LineChart`, `BarChart`,
  `Sparkline`, `MiniBars`, `HBarList`, `Heatmap`, `DeltaPill`). Dark, ember-accent, CVD-safe chart
  palette. `Icon` already includes `dumbbell`, `plus`, `check`, `close`, `clock`, `calendar`,
  `trophy`, `target`, `trend`, `scale`, `chevron-*`.
- **Exercise detail is ~free.** `app/exercise/[id].tsx` already renders hero stats + progress/e1RM/
  volume charts + session history via `services/analytics.getExerciseStats`. The library just needs a
  list screen that navigates to `/exercise/[id]`.
- **PR detection is already wired.** `workoutRepo.addSets` **auto-numbers sets AND calls
  `prRepo.checkAndRecordPrs`** (idempotent per session; records `weight` + `e1rm` PRs). So the
  logging path gets PRs for free.
- **Available deps** (no new install for the core): `react-native-gesture-handler` (swipe-to-delete),
  `react-native-reanimated`, `expo-haptics` (`tap`/`thud`/`success` in `src/lib/haptics.ts`),
  `@react-native-async-storage/async-storage`, `zustand`, `react-native-svg`. **Store pattern**:
  zustand `create` + a `refresh()` that reads a service (see `store/dashboardStore.ts`).

### 2.2 The gap (what the tracker must add)
| Missing surface | Why it's missing | How it's built |
|---|---|---|
| **Active-workout screen** (set grid, ✓, PREVIOUS, rest timer) | logging is chat-only | NEW module; in-memory draft → `createSession`+`addSets` on Finish |
| **Routine authoring** (create/edit/reorder routines) | `planRepo` is **read-only** (`getActivePlan` only) | NEW `routineRepo` writing existing plan tables (no schema change for core) |
| **History list + calendar** | no history screen | NEW screens over `getRecentSessionDetails`/`getSessionsBetween` + `Heatmap` |
| **Exercise library list + custom-exercise form** | only `exercise/[id]` detail exists | NEW screens over `getAllExercises`/`createExercise` |
| **Rest timer, plate calc, warm-up calc** | none exist | NEW pure/ephemeral modules; defaults in `meta` |
| **Weekly streak** | `getStreakDays` is **day-based** | NEW service (don't edit the frozen one) |
| RPE, supersets, drop/failure types, folders, edit-saved-workout, body measurements | no schema columns / repo API | **DEFERRED** — additive schema + new write path (Phase 5) |

---

## 3. Architecture & conventions for the new code

**New-module namespace.** All tracker code lives in **new files the tracker owns**, so no frozen file
is touched:
- `src/tracker/` — the tracker's own namespace: `tracker/db/` (writable `routineRepo`, and later an
  additive `trackerSchema` for Phase-5 tables), `tracker/services/` (finish summary, history, weekly
  streak, exercise analytics, plate/warm-up utils), `tracker/store/` (active-workout draft, rest
  timer, routine store), `tracker/components/` (set row, exercise card, timer bar, muscle-map SVG,
  pickers).
- `src/app/workout/…`, `src/app/routines/…`, `src/app/history/…`, `src/app/library/…` — new
  **route** files (expo-router; `typedRoutes: true` regenerates types on add).

**Reuse, never rewrite.** Consume the frozen repos/services/engine/UI-kit exactly as `docs/CONTRACTS.md`
declares. The only frozen thing the tracker calls to *write* is `workoutRepo.createSession` + `addSets`
+ `deleteSession` (all existing, `source:'manual'` supported).

**Preferences without schema churn.** Rest-timer defaults, warm-up formula, weekly goal, exercise
favorites, and the crash-recovery **active-workout draft** all serialize into the existing frozen
`meta(key,value)` table via `getMeta`/`setMeta` — **no schema change**.

**Additive-schema pattern (Phase 5 only).** Any new column/table is **purely additive** (new nullable
column or new table) and executed by a NEW `src/tracker/db/trackerSchema.ts → initTrackerSchema()`
(idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN`) called once from
`app/_layout.tsx` **after `initDb()`** — mirroring how the B2B2C phase added a gated cloud-init call
there. **`schema.ts` and frozen repo signatures are never edited**; every additive column always ships
with a **new write path** (a new repo/service fn), because `createSession`/`addSets` signatures can't
change.

**Allowed minimal screen edits (not frozen — screen files, not CONTRACTS signatures).** To wire the
tracker in we will make small additive edits to:
- `app/(tabs)/_layout.tsx` — register the new tab(s) (see §4).
- `app/(tabs)/index.tsx` (Home) — repoint the "Today: <day>" hero CTA to **Start Workout** (keep a
  secondary "Ask coach" affordance). Additive prop, no dashboard-store change.
- `app/(tabs)/settings.tsx` — add a "Workout" settings group (default rest, keep-awake, warm-up
  formula) mounting a new tracker settings card.
- `app/_layout.tsx` — (Phase 5 only) one `initTrackerSchema()` call + (Phase 1) rehydrate the
  active-workout draft.
These files are owned by their modules in CONTRACTS but are **screens, not frozen APIs**; edits stay
minimal and additive. If the owner prefers zero edits to `index.tsx`, the Start-Workout entry can live
entirely on the new Workout tab instead.

**Offline firewall.** The tracker has **no network code**. Every feature reads/writes local SQLite or
`meta`. The `expo-notifications` rest-timer alert (Phase 2) is a local notification (no server). This
preserves the "zero network with no account" guarantee automatically.

---

## 4. Navigation decision — ✅ CONFIRMED (Option A)

Hevy's bottom nav centers a prominent **Start Workout** and a **History** view. ForgeAI's frozen
`components/ui/TabBar.tsx` renders whatever routes are registered, **but its `ROUTE_ICON` map is
hardcoded** to `index/coach/analytics/settings` and falls back to a generic `sparkle` icon for unknown
routes — and `TabBar.tsx` is a **frozen** file we cannot edit to add a `dumbbell`/`calendar` icon.

**Recommended (Option A):** add a thin **NEW** tracker tab bar (`src/tracker/components/TrackerTabBar.tsx`)
that reuses the exact same tokens/animation/visuals as the frozen `TabBar` but with an extended icon
map, and swap it into `app/(tabs)/_layout.tsx` (editable). This is **additive** (new file; the frozen
`TabBar` is untouched), stays visually identical, and gives proper icons. Proposed tabs:

> **Home · Workout · History · Progress · Profile**  — with **Coach demoted** to a button on Home
> (its `coach.tsx` route is kept and still reachable). This matches the pivot ("chat stays but isn't
> the focus") and the Hevy shape.

**Alternatives:** (B) keep the 4 frozen tabs and launch tracker screens as **stack routes** from a
prominent Home "Start Workout" CTA (zero tab-bar change, but no dedicated Workout/History tab); (C)
add new tabs and accept the generic `sparkle` icon (ugly — not recommended).

---

## 5. v1 essential feature set (ranked, all buildable with no schema change)

Ranked by leverage (retention × "Hevy feel" × buildability on frozen repos). Items **1–7 are the
core**; 8–15 are the polish that makes it credible.

1. **Active-workout screen** — vertical exercise cards, each a set table `SET# | PREVIOUS | KG | REPS | ✓`.
2. **One-tap set completion** — type kg/reps → ✓ → row greens, haptic (finger-down), rest timer starts.
3. **PREVIOUS column + auto-fill** — ghost placeholder from last session; bare ✓ logs last time.
4. **Rest timer** — auto-start on ✓, ±15s / skip, per-exercise default, local notification at zero.
5. **Two entry paths** — **Start Empty Workout** + **Start From Plan** (`getActivePlan`, read-only).
6. **Exercise library list + picker** — search + 2-axis filter + Recent; entered from tab & mid-workout.
7. **Finish → two-stage** — pre-save edit (note, dayType, time) → celebratory summary (duration,
   volume, counts, new PRs, muscle map).
8. **Warm-up sets** — `isWarmup` toggle via the SET-number cell.
9. **History list + calendar/heatmap** — reverse-chron feed + `Heatmap`; tap a day → session detail.
10. **Per-exercise detail** — enhance `exercise/[id]`: metric switcher, PR rows, tap-record→session.
11. **Plate calculator (kg)** — per-side stack + "closest possible weight" fallback.
12. **Custom exercise create** — `createExercise` (unlimited).
13. **Warm-up calculator** — 40/60/80% default (editable), inserts `isWarmup` rows.
14. **Draft autosave / crash recovery** — draft JSON in `meta['activeWorkoutDraft']`.
15. **Keep-screen-awake + swipe-to-delete-set + undo**.

---

## 6. Explicitly skipped / deferred

**Skip (violates a hard constraint):** social feed / following / leaderboards / sharing-to-feed ·
iOS Live Activity / Dynamic Island · lb/imperial toggle · Health/Strava sync · free-tier caps &
paywalls · cross-user routine sharing · cardio/duration/distance exercise types · Strength-Level
cohort benchmarking · server-hosted animations/video.

**Defer to Phase 5 (purely additive — new nullable column/table + new write path):** per-set **RPE** ·
**drop/failure** set types · per-set & persistent per-exercise **notes** · **routine folders** ·
**edit-a-saved-workout** · **supersets/circuits** · **body measurements/photos** · "most reps"/"best
duration" PR kinds · per-set target weight in plans · **writable routine editor** (core needs no schema
— see §8 for whether to pull it earlier).

---

## 7. Gap table — how each Hevy capability maps to ForgeAI

**Buildable on EXISTING tables via NEW services (no schema change):**

| Capability | Frozen reuse |
|---|---|
| Active-workout logging | `createSession` + `addSets` (auto set# + PR detect); draft in memory |
| PREVIOUS column + auto-fill | `getExerciseHistory`, `getLastSessionOfDayType` |
| Warm-up sets | `set_entries.isWarmup`; `addSets` accepts it; working-set queries already exclude it |
| Rest timer / warm-up / plate calc | ephemeral UI + pure utils; defaults in `meta` |
| Library browse/search/filter/recent | `getAllExercises` (`name`+`aliases`, `muscleGroup`/`equipment`) |
| Custom exercise | `exerciseRepo.createExercise` (all fields exist) |
| Per-exercise History / Records / e1RM chart | `getExerciseHistory`, `getAllPrs`/`getPrHistory`, `epleyE1rm`, `getExerciseStats` |
| PR kinds weight / e1rm / volume | `personal_records.kind` covers exactly these three |
| Tap-record → session | `personal_records.sessionId` → `getSessionDetail` |
| History feed + calendar/heatmap | `getRecentSessionDetails`, `getSessionsBetween` + `Heatmap` |
| Delete workout / repeat workout | `deleteSession`; `getSessionDetail`→`createSession`+`addSets` |
| Two-stage finish summary + muscle numbers | `getSessionDetail`, `getMuscleGroupVolume`, `getPrHistory` |
| Aggregate analytics | `getWeeklyVolume`, `getWorkoutFrequency`, `getConsistency`, `getAnalyticsBundle` |
| Weekly streak (fix day→week) | new service over `getSessionsBetween`; goal in `meta` |
| Favorites / rest map / warm-up formula / draft | JSON in `meta(key,value)` |
| Start-from-plan | `planRepo.getActivePlan` (read-only) |

**Needs additive schema (Phase 5, additive only):** per-set RPE (`set_entries.rpe`) · set types
(`set_entries.setType`) · supersets (`set_entries.supersetGroup`) · per-set notes (`set_entries.note`) ·
routine folders (`routine_folders` + `workout_plans.folderId`) · body measurements
(`body_measurements`) · session title/media. **Writable routines** = a new `routineRepo` over existing
tables (**core: no schema**; `plan_exercises.restSec/.notes/.targetWeightKg` are additive niceties).
**Edit-saved-workout** = new SQL in a new module (tables already support it; only the repo API is missing).

---

## 8. Owner decisions — ✅ RESOLVED (2026-07-08)

1. **Tab structure / navigation** → **Option A (CONFIRMED).** A NEW `TrackerTabBar` (copies the frozen
   `TabBar` look/tokens, extended icon map) → tabs **Home · Workout · History · Progress · Profile**;
   **Coach demoted** to a Home button (route kept). Frozen `TabBar.tsx` untouched.
2. **Routine authoring placement** → **Phase 5a (CONFIRMED).** Ship the logger first (P1–P4); the
   writable routine editor lands in Phase 5a. v1 routine substitute = seeded active plan +
   Start-From-Plan + repeat-workout.
3. **Rest-timer background alert** → **YES (default).** Add `expo-notifications` + `expo-keep-awake` in
   Phase 2 (offline local notification at zero + keep-awake). Owner-gated dep add flagged at P2.
4. **Home hero CTA** → **Repoint with fallback (default).** Home's "Today: <day>" card starts a workout
   (from the plan day) with a secondary "Ask coach" affordance.

---

## 9. Phased build plan

Each phase is small, shippable, offline-safe, and ends with the verification ritual (§10) + a
PROGRESS.md note + STOP-and-report. No frozen file is edited in any phase.

### Phase 1 — Log a workout (the spine)  ⭐ makes it "feel like Hevy"
- **Goal:** a real manual active-workout flow — Start Empty / Start From Plan → set grid with PREVIOUS
  + one-tap ✓ + warm-up toggle → Finish → summary. **No schema change.**
- **Add:** `src/tracker/store/activeWorkoutStore.ts` (in-memory draft `{exercises:[{exerciseId,
  rows:[{weightKg,reps,isWarmup}]}], startedAt, dayType}` + autosave to `meta['activeWorkoutDraft']`);
  `src/tracker/components/` (`ExerciseLogCard`, `SetRow` with ✓/keypad/haptic-on-down, `ExercisePicker`);
  `src/tracker/services/finishSummary.ts`; routes `app/workout/active.tsx`, `app/workout/index.tsx`
  (start screen: Empty vs From Plan), `app/workout/finish.tsx`.
- **Reuse (frozen):** `createSession({source:'manual'})`, `addSets` (auto set# + PRs), `getActivePlan`,
  `getExerciseHistory`/`getLastSessionOfDayType` (PREVIOUS), `getAllExercises`, UI kit + `dashboardStore.refresh`.
- **Edit (minimal, screens):** `_layout.tsx` (tab per §4 decision), `app/_layout.tsx` (rehydrate draft),
  optionally `index.tsx` hero CTA.
- **Success:** start an empty or from-plan workout, log sets with PREVIOUS prefill + warm-up, Finish
  commits a `source:'manual'` session, PRs appear, Home/Progress reflect it; kill the app mid-workout
  and the draft restores; **zero network**; `typecheck` green.
- **Risks:** draft/serialization correctness; set-number/PR parity via `addSets`; keypad + haptic feel.

### Phase 2 — Rest timer + barbell math
- **Goal:** the rest timer + plate/warm-up calculators + safe set deletion.
- **Add:** `src/tracker/store/restTimerStore.ts` (countdown, ±15s, skip; default in `meta`;
  local notification at zero); `src/tracker/services/plateCalculator.ts` + `warmupCalculator.ts` (pure);
  `RestTimerBar`, `PlateCalcSheet`, swipe-to-delete on `SetRow` + undo snackbar; Settings "Workout"
  group (default rest, keep-awake, warm-up formula).
- **Reuse:** `AnimatedNumber`, `GhostButton`, `Icon('clock')`, `exercises.equipment/incrementKg`,
  `gesture-handler`.
- **Deps (owner-gated, §8.3):** `expo-notifications`, `expo-keep-awake`.
- **Success:** ✓ auto-starts the timer; ±15s/skip work; notification fires at zero offline; plate calc
  shows per-side stack + "closest possible weight"; warm-up calc inserts `isWarmup` rows; swipe-delete
  + undo; keep-awake scoped to the workout; `typecheck` green.

### Phase 3 — History + calendar + finish polish
- **Goal:** browse the past — feed, calendar/heatmap, session detail, weekly streak, repeat-workout.
- **Add:** `src/tracker/services/history.ts`, `weeklyStreak.ts`; routes `app/history/index.tsx`
  (feed + `Heatmap` calendar), `app/history/[sessionId].tsx` (session detail + delete + repeat);
  `MuscleMap` SVG component; finish-summary polish (streak, muscle map, playful comparison).
- **Reuse:** `getRecentSessionDetails`, `getSessionsBetween`, `getSessionDetail`, `deleteSession`,
  `getMuscleGroupVolume`, `getPrHistory`, `Heatmap`, `HeroCard`/`StatTile`.
- **Success:** calendar paints workout days; tap → detail; delete a past workout; "repeat" clones it
  into today via `createSession`+`addSets`; weekly streak matches Hevy semantics; `typecheck` green.

### Phase 4 — Library + exercise detail + analytics + export
- **Goal:** the exercise spine — library list, custom exercise, richer per-exercise detail, bodyweight,
  export.
- **Add:** `app/library/index.tsx` (search + 2-axis `Chip` filter + Recent), `app/library/new.tsx`
  (custom exercise form → `createExercise`); `src/tracker/services/exerciseAnalytics.ts` (metric series
  + xRM ladder computed on read), `dataExport.ts` (CSV/JSON to a local file); enhance `exercise/[id]`
  (metric switcher, PR rows, tap→session); bodyweight quick-log + `LineChart`; timeframe `Chip`s.
- **Reuse:** `getAllExercises`/`findExerciseByName`/`createExercise`, `getExerciseStats`, `getAllPrs`,
  `epleyE1rm`, `LineChart`/`Sparkline`/`Chip`, `logBodyWeight`/`getBodyWeightHistory`.
- **Success:** browse/search/filter the library; open detail; create a custom exercise and use it;
  metric switcher + PR rows work; export a local CSV/JSON offline; bodyweight logs + charts;
  `typecheck` green.

### Phase 5 — Additive depth (only after 1–4 are solid; each independent + schema-additive)
Pick per demo value; each ships behind existing UI without touching frozen files, via a new
`initTrackerSchema()` + new write paths:
- **5a Writable routine editor** — `src/tracker/db/routineRepo.ts` (create/update/delete/duplicate/
  reorder/setActive over existing plan tables; **core needs no schema**) + `plan_exercises.restSec/.notes`
  + "update routine after workout?" write-back. *(May move earlier — §8.2.)*
- **5b Set types + RPE** — `set_entries.setType` + `.rpe` (+ new write path around `addSets`).
- **5c Edit-a-saved-workout** — new module (tables support it; only repo API missing).
- **5d Body measurements** — `body_measurements` table + screen.
- **5e Supersets + folders** — `set_entries.supersetGroup`, `routine_folders`/`workout_plans.folderId`
  (lowest priority).

---

## 10. Verification ritual (every phase)
`npm run typecheck` green (in `apps/mobile`) · **offline demo makes zero network calls and fully
works** (log a workout, browse history/analytics, `localCoach` still there) · **no frozen file touched**
(engine / components/ui / components/charts / existing repo+service signatures) · phase success
criteria met · adversarial **logic + compile review before any tag** · `PROGRESS.md` updated · small
committed steps · **STOP + report + wait for "continue."** Owner tags releases (cloud build only).

## 11. Planned (owner, 17 Oct 2026) — kg target per exercise on the Workout tab (NOT built)

**Ask (corrected by the owner the same day):** NOT one total for the day. Each exercise of the
routine gets its own kg to lift today, on the Workout tab's Up next card (and below "Resume
workout" when one is open). Then, inside the workout, each set's suggested weight and reps are
what add up to that exercise's target.

**Words (member-screen rule: never "volume" or "session"):** "kg to lift", "last time".

**Up next card (sketch):**
```
Up next: Push Day A                                  [Start]
  Bench Press      765 kg to lift   last 720 kg   +6%
  Overhead Press   720 kg to lift   last 720 kg   hold (same as last time)
  Incline DB Press first time: find a weight for 8–12
  Push-ups         40 reps          last 38       +2 reps
```
With a workout open, under Resume workout: "Bench Press 410 of 765 kg".

**Inside the workout (the link the owner asked for):** the exercise card's target line shows the
kg target and how far along the member is ("765 kg to lift · 410 so far"), and every open set
keeps its suggested weight × reps (today's Target line, "42.5 kg · aim for 6"), which together
make the 765. When a set comes in under or over, the remaining sets' suggestion says what is left
("355 kg left: 42.5 × 6, 5 hits it"). The member can always lift more; nothing blocks Finish.

**How each exercise's target is worked out (recommendation):** from the Targets the app already
computes per exercise (engine/progression.ts: double progression — add reps up to the top of the
range, then the member's Settings → Workouts → Weight jumps ≈ 2.5 / 5 / 10% and back to the
bottom of the range; big-jump guard; RPE; long-break and stall rules). kg target = the sum of
target weight × target reps of the main sets (warm-ups out). The % over last time FOLLOWS from it:
usually 0–10%, sometimes 0 or lower on purpose (a hold after a stall, lighter after a long break,
said in words). A fixed +15% per exercise every workout would compound to double in about 5
workouts and could only be met with extra sets or sloppy reps; research favours reps-then-weight
per exercise and moderate rises in work.

**Edge cases:** first time on an exercise (no kg: "find a weight"); bodyweight and timed moves
(target in reps / seconds, not kg); assisted (help going down); drop sets and back-off sets count
toward the kg but never block progress (engine rule); a set count changed since last time
(compare kg, say "1 set more than last time"); lb users (lb).

**Owner decisions needed:**
1. Each exercise's target: (A, recommended) follows the existing Targets and Weight jumps
   setting; or (B) a fixed "aim for N% more kg per exercise" the member chooses (cap 10%).
2. When a set falls short: (A, recommended) the next sets' suggestion shows what is left to hit
   the target, never more than one weight step or 2 reps above the plan; or (B) leave the sets'
   suggestions as planned and only show "kg so far".

**Build outline (when approved):** pure `exerciseKgTarget(target, lastTime)` and
`remainingPlan(target, doneSets)` in src/tracker/lib (tested: kg / lb, every exercise type,
short and over-shooting sets) → UpNextCard lines, the in-progress lines and the exercise card's
target line; phone parts check the numbers on the owner phone (Monday, 1st of the month,
~500-workout history) against what each set suggests.
