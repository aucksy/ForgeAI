# Claude's notes: the owner's requests, instructions and feedback

Claude's own working log (owner rule, 18 Oct 2026): everything the owner asks Claude to DO, or says
about how to work, is written here first (chat can be compacted), with what was done. It is NOT on
the owner's inbox page; the inbox holds only questions and answers, his decisions, and the feature
backlog. Newest on top. Entries 3-21 were moved here from docs/OWNER-INBOX.md with their old numbers.

Older entries are moved automatically (scripts/trim_notes.py, newest 40 kept here) to docs/CLAUDE-NOTES-ARCHIVE.md: grep it before saying something was never said.

## R-615. Full system audit: STARTED (scheduled start run) - 18 Nov 2026 16:37 IST

- Plan: D:\Brain\Dev-Framework\2026-11-16-full-system-audit-plan.md. Live state: docs/system-map/AUDIT-STATE.md.
- Analysis only (his words, 18 Nov 2026): no app code, tests, workflows, skills or settings change; proposals only.
- Helpers: Fable 5.2, effort medium, max 6. Model router OFF (checked). change-360 switch OFF (checked).
- Done: A1 (docs/system-map/surfaces.json, 11 surfaces). Running: plan review helper -> docs/system-map/PLAN-REVIEW.md.
- Plan review DONE (docs/system-map/PLAN-REVIEW.md): 22 of 26 applied to the plan file; P2, P23, P24, P25 wait for him (see AUDIT-STATE.md Needs Aakash).
- Pacer task could NOT be enabled unattended (needs his click); backup hourly cron lives in the start chat. E1 helper running.
- Next: T1 tools + A1b source lists, then the A2 pilot. 18 Nov 2026: chat compacts at 20% now; after it, read these notes before saying we never discussed or he never approved something.
- 0.79.0: in Play open testing; production is his call (R-614). Audit runs beside it.

## R-615. Audit: "skipped" was the pacer; main audit chat moved from Opus to Fable - 18 Nov 2026

He asked why the audit did not run (Scheduled showed "skipped") while his 5-hour meter was at 10%.
Found: mettleup-full-audit-start ran on time (16:36 IST, session local_a9a94e8b-c80f-43bd-a5c9-6a2171cb235a) and was working.
The skip was mettleup-audit-pacer: it stays disabled until the start run's step 7 turns it on. But the start session ran on
claude-opus-5-5, not Fable (the task file set no model; only its helpers were "fable").
He said "Yes, switch to Fable": set that session to claude-fable-5-2 (from its next turn), and gave the pacer SKILL.md
frontmatter model: claude-fable-5-2 + effort: medium plus a MODEL CHECK FIRST step (not Fable -> only coordinate, every
piece of work to fable helpers). NEXT: after the first pacer run, get_session its id; if not Fable, set_session_model it.

## R-613. Terms: exercise pictures are only a guide; house writing style - 18 Nov 2026
- Terms part A section 4 "Your health" got his version A paragraph (commit 0f80fcdc), plus a summary bullet and the
  what-changed note. Members only: TERMS_VERSION unchanged (no owner re-accept).
- NOT LIVE: public pages ship only with an owner panel deploy. His answer (18 Nov 2026): "A" = deploy AFTER the
  audit, with the first fixes. Do not deploy the panel for this before then.
- House style = version A (his words: "That's how I want you to write English. Simple, to the point, and correctly
  done."). Saved in D:\Brain note member-words-are-complete-sentences and the member-words skill.
- Gemini script now refuses a brief without 7 headings (who reads, where, kind, why, true facts, must not say,
  surrounding text).
- Backlog: F228 (rewrite all copy and legal pages in the house style), F229 (longer rest raises the next set's
  target, with a note). Both after-audit.

## R-612. Change 360 flow: global, behind a switch, his yes per change - 18 Nov 2026

He said: install the gap-prevention flow globally "but with a switch. So before this flow activates, I want to approve it first. I do not want it activated for each and every simple fix"; generic questions globally, MettleUp's own questions only here; review for negative side effects.

Built (master switch OFF until he turns it on): skill ~/.claude/skills/change-360 (SKILL.md + 43 generic QUESTIONS.md), switch ~/.claude/change-360/switch.json, hook ~/.claude/hooks/change_360.py (prompt: triage line; commit: blocks git commit only while an ACTIVE approved card has questions/blast radius/tests-first undone; fails open). MettleUp's 20 extra questions: docs/change-360-project.md. Answers go into the 15 Nov change card docs/changes/R-<n>.json (one card). Rule note: change-360-runs-only-with-his-yes. Research + design: D:/Brain/Dev-Framework/2026-11-18-feature-360-questions.md.

## R-611. Watch update pop-up: how often, and a lasting dot - 18 Nov 2026

He asked: after 0.79.0 he saw the watch update pop-up once, closed the app without tapping, and never saw it again over many opens. How often should it show? The phone has a lasting top banner after its pop-up is closed; should the watch get a lasting dot that leads to the watch settings?

Answer (from watchUpdateCard.ts + WatchUpdatePrompt.tsx): it shows on app open (4 s in) and on return after 6 h, only on the 3 main tabs, never in a workout, never while a phone update waits. 'Later' OR the Android back button (onRequestClose = later) = no pop-up for 24 h. 'Update on watch' = never again for this phone version (R-444). It also stops for good when the watch reports the new version (Play auto-update on the watch). Swiping the app away writes nothing, so it would ask again on the next open. Likely causes for him: the watch auto-updated, or back = 24 h snooze. No lasting reminder exists.

My view given: yes, add a quiet lasting sign (dot on Settings + an 'Update ready' row in the watch section). Audit freeze: goes to the backlog as after-audit only when he confirms.

Follow-up (he said): every watch pop-up, card and notification must show only with a detected, connected, eligible watch, eligible = any watch that can install the app. Checked in code: all of them (intro slide, start card, after-workout card, Settings row, update pop-up) read Wear OS connected nodes; no node = nothing shows. Garmin, Fitbit, Amazfit, Noise, boAt, Apple and old Samsung Tizen watches never appear as nodes. Update pop-up needs the app already on the watch. Gap: a Wear OS 2 watch (Android 7-9, minSdk 30 blocks it) still gets the INSTALL offer; the phone cannot read a watch's Android version without our app on it. Tiny group in 2026; fallback note shows if the store refuses. Not changed.

## R-610 (17 Nov 2026) Release 0.79.0 (phone + watch) to Play OPEN TESTING: IN PROGRESS (helper; state as of 10:40 IST)
- Approval (quoted by the coordinator): "yes 0095 / yes 0096 / release" (15 Nov 2026, 22:21 IST) and "Take best
  decisions yourself to release whatever is pending" (16 Nov 2026, 00:23 IST). One release = v0.79.0 only.
- Release commit 1257a600 (on main): the 0.79.0 What's new entry dated '17 Nov' (was '16 Nov'); nothing else.
  Since 0d63a5e5 main changed only apps/dashboard, deploy/panel and docs before it, and only panel/docs after it (R-609).
- Full round on tag qa-rel-079j = 1257a600 (gate rule 1: a whole round on the tag commit itself):
  CI (main push) 44011797895 GREEN; CI (tag push) 44011842958 GREEN; journeys 44011857204 GREEN; Wear OS build
  44011860511 GREEN; phone conditions (all) 44011853645 GREEN; emulator + uat 44011843148 RUNNING; owner + uat
  44011846187 RUNNING; uat font 2.0 / 360 dp owner (only=uat) 44011849464 RUNNING.
- Tag v0.79.0: NOT made yet. NEXT: when the three device runs are green, tag v0.79.0 on 1257a600 (its message has no
  skip-ci marker), push the tag (release-apk.yml runs the gate, build, publish and play-upload, dry_run off), read the
  play-upload log for "Trying again with" (watch closed/open refused while the phone review runs; then re-run
  play-upload.yml for v0.79.0, dry_run off, after the review). Then PROGRESS.md: "### 0.79.0" lines to "## Done".
  If J3 (owner) fails: re-run it once (only=j2,j3 owner); two fails = possible app bug, no release.

- 17 Nov 18:46 IST UPDATE (coordinator): owner said "debug now and release before tomorrow / I dont want another
  long test.." (17 Nov). The font 2.0 run 44011849464 failed 2 flows, both TEST faults (pictures + hierarchy
  show the app right): uat-rel-4-workout tapped set 1's tick while the screen moved (label present);
  uat-rel-r576-c-break asserted the why mark while it was above the screen edge (fixed c095249b: scroll UP).
  phone_gate needs only the two whole rounds (both green), so v0.79.0 was tagged on 1257a600 and pushed.
  release-apk 44091025092 GREEN: phone 79000 committed to internal/alpha/beta (in Google review); watch
  1000079000 only on wear:internal (closed/open refused while the phone review runs). Session cron cd3d7657
  re-runs play-upload v0.79.0 hourly until the watch lands. Production by hand about 3 days later.
  Owner asked (17 Nov) that the audit also fixes the test system: plan section 3E added.
