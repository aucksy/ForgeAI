# A5-phone-tracker-services-2-2 checkpoint

Done features:
F-phone-621: 5 journeys, 7 type lines
F-phone-618: 4 journeys, 8 type lines
F-phone-620: 5 journeys, 7 type lines
F-phone-622: 5 journeys, 7 type lines
F-phone-619: 3 journeys, 9 type lines
F-phone-624: 5 journeys, 7 type lines
F-phone-625: 4 journeys, 8 type lines
F-phone-626: 4 journeys, 8 type lines
F-phone-627: 6 journeys, 7 type lines

All 9 items done. 41 journeys, 68 type lines, 0 findings.

Entities: the phone's own tables for workouts, routines, folders and sets have no entity in entities.json. E-member-items (the member's cloud copy of workouts and routines) is used in their place. F-phone-624 type 11 uses E-gym-member-days (leaderboard day totals).

Seen in passing (not sure, so not findings):
- routineOffer.ts:121-136: the "Update routine?" offer is kept in memory only (pending map). If the app is killed between Finish and the summary, the question is lost without a word. This looks intended (LW-11), so it is noted under T7-closed.
- routineShare.ts:25-31: shareRoutinesAsFile writes the file to the cache before it checks that sharing is available. A file is left behind when sharing is off. Minor; the folder is emptied by Erase all data.
- vsLastTime.ts: the code now says "... on previous", but the file's header comment and the feature name still say "on last time". The journeys use the code's words.
- sessionTiming.ts:25-27: the day shift is measured in local milliseconds. On a phone in a zone with summer time, a move across the switch shifts the clock by one hour (T5-zone).
- setTick.ts:71: a weight x reps row whose grey hint is 0 kg saves 0 kg, matching what the row shows (setEntry shownValues). This follows the "saves what the row shows" rule, so it is not filed.

Could not check: the exact words of the record pop-up and of the typo question's buttons (they are in components I did not open); the Ask an AI page's text builder (it covers the last 4 weeks and may not be shareText.ts); which screen holds the month and year share row (ShareTextRow callers not opened).
