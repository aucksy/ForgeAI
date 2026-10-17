# ForgeAI: every user task, and the automatic tests that cover it (17 Oct 2026)

Read-only inventory, built from the code at `D:\Apps\ForgeAI\Codebase` and the tests as they stand on
17 Oct 2026 night. Nothing was run to make it. Five research passes read the code (workout loop;
member data and settings; gym side and server; admin app; watch). I then checked the new UAT work on
disk and folded it in as **covered (new)**.

## How to read it

**LEVEL** column: one word per task, used for the counts.

| LEVEL | Meaning |
|---|---|
| `SCREEN` | A test drives the real screen today: it taps the control and checks the result. Phone: Maestro on an Android 14 emulator. Admin: none existed before WP5. |
| `SCREEN-NEW` | **Covered (new)** on a real screen by UAT work: WP4 phone parts `uh ur un ud ue j3r` (in the whole phone run), WP5 admin journeys (`apps/dashboard/e2e`, CI), or WP6 cross-role journeys (`qa-journeys.yml`, both apps plus the live server). |
| `LOGIC` | Only logic is tested: vitest (Node, nothing drawn), SQL tests (server only), Kotlin JVM tests, or notification flags. Includes "the screen is opened but the action is never pressed". |
| `LOGIC-NEW` | **Covered (new)**, logic or server only: WP1/WP2 SQL (`uat_money.sql`, `uat_access_matrix.sql`, `uat_shop_orders.sql`), WP3 (`0021_receipt_rules.sql`), WP8 watch (`test/tracker/watchBridge.test.ts`, plus the new `BridgingTest.kt` / `WearWireTest.kt`). |
| `NONE` | Nothing tests it. A crawl that only opens the page counts as NONE. |
| `HIDDEN` | Behind a switched-off feature flag (`FEATURES = { coach: false, nutrition: false, gymSync: false }`). Listed, not counted. |

**RISK**: H = money, losing data, privacy, or the main workout loop. M = important but recoverable.
L = cosmetic or rare.

**Coverage names**:
- `maestro <part> / <file>.yaml`: a phone test part from `apps/mobile/qa/run-device-qa.sh`.
- `vitest <file>`: `apps/mobile/test/...` or `apps/dashboard/test/crm/...`.
- `crawl`: `apps/dashboard/scripts/crawl.mjs`.
- `sql <file>`: `supabase/tests/<file>.sql`.
- `e2e Jn`: a WP5 admin journey in `apps/dashboard/e2e/*.spec.mjs`.
- `XJn`: a WP6 cross-role journey.

### Facts that shape every row
- **Phone run:** API 34 only, network always on, every permission granted unless a part says otherwise. "Offline" is never covered on a phone. The WP7 phone-conditions work (offline, kill, upgrade) is still being built. No `qa-conditions.yml` is on disk yet.
- **Opt-in phone parts:** `dnd`, `longrest`, `anim` and `mk` do not run in a default whole run. Rows that rely on them say "(opt-in)".
- **Release gate (`phone_gate.py`):** needs a whole API 34 run on both phone profiles (default, and owner at 360 dp, font 1.3, Kolkata) plus the cross-role journeys. Both workflows are manual-only.
- **Admin before WP5:** nothing drove a form. The crawl taps only "Start demo", then opens 22 pages with every server call faked.
- **WP5 admin journeys:** real taps on a 390 × 844 phone in CI, but against a **pretend server** (`e2e/support.mjs`). STATUS: 17 journeys, all pass.
- **WP5b admin journeys (17 Oct night, new):** 21 more (J13–J28) in the same suite and CI step, for the admin rows of the top 25, WP10's fixed clocks (J27a/b) and a no-web-font layout check (J28). Two phones on one pretend server where a journey needs a second person or device. All 21 pass (J23c was fixme until U-A13 was fixed). CI 38990116806 green (38 journeys, 1.1 min). Rows they close say **covered (new, WP5b)**.
- **WP6 cross-role journeys:** use the **live server** and both real apps. Green twice (runs 38971884985 and 38975863786).
- **WP4 phone parts** (`uh ur un ud ue`, plus `j3r`): wired into the whole run after part M. STATUS still says "RUNNING", so I have not seen them green in a run log [unverified].
- **`0021_receipt_rules.sql`:** passes in CI, but migration 0021 is **not live yet**. STATUS says the owner must approve applying it.
- **Code already changed since the earlier audits:**
  - The printed receipt now shows "Received by" (`Receipt.tsx:318`).
  - Settings → Your gym now shows the joined gym's name (`settings/gym.tsx:43`).
  - The watch now always buzzes itself (U-W1).
  - `wear-build.yml` now also runs on pushes that touch the watch, and `release-apk.yml` runs the watch tests.

---

## 1. Member (phone app)

Sub-cases:
- **Solo user (no gym):** the Shop tab is a join card plus a sample shop. A check-in poster says "Join <gym> first". Erasing names no gym.
- **Gym member:** sees the gym's real shop, server orders, the bell and inbox, gym colours and QR check-in. Erasing names the gym and leaves it. Rows that differ say so.

### 1.1 First run and demo
| ID | Task | Screen / route | Key states and variants (not covered in brackets) | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-01 | First launch: name, kg or lb, goal, experience → Start training | Welcome (drawn by the root layout) | Happy path in kg (empty-name error, lb pick, Back between steps, save failure) | maestro W1 / real-workout-w1.yaml (drives); A / phase1-a.yaml (fields); vitest welcomeSteps, form, onboardingStore, unitsScreens | SCREEN | M |
| M-02 | "Coming from Hevy?" → the import opens by itself after Start | Welcome → import | From Hevy (From Strong; clearing the pick) | **maestro UE / uat-e.yaml step 2 (drives; W1 accepted a detour)** | SCREEN-NEW | M |
| M-03 | Load demo on a clean install | Welcome "Load demo?" | Clean install (load failure) | maestro A / phase1-a.yaml, gate-demo.yaml; vitest dataActions, demoSandbox | SCREEN | M |
| M-04 | Load demo when own workouts exist (the warning names them) | Welcome "Load demo data instead" | Warning checked, then cancelled (confirming it) | **maestro UD / uat-d.yaml** | SCREEN-NEW | H |
| M-05 | Remove demo data; own workouts stay | Settings → Your data | One own workout kept; welcome says "Your 1 workout is still here" (failure "Nothing was changed") | **maestro UD / uat-d.yaml**; vitest demoRemovalKeeps, demoRemovalLeave | SCREEN-NEW | H |
| M-06 | Hidden sales switch: hold 2 s → "Replace with demo" | Settings → Your data | Warning names own workouts, cancelled (confirm) | **maestro UD / uat-d.yaml** | SCREEN-NEW | H |
| M-07 | Start-up failure: "Try again" / "Save my data file" | Boot error screen | Storage full, failed upgrade step, database won't open | vitest startup, saveDataFile, test/db/migrations; phone part UB (whole runs 17 Oct, both phones) | SCREEN-NEW | H |
| M-08 | Reopen after the app was killed: lands in the app, never the welcome | Root layout | Every relaunch; after a reinstall (part M) | maestro M / backup-m-after.yaml (drives), most parts pass by; vitest onboardingStore | SCREEN | H |
| M-09 | Stale or mistyped forgeai:// link, or an old /history link → calm "That link didn't work" | +not-found | — | vitest linkNotice, redesignR5 | LOGIC | L |
| M-10 | Invite or poster link opened before setup is kept and opens after Start | _layout pending link | Kept 7 days | vitest c6S3 (C6-7), invite, checkIn | LOGIC | L |

### 1.2 Start a workout
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-11 | Start today's routine from the Up next card | (tabs)/workout.tsx UpNextCard | Demo plan, followed plan, 500-workout history, easy week ("Done today → Start next" tap, empty app, offline) | maestro A / phase1-a.yaml, W2 / real-workout-w2.yaml (drive); DND, LONGREST, ANIM (opt-in); vitest upNext, todayPlan, homeStart, db/upNextReal | SCREEN | H |
| M-12 | Preview the day first (Today page) | today.tsx | Open and back ("Change this routine", no-plan state) | maestro A, J / v0280-j.yaml (drive); vitest todayPlan, db/todayReal | SCREEN | M |
| M-13 | Start an empty workout | WorkoutRoutines | Hidden while a workout is open | maestro C, E, F, H1, I, J, P9, P7 (drive); vitest db/realRepos | SCREEN | H |
| M-14 | Start a routine from its card or preview | WorkoutRoutines, routines/view/[id] | Normal, easy week (an empty routine opens the editor) | maestro G / v0260-g.yaml, J3 / j3-workout-drag.yaml, L / v0290-l.yaml (drive); vitest db/routinesHevyReal | SCREEN | H |
| M-15 | Start while a workout is open: Resume / Discard and start new | askAboutOpenWorkout | Both branches; the question names the sets it would delete | **maestro UR / uat-r.yaml step 6 (drives)**; vitest phase2PacketE LW-24 | SCREEN-NEW | H |
| M-16 | A double tap never opens two workout screens | workout tab, active.tsx | — | vitest phase2PacketE RP-25, phase2ReviewFixes; MK random taps (opt-in) | LOGIC | M |
| M-17 | First workout asks for notification permission | active.tsx | Allow (refusing: see M-47) | maestro A (optional "Allow") | SCREEN | M |

