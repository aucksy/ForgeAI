# A5-phone-cloud-backup-ai-2 checkpoint
F-phone-1522: 7 journeys, 7 type lines
F-phone-1521: 11 journeys, 15 type lines
F-phone-1524: 7 journeys, 7 type lines
F-phone-1525: 7 journeys, 7 type lines
F-phone-1531: 8 journeys, 16 type lines
DONE: all 5 features (7 feature x role pairs). Output: _work/out/A5-phone-cloud-backup-ai-2.jsonl (94 rows: 40 journeys, 52 type lines, 2 findings).

## No entity fits
- The phone's own workouts, routines, body weight and the cloud copy queue/state tables (SQLite on the phone) have no entity id; journeys list only E-member-items (the server copy).
- Google Drive backup files (F-phone-1525) have no entity id; writes/reads left empty.

## Seen in passing (not sure, no finding)
- downloadNewestBackup makes the Drive folder (ensureFolderId) when none exists, while the welcome peek avoids it; a "Find my Drive backup" on an account without a backup may leave an empty folder in Drive.
- GymBrandMark hides a logo after one failed load (failed = logo) and never retries through Supabase's own address in the same view.
- Settings 'Bring back my workouts' is a GhostButton with no busy look; the store's busy flag stops a second run, but the member sees nothing happening until the note appears.
- copyStatusLine shows needsSignIn before full and waiting, so a full space plus an expired sign-in shows only the sign-in line (probably intended).

## Could not check
- Whether the server (member_copy_put / member_copy_get) really keeps the newer edit: SQL not read (out of scope for this item).
- No test files opened: tests [] and coverage unknown on every journey.
