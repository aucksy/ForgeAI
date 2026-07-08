# ForgeAI Manual Tracker — Test Checklist

Running list of things to verify on device. Install the APK after **uninstalling any older
ForgeAI** (debug-signed builds won't install over each other). 🔬 = an edge case a review fixed —
worth an extra look. Everything must also work **offline / no account**.

> Build to test both phases: **v0.3.0** (Phase 1 + Phase 2). Phase 1 alone shipped as v0.2.0.

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

## Cross-cutting
- [ ] **Offline**: Airplane mode, no account → do all of the above end-to-end; Progress + Coach (localCoach) still work.
- [ ] **Regression**: Coach chat still logs a workout by text (e.g. `bench press 80 kg 8 7 6`) → appears in History; Progress tab + Settings → Reset demo data still work.

---

## Deferred — NOT bugs (coming later)
- **Background/lock-screen** rest-timer notification (needs `expo-notifications` + an `android/` regen) — the timer is **foreground-only** for now.
- No per-exercise **custom** rest duration or a Settings control yet (default 1:30; adjust live with ±15).
- No **drop/failure** set types, **RPE**, or **supersets** (later). No **routine editor** yet (Phase 5) — "Start from plan" uses the seeded plan.
- No **calendar/streak/repeat** in History yet (Phase 3), no **exercise library tab / custom exercises / export** yet (Phase 4). Units are **kg-only**.
