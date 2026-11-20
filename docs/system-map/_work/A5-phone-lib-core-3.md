# A5-phone-lib-core-3 checkpoint

F-phone-1711: 4 journeys, 8 type lines
F-phone-1724: 4 journeys, 8 type lines
F-phone-1725: 4 journeys, 8 type lines
F-phone-1707: 6 journeys, 8 type lines
F-phone-1718: 5 journeys, 7 type lines
F-phone-1708: 5 journeys, 8 type lines
F-phone-1712: 4 journeys, 8 type lines
F-phone-1723: 4 journeys, 8 type lines

All 8 items done. 100 rows: 36 journeys, 63 type lines, 1 finding.

## Entities
- No entity id exists for the phone's own local data (workout_sessions, set_entries, the app_meta keys such as
  safekeep_hidden_until, notice_rest_day, whats_new_seen, update_popup, the units setting). Journeys that only touch
  those leave writes/reads empty and type lines use "none".
- Watch screen log: E-feedback. Units cross-device: E-member-items.

## Seen in passing (not findings)
- F-phone-1723: the 30 / 90 / 180-day range picker (useAnalyticsData / loadProgress) is not used by any screen;
  only tests call it. The Charts page calls the full 180-day bundle (7 reads) just for the strength line, and
  getExerciseStats has no caller. The feature row's "30, 90 or 180 days" is not reachable by a member.
- F-phone-1708: the feature row says "See earlier updates" opens 7 updates; the code opens 2 (the last 3 with this one).
- F-phone-1711: ownWorkoutCount counts every row of workout_sessions; if the demo list read fails, demo workouts count.
- F-phone-1707: P-A7-whats-new-2-60 ("Later asks again in 3 days") is old 0.6x wording; the rule is now the 7th launch.
  Only old versions show that line, so no member on 0.79.0 reads it.
- lib/format.ts fmtWeight defaults to metric when no unit is passed; callers not checked.

## Could not check
- No test was opened to confirm coverage; every journey has tests [] and coverage "unknown".
- Google Play in-app update and the watch Data Layer read need a real device.
