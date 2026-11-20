# A5-phone-tracker-components-2-1 checkpoint
Entities: phone-local workout, routine and settings data has no entity id; E-member-items (cloud copy) used only where the journey reaches it. Other journeys leave writes/reads empty.
F-phone-800: 9 journeys, 7 type lines
F-phone-801: 9 journeys, 7 type lines
F-phone-810: 10 journeys, 7 type lines
seen in passing F-phone-810: one-routine link, every exercise unticked or left out, reaches the folder screen 'Add it to which folder?' (no empty guard like the follow screen); save then throws 'nothing to save' and shows a save-problem line (RoutineImportSteps.tsx:537-541, routineImport.ts:225). Confusing, not data loss.
F-phone-812: 8 journeys, 7 type lines
seen in passing F-phone-812: 'Exercises' count is session.exercises.length after splitCards, so one lift with heavy and back-off cards counts as 2 (finishSummary.ts:153). Unsure if meant.
F-phone-802: 9 journeys, 7 type lines
F-phone-803: 6 journeys, 7 type lines
F-phone-809: 6 journeys, 7 type lines
F-phone-807: 8 journeys, 7 type lines
F-phone-808: 5 journeys, 7 type lines
F-phone-815: 7 journeys, 7 type lines
seen in passing F-phone-815: ShortDayLine.tsx readLastNight(...).then has no catch; readLastNight catches its own native call, so likely safe.
could-not-check: no phone run or CI picture opened (analysis only); tests not matched to journeys (coverage unknown on every row).
DONE: all 10 items finished.
