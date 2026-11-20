# A5-phone-tracker-lib-4 checkpoint

Entity note: workouts, routines, folders, progress photos and share choices live in the phone database or phone storage; entities.json has no phone-local entity for them (E-member-items is only the cloud copy), so writes/reads stay empty there and jtype entity says "unknown". E-gyms / E-gym-logos used for the gym name and logo.

Done features:
F-phone-1128: 6 journeys, 8 type lines
F-phone-1112: 5 journeys, 8 type lines
F-phone-1129: 6 journeys, 7 type lines
F-phone-1134: 5 journeys, 7 type lines, 1 finding
F-phone-1131: 5 journeys, 7 type lines
F-phone-1132: 5 journeys, 7 type lines
F-phone-1133: 6 journeys, 7 type lines
F-phone-1130: 6 journeys, 7 type lines, 1 finding

All 8 items done. 104 rows (44 journeys, 58 type lines, 2 findings).

Seen in passing (not sure enough for a finding):
- Duplicate routine message "is in <folder>" does not use the folder-name helper, so a "From Hevy" folder reads "is in From Hevy" (WorkoutRoutines.tsx, duplicate case).
- Before/after gap words: a whole number of weeks always reads in weeks ("100 weeks apart"), anything else in days ("365 days apart"); no months or years (lib/months.ts:5-11).
- Finish-screen reasons ("2 sets fewer", "heavier", "Mostly ...") and every share-picture word are fixed English; no Hinglish path seen.
- A note whose first line happens to equal the workout name is hidden on the workout page and in shared text, for any workout, not only Hevy imports (workoutText.ts:15-20).

Could not check:
- Whether tests really check these journeys: no test files opened (row and read limits); coverage left "unknown".
- Watch side of a workout share (type 11 for F-phone-1130) and whether the watch shows routines or the finish comparison: not in my files.
- Whether the "Share before and after" button hides with fewer than two photos: entry screen not opened.
