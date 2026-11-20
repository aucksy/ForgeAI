# A5-phone-tracker-data-3 checkpoint

F-phone-1017: 6 journeys, 7 type lines
F-phone-1005: 6 journeys, 7 type lines
F-phone-1013: 4 journeys, 8 type lines
F-phone-1023: 4 journeys, 8 type lines
F-phone-1025: 4 journeys, 8 type lines
F-phone-1009: 6 journeys, 7 type lines
F-phone-1024: 5 journeys, 7 type lines

All 7 items done. 87 rows in _work/out/A5-phone-tracker-data-3.jsonl. 0 findings.

## Entities
None of these features' data has an entity in entities.json (all 104 are server or D1 tables). Phone-local stores left out of writes/reads:
SQLite workout_photos, workout_sessions, set_entries, meta activeWorkoutDraft and restTimerDefaultSec; AsyncStorage forgeai-plate-setup,
forgeai-rest-alert-prefs, forgeai-tracker-prefs; in-memory planBuilderStore and progressPickStore. Type lines that apply use entity "unknown".

## Seen in passing (not sure enough for a finding)
- Live workout: a saved draft that cannot be read back is dropped with only a log line; the member is not told their workout was lost (apps/mobile/src/tracker/store/activeWorkoutStore.ts:1891-1894).
- Live workout: Finish cuts the workout name to 60 letters with no word to the member (activeWorkoutStore.ts:2617).
- Workout photos say "Private. They stay on this phone." but "Save a backup" puts the pictures into the backup file (apps/mobile/src/backup/backupCollect.ts:130, backupCoverage.ts:170). Words vs behaviour worth a look.
- Plan builder: the feature name says "nothing saved until I follow it", but the "Save" button saves the plan without following it (apps/mobile/src/app/plan/build.tsx:152-153). Feature row wording may be stale.
- Workout settings: the stored-settings merge does not clean weeklyGoal or bodyFigure (trackerPrefsStore.ts:248-269); a damaged blob could carry a bad value.
- Rest timer: loadDefault has no catch; a failed read leaves loaded=false and rejects (restTimerStore.ts:162-167).
- Plates and bars: "Back to the standard set" resets with no question (PlateSetupCard.tsx:266-273).

## Could not check
- Exact start-button words on the Workout tab and the Up next card (Resume / Discard taken from a file comment only).
- Whether the watch reads RPE, plate setup or other workout settings (watch code not read).
- Tests: none opened; every journey is coverage "unknown".
