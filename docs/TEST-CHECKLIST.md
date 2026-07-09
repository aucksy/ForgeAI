# ForgeAI Manual Tracker — Test Checklist

Running list of things to verify on device. Install the APK after **uninstalling any older
ForgeAI** (debug-signed builds won't install over each other). 🔬 = an edge case a review fixed —
worth an extra look. Everything must also work **offline / no account**.

> Builds: **v0.2.0** = Phase 1 · **v0.3.0** = Phase 1 + 2 · **v0.4.0** = adds Phase 3 · **v0.5.0** = adds Phase 4 (library + custom exercise + richer exercise detail + bodyweight + Excel export).

---

## Phase 1 — logging spine  (untested by owner)

### Navigation & Home
- [ ] Tabs read **Home · Workout · History · Progress · Profile** with icons (home / dumbbell / calendar / chart / gear); active tab glows + haptic.
- [ ] Coach isn't a tab, but the Home **"Next up"** row still opens the AI coach → coach works.
- [ ] Home hero **"Today: <day>"** → opens the **Workout** tab.

### Start & log
- [ ] Workout tab → **Start <plan day>** pre-fills the day's exercises with **PREVIOUS** (last time's `wt × reps`); **Start empty** gives a blank workout.
- [ ] Elapsed timer ticks. Type kg/reps → field **selects-all** on focus; **decimals work** in KG (`82.5`) and don't get cut off.
- [ ] Tap **✓** → row greens, **haptic on finger-down**; empty cell + ✓ **auto-fills** last time's value; ✓ again un-completes.
- [ ] Tap the **SET number** → toggles **warm-up (W)**; working sets renumber (1,2,3… skipping W).
- [ ] **Add set** / **Add exercise** (search + muscle chips) / remove exercise (×, confirm).
- [ ] 🔬 On an exercise with history + 3 sets, mark **set 1 as warm-up** → remaining working rows still show the **correct** PREVIOUS (not shifted); W row shows "—".
- [ ] 🔬 **Double-tap** an exercise in the picker → added **once**, land back on the workout (not popped past it).

### Finish, history, resume
- [ ] Finish disabled until a valid working set; empty finish → "Nothing to save".
- [ ] 🔬 **Double-tap Finish** (or header ✓ then button) → **one** workout saved, not two; button shows a spinner while saving.
- [ ] Summary: Duration · Volume · Sets (warm-ups excluded) · Exercises; **New PRs** only when you beat a best; 🔬 **Muscles worked** roughly matches the Volume tile (not doubled).
- [ ] History lists newest-first; tap → read-only session detail.
- [ ] 🔬 **Crash-safe**: log 2 sets → force-close the app → reopen → Workout tab shows **Resume** with your sets + running timer. **Discard** clears it (confirm).

---

## Phase 2 — rest timer + barbell math  (new)

