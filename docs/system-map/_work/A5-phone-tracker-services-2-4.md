# A5-phone-tracker-services-2-4 checkpoint

F-phone-633: 5 journeys, 7 type lines
F-phone-614: 6 journeys, 7 type lines
F-phone-617: 5 journeys, 7 type lines
F-phone-635: 5 journeys, 7 type lines
F-phone-636: 4 journeys, 8 type lines
F-phone-637: 4 journeys, 8 type lines
F-phone-638: 6 journeys, 8 type lines
F-phone-639: 6 journeys, 7 type lines
F-phone-616: 5 journeys, 7 type lines

Done: all 9 items. Output: docs/system-map/_work/out/A5-phone-tracker-services-2-4.jsonl (112 rows: 46 journeys, 66 type lines, 0 findings).

## Entities
- No entity exists for phone-only data (local workouts, routines, workout photos, rest/sound settings, watch versions, AsyncStorage trainer-video links). Workouts and routines use E-member-items (their cloud copy), as earlier A5 items did. Workout photos, alerts, sounds and the watch pop-up have no fitting entity: left out.
- Trainer videos read E-crm-records (gym workout plans) and E-gym-wods.

## Seen in passing (not findings)
- Saved workout page date line always prints a 24-hour clock ("07:02") and takes the hour from the phone's time zone while the day comes from the saved date (workoutDetail.ts detailWhen); the shade card follows the phone's 12/24-hour setting. Possible mismatch, not proven.
- Delete a workout: "records catch up" outcome is never shown to the member (by design per HI-12). Whether the server copy row is removed on delete was not followed (promise P-A7-legal-2-26).
- Old JS rest alert path (no native rest card) sets sound false when Workout sounds is off, but on Android 8+ the channel's default sound wins; only reaches builds without the native piece.
- Promise P-A7-whats-new-2-96 says "Save a backup" holds photos; workoutPhotos.ts says workout photos are left out of the Drive backup. Not checked which photos the file holds.

## Could not check
- Tests: none opened; every journey coverage "unknown".
