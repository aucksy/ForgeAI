# B-alerts-server-database-3-a checkpoint

## Items
- started 2026-11-26
- L11.1 done: staff alerts = gym_alerts rows (triggers) -> 1-minute HQ worker -> browser push; urgent at once any hour, rest in daily 11:00 / weekly summary (default daily); done-before-send = sent to nobody (0098, live: catalog shows gym_alert_reads + handled_at). Member pop-ups = member_push_notes (0073, 0069). New finding 02 (reply words on lock screen); reused 7 ids.
- H2.1 done: member pop-up needs app member not left + same check-in mobile + same first name + mobile on only one list entry + push address ("Messages from my gym" on) + for plan-wide sends a membership covering the save day (finding 01). Staff alert needs a browser turned on, its sign-in still live, the person allowed to see that kind, not read/done before send, sent within 6 h (urgent) or 8 days (summary).
- H2.2, H2.3 done: reused per-member reach and push-outcome findings; 01 new.
- H2.4 done (Crispy only, live gym-filtered counts 26 Nov): 3 list members, 1 app member, 0 with a push address -> every member pop-up reaches 0 of 3 (field-fill.csv older: app link 0 of 2). Staff: 2 browsers on, mode daily. Alerts so far: 9; 3 urgent ones (2 shop orders, 1 online join) recorded "sent to nobody" (no browser then or already done: the record cannot tell which).
- H2.5 could-not-check: real-phone list in the grid row.
- lens-cover ok; merge --dry 4 of 4 passed.
