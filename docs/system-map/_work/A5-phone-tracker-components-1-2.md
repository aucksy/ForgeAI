# A5-phone-tracker-components-1-2 checkpoint

Entity note: the phone keeps workouts, sets, routines and custom exercises in its own on-phone database; entities.json has no id for that store. Journeys use E-member-items (the cloud copy of workouts and routines) only where the code saves through to it; otherwise writes/reads are left empty.

## Done features
F-phone-711: 8 journeys, 7 type lines
F-phone-716: 6 journeys, 7 type lines
F-phone-717: 11 journeys, 7 type lines
F-phone-707: 7 journeys, 7 type lines (finding FN-A5-phone-tracker-components-1-2-01)
F-phone-723: 8 journeys, 7 type lines
F-phone-708: 6 journeys, 7 type lines
F-phone-724: 8 journeys, 7 type lines
F-phone-725: 7 journeys, 7 type lines (finding FN-A5-phone-tracker-components-1-2-02)

## Seen in passing (not sure, not findings)
- F-phone-708: under miles the Best-pace info says "1 km (0.6 mi)" but the empty row says "No set of 1 km or more yet" (records.ts:84-109, ExercisePrRows.tsx empty pace row). Small wording mismatch.
- F-phone-723: the Create offer is checked against all exercises including hidden ones, so typing the exact name of a hidden exercise may show neither the exercise nor a Create row (ExercisePickerList.tsx:145, 186). Not traced further.
- F-phone-717: the note box on the exercise card has no length limit (ExerciseLogCard.tsx:596-618), unlike the finish note (500).
- F-phone-717: E-gym-exercise-starts records which exercise was started; "MettleUp never sends which exercises you did" (P-A7-phone-watch-2-28) - gym-sees.tsx:143 says a "Share which machines I use" switch governs it. Not checked.
- F-phone-724: whether a cleared name falls back to the default name on save is not checked.

## Could not check
- Tests for every journey: not opened (coverage left "unknown").
- No on-phone entity id exists for local workouts, sets, routines and custom exercises (see entity note).

## Status: all 8 items done.
