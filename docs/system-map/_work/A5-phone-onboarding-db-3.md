# A5-phone-onboarding-db-3 checkpoint

Output: docs/system-map/_work/out/A5-phone-onboarding-db-3.jsonl (207 rows: 69 journeys, 137 type lines, 1 finding). All 8 features done (17 feature x role pairs).

F-phone-1612: 12 journeys, 24 type lines
F-phone-1603: 5 journeys, 7 type lines
F-phone-1623: 6 journeys, 7 type lines
F-phone-1624: 6 journeys, 7 type lines
F-phone-1621: 8 journeys, 16 type lines
F-phone-1627: 8 journeys, 16 type lines
F-phone-1625: 7 journeys, 17 type lines
F-phone-1626: 17 journeys, 43 type lines

## Entities
- entities.json has no entity for the phone's own database (user_profile, meta, workouts), the phone's kept
  settings, the light/dark choice, the gym-look mirror or Google Drive backups. Those journeys leave
  writes/reads empty and type lines use "unknown" or "none".
- Used: E-member-items (MettleUp account copy), E-gyms and E-gym-logos (the gym's brand and logo).

## Findings
- FN-A5-phone-onboarding-db-3-01 (S3): the home summary store (dashboardStore.ts) is refreshed after many
  saves, but no screen reads its data, loading or error (only refresh() callers found: coach.tsx:46,
  nutrition.tsx, edit-profile.tsx, accountStore, copySync, keptData). "Couldn't load your summary" never shows.

## Could not check
- F-phone-1626 for owner / trainer / staff: whether a phone signed in as gym staff takes the gym look
  (the look follows the member app's gym-shop link); written as "unknown" in those journeys.
- F-phone-1627 language: no screen found that calls setLanguage; journey says "unknown".

## Seen in passing (not sure, not findings)
- welcomeResume.ts:5 says the setup answers are "never sent anywhere", but they sit in the SQLite meta
  table, and backupStore.ts:61-62 says the SQLite folder is in Android's own backup.
- welcomeResume.ts:50 cuts kept text to 200 letters on resume without a word.
- The Hevy/Strong pick of "Bring workouts" is not in the kept setup answers (only step, units, draft); it
  may be kept elsewhere (forgetSwitch) — not checked.
- accountStore.ts:195 / 210: sign out and delete have no busy guard against a sign-in still running.
- kg or lb lives in two places: the phone settings store and the profile row's unit_system column
  (dataActions.ts:145).