### 1.3 Log sets
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-18 | Add exercises (search, select, "Add N") | session/add-exercise | "Add 1" only (several at once, Equipment/Muscle filters) | maestro C, E, F, H1, I, P9, P7 (drive); vitest phase2PacketE LW-15, exerciseSearchEveryday | SCREEN | H |
| M-19 | Create an exercise from inside a workout | library/new (forWorkout) | Distance in metres (duplicate name) | maestro J / v0280-j.yaml (drives); vitest phase4Exercises EX-08, v0280 | SCREEN | M |
| M-20 | Log weight × reps and tick (a blind tick saves the grey hint) | SetRow | kg, lb, 360 dp + font 1.3 (blank weight: logic only) | maestro A, H1, I (lb), W3 (drive); vitest packetBTicks, draftSets, db/packetBCards, known-defects/top-defects | SCREEN | H |
| M-21 | Untick a set; the typed values are kept | SetRow | — | **maestro UR / uat-r.yaml step 5 (drives)**; vitest phase2RestTimer RT-03 | SCREEN-NEW | H |
| M-22 | Add a set | ExerciseLogCard | — | maestro F, H1, P9, W3 (drive) | SCREEN | M |
| M-23 | Remove a set (menu "Remove set" or swipe Delete), then Undo | SetRow, SetTypeSheet | Both ways, each undone | **maestro UR / uat-r.yaml step 5 (drives)**; vitest auditC1LiveWorkout C1-13 | SCREEN-NEW | H |
| M-24 | Change set type: Warm-up / Drop / Failure / Normal | SetTypeSheet | Drop driven (Warm-up and Failure picks) | maestro W3 / real-workout-w3.yaml (Drop); vitest auditC1LiveWorkout C1-3/C1-7, auditC4Import | SCREEN | H |
| M-25 | Log a drop set (rest starts after it) | SetRow (drop) | No earlier drop (PREVIOUS from an earlier drop: logic only) | maestro W3 (drives); vitest auditC1LiveWorkout C1-7, db/auditC4ImportReal | SCREEN | H |
| M-26 | Warm-ups: tick one (rest starts; PREVIOUS shows last warm-ups); "Add warm-up sets" | SetRow, card menu | Ticks driven ("Add warm-up sets" menu) | maestro W2, W3 (drive); vitest warmupMath, warmupPrevious, db/warmupPreviousReal | SCREEN | H |
| M-27 | RPE: one tap saves and ticks; change; Clear | RpeSheet | RPE 8 (change, Clear) | maestro W3 (drives); vitest previousRpeLayout, auditC1LiveWorkout C1-6 | SCREEN | M |
| M-28 | Superset: no rest after the first exercise, rest after the round | SupersetSheet | Make one (join existing, remove, move) | maestro W3 (drives); vitest phase2PacketE LW-26, dropCard, offlineTick | SCREEN | H |
| M-29 | Timed set (stopwatch, countdown, Keep/Discard) | HoldTimerSheet | Stopwatch (countdown ±15 s, Keep/Discard on Back) | maestro C / phase2-c.yaml (drives); vitest phase2PacketE LW-18, phase2Types | SCREEN | M |
| M-30 | Distance + time, assisted, bodyweight, dumbbells "kg each" | SetRow, Counting sheet | — | maestro C, F / v0251-f.yaml (drive); vitest phase2Types, setCounting, db/targetsReal | SCREEN | M |
| M-31 | Entry bar: +2.5/+5, +1 rep, "Copy to sets below" | EntryBar | kg and lb (minus step, Undo copy) | maestro P9 / phase9-p.yaml (drives); vitest entryBar | SCREEN | M |
| M-32 | PREVIOUS column and "Last: <day> · <routine>" | SetRow | Any workout (Same routine / Same folder: logic only) | maestro L, W2 (check values); vitest previousSource, db/previousSourceReal, db/historyScopeReal | SCREEN | H |
| M-33 | Target line: "Tap for why", "Switch to easier/harder" | ExerciseLogCard | Why (Switch to) | maestro A (drives); vitest progression, packetCTargets, db/targetsReal | SCREEN | M |
| M-34 | Record pop-ups (heaviest, most reps, best pace); none for a lighter set or an easy week | RecordToast | (× close) | maestro A, E, F, G, W3 (drive); ANIM (opt-in); vitest phase3Records, repRecords, db/repRecordsReal | SCREEN | M |
| M-35 | Typo question ("300 kg … Keep it?"): Keep / Fix | SetRow | Keep tapped only if shown; the question is never asserted (Fix) | vitest auditC1LiveWorkout C1-14, known-defects/top-defects | LOGIC | M |
| M-36 | Exercise note in a live workout | card menu | — | vitest db/historyScopeReal | LOGIC | M |
| M-37 | Per-exercise rest length ("Remembered for next time") | RestPickerSheet | — | maestro A, H1, H2, W2, W3 (drive) | SCREEN | M |
| M-38 | Plate calculator | PlateCalcSheet | — | vitest plateMath, plateSetup | LOGIC | L |
| M-39 | Move an exercise up or down from its menu | card menu | — | vitest phase2PacketE LW-12 | LOGIC | M |
| M-40 | Hold and drag an exercise in a live workout; the order is kept | DragList (active.tsx) | Order read after the drag, and **again after a restart (new)** (kept through Finish; dragging into or out of a superset) | maestro J3 / j3-workout-drag.yaml + **J3R / uat-j3-resume.yaml**; vitest dropCard | SCREEN | M |
| M-41 | Swap an exercise for this workout | SwapSheet | Before any tick (after a tick: logic) | maestro G (drives); vitest phase2PacketE LW-31, db/phase2ReviewReal | SCREEN | M |
| M-42 | Remove an exercise (with confirm) | card menu | (Cancel) | maestro B / phase1-b.yaml (drives) | SCREEN | H |

### 1.4 Rest timer
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-43 | Rest starts after a tick; Skip rest | RestTimerBar | — | maestro A, C, E, F, H1, W2, W3 (drive); vitest workoutPhase1 | SCREEN | H |
| M-44 | −15 / +15 inside the app | RestTimerBar | — | vitest phase2RestTimer RT-04 | LOGIC | M |
| M-45 | Rest runs out with the app open | RestTimerBar | Sound: logic only | maestro H2 / v0261-h2.yaml (drives); vitest auditC5RestBell | SCREEN | M |
| M-46 | "Rest is over" with the phone locked, asleep or in Doze | native rest card | Locked + Doze (A), 45 s asleep (W). DND, 2-min rest, two rests in a row, 120 s timeout: opt-in only. Android 15/16: API input, never in the gate | maestro A + notif.py, W1–W4; DND, LONGREST (opt-in); vitest restTimerExpiry, auditC5RestBell, liveCard | SCREEN | H |
| M-47 | Rest alerts with notifications refused: the bar says "Rest alerts are off" | RestTimerBar | Permission revoked by the script | **maestro UN / uat-n.yaml (drives)** | SCREEN-NEW | H |
| M-48 | "Ring through Do Not Disturb" | settings/workouts → rest card | On and off, priority DND | maestro DND / gate-rest.yaml (**opt-in**); vitest liveCard | SCREEN | M |

### 1.5 Pause, minimise, discard
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-49 | Pause / resume the workout timer | ElapsedClock sheet | Clock still for 70 s (paused across a kill) | maestro P2 / p2-pause-a.yaml + p2-pause-b.yaml (drive); vitest workoutPause, db/pauseWorkoutReal | SCREEN | M |
| M-50 | Auto-pause after an hour idle, then "Count it" | active.tsx, FinishSheet | — | vitest idlePause, auditC1LiveWorkout C1-2; phone part UA (whole runs 17 Oct, both phones) | SCREEN-NEW | H |
| M-51 | Minimise; Resume from the Up next card or the mini bar | active.tsx, UpNextCard, WorkoutMiniBar | — | maestro B / phase1-b.yaml (drives); vitest miniBar | SCREEN | H |
| M-52 | Resume after Android killed the app | hydrate | Killed process (an unreadable saved workout: logic) | maestro H2, H3C / v0371-h3c.yaml (drive); vitest db/packetBCards, hydrateFailure | SCREEN | H |
| M-53 | Discard a live workout (with confirm) | active.tsx, workout tab | ("Keep logging" cancel) | maestro J, J3 / j3-end.yaml, P7 (drive); vitest db/pauseWorkoutReal | SCREEN | H |

### 1.6 Finish and after
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-54 | Finish: sheet → save → summary | FinishSheet → session/finish | (double tap) | maestro B, C, E, F, G, I, L, P9, W4 (drive); vitest db/finishReal, finishFlow, db/writeQueue | SCREEN | H |
| M-55 | Unticked rows at Finish: Save them / Leave them out | FinishSheet | Save them (Leave them out: optional step only) | maestro C (drives); vitest finishFlow LW-03 | SCREEN | H |
| M-56 | Forgotten Finish: "Ended at …" / Now | FinishSheet | — | vitest finishFlow LW-07, phase2ReviewFixes, db/finishReal; phone part UA (whole runs 17 Oct, both phones) | SCREEN-NEW | H |
| M-57 | Name and note at Finish | FinishSheet | Default names only seen (typing a name or note) | vitest finishName, finishFlow LW-10 | LOGIC | M |
| M-58 | Finish fails or storage is full: the workout stays open, retry works | active.tsx | — | vitest db/writeQueue; phone part UF (whole runs 17 Oct, both phones) | SCREEN-NEW | H |
| M-59 | "Update routine?" → Update routine (and Keep original) | session/finish | Update: kept after a restart (new); Keep original (B) | **maestro UR / uat-r.yaml step 4 (drives Update)**; B (Keep); vitest workoutPhase1, db/routinesHevyReal | SCREEN-NEW | H |
| M-60 | Summary: records, sets per muscle, milestone, easy-week note | session/finish | — | maestro C, E, F, G (drive); vitest coachNote, phase9Goals | SCREEN | M |
| M-61 | Share the workout as a picture | ShareSheet | Reaches Android's share menu | maestro E / phase3-e.yaml, F (drive); vitest phase3Share, shareFrame, phase3PhoneReview | SCREEN | M |
| M-62 | Share the workout as text | session/finish | — | maestro P9 (drives); vitest shareText | SCREEN | M |
| M-63 | Workout photos: add (camera or gallery), remove | WorkoutPhotos | I opens and backs out (camera refused here) | vitest db/workoutPhotosReal | LOGIC | M |

### 1.7 Past workouts
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-64 | Open a past workout's page (feed, calendar search) | session/[id] | (load error, "Workout not found") | maestro N / audit3-n.yaml, R / redesign-r.yaml, W4 (drive) | SCREEN | M |
| M-65 | Rename a past workout | session/[id] NameSheet | — | maestro W4 / real-workout-w4.yaml (drives) | SCREEN | L |
| M-66 | Edit a past workout and Save changes | active.tsx (edit mode) | Kept after a restart; Discard (N) (date/time/length changes, "Can't edit this one") | **maestro UH / uat-h.yaml step 2 (drives)**; vitest db/editPast, sessionEdit, editDraft, sessionTiming | SCREEN-NEW | H |
| M-67 | Edit while a live workout is open ("Discard it and edit this one") | useWorkoutActions | — | vitest homeStart; phone part UV (whole runs 17 Oct, both phones) | SCREEN-NEW | H |
| M-68 | Log a past workout (Calendar) and Save it | LogPastSheet + editor | Empty Sunday last month | **maestro UH / uat-h.yaml step 1 (drives)**; vitest db/editPast, db/phase3ReviewFixes | SCREEN-NEW | H |
| M-69 | Delete a past workout | session/[id] menu | Calendar and Profile counts drop | **maestro UH / uat-h.yaml step 3 (drives)**; vitest db/realRepos, db/queuedWrites, db/workoutPhotosReal | SCREEN-NEW | H |
| M-70 | Repeat a workout | session/[id] menu | Row only seen | vitest db/auditC4ImportReal C4-4 | LOGIC | M |
| M-71 | Save a past workout as a routine | session/[id] menu | Row only seen | vitest db/realRepos, db/routinesHevyReal | LOGIC | M |
| M-72 | Share a past workout (picture or text) | session/[id] menu | Rows only seen | vitest phase3Share, shareText | LOGIC | L |

