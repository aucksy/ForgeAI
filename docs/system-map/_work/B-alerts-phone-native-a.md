# B-alerts-phone-native-a checkpoint
## Items
- L11.1 done: alerts in this area = rest countdown card (silent), "Rest is over" (sound/buzz, alarm kind, gone after 2 min / 60 s, own app ring on OPPO), "Open MettleUp to save" note (gone after 10 min), live workout card (phone only), workout reminders "Time to train" (off by default, member's days/time), gym-message rescue ring. No WhatsApp/email/push sent from here. Watch: "Rest is over" is not copied to the watch (watch app buzzes itself). Findings 01, 02; reused FN-A5-phone-native-1-01, FN-B-run-phone-native-b-03, FN-A3-notes-claude-2-02.
- H2.1 done. Rest is over: notifications on, channel not muted, exact alarms allowed (else late), no battery restriction, ringer on, DND off or Ring-through on + DND letting alarms through, Workout sounds on for sound. Reminders: switch on (off by default), a day picked, notifications + channel on, app opened since the last save (skip-today). Gym ring: app linked to the gym, Messages from my gym on.
- H2.2 done: gym reminders opt-out invisible to owner (03); usage not counted (reused FN-B-run-phone-native-a-02).
- H2.3 done: 01, 03, 04; reused FN-B-alerts-phone-components-2-a-01.
- H2.4 done: Crispy Curves (field-fill.csv): app link 0 of 2 members, so gym-message ring and gym reminders reach 0 of 2. Rest alert and workout reminders are phone-only choices, no gym rows: not countable.
- H2.5 done: needs a real-phone check: (a) OPPO/OnePlus, screen off: Rest is over and Time to train, sound + banner; (b) DND with alarms blocked + Ring through on; (c) Pixel Watch paired: one buzz at rest end, countdown on watch, an old watch app (0.78.0 or older) recognised; (d) exact alarms off + Doze: how late Rest is over comes.
- lens-cover ok; merge --dry 6 of 6 passed. ITEM DONE.
