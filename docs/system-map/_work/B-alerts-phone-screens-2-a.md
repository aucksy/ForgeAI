# B-alerts-phone-screens-2-a checkpoint

## Items
- L11.1 done: alert paths in this area: (a) live workout asks for notification permission once per app run on a new workout (rest alerts on a locked phone) and tells the alert handler the screen is open (no duplicate open); (b) first-start "Install on your watch" card, shown once; (c) Rest timer and sounds, Reminders and Your watch pages only host cards from other areas; (d) feedback can add the watch screen log; (e) gym reply / trainer reply pushes open shop/message and shop/ask; (f) widget start link never opens a second workout. No sound, quiet-hours or schedule code of its own here. Reused native/tracker findings for OPPO sound, Do Not Disturb, alarm refused, watch detection.
- H2.1 done. Rest alert reaches the member if: Android, notifications allowed (asked once, on the workout screen; after two refusals never asked again), alert channel not muted, phone maker battery/alarm rules, watch app installed for watch bridging. Workout reminder: switch on, notifications allowed, days chosen.
- H2.2 done: phone-only alerts; owner side reused FN-B-alerts-panel-assistant-a-02, FN-B-alerts-phone-native-a-03.
- H2.3 done: new 01 (Settings row says Reminders on while notifications blocked); reused FN-B-alerts-phone-components-2-a-01.
- H2.4 done: Crispy Curves (field-fill.csv): app link 0 of 2 member records; check-in phone 1 of 2. Rest alerts and workout reminders are personal phone alerts, not in gym rows: reach not countable.
- H2.5 done: needs a real-phone check: on OPPO/Xiaomi/Samsung, screen off, battery saver on, start a workout, finish a set, check "Rest is over" rings on time and on the watch; refuse notifications twice and check the Settings Reminders row and rest alert row.
- lens-cover ok; merge --dry 3 of 3 passed.
