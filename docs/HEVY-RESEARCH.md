# Hevy & Peer Workout-Tracker Research — grounded for ForgeAI

**Purpose.** Deep research on what makes **Hevy** (and Strong, FitNotes and peers) a best-in-class
**manual workout tracker**, translated into concrete, buildable recommendations for ForgeAI's
manual-tracker pivot (see `docs/PLAN.md → PRODUCT PIVOT`). Every recommendation is mapped to
ForgeAI's **real, frozen** SQLite tables + `src/engine`/repos (see `docs/CONTRACTS.md`), so the plan
that follows (`docs/TRACKER-PRD.md`) is real, not aspirational.

**Method.** A 27-agent research workflow (2026-07-08): 8 parallel researchers (one per feature area,
`WebSearch`/`WebFetch` over Hevy's help centre, hevyapp.com feature pages, Strong/FitNotes docs, app
stores, and credible comparisons) → **18 adversarial fact-checks** of load-bearing claims against
**primary sources** → 1 synthesis. Sources are listed per section and consolidated at the end.

> **Scope of "peers":** Hevy is the reference implementation throughout. Strong, FitNotes/FitNotes X,
> Jefit and Boostcamp are cited where they do something materially different (leaner, harder-gated,
> or fully-free/offline).

---

## 0. Fact-check summary (what survived, what was corrected)

Of 18 adversarially-checked claims, **15 CONFIRMED**, **1 REFUTED**, **2 UNCERTAIN/refined**:

