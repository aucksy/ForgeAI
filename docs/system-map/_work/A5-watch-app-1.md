# A5-watch-app-1 checkpoint

F-watch-115: 8 journeys, 16 type lines
F-watch-104: 8 journeys, 17 type lines
F-watch-117: 4 journeys, 9 type lines
F-watch-119: 7 journeys, 17 type lines
F-watch-116: 7 journeys, 17 type lines
F-watch-110: 5 journeys, 7 type lines
F-watch-106: 4 journeys, 9 type lines
F-watch-100: 4 journeys, 8 type lines
F-watch-102: 4 journeys, 8 type lines
F-watch-103: 4 journeys, 8 type lines

Done: all 10 features, 14 feature x role pairs. Output: _work/out/A5-watch-app-1.jsonl (173 rows: 55 journeys, 116 type lines, 2 findings). merge --dry: 0 rejected, 0 with gaps.

Entities: no entity in entities.json fits the watch's own storage (rest, workout state, colour, bridging config, heart rate live only). Only F-watch-115 uses E-feedback (the log rides in a feedback message). F-watch-106's set is saved by the phone; E-member-items (cloud copy) not claimed, the watch never touches it.

Seen in passing (not findings):
- F-watch-103's feature name says the card has "Complete set"; the code removed that button (RestAlerts.kt:259-260, R-207). WatchActions.kt and Bridging.kt comments still mention it. Feature row wording is stale.
- F-watch-106: Done with the reps box needed and empty does nothing, with no word on screen (WatchLog.kt:209-215, MainActivity.kt:428-438).
- F-watch-115: the diary's lines carry month-day time with no year or zone (AmbientDiag.kt:145); diary content wider than the caption is already recorded on P-A7-phone-watch-1-47 (status partly).
- F-watch-102: Done tapped twice on the card sends two "done" messages; phone-side dedup is outside this area.

Could not check: phone side (Help and feedback words, HQ display of the log) is outside watch/app; no device driving (read-only audit).
