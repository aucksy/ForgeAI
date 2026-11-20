# A5-phone-tracker-services-2-3 checkpoint

Status: done. All 9 features, role member. Output: docs/system-map/_work/out/A5-phone-tracker-services-2-3.jsonl (117 rows: 51 journeys, 66 type lines). No findings.

F-phone-610: 6 journeys, 7 type lines
F-phone-612: 5 journeys, 7 type lines
F-phone-623: 6 journeys, 7 type lines
F-phone-628: 5 journeys, 8 type lines
F-phone-629: 7 journeys, 7 type lines
F-phone-630: 5 journeys, 8 type lines
F-phone-611: 5 journeys, 7 type lines
F-phone-632: 6 journeys, 7 type lines
F-phone-631: 6 journeys, 8 type lines

## Entities
- No entity id exists for the phone's own SQLite tables (workout_sessions, set_entries, plan_days, body_weight, meta) or the phone prefs store. Those journeys leave writes/reads empty and type lines use entity "none" with the table named in the note.
- E-member-items (cloud copy) used only for the Strong import, where a signed-in member's imported workouts are copied to the account.

## Seen in passing (not sure enough for a finding)
- Start (todayStart.ts:98-115): the open guard in workoutStart.ts only stops a second SCREEN; two fast taps on Start both pass hydrate() and both call startFromPlanDay before either screen opens. Probably harmless (same routine) but not proven.
- Welcome switcher (switcher.ts:8-20): the "From Strong/Hevy" choice is kept in memory only; if the app is closed between the welcome screen and the Workout tab, the import offer is lost silently. Documented as "this session only".
- Strength level (StrengthLevelLine.tsx pick): a failed save of the comparison choice is only logged; the chip looks saved and goes back on the next open.
- watchInstall.ts:18 header still says "The watch app is not on Play yet"; WATCH_APP_ON_PLAY is true since R-269. Stale comment only.
- Feature row F-phone-628 names "Weight jumps" and "Rep range"; the screen's real row titles are "Weight step" and "Reps to aim for" (WorkoutPrefsCard.tsx).

## Could not check
- Kg lifted with missing body weight: the exact on-screen words of the missing-body-weight note were not read (only sessionMissesBodyweight in volumeService.ts:339).
- Whether kg lifted feeds the gym leaderboard (E-gym-member-days) was not traced; the type 12 journey states the must-not only.
- Widget and reminder code for F-phone-629 not opened (only the shared todayService/upNextService answer).
