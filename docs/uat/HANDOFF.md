# UAT handoff (PC <-> cloud)

Whoever stops last updates this file and pushes it. The other side starts here.

## PC session, 22 Oct 2026 (morning, "ForgeAI Local Chat") — RESUME HERE after a compaction
- Tracker: every backlog row not built has a "How it will work" column (R-52; page script reads an
  optional 4th cell). Owner answered on the page: #40 A (landing live), renamed this chat, and a
  comment on branches + pricing -> "Several branches" now Planned, decision #41 (branch pricing).
- Landing LIVE: wrangler.jsonc vars.LANDING "live"; Worker version d88dc22f (checked deploy: tsc,
  vitest 929, journeys 45 with E2E_CHROME = installed Chrome, build). /home/ 200 with the CSP,
  /api/lead answers (400 bad number, 201 bot path, 405 GET); no test lead written. Rollback:
  `npx wrangler rollback 7739d985...` or LANDING "off" + deploy.
- Leads: `python scripts/leads.py` at the start of every session; tell the owner each new one
  (0 on 22 Oct). Email alert waits for the contact email (#37).
- One vitest run went red once (1 of 929, unnamed; colour output hid it) then 5 green runs: watch for a
  flaky admin unit test; next red run, save the reporter output.
- Next: notification-card workout time (native, with the owner awake), then Planned items.

## PC session, 21-22 Oct 2026 (night, owner asleep, R-51)
- v0.49.0 RELEASED (tag 61bed3d, run 39638183366); APK links 200.
- v0.50.0 RELEASED 22 Oct (tag fe2542f = 5a8375b + PROGRESS; run 39680117943). It was candidate 5a8375b: What's new (shows from 0.51), Save as routine after a
  first free workout, rest change moves the running timer, Machine in use, automatic Drive backup
  (only from a phone that backed up before), 15 s request limit. Two review rounds done (one MUST-FIX
  fixed). Gate: default 39647353406, journeys 39647362273, CI 39647345689 green; owner red only on
  U-Q6 (midnight), repeated green on the same code as 39664337093 (helper tag qa-v050-owner).
  APK links 200; GitHub latest = v0.50.0. Main moved on with the U-Q6 script fix (7393460).
- Admin live 7739d985: quick buttons on Today (+ everything from 21 Oct). Landing /home/ still OFF (#40).
- Tracker page republished (version 72). Waiting on the owner: #40 landing live, #37 contact, #27-#38.
- Next (my pick): workout time on the notification card (native RestCard.kt, cloud-only build, with
  the owner awake), then more Planned backlog items; FitPass and member progress need LIVE migrations.

## PC session, 21 Oct 2026 (evening) — RESUME HERE after a compaction
- Queue (tracker "Claude's tasks"): 1, 2, 3, 5, 6, 7 Done; 4 = v0.49.0 gate in progress; 8 built but the
  landing page is OFF live until the owner's yes (#40); 9 blocked (CLAUDE-NOTES R-49).
- v0.49.0: tested commit now 28dcf00 (app.json 0.49.0). First gate on 7d5ea4d: journeys green,
  default red (UK2 = U-M6b, a real keyboard bug, fixed), owner red (BR/INV = U-Q5 test fault, UR =
  U-M6b). Reruns: default 39621314089, owner 39621317566, journeys 39621321348, CI 39621312862.
  When all green: PROGRESS entry (paperwork) on main -> tag v0.49.0 on that commit -> push tag ->
  dispatch ci.yml on the tag -> rerun the release run if it stops on "build check" (memory note
  forgeai-release-commit-off-main). Do NOT commit non-paperwork to main before tagging.
- Landing page (/home/) rebuilt around the member app (R-50), reviewed twice (impeccable finish
  reviewer), DESIGN.md written; still OFF live until #40.
- Live admin app (forgeai-panel Worker) 47cfa24d: security policy, Send feedback, gym data download +
  delete request, Get started list; /home/ and /api/lead 404 (vars.LANDING "off").
- Cloudflare D1 `forgeai-web` (feedback, leads); secret FEEDBACK_SALT set. Read: scripts/feedback.py,
  scripts/leads.py (this PC's wrangler sign-in).
- Legal pages: docs/launch/preview/ until #37 (contact) is filled; then legal_pages.py writes public/.
- Waiting on the owner: decisions #27, #28, #30, #32, #33, #40; tasks #25, #26, #34-#38.
- Page republish costs a lot of tokens (read + absorb + rebuild): batch changes, publish once.

## PC session, 18 Oct 2026 (v0.48.0 ship gate) - last update 13:00 UTC
- v0.48.0 TAGGED: tag commit d62c4a4 = 4d651d6 + version + PROGRESS (main moved on with notes and the
  inbox page script, which phone_gate does not count as paperwork; main has the same two changes).
  Gate: default 39120213047, owner 39120214610, journeys 39120216807, CI 39120212122 (all green).
  First runs on 2391daf were red on test steps U-Q2 (part D) and U-Q3 (J3 owner phone): fixed in 4d651d6.
- v0.48.0 PUBLISHED: release run 39128079580 (attempt 2; CI 39128144598 dispatched on the tag, since
  ci.yml skips v* tags and the tag commit is on no branch). Phone + watch APK links answer 200.
- Task 2 (inbox #20 "Expiring in 1-3 / 4-7 / 8-15 days"): already LIVE since 15 Oct (399cc9e); covered
  by admin journey J27c (d2ef22c). Inbox page: chat rename (R-28) and the PC chat in the list (R-27).
- WP15 BUILT (5271512): test-lab.yml robot crawl after each release; dry run 39136145179 green ("not set
  up yet"). WAITS FOR OWNER: secrets TEST_LAB_PROJECT / TEST_LAB_KEY (docs/uat/TEST-LAB-SETUP.md). When he
  says it is set up: dispatch test-lab.yml with tag v0.48.0 and read the summary.

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
- DONE 18 Oct 2026 (PC, owner approved, inbox #6): 0024_workout_plans.sql applied LIVE from commit 93b7fd2, no error.
  LIVE tests: 0024_workout_plans RESULT PASS (20 checks); security RESULT PASS (9 checks);
  uat_access_matrix RESULT PASS (438 cells: 83 allow, 355 deny; 66 gym-B-on-gym-A cells all deny).
  public.gyms count 133 before and after.
  Admin app deployed after a checked build at 93b7fd2 (tsc -b 0, vitest 917 passed, build 0): version 3944c634.
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
- None open (0021-0024 approved 18 Oct; the PC applies 0024).
- Optional: delete Actions run 38965066052 (two already-revoked test keys in its log).
