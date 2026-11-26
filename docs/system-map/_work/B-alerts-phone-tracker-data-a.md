# B-alerts-phone-tracker-data-a checkpoint
Area phone/tracker-data (tracker/db, tracker/store). Only alert code here: restTimerStore (rest bell/buzz), restAlertPrefsStore (exact-alarm ask, ring through DND, open on watch), trackerPrefsStore.sounds. Record chime plays from services (tickFollowUp), not this area. The other 23 features send nothing.
- L11.1 done: rest end = in-app buzz + bell (app open, ringer normal, sounds on, DND hold respected) or scheduled pop-up (app closed); no double ring; skip/untick/workout end clears it. Finding 01 (late wake while open = silent). Reused FN-A3-notes-claude-2-02 (watch signal), FN-A5-phone-native-2-02.
- H2.1 done. Conditions for "Rest is over" to reach the member: rest length > 0, workout running, notifications allowed + channel not muted (else in-app only while open), exact alarm allowed (else late; asked every 7 days), Workout sounds on (else buzz only), ringer normal for in-app sound, DND off or Ring through on, phone maker battery rules. Open on watch: switch on (default), Wear OS watch paired with app installed.
- H2.2 done: member sees an "Alerts off" hint on the rest bar once per workout; no owner view needed (personal alerts).
- H2.3 done: finding 01.
- H2.4 does-not-apply: no gym data decides reach; Crispy Curves field-fill has no column for it (app link 0 of 2 irrelevant here).
- H2.5 done: needs a real-phone check: OPPO/Xiaomi/Samsung with battery saver, screen off, rest ending: does Rest is over sound on time; DND on with Ring through on/off; Wear OS watch paired: does the watch open on workout start and show the rest.