- 17 Nov ~20:40 IST: play-upload 44109513123 (v0.79.0, dry_run off): phone tracks already had 79000 (skipped);
  watch 1000079000 Set on wear:Watch closed testing + wear:beta, committed. Phone + watch 0.79.0 on internal,
  closed and open testing. Cron cd3d7657 deleted. NEXT: production by hand about 3 days later, with his yes.

## R-609 Birthday wish: the panel now reads first names exactly as the live server does (17 Nov 2026)
- R-607 + R-608 were deployed live 17 Nov 2026 at 283ce69b (panel Version 17 Nov 2026; bell History, X and tappable
  cards checked live in Chrome).
- Fresh-eyes review of R-608, three fixes (panel only, no server or wording change):
  - logic/autoWish.ts firstNameKey = the server's _first_name_key (0023) exactly: letters only (\p{L}; Postgres
    [:alpha:] drops marks), trims plain spaces only. Checked on the live server with plain SQL (built-ins only):
    Rahul Sharma in Devanagari -> the letters r, h, l only; NBSP + "Rahul" -> rahul; NBSP + space + "Rahul" -> no name;
    tab + "Rahul" -> rahul. Before, the panel kept the vowel signs (a Hindi name typed with signs on one side and
    without on the other matched on the server but not in the panel) and .trim() removed every kind of space.
  - logic/autoWish.ts: a list member's appUserId no longer counts as "gets the wish" (the server never looks at it; real
    gyms never set it). Demo is online and does use this logic, but the demo app list carries the name and number of
    every linked member, so the demo answer is unchanged unless two demo members share a number.
  - shop/birthdayAuto.ts: a background read that started before the reminders page passed a switch (the owner saved
    it) keeps the saved switch instead of putting the old one back for up to 5 minutes; its app members are still taken.
- Tests: awayIdea.test.ts: appUserId alone = not wished; new R-609 first-name test (Devanagari, NBSP before a space,
  NBSP stuck to the name, tab before a space). Not run locally (this laptop's esbuild binary is missing).
- CI 44012526785 on b1aa8318: GREEN after one re-run of the failed jobs. First try: all 5503 unit tests passed; the
  database job died on the runner (port 54322 already in use) and 2 timing e2e specs unrelated to birthdays failed
  (r448-uat WhatsApp verify note, today-handled-uat R-593 bell count); the previous commit 1257a600 was green.
- Not deployed.

## R-608 The AI Assistant stops asking for birthday wishes the app already sends (16-17 Nov 2026)
- Owner: "the birthdays are set to be automated but the AI assistant is still suggesting that" (his gym has the
  automatic birthday wish ON; "Today for you" still said "Birthdays today: N · Write birthday wishes"). He approved the
  direction: count only the members the automatic wish will not reach.
- How the wish really works: the member's phone shows it at 9:30 am only when the server gives it the birthday:
  member_auto_reminders (0029) -> member_membership (0055): the app member's proven number (checkin_phone) is on
  exactly one member of the list (not archived; shared = refused) and the first names match (_first_name_key).
- First build (cffc7f03..2551a70e) used the list member's appUserId. REVIEW BLOCKER (coordinator, 16 Nov): nothing on
  the server writes appUserId (Crispy Curves: 2 list members, 2 app members, 0 linked), so every birthday still
  counted, labelled "not in the app". Fixed forward, no server change:
  - logic/autoWish.ts mirrors the server rule with what the panel already loads: owner_app_members' `phone` (every
    server step that proves a number writes checkin_phone and phone together since 0016; leaving clears both), one
    list member with that number among those not archived, firstNameKey = _first_name_key. appUserId = extra yes (R-609: dropped, the server never reads it).
    Gap (no server change allowed): an old row whose `phone` was typed but never proven (0015 era, or an old app
    passing p_phone at join) would count as wished when the server does not wish it.
  - shop/birthdayAuto.ts reads the switch AND the app members (one store, 5-minute re-read while a screen uses it,
    a late answer for a gym the owner left is dropped, the reminders page passes on each save). Online and not
    answered yet: 'waiting' = no birthday idea / row for that moment (no count that jumps). Offline, demo, a failed or
    old server, switch off: as before.
  - Words (fresh-reader pass twice; "not in the app" was wrong for an app member without a proven number):
    idea "Birthdays today, no automatic wish: N" + "Write birthday wishes"; See who title "Birthdays today, no
    automatic wish"; plain "whose birthday is today?" rows say "Gets the automatic wish at 9:30 am" / "No automatic
    wish", button "Wish {names}" (4+: "Wish the other {n}"); Today "N members get no automatic birthday wish today".
    Hinglish in lang/hinglish.ts (old "not in the app" lines removed).
- Left as is: the "Birthdays today" count tile on Today (a fact, not a nudge); Messages > "Birthday wish" still lists
  every birthday member (a tool he opens on purpose); a message the AI drafts for the whole group "birthday_today"
  when he types that himself.
- Tests: awayIdea.test.ts R-608 block (app member with matching number and first name; no proven number like Crispy's
  Digvijay = NOT wished; name mismatch; shared number; archived not sharing; appUserId (R-609: alone = not wished); waiting = no idea; off;
  unknown; plain list). e2e r608-uat.spec.mjs: Asha in the app with her number, Ravi in the app with no number (still
  counted); all wished = no idea; off = both; 390, 360, 1280. First build: CI 43934148340 green. Fix: CI below.
- Also fixed whatsNew.test order checks left stale by R-607 (58aa692f).
- Proposed What's new (not added; the coordinator adds it at the deploy): "Birthday wishes: when the automatic birthday
  wish is on, the AI Assistant and Today ask you to wish only the members who will not get it. A member gets the
  automatic wish on their phone at 9:30 am once they use the MettleUp app with the same mobile number and first name
  as on your member list."

## R-607 0098 is LIVE; bell news moved to What's new for the panel deploy (16 Nov 2026)
- Owner: "yes 0098", then "retry 0098", "lets go with 1", "go 0098" (16 Nov).
- apply_migration was "declined" twice: the desktop app hides Supabase MCP's own SQL confirmation form and answers no.
  With his "1": the Supabase MCP URL in his Claude settings now skips that form for apply_migration (the
  supabase-guard "ask" box stays the human check). He signed in again via /mcp. Third try: success (~22:30 IST).
- Live check (read-only): 4 new gym_alerts columns, gym_alert_reads table, 8 functions, 7 triggers. Backfill: 141 alerts
  marked done, 134 already-sent alerts marked read by all.
- Installed the official Supabase skills (supabase, supabase-postgres-best-practices; markdown only) at his suggestion.
- Panel: ADMIN_NEWS_PENDING 'pending-bell-to-do-list' moved to ADMIN_NEWS id 2026-11-17 (16 Nov already used; deploy
  after midnight IST). Help article 'bell-to-do-list' is live (unreleased line dropped). whatsnew.spec J149 and
  whatsNew.test updated. Next: CI green, deploy panel from wt-site with the CI dist, live check bell + badge + Hinglish.

## R-606 Bell fix: fresh-eyes review and 3 fixes to 0098 before it goes live (16 Nov 2026)
- Owner said "yes 0098" and "Hinglish is fine" (16 Nov). Hinglish bell lines added (b1fee045).
- Review (no blockers, no security hole). Fixed in 0098 before applying:
  1. Backfill now marks enquiry alerts 'called' when the enquiry is open and its next call is a later day (the old app showed these as done).
  2. Enquiry trigger: open again after joined/lost clears 'joined'/'not_interested'; a next call moved back to today or earlier clears 'called'.
  3. The 'already sent = read by all' step runs only on the first run (session flag mettleup.m0098_first).
  4. Header: seven triggers (not eight); undo in one transaction.
