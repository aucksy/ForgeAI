# A5-phone-tracker-components-1-3 checkpoint

F-phone-726: 4 journeys, 8 type lines
F-phone-729: 4 journeys, 8 type lines
F-phone-730: 6 journeys, 7 type lines
F-phone-705: 5 journeys, 7 type lines
F-phone-732: 5 journeys, 7 type lines
F-phone-733: 4 journeys, 8 type lines
F-phone-734: 5 journeys, 7 type lines
F-phone-721: 5 journeys, 7 type lines

## Entities
- No entity row exists for phone-local data (the open workout, tracker settings machineStep / inUseAfterSet / inUseByExercise). Workouts, routines and folders are linked to E-member-items (their cloud copy). F-phone-734 and F-phone-721 settings have no entity: left out.

## Promises
- The import card line 'Your file is read on your phone. Nothing is uploaded.' (apps/mobile/src/tracker/services/importFlowWords.ts:20) is NOT in promises.json; not linked.
- No promise found for the hold timer (searched timer, plank, hold), cardio boxes (speed, incline, cardio) or the IN USE sign (in use, rest).

## Seen in passing (not sure enough for a finding)
- F-phone-729: after tapping 'Stopwatch' on a set with a goal, there is no way back to the countdown in that opening (HoldTimerSheet.tsx:151-155).
- F-phone-726: the picker row press has no busy guard; a fast double tap may create two routines (FolderPickerSheet.tsx:37, WorkoutRoutines.tsx:315-320). Not proven.
- F-phone-726: folderChoice.ts:6 comment says the plan row reads 'Today will include it'; the code says 'Up next will include it' (comment drift only).
- F-phone-730: after an import, new and extended sessions are sent to Health Connect (app/import/index.tsx:197-207, 425). Not checked whether this honours the 'asks before sending past workouts' choice (P-A7-whats-new-3-25) or P-A7-phone-watch-3-06 'Only workouts logged in MettleUp are sent.'
- F-phone-734: ticking 'Show after every set of this exercise' with Settings' master switch off turns the master on (MachineInUse.tsx:216-219); whether that also makes other exercises open IN USE by their equipment default was not checked.
- F-phone-721: the choices are only '2.5 kg' and '5 kg'; a member on lb and miles has no lb steps (targetChoices.ts:68-72).

## Could not check
- Tests: no test file was opened, so every journey has tests [] and coverage unknown.
- Whether the watch shows sets saved by the hold timer, machine details or the IN USE rest state (no watch code read).
- The Hevy link 'not found' wording (readProblem) was not read; journey J-F-phone-730-04 step 4 says 'a plain message'.

## Status
All 8 items done.
