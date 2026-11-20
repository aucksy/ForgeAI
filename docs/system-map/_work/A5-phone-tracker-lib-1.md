# A5-phone-tracker-lib-1 checkpoint

F-phone-1101: 8 journeys, 16 type lines
F-phone-1100: 5 journeys, 8 type lines
F-phone-1102: 5 journeys, 8 type lines
F-phone-1103: 5 journeys, 8 type lines
F-phone-1104: 4 journeys, 8 type lines
F-phone-1105: 6 journeys, 8 type lines
F-phone-1106: 5 journeys, 7 type lines
F-phone-1109: 4 journeys, 8 type lines
F-phone-1110: 5 journeys, 8 type lines

All 9 items done. 127 rows in _work/out/A5-phone-tracker-lib-1.jsonl (47 journeys, 79 type lines, 1 finding).

## Entities
No entity fits the phone's own tables (exercises, set_entries, plan_days, sessions, meta): entities.json holds
server/cloud tables only. writes/reads are left empty; type lines name "unknown" for that phone data.

## Seen in passing (not findings)
- DatePickerSheet day cells read out the raw "2026-11-20" to a screen reader (DatePickerSheet.tsx:96); MonthCalendar says the date in words.
- Calendar Year view: tapping a month before the first workout's month switches to Month view but cannot scroll there (months list starts at the first workout, calendar.tsx:88-91), so it lands on this month.
- Exercises list puts every exercise with no library key under "Made by you", including ones that came from a Hevy import (exercisesView.ts:44-47).
- Calendar day read failure shown as "No workout that day." is already FN-A5-phone-screens-1-1-01; not repeated.

## Could not check
- Words of the chart paid-range lock (older than 3 months) and of the muscle's sets sheet: not in the files read.
- Whether a routine reorder reaches the cloud copy or the watch: not read.
