# Exercise pictures: decisions and run log

The one central record for the MettleUp exercise pictures (start + end stills of the grey 3D athlete for
exercises with no RepDB picture). Used by every chat and by the daily scheduled job
(`~/.claude/scheduled-tasks/mettleup-daily-exercise-pictures/SKILL.md`).

**Approved look:** A (dark)

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

## Run log (newest first)

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
