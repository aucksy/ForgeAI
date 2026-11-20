# A5-phone-tracker-components-1-4 checkpoint

F-phone-735: 4 journeys, 8 type lines
F-phone-736: 5 journeys, 8 type lines
F-phone-727: 5 journeys, 8 type lines
F-phone-720: 5 journeys, 7 type lines
F-phone-722: 6 journeys, 8 type lines
F-phone-704: 3 journeys, 9 type lines
F-phone-706: 5 journeys, 8 type lines
F-phone-737: 5 journeys, 8 type lines

All 8 items done. Output: docs/system-map/_work/out/A5-phone-tracker-components-1-4.jsonl (103 rows: 38 journeys, 64 type lines, 1 finding).

## Entities
No entity fits: entities.json has no phone-local row (phone SQLite workouts, routines and folders, AsyncStorage settings,
plate setup, muscle-tip choices). writes/reads left empty; type-line entity "unknown" where phone data is at risk.

## Could not check
- Nothing run on a phone; all from code reads. Exact words of the folder ⋯ menu "Rename" row and the calculator's
  "Change plates" link not opened (taken from file comments).
- apps/mobile/test/tracker/targetSettings.test.ts not opened, so not linked.

## Seen in passing (not sure enough for a finding)
- F-phone-736: "Not now" and "I skip this on purpose" stay tappable while "Adding…" runs; the add can finish after the group was snoozed.
- F-phone-736: promise P-A7-whats-new-3-18 says the tip is for a muscle not trained in 3 weeks; the rebuilt tip is about the routines.
- F-phone-722: promise P-A7-whats-new-3-54 calls the row "Weight jumps"; the row and sheet now say "Weight step".
- F-phone-722: "Machine and cable steps" offers only kg steps (2.5 kg, 5 kg) even when units are lb.
- F-phone-720: "Back to the standard set" wipes added plates and the bar in one tap, no confirm, no undo.
- F-phone-727: two folders can have the same name with no word; the 60-letter cap has no counter.
- F-phone-735: day circles are a fixed 30 dp; the week is always Monday first.
- F-phone-737: the file comment says Profile → Workout; the row really sits on Settings → Rest timer and sounds.
