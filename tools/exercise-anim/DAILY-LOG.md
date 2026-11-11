# Exercise pictures: decisions and run log

The one central record for the MettleUp exercise pictures (start + end stills of the grey 3D athlete for
exercises with no RepDB picture). Used by every chat and by the daily scheduled job
(`~/.claude/scheduled-tasks/mettleup-daily-exercise-pictures/SKILL.md`).

**Approved look:**

(Empty = the owner has not picked a look yet. Until it holds a letter and theme, e.g. `B (dark)`, no picture
goes into the app. Samples page (private, his phone): https://claude.ai/artifact/1ZwD5CZb1LPZCK58DQ6huw
A = flat card colour, B = soft spotlight on the card colour, C = light studio tile. When he picks, write it here.)

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
| App folder for our pictures (after a look is approved) | `apps/mobile/assets/exercise-pictures-own/` (committed; ours, CC0) - not wired into the app yet |

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

## Needs review (failed QA twice)
- neutral_grip_dumbbell_press: lying on a FLAT bench the head hangs off the pad and the back arches. Fit the body with
  probe_bench.py (RECIPES.md "Getting a body onto equipment") before the next try. tate_press and
  single_arm_lying_dumbbell_extension passed with rot -90 + spine -1, so copy their root and bones.
- plank_shoulder_tap, rkc_plank: hands / forearms sink 5 cm into the floor. Moving the body does not help: the arm
  angles must put the hand or forearm ON the floor (lower elev or less elbow bend), checked with the stills numbers.

## Run log (newest first)

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