| Claim | Verdict | Note for ForgeAI |
|---|---|---|
| Rep RANGES ("6 to 8") in the routine editor; per-exercise auto rest timer on set-complete; RPE not in the routine builder | **CONFIRMED** | `plan_exercises.repRangeMin/Max` already models ranges |
| Free caps: Hevy = 4 routines / 7 custom exercises / 3-month history; Strong = 3 templates | **CONFIRMED** | ForgeAI is ungated → **skip all caps** (a competitive advantage) |
| Finishing a routine-workout prompts "update routine?"; both apps can save a past workout as a template | **CONFIRMED** | Needs a writable routine editor (ForgeAI's `planRepo` is read-only) |
| Set type set by tapping the SET-number cell; drop-set does NOT auto-start the rest timer | **CONFIRMED** | Drop/failure need a `setType` column (deferred) |
| RPE opt-in, 6–10 in half-steps (6, 7, 7.5 … 10), warm-ups may stay blank | **CONFIRMED** | Needs `set_entries.rpe` (deferred) |
| Tap ✓ completes a set (auto-starts timer); swipe-left = red Delete; PREVIOUS auto-fills; discard is unrecoverable | **CONFIRMED** | Maps to `addSets` + in-memory draft |
| Rest timer auto-starts on ✓, per-exercise 5s–5min, ±15s / skip, Live Activity | **CONFIRMED** | Build in-app timer; Live Activity is out of scope |
| Supersets via 3-dot "+ Add To Superset", auto colour, 3+ = circuit, Smart Superset Scrolling | **CONFIRMED** | Needs a `supersetGroup` column (deferred) |
| Warm-up calc default 40%×5 / 60%×5 / 80%×3; plate calc shows "closest possible weight is Xkg" | **CONFIRMED** | Pure utils; kg matches ForgeAI |
| Active streak = consecutive **weeks** with ≥1 session (not days); back-logging back-fills a week | **CONFIRMED** | ForgeAI's `getStreakDays` is **day-based** — a real semantic gap |
| Hevy live-detects 5 PR kinds: heaviest weight, best e1RM, best-set volume, most reps, best duration | **CONFIRMED** | Only weight/e1rm/volume map to `personal_records.kind` |
| 400+ built-in exercises; FitNotes X advertises 800+ | **CONFIRMED** | ForgeAI seeds ~35; library list is a new screen |
| Hevy custom-exercise cap 7 (free) / unlimited (Pro); chart history 3-month (free) | **CONFIRMED** | ForgeAI: unlimited, all-time |
| Two-stage finish (pre-save edit → swipeable shareable summary, transparent/light/dark) | **CONFIRMED** | Build summary; share-image optional |
| **Strong uses Brzycki-low + Epley-high for e1RM** | **REFUTED** | Strong uses **Brzycki only**. ForgeAI's `engine.epleyE1rm` (Epley) is industry-standard — **do NOT implement a formula switch** |
| Hevy Pro price / CSV gating | **UNCERTAIN → corrected** | CSV export is **free**, not Pro. Pro is **$2.99/mo, $23.99/yr, $74.99 lifetime** (was quoted $4.99–5.99). Moot for ForgeAI (ungated) |

---

## 1. Routines & templates

**How the best apps do it.** A "routine/template" is a reusable, **un-timed** skeleton of exercises
you later "start" to spawn a live, timed session. **Hevy** is the richer model: routines live in
drag-to-reorder **folders**; each exercise carries target sets, an optional **rep RANGE** ("6 to 8"),
a per-exercise auto rest timer, per-set types, and free-text notes; a **library of ~26 pre-built
programs + ~7 routine categories** seeds new users; finishing a routine-workout offers **"update
routine?"** so templates evolve. **Strong** is leaner: templates built "the same way as a workout,"
organized in folders (iPhone only), reordered by dragging the exercise name, **no rep ranges**, and
the **rest timer is not editable inside a template**. Both cap quantity (Hevy 4 / Strong 3 free) and
both can **create a template from a past workout**.

**Key behaviours (with UX detail).**
- **Routine editor** — tap the REPS cell to toggle single-value ↔ range (min/max); rest timer sits
  below the exercise notes and can be turned off per exercise. Order is a persisted index.
- **Start from routine** — spawns a live, stopwatch-timed session with the routine's exercises and
  targets shown as **ghost placeholders** you overwrite; on Finish, "update the original routine?".
- **Empty / freestyle workout** — Hevy markets it as "2 taps": Workout tab → "+ Start Empty Workout"
  → timer starts → "+ Add Exercise". The escape hatch that resolves the #1 beginner confusion.
- **Pre-built library** — one-tap add a ready program (by goal/equipment/experience); it becomes a
  normal editable routine. Solves the empty-state problem.
- **Three-dot actions** — Duplicate / Edit / Share / Delete (duplicate = the fast path to "Push A → Push B").

**ForgeAI fit.**
- **Adopt:** ForgeAI's `plan_exercises` **already models Hevy's core** — `(order, targetSets,
  repRangeMin, repRangeMax)` maps 1:1 to per-exercise sets + rep range + ordering, **no schema change
  for the core editor**. "Start from routine" = `planRepo.getActivePlan()` seeds target rows →
  `workoutRepo.createSession({source:'manual'})` → `addSets`. "Empty workout" = `createSession` with
  no prefill. Ship a **pre-built routine library as seed data** so the list is never empty.
- **Skip:** free-tier routine caps (ForgeAI is ungated), cross-user link sharing (needs a backend;
  violates offline), Strong-style tempo/AMRAP.
- **Needs a NEW module:** a **writable routine repository** — `planRepo` today exposes **only**
  `getActivePlan` (read-only). Create/update/delete/duplicate/reorder/setActive is the **single
  biggest new build** and cannot go in the frozen `planRepo.ts`.
- **Needs additive schema (post-MVP):** `plan_exercises.restSec`, `.notes`, `.targetWeightKg` for
  full parity; a `routine_folders` table + `workout_plans.folderId` for folders.

_Sources: Hevy Help Centre "Build a Workout Program" · hevyapp.com/features/gym-routines · /exercise-programming-options · /start-empty-workout · /gym-workout-routines · Strong Help "What is a Template" & "organize routines" · Setgraph "Hevy vs Strong (2026)"._

---

## 2. Active workout & set logging (the spine)

**How the best apps do it.** The active workout is a vertical list of **exercise cards**, each holding
a compact table of set rows: a tappable **SET-number cell**, a **PREVIOUS** hint column, editable
**WEIGHT** and **REPS** cells, and a **completion checkmark**. The whole loop is optimized for one
thumb mid-set: tap a cell → numeric keypad slides up; tap ✓ → the row turns green, a **haptic fires,
and the rest timer auto-starts**. Advanced options hide behind the SET-number cell (set type, RPE).
The session persists in the background and is only committed on **Finish**; **discard is deliberate
and unrecoverable** — which implies a resumable in-progress draft is the safety net.

**Key behaviours (with UX detail).**
- **Set row + tap-cell keypad** — layout `SET# | PREVIOUS | KG | REPS | ✓`. Tapping a value cell
  **selects the whole value** (overtype, not append). Empty cells show the PREVIOUS value as grey
  placeholder so a bare ✓ logs exactly last time.
- **Checkmark = commit + haptic + rest timer** — the only mandatory tap per set; completed rows tint
  green. For a following **drop set**, Hevy deliberately does **not** auto-start the timer.
- **SET-number cell → set-type menu** — Normal / Warm-up (W) / Failure (F) / Drop (blue D). Warm-ups
  are excluded from working-set stats & PRs.
- **PREVIOUS column + auto-fill** — starting an exercise pre-populates last session's sets/weight/reps
  (editable). Makes progressive overload obvious inline. Rated the single biggest logging-speed driver.
- **Add set / swipe-to-delete** — "+ Add Set" copies the prior row; swipe-left reveals a red Delete;
  deleting renumbers remaining working sets.
- **Per-set RPE** (opt-in column) — tap to pick 6–10 in half-steps; warm-ups may stay blank.
- **Notes** — a persistent per-exercise form cue (shows every session) + an ad-hoc per-session note.
- **Finish vs Discard + background persistence** — Finish commits; Discard is confirmed & unrecoverable.

**ForgeAI fit.**
- **Adopt:** build the active-workout screen as a **NEW module**. The **draft session lives in memory
  (Zustand)**, autosaved to `meta['activeWorkoutDraft']` for crash recovery, and is committed on
  Finish via the frozen `workoutRepo.createSession({source:'manual'})` + `addSets(...)` — which
  **already auto-numbers sets AND runs PR detection** (`checkAndRecordPrs`), so there is **no PR code
  to write**. PREVIOUS column = `getExerciseHistory(exerciseId, 1)` / `getLastSessionOfDayType`.
  **Warm-up maps 1:1 to the existing `set_entries.isWarmup`.** Session note = `workout_sessions.notes`.
- **Skip for v1:** supersets (no grouping column), drop/failure types (only `isWarmup` exists),
  per-set RPE/notes (no columns), iOS Live Activity (heavy native) — a local notification substitutes.
- **Why draft-in-memory, not live DB writes:** the frozen repo has **no `updateSet`/`deleteSet`** and
  `addSets` is append-only + fires PR detection on every call. Holding the draft in memory gives full
  edit/reorder/remove freedom and one clean PR pass at Finish — and respects every frozen signature.

_Sources: Hevy Help "Set Types Explained" · hevyapp.com/features/workout-set-types · /how-to-calculate-rpe · /track-workouts · /live-activity · /hevy-tutorial · Strong Help "Set Tags" · FitNotes "Workout Tracking"._

---

## 3. Rest timer, supersets, reorder, plate & warm-up math

**How the best apps do it.** These are friction-removers layered on the set grid. Completing a set
auto-starts a **per-exercise rest timer (5s–5min)** that runs in the background via a Live Activity
(lock-screen), adjustable **±15s** or skippable; drop sets suppress it. **Supersets** are formed
ad-hoc from an exercise's 3-dot menu ("+ Add To Superset"), each group getting a unique auto colour;
3+ = a circuit; **Smart Superset Scrolling** auto-advances the logging view through the group. A
**plate calculator** (a "Calculator" button above the keypad) shows the per-side plate stack and warns
"closest possible weight is Xkg"; a **warm-up calculator** inserts a percentage ramp (default
**40%×5 / 60%×5 / 80%×3**, editable) as W rows.

**ForgeAI fit.**
- **Adopt (all pure/ephemeral, no schema):** **rest timer** as an in-memory countdown started on ✓
  (render with `AnimatedNumber` + clock `Icon` + `GhostButton` −15/+15/Skip; default seconds in
  `meta`); **plate calculator** as a kg-only util over `exercises.equipment==='barbell'` +
  `incrementKg`; **warm-up calculator** util that inserts `isWarmup:true` rows (formula in `meta`);
  **reorder mid-workout** as pure in-memory array-index manipulation before commit.
- **Skip / defer:** iOS **Live Activity** (native ActivityKit — out of scope; use one local
  `expo-notifications` fire-at-zero alert instead); **supersets/circuits/Smart Superset Scrolling**
  (need a `set_entries.supersetGroup` column — deferred); **per-exercise custom rest durations**
  (store a `meta` JSON map as a workaround, or add an `exercises` column later).

_Sources: hevyapp.com/features/workout-rest-timer · /live-activity · /what-are-supersets · /weight-plate-calculator · /warm-up-set-calculator · Hevy Help "Workout Settings Preferences"._

---

## 4. Finish, history, calendar & streaks

**How the best apps do it.** Finishing is a **two-beat moment**: a **pre-save edit screen** (rename,
duration, date/time for back-logging, up to 3 media, notes, visibility) → a **celebratory, swipeable,
shareable summary** (ordinal workout #, active streak, new PRs, duration / exercise / set / volume
counts, a **body muscle diagram**, and a playful comparison — "you lifted X kg, that's like lifting a
truck"). History is a **reverse-chron feed** plus a **Calendar** where every workout day is a blue
circle you tap to open that session. Consistency is a **weekly streak** (consecutive weeks with ≥1
session) plus a **rest-days-since-last** counter. Past workouts are edited/deleted from a 3-dot menu;
any session can be re-run. A **monthly report** recaps volume, PRs, muscle distribution vs last month.

**ForgeAI fit.**
- **Adopt:** two-stage finish over `getSessionDetail` (duration from `startedAt/endedAt`, volume/counts
  from sets, PRs from `getPrHistory`); **calendar/heatmap** via the frozen `Heatmap` chart +
  `getSessionsBetween` — **the highest-value, lowest-friction adopt** (both data and visual already
  exist); history feed via `getRecentSessionDetails`; delete via `deleteSession`; **repeat-workout** =
  `getSessionDetail` → `createSession` + `addSets` (the offline substitute for "save as routine");
  muscle-map numbers via `getMuscleGroupVolume`; monthly recap via `getAnalyticsBundle`.
- **Fix — streak semantics:** ForgeAI's `getStreakDays` is **day-based**; Hevy's proven model is a
  **weekly** streak. Add a new service computing a weekly streak from `getSessionsBetween` (goal target
  in `meta['weeklyGoal']`). _Do not edit the frozen `getStreakDays`_ — add alongside.
- **Skip / defer:** social visibility/sharing-to-feed, Health/Strava sync, "most reps"/"best duration"
  PR banners (only weight/e1rm/volume map to `personal_records.kind`); **edit-a-saved-workout** needs a
  new module (the tables support it; only the repo API is missing — no `updateSession`/`deleteSet`).
- **New modules:** `services/history.ts`, `services/finishSummary.ts`, an **SVG body muscle-map**
  component (the frozen kit has `Heatmap` but no anatomy diagram), an optional share-image renderer.

_Sources: hevyapp.com/features/workout-log · Hevy Help "Calendar and Streak Features" · hevyapp.com/features/gym-consistency · /monthly-report · /live-pr · Hevy Help "Personal Records and Set Records"._

---

## 5. Exercise library & detail

**How the best apps do it.** The library is the spine you enter both while building routines and
mid-workout. Hevy ships **400+ built-in exercises** with demo animations + written steps, layered with
a rich per-exercise detail screen: a **"How to"** tab (animation + steps), a **History** tab
(session-by-session on that movement), and a **Records/charts** view (heaviest weight, projected 1RM,
best set & session volume, total reps, plus a metric-switch graph). Filtering is **two-axis**
(equipment + muscle) with free-text search and a **"Recent Exercises"** section pinned on top. **Custom
exercises** (name, image, equipment, primary + secondary muscles, exercise "type") are a headline
feature (7 free / unlimited Pro). Peers differ mostly on catalog size (FitNotes X 800+) and grouping.

**ForgeAI fit.**
- **Adopt (mostly free):** a **library list screen** backed by `getAllExercises` (search on
  `name`+`aliases`), **two-axis `Chip` filters** on the existing `muscleGroup` + `equipment` enums, a
  **Recent** section from `getRecentSessionDetails`. **The exercise-detail requirement is largely
  DONE**: `app/exercise/[id].tsx` already renders hero stats + progress/e1RM/volume charts + session
  history via `getExerciseStats` — the library list just navigates to it. **Custom exercise** =
  `exerciseRepo.createExercise` (every field already exists). **Records** = `getAllPrs`/`getPrHistory`
  + `epleyE1rm` + `Badge`/`Icon('trophy')`.
- **Skip:** non-weight exercise "types" (kg + reps only — treat everything as weight&reps), free/paid
  gating (unlimited), server-hosted animations/video (offline — at most a bundled static
  instruction-text JSON keyed by `exerciseId`).
- **Needs additive schema (optional):** **favorites** (use a `meta` JSON array to avoid touching the
  frozen `exercises` schema); per-exercise written instructions/muscle-diagram data (bundle static JSON
  — `secondaryMuscles[]` already exists); richer equipment buckets (kettlebell/band) if ever wanted.
- **New modules:** library list screen, custom-exercise form, a **muscle-diagram SVG** component,
  a small exercise-records helper (best-session-volume, total-reps computed on read).

_Sources: hevyapp.com/features/exercise-library · /custom-exercises · /exercise-performance · Hevy Help "Exercise Library 400+" · "Exercise Performance Tracking in Library" · FitNotes X · Strong._

---

## 6. PRs, progress charts & analytics

**How the best apps do it.** A three-layer stack: (1) **automatic PRs** detected on every logged set
(heaviest weight, e1RM, best-set volume, best-session volume, most reps; duration/cardio for time/dist),
surfaced **live** via a banner/trophy badge on the set row; (2) **per-exercise progress charts**
(e1RM-over-time, heaviest weight, volume, best set) with **3-month / 1-year / all-time** toggles;
(3) an aggregate **Analytics** tab — volume & set-count per muscle group (+ an **anatomical
body-heatmap**), workouts-per-week frequency, duration, plus separate body-measurement & bodyweight
tracking. Hevy also splits **"Set Records"** (heaviest weight at each rep count, an xRM ladder) from
**"Personal Records."** e1RM math: **Epley is standard** (Hevy); **Strong = Brzycki only** (the
Brzycki/Epley split claim was **refuted**); FitNotes derives a 2RM–15RM ladder from the best e1RM.

**ForgeAI fit.**
- **Adopt (much already wired):** **PR detection already runs inside `addSets`**;
  `personal_records.kind` already covers **weight / e1rm / volume**. Per-exercise **e1RM chart** =
  `epleyE1rm` (Epley — correct, industry-standard, **frozen — keep it**) over `getExerciseHistory` →
  frozen `LineChart`, with a metric switcher. Aggregate analytics reuse the **existing Progress tab**:
  `getWeeklyVolume`→`BarChart`, `getMuscleGroupVolume`→`HBarList`, `getWorkoutFrequency`→`BarChart`,
  `getConsistency`/`getStreakDays`→`StatTile`/`RingGauge`. **Bodyweight** = `userRepo.logBodyWeight`/
  `getBodyWeightHistory` + `LineChart`. Timeframe `Chip` row (3mo/1yr/all) = client-side filtering.
  **Tap-a-PR → source session** via `personal_records.sessionId` → `getSessionDetail`.
  **xRM ladder can be computed on read** — no schema needed.
- **Skip / defer:** RPE analytics (no column), superset/dropset volume grouping (no column), cardio
  distance/duration charts (kg+reps only), Strength-Level **cohort** benchmarking (needs external norm
  tables — use the internal `engine.computeStrengthScore` instead).
- **Needs additive schema:** circumference **body measurements** (new `body_measurements(dateISO, type,
  valueCm)` table — `body_weight` only holds weightKg); "most reps"/session-vs-set volume as **stored**
  PR kinds (or compute on read).

_Sources: Hevy Help "Personal Records and Set Records" · "Set Records vs Personal Records" · hevyapp.com/features/gym-performance · /exercise-performance · /track-body-measurements · Strong (Brzycki) · FitNotes "Progress Tracking"._

---

## 7. UX principles that make it "feel like Hevy"

Distilled from the research + fact-checks, these are the load-bearing UX rules to honor:

1. **~2 taps per set, never blocked.** Type number → tap ✓; the checkmark is the *only* mandatory tap
   and it simultaneously **commits, haptic-confirms, and starts rest**. Nothing sits between you and
   the next set. (Match the house rule: fire the haptic on **finger-down**, not release.)
2. **Progressive disclosure.** Hide advanced behind the obvious element — set-type behind the
   SET-number cell, reorder/replace/superset behind a 3-dot menu, plate calc on a button above the
   keypad. The default screen is a clean **kg / reps / ✓** grid.
3. **Everything optional defaults OFF.** RPE, set types, calculators — opt-in. Beginners see minimal
   density; power users opt in. (Matches ForgeAI's schema reality: warm-up is the only variant in v1.)
4. **PREVIOUS-value prefill turns logging into confirmation.** Grey ghost placeholders you overtype
   (select-all on focus, don't append); a bare ✓ logs last time.
5. **Destructive-safe & recoverable.** Swipe-left → red Delete (two-step, not instant); undo snackbar;
   **draft autosaved** so an app-switch/crash never loses the log. Discard is deliberate + confirmed.
6. **Offline-first, gym-hardened.** No spinners, no network path — SQLite only. **Keep-screen-awake**
   scoped to the active workout; polished dark mode tuned for gym lighting.
7. **One clear fork, always an escape hatch.** "Start Empty Workout" vs "Start From Plan" is the only
   top-level decision — the empty path means you're never blocked on building a routine first. Seed
   routines/exercises so **no screen is a dead empty state** (use the frozen `EmptyState`).
8. **Celebrate the finish.** A two-stage finish (quiet pre-save edit → celebratory swipeable summary
   with PRs + muscle map) rewards completion — without any social feature.
9. **Ungated = the differentiator.** Unlimited routines, all-time history, unlimited custom exercises,
   plus ForgeAI's **existing overload engine** (`computeOverloadTarget` / `coach.getTodaysWorkout`)
   position it *above* pure loggers — lean on that instead of a paywall.

---

## 8. Competitive landscape & monetization (for positioning)

- **Hevy** — category leader: polished logger + **generous freemium** (unlimited logging free; caps on
  4 routines / 7 custom exercises / 3-month history; Pro **$2.99/mo, $23.99/yr, $74.99 lifetime**) +
  an **Instagram-like social feed** with per-exercise leaderboards (polarizing; **irrelevant to a
  solo/offline app**). Its Pro hook, **"Hevy Trainer"** (adaptive progressive overload), is *exactly
  the gap ForgeAI's AI coach + overload engine already fills*.
- **Strong** — leaner and **harder-gated** (3 routines free; plate calc/custom exercises/charts are
  premium at $4.99/mo). Wins on pure logging speed; loses users to Hevy on the tight cap.
- **FitNotes / FitNotes X** — the **privacy/offline gold standard**: 100% free, no ads, **no account,
  fully offline, CSV export**. Directly maps to ForgeAI's offline-first, no-account positioning.
- **Jefit** (depth: 1,400+ exercises, dated UI) / **Boostcamp** (curated coach programs, not logging UX)
  — cautionary tales that **feature-bloat buries the core loop**.

**Learnings for ForgeAI:** copy the **fast tap-to-log-with-prefill** UX and the **FitNotes
offline/export ethos**; **deliberately drop** artificial free-tier caps and the social feed; treat
**plate/warm-up calculators** as small high-value additive modules; and **lean on the existing overload
engine** as the "Hevy Trainer" equivalent so ForgeAI sits *above* pure loggers.

_Sources: hevy.com/pricing · hevyapp.com/features · /content-feed · /social-features · push-pull.app "Is Hevy Free? (2026)" · Setgraph "Best Strong alternatives" / "Best app to log workout" · Cora "Best Workout Tracker per Reddit" · GymGod "Strong vs Hevy (2026)" · FitNotes (Google Play)._

---

## 9. Consolidated adopt / skip / defer for ForgeAI

**ADOPT for v1 (buildable on the frozen tables via new services — no schema change):**
manual active-workout screen · one-tap ✓ set completion (+ haptic + rest timer) · PREVIOUS column &
auto-fill · rest timer (±15s / skip, local notification) · Start-Empty + Start-From-Plan · exercise
library list (search + 2-axis filter + Recent) · custom exercise create · finish two-stage summary ·
warm-up sets (`isWarmup`) · history feed + calendar/heatmap · per-exercise History/Records/e1RM chart ·
plate calculator · warm-up calculator · draft autosave · keep-awake · swipe-to-delete + undo ·
bodyweight quick-log · weekly-streak fix · CSV/JSON export · repeat-workout.

**SKIP (violates a hard constraint — offline / solo / kg-only / premium-ungated):**
social feed, following, leaderboards, sharing-to-feed · iOS Live Activity · lb/imperial toggle ·
Health/Strava sync · free-tier caps & paywalls · cross-user routine sharing · cardio/duration/distance
exercise types · Strength-Level cohort benchmarking · server-hosted animations/video.

**DEFER to a later, purely-additive phase (needs a new nullable column or new table + a new write
path — never edit a frozen signature):**
writable routine editor* · per-set RPE · drop/failure set types · per-set & persistent per-exercise
notes · routine folders · edit-a-saved-workout · supersets/circuits · body measurements/photos ·
"most reps"/"best duration" PR kinds · per-set target weight in plans.

> *The **writable routine editor** is the largest deferred build, but its **core needs no schema
> change** (it writes the existing `workout_plans`/`plan_days`/`plan_exercises` tables via a new
> module). Because Hevy's identity *is* routines, this is the one deferred item worth considering
> pulling earlier — see the phasing decision in `docs/TRACKER-PRD.md`.

---

## 10. Consolidated sources

**Hevy (primary):** help.hevyapp.com (Build a Workout Program; Set Types Explained; RPE; Rest Timer;
Personal Records & Set Records; Set Records vs Personal Records; Calendar & Streak; Exercise Library
400+; Exercise Performance Tracking; Body Composition; Workout Settings Preferences; Beginners Guide) ·
hevyapp.com/features (gym-routines, exercise-programming-options, start-empty-workout,
gym-workout-routines, exercise-library, custom-exercises, exercise-performance, workout-set-types,
how-to-calculate-rpe, track-workouts, live-activity, workout-rest-timer, what-are-supersets,
weight-plate-calculator, warm-up-set-calculator, workout-log, gym-consistency, monthly-report, live-pr,
gym-performance, track-body-measurements, training-chart, workout-settings, content-feed,
social-features, hevy-tutorial) · hevy.com/pricing.
**Strong:** help.strongapp.io (Templates; organize routines; my first workout; set tags) · strong.app ·
App Store listing.
**FitNotes:** fitnotesapp.com (exercises; workout_tracking; progress_tracking; body_tracker) ·
getfitnotes.com/docs/plate-calculator · fitnotesx.com · Google Play listing.
**Comparisons / reviews:** setgraph.app (Hevy vs Strong 2026; best Strong alternatives; best app to log
workout) · push-pull.app (Is Hevy Free? 2026) · gymgod.app (Strong vs Hevy 2026) ·
corahealth/corahealth.app (Best Workout Tracker per Reddit) · repreturn.com (Hevy review).

_Generated by the `hevy-research` workflow, 2026-07-08 — 8 research areas × adversarial fact-check ×
synthesis, all claims checked against primary vendor sources._