- Tests 6reopen / 6later / 6back added. Panel nits left (Undo after reopening the bell; panel opened before the first answer; brief count flicker): small, after-audit.
- Next: CI green, then apply 0098 live at a quiet hour, deploy panel (and HQ if changed), check live.

## R-605 Admin alert badge is one colour (16 Nov 2026)
- Android draws a notification badge from its alpha only, so the full-colour admin icon became a white square in the status bar.
- New: branding/mettleup/web/admin/badge-96.png (white hex with the M cut out, transparent), mapped by install.py to apps/dashboard/public/brand/admin-badge-96.png. sw.js badge now points there; icon stays admin-icon-192.png.
- Made by drawing the mark-mono.svg shapes with PIL (8x supersample). On main, not live yet: goes out with the next panel deploy (the bell-fix deploy).

## R-603 (16 Nov 2026) Admin app alerts showed the old ForgeAI hexagon icon: fixed and deployed (panel only)
- Bug: the owner's phone lock screen showed admin web-push alerts with the old ForgeAI hexagon. The service worker
  (apps/dashboard/public/sw.js) used /icons/admin-192.png for icon and badge.
- Fix: c1c17b94 uses /brand/admin-icon-192.png (the MettleUp "M Admin" icon, 192x192 PNG) for both; webPush.test.ts
  updated. The old /icons/ files stay (deploy/panel/hosts.test.mjs keeps /icons/admin-192.png served).
- Fresh review of 0a0f87d2..c1c17b94 (apps/dashboard + deploy/panel): only those two lines change. The SW still caches
  /brand/ and /icons/. Nothing else ships.
- CI 43811576084: attempt 1 red on the known flaky e2e alerts-uat.spec.mjs:394 "latest-alerts" count (expected 2, got 4;
  same test red on 7f7dd880, ca1726d0, 2c90323a, each also green on a sibling run; R-604 then fixed that test). Re-ran
  the failed job: attempt 2 green.
- DEPLOYED panel only (no HQ) from wt-site detached at c1c17b94f7a58f3183b6992e82681c0ee82d1e07 with the CI
  dashboard-dist: version ad11860c-fc36-40f5-ae9f-b4739af37a55.
- Live check: app.mettleup.fit/sw.js line 168 has '/brand/admin-icon-192.png' (icon + badge);
  /brand/admin-icon-192.png 200 image/png; /icons/admin-192.png still 200 image/png; /api/switches unchanged.
  Phones pick up the new SW on their next visit to the panel; alerts after that show the M Admin icon.

## R-604 (16 Nov 2026) The bell = the to-do list: the server knows DONE and each person's READ (owner: "yes alerts fix")
- Bug he hit: 11:00 push "4 new updates from your members" after he had handled everything the day before. Cause: the
  summary (0076/0095 hq_panel_digest_claim) counted every unsent alert of 8 days; "done" lived only in the browser
  (alertHandled.ts, R-593, matched by kind + time).