### Rest timer
- [ ] Complete a **working** set (✓) → a **rest timer bar** appears at the bottom and counts down (default **1:30**); a progress fill drains.
- [ ] **-15 / +15** adjust the time; **Skip** clears it. At **zero** a haptic fires and the bar disappears.
- [ ] Completing a **warm-up** set does **not** start the timer.
- [ ] 🔬 The timer shows the **right time immediately** — no brief flash of an inflated number (e.g. it starts at 1:30, not 6:30).
- [ ] 🔬 Finish a workout, start a **new** one → **no phantom timer bar / stray haptic** on the fresh workout.
- [ ] Background the app for ~20s during a rest → return → the countdown reflects **real elapsed time** (uses an absolute end time).
- [ ] Screen **stays awake** during the workout (set the phone down mid-set; screen doesn't sleep on its normal timeout).

### Plate calculator (barbell exercises)
- [ ] On a **barbell** exercise, tap the **scale icon** in the card header → sheet opens, pre-filled with the current/last weight.
- [ ] Change **Target** and **Bar** (20 / 15 / 10 kg) → the **per-side** plate stack updates (e.g. 100 kg on a 20 kg bar → `20 · 20`).
- [ ] Non-achievable target (e.g. **101** kg) → shows **"Closest achievable: 100 kg"**.
- [ ] Target ≤ bar → "Just the bar — no plates needed." Non-barbell exercises have **no** scale icon.

### Warm-up calculator
- [ ] Tap **Warm-up** on an exercise with a working weight (entered or from PREVIOUS) → **W rows prepend** at ~40/60/80%, rounded to the exercise's increment.
- [ ] With no working weight yet → tap Warm-up → prompt to "set a working weight first".
- [ ] 🔬 The generated warm-ups are always **below** the working weight (a light lift like 3 kg doesn't produce 2.5/2.5/2.5 — duplicates/over-weight steps are dropped).
- [ ] 🔬 After adding warm-ups, the **working** rows keep the correct PREVIOUS + numbering (warm-ups sit above them).

### Swipe-to-delete + undo
- [ ] **Swipe a set row left** → a red **Delete** appears → tap it → the set is removed.
- [ ] An **"Set removed · Undo"** snackbar shows for ~4s; **Undo** restores the set in place; it auto-dismisses otherwise.
- [ ] 🔬 Delete a set, then (within 4s) tap **Warm-up** → the undo snackbar goes away (no misplaced restore).
- [ ] 🔬 Delete a set, then **remove the whole exercise** → snackbar clears (no dead "Undo").
- [ ] Swiping/tapping still lets you scroll the list and edit KG/REPS normally.

### Warm-up-only guard
- [ ] 🔬 Add **only** warm-up sets (no working set) → **Finish stays disabled** ("Log a set to finish") — you can't save an empty (warm-up-only) session.

---

## Phase 3 — history calendar + repeat/delete  (needs v0.4.0)

### Calendar + streak (History tab)
- [ ] Above the feed: a **Week streak** tile (consecutive weeks with ≥1 workout) + a **Rest days** tile (days since last workout).
- [ ] 🔬 A rest day or two does **not** break the week streak; a fully blank week does; the current not-yet-trained week doesn't break it.
- [ ] A **"Last 13 weeks"** heatmap shows trained days shaded by volume; empty (no workouts) hides the streak/heatmap and shows the empty state.

### Repeat a workout
- [ ] Open a past workout (History → tap) → **Repeat this workout** → a new active workout opens pre-filled with the same exercises + set counts and PREVIOUS values.
- [ ] 🔬 With a workout already in progress, Repeat warns "Finish your current workout first" (and 🔬 after a **cold start**, tapping Repeat without visiting Workout still detects an in-progress draft — it doesn't silently wipe it).

### Delete a workout
- [ ] On a past workout → **Delete workout** → confirm → it's removed and History no longer shows it (Home stats update too).

### Finish flourish
- [ ] The finish screen's hero shows a playful line, e.g. *"That's about a grand piano."* (scales with total volume).

## Phase 4 — library + custom exercise + exercise detail + bodyweight + export  (needs v0.5.0)

### Exercise library (Workout tab → "Exercise library")
- [ ] Workout tab (no active workout) shows an **"Exercise library"** button → opens the library.
- [ ] **Search** matches on name **and** aliases (e.g. Hindi/Hinglish alias finds the exercise).
- [ ] **Two chip rows** filter independently: **muscle** (All muscles + each group) and **gear/equipment** (All gear + each type); combining both narrows correctly; tapping a selected chip clears it.
- [ ] A **"Recent"** section lists recently-used exercises at the top (only when no search/filter is active); tapping a row opens its detail.
- [ ] Empty search (no match) shows the empty state; the **"New exercise"** button stays reachable.
- [ ] 🔬 Close (X) returns to the Workout tab (not stuck).

### Custom exercise (library → "New exercise")
- [ ] Create with name + primary muscle + equipment (+ optional secondary muscles, compound/isolation, increment) → **Save** opens the new exercise's detail.
- [ ] Save is **disabled** until name + primary muscle + equipment are all set.
- [ ] Picking equipment sets a sensible default **increment** (machine 5, bodyweight 1, else 2.5); you can override it.
- [ ] Secondary-muscle chips **exclude** the chosen primary muscle.
- [ ] 🔬 Exact-name duplicate (e.g. "Bench Press (Barbell)" already exists) → "Already in your library" with an **Open it** option.
- [ ] 🔬 A distinct name that merely *contains* an existing one (e.g. **"Bulgarian Split Squat"** with "Squat" present) is **allowed** (not falsely blocked).
- [ ] 🔬 Double-tap Save → created **once**.

### Exercise detail (tap any exercise)
- [ ] The progress chart has a **metric switcher** — **Weight / Volume / e1RM / Best set** chips swap the line (colour changes; volume/best-set use compact axis labels).
- [ ] A **Records** card shows **Heaviest weight** (with reps) + **Best est. 1RM**, then a **Set records** ladder (heaviest weight at each rep count, reps ascending).
- [ ] 🔬 Tapping any record row (PR or set-record) opens **that record's session** (read-only detail).
- [ ] 🔬 A bodyweight movement (Pull Up / Plank) shows a **flat/empty** Best-set + no Set-records ladder (no weight to plot) — not a crash.
- [ ] An exercise with no history still shows the "No sets logged yet" empty state (no Records card).

### Body weight (Progress tab → scale icon, top-right)
- [ ] The **scale icon** in the Progress header opens the Body-weight screen.
- [ ] Type a weight → **Log weight** → it appears in the trend + History list; logging again the **same day overwrites** (one entry per day).
- [ ] 🔬 Invalid input (empty / 0 / letters) → "Enter a weight" alert, nothing logged.
- [ ] Trend line + current weight + all-time delta pill render once ≥2 entries exist; with 0 entries an empty state shows.

### Export (Settings/Profile → Backup & restore → "Export workouts (Excel)")
- [ ] Tap **Export workouts (Excel)** → the OS **share sheet** opens with a `.xlsx` file → send to Drive/Gmail/Files.
- [ ] The file opens in Excel/Sheets: **one row per set**, readable headers (Date, Exercise, Weight (kg), Reps, …), warm-ups marked "Warm-up".
- [ ] 🔬 On a freshly **wiped** app (Reset demo data first) → Export shows **"Nothing to export"** and does **NOT** open a share sheet over a blank file.

## Cross-cutting
- [ ] **Offline**: Airplane mode, no account → do all of the above end-to-end; Progress + Coach (localCoach) still work. **Library, custom exercise, exercise detail, bodyweight log, and Excel export all work with zero network** (export share is a local file, no upload).
- [ ] **Regression**: Coach chat still logs a workout by text (e.g. `bench press 80 kg 8 7 6`) → appears in History; Progress tab + Settings → Reset demo data still work.

---

## Deferred — NOT bugs (coming later)
- **Background/lock-screen** rest-timer notification (needs `expo-notifications` + an `android/` regen) — the timer is **foreground-only** for now.
- No per-exercise **custom** rest duration or a Settings control yet (default 1:30; adjust live with ±15).
- No **drop/failure** set types, **RPE**, or **supersets** (later). No **routine editor** yet (Phase 5) — "Start from plan" uses the seeded plan.
- **Library / custom exercises / exercise-detail switcher / bodyweight / Excel export** landed in **Phase 4 (v0.5.0)**. Units are **kg-only**. The library is reached from the Workout tab (no dedicated tab — the 5 tabs are taken).
- **"Migrate from Hevy" import** is **NOT in v0.5.0** — it's the next release (v0.6.0): pick a Hevy `.xlsx` → parse → clear-then-import. Coming next.
