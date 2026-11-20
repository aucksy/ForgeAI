# A5-phone-tracker-components-2-2 checkpoint (20 Nov 2026)

F-phone-816: 5 journeys, 7 type lines
F-phone-805: 4 journeys, 8 type lines
F-phone-806: 7 journeys, 7 type lines
F-phone-811: 5 journeys, 7 type lines
F-phone-818: 3 journeys, 9 type lines
F-phone-817: 6 journeys, 7 type lines
F-phone-819: 5 journeys, 7 type lines
F-phone-820: 6 journeys, 8 type lines
F-phone-821: 3 journeys, 9 type lines
F-phone-814: 5 journeys, 8 type lines

All 10 items done. 127 rows in _work/out/A5-phone-tracker-components-2-2.jsonl (126 journey/type rows, 1 finding).

## Entities left out (none fits)
- The phone's own local data has no entity: the live workout (supersets, swaps), local body weight log, meta keys
  (strength_standard, watch_install_start, watch card mark), demo flag, trainer video lists in AsyncStorage,
  routines and plans on the phone. Only E-member-items (cloud copy of phone workouts) was used, for the history list
  and the signed-in switcher line.
- Tab bar "Ask about your workout" replies linked as E-trainer-questions (closest match; not proven to be the same table).
- Trainer video links from workout plans linked as E-crm-records (workout plans live there, per entities.json).

## Promises
- "Everything stays on this phone." (SwitcherCard / services/switcher.ts:30) is not in promises.json: no id linked.
- No promise found for superset, up next, tab bar, demo strip or the history list.

## Seen in passing (not findings)
- Demo strip: when removal finds the data is no longer the demo, nothing is deleted and nothing is said; the strip
  just goes once the flag refreshes (onboarding/demoRemoval.ts:32-36).
- ExerciseLogCard.tsx header comment says swap is "before a set is ticked"; the code allows it after a tick too (LW-31).
- What happens to ticked sets on a swap after a tick was not read (activeWorkoutStore swapExercise): J-F-phone-806-06 step 2.
- Feature F-phone-811 says "welcome screen and empty Home": the welcome screen no longer draws SwitcherCard, it has
  its own "From Hevy" / "From Strong" rows (onboarding/components/WelcomeScreen.tsx:626-643); journey written for both.
- Welcome pick lives in memory only (services/switcher.ts:8): closing the app before Home loses it.

## Could not check
- Tests: no test file opened, so every journey is coverage "unknown".
- Whether ask-reply unread counts are scoped to the linked member on the server side.
