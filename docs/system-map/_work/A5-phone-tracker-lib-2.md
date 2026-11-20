# A5-phone-tracker-lib-2 checkpoint

Output: docs/system-map/_work/out/A5-phone-tracker-lib-2.jsonl (120 rows, 0 findings). All 9 features done.

F-phone-1111: 5 journeys, 7 type lines
F-phone-1114: 9 journeys, 15 type lines (member and system)
F-phone-1107: 4 journeys, 8 type lines
F-phone-1115: 5 journeys, 7 type lines
F-phone-1116: 4 journeys, 8 type lines
F-phone-1119: 5 journeys, 7 type lines
F-phone-1120: 4 journeys, 8 type lines
F-phone-1121: 5 journeys, 7 type lines
F-phone-1117: 4 journeys, 8 type lines

## Entities
- No entity in entities.json for data kept only on the phone (folders, routines, workouts, sets, measures, photos, the guide mark, In use choices). Those journeys leave writes/reads empty.
- E-crm-records used for the gym's plans (supabase/migrations/0024_workout_plans.sql:5: a plan is one crm_records row). E-gym-wods for "Workouts of the day". E-gym-body-measurements for the trainer's read-only entries on Measures.
- Not checked: whether the first routine reaches E-member-items (cloud copy) when signed in.

## Seen in passing (not sure enough for a finding)
- Promise P-A7-whats-new-2-38 says In use shows "how many kg you need to beat your previous total"; inUse.ts:196-205 (R-346) replaced that with "Previous ..." / "Next ..." lines. An old What's-new note; the promise text is out of date.
- Promise P-A7-whats-new-2-14 says "Suggested reps never drop below what each set did in your previous workout at the same weight". sameSetHint.ts:46-52 scales last time's same set down when today's sets are weaker and caps it at the set just done, so the grey hint can fall below last time. Needs a check of whether 2-14 is about the Target or the grey hint.
- Promise P-A7-pilot-65 / P-A7-legal-2-58 say progress photos never leave the phone; with "Include photos in my backup" on, shrunk copies go into Android's backup to Google (photoBackup.ts:1-8). Fine if "leave" means MettleUp; the wording is absolute.
- gymPlansSync.ts:93: lastAsked is set before the ask, so an offline or failed ask blocks the next one for 10 minutes unless a pull to refresh forces it.
- app/routines/first.tsx:91-104: Skip asks "Leave without saving?" only when exercises are picked; typed folder and routine names are dropped with no question.
- historyRange.ts:14: a /history link takes any NNNN-NN-NN as a day (2026-02-31 passes).
- firstRoutine.ts:82: dayTypeFor reads only a-z, so a Hindi routine name is always Full Body.

## Could not check
- No test coverage was looked up (coverage "unknown" on every journey). Nothing run on the device.
