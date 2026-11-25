# B-alerts-hq-app-a checkpoint

## LESSONS for the next B-alerts helpers
- Read the items .txt first, then grep the area's code for: Notification, beep/Audio, push, whatsapp, bell, setInterval, document.title. That finds every alert path in minutes; most of the 33 listed features send nothing and need no reading.
- Grep findings.jsonl by surface + words (pop-up, sound, alert, bell) BEFORE writing: two of the alert faults were already filed (sound when off; nothing when closed). Reuse those ids in finding_ids.
- The brief says "machine:<file>.json#<path>" but field-fill is a CSV; "machine:field-fill.csv#<field>" passes merge.
- Grid items have no place for numbers: put H2.4 reach counts in the checkpoint (and in finding text if a gap).
- field-fill.csv covers member fields only. Feedback and admin-bell reach live outside Supabase gym rows: no allowed count, say so.
- Unclear in brief: whether to follow one hop out of the named folder for a condition (e.g. where "can take a pop-up" is decided). One grep, one file:line was enough; do not read the server file.
- Skip: style.css, offline files, manifest. Both tool checks run in seconds.

## Items
- L11.1 done: HQ alerts = sound + browser pop-up while HQ open (minute poll), feedback reply push, bell message to every gym, sign-in code by WhatsApp copy (manual). Findings 01, 02, 03; reused FN-A5-hq-app-2-01, FN-L14-hq-app-08.
- H2.1 done. HQ pop-up conditions: HQ open in a tab (not frozen), Turn on alerts tapped, browser allows, desktop browser (Android refuses page pop-ups), one click since opening for sound. Reply push: sent from help box (covered), app gave a push address, notifications allowed on the phone, phone maker rules, app installed. Bell message: admin app opened.
- H2.2 done: reply card shows per person whether a pop-up can go (good); Messages shows no per-gym reach (05).
- H2.3 done: 01, 02, 04.
- H2.4 done: Crispy Curves (field-fill.csv): app link 0 of 2 members, so any member-app pop-up reaches 0 of 2; admin bell message reaches its 1 admin app only when opened; feedback reply reach not countable (feedback not in gym rows).
- H2.5 done: needs a real-phone check: (a) HQ installed on an Android phone, trigger a new lead, look for the pop-up and the sound; (b) feedback reply to a member app on OPPO/Xiaomi/Samsung with battery saver on and screen off: does the pop-up show and sound.
- lens-cover ok; merge --dry 7 of 7 passed.
