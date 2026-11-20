# A5-phone-cloud-backup-ai-1 checkpoint

F-phone-1511: 7 journeys, 7 type lines
F-phone-1512: 4 journeys, 9 type lines
F-phone-1510: 4 journeys, 8 type lines
F-phone-1520: 6 journeys, 7 type lines
F-phone-1523: 6 journeys, 7 type lines
F-phone-1530: 5 journeys, 7 type lines

All 6 items done. Rows: 78 (32 journeys, 45 type lines, 1 finding) in _work/out/A5-phone-cloud-backup-ai-1.jsonl.

## Entities
- No entity exists for the phone's own tables (workouts, routines, measurements, photos, settings, profile on the phone).
  Backup save, restore and undo journeys therefore carry no writes/reads; type lines use "unknown".
- No entity for the sign-in account itself (Supabase auth user). E-member-items used for the saved copy; E-profiles for
  the gym sign-in kept on delete.

## Seen in passing (not sure, not findings)
- The account card says "Progress photos stay on this phone" and the privacy notice says progress photos never leave
  the phone, but promise rows P-A7-phone-watch-1-39/40 ("Off: photos stay on this phone only", "Turning this off
  deletes the copies") suggest a photo-copy switch exists. Worth checking the two promises still agree.
- Address switch: a phone with no internet at all marks our good addresses as failed for 10 minutes, so for the next
  10 minutes after coming back online requests go to Supabase's own address (the one a block would stop).
- Undo restore lives only in memory: leaving the screen or closing the app loses it for good (the words say so).

## Could not check
- Tests: none opened (no budget for test files); every journey coverage "unknown".
- Whether expo-sharing tells the app if the member picked a target (the finding assumes it does not on Android).
