# A5-phone-tracker-components-2-1 checkpoint
Entities: phone-local workout, routine and settings data has no entity id; E-member-items (cloud copy) used only where the journey reaches it. Other journeys leave writes/reads empty.
F-phone-800: 9 journeys, 7 type lines
F-phone-801: 9 journeys, 7 type lines
F-phone-810: 10 journeys, 7 type lines
seen in passing F-phone-810: one-routine link, every exercise unticked or left out, reaches the folder screen 'Add it to which folder?' (no empty guard like the follow screen); save then throws 'nothing to save' and shows a save-problem line (RoutineImportSteps.tsx:537-541, routineImport.ts:225). Confusing, not data loss.
