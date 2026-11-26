# B-alerts-phone-tracker-components-2-b checkpoint

## Items
- started 2026-11-26: read brief, lens rules, pilot lessons, items list.
- H3.1 done: automatic actions in area = rest-over alert, watch opens at workout start (result ignored), lock-screen card, reminder/widget sync, Gym tab count refresh. All member-side; none has a record anyone can open. Reused FN-B-run-phone-tracker-services-2-a-02, FN-L14-phone-native-01.
- H3.2 done: nothing here the owner believes ran; same reused ids, no new finding.
- H4.1-H4.2 done: new finding 01 (gym reply pop-up with app open does not raise the Gym tab count; trainer reply does). Reused FN-B-alerts-phone-tracker-components-1-b-01 (Up next vs gym workout of the day).
- H4.3-H4.5 done: marks: gym news seen = server + phone fallback; gym talk = server count; trainer replies = this phone only (reused FN-B-alerts-phone-cloud-backup-ai-b-03, FN-B-alerts-phone-screens-1-b-01); new dots and watch card = this phone only, nothing else counts them.
- H4.6-H4.8 done: opening Message your gym or the inbox clears every count; reused FN-B-alerts-phone-screens-1-b-02 (pop-up stays in tray).
- lens-cover ok (10 of 10); merge --dry 3 of 3 passed. About 900 code lines read.
