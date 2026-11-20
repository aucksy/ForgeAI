# A5-phone-tracker-services-1-3 checkpoint
Entities: phone-local workouts/routines/folders have no entity of their own; E-member-items (cloud copy) used for them.
F-phone-505: 6 journeys, 7 type lines
F-phone-523: 5 journeys, 7 type lines
F-phone-524: 6 journeys, 7 type lines
F-phone-509: 7 journeys, 7 type lines
F-phone-529: 6 journeys, 7 type lines
F-phone-520: 6 journeys, 7 type lines
F-phone-531: 5 journeys, 7 type lines
F-phone-522: 9 journeys, 15 type lines (member 7; system 8 incl. type 12 "no")
Finding: FN-A5-phone-tracker-services-1-3-01 (hold timer panel open but never started blocks the forgotten-workout pause).
Seen in passing (not sure, not filed):
- History feed, Save my history export and the milestone count read workout_sessions with no finished filter; if an in-progress workout lives in that table it may show in History or the export. Not checked.
- Save my history double-tap guard reads React state (saving), so two taps in one frame could both start.
- First routine guide: stepping Back from step 3 to step 1 and out drops picked exercises with no question (only Skip asks).
- History search uses SQLite LOWER (plain letters only) on names while the query is JS-lowercased; accented names may not match.
- PhoneBackupCard 'N workouts' counts every session row; the export counts only sessions with sets.
Could not check: no test file opened for any journey (coverage left "unknown"); coachNote.ts not read; Hevy parser internals (hevyImport.ts, 1,473 lines) read only lines 50-110.
Code lines read: about 1,900 of 3,000. Rows: 115 (50 journeys, 64 type lines, 1 finding).
DONE: all 8 features.
