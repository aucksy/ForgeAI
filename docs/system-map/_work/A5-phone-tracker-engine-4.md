# A5-phone-tracker-engine-4 checkpoint
Entity note: tracker data (routines, folders, workouts) lives on the phone; the only entity that fits is E-member-items (cloud copy). Phone-only settings have no entity id, left out.
F-phone-925: 6 journeys, 7 type lines
seen in passing (F-phone-925): a swap during a workout of a routine NOT in a built plan uses gym equipment and no sore/'never' list (swapContextFor falls back), so the 'never' list only applies inside a built plan folder.
F-phone-926: 6 journeys, 7 type lines
F-phone-927: 5 journeys, 7 type lines
F-phone-928: 5 journeys, 7 type lines
F-phone-929: 5 journeys, 7 type lines
F-phone-930: 7 journeys, 7 type lines
F-phone-931: 6 journeys, 7 type lines
seen in passing (F-phone-931): the routine editor can only set the number of working and warm-up sets; drop and failure sets and per-set targets come only from a workout, Hevy or a file (app/routines/[id].tsx:575-640). Not a bug, but the feature name promises more than the editor offers.
F-phone-932: 5 journeys, 7 type lines
Findings: none written (no clear bug seen; the two notes above are seen in passing).
could-not-check: no app run, so every journey is coverage unknown; tests not opened (none linked); how the watch, widgets and reminders read todayService not traced; gym plan sync (tracker/services/gymPlansSync.ts) not opened; the routine import service (plansService importRoutineFile, keptEdits merge) not opened.
Done: all 8 items, 101 rows (45 journeys, 56 type lines). About 1,150 code lines read.
