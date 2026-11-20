# A5-phone-tracker-data-2 checkpoint

F-phone-1001: 5 journeys, 7 type lines
F-phone-1020: 5 journeys, 7 type lines
F-phone-1019: 4 journeys, 8 type lines
F-phone-1010: 4 journeys, 8 type lines
F-phone-1012: 7 journeys, 7 type lines
F-phone-1018: 5 journeys, 7 type lines
F-phone-1015: 5 journeys, 7 type lines
F-phone-1016: 5 journeys, 7 type lines

All 8 items done. 98 rows in docs/system-map/_work/out/A5-phone-tracker-data-2.jsonl. No finding rows.

## Entities
- No entity exists for the phone's own SQLite tables (body_measurements, user_profile, plan_days / plan_exercises,
  workout_sessions / set_entries, exercise_prefs). Journeys leave them out of writes/reads; type lines use "unknown".
  Only the cloud copy (E-member-items), gym mate share (E-gym-mate-profiles) and gym-recorded measurements
  (E-gym-body-measurements) are linked.

## Seen in passing (not sure enough for a finding)
- F-phone-1010: the feature name says "from a chosen day", but the only button sets today
  (apps/mobile/src/app/exercise/[id].tsx:323-337 calls setRecordsFrom(ex.id) with the default todayISO()).
- F-phone-1012: "Update routine" keeps an existing row's set count with no 50-set cap, while new rows are capped
  (apps/mobile/src/tracker/db/routineRepo.ts:449 vs :474).
- F-phone-1012: "Save as routine" runs createRoutine and syncRoutineToWorkout as two separate queued jobs
  (routineRepo.ts:542-543); a failure in the second leaves an empty routine and a retry makes a second one.
- F-phone-1019: getLastDoneDates takes MAX(date_iso) and MAX(started_at) separately (recentExercises.ts:34), so after
  a date edit the day and the start time can come from two different workouts.
- F-phone-1020 / F-phone-1016: bio and workout name are cut with String.slice (profileExtras.ts:29,
  edit-profile.tsx:270, workoutNames.ts:30), which can split an emoji at the limit.
- F-phone-1016: clearing the name and tapping "Save name" does nothing and says nothing (workoutNames.ts:40); the
  member cannot go back to the day-type name.
- F-phone-1020: setProfileExtras is an UPDATE with no row check (profileExtras.ts:69); with no user_profile row it
  saves nothing yet the page shows "Saved".

## Could not check
- Whether the watch shows routines, the record start day, or a workout being edited (no watch code read).
- What the member sees when an edit removes every working set (activeWorkoutStore.ts:2910 returns null).
- Whether the gym panel shows the member's bio.
