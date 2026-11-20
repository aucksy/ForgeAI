# A5-phone-screens-2-2 checkpoint

Entities: the phone's own workouts, routines and folders (phone SQLite) have no entity id in entities.json.
E-member-items (the cloud copy, own only, when signed in) is used for writes of workouts and routines; pure
reads of phone-local data are left without an entity.

F-phone-203: 4 journeys, 8 type lines
F-phone-204: 6 journeys, 7 type lines
F-phone-205: 9 journeys, 7 type lines
F-phone-206: 5 journeys, 8 type lines
F-phone-207: 5 journeys, 8 type lines
F-phone-210: 7 journeys, 7 type lines
F-phone-208: 7 journeys, 7 type lines
F-phone-209: 7 journeys, 7 type lines

ALL 8 ITEMS DONE. Output: docs/system-map/_work/out/A5-phone-screens-2-2.jsonl (111 rows: 50 journeys, 59 type lines, 2 findings).
Findings: FN-A5-phone-screens-2-2-01 (reorder save failure silent), -02 (rename-on-leave failure swallowed).

Seen in passing (not sure enough for a finding):
- Live workout Discard: `void discard().then(...)` has no catch; a failed discard leaves the screen with no word (session/active.tsx:419-423).
- Saved workout Delete asks "This removes the workout and its sets." and does not say the workout's photos go too; whether photos are deleted was not checked.
- Monthly report shows "Against <month before>" only once the month is over (report/[period].tsx:209); a running month never shows the change. Looks deliberate.
- Routine preview marks a superset by group id over the whole routine, not by neighbours (routines/view/[id].tsx); a group split by a reorder would still say SUPERSET on both parts.

Could not check:
- Whether finishing a workout also feeds the gym's leaderboard days, busy-machine starts or the member rollup (E-gym-member-days, E-gym-exercise-starts, E-member-summary): that code is outside these entry points.
- What a new plan from the trainer does to a routine the member edited inside the trainer's plan folder.
- The exact words of the first-routine save error and the "Save as routine" saved/failed lines (constants imported from other files).
- No tests were opened; every journey has tests [] and coverage unknown.
