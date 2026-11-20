# A5-phone-components-2-2 checkpoint

F-phone-1410: 10 journeys, 14 type lines
F-phone-1411: 10 journeys, 14 type lines
F-phone-1413: 8 journeys, 16 type lines
F-phone-1414: 12 journeys, 14 type lines
F-phone-1416: 10 journeys, 14 type lines
F-phone-1419: 10 journeys, 14 type lines
F-phone-1420: 10 journeys, 14 type lines

Done: all 7 features, both roles. 171 rows (70 journeys, 100 type lines, 1 finding).

## Entities with no fit
- The phone's own data (workouts, sets, routines, measurements, photos, settings in the phone database and AsyncStorage) has no entity id in entities.json. Journeys of F-phone-1410, 1411, 1413, 1414 therefore carry no writes/reads; type lines use entity "unknown" for that data.

## Seen in passing (not sure enough for a finding)
- "Save my history" has no demo-data guard, while "Save my measurements" refuses the sample member's data (BackupCard.tsx:124-139 vs measurementsExport.ts:135). The history export may hand over the sample member's made-up workouts; not checked whether writeHistoryCsv skips demo rows.
- Save a backup file shows the saved line right after the share sheet returns (BackupFilePanels.tsx:121-124), even when the member closed the sheet without saving anywhere. Not checked what savedText says.
- The "Gym logo on my home screen" result words are shown in InlineError (GymSettings.tsx:57,74), so a success line may show in error styling.
- Turning "Messages from my gym" off does not cancel anything on the phone directly; it relies on pushToken.ts and noticeTaskSync.ts listeners (pushToken.ts:127). Not followed further.

## Could not check
- What a "pass member" sees differently from a member in these settings cards: no code branch for it was found in the four files; journeys for that role mirror the member's.
- Tests: none opened; coverage left "unknown" on every journey.
