# B-switch-server-database-2-a checkpoint

## Done
- 2026-11-26 started: no earlier checkpoint.
- 2026-11-26 H1.1-H1.4 (gap-1) checked: 3 new findings (01 paused gym still saves measurements, diet plans, photos; 02 member app reads plan name but not the unpaid stage; 03 challenge pop-up skips the 2-a-day calm). Reused FN-B-switch-panel-logic-1-a-01, FN-B-alerts-panel-screens-2-a-01, FN-B-alerts-server-database-2-a-01, FN-B-switch-phone-shop-1-a-03, FN-B-switch-panel-forms-01.
- Read well (no finding): leaderboard hide and name switch (mate profiles read them), challenge cancel (rewards, results, pop-up read it), pass members (check-in, membership, reminders, ask-trainer, bring-a-friend read it), gym timings (busy, public gym page read them), member leaving (push addresses, board, summaries removed).
- lens-cover ok; merge --dry 4/4 passed.
- Lesson: grid evidence "machine:" only accepts files in _sources/machine; use data: lines for features.json/readers.json.
