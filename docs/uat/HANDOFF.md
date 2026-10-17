# UAT handoff (PC <-> cloud)

Whoever stops last updates this file and pushes it. The other side starts here.

## Cloud session ACTIVE (started 17 Oct 2026, 02:45 UTC) - read before you touch these files
The PC helpers turned out to be still running (8e9fcdc WP4b, runs 38996250599 / 38996251965), so the
cloud session keeps OFF their work to avoid two sessions editing the same files:
- Cloud takes: C9-34 (src/shop Invite/CheckIn buttons), WP13 (phone label / touch-target lint),
  WP14 (PICT pairwise matrix). It only WATCHES WP4b / WP7 / WP9 runs (R check: 38996291871).
- Cloud done so far: C9-34 (7486ff7), WP13 (b11f234), WP14 code (9783923) + 11 env runs running.
- PC helpers keep: WP4b, WP7, WP9 / part R. If a PC helper stops for good, write it here; the cloud
  session then takes that package over.

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
