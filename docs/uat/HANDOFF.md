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
- ⭐ NEXT SESSION, read docs/OWNER-INBOX.md first. Owner answered 5 questions on 18 Oct (now DECIDED
  in the inbox, with his notes): #13 B exercise-level "busy times" (opt-in sharing, no equipment list),
  #12 A gate-QR Step 1, #11 A/A/A (gym-logo shortcut, welcome-screen join, research Google login),
  #9 A/A + per-exercise kg target with % overload and expandable per-set targets, #7 A offline front
  desk for the admin app AND the Chrome website (grey out what can't work, persistent offline banner).
  #17 (inbox page: mark as read, reply to any answer, comment without picking, Waiting = unread or
  open) BUILT 18 Oct: before every page rebuild run `owner_inbox_page.py --absorb <saved page>` (CLAUDE.md).
  Next: plan the builds above (new features: research + plan first per CLAUDE.md;
  #7 is admin/CRM = gated on fieldwork? check docs/overhaul/FIELDWORK.md and ask if unsure).
- v0.47.1 tag: owner pushes from the PC (prompt in chat; commit 8403202; dry run green).
- v0.47.0 PUBLISHED 17 Oct (release run 39052565058). v0.47.1 (U-M7, U-M8, U-G6 + sturdier phone tests)
  green on b43a095 (39074784648, 39074786096, 39074787606); bump commit below waits for its tag from the
  PC: `git tag -a v0.47.1 8403202 -m v0.47.1 && git push origin v0.47.1`. Release dry run 39082827847 on 8403202: SUCCESS. Owner decisions waiting: docs/OWNER-INBOX.md (table on top).
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
- Owner yes -> apply 0021_receipt_rules.sql, then 0022_key_status.sql, on the live database; run
  every supabase/tests/*.sql live (expect RESULT PASS, "findings still open: none").
- Deploy the admin app after any admin change (checked build, then wrangler in deploy/panel).

### Owner decisions needed
- Apply the two database changes above (recommend: yes).
- Optional: delete Actions run 38965066052 (two already-revoked test keys in its log).
