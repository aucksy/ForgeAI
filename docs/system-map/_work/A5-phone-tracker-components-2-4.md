# A5-phone-tracker-components-2-4 checkpoint

F-phone-830: 3 journeys, 9 type lines
F-phone-831: 7 journeys, 7 type lines
F-phone-832: 8 journeys, 7 type lines
F-phone-833: 4 journeys, 8 type lines
F-phone-834: 5 journeys, 8 type lines
F-phone-835: 5 journeys, 7 type lines
F-phone-836: 3 journeys, 9 type lines
F-phone-837: 7 journeys, 7 type lines
F-phone-838: 5 journeys, 8 type lines

All 9 items done. Output: docs/system-map/_work/out/A5-phone-tracker-components-2-4.jsonl (117 journey/type rows + 1 finding).

## Entities
- Phone-local data (SQLite workouts, routines, folders, own exercises) has no entity of its own; E-member-items (the member's own cloud copy: kinds w, r, x) is used for those.
- No entity fits: muscle tips choices (AsyncStorage forgeai-muscle-tips, F-phone-830) and exercise photos/videos (files in exercise-media/, F-phone-835). Left out.

## Promises
- No promise row for: "It stays on this phone." (exercise photo sheet, formChoices.ts:68), "Half the sets, the same weights. Kept out of your records." (Easy weeks sheet, WorkoutRoutines.tsx:659), the Muscle tips caption (WorkoutPrefsCard.tsx:485). Worth adding in A7.

## Seen in passing (not sure, not findings)
- "New routine" has no busy guard before createRoutine (WorkoutRoutines.tsx:326-343); two fast taps may make two routines.
- Exercise photo picked then the screen closed with X: picked files are deleted only inside Save (new.tsx:280-282), so they may stay on the phone.
- Muscle tips switched off hides "Muscles you asked to skip" (WorkoutPrefsCard.tsx:489); there is no way to bring groups back without switching tips on first.
- A backup restored on another phone carries media_uri paths (cloud/snapshot.ts:58) to files that are not there.
- Whether the 10-minute gym-plan resync keeps a member's easy-week setting on a gym-sent folder was not read.
