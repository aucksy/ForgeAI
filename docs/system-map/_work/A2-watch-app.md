# A2-watch-app checkpoint

- [x] 1. Read the source list (50 lines)
- [x] 2. Opened the code at each item (header comments + the lines around each item; about 1,100 code lines read)
- [x] 3. Switches / plan gates noted (below)
- [x] 4. Items grouped into features
- [x] 5. Feature rows written: F-watch-100 to F-watch-123 (24 rows) in docs/system-map/_work/out/A2-watch-app.jsonl
- [x] 6. Not-a-feature rows: none needed (every file and line belongs to a feature)
- [x] Coverage self-check: all 50 source ids appear in "sources"; all entry lines exist; JSON parses

## Finished units
- unit 1 (all 50 items, one pass): DONE

## Switches and gates met
- "Ring through Do Not Disturb" (phone app setting, arrives as ringThroughDnd): RestAlerts.kt:108, :245
- "Track RPE" (phone app setting, arrives per set as eRpe): WatchSync.kt:74, WatchLog.kt:314
- "Open MettleUp on my watch" (phone app setting; the phone sends /forge/open only when on): WorkoutStarted.kt:15
- logFlow (flag from the phone app: it takes sets logged on the watch): WatchSync.kt:54, WatchLog.kt:355
- Watch's own settings that change behaviour: Always-on display, Battery Saver, notification / heart-rate / Alarms & reminders permissions (SelfDim.kt:18-27, Bridging.kt:34)
- Plan gates (Pro only): none found in the watch code

## Could not check
- Whether logFlow is driven by a member setting or only by the phone app's version: the phone code is outside this area.
- Tier of "watch in the gym's colour" (depends on gym branding rules on the phone/server side): written as unknown.

## Seen in passing
- AmbientDiag.kt:33-34 header comment says the phone "does not read it yet"; DiagSend.kt:9 (R-441) says the phone's Help and feedback now asks for it. Stale comment, not a behaviour bug.
