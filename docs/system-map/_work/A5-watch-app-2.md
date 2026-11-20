# A5-watch-app-2 checkpoint

F-watch-114: 5 journeys, 7 type lines
F-watch-101: 6 journeys, 7 type lines
F-watch-105: 5 journeys, 7 type lines
F-watch-120: 4 journeys, 8 type lines
F-watch-121: 4 journeys, 8 type lines
F-watch-122: 6 journeys, 18 type lines (member + prospect)
F-watch-111: 6 journeys, 7 type lines
F-watch-123: 4 journeys, 8 type lines
F-watch-118: 8 journeys, 16 type lines (member + the system)
F-watch-112: 9 journeys, 16 type lines (member + the system)

DONE: 10 features, 13 pairs, 158 rows (57 journeys, 101 type lines), 0 findings. merge --dry --a5cover: 0 rejected, 0 gaps.

Entities: none fit. Every watch screen reads and keeps only watch-local state (shared preferences, Data Layer items from the phone); entities.json holds cloud tables only. writes/reads left empty on purpose (merge warns "lists no entity").

Seen in passing (not findings, not sure):
- The screen chooser puts the two permission screens ABOVE a running rest (WatchLayout.kt:39-44). A watch updated mid-workout that newly needs the Alarms & reminders ask (MainActivity.kt:789) would cover the countdown until answered.
- F-watch-122: a phone that ever sent a workout counts as having MettleUp for good (WatchLayout.kt:113, MainActivity.kt:851), so a member who removed the phone app sees "Start a workout on your phone", never "Get MettleUp on your phone".
- F-watch-101 is promised free (P-A7-help-1-44 "the rest timer") while the watch app is listed as a paid Plus feature (P-A7-help-1-11); not checked which wins on the watch.
- The phone's exact "watch update ready" words were not read (phone side is another feature).

Could not check: nothing driven; code-read only.