- His rules (16 Nov): opening the panel = read, but an item stays until he has acted on it in its page; the panel is the
  place to track what is not done; anything done goes away; robust and accurate. Cards must look tappable; no browser
  tap cover. Later the same day (coordinator relayed): info items (nothing to do) are done only when THAT item is opened
  (tapped), or by themselves after 7 days; opening the panel only reads them; nothing leaves the open panel while it is
  open; a collapsed "History" at the top (last 7 days of done, opened, removed); an X on every card, per person, with
  "Removed. Undo"; X on an action item NEVER marks it done (the member's page and Today still show it waiting).
- Server: supabase/migrations/0098_alerts_done_and_read.sql (NOT APPLIED LIVE; waits for "yes 0098"). Test:
  supabase/tests/0098_alerts_done_and_read.sql.
- Bell number (final rule): action items not done and not removed + info items not read yet. A read info item stays in
  the list without a number until it is opened, removed, or 7 days old.
- Panel: logic/alertInbox.ts (pure rules), ui/BellInbox.tsx (cards, X, History), ui/WhatsNew.tsx NewsBell (frozen
  while open, UndoBar), ui/NeedsYou.tsx (inbox from owner_alert_list, falls back to owner_alerts on PGRST202; Today uses
  todayFromInbox: an action item removed from the bell but not done stays on Today), shop/alertsApi.ts, index.css (tap
  look: no grey tap cover, pressed + hover, chevron, focus ring inside the card). History row always shown (with 0) so
  the first X never pushes the list down. X and Undo are sent to the server in order.
- Decisions: viewing Today does not mark anything read on the server (tapping a line there counts as opened); a
  handled alert gets sent_how 'none'; news older than 7 days is in History until it is 14 days old; the bell reads
  "99+" past 99.
- Words (English only, through t(W.x), no Hinglish entries; proposed Hinglish for his read-aloud check is in the
  report): History, the History hint/empty lines, "Nothing is waiting for you. ...", "Removed from your list.",
  Remove, "Undo: put back {line}", Opened, "Removed · Not done yet", "Older than 7 days", "Done by {name}".
- Help: deploy/panel/helpArticles.js 'bell-to-do-list' (unreleased until 0098 + deploy). What's new:
  ADMIN_NEWS_PENDING 'pending-bell-to-do-list' (moves at the first panel deploy after 0098 is live).
- Tests: supabase/tests/0098 (55 checks, PASS), unit test/crm/alertInbox.test.ts, e2e/bell-inbox-uat.spec.mjs
  (owner 390, desk 360, trainer, computer 1280 dark + light, 0 and 120 items, old server then upgrade). Pictures
  bell-1 .. bell-18 in the "dashboard-uat-pictures" artifact.
- Commits: 496cb688 (0098 + its test), 2485c293 (panel), e2799d85 (test counts + security list), 66825dba (fixes from
  the pictures: one-line Undo toast, 99+, ordered sends). CI: 43827788987 green on 737a18e3 (database: 0098 applied + lint + 55 checks pass; dashboard typecheck, unit tests, build, crawl, 321 journeys incl. bell-inbox-uat). Earlier runs: 43815460386 (security list), 43817737306 / 43822375917 (UAT locator and Today-page fixes).
- Status: built, NOT live. Live needs: his "yes 0098" (apply the migration), then a panel deploy (move the pending
  What's new entry and drop the help article's `unreleased` line in that deploy).

## R-602 (16 Nov 2026) 0.79.0 UAT round: what failed on ed5360aa, the fix, the new round (helper; no tag, no release)
- Coordinator's brief: get the full UAT round green on the release commit, then report. No tag, no release run, no Play.
- What failed on ed5360aa (read from the logs and pictures):
  - Owner phone + uat 43796622071: ONLY shard 1-history-routines, part J3 (drag an exercise in a live workout):
    "J3 DRAG FAILED: order after the drag is 'Dumbbell Skull Crusher|Lateral Raise'". Picture j3-after-drag: Lateral
    Raise, dragged UP above Bench Press, landed at the BOTTOM of the list. The held picture is identical to the green
    run on 14 Nov (43644983246, same coords 472 2025 -> 300, "J3 DRAG OK"). Drag code (DragList, dragOrder,
    active.tsx lift/shift) unchanged since October, so already in 0.78.0: NOT a 0.79.0 change. Not proven to be a test
    fault: possibly a rare real glitch (the held card's offset follows the list's scroll; if the list moved during the
    drag, the drop lands lower). Shards 4-workout, 5-uat-b, 6-uat-c were cancelled by fail-fast (never ran).
  - Partial ua,u454 default 43796624722: part uatr454a, sub-uat-r439-add.yaml. The keyboard stayed open over "Add 1"; the
    tap hit the keyboard's suggestion strip ("incline dumbbell press" became "pressure") and nothing was added. Test
    fault. u454 alone then passed (43800014373) by luck of the keyboard.
- Fix (test only): sub-uat-r439-add.yaml closes the keyboard (hideKeyboard) before "Add 1", as uat-d.yaml does. Used by
  u439 a/b, u454 a + row, u576 a, u436 a.
- NEXT: partial runs (only=ua,u454 default; only=u439,u454,u576,u436 owner), then the full round on the same commit:
  emulator + uat, owner + uat, uat font 2.0/360 dp, phone conditions, cross-role journeys, Wear OS build. Run ids below.
- Runs on 6f893b2e: CI 43809737473 GREEN; partial ua,u454 default 43809751891 GREEN (uatr454a passed with the fix);
  partial u439,u454,u576,u436 owner 43809754655 and j2,j3 owner 43809774231 (is J3 repeatable?) running.
- FULL ROUND dispatched on 496cb688 (main had moved: other helpers pushed c1c17b94 admin icon + 496cb688 0098 file,
  no phone-app change; a whole run on the tag commit itself is gate rule 1): emulator + uat 43817100950, owner + uat
  43817104084, uat font 2.0/360 dp owner 43817107325, phone conditions 43817110240, journeys 43817112692, Wear OS
  build 43817115099. Tag only a commit these passed on (or one whose later diff is notes only).
- Partials on 6f893b2e: u439,u454,u576,u436 owner 43809754655 device job GREEN. j2,j3 owner 43809774231 RED again at J3,
  a different way: the 2nd name row was in the dump but below the list edge (clipped box [267,2275][677,2130]); the
  test held its "centre" y 2202, under the "Log a set to finish" bar (test fault). The order then still changed (Bench
  Press ended below Triceps Pushdown); unexplained. On 903b62ef owner J3 passed (job 133036451395). So J3 owner on
  0.79.0 builds: 1 pass, 2 fails. Fix 148fa669 (test only): drag_check ex-drag/ex-next skip rows under 40 px on screen,
  J3 scrolls the row into view. Partials j2,j3 on 148fa669: owner 43821923647, default 43821926843.
- APP QUESTION (not fixed, not new in 0.79.0: drag code unchanged since Oct): twice a dragged-up card ended LOWER
  (43796622071: Lateral Raise to the bottom). Possible cause: the held card's offset follows the list scroll (dragShift).
- ROUND on 496cb688: emulator + uat 43817100950 GREEN, owner + uat 43817104084 GREEN (J3 passed this time),
  journeys 43817112692 GREEN, conditions 43817110240 GREEN, Wear OS 43817115099 GREEN, font 2.0 uat 43817107325 running.
  BUT CI 43815460386 on 496cb688 is RED (another helper's 0098 database test, fixed later in e2799d85), and the release
  gate needs CI green on the tagged commit. j2,j3 on 148fa669: default 43821926843 GREEN, owner 43821923647 RED (J3
  dropped Lateral Raise at the bottom again). J3 owner history: 7 of 7 passes on 8-14 Nov builds; on 0.79.0 builds 2
  passes, 3 fails (2 "dropped at the bottom", 1 test grab fault). Looks like a 0.79.0 change; cause not found.
- ROUND 2 on tag qa-rel-079f = 719fd05c (main tip, CI 43833567273 GREEN; both test fixes; no phone-app change since
  930ebf77 apart from apps/mobile/qa): emulator + uat 43841923587, owner + uat 43841927489, journeys 43841931157,
  conditions 43841935528, Wear OS 43841939870, font 2.0 uat 43842027998. Tag v0.79.0 only on 719fd05c if green.
- FONT 2.0 / 360 dp uat 43817107325 (on 496cb688) RED, 5 parts, all TEST faults (pictures read; the flows assumed a
  page fits one screen): uat10 (Hevy heading above the top edge), uatf199 (Exercises row below the edge), uatr438a
  ("Later" below the edge of the watch pop-up; it scrolls, flow b already scrolls to it), uatf203 (tap lands mid-number,
  eraseText left a "3" after the cursor: box read 9876543213), ulookd (Main muscle row under the top bar). Fix (test
  only): scroll before each check; f203 taps + erases twice. Gate R-375: the tag commit needs green partials of parts
  uatc,u199,u203,ulook,u438 on it (default and owner). Round 2 whole runs stay on 719fd05c (diff = qa + docs only).
- ROUND 2 on 719fd05c: emulator + uat 43841923587 GREEN, owner + uat 43841927489 GREEN (J3 passed: owner J3 on 0.79.0
  now 3 passes, 2 drops at the bottom, 1 test grab fault), journeys 43841931157 GREEN, conditions 43841935528 GREEN,
  Wear OS 43841939870 GREEN, CI 43833567273 GREEN. Font 2.0 uat 43842027998 still running (expected to hit the same 5).
- Fix 1 = 412d70ef (tag qa-rel-079g), CI 43861724090 GREEN. Partials there: owner font 2.0 43861761013 RED, 3 more test
  faults further on (uat10: "^Cancel$" matched the sheet backdrop, a full-screen button, and the tap at its middle
  landed inside the taller sheet; uatf199: the Next line below the edge after "Kg lifted"; uatf203: two cards push
  "Up next" below the edge after the 2nd join). uatr438a and ulookd now PASS at font 2.0. Owner plain 43861757297 RED
  at uat5 "Chart shows" (tap on "Heaviest weight" opened a workout instead; unchanged flow, passed in both whole owner
  runs: a one-off). Default 43861753274 running. Fix 2 (test only) follows; partials rerun on it.
- Fix 2 = 012801b8 (tag qa-rel-079h), CI 43879435649 GREEN (tag CI 43879470390 red once on a dashboard web test,
  R-593 today-handled, timing; GREEN on rerun). Partials: default 43879470303 GREEN; owner 43879476184 and owner font
  2.0 43879480647 running. Font 2.0 uat on 719fd05c 43842027998 RED: uat4 (tick not found; passed in 43861761013, so
  flaky), f199/r438a/f203 (fixed), r576b (the "i" icons above/below the edge at a big font: test fault), r576c
  (started inside r576b's unfinished workout). Fix 3 (test only): r576b scrolls to each "i" first. Partials on fix 3
  with u576 added: parts uatc,u199,u203,ulook,u438,u576, default + owner + owner font 2.0.

## R-601 (16 Nov 2026) Read log alert + 30-day key reminder (R-595; his pick "alert plus 30-day reminder")
- DEPLOYED 16 Nov ~03:55 IST: HQ version 3129d34b from 5be30bfd after a fresh review (NO BLOCKERS). Live: /readlog/status
  = {"on":false} (key not saved yet). Optional non-blockers left: clear the failure time on "off" (readLogAlert.js:62);
  a failed KV read restarts the hour (:54,:63); #needs link + double red line on Needs you (logic.js:747-767).
- Built (helper; NOT DEPLOYED, no DB change, no migration): deploy/hq/readLogAlert.js. After each 10-minute pull
  (worker.js everyMinute) ONE KV entry (BACKUP, key readlog/health) notes since when pulls fail and why; written only on a
  change (first failure, new reason, first good pull), so a normal day writes nothing. Reasons: key (401/403), unreachable,
  logs, server, setup, error. Key end date = var SUPABASE_LOGS_TOKEN_EXPIRES "2027-11-14" in wrangler.jsonc.
- HQ (/api/needs gets readLog; app.js banner on top of every page + Needs you line, counted, rings once):
  red "Read log is not working since <time>: <reason>. Supabase keeps its logs only about a day, so direct looks at gym
  data are not being recorded. Fix it today." after 1 hour without a good pull; yellow from 15 Oct 2027 "The logs key ends
  on 14 Nov 2027. In Supabase, make a new "Logs read" token for the MettleUp project and paste it into Add a key as
  SUPABASE_LOGS_TOKEN. Then tell Claude its end date."; grey, not counted: "Read log is off: no logs key saved."
- Email = the existing path (scripts/watch/outage.mjs, every 10 min, GitHub issue @aucksy): new public GET
  /readlog/status ({on, failing, failingSince, why, keyEnds, renewNow}; no key, no text, no member data). Failing an hour ->
  outage issue "Outage: Read log not working" (one email); same trouble -> silent; works again -> one "Everything answers
  again" comment + closed. Reminder: one "key-reminder" issue "Reminder: the Supabase logs key ends on 14 Nov 2027" per end
  date, never re-opened; closes itself when a later end date is deployed. No 24-hour repeat email (optional; left out).
- Tests: deploy/hq/readLogAlert.test.mjs (7, pass locally): 59 min = no alert, 61 min = one issue, still failing = no
  more, recovery = one email, a good pull restarts the hour, reminder from 15 Oct 2027 00:01 IST (not 14 Oct 23:59),
  once per date, off = grey line + no email + no write, the public route, the every-minute hook. hq.test /api/needs shapes
  updated. CI: see the report.
- With a new key later: he pastes it into Add a key; Claude writes its end date into SUPABASE_LOGS_TOKEN_EXPIRES and
  deploys HQ.
- NEXT (main session): a fresh review of this diff, then an HQ deploy (worker + page). Until deployed, nothing changes live.

## R-600 (16 Nov 2026) Pre-deploy fixes for tonight's admin panel deploy (fresh-eyes review of d2928aaa..b65e6362, then of a645d692)
- DEPLOYED 16 Nov ~02:45 IST from 0a0f87d2 (CI 43759121911 green; fresh review blockers fixed): panel version
  97ec6ea3, HQ version c967e487. Live check: /api/switches gymPages false; live bundle has "See who", "Kaun hain, dekho",
  "Today now shows only what still needs you"; no "In the newest MettleUp app" line. HQ read log is off until
  SUPABASE_LOGS_TOKEN is saved. NEXT: move pending-message-recipient live after 0.79.0 is in production.
- Brief (coordinator; owner approved the deploy, "no screen says something the code does not do"): 5 fixes, no deploy, no DB change, no version bump.
- What's new: ADMIN_NEWS '2026-11-16' = R-593's three Today lines (moved out of pending). R-586's two recipient lines ("Gym owner" / a trainer by name / "Gym admin"; "To: Gym owner") wait in a NEW 'pending-message-recipient': the picker is member app 0.79.0, open testing only, so no message has a "To:" line yet. Move it to ADMIN_NEWS with the first panel deploy after 0.79.0 is in production. Words from shop/gymMessages.ts TO_WORDS + memberMessages.ts. gym-web-pages + plus-lock stay pending.
- Help (deploy/panel/helpArticles.js, both 120 words, the limit): owner article "If a member's app asks "Who should read it?" ... Each such message says who it went to ... With no "To:" line, the older rule applies" (+ "Member questions" line back). Member article: the same "If asked", and "If not asked, the owner and front desk read feedback; only the owner reads a complaint."
- Trainer note (memberMessages.ts, 147 of 160 letters): also says questions sent only to the owner or another trainer are hidden. NEW Hinglish line (hinglish.ts) for his read-aloud.
- AI idea "joined N days ago, no visit yet" (assistant/suggestions.ts): N from member.joinedOn (a rejoin showed the new plan's start). Counting rule unchanged. Test: awayIdea.test.ts rejoin case (621 days).
- CI lessons: member-message words max 160 letters (memberMessages.test.ts); help articles max 120 words each (helpArticles.test.mjs). Count both before pushing.

## R-598 (16 Nov 2026) Import card: "Everything stays on this phone." only for members not signed in
- Brief: the Workout tab's "Coming from Hevy or Strong?" card told signed-in members (workouts copied to their account) "Everything stays on this phone."; keep the words, show them only where true.
- Done: tracker/services/switcher.ts switcherLine (pure) + SwitcherCard reads useAccount (account != null, the copy's own check; hidden until read). Signed in: "Bring your workouts, records and routines with you." only.
- Test test/tracker/switcherLine.test.ts (both cases); no Maestro flow asserted the sentence.

## R-597 (16 Nov 2026) 0.79.0 release prep: waiting list cleaned, What's new written (no version bump, no tag)
- Coordinator's brief (his "release" 15 Nov 2026 ~22:20 IST, R-592; 16 Nov "Take best decisions yourself to release
  whatever is pending", R-594b). Version, tag and Play upload stay with the coordinator.
- PROGRESS.md cleaned: 79 entries moved from "Waiting for release" to "## Done" (block "0.73.0 to 0.78.0 RELEASED",
  verbatim, indented). Test: every R-/F-/T-number in each line was looked up in git log; all their commits are
  ancestors of v0.78.0 and none come after (`git merge-base --is-ancestor`, same as the tag's history). Lines with no
  number (UK5, light mode, watch logging, launch polish, owner dashboard, 0.7x release lines) are from 3-12 Nov, before
  v0.78.0 (UK5's c3a85ede checked: inside it). Panel/server parts of the moved lines: in the live panel d2928aaa (R-589); every migration they name is live
  (0050-0081 and 0086 as named; checked against the "applied live" commits, file headers can be stale).
- Kept on the list: R-596, R-580, R-572, R-576, the open-testing release rule, OPS + WEBSITES (its 0052 "NOT applied"
  line fixed: live since 4 Nov). Added (they had no line): R-586, R-590, R-583, R-575, R-577, R-587, R-581, F217/F218
  phone part, R-561 item 6 phone part. New "Panel and server only" block: the next panel + HQ deploy (R-586 words,
  R-593 Today, 'pending-today-handled'), R-595 (0097 + token), and what is switched off (GYM_PAGES, PAGE_AI/0094,
  JOIN_PAY, Plus, 0091, 0092).
- FINAL 0.79.0 LIST.
  - Phone: R-586 "Who should read it?" (0096 live); R-576 "Today's target" always beats previous, the "i" says why;
    R-572 New / Edit exercise as one card of rows; R-590 gym messages and "Rest is over" ring on phones that strip
    the sound (NOT proven on his OPPO); R-583 a tapped notification opens its page; R-587 welcome screens + phone-first
    sign-in (0093 live, G5 number not kept); R-580 10-digit mobile boxes; R-581 no dots on a first install; R-596 + R-575
    watch update pop-up (phone side); F217/F218, R-561 item 6 (hidden until 0091/0092).
  - Watch: R-577 largest text keeps the big numbers; R-575 the watch app advertises itself again.
  - Panel/server only (deploy, not the release): the block in PROGRESS.md.
- WHAT'S NEW 0.79.0 (apps/mobile/src/lib/whatsNew.ts, top entry, date '16 Nov'; member-words rules; no Gemini, he did not
  ask; no Hinglish lines in this file; no fresh-reader helper: 6 helpers were already running). Play text = the same
  6 lines, "• " each, 493 of 500 characters (play_upload.release_notes; the update screen's whats-new.json takes the
  first 3):
  1. "Message your gym" on the Gym tab now lets you pick who reads it, like the owner or a trainer. [Open the Gym tab, dot]
  2. In a workout, "Today's target" now always beats your previous workout. If it can't, tap "i" to see why.
  3. On some phones, gym messages and "Rest is over" made no sound. Now they do.
  4. Tapping a notification now opens its page, like your gym's reply.
  5. "New exercise" is simpler: tap a row, like "Main muscle", to change it.
  6. Your watch keeps its big numbers full size at the largest text size. (also under "New on your watch")
  Left out: welcome/phone sign-in (only new installs see it), 10-digit boxes, watch pop-up checks, first-install dots.
  If R-590 is not proven before production, line 3 can be dropped (one line, nothing else changes).
- RELEASE STEPS LEFT (coordinator): (1) all helpers green, fresh-eyes review of d2928aaa..HEAD panel/HQ diff, panel +
  HQ deploy with 'pending-today-handled' moved into ADMIN_NEWS, live checks; (2) release commit: apps/mobile/app.json
  "version" 0.78.0 -> 0.79.0 ONLY (the What's new entry is in; whatsNew.test "app.json and the log agree" then reads
  0.79.0's lines); if the tag lands on 17 Nov IST or later, also change the entry's date '16 Nov' to that day;
  (3) full UAT round, all types, on that commit; (4) quote his "release" (15 Nov 2026 ~22:20 IST) in chat, tag v0.79.0;
  (5) release-apk run, then play-upload phone + watch to open testing (wear:beta and the watch closed track follow;
  re-run play-upload if Google's review blocks the watch tracks); production by hand about 3 days later; (6) after the
  release, move the "### 0.79.0" lines in PROGRESS.md to "## Done" and prove R-590 on his OPPO.

## R-596 (16 Nov 2026) Watch update pop-up waits for a watch that is out of reach (review G4)
- His words (16 Nov 2026): "I do want the watch app new update pop issue fixed". Goes into 0.79.0.
- The bug (G4, R-594 round 4): the R-438/R-575 pop-up "Your watch app has an update" also showed for a watch
  that is paired but out of reach (screen diary under 7 days old, connected=false, R-575's rule table). Its one
  button could then only answer "Your watch is not connected": a dead end.
- The fix (R-575's signals, diary rule and capability fix all kept; native code unchanged):
  - watchUpdate.ts: 'update-ready' and 'up-to-date' now count CONNECTED watches only. New state 'away': the only
    older (or unreadable) watch with the app is not connected. watchesNeedingUpdate leaves out-of-reach watches out,
    so "Update on watch" aims only at a watch it can reach. A connected current watch beside an away old one = away.
  - watchUpdateCard.ts: cardDecision 'away' = no pop-up, reason "waits: watch not connected" (watch log head and
    console). retryAfter (pure, moved here from the screen): unknown/none keep 20 s + 2 min; away = 20 s, then every
    2 min up to 15 reads (about 30 min). QA stand-in mettleup://qa-update?watch=away (old watch, not connected).
  - WatchUpdatePrompt.tsx: uses retryAfter; an away retry that fires with the app in the background does not read;
    coming back to the front after an away read reads again at once (not after 6 hours). Two reads at once keep
    one retry chain. When the watch is connected again the next read is 'update-ready' and the pop-up shows once.
  - Unchanged: "Later" = 24 hours, "Update on watch" tapped = never again for this phone version (both checked
    only once the watch is back), never when the watch app is current, never in a workout, phone update first.
- Tests: watchUpdate.test.ts and watchUpdateCard.test.ts open with an R-596 block, the reported case first
  (old + fresh diary + not connected -> away, nothing to update; the same watch connected -> update-ready; connected
  current -> up-to-date; no watch -> none; two watches; Later and tapped still hold; the retry timings; the QA
  stand-in). R-575's "out of reach still counts" test now expects 'away'. Phone flow uat-rel-r438-a step 1b:
  watch=away shows no pop-up and no "Your watch is not connected" (picture rel-r438-01b-away-no-popup); step 2
  (watch=old) is the same watch back: the pop-up shows. Part u438.
- Runs on 9c7e3b85: CI 43749988125 green (mobile typecheck + unit tests incl. IST and New York, admin journeys). Phone part u438: default 43750012443 green; owner 43750014887 green on attempt 2 (attempt 1 never started: Google's emulator download failed). Log proof (default): "away, waits: watch not connected" then "update-ready, shown"; pictures rel-r438-01b (Workout tab, no pop-up) and rel-r438-02 (the pop-up) read and right.
- Only his phone + a real watch can prove: walk away with the watch (or Bluetooth off) -> no pop-up; come back,
  open the app -> the pop-up shows; "Add my watch's screen log" head says "waits: watch not connected" while away.

## R-595 (16 Nov 2026) Direct-read record: every owner-login read of gym data written down (he said "yes read log")
- Why: Claude read Crispy Curves (test gym) member rows from the Supabase SQL editor on 15 Nov; nothing recorded it,
  while the data agreement says "every look is recorded". A SELECT cannot fire a trigger.
- Design (research: Supabase pgaudit docs; KB "Identifying Dashboard SQL Editor Activity by User" = the SQL editor,
  table editor, psql and MCP all run as role postgres; logs SQL is ClickHouse now; Management API
  GET /v1/projects/{ref}/analytics/endpoints/logs, max 24 h a query, scoped token permission "analytics logs read";
  free plan keeps logs about 1 day):
  1. 0097: pgaudit on; ALTER ROLE postgres SET pgaudit.log = 'read, write, misc_set', log_catalog off, log_relation on
     (also tried on supabase_read_only_user / dashboard_user; a notice if Supabase refuses). App roles untouched.
  2. HQ Worker deploy/hq/readLog.js, every 10 min inside the every-minute cron (no free cron slot left: 5 of 5 used):
     cursor -> logs API -> one item per statement -> hq_db_reads_ingest. Worker is service_role = not audited, no loop.
  3. public.db_direct_reads (append-only, ~1 KB/look, caps 2,000/day and 20,000 total, kept 2 years) + state row.
     Writes 'gap' (log expired before a pull), 'audit_off'/'audit_on' (switch changed on postgres). owner_hq_access gets
     "direct" (looks naming the gym or naming no gym; tables only, never query text) + "directSince". hq_db_reads = HQ.
- On main: migration + test supabase/tests/0097_direct_read_log.sql, readLog.js + test, worker.js hook, wrangler note.
- 16 Nov ~01:50 IST: he said "yes 0097" and "yes logs key". 0097 APPLIED LIVE (SQL editor; checked: pgaudit on, postgres has
  pgaudit.log=read, write, misc_set / log_catalog=off / log_relation=on, db_direct_reads + hq_db_reads_ingest exist).
  Scoped token "mettleup-hq-read-log" made (aucksy's Project only, Logs = Read only, expires 14 Nov 2027; Supabase caps
  at 1 year from now). Value never read by Claude; he pastes it into Add a key as SUPABASE_LOGS_TOKEN (keys.json line added).
- 16 Nov: he picked option 1 for the key: HQ shows a red warning + emails him when the read log has failed for 1 hour,
  and emails him 30 days before the token ends (14 Nov 2027). To build after the 5-hour usage reset, before the 18 Nov freeze.
- 16 Nov: he said "Hindi ok" for R-593's 5 Today lines and R-600's trainers' note (Hinglish read-aloud done).
- Was: WAITING FOR HIS YES: (a) "yes 0097" (live apply); (b) a scoped Supabase token (only this project, only analytics
  logs read, 1 year) as HQ Worker secret SUPABASE_LOGS_TOKEN; then HQ Worker deploy by the main session.
- After both: read one Crispy Curves row in the SQL editor, wait 10 min, check hq_db_reads shows it (proof step).
- Not built yet: the admin app's list (data is in owner_hq_access.direct; wording needs his yes), HQ page for
  hq_db_reads, data-agreement line (draft in the report). Gap left: a curl with the service_role key is not logged.

## R-594b (16 Nov 2026, night) Coordinator: tonight's release plan, his words, the audit freeze
- His words: "release" (15 Nov 2026 ~22:20 IST) and, going to sleep 16 Nov 2026: "Take best decisions yourself to
  release whatever is pending" + "I do want the watch app new update pop issue fixed" (G4, helper on it).
  Also "yes panel deploy" (15 Nov). Quote these again before the v0.79.0 tag.
- Order: all helpers green (R-587 welcome incl. G5 number-not-kept fix + part A flow; R-593 Today incl. the
  'Not seen for 10+ days' fix: a member who joined today counted, names + See who; R-590 OPPO rest sound; picker
  phone tests; G4 watch pop-up; release notes helper cleans PROGRESS.md waiting list + writes 0.79.0 What's new)
  -> fresh-eyes review of d2928aaa..HEAD panel/HQ diff -> panel + HQ deploy, live checks -> version 0.79.0 ->
  full UAT round, all types -> tag -> release -> play-upload (phone + watch, open testing; production ~3 days later).
  A part that cannot go green safely is left out and reported.
- Read log (owner said "yes read log"): helper builds; live apply needs his named yes (ask "yes 00NN").
- AUDIT: plan D:\Brain\Dev-Framework6-11-16-full-system-audit-plan.md, "audit plan ok - starts Nov 18 at 4:30pm
  with Opus 5.5 Medium", "fast lane ok": from then no changes except fast-lane bugs; new asks -> OWNER-INBOX backlog
  tagged after-audit. Scheduled task mettleup-full-audit-start fires 18 Nov 16:35 IST.
- Data rule (15 Nov): never read a real gym's member rows directly; Crispy Curves (test gym) has his standing yes.

## R-594 (15 Nov 2026, night) Release 0.79.0 fresh-eyes review: actions; MORNING LIST for him
- Review: docs/reviews/2026-11-15-release-0.79.0-fresh-eyes.md (up to 65b35c1e). Blockers: (1) phone QA out of date
  with 0096 live + picker never run on a phone -> helper on it (adds to R-586); (2) panel deploy must go live before or
  with the phone release (planned, R-592); (3) no phone What's new for 0.79.0 -> written at the release step, and the
  waiting list cleaned (drop 0.78.0 items, fix the message line).
- Welcome bugs + small improvements (labels above boxes, "set up as New to lifting / Build muscle" line, "Bring back
  your workouts" on the phone path, watch screen wait) sent to the R-587 helper.
- Admin e2e J149 expected "Version 14 Nov 2026": updated to 15 Nov (my What's new entry).
- MORNING LIST (his design calls, parked): (a) the gym welcome screen asks "Does your gym use MettleUp?": add Yes / No
  buttons so members with no MettleUp gym skip the WhatsApp check (he asked for phone-only, so his call); (b) remove the
  extra screen between "Get started" and the phone form.

## R-593 (15 Nov 2026) Today keeps only what still needs him; the AI Assistant card fits every phone
- His words (admin panel, Today): "this today section is basically showing the new messages that came and what we
  replied. But I marked those conversations as done. I did it myself as the admin user. So why should I be looking at
  this history? ... Anything that user has already completed manually themselves doesn't have to be sitting here in the
  today section unnecessarily." Same screenshot: on his phone in Hinglish the AI Assistant card was wider than the
  screen (ask box and idea buttons cut off on the right) and "10+ din se nahi aaye: 1" was squeezed into a one-word column.
- No database change. owner_alerts (0075) carries no ref id, but each alert is written in the same transaction as its
  thing, so both carry the same now(): Today matches an alert to its thing by kind + time (within 2 s).
  Pure rules: apps/dashboard/src/crm/logic/alertHandled.ts; what this browser knows: crm/shop/alertFacts.ts.
- "Handled" per alert kind (one unit test each, test/crm/alertHandled.test.ts):
  | Alert | Leaves Today when |
  |---|---|
  | member_question / member_feedback / member_complaint | the conversation is marked done, or the gym replied after the member's line, or nothing waits (owner_talk_count 0 read after the alert came), or it is gone from a Member messages list read after it came. A new member line brings it back. |
  | trainer_question | answered (not open), or 0 open, or gone from a Member questions list read after it came |
  | plan_request, phone_link | no longer pending, or gone from a list read after it came |
  | shop_order | the order is ready, collected or cancelled (same rule as before) |
  | friend_referred (to Enquiries), online_join, page_question | the enquiry is joined or lost, or has a follow-up date after today, or (web page question) the chat was marked done; an enquiry not found 10 min after the alert came counts as handled |
  | paid_online, report_sent, member_joined, ai_credits_low, ai_members_limit, friend_referred (to a member) | news: shown in one visit to Today, gone on the next visit (my call: news needs no action, and showing it once is the least noise; the bell keeps it) |
- Member messages: reading owner_talk_list tells members "Seen by your gym", so Today never reads it in the background.
  It uses the waiting count plus what Member messages last read, replied or marked done (kept in this browser, by a
  fingerprint of the sign-in key, 4 days). Clock skew: times are compared to when THIS browser first got the alert.
- The bell keeps the full history: handled lines say "Done" ("Ho gaya" in Hinglish) and leave the bell's number. The
  card hides when nothing is left. Needs you already counted only live waiting lists (nothing done counted there).
- AI card: the grid's min-width:auto plus a no-wrap button widened the card past the screen. Now one shared IdeaRow
  (crm/assistant/ui/parts.tsx): the words get at least 12rem or the whole row, the button wraps under them and its words
  wrap; the ask box wraps. Same rows on the AI Assistant page ("Today for you").
- Tests: e2e/support.mjs expectNothingPastScreen (every element: nothing past the right edge, no 2+ word text squeezed
  under 80 px); e2e/today-handled-uat.spec.mjs (messages arrive, reply / mark done, gone from Today and the bell number,
  bell history says Done, reload, a new line brings it back, Hinglish dark/light); e2e/today-fit-uat.spec.mjs (Eid
  "kal hone ki ummeed hai (din chaand se tay hota hai)" and Ganesh Chaturthi ideas, 320/360/390/412, English/Hinglish,
  dark/light, Today + AI Assistant page). alerts-uat: a ready shop order now leaves Today and shows Done in the bell.
- What's new: ADMIN_NEWS_PENDING 'pending-today-handled' (moves to ADMIN_NEWS at the next panel deploy).
- 16 Nov, coordinator (owner-approved, live bug at Crispy Curves): the idea "Not seen for 10+ days: 1" counted a member who
  JOINED TODAY (annual plan from 15 Nov, no visit). answer.ts list_members 'away' (days > 0) kept every daysSinceVisit
  null. Now awayDays(): since the last visit; never came: since the later of the plan run's start (new
  logic/membership.ts coverageStartsOn, back-to-back terms) and joinedOn. One rule for the idea and the assistant's answer.
  Tests: test/crm/assistant/awayIdea.test.ts (joined today -> no; joined 12 days ago -> yes; last visit 11 days -> yes;
  9 -> no; a renewal from today after a gap -> no).
- Owner asks ("both are good"): the idea row names its members (1-3: "Asha: no visit in 12 days" / "Asha: joined 12
  days ago, no visit yet"; more: "Asha, Ravi and 4 more"; same first names get full names) and has "See who", which
  shows the same list on the assistant by our own code (list_members card, no AI call, free, offline). Birthdays,
  plans ending, not seen and plans ended have it; festival, fees and the week do not.
  Hinglish for his read-aloud check: "{name}: {days} din se nahi aaye", "{name}: {days} din pehle jude, ab tak nahi
  aaye", "{names} aur baaki {n}", "Kaun hain, dekho", "Abhi is list mein koi nahi hai."
- Squeeze check found two real things and two false alarms: Today's "Sab dekho" broke onto 2 lines at 320 px (now
  nowrap); tall tap targets were read as wrapped text (the check now counts real line boxes).

## R-590 (15 Nov 2026) Gym messages silent on his OPPO: the phone strips every channel; the app now rings it itself
- The bug (R-583): a gym reply lands in the notification list on his OPPO CPH2873 (ColorOS, Android 17, 0.78.0 from Play)
  with no sound and no pop-up.
- **ROOT CAUSE, proven on his phone (adb, read-only):** ColorOS's own notification app (NotificationCenter,
  com.oplus.notificationmanager, /system_ext/app/NotificationCenter) ships a default rule for every app NOT on OPPO's
  package list: banner off, sound off, vibration off (its config: default state="-1" banner="-1" sound="-1"
  vibrate="-1"; the copy inside that app lists WhatsApp, Truecaller, Facebook, Instagram, Telegram... and OPPO's own;
  the live list comes from OPPO's cloud, romupdate sys_notificationmanager_config_list_exp, not readable over adb).
  It rewrites a channel right after the app makes it: our "Messages from your gym" was made HIGH (mOriginalImp=4) and
  now reads mImportance=3, mSound=null, mShowBanner=false. Evidence it is the phone, not us:
  - EVERY MettleUp channel is rewritten the same way, and so is nearly every other app on his phone: Swiggy, Zomato,
    LinkedIn, Play Console, his own Spends app (about 100 apps). Only listed apps (WhatsApp, Truecaller, Facebook)
    and Google's own apps keep importance 4 + sound + banner.
  - It happens at channel creation, not once at install: gym-messages-quiet was made by 0.78.0 (R-501, installed
    15 Nov), three weeks after the first install (25 Oct), and was rewritten too. So a new channel id does NOT help.
  - Ruled out: our code never lowers a channel (every setNotificationChannelAsync/createNotificationChannel asks HIGH
    or DEFAULT on purpose); expo-notifications 56 leaves the channel's default sound when no "sound" key is given
    (AndroidXNotificationsChannelManager: setSound only with a sound key), so mSound=null was the phone; Swiggy and
    Paytm were installed the same day from Play and only Paytm kept its sound (a package list, not install time).
  - An OPPO community thread (ColorOS 17, Find X10) reports the same: new apps get banner/sound/vibration off, a new
    channel goes HIGH -> DEFAULT ~60 ms after it is made, messaging apps get other defaults. No OPPO statement.
- R-583's "importance 5 (highest)" was a misread: the feedback log printed expo's AndroidImportance (5 = DEFAULT =
  Android 3), not Android's. The device line now prints Android's number (gymPopup.androidImportance) and says
  "no channel sound" when the phone took it; the old "below 4" test compared expo's number and never fired.
- **What an app can and cannot do:** no app can raise its own channel back, turn the banner on, or join OPPO's list
  from code. The SOUND it can give: the app plays the phone's own notification sound once, right after a gym message
  is posted. The POP-UP (banner) on his OPPO stays off for MettleUp, like for Swiggy or LinkedIn, until OPPO lists
  the app; no setting line on screen (owner rule never-blame-his-device-settings).
- **Built (on main, ships with the next phone release):**
  - Native AlertRing.kt (forge-rest) + ForgeRest.ringIfMuted(channelId): rings only when the channel is still an
    alerting one (importance >= DEFAULT), has no sound, the member did not set its sound (hasUserSetSound, Android
    11+), the app's notifications are on, Do Not Disturb is off and the phone is on ring (not vibrate or silent);
    never twice within 4 s. A phone that kept the sound (Pixel, Samsung, the emulator) answers "channel-rings" and
    never rings twice. Sound only: no buzz (we cannot tell whether the member turned the buzz off).
  - src/shop/gymAlertRing.ts + noticeAlertsRun.ringShownGymMessage, called at every place a gym message is shown
    with a sound: the push with the app closed or in the background (onPushArrived; incl. member notes such as his
    case, the gym's reply to feedback, push gym_reply, and the MettleUp team's reply: pushPlan.pushOnGymChannel), the app's own post with the app
    in front (postPushInFront), the 15-minute check (showPopups), missed trainer replies (popReplies), the MettleUp
    team's reply (helpReplyAlert). Never for the quiet copy over a workout (R-501).
  - Tests: modules/forge-rest/.../AlertRingTest.kt (his OPPO's facts ring; sound kept, member's choice, silent,
    vibrate, DND, twice, no channel stay quiet), test/shop/r590GymRing.test.ts (every path rings once, the quiet
    copy never), test/shop/r501GymPopup.test.ts (expo numbers read as Android's). docs/ios/PARITY.yaml covers it.
- NOT proven yet: the ring itself on his OPPO (needs the release build on his phone; the cloud emulator keeps channel
  sounds, so it only proves "no double ring"). Check after release: a gym reply with the app closed should ring;
  the feedback device line should read "no channel sound, app ring rang".
- **"Rest is over" (same cause, fixed the same way, 15 Nov 2026):** on his OPPO rest-over-sound reads importance 3
  (made 4), no sound, AND the sound lock on (ColorOS sets it when it strips), so with the screen locked or MettleUp
  in the background the rest end was silent. Built (on main, ships with the next phone release):
  - RestCard.postOver -> ringIfStripped: right after "Rest is over" is posted, the app plays the MEMBER'S OWN rest
    sound (Settings, "Rest sound": chime, bell, beep or whistle) once itself: the same raw file the channel and the
    open app play (one name rule, AlertRing.restSoundFile; lesson an-alert-has-two-sound-paths). Native, so it works
    with the app closed (the rest alarm posts it).
  - Never with "Workout sounds" off (the vibrate-only channel), never with MettleUp on screen (its own bell rings
    there, RestCard.restBell "app"), never on a phone that kept the channel sound (Pixel, Samsung, the emulator:
    "channel-rings"), never twice within 4 s per channel. Held by silent, vibrate and Do Not Disturb; through Do Not
    Disturb only when the member chose "Ring through Do Not Disturb" (then as an alarm sound).
  - A sound lock counts as the member's choice only while the channel keeps the importance the app made it with
    (a member's own "None" leaves it at 4; ColorOS's strip drops it to 3). The gym path is unchanged.
  - Logged: ForgeRest "Rest is over app ring: <answer>" (rang, channel-rings, not-here, do-not-disturb, ringer-1...).
  - Tests: AlertRingTest (his OPPO's rest facts ring; Pixel kept sound, member's "None", sounds off, app on screen,
    silent, vibrate, DND with and without ring-through, twice, each of the four sound files). Device QA parts A,
    DND and LONGREST now fail if the app rings on the emulator (a second sound) and part A needs "channel-rings".
  - NOT proven: the ring on his OPPO (release build on his phone: lock the phone mid-rest, the rest sound should
    play at the end). Also not restored: the BUZZ (ColorOS took the vibration too; the watch still buzzes).

## R-591 (15 Nov 2026) 0095 and 0096 APPLIED LIVE; every live test PASS
- His words (15 Nov 2026, R-592): "yes 0095", "yes 0096". Nothing else applied; no data edited.
- Applied from the Supabase SQL tab (management API, his personal account), byte for byte as on main f6ce4c38 (each
  file fetched at that commit; SHA-256 matched the repo copy; 0095 last changed in 71522d95, 0096 in 52091559).
  Checked first (read-only): all 60 columns and 32 functions they use were live, none of their new columns, functions
  or checks existed. 0095 first: Success. Then 0096: Success.
- Live tests: 0095 RESULT PASS (35 checks, run before and after 0096), 0096 PASS (52), and what 0096 replaces:
  0087 PASS (30), 0075 PASS (28), 0069 PASS (56). Nothing left behind: no T95/T96 gym (95 gyms before and after),
  no test_alert rows, no test browsers, 128 unsent alerts before and after, no message with a recipient yet.
- "Send a test alert" should now show on the live panel (d2928aaa has the card; not yet checked on screen). R-586's panel words
  ("To: ...", desk lines) still need a panel deploy (coordinator); the member picker ships with the phone release.

## R-592 (15 Nov 2026, 22:22 IST) RELEASE APPROVED (phone + watch 0.79.0); "yes 0095", "yes 0096"
- His message, verbatim (15 Nov 2026, about 22:20 IST): "yes 0095 / yes 0096 / release". One "release" = one version.
- 0095 and 0096: a helper applies them live with their live tests (R-591). The live panel (d2928aaa) already shows
  "Send a test alert" once 0095 is live. R-586's panel words ("To: ...", desk lines) need ANOTHER panel deploy: ask him.
- Release plan (coordinator's call): the release waits for the two fixes in flight, then UAT of all types, then the tag:
  R-587 welcome screens + phone-first sign-in (incl. his screen-3 change, canvas v7) and R-590 silent gym alerts on his
  OPPO. Also in it: R-575 watch "update" prompt, R-576 target box, R-577 watch sizes, R-578 test alert, R-579/R-580,
  R-583 tap fix, R-586 message picker. Open testing first, production about 3 days later.
- "yes panel deploy" (15 Nov 2026, after 0095/0096 went live, R-591). Plan: ONE panel deploy carrying R-586 panel words,
  the What's new 15 Nov entry (now incl. the test alert line, 1f231dce) and the R-593 Today fixes once that helper is
  green; then CI green on the deploy commit + fresh-eyes review of d2928aaa..<sha> + live checks.
- Watch 0.78.0 (dim fix) had reached only wear:internal (R-560: closed/open refused while a review ran; nobody re-ran
  it). Re-run play-upload 43740436255 (v0.78.0, dry_run off, 15 Nov night): wear:internal + "Watch closed testing" +
  wear:beta now all 0.78.0 [1000078000]. His watch can update to it now.
- He asked (same time): is the "watch screen not dimming" fix in? Answer: the fix (R-557) shipped in 0.78.0 (R-560); his
  watch was on an old watch app. 0.79.0 adds the prompt that tells him the watch app has an update (R-575).

## R-589 (15 Nov 2026, night) Admin panel + HQ DEPLOYED LIVE from d2928aaa; phone on USB; welcome screen 3 words first
- His "yes panel deploy" (15 Nov 2026). Panel Worker version 330e476a-2ef6-41f6-bcf0-8d546c931e09, HQ Worker version
  e90a9f77-dbaa-4ee4-8ba5-00ac6c78832e (deploy/hq changed in the range: R-580 api.js), both from d2928aaa2715ee0ee2c1279ec242ce7d6321c6f1
  (has every R-580/R-578 fix, NOT R-586: 0096 is not live). Dry runs: GYM_PAGES, JOIN_PAY, PAGE_AI off.
- Checked LIVE: /api/switches {"gymPages":false,"joinPay":false,"aiCharge":true,"pageAi":false}; /app on Android -> 302 Google
  Play; /app on iPhone -> "The iPhone app is coming soon"; /get-app 200; privacy pages (English + Hindi) "Last updated: 15 Nov
