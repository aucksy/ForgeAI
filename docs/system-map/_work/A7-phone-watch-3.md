# A7-phone-watch-3 checkpoint

Candidates: docs/system-map/_sources/promises.txt lines 1088-1126 (39). Output: docs/system-map/_work/out/A7-phone-watch-3.jsonl

## Finished units
- unit 1 (privacy, health, share): lines 1095-1097, 1099-1101, 1125-1126 done -> rows 01-08
- unit 2 (deletion, photos, backup, pause): lines 1093, 1111-1112, 1122-1124 done -> rows 09-14
- unit 3 (plans, targets, sounds, records, routines, import): lines 1088-1089, 1091, 1102, 1106-1110, 1113, 1119, 1121 done -> rows 15-26
- unit 4 (not promises): 13 lines below
- ALL 39 CANDIDATES DONE: 26 rows + 13 not-a-promise lines

## Not a promise
- not a promise: apps/mobile/src/tracker/engine/reports.ts:318, a month-report fact about the member's own sets ("got only N sets"), not a statement of what the product does
- not a promise: apps/mobile/src/tracker/lib/useWorkoutActions.ts:150, a question (pop-up title); the body on :151 says what is removed and is not a candidate
- not a promise: apps/mobile/src/tracker/lib/workoutTab.ts:223, a question (pop-up title); the body on :224 is not a candidate
- not a promise: apps/mobile/src/tracker/phone/healthRead.ts:341, a status line (no steps yet today)
- not a promise: apps/mobile/src/tracker/services/coachNote.ts:302, instruction text sent to the AI model, never shown to a user
- not a promise: apps/mobile/src/tracker/services/coachNote.ts:305, instruction text sent to the AI model, never shown to a user
- not a promise: apps/mobile/src/tracker/services/coachNote.ts:306, instruction text sent to the AI model, never shown to a user
- not a promise: apps/mobile/src/tracker/services/routineLink.ts:276, an error message about a partial read
- not a promise: apps/mobile/src/tracker/services/routineLink.ts:284, an error message
- not a promise: apps/mobile/src/tracker/services/routineLink.ts:287, an error message
- not a promise: apps/mobile/src/tracker/services/routineLink.ts:365, a code comment
- not a promise: apps/mobile/src/tracker/services/routineLink.ts:426, a code comment
- not a promise: apps/mobile/src/tracker/services/targetChoices.ts:49, a choice label in STUCK_CHOICES, which no screen imports (grep of apps/mobile/src found no use outside targetChoices.ts); progression.ts:348 says the setting is no longer read

## Could not check
- Row 10 (discard deletes the sets): the discard() store action was not read (size limit kept for privacy rows).
- Row 17 (gym's smallest plates): only the header comment at weightLadder.ts:14 was read, not the ladder code or a test body.
- Row 25 (exercises from last empty workout) and row 26 (next hold target): the code path and test bodies were not opened.
- Rows 02-03: no test found that proves the member's name is absent from every share picture.
- Row 05: demo workouts leaving the phone by backup or gym sync was not checked (Health Connect route only).
- Row 18: the native code that mutes the rest-over sound was not read.
- Lines read: about 1,100 of the 1,500 limit.
