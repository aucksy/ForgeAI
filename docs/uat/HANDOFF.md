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

### Done since 06:50 UTC
- Phone test split into 4 shards (qa_shards.py; whole run ~2 h). Release gate unchanged (run name).
- Whole runs green on 52e8f43: default 39020754722 (attempt 2), owner 39020756689; journeys 39020758474.
- v0.47.0: version bump, PROGRESS entry, UAT-REPORT-v0.47.0.md at 4f3d5c3. The TAG could NOT be pushed
  from the cloud (GitHub answers 403 to any tag push from this session; branch pushes work).
  release-apk.yml dry run 39035517607 on 4f3d5c3: SUCCESS (phone gate, build, release checks; no publish).
- Release review: no blockers; U-M7, U-M8 (S4) and U-G6 (S3) open for the next release.
- Owner tools: docs/OWNER-INBOX.md (rule in CLAUDE.md), private Owner inbox page
  https://claude.ai/artifact/9dAdwmTA8rNXiw5BHX1SJT, /inbox desktop mod (plugins/owner-inbox).

### Next
- ⭐ NEXT SESSION, read docs/OWNER-INBOX.md first. Owner rule #18 (CLAUDE.md): decide UX and build
  order yourself; ask only for money, LIVE data, client promises/legal, personal-vs-product.
- Built 18 Oct, NOT released (next: v0.48.0): #12 step 1 (check-in offers the workout), #11 welcome
  join + gym-logo home-screen shortcut (Kotlin GymShortcut.kt: compile check = qa-device only=a run on
  main), #6 "My membership" (0023 LIVE since 18 Oct), #17 inbox page.
- Still to build (decided): #9 per-exercise kg target + % overload + per-set targets; #13 exercise-level
  busy times (opt-in sharing); #11 Google login research; #6 gym workout plans next; #7 offline front
  desk (admin/CRM: check FIELDWORK gating).
- v0.47.1 PUBLISHED 18 Oct (release run 39092447178): phone + watch APKs and the AAB uploaded.
- WP15 (Play pre-launch / Firebase Test Lab) not started.
- Admin app: no code change since the last deploy (8672a6b); nothing to deploy.

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
- DONE 18 Oct 2026 (PC, owner approved, inbox #6): applied LIVE, in order, from commit 21847ac:
  0021_receipt_rules.sql, 0022_key_status.sql, 0023_member_membership.sql - no errors.
  Every supabase/tests/*.sql then run on the LIVE database (gyms count 125 before and after; nothing left behind):
  - 0015_qr_checkin: RESULT PASS (24 checks)
  - 0017_undo_import: RESULT PASS (9 checks)
  - 0018_photo_upload: RESULT PASS (3 checks)
  - 0018_staff_and_owner_rules: RESULT PASS (93 checks)
  - 0019_staff_discount_and_taker: RESULT PASS (26 checks)
  - 0020_gym_side_retries: RESULT PASS (29 checks)
  - 0021_receipt_rules: RESULT PASS (72 checks)
  - 0022_key_status: RESULT PASS (9 checks)
  - 0023_member_membership: RESULT PASS (12 checks)
  - security: RESULT PASS (9 checks)
  - uat_access_matrix: RESULT PASS (438 cells: 83 allow, 355 deny; 66 gym-B-on-gym-A cells all deny)
  - uat_money: RESULT PASS (61 checks, 13 finding probes; findings still open: none)
  - uat_shop_orders: RESULT PASS (66 checks)
- Deploy the admin app after any admin change (checked build, then wrangler in deploy/panel).

### Owner decisions needed
- None open (0021-0023 approved 18 Oct; the PC applies them).
- Optional: delete Actions run 38965066052 (two already-revoked test keys in its log).
