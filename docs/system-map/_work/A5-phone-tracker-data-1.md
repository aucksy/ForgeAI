# A5-phone-tracker-data-1 checkpoint

F-phone-1000: 6 journeys, 7 type lines
F-phone-1003: 5 journeys, 8 type lines
F-phone-1006: 5 journeys, 8 type lines
F-phone-1021: 4 journeys, 8 type lines
F-phone-1004: 4 journeys, 8 type lines
F-phone-1008: 6 journeys, 7 type lines
F-phone-1011: 5 journeys, 8 type lines
F-phone-1014: 4 journeys, 8 type lines

All 8 items done. 102 rows (39 journeys, 62 type lines, 1 finding) in _work/out/A5-phone-tracker-data-1.jsonl.

## Entities
- No entity exists for the phone's own local tables (body_weight, body_measurements, progress_photos, exercises,
  exercise_prefs, set_entries, personal_records, workout_plans, plan_days, meta hidden_exercises / importOriginalStarts).
  Type lines name "unknown" for them. Writes list E-member-items only where the table is in the cloud copy / backup
  (apps/mobile/src/cloud/snapshot.ts:55-128; apps/mobile/src/cloud/copyLocal.ts:158-173). progress_photos is NOT in it.
- E-gym-body-measurements used for the gym-recorded entries shown on the Body screen.

## Seen in passing (not sure, not findings)
- E-member-summary lists a weight_kg field sent by the phone (entities.json, supabase/migrations/0001_init.sql:34-52),
  while promises P-A7-phone-watch-2-29 / -2-28 say MettleUp never sends body weight to the gym. Not checked whether the
  phone still fills it or whether staff can read it. Worth a privacy lens check.
- Counting change in a live workout saves in the background and drops a failure silently
  (apps/mobile/src/tracker/store/activeWorkoutStore.ts:2561-2564): card can show a counting that was never saved.
- Merge picker: when mergeRefusal returns same / library / not-found, the screen just returns with no word
  (apps/mobile/src/app/exercise/[id].tsx:302). The picker may already exclude these; not checked.
- Body screen Delete has no busy guard: a double tap adds two Undo items for one entry (harmless restore, wrong count
  "2 changes"). apps/mobile/src/app/measures/index.tsx:183-201.
- Editing a weigh-in to another day with no clash adds no Undo item (only a replace does): by design per the comment.
- folderRepo createFolderWithRoutines and followFolder read (next order / settings) outside the write queue
  (folderRepo.ts:633, 358): two writes at once could share a folder number. Low risk.
- getCarriedNote orders by start time only and has no "before this workout" limit: correcting an old workout may carry
  the newest workout's note (exercisePrefs.ts:41-59).

## Could not check
- Real tests for each journey: not opened (tests left empty, coverage unknown). Tests exist by name:
  apps/mobile/test/tracker/auditPhase5Body.test.ts, auditPhase5Fixes.test.ts.
- Progress photo date picker words: not read (photos/index.tsx only the save path).
- Whether the watch shows previous values, counting and rest per exercise (T11-watch picked from promises only).
- Phone app has no language setting found (no T8-language used).
