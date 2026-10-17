# UAT handoff (PC <-> cloud)

Whoever stops last updates this file and pushes it. The other side starts here.

## Cloud session (started 17 Oct 2026 02:45 UTC) - last update 05:25 UTC
The PC helpers went quiet at 03:00 UTC (no push or run after that), so at 05:00 the cloud session
TOOK OVER WP4b, WP7 and WP9 as well. If a PC helper comes back: read this first, then git log.

### Done (cloud)
- Part R repaired: whole OWNER run 38984599010 on 592b05d GREEN (PC fix; R, BR, INV all pass).
- WP9: U-G1, U-G2, U-M1, U-G4 fixed in code earlier (6219995, abfb6c6); proven by that green run.
- C9-34 (7486ff7): shop buttons "Join this gym" / "Switch to this gym" / "Open the shop".
- WP13 (b11f234): phone label / touch-target lint (test/a11y), 4 controls fixed.
- WP14 (9783923, 515dd52, 00a1a8f): pairwise matrix + qa-device `env` input; 12 rows; 10 of 11
  run rows green, E5 re-run 39002595271 running. Fixes on the way: notif.py reads Android 15+
  flags; Battery Saver really on; "Coming from Hevy or Strong?" wraps at big text.
- U-M5 (90e0bb1): the "Couldn't save" banner no longer takes taps meant for the top bar.
- WP7 (9a07be2): C1 step 7 checker fix (unquoted >=); U-C1 written in FINDINGS (S4, open).

### In progress (06:50 UTC)
- RELEASE RUNS on a0727e6 (dispatched ~06:50): whole phone test default + owner (API 34) and
  qa-journeys. If all green -> bump 0.47.0, PROGRESS entry, tag v0.47.0, UAT-REPORT-v0.47.0.md.
- Already proven: U-M6 fixed (UK2 passes on both phones, 39007467904 / 39007469521). UF5 failed on
  default only because UF3 now really minimises; test fixed in a0727e6 (no app change).
- WP7 qa-conditions 39004899634 on 9a07be2: success.
- Running: drag-bar screenshots (39009454208, a,j,j2 owner) and the real workout w (39009987546, owner)
  for the RPE tick.
- Owner asks today: join from Settings -> Your gym (U-G5, b146cf7, goes in v0.47.0); research for
  the gate QR and gym icon (docs/overhaul/research/R-qr-entry.md). NEW standing rule: every owner
  idea/question goes in docs/OWNER-INBOX.md first (CLAUDE.md).

## Last update: 17 Oct 2026, PC session (before a usage limit)

### Done
- v0.46.0 released (2e5673d): phone + watch APKs answer 200.
- Admin app live: version 1f2897c5 at commit 8672a6b.
- WP1-3, WP4, WP5, WP5b, WP6, WP8, WP10, WP11, WP12 (see STATUS.md for commits and runs).

### In progress (helpers stopped by the PC's usage limit)
- WP4b member gaps (parts added in 047fdb7; green runs not yet confirmed).
- WP7 phone conditions (qa-conditions.yml; check git log for how far it got).
- WP9 gym fixes + REPAIR PART R (blocks whole phone runs).

### PC must do
- Owner yes -> apply 0021_receipt_rules.sql, then 0022_key_status.sql, on the live database; run
  every supabase/tests/*.sql live (expect RESULT PASS, "findings still open: none").
- Deploy the admin app after any admin change (checked build, then wrangler in deploy/panel).

### Owner decisions needed
- Apply the two database changes above (recommend: yes).
- Optional: delete Actions run 38965066052 (two already-revoked test keys in its log).
