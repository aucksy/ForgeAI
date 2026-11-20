# A5-phone-tracker-services-1-4 checkpoint

F-phone-510: 5 journeys, 8 type lines
F-phone-532: 6 journeys, 7 type lines
F-phone-533: 5 journeys, 8 type lines
F-phone-530: 5 journeys, 7 type lines
F-phone-535: 4 journeys, 8 type lines
F-phone-537: 5 journeys, 7 type lines
F-phone-538: 5 journeys, 8 type lines
F-phone-539: 5 journeys, 8 type lines

## Entities
- No entity id fits: all 8 features read and write phone-local SQLite tables (workout_sessions, plan_days, plan_exercises, meta, body_weight, body_measurements, progress photo files). entities.json has only server tables; E-member-items (cloud copy) is not written by these flows. writes/reads left empty; jtype entity "unknown" with the local table named in the note.

## Seen in passing (not sure enough for a finding)
- F-phone-535: features.json says tier "free", but app/one-rep-max.tsx:31-34 sends a member without Plus to /plus (canUseNow('calculators'), R-461). Catalogue row looks stale.
- F-phone-532: tracker/services/livePlan.ts:71 builds each plan step without pausedAt, so the steps the native card moves to after an offline "Complete set" never start "Paused · " while the clock stands still. Did not check what OfflineTick.kt shows.
- F-phone-510: onboarding/store/onboardingStore.ts:158-168 swallows both repair failures with an empty catch and no log (the restore path at store/backupStore.ts:186 does log). A repair that fails every launch would be invisible.
- F-phone-510: importClockRepair.realFromStored uses the phone's own zone the one time it runs; a phone set abroad on that start moves old imports to that clock and marks the repair done.
- F-phone-537: 'Save to phone gallery' has no busy state (app/photos/index.tsx:186-193).

## Could not check
- Whether gym-recorded measurements (E-gym-body-measurements, shown in Progress → Body) are in the local body_measurements table and so in the CSV (F-phone-530).
- Native card side (WorkoutCard.kt, OfflineTick.kt, restDoneRun.ts) and the watch app: not read (size limit; F-phone-532).
- Program detail screen app/programs/[key].tsx beyond its button words; no double-tap guard checked (F-phone-539).
- No tests opened: every journey coverage "unknown".