### 1.8 Routines and folders
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-73 | Browse folders and routines; open or close a folder | WorkoutRoutines | — | maestro G, J, R (drive) | SCREEN | L |
| M-74 | Routine preview → Edit routine | routines/view/[id] | — | maestro G, J, L (drive) | SCREEN | L |
| M-75 | Create a new routine | WorkoutRoutines → routines/[id] | G opens the folder picker and backs out | vitest phase4RoutinesPure RP-08, db/routinesHevyReal | LOGIC | M |
| M-76 | Edit a routine: name, sets/reps, warm-ups, rest, superset, note, add, remove | routines/[id], routines/add-exercise | Only "Swap for good" is driven | vitest auditC3Routines, db/auditC3RoutinesReal, db/routinesHevyReal | LOGIC | M |
| M-77 | Share a routine as text; share a folder as a file | ShareRoutineSheet | — | maestro G (drives); vitest phase4Import | SCREEN | L |
| M-78 | Move a routine to another folder | routine menu | Editor menu (the Workout tab's ⋯ "Move to folder…") | maestro G (drives); vitest phase4Folders, workoutTabR4 | SCREEN | M |
| M-79 | Move a routine up or down (changes Up next in a followed folder) | tab ⋯ | Menu only seen | vitest workoutTabR4 | LOGIC | M |
| M-80 | Hold and drag a routine | DragList | Order read back, dragged back (kept after a restart) | maestro J2 / v0400-j2.yaml + adb drag; vitest dragOrder | SCREEN | M |
| M-81 | Duplicate a routine | tab ⋯, editor | — | vitest db/auditC3RoutinesReal | LOGIC | L |
| M-82 | Delete a routine | tab ⋯, editor | — | vitest db/realRepos, db/queuedWrites | LOGIC | M |
| M-83 | Folders: new, rename, delete, move, add a routine | tab ⋯ | Menu only seen | vitest phase4Folders, workoutTabR4 | LOGIC | M |
| M-84 | Follow / stop following a folder | folder ⋯ | Follow (Stop following) | maestro G (drives); vitest phase4Folders, db/upNextReal | SCREEN | M |
| M-85 | Import a shared routine file | Explore → file picker | — | maestro G (drives); vitest phase4Import | SCREEN | M |

### 1.9 Plans and programs
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-86 | Follow a ready program | programs/index, programs/[key] | ("Add to my routines", update existing folder) | maestro G (drives); vitest phase4Plans | SCREEN | M |
| M-87 | Build a plan (5 steps, sore spots, leave out exercises, swap, save and follow) | plan/build, plan/avoid | ("Save" without following, "Change answers") | maestro G (drives); vitest phase4Plans, phase4Effort | SCREEN | M |
| M-88 | Easy weeks: switch on, take one now, easy workout, train normally | folder ⋯, UpNextCard | (early easy week after stalled lifts) | maestro G (drives); vitest phase4Folders, phase4Review, phase4Stall | SCREEN | M |
| M-89 | Up next moves on after a finish | UpNextCard | — | maestro L (drives), G; vitest upNext, db/upNextReal, routineRebuild | SCREEN | H |
| M-90 | Weekly goal (− / + stepper → "This week: N of 3") | settings/workouts | — | maestro P9 (drives); vitest phase9Goals | SCREEN | L |

### 1.10 Exercises and library
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-91 | Search the library (plurals, no space) | exercises.tsx | (filters) | maestro C (drives); vitest exerciseSearchEveryday, exerciseSearchSpeed | SCREEN | M |
| M-92 | Exercise demo sheet | ExerciseDemoSheet | — | maestro C (drives) | SCREEN | L |
| M-93 | Exercise page: Summary / History / How to; a chart point stays after a tap | exercise/[id] | (Easier/Harder links) | maestro C, E, F, I, R, W4 (drive); vitest redesignR5, phase4Exercises | SCREEN | M |
| M-94 | Create a custom exercise | library/new | (edit, own photo/video, duplicate name) | maestro C (drives); vitest phase4Exercises, exerciseMerge | SCREEN | M |
| M-95 | Hide an exercise; show it again from Hidden | exercise/[id], library/hidden | — | vitest exerciseMerge EX-02 | LOGIC | L |
| M-96 | Merge an exercise into another (moves its history) | exercise/[id] | — | vitest exerciseMerge EX-02, phase8Records; phone part UG (whole runs 17 Oct, both phones) | SCREEN-NEW | H |
| M-97 | Start records fresh / count all records again | exercise/[id] | — | maestro P9 (drives); vitest recordStart | SCREEN | M |
| M-98 | Records page ("See all N records") | records.tsx | — | maestro D / phase3-d.yaml (drives); vitest phase3Numbers | SCREEN | L |

### 1.11 Workout settings
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-99 | Track RPE | settings/workouts | On | maestro W1 (drives); vitest previousRpeLayout | SCREEN | M |
| M-100 | Default rest | settings/workouts | — | vitest phase2RestTimer, restTimerExpiry | LOGIC | M |
| M-101 | Workout sounds | settings/workouts | Seen only | vitest auditC5RestBell | LOGIC | M |
| M-102 | Weight jumps / rep range | settings/workouts | — | vitest targetSettings, db/targetSettingsReal | LOGIC | M |
| M-103 | Previous values: Any workout / Same routine / Same folder | settings/workouts | Only "Any workout" tapped | vitest historyScope, db/historyScopeReal | LOGIC | M |
| M-104 | Plates and bars | settings/plates | Plate off, standard set back (bar choice) | maestro P1 / p1-plates.yaml (drives); vitest plateSetup | SCREEN | L |

### 1.12 Phone surfaces: notification cards, widget, shortcuts
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-105 | "Complete set" on the live card in the shade | native live card | App process killed (app alive; a row with nothing to save) | maestro H3A/B/C / v0371-h3*.yaml + notif.py (drive); vitest liveCard, offlineTick | SCREEN | H |
| M-106 | Rest card buttons: Done, +15 s, Skip | native rest card | App backgrounded (H1, H1D), killed (Skip, H2) (Done after a kill; "Add reps first") | maestro H1 / v0261-h.yaml, H1D / v0261-h1d.yaml, H2 (drive); vitest restCard, restDone | SCREEN | H |
| M-107 | Tap the notification to get back into the workout | shade | — | maestro B0 / phase1-b0.yaml, W3, W4 (drive); vitest oneNotification | SCREEN | H |
| M-108 | One workout notification at a time | shade | — | maestro A, H, H3, W via notif.py; vitest oneNotification, notifAudit | SCREEN | M |
| M-109 | Place the Today widget; its count line updates | settings/widgets, home screen | ("Add This week") | maestro I / v0270-i.yaml (drives) | SCREEN | L |
| M-110 | Start or Resume a workout from the widget (keyed tap) and app-icon shortcuts | widget, workout/start, launcher | Keyless links start nothing (link part drives that). The real keyed tap, "Start X?" and shortcuts are never tapped | maestro link / phase6-link.yaml (keyless only), P9 (shortcuts exist); vitest phase6PhoneA, widgetNative, phase9Shortcuts; phone part UK (whole runs 17 Oct, both phones) | SCREEN-NEW | H |
| M-111 | "This week" widget | widget | — | vitest phoneFeatures | LOGIC | L |

### 1.13 Profile, history, statistics
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-112 | Profile header: Workouts, Weeks in a row, Records, bio and link | (tabs)/profile | Demo, imports, ~500 workouts on a Monday the 1st (0 workouts, bio/link tap) | maestro A, N, R, W1 (check values); vitest db/historyChartReal, history | SCREEN | M |
| M-113 | History chart: chips, three ranges, tap a bar, back to the total | Profile | Every chip and range, 3 years, lb (empty chart, load failure) | maestro R, W1, W4 (drive); vitest historyChart, auditC2Numbers | SCREEN | M |
| M-114 | Share this month as a picture from the Profile | Profile → share sheet | Seen only | vitest phase3Share, shareFrame, shareMark | LOGIC | M |
| M-115 | Scroll the Workouts feed (month lines, dates with year) | Profile feed | First page (second page of years, failed page) | maestro N (checks), P7; vitest db/historyFeed (509 workouts paged) | SCREEN | M |
| M-116 | Edit profile: name, bio, link (saves as you type) | edit-profile | Opened, nothing typed | vitest profileAutosave | LOGIC | M |
| M-117 | Profile photo: take, choose, remove | edit-profile sheet | (camera denied here) | vitest profilePhoto | LOGIC | M |
| M-118 | Your details: mobile (remove with Undo), gym name, goal, age, height | settings/details | Never opened | vitest profileAutosave, form | LOGIC | M |
| M-119 | Statistics, last 7 days: body map, tap a muscle | stats | Female figure, Monday the 1st ("No workouts yet") | maestro D, F, W1 (drive); vitest statisticsAudit, r3Screens, statSessions | SCREEN | M |
| M-120 | Sets per muscle group: range, groups | stats | Scrolled into view only | vitest statisticsAudit, r3Screens | LOGIC | L |
| M-121 | Muscle distribution by period | stats | 12-month chip (other periods) | maestro D (drives); vitest statisticsAudit | SCREEN | L |
| M-122 | Main exercises and Records → See all | stats, records | — | maestro D (drives See all); vitest phase3Records | SCREEN | L |
| M-123 | Strength score; "add body weight" opens Measures | stats | — | vitest engine/strength | LOGIC | L |
| M-124 | Monthly report and its share picture | report/[period] | Share options (final hand-off, month arrows, "so far") | maestro D (drives); vitest phase3Progress, compareTiles, phase3Share | SCREEN | M |
| M-125 | Year in review | report/YYYY | (year share, arrows) | maestro D (drives) | SCREEN | L |
| M-126 | Calendar: streak, rest days, Month and Year views | calendar | (earlier years, new member's card) | maestro N, R (drive); vitest r3Screens, db/historyFeed | SCREEN | M |
| M-127 | Calendar: tap a day to open its workout | calendar | Opened again after the restart in UH [unverified that it taps the day cell] | **maestro UH / uat-h.yaml**; vitest db/historyFeed | SCREEN-NEW | M |
| M-128 | Calendar search across years | calendar | "legs old" finds 2024 ("No results") | maestro N (drives); vitest db/historyFeed, historyView | SCREEN | M |
| M-129 | Pick any lift's trend | progress/pick-lift | Unreachable today (no screen opens it) | NONE | NONE | L |

### 1.14 Body: weight, measurements, photos
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-130 | Log today's body weight (765 kg typo → "Keep it") | measures/add | kg ("Fix it", lb, failed save) | maestro D (drives); vitest auditPhase5Body, r3Screens | SCREEN | M |
| M-131 | Fix a weigh-in typo | measures | Value (day change) | maestro D (drives); vitest auditPhase5Body | SCREEN | M |
| M-132 | Delete an entry, then Undo | measures | Driven for a waist entry (a weigh-in's delete only seen) | maestro D (drives); vitest auditPhase5Fixes | SCREEN | M |
| M-133 | Log for an earlier day that already has a value ("Replace?", Undo) | measures/add | — | vitest auditPhase5Fixes | LOGIC | M |
| M-134 | Log measurements and see a measure's graph | measures/add, measures | Three values (inches, "Check the numbers") | maestro D (drives); vitest phase3Progress | SCREEN | M |
| M-135 | Add a picture inside the "+" form | measures/add | — | NONE | NONE | L |
| M-136 | Old body-weight and Measurements pages, "Show older" | bodyweight, measurements/* | Old links only | vitest auditPhase5Body, auditPhase5Fixes | LOGIC | L |
| M-137 | "Log body weight" app-icon shortcut | launcher → Measures | Exists only (never tapped) | maestro P9 (dumpsys); vitest phase9Shortcuts | LOGIC | L |
| M-138 | Add progress photos from the gallery (undated asks the day) | photos | Two sample pictures | maestro D (drives); vitest photoGrid | SCREEN | M |
| M-139 | Take a progress photo with the camera allowed | photos | The emulator has no camera | NONE | NONE | M |
| M-140 | Camera refused → "Camera not allowed" and the way round | photos | Android's question answered "Don't allow" | maestro P0 / p0-permissions-off.yaml (drives); vitest permissionRefusal | SCREEN | M |
| M-141 | Photo viewer: zoom, change date, save to gallery, delete | photos | (Delete photo) | maestro D (drives the rest) | SCREEN | M |
| M-142 | Compare two photos | photos/compare | (deleted photo) | maestro D (drives) | SCREEN | L |

### 1.15 Import and export
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-143 | Import 3 years of Hevy history (~500 workouts), Merge | import | Big file on a fresh install | maestro W1 (drives); vitest hevyImport, hevyImportRun, hevyCsvDates, importWriteEquivalence | SCREEN | H |
| M-144 | Re-import the same Hevy file ("All 12 are already here") | import | "From Hevy" folder updated, no second folder | maestro J (drives); vitest reimport, routineRebuild | SCREEN | H |
| M-145 | Import an older Strong file over the demo (asks kg or lb) | import?from=strong | lb, name typed (newer Strong file, empty name refused) | maestro I (drives); vitest strongImport, demoSandbox | SCREEN | H |
| M-146 | A Strong file picked through "Import from Hevy" is read as Strong | import | — | maestro I (drives); vitest phase4ImportsC | SCREEN | L |
| M-147 | Import with Replace ("Delete N workouts first?") | import | Over one own workout; the warning names it | **maestro UD / uat-d.yaml + uat-d-hevy-replace.yaml (drives)**; vitest importSafetyCarry | SCREEN-NEW | H |
| M-148 | Undo import | import done step | "Import undone", Profile count back | **maestro UD / uat-d.yaml (drives)**; vitest importSafetyCarry | SCREEN-NEW | H |
| M-149 | Date-order question and "Rows left out" | import | — | vitest phase4ImportsC, phase4ReviewRound2, hevyCsvDates | LOGIC | M |
| M-150 | Names new to ForgeAI ("Same as ForgeAI's …?") | import, routine steps | Routine steps (history import [unverified]) | maestro L, J (drive); vitest db/importsPacketCReal | SCREEN | M |
| M-151 | Share an export file to ForgeAI from the Files app | import?file= | Already-imported file (a file that is neither Hevy nor Strong) | maestro K / v0280-k.yaml (drives); vitest v0280 | SCREEN | M |
| M-152 | Leave while an import is running | import | — | NONE | NONE | M |
| M-153 | Import routines from a Hevy share link | import/routines | 6-routine folder, live hevy.com (offline, bad link, "Only 4 of 6") | maestro L (drives); vitest v0290, db/importsPacketCReal | SCREEN | M |
| M-154 | Save my history (a file to keep or share) | settings/export | The script reads the shared file (12 workouts) | **maestro UD / uat-d.yaml (drives)**; vitest historyExport | SCREEN-NEW | H |
| M-155 | Save my measurements | settings/export | — | vitest measurementsExport | LOGIC | M |

### 1.16 Backup, restore, erase
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-156 | Restore after uninstall and reinstall (Android backup) | Settings → Backup | Workout count only, maybe a forced restore (units, profile, measurements, routines back) | maestro M / backup-m-record.yaml + backup-m-after.yaml; vitest backupSafety, L01-backup-rules | SCREEN | H |
| M-157 | "Include photos in my backup"; photos back after a reinstall | Settings → Backup | Only "Off" is checked | vitest auditPhase5Body, auditPhase5Fixes; phone part M (photos check) (whole runs 17 Oct, both phones) | SCREEN-NEW | H |
| M-158 | Erase all data, solo member | Settings → Your data | Names no gym; reopen still on the welcome (something left behind → "Start over anyway") | **maestro UE / uat-e.yaml step 1 (drives)**; vitest dataActions, eraseLeftBehind | SCREEN-NEW | H |
| M-159 | Erase all data as a gym member (leaves the gym) | Settings → Your data | Names the gym; the Shop is the join card after | **maestro UE / uat-e.yaml step 3 (drives, live FORGE1)**; vitest shopErase, c6LeavePending | SCREEN-NEW | H |

### 1.17 Settings and phone integrations
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-160 | Settings list with each row's status line | settings/index | — | maestro R (drives); vitest redesignR5 | SCREEN | L |
| M-161 | Units (kg/km ↔ lb/miles) and body figure | settings/units | To lb, female (back to kg) | maestro I, F, R (drive); vitest unitsScreens, unitsTrackerText | SCREEN | M |
| M-162 | About and Credits | settings/about, credits | Credits page never opened | vitest phase0RestLateCredits | LOGIC | L |
| M-163 | Health Connect: Connect, allow, "On", send past workouts | settings/health | Allowed on HC's own screen ("Don't allow", HC missing, Stop sending, Send again) | maestro I (drives); vitest phoneFeatures, healthUnsent, phase6PhoneA | SCREEN | M |
| M-164 | Workout reminders on (days, time) | settings/notifications | Switch on (change a day, "Set time", a reminder arriving) | maestro I (drives); vitest phase6PhoneA | SCREEN | M |
| M-165 | Reminders with notifications blocked → "Turn on notifications" | settings/notifications | Message shown (button not tapped) | maestro I2 / phase6-i2.yaml (drives) | SCREEN | M |

### 1.18 Gym side (member)
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| M-166 | Solo user: see the join card and the sample shop | (tabs)/shop | Font 2.0 too | maestro R, P7 / phase7-bigtext.yaml (drive) | SCREEN | L |
| M-167 | Sample shop: bag and demo order | Shop → sample | Demo order never placed on a phone | vitest shopStore, money | LOGIC | L |
| M-168 | Join a gym by typed code | Shop join card | Confirm sheet (unknown code, BUSY, offline: logic/server) | maestro R, BR / brand-theme.yaml, **XJ1 / xj-1-join-order.yaml**; vitest c6S4, c6S3, gym; sql 0020_gym_side_retries | SCREEN | M |
| M-169 | Join by invite link | j/[code].tsx | Fresh phone (Android app-link verification, web fallback page) | maestro INV-a / invite-a.yaml, INV-e, INV-f1; vitest invite | SCREEN | M |
| M-170 | Invite link: already in that gym | j/[code] | — | maestro INV-b / invite-b.yaml | SCREEN | L |
| M-171 | Invite link: switch gym | j/[code] | Joins new gym first, then lets the old go (the old gym hearing it) | maestro INV-c / invite-c.yaml; vitest invite | SCREEN | M |
| M-172 | Invite link: unknown code | j/[code] | — | maestro INV-d / invite-d.yaml; vitest invite, c6S4 | SCREEN | L |
| M-173 | Browse the gym's shop | GymShop | Live list (old list with its age, empty shop, offline) | maestro R, BR, XJ1 (drive); vitest gym, c6S3 | SCREEN | L |
| M-174 | Product page → add to bag ("Only 3 left") | shop/[id].tsx | (out of stock, bag at max) | maestro R, **XJ1** (drive); vitest gymStore, money | SCREEN | L |
| M-175 | Place an order | shop/bag.tsx | Happy path (SOLD_OUT, GONE, TOO_MANY, offline, lost answer, price changed: logic/server) | maestro R, **XJ1, XJ2**; vitest c6OrderOnce, gym; sql 0020_gym_side_retries | SCREEN | H |
| M-176 | My orders: see Ready, Collected, "The gym cancelled this order" | shop/orders.tsx | All three statuses, set in the admin app | **XJ1 / xj-1-ready.yaml, xj-1-collected.yaml; XJ2 / xj-2-gym-cancelled.yaml**; vitest gym | SCREEN-NEW | M |
| M-177 | Cancel my order; stock goes back | shop/orders.tsx | Stock checked on the server (XJ2); TOO_LATE after Ready (server only) | maestro R; **XJ2 / xj-2-order-cancel.yaml**; **sql uat_shop_orders** | SCREEN-NEW | H |
| M-178 | Gym messages: bell count, inbox, seen; a withdrawn message disappears | shop/inbox.tsx | 1 new; taken back → empty (many unread, offline) | maestro INV-e / invite-e.yaml; **XJ3 / xj-3-bell.yaml, xj-3-gone.yaml**; vitest inbox; **sql uat_shop_orders** | SCREEN | M |
| M-179 | Leave the gym (online) | Shop footer "Leave" | Branded and plain; bag and inbox cleared | maestro R, BR, INV-c/e/f3, **XJ5 / xj-5-leave.yaml**; vitest gymStore, c6LeavePending; sql 0015 | SCREEN | M |
| M-180 | Leave the gym while offline (kept, sent at next start) | Shop | — | vitest c6LeavePending | LOGIC | H |
| M-181 | Leave or switch gym with an open order | Shop | The order stays "Ordered" with stock held; after rejoin it is out of reach | NONE (XJ5 leaves only once every order is final); phone part R (leave with an open order) (whole runs 17 Oct, both phones) | SCREEN-NEW | H |
| M-182 | QR check-in first time: number asked once, wrong number, then in | c/[code].tsx | Wrong number → "Change my number"; roster member | maestro INV-f2 / checkin-f2.yaml, **XJ4 / xj-4-checkin.yaml, XJ5 / xj-5-checkin.yaml**; sql 0015_qr_checkin; vitest checkIn | SCREEN | H |
| M-183 | QR check-in again the same day → "already checked in" | c/[code] | — | maestro INV-f3 / checkin-f3.yaml; sql 0015 | SCREEN | M |
| M-184 | Check-in with an active plan (no "see the desk" line) | c/[code] | Plan sold in the admin app | **XJ4 / xj-4-checkin.yaml**; sql 0015 sec4 | SCREEN-NEW | H |
| M-185 | Check-in problems: BAD_PHONE, TOO_MANY, other gym, gym not online, offline | c/[code] | Server and logic only | sql 0015, 0020; vitest checkIn | LOGIC | M |
| M-186 | Poster when not joined → "Join <gym> first" → back to check-in | c/[code] → j/[code]?then= | — | vitest c6S4 (C6-16) | LOGIC | M |
| M-187 | Gym colours and start-up screen; ForgeAI look after Leave | theme, splash | Join, relaunch, leave; colour measured off the screen (change while in use: logic) | maestro BR; **XJ6 / xj-5-switch.yaml, xj-6-relaunch.yaml**; vitest gymTheme, brandEngine | SCREEN | M |
| M-188 | Gym dropped this phone (BAD_KEY) → join card notice | any member call | — | vitest checkIn, c6S4, gymTheme | LOGIC | M |
| M-189 | Settings → Your gym page | settings/gym.tsx | Now shows the joined gym's name (code fixed); never opened by a test | NONE | NONE | M |
| M-190 | Gym side offline: cached shop, bag kept, seen kept, failed check-in | all gym screens | No phone part goes offline (WP7 not on disk) | vitest gym, c6S3, inbox, checkIn | LOGIC | H |

### 1.19 Hidden today (not counted)
| ID | Task | Why hidden | COVERAGE | LEVEL |
|---|---|---|---|---|
| M-H1 | AI coach tab and chat | `FEATURES.coach = false` (the tab sends you to Workout) | vitest lib/features, test/ai/* | HIDDEN |
| M-H2 | AI coach and voice settings | Not in the Settings list, but a direct link still opens an empty page | NONE | HIDDEN |
| M-H3 | Nutrition and daily targets | `FEATURES.nutrition = false` | vitest lib/features | HIDDEN |
| M-H4 | Send my workouts to my gym (gym sync, outbox) | `FEATURES.gymSync = false` | NONE: the outbox and drain have no test. H the day it is switched on | HIDDEN |
| M-H5 | Google Drive backup, restore, undo restore | No Google client id in the build | vitest backupSafety, backupWords, undoRestore, restoreRepairs, db/backupRoundTrip | HIDDEN |
| M-H6 | Strength and recovery score tiles; coach note on the summary; "AI coach notes" switch | coach switch off | vitest lib/features | HIDDEN |

---

## 2. Gym owner (admin app)

The admin app's tests before 17 Oct were logic only, plus the page-opening crawl. **WP5 (new)** drives the real forms:
- J1–J5: money (`money.spec.mjs`);
- J6–J9: desk (`desk.spec.mjs`);
- J10: settings (`settings.spec.mjs`);
- J11: staff (`staff.spec.mjs`);
- J12: receipt (`receipt.spec.mjs`).

WP5 runs on a 390 × 844 phone in India time, against a **pretend server**. **WP6 (new)** drives the admin app against the **live server**: `apps/dashboard/e2e-live`, XJ1a–XJ6a.

### 2.1 Set up and sign-in
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| O-01 | Start a demo gym with a shop; offline fallback | Welcome | Server ok; **no internet → demo without the shop (new)** | crawl (taps Start demo); **e2e J10d**; vitest demo; **sql uat_shop_orders (demo_start_gym)** | SCREEN-NEW | M |
| O-02 | Set up a new gym online (gym name, your name, mobile) | Welcome StartGymForm | (bad mobile, server refusal) | **e2e J11 (pretend server)**; **sql uat_shop_orders (gym_create_online)**; vitest signin | SCREEN-NEW | M |
| O-03 | Owner signs in on a new device (mobile + 6-digit code) | Welcome / sign-in sheet | Wrong code, too many tries, voided code | **covered (new, WP5b): e2e J25** (new device, wrong code, tries left, too many tries; pretend server); was: sql 0018_staff_and_owner_rules 9a–9f; vitest signin | SCREEN-NEW | H |
| O-04 | Put the browser gym online (and finish after a half-way failure) | Settings PutOnlineCard | Copy step only (goOnline, createOnlineGym, retiring the old key, resume) | **covered (new, WP5b): e2e J20, J20b, J21** (first try; half-way stop then "Finish going online", one gym, nothing twice, old owner key retired; a demo is never offered; pretend server); was: vitest cloud (uploadSnapshot); sql 0019 (no taker on uploaded rows) | SCREEN-NEW | H |
| O-05 | Recover from a dead key / being signed out | any online screen | — | vitest cloud | LOGIC | M |
| O-06 | Sign out of this device | /settings/people | — | **e2e J11** | SCREEN-NEW | L |
| O-07 | Dark/light switch kept after reload; install as an app | Settings | Dark/light (install card) | **e2e J10a**; vitest themeContrast | SCREEN-NEW | L |

### 2.2 Members
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| O-08 | Add a member | /members MemberFormSheet | Owner setup in J1/J2/J11 (duplicate mobile, other desk, non-Indian number: logic) | **e2e J2, J11**; vitest members, local, cloud, batches; sql 0018 5a | SCREEN-NEW | M |
| O-09 | Edit a member | MemberDetail | Number clash (logic) | vitest members, local | LOGIC | M |
| O-10 | Archive or restore a member | MemberDetail | Archived debt still counted (restore by hand: no test) | vitest local, collections | LOGIC | M |
| O-11 | Search and filter the roster | /members | — | vitest members, batches, pt; crawl | LOGIC | L |
| O-12 | Home tile → filtered list (count equals the list) | / → /members/f/<tile> | — | vitest homeTiles; crawl | LOGIC | L |
| O-13 | Today screen: call list, today's money, dues tile | / | Empty gym | vitest homeTiles, membership; crawl | LOGIC | M |
| O-14 | Member card: print, download picture, send on WhatsApp | MemberCardSheet | Masked mobile, QR holds only the id | vitest memberCard | LOGIC | M |
| O-15 | WhatsApp one member, or a list one by one | WhatsAppSheet / queue | — | vitest whatsapp (words only) | LOGIC | L |
| O-16 | See members who joined in the app | /members/app | — | crawl (page opens) | NONE | L |

### 2.3 Plans and selling
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| O-17 | Add a plan (Monthly ₹1,500 + ₹500 joining fee) | /plans PlanSheet | (bad price, starter plans) | **e2e J1**; vitest money | SCREEN-NEW | M |
| O-18 | Edit a plan's price or take it off sale; old sales keep their price | PlanSheet | — | vitest local | LOGIC | M |
| O-19 | Create a PT plan | PlanSheet | — | vitest pt, local | LOGIC | L |
| O-20 | Sell a plan with full payment | MemberDetail SellMembershipSheet | Joining fee first time only | **e2e J2**; vitest local, selling, auditC7; sql 0018 5g | SCREEN-NEW | H |
| O-21 | Sell with a part payment (₹1,000), or ₹0 now | Sell sheet | More than the total refused | **e2e J2**; vitest selling, membership; **sql uat_money, 0021** | SCREEN-NEW | H |
| O-22 | Owner sells with a discount, free, or above list price | Sell sheet | Above list asks first | **covered (new, WP5b): e2e J24** (discount, free, above list asked first); was: vitest auditC7 C7-30/C7-13; sql 0019 1f/1g | SCREEN-NEW | H |
| O-23 | Renew early (queued after the current term) | Renew → Sell sheet | — | **e2e J5**; vitest selling, membership, auditC7 C7-10 | SCREEN-NEW | H |
| O-24 | Renew an expired member | Sell sheet | Starts today | vitest selling | LOGIC | M |
| O-25 | Back-date a sale | Sell sheet | Desk ≤31 days, owner further | vitest selling; sql 0018 6c | LOGIC | M |
| O-26 | Cancel a membership (with reason) | CancelMembershipSheet | — | **e2e J5**; vitest local, auditC7; sql 0018 | SCREEN-NEW | H |
| O-27 | Undo a cancel | MemberDetail | Overlap refused (logic) | **e2e J5**; vitest local, auditC7 C7-25 | SCREEN-NEW | H |
| O-28 | Freeze / give extra days | ExtendMembershipSheet | 7 days (PT pack, queued plan: logic) | **e2e J5**; vitest local, auditC7Words; sql 0018 6d | SCREEN-NEW | M |

### 2.4 Money
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| O-29 | Collect the rest of a due (part payment) | CollectPaymentSheet | More than the due refused on screen **and now on the server (F-01, 0021)**; same press saved once; two desks (STALE) | **e2e J3**; **sql uat_money, 0021_receipt_rules**; vitest local, auditC7 C7-1, cloud | SCREEN-NEW | H |
| O-30 | Print a receipt (fields, amount in words, method) or send it on WhatsApp | /receipts/<id> | Print page fields (GST on, WhatsApp hand-off, "Received by" line) | **e2e J12a**; vitest receiptDoc, words, gst, whatsapp; crawl | SCREEN-NEW | H |
| O-31 | Cancel (void) a receipt with a reason; the due comes back | VoidPaymentSheet | CANCELLED, number never reused; no reason refused (F-06) | **e2e J4**; **sql uat_money, 0021**; sql 0018 6a, 0019 2l/2m; vitest local, collections | SCREEN-NEW | H |
| O-32 | Receipt numbering (financial year, back-dated, imported, two desks) | automatic | Never reused (J4); duplicate refused (F-05) | **e2e J4**; vitest receipts, local, cloud, auditC7 C7-36; **sql uat_money, 0021** | SCREEN-NEW | H |
| O-33 | See a receipt's change history | owner_receipt_history (new in 0021) | Owner only; old key named | **sql 0021_receipt_rules sec5, uat_access_matrix** (a screen for it: [unverified]) | LOGIC-NEW | M |
| O-34 | Collections for a date range: methods, filter by who took it | /money, /money/today | Voided receipts reported, not netted | **covered (new, WP5b): e2e J15** (two takers on two phones, custom range, Taken by filter, totals = rows); was: vitest collections, auditC7 C7-12; crawl | SCREEN-NEW | H |
| O-35 | Dues list: aging, collect from the list, badge count | /money/dues | Upcoming term is not a debt | **covered (new, WP5b): e2e J14** (10/40/70 days, collect from the list, badge 3 → 2); was: vitest collections; crawl | SCREEN-NEW | H |
| O-36 | Download the collections or dues file | Money | Formula injection | **covered (new, WP5b): e2e J15** (collections file: Amount = Collected, cancelled column F-09; the dues file: not yet); was: vitest csv (generic only) | SCREEN-NEW | M |
| O-37 | GST: set a GSTIN; receipts keep the GST status they were issued with | Settings | Wrong checksum; GSTIN added later | **covered (new, WP5b): e2e J16** (wrong checksum refused, old receipt keeps no GST, 5% split, 18% before 22 Sep 2025); was: vitest gst, auditC7 C7-11, local, receiptDoc | SCREEN-NEW | H |

### 2.5 Attendance, check-in, PT
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| O-38 | Check a member in by hand | /attendance, MemberDetail | Repeat tap | **e2e J8**; vitest local; sql 0018 5c | SCREEN-NEW | M |
| O-39 | Check someone in for an earlier day; a future day is refused | /attendance | — | **e2e J8**; vitest local | SCREEN-NEW | M |
| O-40 | Undo a check-in | /attendance | — | **e2e J8**; vitest local, checkin; sql 0018 5d | SCREEN-NEW | L |
| O-41 | Print or download the check-in QR poster | /attendance/qr | Not crawled | vitest checkin | LOGIC | M |
| O-42 | See app check-ins on the register, tagged App | /attendance | Live server | **XJ4b, XJ5b (e2e-live/xj-checkin.live.mjs)**; vitest checkin; sql 0015, 0020 | SCREEN-NEW | M |
| O-43 | At-risk list; download it | /attendance/risk | Not crawled | vitest attendance, csv | LOGIC | L |
| O-44 | Mark a PT session today | MemberDetail PT card | Two packs, oldest first | vitest local, pt, cloud; sql 0018 2a | LOGIC | M |
| O-45 | Take back a PT session (an older day is owner only) | PT card | — | vitest local, pt; sql 0018 2b/2c/6b | LOGIC | M |
| O-46 | Renew or extend a PT pack | PT card | — | vitest local, pt | LOGIC | M |

### 2.6 Enquiries and expenses
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| O-47 | Add an enquiry | /enquiries | Duplicate open enquiry (logic) | **e2e J6**; vitest enquiries; sql 0018 5e | SCREEN-NEW | L |
| O-48 | Reschedule a follow-up; WhatsApp follow-up | FollowUpSheet | Save itself untested | vitest enquiries (date picks, words) | LOGIC | L |
| O-49 | Convert an enquiry into a member | Enquiries → MemberFormSheet | — | **e2e J6** | SCREEN-NEW | M |
| O-50 | Enquiry from an archived member's number brings the member back | Enquiries | — | **e2e J6b** | SCREEN-NEW | M |
| O-51 | Mark "not interested", then reopen | /enquiries | — | **e2e J6** | SCREEN-NEW | L |
| O-52 | Record an expense | /expenses | — | **e2e J7**; vitest expenses | SCREEN-NEW | M |
| O-53 | Remove a mistyped expense | /expenses | — | **e2e J7** | SCREEN-NEW | M |
| O-54 | Monthly profit (including shop money) | /expenses | Profit follows add/remove (negative month: logic) | **e2e J7**; vitest expenses, auditC7 C7-14 | SCREEN-NEW | M |

### 2.7 Shop, messages, branding, invite
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| O-55 | Turn on the shop / member app (gym code + sample products) | Settings JoinCode | Offline | **covered (new, WP5b): e2e J22** (offline words, then gym code + 12 sample products; pretend server); was: NONE | SCREEN-NEW | M |
| O-56 | Add products with stock (edit, options, +10 stock, photo) | /shop/products ProductSheet | Two products, live (edit, options, photo: logic/server) | **XJ1a (e2e-live/xj-orders.live.mjs)**; vitest shop, photo; sql 0018_photo_upload | SCREEN-NEW | M |
| O-57 | See a new order, Mark ready, hand over as Collected (paid) | /shop | Live; the server checks each step | **XJ1b, XJ1c**; **sql uat_shop_orders**; vitest shop | SCREEN-NEW | H |
| O-58 | Cancel an order from the gym; stock goes back | /shop | Live; stock 3 → 4 | **XJ2b**; **sql uat_shop_orders** | SCREEN-NEW | H |
| O-59 | Undo "Ready" after a mis-tap; collected/cancelled are final | /shop | — | **sql uat_shop_orders**; vitest shop | LOGIC-NEW | L |
| O-60 | Send a message to members; see "Seen by 1 of 1"; take it back | /shop/messages | Live | **XJ3a, XJ3b**; vitest messages; **sql uat_shop_orders, uat_access_matrix** | SCREEN-NEW | M |
| O-61 | Set the gym's logo and colours | /settings/branding | Colour, live (logo, clearing) | **XJ6a**; vitest brand; sql 0018_photo_upload, 0018 8 | SCREEN-NEW | L |
| O-62 | Invite members: copy code, WhatsApp, print the poster | /settings/invite | — | vitest invite; crawl | LOGIC | L |

### 2.8 Staff, data, settings
| ID | Task | Screen / route | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| O-63 | Add a front-desk person and make their sign-in code | /settings/people | Pretend server | **e2e J11**; **sql uat_access_matrix (staff C/U cells)**; vitest signin | SCREEN-NEW | H |
| O-64 | Sign a person out everywhere / remove them (their key stops working) | /settings/people | Server proves the key dies; the screen buttons are never pressed | **covered (new, WP5b): e2e J13** (both buttons pressed; the desk phone is signed out on its next refresh; pretend server); was: **sql uat_access_matrix ("R/C after signed out / removed")** | SCREEN-NEW | H |
| O-65 | Import members from a CSV or Excel file | /members/import | CSV (J9, XJ5a live). .xlsx/.xls, Hindi headers, UTF-16, day/month order: logic | **e2e J9; XJ5a**; vitest importMembers, sheets, auditC7Import, csv | SCREEN-NEW | H |
| O-66 | Import plans and payments from the file | /members/import | Running totals, family sharing a mobile, same file twice | **covered (new, WP5b): e2e J18** (payments list, running total, two rows for one member; receipts, dues, plans checked) — found and fixed U-A10; was: vitest importTerms, auditC7Import, auditC7Review | SCREEN-NEW | H |
| O-67 | Import online in batches (internet drops, >900 rows) | /members/import | — | **covered (new, WP5b): e2e J19** (600 rows, internet drops after batch 1, retry adds nobody twice) — found and fixed U-A11; was: vitest importMembers saveInBatches, cloud | SCREEN-NEW | H |
| O-68 | Undo an import ("Undo this import") | Import → Past imports | Rows edited since are kept (logic) | **e2e J9**; vitest undoImport; sql 0017_undo_import | SCREEN-NEW | H |
| O-69 | Load the demo gym over the browser gym (says what it replaces) | Settings | — | **e2e J10b** | SCREEN-NEW | H |
| O-70 | Erase and start fresh | Settings | — | **e2e J10b** (every money journey starts with it) | SCREEN-NEW | H |
| O-71 | Start over with a new demo gym; disconnect the shop | Settings | Start over (disconnect) | **e2e J10c** | SCREEN-NEW | M |
| O-72 | Edit gym details (blank name refused) | Settings | — | vitest auditC7 C7-41, cloud; sql 0018 8 | LOGIC | M |
| O-73 | Browser storage problems: full, newer version, damaged data, two tabs | automatic | — | **covered (new, WP5b): e2e J23a, J23b, J23d** (two tabs, newer version, browser full) and J23c (damaged data: says so, keeps and downloads it, new gym only when asked; U-A13 fixed); was: vitest local | SCREEN-NEW | H |

---

## 3. Front desk / staff (admin app, fewer rights)

Rights come from `apps/dashboard/src/crm/auth/permissions.ts`. The server enforces them in 0014, 0018, 0019 and 0021. **Honest limit:** the whole gym is pulled to every signed-in device, so hiding totals from staff cannot be enforced on the server.

| ID | Task | Screen / route | Key states and variants | COVERAGE (screen · server) | LEVEL | RISK |
|---|---|---|---|---|---|---|
| **Can do** | | | | | | |
| F-01 | Sign in as staff (mobile + code) on the owner's phone | Welcome | Wrong tries counted; code void after 10 | **e2e J11** · sql 0018 9a–9f | SCREEN-NEW | H |
| F-02 | Add or edit a member | /members | — | vitest members · sql 0018 5a/5b; **uat_access_matrix** | LOGIC | M |
| F-03 | Archive a member (allowed: no flag stops it) | MemberDetail | — | **covered (new, WP5b): e2e J26**; was: NONE | SCREEN-NEW | M |
| F-04 | Sell a plan: at most 10% off, joining fee as listed, at most 31 days back | Sell sheet | 11% refused, 10% allowed, fee kept | **e2e J11** · sql 0019 1a–1d, 0018 | SCREEN-NEW | H |
| F-05 | Renew without the joining fee | Sell sheet | — | vitest auditC7Review · sql 0019 1e | LOGIC | M |
| F-06 | Collect a payment; the record names who took it | CollectPaymentSheet | A device naming a colleague is overruled | **e2e J11 (sale stored as Sunita's)** · sql 0019 2a–2s, **uat_money** · **e2e J15, J26 (WP5b)** | SCREEN-NEW | H |
| F-07 | Print or WhatsApp a receipt that shows who took the money | /receipts/<id> | "Received by" line now in the code (no test asserts it) | **covered (new, WP5b): e2e J17, J15** ("Received by" owner / desk, WhatsApp text too; none for a browser-only gym); was: vitest receiptDoc | SCREEN-NEW | M |
| F-08 | Check in by hand; undo today's check-in | /attendance | — | vitest local · sql 0018 5c/5d; **uat_access_matrix (visit)** | LOGIC | M |
| F-09 | Mark a PT session today; take back today's | PT card | — | vitest pt · sql 0018 2a/2b/2d–2h | LOGIC | M |
| F-10 | Add an enquiry; convert it to a member | /enquiries | Convert never tested as staff | sql 0018 5e; **uat_access_matrix (enquiry)** | LOGIC | M |
| F-11 | Import members only (no plans or payments) | /members/import | — | vitest importMembers, auditC7Import C7-18 · sql 0018 5f/7f | LOGIC | M |
| F-12 | Hand over shop orders (Orders tab only) | /shop | — | vitest permissions shopTabs · **sql uat_shop_orders (o4: the desk moves an order on)** | LOGIC-NEW | M |
| F-13 | See only the Dues tab and collect from it | /money/dues | A typed Collections link still shows only Dues | **e2e J11** · vitest permissions | SCREEN-NEW | M |
| F-14 | Print the QR or invite poster, a member card; WhatsApp reminders | /attendance/qr, /settings/invite | — | vitest permissions, checkin, whatsapp | LOGIC | L |
| F-15 | Sign out of own device | /settings/people | — | **covered (new, WP5b): e2e J26**; was: NONE | SCREEN-NEW | L |
| **Must be refused or hidden** | | | | | | |
| F-16 | See money totals (Today's collection, Fees due, Collections) | /, /money | Hidden on screen; **cannot be enforced on the server** | **e2e J11** · none possible | SCREEN-NEW | H |
| F-17 | Open Expenses, including by typing the link | /expenses | "Only an owner can see this" | **e2e J11** · **uat_access_matrix (expense cells)** · **e2e J26 (WP5b)** | SCREEN-NEW | M |
| F-18 | Void a receipt | MemberDetail, Money | No "Cancel receipt" button | **e2e J11** · sql 0018 C8-1, **uat_access_matrix (payment U cancel)** | SCREEN-NEW | H |
| F-19 | Change a saved receipt; post a negative or zero receipt | via dev tools | Now refused for everyone (F-03, F-04) | sql 0018; **sql 0021, uat_money** | LOGIC-NEW | H |
| F-20 | Cancel a membership | MemberDetail | No "Cancel plan" | **e2e J11** · sql 0018; **uat_access_matrix** | SCREEN-NEW | H |
| F-21 | Undo a cancelled plan | MemberDetail | — | **uat_access_matrix ("membership U (undo a cancel)")** | LOGIC-NEW | M |
| F-22 | Freeze or give extra days; change a saved price or start date | MemberDetail | No "Freeze" | **e2e J11** · sql 0018; **uat_access_matrix** | SCREEN-NEW | H |
| F-23 | Give more than 10% off, sell free, drop a joining fee that is due | Sell sheet | — | **e2e J11** · sql 0019 1a–1c | SCREEN-NEW | H |
| F-24 | Sell more than 31 days back, an off-list plan, a negative price | Sell sheet | — | vitest selling · sql 0018 C8-1 | LOGIC | H |
| F-25 | Add or edit plans | /plans | Read-only for staff | **e2e J11** · sql 0018 5f; **uat_access_matrix (plan)** | SCREEN-NEW | H |
| F-26 | Change gym details or branding | Settings, /settings/branding | — | vitest permissions · sql 0018 8; **uat_access_matrix (gym settings, incl. the gym record push)** | LOGIC-NEW | M |
| F-27 | Shop products, prices, stock, photos, messages | /shop | — | vitest permissions · sql 0018 8; **uat_access_matrix (product, message)** | LOGIC-NEW | M |
| F-28 | Undo an import; stamp or strip the import mark | Import | — | sql 0017 check 1, 0018 7a/7c | LOGIC | H |
| F-29 | Take back an older PT session; add sessions | PT card | — | vitest pt · sql 0018 2c/2i | LOGIC | M |
| F-30 | Load demo, erase, start over, disconnect | Settings | Hidden for staff | **e2e J11** · [unverified] server side | SCREEN-NEW | H |
| F-31 | Add people or make sign-in codes | /settings/people | Hidden on screen [unverified in J11] | **covered (new, WP5b): e2e J26** (her Staff & sign-in page: no Add a person, no Make sign-in code); was: **uat_access_matrix (staff C/U cells)** | SCREEN-NEW | H |
| F-32 | A signed-out or removed desk person's device stops working | any | — | **covered (new, WP5b): e2e J13** (pretend server); was: **uat_access_matrix** | SCREEN-NEW | H |

---

## 4. Watch wearer (Wear OS)

**What the watch app contains:**
- One activity with three screens: a rest ring with countdown, "Next:" line and BPM (no buttons); a workout screen with a "Complete set" chip; and an idle screen.
- Notifications: the countdown (an Ongoing Activity with Done / +15 s / Skip) and its own "Rest is over" with "Complete set".
- It listens to `/forge/rest` and `/forge/workout` and sends `/forge/act/{done,add,skip}`.
- It sets its own alarm at the rest's end, and the boot receiver re-arms it.
- Bridging stops copies of the phone's "rest-over" and "rest-card".
- Heart rate is shown on screen only, never saved.

**Tests:**
- **JVM:** `RestTextTest.kt`, plus **`BridgingTest.kt`** and the phone module's **`WearWireTest.kt`** (new).
- **Vitest:** **`watchBridge.test.ts`** (new). It reads the Kotlin as text.
- **Where they run:** `wear-build.yml` now runs on push too. `release-apk.yml` now runs the watch tests before signing.
- **No real watch:** the emulator has no watch and no Google account, so the Data Layer never runs. No test ever shows a watch screen.

| ID | Task | Where | Key states and variants | COVERAGE | LEVEL | RISK |
|---|---|---|---|---|---|---|
| W-01 | See the live workout on the wrist (exercise, set line, heart rate) | Watch app | App installed mid-workout catches up | NONE (phone side: liveCard and watchBridge prove the live card stays local) | NONE | M |
| W-02 | See the rest countdown (ring, chip on the watch face) | Watch app, Ongoing Activity | App closed; notifications refused | JVM RestTextTest | LOGIC | M |
| W-03 | Get buzzed at rest end by the watch's own alarm | Watch | Phone in use, watch asleep. The alarm, receiver and vibrator never ran | JVM RestTextTest; **watchBridge.test.ts (buzz never waits on the notification permission; VIBRATE declared)** | LOGIC-NEW | H |
| W-04 | The phone's "rest ran out" reaches the watch before its own alarm | Watch | Within ±60 s only | JVM RestTextTest | LOGIC | M |
| W-05 | Exactly one buzz at rest end, never zero, never two | Watch + bridged phone alert | Watch app allowed / refused / not installed | **watchBridge.test.ts (tags "rest-over"/"rest-card" on both sides), BridgingTest.kt**; notif.py `watch` (flags) | LOGIC-NEW | H |
| W-06 | Tap Done / +15 s / Skip on the watch | Watch → /forge/act/* → phone | Phone app killed; phone unreachable (toast) | Phone receiver driven from the shade (maestro H1, H1D, H2); **WearWireTest.kt (parsing)**; the watch-to-phone path: none | LOGIC-NEW | H |
| W-07 | "Complete set" from the watch, never ticked twice or lost | Watch workout screen | Duplicate tap, phone rejects the row | JVM RestTextTest; vitest offlineTick, restDone; **watchBridge.test.ts (/forge/nack/done: the button comes back)**; maestro H3 (phone shade) | LOGIC-NEW | H |
| W-08 | Buttons on bridged phone notifications (no watch app) | Bridged rest card | Buttons run on the phone | maestro H1/H1D/H2/H3 (phone shade only) | LOGIC | M |
| W-09 | Watch without the app gets the quiet countdown (no buzz at rest start) | Bridged countdown | The phone's "LOW" channel branch never runs | NONE | NONE | M |
| W-10 | "Rest is over" reaches the watch as an alarm; the live card stays on the phone | Bridged alert | Phone asleep | notif.py `watch` in part W (flags and category only) | LOGIC | M |
| W-11 | Two rests within 2 minutes both buzz | Watch | Android 15+ cooldown | LONGREST (opt-in, phone side only) | LOGIC | M |
| W-12 | Phone and watch lose touch; updates are re-sent | Watch | A Finish or Skip during the phone's 5-min pause | JVM RestTextTest (late arrival); **watchBridge.test.ts (U-W2: sent only after a successful put)** | LOGIC-NEW | H |
| W-13 | Watch rebooted or app updated mid-rest | BootReceiver | — | NONE | NONE | M |
| W-14 | Phone restarted mid-rest | phone RestCard.recover | — | NONE | NONE | M |
| W-15 | Do Not Disturb on the watch | Watch buzz | Ring-through on / off | NONE (DND part is phone only, opt-in) | NONE | M |
| W-16 | Phone ends the workout: the watch clears its rest and alarm | Watch | Finish, Discard | NONE | NONE | M |
| W-17 | Watch notifications refused, or allowed later | Watch chips | Bridging switches with it | **watchBridge.test.ts ("rest-card" kept off only while allowed)** | LOGIC-NEW | M |
| W-18 | Open the watch app with no workout | Watch idle screen | First open asks for permissions | NONE | NONE | L |
| W-19 | Heart rate | Watch app | Off-wrist, no sensor, permission blocked | JVM RestTextTest (format only) | LOGIC | L |

---

## 5. Cross-role chains

Before 17 Oct, every owner step in a phone test was a server call made by the test script, so no chain ran end to end. **WP6 (new)** runs six journeys with both real apps and the live server, checking the server at every hand-off:
- the member app on the owner-phone profile, through Maestro `xj-*.yaml`;
- the admin app on a 390 px phone, through Playwright `e2e-live`.

The run makes two fresh online gyms through the server. It is manual only, about an hour per run, and part of the release gate.

| ID | Chain | Steps | Covered by | LEVEL | RISK |
|---|---|---|---|---|---|
| X-01 | Owner adds products → member joins by code → orders → owner sees it, Mark ready → member sees Ready → owner Collected (paid) → member sees Collected | XJ1 steps 1–10 | **XJ1** (the gym itself is made by the script, not the Welcome screen) | SCREEN-NEW | H |
| X-02 | Member cancels → stock back → owner sees "Cancelled by member" | XJ2 1–3 | **XJ2**; **sql uat_shop_orders** | SCREEN-NEW | H |
| X-03 | Owner cancels → stock back → member sees "The gym cancelled this order" | XJ2 4–8 | **XJ2**; **sql uat_shop_orders** | SCREEN-NEW | H |
| X-04 | Owner sends a message → bell → inbox → "Seen by 1 of 1" → taken back → inbox empty | XJ3 1–7 | **XJ3** | SCREEN-NEW | M |
| X-05 | Owner adds a member and sells a plan → member scans the poster link → in, no "see the desk" → owner sees the visit tagged App | XJ4 1–5 | **XJ4** (the poster link is opened by adb, not scanned) | SCREEN-NEW | H |
| X-06 | Owner imports members from a CSV → an imported member checks in by mobile → owner sees the visit | XJ5 1–6 | **XJ5** (Excel .xlsx: logic only) | SCREEN-NEW | H |
| X-07 | Owner sets the brand colour → member joins, relaunches → gym look; Leave → ForgeAI look | XJ6 1–6 | **XJ6** | SCREEN-NEW | M |
| X-08 | Owner creates the gym on the Welcome screen → shares the invite link → member joins | Welcome → /settings/invite → j/[code] | Member half: maestro INV-a/e/f1. Owner half: e2e J11 (pretend server), vitest invite. Never joined up | LOGIC | M |
| X-09 | Owner prints the QR poster → member scans it with the camera | /attendance/qr → c/[code] | Poster: vitest checkin. The scan is imitated by `am start` | LOGIC | M |
| X-10 | Member leaves → their numbers are cleared → owner's "joined in the app" list updates | member_leave → owner_app_members | sql 0015 sec16, 0020 2g; the owner's list: crawl with an empty mock | LOGIC | H |
| X-11 | Member leaves or switches gym with an open order → order stuck, stock held | Shop → Leave | NONE; phone part R (leave with an open order) (whole runs 17 Oct, both phones) | SCREEN-NEW | H |
| X-12 | Owner removes or signs out a desk person → that person's device stops working | /settings/people → any desk screen | **covered (new, WP5b): e2e J13** (owner phone + desk phone, pretend server); was: **sql uat_access_matrix**; the screens: none | SCREEN-NEW | H |
| X-13 | Desk sells a plan → the record names the desk person → owner sees who took it | Sell sheet → Money | **covered (new, WP5b): e2e J15** (the owner reads "Taken by" and filters by it); was: **e2e J11** (server record), sql 0019; the owner reading it: vitest auditC7 C7-12 | SCREEN-NEW | M |
| X-14 | One gym's data never reaches another (members, owners, desk of gym B) | all RPCs and tables | **sql uat_access_matrix (412 cells, 64 gym-B cells all deny)**; security.sql | LOGIC-NEW | H |
| X-15 | Member checks in by QR and the desk also checks them in: counted once | member_check_in + crm_push | sql 0015 sec6, 0020 C6-8 | LOGIC | M |
| X-16 | Owner edits or removes a product → member's grid updates | ProductSheet → GymShop | sql 0018 8, 0018_photo_upload; vitest shop, gym | LOGIC | M |

---

## 6. Lifecycle state models

Each transition is marked:
- **screen**: driven on a real screen (Maestro, e2e or XJ);
- **logic**: vitest, SQL or JVM only;
- **NONE**: nothing tests it.

### 6.1 Membership (admin app)
Term states (`membershipState`): upcoming | active | expiring | expired | cancelled. Member-level states add "never". Dues buckets: upcoming | d0_30 | d31_60 | d60plus.

| Transition | Test |
|---|---|
| enquiry (open) → member | **screen (new)**: e2e J6 |
| lost enquiry → reopened | **screen (new)**: e2e J6 |
| archived member → brought back by a new enquiry | **screen (new)**: e2e J6b |
| never → sale → active / upcoming | **screen (new)**: e2e J2; logic: local, selling; sql 0018 5g |
| upcoming → active ("Starts in N days") | logic: membership, auditC7 C7-33 |
| active → expiring (7-day window) → expired | logic: membership |
| unpaid → part-paid → paid | **screen (new)**: e2e J2, J3; logic: membership, collections; **sql uat_money, 0021** |
| paid → due again (receipt voided) | **screen (new)**: e2e J4; logic: collections |
| due aging: upcoming → d0_30 → d31_60 → d60plus | logic: collections |
| active → renewed early (queued) | **screen (new)**: e2e J5; logic: selling, C7-10 |
| expired → renewed (starts today) | logic: selling |
| any → frozen / extra days | **screen (new)**: e2e J5; logic: local; sql 0018 6d (desk refused) |
| any → cancelled | **screen (new)**: e2e J5; logic: local; sql 0018 (desk refused) |
| cancelled → restored (undo) | **screen (new)**: e2e J5; logic: C7-25; **sql uat_access_matrix** (desk path) |
| member archived → restored by hand | logic: local (restore by hand: NONE) |
| PT pack: session used → all used → renewed | logic: pt, local; sql 0018 2a–2i |
| plan active → member's app check-in shows "plan ok" | **screen (new)**: XJ4; sql 0015 sec4 |

### 6.2 Receipt
A payment with `voided` and `voidReason`. There is no un-void: `uat_access_matrix` has an "undo a void" cell, which must be refused.

| Transition | Test |
|---|---|
| (none) → issued at a sale | **screen (new)**: e2e J2; sql 0018 5g |
| (none) → issued by collecting a due | **screen (new)**: e2e J3; logic: local |
| issue more than the due → refused | **screen (new)**: e2e J3; **sql 0021 / uat_money F-01 (server, migration 0021 not live yet)** |
| same press twice → one receipt; lost answer resent → same row; two desks → STALE | logic: auditC7 C7-1, cloud; **sql uat_money** |
| numbering: financial year, back-dated, imported series, duplicate refused | logic: receipts, local, cloud; **sql 0021, uat_money F-05** |
| issued → printed (fields, words) | **screen (new)**: e2e J12a |
| issued → cancelled (void) with a reason; number kept; due comes back | **screen (new)**: e2e J4; sql 0018 6a; **sql 0021 (no reason refused, F-06)** |
| desk tries to void | **screen (new)**: e2e J11 (hidden); sql 0018; **uat_access_matrix** |
| issued → edited (amount, member, number) | refused for everyone: **sql 0021 / uat_money F-03** |
| issued or cancelled → change history read | **sql 0021 sec5** (logic) |
| who took it is stamped, and kept after a cancel | **screen (new)**: e2e J11 (server record); sql 0019 2a–2s |
| cancelled → reprinted with a CANCELLED banner | logic: receiptDoc |

### 6.3 Workout (member app)
| Transition | Test |
|---|---|
| not started → live (Up next) | screen: A, W2 |
| not started → live (empty workout) | screen: C, E, F, H1, I, J, P9 |
| not started → live (routine card or preview) | screen: G, J3, L |
| not started → live (widget keyed tap, app shortcut) | NONE (logic: phase6PhoneA, phase9Shortcuts) |
| keyless link → stays not started | screen: link |
| finished → Repeat → live | NONE (logic: db/auditC4ImportReal) |
| live → second start: Resume / Discard and start new | **screen (new)**: UR |
| live ↔ paused (by hand) | screen: P2a/P2b |
| paused → live by a tick | NONE (logic: db/pauseWorkoutReal) |
| live → auto-paused (1 h idle) → "Count it" | NONE (logic: idlePause, C1-2) |
| live → minimised → resumed | screen: B |
| live → app killed → resumed | screen: H2, H3C |
| live (backgrounded) → Done / +15 s / Skip from the rest card | screen: H1, H1D, H2 |
| live (app killed) → "Complete set" in the shade → saved on reopen | screen: H3B, H3C |
| live → "Complete set" from the watch | logic only (W-07) |
| live → Finish fails, stays open | NONE (logic: db/writeQueue) |
| live → finished | screen: B, C, E, F, G, I, L, P9, W4 |
| live → finished with "Ended at" (forgotten) | NONE (logic: finishFlow LW-07) |
| live → discarded | screen: J, J3-end, P7 |
| finished → "Update routine" applied | **screen (new)**: UR |
| finished → renamed | screen: W4 |
| finished → edit opened → discarded | screen: N |
| finished → edited → saved (kept after restart) | **screen (new)**: UH |
| (none) → past workout logged → saved | **screen (new)**: UH (discard: N) |
| finished → deleted | **screen (new)**: UH |
| finished → survives uninstall and reinstall | screen: M (workout count only) |
| finished → erased with all data | **screen (new)**: UE |
| finished → replaced by an import (Replace), then Undo import | **screen (new)**: UD |

### 6.4 Gym link (member app)
| Transition | Test |
|---|---|
| none → joined by typed code | screen: R, BR, XJ1; sql 0020 |
| none → joined by invite link | screen: INV-a, INV-e, INV-f1 |
| join retried after a lost answer → same member, new key | logic: c6S3; sql 0020 2a–2e |
| joined → same gym's link → "already in" | screen: INV-b |
| joined A → B's link → switched (A left in the background) | screen: INV-c (A hearing it: NONE) |
| joined A → left → joined B by code (branded) | **screen (new)**: XJ5/XJ6 (xj-5-switch.yaml) |
| joined → left online | screen: R, BR, INV-c/e/f3, XJ5; sql 0015 sec16 |
| joined → left offline (kept, sent at next start) | logic: c6LeavePending |
| joined → left with an open order | NONE |
| joined → Erase all data → left | **screen (new)**: UE; logic: shopErase |
| joined → BAD_KEY → unlinked with a notice | logic: checkIn, c6S4, gymTheme |
| left → rejoined → a NEW member (old orders out of reach) | sql 0020 2g |
| removed by the owner / gym deleted | does not exist in the code (no such server function) |

### 6.5 Shop order
Server status: ordered | ready | collected | cancelled. `cancelled_by` is member or gym. The phone keeps a pending order id for 15 minutes.

| Transition | Test |
|---|---|
| bag → placed (ordered), stock taken | screen: R, **XJ1 (new)**; sql 0020 C6-1, **uat_shop_orders** |
| place errors: SOLD_OUT / GONE / EMPTY / TOO_MANY / TOO_BIG | logic: c6OrderOnce, gym |
| retry with the same id → same order, stock taken once | logic: c6OrderOnce; sql 0020 1a–1j |
| ordered → ready (owner) | **screen (new)**: XJ1; **sql uat_shop_orders** |
| ready → collected (owner, paid) | **screen (new)**: XJ1; **sql uat_shop_orders** |
| ordered → collected directly | **sql uat_shop_orders** (logic) |
| ready → ordered (undo a mis-tap) | **sql uat_shop_orders**; logic: shop |
| ordered → cancelled by member → stock back | **screen (new)**: XJ2; screen: R (status only); **sql uat_shop_orders** |
| ready → member cancel refused (TOO_LATE) | **sql uat_shop_orders** (logic); words: vitest gym |
| ordered or ready → cancelled by gym → stock back | **screen (new)**: XJ2 (from ordered); **sql uat_shop_orders** (from ready too) |
| collected / cancelled → any move refused (final) | **sql uat_shop_orders**; logic: shop |
| desk moves an order on | **sql uat_shop_orders (o4)** |
| gym B's owner moves gym A's order → refused | **sql uat_shop_orders, uat_access_matrix** |
| ordered → member leaves → order stuck | NONE |

### 6.6 QR check-in (supporting)
| Transition | Test |
|---|---|
| fresh / other gym → "Join first" → joined → back to check-in | logic: c6S4 |
| ready → NO_PHONE → number asked | screen: INV-f2; sql 0015 sec2 |
| typed number not on the roster → "Change my number" | screen: INV-f2; sql 0015 sec8 |
| matched → checked in, number remembered | screen: INV-f2, XJ4, XJ5; sql 0015 |
| checked in, no plan today → "see the desk" | screen: INV-f2; sql 0015 sec6 |
| checked in, plan covers today | **screen (new)**: XJ4; sql 0015 sec4 |
| checked in → scanned again → "already" | screen: INV-f3; sql 0015 sec5/6 |
| app check-in → owner sees it tagged App | **screen (new)**: XJ4, XJ5 |
| desk Undo → scan again → visit back | sql 0015 sec12; logic: checkin |
| TOO_MANY / gym hourly cap / OTHER_GYM / GYM_NOT_ONLINE | sql 0015, 0020 |
| offline / timeout | logic: checkIn only |

### 6.7 Enquiry (admin app)
Status: open | joined | lost.

| Transition | Test |
|---|---|
| created (follow-up tomorrow) | **screen (new)**: e2e J6; logic: enquiries; sql 0018 5e |
| later → today → overdue | logic: enquiryBucket |
| rescheduled | logic (the date picks only; the save: NONE) |
| open → joined (member made) | **screen (new)**: e2e J6, J6b |
| open → lost → open | **screen (new)**: e2e J6 |

---

## 7. Summary

| Role | Tasks | Covered on a real screen (of which new) | Covered by logic only (of which new) | Not covered | H-risk not covered on a real screen |
|---|---|---|---|---|---|
| 1. Member (phone) | 190 | 133 (21 new) | 51 (0 new) | 6 | 11 |
| 2. Gym owner (admin) | 73 | 50 (50 new) | 22 (2 new) | 1 | 0 |
| 3. Front desk / staff (admin) | 32 | 17 (17 new) | 15 (5 new) | 0 | 3 |
| 4. Watch wearer | 19 | 0 | 12 (6 new) | 7 | 5 |
| 5. Cross-role chains | 16 | 9 (9 new) | 6 (1 new) | 1 | 3 |
| **Total** | **330** | **209 (97 new)** | **106 (14 new)** | **15** | **22** |

**Before the 17 Oct UAT work**, only 112 of these 330 tasks were driven on a real screen. All 112 were member tasks. No admin, staff, watch or cross-role task was driven, and the 97 tasks marked new were then logic only or not covered.

**Limits on the new cover:**
- WP5 and WP5b admin journeys use a pretend server.
- WP6 journeys and the phone run are manual-only workflows, although both gate a release.
- WP4 phone parts are not yet seen green in a run [unverified].
- Migration 0021, which makes the server refuse overpaid and edited receipts, is tested in CI but not live yet.

"Covered on a real screen" means `SCREEN` or `SCREEN-NEW`. "Logic only" means `LOGIC` or `LOGIC-NEW`. "Not covered" means `NONE`. The last column counts H-risk tasks with LOGIC, LOGIC-NEW or NONE, because none of them is pressed on a real screen. Hidden-today tasks (M-H1 to M-H6) are not counted.

---

## 8. Top 25 uncovered H/M tasks

Ranked by harm. "Uncovered" means no test drives it on a real screen. Each item says whether some logic still guards it (logic only) or nothing does (NONE).

| # | ID | Task | Risk | Cover today | Why it matters |
|---|---|---|---|---|---|
| 1 | M-181 / X-11 | Leave or switch gym with an open order | H | NONE | The order stays "Ordered" with stock held. After a rejoin the member is a new member and can never see or cancel it. |
| 2 | M-190 (+M-180) | Gym side with no or patchy network: place order, leave, check-in, seen messages | H | logic only | No phone part ever goes offline (WP7 is not on disk yet). A double order, a lost leave (the number stays with the gym) or an endless spinner would pass every test. |
| 3 | M-58 | Finish fails or storage is full: the workout stays open and Finish can be retried | H | logic only | The main workout loop. A failed save that loses the sets is never seen on a phone. |
| 4 | M-50 | Auto-pause after an hour idle, then "Count it" | H | logic only | Changes a saved workout's length. Never reached on a phone (P2 pauses for 70 s only). |
| 5 | M-56 | Forgotten Finish: "Ended at …" | H | logic only | Same: the saved duration is rewritten. |
| 6 | M-07 | Start-up failure: "Try again" / "Save my data file" | H | logic only | The member's only way out when the database won't open. |
| 7 | M-157 (+M-156) | Backup with photos; everything except the workout count coming back after a reinstall | H | logic only (M checks the count line only) | Units, profile, measurements, routines and opted-in photos coming back are never checked. |
| 8 | O-64 / X-12 | Owner removes a staff person or signs them out everywhere | H | **covered (new, WP5b): e2e J13**; was: server only (new: uat_access_matrix) | The server is proven to kill the key, but the people-screen buttons are never pressed. A former employee keeping access is the harm. |
| 9 | W-03 | The watch's own rest-end alarm and buzz | H | logic only (new: watchBridge text checks) | Never run on any watch or watch emulator: alarm, Doze, app closed, reboot re-arm, DND usage. |
| 10 | W-06 / W-07 | Watch taps (Done, +15 s, Skip, Complete set) reach the phone, once | H | logic only (new: WearWireTest, nack check) | The emulator has no Data Layer, so the phone's watch-tap handler never runs in a test. A set ticked twice or lost on the wrist is unseen. |
| 11 | W-12 | Phone and watch lose touch; the watch is brought back in step | H | logic only (new: U-W2 check) | A Finish or Skip lost in the pause leaves a stale rest buzzing or an old "Complete set". |
| 12 | O-35 | Owner's dues list: aging, collect from the list, badge count | H | **covered (new, WP5b): e2e J14**; was: logic only | The list the owner chases money from. Only staff's view of it is driven (J11). |
| 13 | O-34 | Collections for a date range, filtered by who took the money | H | **covered (new, WP5b): e2e J15**; was: logic only | The owner's daily cash check against the drawer. |
| 14 | O-37 | GST: GSTIN set later; receipts keep the GST status they were issued with | H | **covered (new, WP5b): e2e J16**; was: logic only | Wrong tax on a printed receipt. J12a prints a receipt without GST only. |
| 15 | O-66 | Import plans and payments from the owner's file | H | **covered (new, WP5b): e2e J18**; was: logic only | Creates receipts and dues in bulk. Only members-only CSV import is driven (J9, XJ5). |
| 16 | O-67 | Online import in batches when the internet drops or the file has 900+ rows | H | **covered (new, WP5b): e2e J19**; was: logic only | A half-done import on a gym's patchy line. |
| 17 | O-04 | Put the browser gym online, and finish after a half-way failure | H | **covered (new, WP5b): e2e J20, J21**; was: logic only (copy step) | Moves every record to the server. Retiring the old key and resuming have no test. |
| 18 | O-73 | Browser storage full, damaged, newer version, or two tabs open | H | **covered (new, WP5b): e2e J23a-d**; was: logic only | The browser-only gym's whole record lives here. |
| 19 | O-22 | Owner sells with a discount, free, or above the list price | H | **covered (new, WP5b): e2e J24**; was: logic only | Money. Only the desk's 10% cap is driven (J11). |
| 20 | M-110 | Start or Resume from the widget's keyed tap or an app-icon shortcut | H | logic only | The path that starts a workout by itself has never run on a phone. Only keyless links are tested. |
| 21 | M-96 | Merge an exercise into another (moves its history) | H | logic only | Moves or loses years of history for that lift. |
| 22 | M-67 | Edit a past workout while a live one is open ("Discard it and edit this one") | H | logic only | The Discard branch throws away the live workout. |
| 23 | X-10 | Member leaves: their numbers are cleared and the owner's "joined in the app" list updates | H | server only | Privacy. The owner's list is never read in a test (the crawl mocks it empty). |
| 24 | O-03 | Owner signs in on a new device with mobile + code | H | **covered (new, WP5b): e2e J25**; was: server and logic only | Locked out of the gym's records if it breaks. Only the staff sign-in is driven (J11). |
| 25 | O-55 | Turn on the shop / member app (makes the gym code and sample products) | M | **covered (new, WP5b): e2e J22**; was: NONE | The first step of every gym-side chain. WP6 makes its gyms through the server, never with this button. |

**Close behind** (M, not driven on a real screen):
- On the phone:
  - leaving while an import runs (M-152, NONE);
  - Settings → Your gym, never opened (M-189, NONE);
  - a progress photo with the camera allowed (M-139, NONE: the emulator has no camera);
  - the poster's "Join first" detour that returns to check-in (M-186);
  - the routine editor beyond Swap (M-76);
  - workout photos (M-63);
  - the typo "Keep it?" question, never asserted (M-35).
- On the watch:
  - the watch clearing when the phone ends the workout (W-16, NONE);
  - a watch reboot mid-rest (W-13, NONE);
  - DND on the watch (W-15, NONE).
- Two never-run conditions sit across many rows:
  - Android 15/16 (never in the release gate);
  - the first notification prompt answered "Allow" by hand.
