# A5-phone-screens-1-4 checkpoint

F-phone-134: 9 journeys, 7 type lines
F-phone-136: 7 journeys, 7 type lines
F-phone-129: 5 journeys, 8 type lines
F-phone-135: 8 journeys, 7 type lines
F-phone-130: 7 journeys, 8 type lines
F-phone-139: 8 journeys, 7 type lines
F-phone-105: 5 journeys, 8 type lines
F-phone-125: 6 journeys, 8 type lines

ALL 8 ITEMS DONE. 116 rows (55 journeys, 60 type lines, 1 finding). About 1,400 code lines read.

## Finding
- FN-A5-phone-screens-1-4-01: the diet plan's date uses the world clock day (DietPlanScreen.tsx:109), so a plan sent between midnight and 5:30 am India time shows yesterday.

## Entities left out (none fits in entities.json)
- Phone-only settings and stores: look choice, units, workout reminders, rest timer, weekly goal, plates, previous numbers, effort, muscle tips, Health Connect switches, widget key, watch-open switch.
- The workouts and routines kept on the phone (F-phone-105, F-phone-125, F-phone-136): type lines say "unknown".

## Seen in passing (not sure enough for a finding)
- Health apps page draws nothing at all when the phone's Health Connect state is "none" (HealthRow returns null); Settings hides the row then, but an old link to /settings/health would show an empty page.
- What my gym can see: the "Share which machines I use" switch only saves the choice on the phone; nothing is pushed to the gym at the flip (may be read at the next send).
- Charts: a range of 12 months picked while Plus was on stays picked after Plus ends until the member picks again (range is checked only at the pick).
- Leave row says "Your leaderboard numbers are removed from the gym"; leaving offline sets only a pending notice, so the removal waits for the server call. Not checked deeper.

## Could not check
- Whether the server really deletes leaderboard numbers, shared workouts, trainer summary and messages on leave (server code not in this item).
- Who sees "Messages from my gym" pop-ups and how the "seen by" count is stored (server side).
