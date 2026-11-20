# A5-phone-tracker-lib-3 checkpoint

F-phone-1108: 4 journeys, 8 type lines
F-phone-1122: 5 journeys, 8 type lines
F-phone-1123: 4 journeys, 8 type lines
F-phone-1124: 4 journeys, 8 type lines
F-phone-1118: 5 journeys, 8 type lines
F-phone-1125: 4 journeys, 8 type lines
F-phone-1126: 4 journeys, 8 type lines
F-phone-1113: 7 journeys, 8 type lines
F-phone-1127: 6 journeys, 7 type lines

All 9 items done. 115 rows in _work/out/A5-phone-tracker-lib-3.jsonl (43 journeys, 71 type lines, 1 finding).

## Entities
- No entity in entities.json fits the phone's own stored data (workouts, sets, the open workout draft, routines,
  the tracker settings). Only E-member-items (the cloud copy) fits; it is used only on the Save as routine, Edit and
  Delete journeys of F-phone-1127. Everywhere else writes/reads are left empty and type lines say "unknown".

## Could not check
- No journey was driven on a phone (analysis only). Tests listed are the ones opened; r499NextGoal / r499KgWords /
  f199 tests for F-phone-1126 and any tests for F-phone-1118, F-phone-1125, F-phone-1127 were not opened, so
  those journeys say coverage unknown.
- Whether a workout started on the watch shows as "Workout in progress" on the Up next card (F-phone-1113 type 11).

## Seen in passing (not findings)
- todayLink() (apps/mobile/src/tracker/lib/todayLink.ts:11) is called only by tests; no screen uses it. The Up next
  "See exercises" goes to /today directly (apps/mobile/src/app/(tabs)/workout.tsx:381).
- dropLine() (apps/mobile/src/tracker/lib/stepBack.ts:81) is called by nothing; the "why the target is lower" line
  comes from kgTarget.ts:155/186 instead.
- Step back is listed tier "free", but the target suggestions it belongs to can be Plus-locked
  (ExerciseLogCard.tsx:804 shows the locked line when there is no target). Tier may be wrong.
- todayGoal.ts:239-250 'sets' mode compares all planned sets with only the counted exercises' previous sets
  (the R-499 mismatch), but todayModeFor never picks 'sets' now, so it is unreachable.
- upNext.ts header says "Done today: Push 1"; the code and test say "Done: Push 1". The import card says
  "Coming from Hevy or Strong?", the lib comment says "Moving from ...".
- The feature name says "Try 40 kg today?"; the real words are "Try 40 kg this time instead of 45 kg?".
