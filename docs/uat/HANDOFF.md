# UAT handoff (PC <-> cloud)

Whoever stops last updates this file and pushes it. The other side starts here.

## PC session, 22 Oct 2026 (~16:30 IST) — RESUME HERE after a compaction
- **One release: v0.54.0 = f98d8df** (carries 0.51, 0.52, 0.53, 0.54 + R-78 fluid tab bar + the number-box scroll
  fix). 0.52.0 was NOT released: its owner run failed P7BIG twice (a drag starting on a centred number box never
  scrolled the page; fixed in SetRow, flow has a fallback + 03a-scroll-fallback picture). Gate dispatched on
  f98d8df (see the runs listed for that sha). When green: tag v0.54.0 on f98d8df (or a paperwork-only commit after
  it), PROGRESS entry, push the tag, dispatch ci.yml on the tag, check the APK link; then the checked admin deploy.
- **Check after the run:** qa-out/p7-big has NO p7-big-gesture-03a-scroll-fallback.png = the scroll fix holds.
- Journeys on 33e9c70 (R-77 join flow + fixed J3) were GREEN (39748509817).

## PC session, 22 Oct 2026 (~14:30 IST) — RESUME HERE after a compaction
- **v0.52.0 = 3ebf8fc**: journeys + CI green; device default 39734797251 / owner 39734799762 still running
  (background waiter in the chat). When green: release from a worktree (block below).
- **v0.53.0 is NOT released on its own**: its journeys 39739825172 failed at J3 step 1 because the live admin
  script (apps/dashboard/e2e-live/xj-messages.live.mjs) still used Shop -> Messages; fixed in 58eeb38. Its device
  runs were cancelled. v0.54.0 carries 0.53.0.
- **v0.54.0** (R-77: join -> welcome opening -> icon pop-up; no gym = no Shop tab, "Gym" until the shop lists a
  product; "Leave <gym>" row in Settings; phone flows rewritten by sub-join-gym.yaml / sub-after-join.yaml /
  brand-welcome.yaml) = 04e15d8 + 58eeb38. Its first gate runs were cancelled (old J3 script). An independent
  review of R-77 is running; apply its MUST-FIX, then dispatch qa-device default + owner + qa-journeys on main.
- **Admin + landing deploy** waits for the 0.52.0 release (checked deploy: tsc -b, vitest, `npx vite build` THEN
  playwright with E2E_CHROME, wrangler). Includes offers step 1, claim-code check, R-76 holding pages.
- **Waiting on him:** #37 contact (legal pages), #41, #43, #44, #45-#47, #49, #50, #42 Google setup.

## PC session, 22 Oct 2026 (after the compaction, ~13:00 IST) — RESUME HERE after a compaction
- **v0.52.0 = 3ebf8fc**, gate: journeys 39734802376 GREEN, CI 39734778914 GREEN; default 39734797251 and owner
  39734799762 still running at 07:20 UTC. When both green: worktree `git worktree add --detach ../rel052 3ebf8fc`,
  PROGRESS entry, tag v0.52.0, push the tag, dispatch ci.yml on the tag; APK link must answer.
- **v0.53.0 candidate = 0e88ed8** (main): R-75 finish list (d7c3329), R-58 tips + Settings switch, workout offer
  claim code (f4b6a22, both apps), review fixes (363d4b2). Gate dispatched 07:20 UTC: default 39739818742,
  owner 39739822180, journeys 39739825172, CI 39739818090. Release it the same way after 0.52.0 (main is ahead
  of 3ebf8fc, so 0.53.0 tags 0e88ed8 or a later fix commit).
- **Admin app committed, NOT deployed:** offers step 1 (adc4ea5, review fixed), claim-code check (f4b6a22), plus
  offline step 2, landing sections, title fix from before. Checked deploy after the 0.52.0 release: tsc -b,
  vitest (1012), `npx vite build` THEN playwright (48; it runs on dist), wrangler.
- **Tracker:** Claude's tasks rows 11, 15-21 need updating at the next republish (0.51 skipped, 0.52/0.53 status,
  offers step 1 built, muscle tips built).

## PC session, 22 Oct 2026 (afternoon, stopped at 88% context) — RESUME HERE after a compaction
- **0.51.0 is NOT released separately:** its default-profile run 39722663191 failed only on one caught
  "workout reminders could not be set" (expo-sqlite "already released"); now retried once (reminders.ts).
- **v0.52.0 candidate = 3ebf8fc** (carries 0.51 + gym fixes R-61/R-61b/R-65/R-66/R-70/R-72/R-73/R-60, two review
  rounds fixed). Gate running on 3ebf8fc: default 39734797251, owner 39734799762, journeys 39734802376, CI
  39734778914. When all green: worktree `git worktree add --detach ../rel052 3ebf8fc`, PROGRESS entry, tag
  v0.52.0, push the tag, dispatch ci.yml on the tag (memory forgeai-release-commit-off-main); check
  releases/download/v0.52.0/forgeai-v0.52.0.apk answers. Then the checked admin + landing deploy.
