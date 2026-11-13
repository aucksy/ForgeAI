# Exercise pictures: decisions and run log

The one central record for the MettleUp exercise pictures (start + end stills of the grey 3D athlete for
exercises with no RepDB picture). Used by every chat and by the daily scheduled job
(`~/.claude/scheduled-tasks/mettleup-daily-exercise-pictures/SKILL.md`).

**Approved look:** (none: look A retired 13 Nov 2026, R-489. New pictures must match the main RepDB set: drawn man, orange tank top. Do not export until a new look is filled in here.)

(Owner, 12 Nov 2026: look A approved, and "I will not need to approve them going forward. You can just review them
yourselves, ensure they are accurate, nothing incorrect and just finalize them yourself." So no owner step: every
picture that passes the three-way review goes into the app; any known miss stays out. Samples page:
https://claude.ai/artifact/1ZwD5CZb1LPZCK58DQ6huw)

## Where everything is (never copy the lists into this file: they are rebuilt from disk)
| What | Where |
|---|---|
| Which exercises have no picture, and each one's status | `python tools/exercise-anim/picture_status.py` (`--table` for all, `--next 20` for the next keys). Its top comment says how the list is derived. |
| Research per exercise | `tools/exercise-anim/research/<key>.json` (short form "v1-stills", research/FORMAT.md) |
| Recipe (poses) per exercise | `tools/exercise-anim/specs/<key>.json` (stills: poses `start`/`end`, a hold: `hold`) |
| QA result per exercise | `tools/exercise-anim/qa.json`: `rendered` (date + run id), `qa` pass/fail, `reason`, `tries` |
| Rendered stills (transparent PNG, no look) | GitHub release `exercise-stills` on aucksy/ForgeAI: `<key>__start.png`, `<key>__end.png` (QA-pass only) |
| Render in the cloud | `.github/workflows/exercise-clips.yml`, inputs `keys`, `mode: stills`, `publish: false` |
| Apply a look | `python tools/exercise-anim/export_pictures.py <stills_dir> <out_dir> --look <A/B/C> --theme dark` |
| App folder for our pictures | `apps/mobile/assets/exercise-pictures-own/` (committed; ours, CC0). `export_pictures.py --index` rewrites `apps/mobile/src/tracker/catalog/ownPictures.ts`; `picturesFor()` falls back to it (RepDB wins). Test: `EXPECTED`/`HOLDS` in apps/mobile/test/tracker/exercisePictures.test.ts. UAT: qa-device part `upic` (apps/mobile/qa/uat-rel-pics-own.yaml) |

## Rules the daily job follows
- Order: library order (docs/exercise-library part A..E), only keys the pipeline has equipment for
  (`picture_status.py --next N` does this). No usage data exists yet.
- A key that failed QA twice is not picked again; list it under "Needs review" below.
- When `--next` returns nothing, the queue for today's props is empty: build the next prop family in
  `pipeline/forgeanim/props.py` instead (order: barbell + plates, then cable column, then machines), add
  it to `READY_EQUIPMENT`/`NEEDS` in picture_status.py, and continue.
- Wiring into the app (only after "Approved look:" is filled): export with that look into
  `apps/mobile/assets/exercise-pictures-own/`, extend the app's picture list so these keys show Start/End like
  the RepDB ones (no RepDB credit for ours), add a test that every listed file exists, UAT the exercise page,
  then add "Exercise pictures: +N exercises (keys)" to PROGRESS.md "Waiting for release". Never release.

- One-sided moves: set `"highlight_side": "L"` (or `{"mask": "L"/"R"}`) in the recipe so only the working side is red
  (suitcase carry: forearm on the loaded side, obliques on the other side).
- The rig has only CLOSED FISTS. A move whose correct form needs flat palms on the floor (burpee, hindu push-up,
  push-up family) or cupped palms (waiter curl) cannot pass until the rig gets an open-hand pose. Do not retry them
  before that; build the open hand first.
- A free hand must rest on something real (hip, belly, pad, wall, bench). A raised or open floating hand fails.
- Floor holds seen from straight above (side plank, Copenhagen plank) read as lying down: camera from the front-side,
  low, with the forearm under the shoulder.
- The fresh reviewer gets ONLY the look-A pairs and the names. Check each claim yourself (it was right on 12 of 15 on
  12 Nov).

## Needs review (failed QA twice)
- burpee, hindu_push_up, waiter_curl: need an open-hand pose in the rig (see Rules). 
- chest_supported_reverse_fly, incline_y_raise: the "kneel on a flat bench" set-up reads wrong; needs an incline bench
  prop (chest on the pad, feet on the floor) and both arms keyed the same.
- copenhagen_plank: camera from above, straight support arm; re-pose with forearm under the shoulder, camera low.
- curtsy_lunge: back leg must cross BEHIND the front leg (to the other side), not step back to its own side.
- dumbbell_leg_curl: hands must hold the bench legs/edge (they hang open).
- seated_dumbbell_calf_raise: both feet on the block in both pictures, the hand ON the dumbbell.
- seated_knee_tuck (3 tries): seat 2.8 cm into the floor; lift the root before anything else.
- weighted_russian_twist: second hand floats open; both fists on the handle or plates.
- zottman_curl: both arms the same at the end (palms down, forearms level), dumbbells clear of the stomach.
- neutral_grip_dumbbell_press: lying on a FLAT bench the head hangs off the pad and the back arches. Fit the body with
  probe_bench.py (RECIPES.md "Getting a body onto equipment") before the next try. tate_press and
  single_arm_lying_dumbbell_extension passed with rot -90 + spine -1, so copy their root and bones.
- knee_plank (taken out of the app 12 Nov): no muscle shows red; the abs sit under the body from this camera. Same fix
  as the other floor holds: camera from the front-side, low, so the abs show. Then the usual three-way review.
- plank_shoulder_tap, rkc_plank: 5 cm into the floor. 12 Nov finding: it is the TOES, not the hands (feet fixed at ankle
  height 0.165 with the foot tipped 70 deg). Put the body back and set the ankle to 0.218.

- side_plank (13 Nov, 2 tries): forearm and top hand now right, but the floor-side obliques show only a small faint red
  patch from the front camera. Needs a camera that sees the floor-side waist (low, from the front-below or the feet) or
  a stronger mask there; keep the head in line with the spine.
- reverse_grip_bench_press, behind_the_head_skull_crusher (13 Nov, 2 tries each): on the FLAT bench the hands land
  ~15-20 cm further toward the head than the torso-frame arm maths says (bar at the collarbone instead of the lower chest;
  bar far past the head). Run measure_press.py in the cloud (add it to the stills checks) and set the angles from its
  numbers before the next try.
- decline_machine_chest_press, incline_machine_chest_press, iso_lateral_chest_press (13 Nov, 2 tries each): the
  plate-loaded press levers still pass in front of the face or through the chest/frame. Needs a real converging-lever
  layout: pivots BEHIND and ABOVE the shoulders, levers outside the shoulders, handles at chest height, plus a back pad
  on the decline seat. Check every lever against the head/chest with a clearance number in the log before rendering.
- standing_leg_curl (13 Nov, 2 tries): pose and roller placement read right, but the roller lever is 40 cm at the start
  and 54 cm at the end. Pin the roller on a fixed-length lever (bisect pivot at the knee axis) and use a camera from
  behind-left so the hamstrings show.
- treadmill_run, outdoor_run (13 Nov, 2 tries): the end picture is a two-footed flight with the same arm leading. Make
  the end the opposite stance (other foot down, other arm forward); on the treadmill also shorten the handrail or move
  the runner back so it does not end at his knee.
- walking (13 Nov, 2 tries): the start has both hands together in front of the belly; copy the end picture's arm swing,
  mirrored.

## Run log (newest first)

### 13 Nov 2026 (machine and cardio helper; render runs 43449175969, retry 43452963165)
- New prop family: plain MACHINE geometry built from the recipe (`"machine"` parts: boxes, cylinders, rods, a weight
  stack; levers whose pivot keeps their length the same at start and end, handles that follow the fists). The log prints
  each lever length at the key frames. Research (19 files, citations checked by PMID) + recipes for 19 machine/cardio keys.
- ADDED (12): incline_machine_fly, smith_machine_incline_press, stationary_bike, air_bike, stair_climber (first try);
  machine_lat_pulldown, iso_lateral_row, iso_lateral_high_row, iso_lateral_low_row, leg_press_calf_raise, elliptical,
  incline_treadmill_walk (retry: rows and pulldown shot from behind-left so the back shows; calf-raise plate under the
  balls of the feet; elliptical levers on the front column; treadmill feet on the belt). 45 exercises in the app now.
- DROPPED (7, at 2 tries -> Needs review): the three plate-loaded chest presses (levers across the face/chest),
  standing_leg_curl (lever changes length), treadmill_run and outdoor_run (end reads as a hop), walking (start arms).
- Cannot be shown honestly (picture_status NEEDS + qa.json): swimming (needs water), hiking (needs a trail). Not built,
  reason in NEEDS: assisted_chin_up, machine_pullover, chest_supported_t_bar_row, smith_machine_deadlift,
  smith_machine_good_morning, reverse_hack_squat, belt_squat, glute_kickback_machine, rotary_torso_machine.

### 13 Nov 2026 (daily job; render runs 43370176409, retry 43374536640)
- `--next` had only side_plank left, so per Rules the next prop family was built: a straight BARBELL
  (`props.barbell`, Olympic or short curl bar) held by both hands. `animate.place_bars` puts the bar through both fist
  centres, so it can never miss a hand (the log prints the hand gap and that each fist is square on the bar: 0.0 deg on
  every key). Barbell keys that need more than a straight bar are listed in picture_status.py NEEDS.
- Research (5 files, peer-reviewed first) + recipes for wide_grip_barbell_curl, barbell_21s, incline_barbell_skull_crusher,
  reverse_grip_bench_press, behind_the_head_skull_crusher; side_plank retried.
- ADDED (3): wide_grip_barbell_curl, barbell_21s, incline_barbell_skull_crusher. Fresh reviewer passed the two curls; it
  called the skull crusher a pullover, but the front view shows the upper arms vertical and the library step says
  "lower the bar behind your head", so it stays. 27 exercises in the app now. Release `exercise-stills` has their PNGs.
- DROPPED (3, all now at 2 tries -> Needs review): side_plank (main muscle red too faint), reverse_grip_bench_press and
  behind_the_head_skull_crusher (flat-bench arm offset, see Needs review).
- UAT flow upic now also opens Wide-Grip Barbell Curl (first barbell picture): green on both profiles (runs 43379493880
  owner, 43379496940 default). Pictures read: Wide-Grip Barbell Curl Start/End (whole athlete and bar, card colour
  behind), Tate Press, Hammer Curl, Wall Sit, no-picture case and RepDB Barbell Curl unchanged. CI 43379475365: mobile
  tests green in all 3 time zones; its only red step is the dashboard test from another session's R-480 site change.
- Next: jm_press, standing/seated_barbell_overhead_extension, barbell_step_up, seated_barbell_calf_raise (`--next`), then
  the cable column prop family.

### 12 Nov 2026 (second review by another helper)
- A separate fresh-eyes review of the first 25 found knee_plank shows no red muscle at all (confirmed by eye on the
  app file). Taken out of the app: 24 exercises in the app now. Everything else in the app matched what this review
  passed or had already been re-rendered with fixes.

### 12 Nov 2026 (daily job, first run after the look was approved; render run 43161740739)
- WIRED INTO THE APP: our pictures now show on the exercise page (ownPictures.ts fallback, test, UAT part upic).
- Re-checked the 25 earlier QA passes with close-ups + a fresh reviewer: 13 were clean and went in; 12 had a real
  miss (resting arm lit red on one-arm moves, free hand floating, wrong grip, camera hid the move) and were held back.
- Pipeline fixes: one-side lighting (`highlight_side`); the root's lean is now baked per pose (it was always the last
  pose's); upright / spine-aligned dumbbells no longer collapse; `prop_offset`; a dumbbell between the feet; the stills
  log WHERE the lowest point is.
- Rendered 25 (the 12 held back, 12 retries, new side_plank). Passed 12: incline_bench_preacher_curl,
  incline_neutral_grip_dumbbell_press, seated_rear_delt_fly, single_arm_dumbbell_curl, single_arm_dumbbell_lateral_raise,
  single_arm_dumbbell_upright_row, single_arm_lying_dumbbell_extension, single_leg_calf_raise, sissy_squat,
  suitcase_carry, two_arm_dumbbell_kickback, weighted_crunch. Failed 13 (reasons in qa.json; see Needs review).
- stomach_vacuum: research only, marked needs-prop (the rig cannot draw the belly in; no fake picture).
- In the app now: 25 exercises (13 + 12). Release `exercise-stills` holds exactly those 25.
- UAT part upic green on both profiles (runs 43167002827 default, 43166999620 owner; first try 43163437571 failed on a search-box script bug, fixed). Pictures read: Tate Press Start/End, Alternating Hammer Curl, Wall Sit one Hold picture, Iso-Lateral Chest Press none, Barbell Curl (RepDB) unchanged. CI green (43159906754).
- Next: only side_plank is left for `--next`; the rest need rig work (open hand) or props. Next prop family per Rules
  (barbell + plates), plus an incline-bench setting for the chest-supported moves.

### 12 Nov 2026 (first 40, main chat helper; runs 43079162675 + retry 43082982264)
- Picked 40 keys the pipeline can build (dumbbell, bench, box, bodyweight) in library order. 4 helpers wrote the
  research files (short form, 2+ opened sources each) and recipes; nothing rendered on the laptop.
- Pipeline: `make_clip.py ... stills` (transparent start/end PNGs + QA side views + floor numbers), a `mode` input on
  exercise-clips.yml, a plain box prop, bench `rot_z`. Fixed the cloud setup: the MakeHuman server sends ~40 KB/s and
  the old cache had expired, so setup_assets.py now reads only the ~18 MB it needs, once per run (new "assets" job).
- QA: 25 of 40 pass (19 first time, 6 on the retry). Stills of all 25 are on the `exercise-stills` release.
  15 fail; reasons per key in qa.json. 12 failed once (the daily job retries them): burpee, chest_supported_reverse_fly,
  copenhagen_plank, dumbbell_leg_curl, hindu_push_up, incline_y_raise, seated_dumbbell_calf_raise, single_leg_calf_raise,
  sissy_squat, waiter_curl, weighted_crunch, weighted_russian_twist. 3 failed twice: see "Needs review".
  Fix notes for the retries: weighted_crunch / weighted_russian_twist have no hands in the recipe (add arm angles
  holding db_L at the chest); dumbbell_leg_curl cannot show a dumbbell between the feet (needs a foot-held prop, or
  mark it needs-prop); chest_supported_reverse_fly / incline_y_raise legs splay sideways (feet under the hips,
  knees off the floor; camera more from the side); burpee end hands must reach the floor.
- Samples: 3 exercises in looks A/B/C (dark + light) published privately for the owner (link above). Nothing added to
  the app (no approved look). Export script ready: export_pictures.py.
- Next: only 2 keys left that the pipeline has equipment for (side_plank, stomach_vacuum) + the 12 retries. Then the
  daily job builds the next prop family (barbell + plates first: 19 exercises), see Rules.