- **Committed after the candidate (0.53.0 work, not released):** muscle-tip engine/service/store (R-58) and,
  in the WIP commit after this note, the Up next tip UI (workout.tsx + MuscleTipNote.tsx) and the finish-screen
  comparison (R-75: coachNote.comparisonWorkout + lib/workoutCompare; the expandable per-exercise list in
  app/session/finish.tsx is NOT built yet: arrow on the right, opens the rows, his request). Both need a review.
- **Admin offers step 1 (#49):** a background agent was editing apps/dashboard (uncommitted files: messages,
  templates, audience, sendQueue, receipt fix...). On resume: read its report if it arrived, else check
  `git status`; run tsc -b, vitest, journeys (E2E_CHROME), review, commit, deploy after the 0.52.0 release.
- **Tracker:** #45-#50 written (voice counting, trainer view, AI import, extra rep, offers, server storage);
  page last published v79 (before #50): republish (read + absorb + rebuild + publish).
- **Context meter:** ~/.claude/hooks/context_meter.py (PostToolUse) warns at 85% and 90% of 1M tokens.

## PC session, 22 Oct 2026 (midday, owner in the gym sending notes R-61..R-73) — RESUME HERE after a compaction
- **v0.51.0** = 4e5983d, gate: journeys 39722667517 GREEN; default 39722663191 and owner 39722665499 still running
  at 06:07 UTC. When green: release from a worktree (memory forgeai-release-commit-off-main), APK link 200.
- **v0.52.0 candidate** on main (app.json 0.52.0): 9de71a9 + 5e2c24c (In use after each set) + 898b8a4 (review
  round 1 fixed: Same routine keeps its own Target with breakFromISO; pairs only for real two-dumbbell typers;
  live kg line in the yellow Target box, R-73; reps to beat, R-60; Health Connect asks first, R-72) + b8be643
  (muscle check engine, unused). A second review (new features only) was running; apply its MUST-FIX, then
  dispatch the gate (qa-device default + owner, qa-journeys) on that commit, then release v0.52.0.
- **Uncommitted at the time of writing:** volumeService.getBalanceSets (R-58 reader) — harmless, typecheck clean.
- **Admin app, building in the background (agent, uncommitted, apps/dashboard only):** offers step 1 (#49):
  templates EN+HI, who-gets-it picker, WhatsApp send-to-next, Messages & offers menu, Today nudges, receipt fix
  (dates as sold + "Extended free by N days"). Review it, run tsc -b / vitest / journeys (E2E_CHROME), commit,
  then deploy admin + landing ONLY after v0.51.0 is released (landing names 0.51 features).
- **Admin import fix committed (a6d7e4d):** titles left out of imported names. The live server's first-name check
  (_first_name_key) still reads "Mr." for names already there: needs his yes (ask with the next live change).
- **Tracker:** #45 voice counting, #46 trainer view, #47 AI import, #48 one extra rep (answered), #49 offers;
  page version 79. Notes R-61..R-73 in CLAUDE-NOTES.
- **Next builds:** R-58 UI (Up next line + plan list card + Settings "Muscle tips" + snooze store), offers step 1
  item 6 (claim code, both apps), then step 2 after his yes (#49).

## PC session, 22 Oct 2026 (late morning, R-55 batch "do all you can") — RESUME HERE after a compaction
- **v0.51.0 candidate = 4e5983d** (workout clock in the live card's own view, rest-over sound choice, What's
  new with 7 earlier updates + Settings → What's new, block-proof address with stamp-checked fallback, two
  review rounds fixed). Gate dispatched on main@4e5983d: default 39722663191, owner 39722665499, journeys
  39722667517; CI 39722400227 GREEN; Wear OS build 39722400190 GREEN. When all three are green: worktree
  `git worktree add --detach ../rel051 4e5983d`, PROGRESS v0.51.0 entry, commit, tag v0.51.0, push the tag,
  dispatch ci.yml on the tag (memory forgeai-release-commit-off-main), check the APK link answers 200.
  A red on a date near midnight IST = U-Q6 pattern (rerun one profile via a qa-... helper tag).
- **Then deploy the admin Worker** (checked deploy, E2E_CHROME = installed Chrome): main now also holds the
  landing page's new sections (they name v0.51.0 features: deploy only after the release) and offline
  desk step 2 (check-ins kept offline). Live now: Worker 23f1fb7d (admin with /sb proxy + stamp, offline
  step 1, GST tax invoice, landing as of R-54).
- Admin journeys on the latest tree were running at the stop (b718ikelz); unit tests 951 green; J34 (offline
  incl. check-in) green alone.
- Research running at the stop: docs/overhaul/research/R-muscle-balance.md (R-58) — read it, then build.
- Next after deploy: R-58 missing-muscle suggestions, R-60 reps to beat, R-59 trainer view (live server
  change = his yes). Offline desk step 3 (payments) waits for the gym visit (money risk; server rules allow
  a per-desk series up to 16 chars).
- Owner tasks/decisions added today: #42 Google setup (Drive backup is hidden until then; exact steps and
  SHA-1 in the tracker), #43 sign-in (A Google + desk confirm), #44 brand name (A Repghar), #41 branches.
- Tracker page last published as version 76 (before #42-#44): republish after any further change.

## PC session, 22 Oct 2026 (morning, "ForgeAI Local Chat")
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
- Landing punch line live (R-54, Worker 4af80c65): "Gym software + member progress app" under the headline.
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
