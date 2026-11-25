# Claude's notes: the owner's requests, instructions and feedback

Claude's own working log (owner rule, 18 Oct 2026): everything the owner asks Claude to DO, or says
about how to work, is written here first (chat can be compacted), with what was done. It is NOT on
the owner's inbox page; the inbox holds only questions and answers, his decisions, and the feature
backlog. Newest on top. Entries 3-21 were moved here from docs/OWNER-INBOX.md with their old numbers.

Older entries are moved automatically (scripts/trim_notes.py, newest 40 kept here) to docs/CLAUDE-NOTES-ARCHIVE.md: grep it before saying something was never said.

## R-628. "Share app link" sends the Play link + phone-number step; panel deploy tonight - 25 Nov 2026 ~23:00 IST
His words: "we can now give the link of Google Play directly, or we can include iOS link when we have it ... because now
we have a WhatsApp verification, it will automatically be connected with the gym. So do make this change." Then, asked
A (deploy tonight) or B (after the audit): "I'm not available, so you take the best decisions here." -> Claude chose A.
Built 556183eb + 89031a65 (/app smart link, "Continue with your phone number", code last as fallback; What's new
2026-11-25 incl. the R-586 recipient lines, 0.79.0 is in production). RESUME: CI green on 89031a65 -> download its
dashboard-dist artifact -> clean worktree at that sha + npm i @anthropic-ai/sdk@0.133.0 --no-save -> deploy/panel:
npx wrangler deploy -> live check Share app link text. RELEASE 0.80.0: first whole runs failed only at F198 dots
(the new backup dot took 1 of 3 places; test fixed 7589e39d). Re-run whole 45683192327 (default) + 45683197127 (owner)
on 7589e39d; if both green, tag v0.80.0 on 7589e39d, then Play production + send the Data safety change.

## R-627. F237 phone number sign-in also backs up workouts - 25 Nov 2026 18:45 IST
His words: "This has to go now, today. And plan it properly and build it and release it today." (= release yes for 0.80.0).
Decisions: recycled number after 90 days unused reopens only if the first name matches; privacy line approved;
Supabase Email provider ON, Phone provider stays OFF (paid SMS, not needed); 3-day test skipped ("its urgent");
delete-race fix + under-18 block included. Server live 25 Nov ~22:20 on "Yes, put it live": migration 0099 +
Edge Function phone-account. Off switch: Edge secret PHONE_ACCOUNT_ON=off. Play Data safety: phone number now also
"Account management" (saved, send for review with 0.80.0). Change card: ~/.claude/change-360/cards/ForgeAI/R-627.json.

## R-625. JOIN_PAY live on his words - 25 Nov 2026
His words: "you can make it live because it's not a complex functionality ... later if the scheduled tests find any issue, then we can fix it". R-555 hold lifted. Set JOIN_PAY = live as a Cloudflare dashboard variable on forgeai-panel (no full panel deploy: other panel code on main waits for after the audit) and in wrangler.jsonc (9aef64af). Live /api/switches: joinPay true. Crispy Curves' join page app.mettleup.fit/m/3A9DE2 now says "Pay online or at the gym desk". PAY_LIVE stays off: only the gym's own UPI ID is offered. Audit note added: the B journeys must run joinpay-uat and selfjoin-uat.

## R-624. "push that to production right now": 0.79.0 sent to production review - 25 Nov 2026
His words (25 Nov 2026 ~11:15 IST): "Whatever we have waiting, let's just push that to production right now ... I need this onboarding journey live in production today." Cause of his failed demo: production was 0.77.0; phone sign-in (F203) is only in 0.79.0 (switch on); server 0093 phone_sign_in_find is live. Done in Play (simpleapps108): production release 79000 (0.79.0), 100%, the same What's new as the test tracks, sent for review (Google says up to 7 days; managed publishing is ON, so after approval it must still be published by hand). Also published the 4 waiting 0.79.0 test-track changes (open + closed, phone + watch). RISK not checked: the sign-in code goes by WhatsApp, blocked by Meta 131042 as of 12 Nov (case 1629464038909679); the UAT used a stand-in. Test one real code before the next demo.

## R-623. Audit: 95% tonight, then Opus only after his next Fable reset - 19 Nov 2026 22:00 IST

- His words, 21:50 IST: "feel free to use it to 95% and then keep going overnight as long as we have the [Fable] limit till 99%". The pacer has a TONIGHT ONLY paragraph until 20 Nov 07:00 IST: start line 91, launch while the total stays at or under 95, helpers save at 97. A new pacer run was started at about 21:50 IST.
- His words, 22:00 IST: "after we consume Fable's limit this time, and we reset it, we will not be using Fable at all for audit ... audit will continue with only and only Opus 5.5 medium". Fable was used only because he had two Fable resets.
- How: the pacer has an "OPUS AFTER HIS NEXT FABLE RESET" paragraph. After 20 Nov 05:00 IST, weekly Fable at 30 or lower (he reset it) means every helper runs on Opus at medium, the Fable 99 line ends, and the all-models line (90, 95 on its last day) is the only weekly stop line. The main chat also changes the pacer's own model line to Opus at the first check after his reset. Opus cost per helper is not yet measured.

## R-622. Audit pacer: no more runs every 15 minutes; one run after each 5-hour reset - 19 Nov 2026 16:00 IST

His words: the pacer was "eating up my limit that is left after 75%". Measured: after the window closed at 11:54 at F5 73, 16 idle pacer runs took F5 to 96 by 15:43 (about 1% each), doing nothing. Now: the pacer task has no repeat schedule. This main chat arms it as a one-time run at each reset + 2 minutes (first: 16:22 IST) and checks it 20 minutes later, then arms the next. The pacer's first step is a limit read; at the stop line it writes nothing and stops. Risk: if the Claude app is closed at a reset, the audit waits until this chat runs again.

## R-621. Apple App Store groundwork (no app code) - 19 Nov 2026
He said: Apple developer account approved; set up whatever saves time (listing, images, release path, GitHub) without starting iPhone app development. Mid-way: Apple lives in the simpleapps108 Chrome window (saved to D:/Brain); name must be "MettleUp - Workout Tracker"; the listing must be optimised for App Store search.
Did: bundle ID com.mettleup.app registered; App Store Connect record 6836681097 made; name, subtitle draft, keywords, category, support/marketing/privacy URLs, copyright saved (all drafts, nothing public). Draft .github/workflows/ios-release.yml (manual start only, green no-op until the ASC_* secrets exist). Full detail and what waits: docs/ios/APP-STORE-SETUP.md. Not done: API key (Apple's API terms are his click), description, privacy answers, age rating, screenshots (all must match a real iPhone build).

## R-620. Audit Fable stop line moved to 99% - 19 Nov 2026 09:40 IST

His words: "Lets stop if fable reaches 99% / I will reset Fable Limit and then continue". The audit had paused at weekly Fable 88-91 under the old 90 line. Now: weekly Fable stops at 99 every day (no new helper when Fable + 2 would pass 99; pause and tell him once at 97+). Weekly all-models keeps 90 (95 on its last day). Changed in the pacer task file and the audit plan (section 8C). The pacer deletes the old "resume at 87" line from AUDIT-STATE.md on its next run. At the pause he resets the Fable limit himself and the pacer resumes within 15 minutes. His fact, same day: a Fable reset also gives back the all-models weekly share that Fable used, so the all-models meter does not cap the Fable resets.

## R-619. Audit weekly stop: 90%, or 95% on the last day; the extra 01:02 run removed - 18 Nov 2026 21:20 IST

His words: "Weekly stop at 90% if more than 1 days are remaining for weekly reset. It can go upto 95% if its last day". And: "What do you
mean by Extra audit start? I hope it wont have 2 separate windows running multiple agents". Done: pacer step 3 and plan section 8C now use
W = 90 while the weekly reset is more than 24 h away, 95 in the last 24 h (higher of Fable and all-models meters). The one-shot
mettleup-audit-resume (R-618) is DISABLED: only one pacer runs (every 15 min, the lock stops overlaps), first after the reset at about 01:07 IST.

## R-618. Audit restarts on its own after each 5-hour reset - 18 Nov 2026 21:15 IST

His words: "ensure that it will actually start at 1 without fail because I will not be available .. it should continue working as per set rules of limits".
Window 2 hit 75% at 20:51 IST (started 20:00); next reset 01:00 IST 19 Nov. Done: (1) pacer cron now every 15 min (7,22,37,52) instead of
hourly, so every new window starts within ~15 min of its reset; quick-exit runs are cheap. (2) one-shot task mettleup-audit-resume at
01:02 IST 19 Nov: a Fable run that follows the pacer SKILL.md itself (unattended runs cannot start or change scheduled tasks, so it does
not call run_scheduled_task). (3) Pacer frontmatter keeps effort: medium (the description update had dropped it; restored).
Checked: PC sleep timeout = never (AC and battery), lid close = do nothing, on mains power. Limits unchanged: day 75-80, night 00-06 up to 96, weekly 95.

## R-617. Audit did not resume at 20:00: the pacer looked in the wrong folder - 18 Nov 2026

He asked why the audit had not resumed at the 20:00 IST reset. Cause: the pacer task said "Work in D:\Apps\ForgeAI"; AUDIT-STATE.md
lives only on origin/main (audit worktree scratchpad wt-audit), so runs at 17:46, 18:46, 19:46 IST quit "Audit not started yet".
Fix: pacer SKILL.md now names the wt-audit worktree (fetch + detach to origin/main first, recreate it if gone) and checks quick exits
only after that. Ran it at 20:03 IST on Fable 5.2: lock written, A2 panel/auth-data merged (3b691fbf 20:09), 6 helpers in progress.

## R-616. F235: compare our build framework with Google's Elephant and Goldfish method, first after the audit - 18 Nov 2026

His words: "add an item to backlog. It is actually the first item we are going to explore after the audit is done and before
the [fixes start] ... We are going to explore the elephant and goldfish framework laid out by Google ... judge our framework, our
future framework for development against it." Found it: github.com/google/elephant-goldfish-model (Apache 2.0). One agent with
full context (elephant) writes a design doc; stateless fresh reviewers (goldfish) review it until one passes it with zero
reservations; then the human approves. Not meant for small fixes. Idea from Dave Rensin's essay "Elephants, Goldfish, and the
New Golden Age of Software Engineering". Done: F235 row (after-audit, first); audit plan section 5 gets a "STEP ZERO" before
change-360 goes on. Not touched: audit state files. Next F is F236.

## R-615. Full system audit: STARTED (scheduled start run) - 18 Nov 2026 16:37 IST

- Plan: D:\Brain\Dev-Framework\2026-11-16-full-system-audit-plan.md. Live state: docs/system-map/AUDIT-STATE.md.
- Analysis only (his words, 18 Nov 2026): no app code, tests, workflows, skills or settings change; proposals only.
- Helpers: Fable 5.2, effort medium, max 6. Model router OFF (checked). change-360 switch OFF (checked).
- Done: A1 (docs/system-map/surfaces.json, 11 surfaces). Running: plan review helper -> docs/system-map/PLAN-REVIEW.md.
- Plan review DONE (docs/system-map/PLAN-REVIEW.md): 22 of 26 applied to the plan file; P2, P23, P24, P25 wait for him (see AUDIT-STATE.md Needs Aakash).
- 18 Nov, he said "Yes, switch on": pacer task ENABLED. He said "take best decisions yourself...": P2, P23, P24, P25 = recommended options, written into the plan.
- A1b, tools, G0 redaction, E1, A2 pilot DONE; 36 A2 area items queued; E2 running.
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

## R-614. Is the Air Squat bug (F227) in 0.79.0? Checked before production - 18 Nov 2026

He asked what 0.79.0 fixed, to decide on production; I warned that F227 may break What's new line 2. He said "Yes, check it first".
Result (ran the real progression.ts of v0.79.0 AND v0.78.0 on his numbers with node, no build): Air Squat logged reps-only,
last time 66 @ RPE 8.5 and 45 @ RPE 10. Both versions give rule B2cap, goals 66, 45 ("Bodyweight · 66, 45"), reason
"You did 66, 45. That's plenty — ready for a harder version, or a little added weight." Cause: an unloaded bodyweight move has a
rep cap, max(bodyweightCap(name) = 20 for squats, range top + 2). Every set at or above the cap -> B2cap: no +1, keep the reps
(Oct 2026 design; test phase2Types "20, 20, 20 against a cap of 15 keeps 20"). R-576's beat-last-time rule never runs on B2cap.
With 3 planned sets it even aims 45, 45, 45 (less than 66 + 45 + a third set would beat, but the box shows the "i" reason).
Control case 12, 10 in 8-12 -> B1, 13, 11 (the +1 works below the cap).
Verdict: NOT new in 0.79.0 and not worse than 0.78.0, so it does not block production. The box's "i" shows the B2cap reason,
so What's new line 2 ("If it can't, tap i to see why") holds. Fix stays after-audit (F227 row updated with this cause).
18 Nov 2026: chat compacts at 20% now; after it, read these notes before saying we never discussed or he never approved something.

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
  2026"; hq.mettleup.fit answers; live bundle has "Screen and language", "Save and show members", "These timings are saved",
  "Share app link"; demo at 375 px: the round display button opens Dark|Light + English|Hinglish inside the screen.
- What's new: R-574 and this deploy shipped without moving the waiting lines. Moved now to ADMIN_NEWS '2026-11-15'
  (mobile digits, panel headings with the phone line corrected for R-584's menu, day-first dates, online journey, logo
  background, share app link, plus a Gym timings "Saved" line). Owners see it with the NEXT panel deploy (the list ships
  inside the page). Still waiting: pending-test-alert (0095), pending-gym-web-pages (switch off), pending-plus-lock.
- His phone is on USB (15 Nov night). adb dumpsys: EVERY MettleUp alert channel is importance 3 (made at 4), no sound, no
  banner, while WhatsApp/Teams/Paytm keep 4 + sound + banner on the same phone. R-583's "importance 5" was expo's enum
  (5 = DEFAULT). A helper owns the fix (R-590); rule: never blame his phone settings.
- His change to welcome screen 3 (15 Nov 2026): words first ("Does your gym use MettleUp?", headline, subtext), then the
  phone row, the arrow and the gym card; "Checked" -> "Verified". Canvas v7; sent to the R-587 helper.

## R-586 (15 Nov 2026) Member picks who reads the message
- His ask (15 Nov 2026, verbatim): "It should be GYM Onwer or the name of the trainers added in Admin Panel..user can
  select any. For feedback / complaint, they can select GYM Owner or GYM Admin (gym admin will send to both owner and
  staff, any type)". He said "yes messages" to build it.
- Built (on main 0f0ba3a8, NOT live): "Message your gym" asks the type, then "Who should read it?".
  Question: "Gym owner" (the owner only) or ONE trainer by name (every person ticked Trainer in the admin panel, not
  the owner; the member's own trainer first, shown "Name (your trainer)"). Only that trainer gets the bell / browser
  push ("Asha sent you a question."); the owner can still read and reply in Member messages, with no alert.
  Feedback and Complaint: "Gym owner" (owner only) or "Gym admin" (owner + front desk; NEVER trainers, front desk =
  signed-in people not ticked Trainer, as 0087). Each message says "To: Gym owner" / "To: Gym admin" / "To: <name>"
  in the member app and the admin panel. Replies show who replied (the trainer's first name, as today).
- Database: supabase/migrations/0096_message_recipient.sql, APPLIED LIVE 15 Nov 2026 (R-591). Three new columns on
  gym_talk_threads (null = no recipient = 0069 + 0087 exactly, so older member apps and older panels keep today's
  behaviour); new member calls member_talk_choices and member_talk_send_to (added to security.sql); _talk_visible,
  _talk_member_row, _talk_gym_row, _alert_visible, _alert_talk_line replaced. Test supabase/tests/0096 (owner key,
  owner who is also a trainer, desk, two trainers; refusals, lists, counts, alerts, replies, untick, grants).
- Member app: only on a server with 0096 (member_talk_choices answers); without it the page is exactly as R-549.
  With 0096 the "The gym" / "A trainer" choice goes: every message goes to the gym's conversations with its
  recipient (old workout questions stay in the list). My call: a question to a trainer is no longer limited to a
  running paid plan (R-505), because the owner asked that members can pick "any" trainer; tell him.
- Admin panel: "To: ..." on each card; the desk gets a Complaints button only when a "Gym admin" complaint is there;
  desk note now "Messages a member sent only to the owner or to a trainer are not shown here. Complaints show here
  only when the member picked "Gym admin"."; staff alerts line (Settings, browser alerts) now ends "and complaints
  sent to "Gym admin"." (it was over the 220-letter limit, so it is shorter) No Hinglish line added (these lines are English-only today).
- Member words added: "Who should read it?", "Gym owner", "Gym admin", "<Name> (your trainer)", "Ask about timings,
  fees, your workout and more.", "Your gym has not added its trainers to the app yet, so only the owner can be
  picked.", the readers lines ("Only the owner of <gym> reads your question/feedback/complaint. The front desk and
  trainers do not see it." / "The owner and front desk at <gym> read your feedback/complaint. Your trainers do not
  see it." / "<Name> reads your question and gets a notification. The owner of <gym> can read it too."), "To: Gym
  owner" / "To: Gym admin" / "To: <name>", "This trainer is no longer listed at your gym. Please pick someone else."
- Tests: apps/mobile test/shop/gymMessages.test.ts + gymTalk.test.ts (who reads what for every type and recipient,
  old apps with none, complaints never to a trainer); apps/dashboard test/crm/memberMessages.test.ts; e2e
  message-recipient-uat.spec.mjs (owner, desk, trainer phones + computer). CI: run 43729776537 (mine failed: 0076 alerts with a non-uuid ref_id; fixed 52091559);
  run 43730546215 database GREEN (0096 PASS 52, 0087/0075/0069 PASS); run 43730819299 on 93f0489e (desk-alerts line
  length fix): database green, the Check job (unit tests + admin e2e incl. message-recipient-uat) STILL RUNNING when
  the session ended. NEXT: read job 132862609715; if green, download "dashboard-uat-pictures" and LOOK at
  phone-r586-1/1b/2/3 and computer-r586-4; fix only R-586 failures.
- APPLIED LIVE 15 Nov 2026, tests PASS: see R-591.
- Needs his yes: (1) applying 0096 live (DONE, R-591); (2) the phone release; (3) the panel deploy. Order: 0096 first is safe
  (older apps send no recipient); the new phone app shows the picker only once 0096 is live.
- PHONE UAT (16 Nov 2026, release review B1; helper): the gym chain (only=ugym, also inside uat) still tested the R-549 page.
  Rewritten (ed888aef): flow 12 = no trainers yet ("Gym owner" only, trainers-not-added line, old choice gone); qa/uat_gym.py
  `trainers` adds made-up "Tara Singh" (Uma's own) + "Vikram Rao"; 12b = picker, each readers line, question to Tara,
  "To: Tara Singh"; server checks (talk-to / trainer): it went to Tara by name and staff id, Vikram sees 0, Tara sees only
  it and replies (real staff sign-in by code); 12c = red count, "Tara from your gym", count gone; gt = question to Gym
  owner, complaint to Gym admin (no trainer offered), anonymous feedback to Gym owner, each server-checked; r586a/b =
  Vikram unticked mid-typing -> "This trainer is no longer listed", chip gone, falls back to Gym owner; 14 = pass member
  also gets the picker. 4 new messages (server cap 5/day). No app change needed: the app was right in every picture.
- Runs: 43743129226 default GREEN (all of ugym). 43743131861 (his phone size, 1.3) and 43743134223 (font 2.0, 360 dp):
  every R-586 check PASSED; flow 14 failed only (chain crossed midnight IST -> a new-day check-in; fixed 5128f5dc). Reruns
  43748701031 / 43748703653 and 43753637769 / 43753639925: R-586 all PASSED again; flow 14 hit my own test-script slips
  (an apostrophe, then {1,2}, in a text with ${GYM}: Maestro runs it as JavaScript; fixed 99a2f72e, 176712bd).
  Pictures read (font 2.0 + his size): picker, Gym admin readers line, "no longer listed", Tara's reply, empty state: all right.
- DONE: reruns 43758784959 (his size, 1.3) and 43758787395 (font 2.0, 360 dp) on 176712bd both GREEN, with 43743129226
  (default): B1 closed on all three. CI 43743116395 was red on an admin journey (alerts-uat.spec.mjs "Latest from your
  members"), not this change.

## R-587 (15 Nov 2026) New welcome screens and phone-number-first sign-in
- His words (15 Nov 2026): "I'm good with the welcome screen designs" (R-585), and for sign-in (R-582): "we can keep
  the primary method as phone number login, but we can keep the Google method hidden under something like try
  another way ... the only option that they should see is the phone number login, and other options may be hidden."
- **Welcome screens** (onboarding/introSlides.ts words, components/IntroSlides.tsx), words and look copied from the
  approved canvas (Main / Watch / Gym .dc.html). Screen 1 "Beat your last workout" with the bench card; screen 2,
  the watch, ONLY when a compatible Wear OS watch answers (watch app missing: "Install on my watch" opens the install;
  already there: "On your watch" with a tick, installs nothing); last screen the gym, "Get started" and "Recommend
  MettleUp to my gym" (the Gym tab's share message). "1 of 2" / "1 of 3", dots, Skip on every screen, Back walks
  back. Nothing waits on the watch: the screens open at once as 2; a watch answer that comes while screen 1 is still
  up adds the watch screen, a later one is ignored. Replaces the old two welcome screens.
- **Sign-in** (welcomeStart.ts startButtons, WelcomeScreen.tsx): the first screen shows only "Continue with your phone
  number" and a "Try another way" link; under it Google, Join my gym, Bring workouts, Use without an account and the
  demo, exactly as before. A phone that kept its own workouts opens the other ways at once. PHONE_SIGN_IN_ON = true
  (ships only with his "release").
- **Straight in** (phoneSignInApi.ts goStraightIn, WelcomePhone.tsx): one match and it is a MEMBER = no Join tap, no 3
  questions, no gym join screen. "Opening <gym>..." while the app joins the gym with the found code, then finishes
  setup with the first name, the proven number and the gym's name; goal "Build muscle", level "New to lifting", kg
  (all changeable in Profile). The 18+ and terms box moved onto the phone form (the join now happens there). If setup
  cannot finish, the member gets the 3 questions with the name filled in.
- QA: new 'watchIntro' stand-in (mettleup://qa-intro?watch=missing|installed, QA builds only) because the cloud phone
  has no watch. qa/sub-other-ways.yaml opens "Try another way" in every flow that uses a hidden button. tour-first-run
  (utour) and uat-rel-f203 (u203, now with "no tick" and "a found member goes straight in") rewritten.
- Tests: test/onboarding/welcomeIntro.test.ts (screen count, step labels, which watch button, exact words, card
  totals, banned words, which sign-in buttons show, who goes straight in, join before setup), plus phoneSignIn,
  welcomeUat, watchStartAndIntro updated. CI 43730661597 on 3d5a2bdd: phone typecheck, all 3 unit-test time zones up to New York and the flow lint GREEN when last read (dashboard steps still running).
- Round 2 (15 Nov 2026, his answers "drop the sign-in card" and "keep last", then canvas v7 for the gym screen):
  - The bench press example card is gone from the sign-in screen (WelcomeSetCard deleted); welcome screen 1 keeps
    its own. "Beat your last workout" stays as approved.
  - Pictures of runs 43730720703 (1080x2400, utour + u203 + u198, all passed) and 43730723379 (his size, 360 dp,
    font 1.3) showed the welcome picture pushing the words below the fold: on his size the title was cut off and
    the watch title was half hidden. Fixed: the picture shrinks to the room left above the words
    (introSlides.artScale, floor 0.35; FitArt in IntroSlides.tsx). u203 pictures all fine: phone-only first screen,
    Try another way, no-tick message, not found, 2 gyms, the trainer's old path, and a found member straight onto
    the Workout tab with the Gym tab showing QA UAT Gym. u198 (R-581 first-install dots) passed.
  - Gym screen (canvas v7): the words first, right under "3 of 3" / Skip, then the phone row, arrow, "We found you"
    card and "Example"; the phone row says "Verified" (was "Checked"). introSlides.wordsFirst.
  - Picture tours on 380aacf8: 43737448343 (1080x2400), 43737450694 (his size, font 1.3), 43737452877 (360 dp,
    font 2.0) all passed; his size cut the gym picture, so the floor went to 0.35 (346a6c47).
- Round 3, the fresh-eyes review (docs/reviews/2026-11-15-release-0.79.0-fresh-eyes.md), commits 5e81b24b, 6c3df285,
  1b5222d0:
  - G1: a found member whose setup save fails after the join (also when the gym's own colours rebuilt the welcome)
    now gets the 3 questions with the name filled and the line "You joined <gym>. We could not finish setting up
    the app, so answer these 3 quick questions." Never a silent return to the first screen (useStraightIn.needsSteps).
  - G3: the welcome listens up to 10 s for the watch (the phone side can take 4.5 s + 2.5 s); an answer that comes
    late still adds the watch screen while screen 1 is up (introWatchAnswer; a unit test answers after 4.5 s).
  - G2: under the phone form, "Used MettleUp before? Bring back your workouts" opens the existing Google backup
    sign-in. The phone number stays the only main button.
  - Labels above the boxes ("Your mobile number", "Your first name, as your gym has it"); hints are examples.
  - Straight in: a one-off Workout tab note, "We set you up as "New to lifting" and "Build muscle". You can change
    both in Profile." with "Open Profile" / "Got it" (notice kind setupGuess; meta straight_in_note, left out of
    backups). u203 checks the line.
  - Not changed, his calls: the single phone-number main button, and the screen between "Get started" and the form.
  - CI 43742201093 on 5e81b24b failed one unit test (the new note key was not in the backup list), fixed in 6c3df285.
    CI 43742790527 on 6c3df285: phone checks and every unit test green; only "Admin journeys" red (R-593 / R-579 /
    alerts panel tests, already red on main before R-587 touched anything).
- Pictures looked at (round 3, 15 Nov 2026):
  - 43742372931 (1080x2400, utour): labels above the boxes, the "Used MettleUp before?" link under the form, the gym
    screen words first with "Verified", every welcome screen fits.
  - 43742374904 (his size, utour): every welcome title and the gym picture fully visible (0.35 floor works); labels
    fine. The link sits below the fold there; 1b5222d0 makes the tour scroll to it, and rerun 43744714823 shows it
    on two lines under Skip, fully readable.
  - 43742376941 (360 dp, font 2.0, utour): labels fit; welcome body text scrolls under the dots (words cut mid-line
    until scrolled), as before.
  - 43742379237 (u203): phone-only first screen, labels, the link on every phone-form state, no-tick, not found,
    2 gyms, the trainer's old path, straight in with the new Workout tab note on top, Gym tab QA UAT Gym.
  - G1's failure path is proven by unit tests only; no cloud picture can force a setup save to fail.
- Round 4 (coordinator, 16 Nov 2026, before release):
  - G5 RELEASE BLOCKER, fixed: the phone form promises "Your number is checked once and is not kept for this", but a
    member who went straight in had the proven number saved into Profile. Now straightInDraft carries no number and
    goStraightIn is never handed it; Profile's number stays empty until the member types one. The promise wording is
    unchanged (privacy words need his yes). Tests: welcomeIntro "G5 (release blocker)" (no number in the setup for
    any name; the phone path never writes to storage); u203 opens Profile after the straight-in and checks the number
    is not there (rel-f203-14). The proof itself is held in memory only, for 15 minutes, to link the gym's list after
    the join (findGymApi.rememberFound), never on disk. Server: the check tables keep only a one-time code, no number;
    after the join the gym's own list record (which already had the number) is marked as checked.
  - G4 NOT fixed (outside the welcome flow): the watch update pop-up (R-438) can show for a watch that is paired but
    out of reach (a diary newer than 7 days, connected=false); its one button can then only say "Your watch is not
    connected". Fix: show the pop-up only while the watch is connected (the 20 s / 2 min retries already exist). Owner
    of that code: the watch update pop-up, not R-587.
  - Layout: the first sign-in screen's title now sits under the logo (no empty band above it); Google's 18+ box has
    16 px more room under the phone button when the other ways are open.
  - "Not kept / stays on this phone / never" promises in the member app, checked against the code:
    - TRUE: the PIN line on the staff door (never stored); the gym lead line "We never share your number" (the lead
      sends gym and city only); the sleep lines (no network in sleepLink); the trainer share lines (no notes, photos
      or body weight in the payload); the sign-in account line "Progress photos stay on this phone" (the account copy
      leaves them out); the Profile number line "Stays on this phone" (backups never carry it; nothing sends it); a
      progress photo or exercise video "stays on your phone" (true unless the member saves a backup file or switches
      on "Include photos in my backup", both their own choice).
    - LIKELY UNTRUE, not changed (wording needs his yes): the Workout tab import card "Bring your workouts, records
      and routines with you. Everything stays on this phone." shows to members who are signed in too, whose workouts
      are copied to their MettleUp account. Suggest: show that sentence only when not signed in, or drop it.
  - Part A (phase1-a.yaml) waited for the dropped sign-in card ("Example of a logged bench press"); it now checks the
    phone button and that the card is gone (f7e0ef90). No other flow waits for a removed welcome text.
  - Runs: CI 43748562296 on f7e0ef90 = phone typecheck, scroll lint and unit tests in all 3 time zones GREEN; only
    the dashboard typecheck red (R-593's Conversation type, not R-587). Part A 43748574359 passed. Pictures looked
    at: 43748158293 (his size) and 43748160227 (360 dp, font 2.0): the title under the logo, the 18+ box clear of
    the phone button; 43748162312 (u203): Profile's mobile number box empty after the straight-in (rel-f203-14),
    Build muscle and New to lifting picked.
- Open:
  - Gym staff (owner, trainer, desk) found by the number keep the old path (Join, 3 questions, the join screen).
  - The straight-in defaults (Build muscle, New to lifting, kg) are a guess; the Workout tab note now says so.
  - Review G4 (watch update pop-up for an out-of-reach watch): written up in round 4, not fixed (not welcome code).
  - The import card's "Everything stays on this phone" for signed-in members: needs his yes on the words.
  - At font 2.0 the welcome words scroll under the dots (cut mid-line until scrolled).
  - Done: the sign-in card dropped (his "drop the sign-in card").
  - "Beat your last workout" kept (his "keep last", 15 Nov 2026), an exception to the 1 Nov "previous" rule.
  - The watch screen was seen only through the stand-in, never with a real watch.
  - No What's new line: only a new install sees the welcome, and every member who updates is already signed in.

## R-588 (15 Nov 2026, evening) RESUME HERE: coordinator state when the usage limit ran out (resets 10 pm)
- **Admin panel deploy: APPROVED, NOT DONE.** He said "yes panel deploy". Every public word in it is approved:
  R-579 smart-link sentences ("yes app link words"), the two invite WhatsApp lines ("yes invite lines"), the 13 Hinglish
  lines on get-app.html / join.html ("OK app link Hinglish"), Hindi privacy ("OK Hindi privacy").
  Fresh-eyes review of b89823ce..26e4bef9 done: 1 BLOCKER (Settings gym Phone box rewrote landlines / two numbers),
  fixed in df153fb9 (R-580 fix round, also refuses foreign numbers again); minor test-alert button on a weak network
  fixed in fb9123fa (R-578); minor Hindi privacy lacks the 13 Nov AI Assistant change (old gap, English wins; left).
  UPDATE: d2928aaa CI run 43729439897 = 312 passed, 1 failed (J10a, a test-only mistake of mine, fixed in 05698111). The
  code is the same, so either deploy d2928aaa (the failure is in a test file only) or check R-586 is safe without 0096
  and deploy a later green commit.
  **Deploy candidate: d2928aaa** (it has every fix and NOT R-586, whose panel code needs 0096, which is not live).
  Before deploying: (1) its CI run must be green incl. "Admin journeys (phone, real forms)"; (2) look at the UAT pictures
  (r561 phone-display-menu-dark/-light, phone-top-bar-*, r579-*, timings); (3) a quick review of 26e4bef9..d2928aaa
  (df153fb9, fb9123fa, d2928aaa, 43e037e4) if not reviewed; then deploy per R-574's steps: wt-site checkout --detach
  <full sha>, get_dist.ps1 -Sha <full sha>, npx wrangler deploy in wt-site/deploy/panel (the @anthropic-ai/sdk trap in
  R-574). HQ: only if deploy/hq changed in the range (R-580 touched deploy/hq/api.js: yes, deploy HQ too). Check live:
  /api/switches (gymPages false), the top bar menu, /app and /j/<code>. GYM_PAGES stays off. Move ADMIN_NEWS_PENDING
  items that this deploy carries (pending-share-app-link, pending-mobile-digits, ...) as their notes say.
- **Building (helpers, each owns its note):** R-586 message recipient (0096 NOT APPLIED; needs his named yes before the
  live apply; phone release). R-587 welcome screens + phone-first sign-in (approved design, canvas
  https://claude.ai/artifact/Cj9n9P3mga1an9hYeV9Pb7 v6, gym line "If your gym uses MettleUp gym software, ..."). R-576
  workout target box (device run pending). R-575 watch pop-up, R-577 watch sizes, R-578 test alert (0095 NOT APPLIED),
  R-579 smart link, R-580 10-digit numbers: waiting on CI. Read each note's last lines for its state.
- **Waiting for him:** "plugged in" (adb check of the gym reply sound / pop-up, R-583, and the watch pop-up); yes for
  0095 and 0096 live applies (ask with what each changes); "release" for the phone app (nothing released).
- Coordinator worktree: scratchpad/wt-tour (detached; fetch + checkout --detach origin/main first).

## R-576 (15 Nov 2026) The target box rebuilt: three rules, and an unusual target always says why
- His words (15 Nov 2026), Hip Thrust Machine after 29 days: the box said "Previous set volume: 360 kg · Today's
  target: 310 kg" and the rows hinted 10x8, 10x8, 15x10 (last time 0 kg warm-up, 10x10 @8.5, 10x11 @9, 15x10 @8.5).
  His decisions: the total target always beats last time's total; "the only exception is a break of 6 weeks or more"
  (42+ days); remove R1's 21-41 day cut, keep R1b; a set never aims under what it did last time at the same weight;
  whenever the target is the same or lower, the box says why, with the "i" standing out (accent, a gentle short
  pulse, still with Remove animations on, stops once opened, plain on normal days). Widened: "We silently change the
  way calculations work and they don't get to know ... if there's an unusual calculation, there is a reason behind
  it, and we take them to the reason": every rule that changes a number gets a plain reason in the box or on the
  row it affects, and a per-set rule gives its row a small "i" that opens the same reason.
- Causes: (1) R1 (21+ days) aimed every set at the bottom of the range; (2) the box showed `p.planned ?? p.total`
  (a different plan from the rows: R-351 put last time's total in as the target when the plan was lower).
- The 3 rules now (kgTarget.ts header):
  1. Previous = every working set last time added up (warm-ups and drop sets out; reps on a move with no kilos).
  2. Today's target = exactly what the set rows suggest, added up. One source (activeWorkoutStore `beatRows`
     over `fillForSet`) for the box, the rows, a tick on an empty row, the watch and the In use screen.
  3. Not above Previous (and no 6+ week break): 1 rep at a time on the sets, first sets first, at most 2 extra a
     set, until it is (engine `beatGoals`, `extraReps`). The rows show those reps. Still not: a reason line.
     During the workout, after a short set the open rows get the catch-up reps (R-304 moved into the rows), and
     the box says which sets and why.
- His Hip Thrust before / after: 29 days was R1 -> 10x8, 10x8, 15x10 = 310 kg against 360. Now a normal day (R5):
  10x11, 10x12, 15x10 = 380 kg against 360, no reason line, plain "i". At 49 days: R1 (10 kg has no lighter step)
  310 kg with "Back after 7 weeks, so an easier start." and the standing-out "i".
- Old rules: KEPT R-60 (reps-only counts reps), R-454 floor, R-498 green lines + "Previous set volume beaten!"
  exception, R-516 live box ("X kg done · Y kg to go", "+Z kg over target"), R-358 (Counting changed: no box),
  C3-4 (top set / back-off as last) and R-143 (a lighter set at the top moves up), R-300 (missed goal again),
  F73 (a set after a long rest is not raised), T76 unit noise, R-515 goal words. MERGED R-304/kgProgress catch-up
  into the row hints (beatRows). DROPPED R-351/R-366 (last time's total as the target when the plan was lower:
  the rows now always beat it, or the box says why), R-138 (set-for-set compare: Previous is every set), R1's
  21-41 day cut (R1/R1b/T1 now 42+ days), the "the previous total" words.
- The rule table (rule -> unusual? -> reason words -> where):
  | Rule | Unusual? | Reason words | Where |
  |---|---|---|---|
  | R5/R4 +1 rep, total beats | no | - | - |
  | R2 weight up, sets fewer reps | yes | "Heavier weight, so some sets aim for fewer reps than previous." | box |
  | Rule 3 extra reps (any rule) | yes | "Set 1 gets an extra rep so the total beats previous." / "up to 2 extra reps" | box + row marks |
  | Still not above (fewer sets, step) | yes | "3 sets planned, 4 in the previous workout, so the target is not above previous." / "Even with 2 extra reps a set, the target is not above previous." | box |
  | R1 / R1b / T1 break 6+ weeks | yes | "Back after N weeks, so a lighter start." / "an easier start." | box |
  | R3 step back | yes | its drop note ("Reps fell under 6 twice, so a step back to 30 kg.") | box |
  | R-143 lift-up | yes | "Set 3 reached the top of its range, so it moves up to 12 kg." | box + row mark |
  | F73 long rest | yes | "Set 2 came after a long rest in the previous workout, so it is not raised." | box + row mark |
  | R-300 missed goal | yes | "Set 2 fell short in the previous workout, so it aims again for 11." | box + row mark |
  | B2cap / Tcap / A2zero, easy week, another version | yes | the Target's own reason | box (no total) |
  | Counting changed (R-358) | yes | "You changed how this weight is counted, so there is no previous total to beat." | box |
  | Live catch-up after a short set | yes | "Sets 2 and 3 aim for an extra rep to reach the target." | box + row marks |
  | Live: cannot reach | yes | "The sets left can't reach the target. That's fine, the next workout aims again." | box |
  | First time, pyramid, normal holds T2/T3, assisted normal steps, more sets than last time | no | - | nothing changes a number against the normal rule |
  | C3-4 top set / back-off as last | no | - | its rows show the same PREVIOUS numbers, never lower |
  | R-454 floor | no | - | it only stops a lower aim |
  | T76 unit noise | no | - | never visible to the member |
- Built: progression.ts (LONG_BREAK_DAYS 42, MAX_EXTRA_REPS 2, beatGoals, beatMode, planPlaces, breakWeeks,
  extraReps, heldGoals, againGoals); kgTarget.ts rewritten (Why, whyText, whyIcon, targetWhy, liveWhy); store
  beatRows + fillForSet; components WhyIcon.tsx (new), ExerciseLogCard (reason line, standing-out "i", row marks),
  SetRow (row mark), ExerciseKgRow (reason under the to-beat line). Nothing frozen touched.
- Tests: test/tracker/r576TargetBox.test.ts (his numbers, 6+ week break and 41 days, weight step, step that cannot
  beat, fewer sets, R-143, F73, R-300, R3, live catch-up and cannot reach, typing moves nothing, reps only, lb/T76,
  warm-ups and drops, no-box reasons, the hard rule, banned words); old tests updated to the three rules (kgTarget,
  r350SimpleRule, r366, r498, r515, r516 ...). Phone: new part u576 (uat-rel-r576-a/b/c, pictures rel-r576-*.png);
  u454 flow b's Lateral Raise now aims 18 on set 2 after set 1 at 20 kg (rel-r576-u454-lateral-catch-up).
- Known effects of rule 3 (accepted, flagged to him): a ONE-set lift that always makes its goal steps up in
  weight more often (a step asks as many reps as last time, up to +2); switching to a lower rep range (e.g.
  Strength 3-6 after 60 x 10) aims the top + 2 and still says "not above previous".
- Runs: CI 43727970516 on 658ebe6e: Typecheck (mobile) and Unit tests (mobile) green (the 35 old-test failures from 7514b644 fixed; the same run's Admin journeys failure was another helper's dashboard spec, fixed on main by R-580/R-584). Phone 43725652652 (u576, owner profile, on 8e087d67): uat-rel-r576-a/b/c all passed; pictures read: rel-r576-b-hip-thrust-normal (360 -> 380 kg, rows 10x11, 10x12, 15x10, plain i), rel-r576-c-hip-thrust-done ("Done 380 kg · Previous 360 kg" green), rel-r576-d/e/f-weight-step (Lateral Raise 22.5 kg, 1,420 -> 1,440 kg, both reasons, row marks on sets 1-2, highlighted i), rel-r576-h/i-break (Hip Thrust 310 kg "Back after 7 weeks, so an easier start."; Lateral Raise 17.5 kg 700 kg "... a lighter start."). Phone 43725655699 (u454 + w, u366, u439, longrest, default profile): STILL RUNNING when this was written. LEFT TO DO: read that run (download qa-out-partial, check part u454 passed and look at rel-r576-u454-lateral-catch-up.png: row 2 aims 18 after set 1 at 20 kg, "Set 2 aims for an extra rep to reach the target."); if a flow fails, fix the flow (numbers come from the 3 rules). Nothing else is open; no release (Waiting for release in PROGRESS.md).
- Waiting for release. What's new draft (PROGRESS.md).

## R-585 (15 Nov 2026) Welcome screens approved; Hindi privacy approved; who a member's message goes to (proposed)
- He said (15 Nov 2026): "yes messages" (build it, helper R-586; 0096 live apply still needs its own named yes) and
  "yes panel deploy". Deploy waits for: main CI green, a fresh-eyes review of b89823ce..HEAD, a UAT look at the
  pictures, and the R-579 smart-link public sentences: APPROVED ("yes app link words", 15 Nov 2026). The two invite WhatsApp lines ("Get the free MettleUp app from <gym> to track your workouts.", "Tap to get the app:"): APPROVED ("yes invite lines"). The 13 Hinglish lines on get-app.html / join.html: read aloud and APPROVED ("OK app link Hinglish"). Welcome build: helper R-587.
- His words (15 Nov 2026): "I'm good with the welcome screen designs, but for the screenshot where we are talking
  about them joining the gym, the subtext ... should mention something like, if your gym uses MettleUp, otherwise
  everything is okay." Then: "if your gym uses MettleUp gym software". Done on the canvas (Gym.dc.html, version 6): "If your gym uses MettleUp gym software, sign in with your
  phone number and we find your gym for you. ..." The 3-screen design (watch screen only with a Wear OS watch) is
  APPROVED. Build queued (a helper slot is needed), together with the phone-first sign-in of R-582; ships only with
  his "release".
- "OK Hindi privacy" (15 Nov 2026): the Hindi privacy line of R-582 is approved. Both pages reach the site with the
  next admin panel deploy (needs his yes).
- Message routing, his ask (15 Nov 2026): "It should be GYM Owner or the name of the trainers added in Admin Panel..
  user can select any. For feedback / complaint, they can select GYM Owner or GYM Admin (gym admin will send to both
  owner and staff, any type)". This replaces the A/B trainer-choice question of R-583.
  Today (0069/0087): Question -> owner + front desk + trainers; Feedback -> owner + front desk; Complaint -> owner.
  Proposed: Question -> "Gym owner" or one named trainer (every person ticked Trainer in the panel); Feedback and
  Complaint -> "Gym owner" (owner only) or "Gym admin" (owner + front desk). My recommendation sent to him: "Gym
  admin" does NOT include trainers (a complaint about a trainer must never reach that trainer); a question to a named
  trainer alerts only that trainer, and the owner can still read it. Needs a new database change (next free number
  0096), applied live only after his named yes, plus a phone release. Waiting for his answer.

## R-584 (15 Nov 2026) Admin panel on a phone: "Save timings" looked broken; the top bar had too many buttons
- His report (15 Nov 2026, screenshot from his phone, Gym timings): "it has these pre-loaded gym timings that I'm just
  trying to save, but the save button is disabled" and "the very top of the app is kind of messed up because of too
  many buttons, so you might want to rethink that".
- **Save timings: not a bug, a missing reason.** His timings were already saved (gym_timings row: 14 Nov 2026, 10:56
  UTC, by him). Save stays off until something changes (timingsChanged). The "Last saved" line sits at the top of the
  editor, a full phone screen above the button, so the grey button looked broken. Now, when nothing changed: the
  button reads "Saved ✓" (still off), and a line right under it says "These timings are saved (14 Nov 2026) and
  members see them. Change any time above to save again." Changing anything brings back "Save timings".
- **Phone top bar** (CompactHeader): was logo + name + Refresh + bell + moon/sun + EN/HI; the gym's name was cut to
  "Crisp…". Now Refresh, the bell, and ONE round "Screen and language" button (ui/DisplayMenu.tsx, drawn like the
  bell). Tapping it drops a small panel with Dark | Light and English | Hinglish side by side (R-561 kept the two
  together). Not a pop-up: a tap anywhere else or Escape closes it, and that tap still works. A computer's top bar is
  unchanged (both switches in it). ThemeToggle `icons` and LangToggle `short` are now unused.
- Tests: two shared steps in e2e/support.mjs, `pickInTopBar(page, name)` (opens the menu on a phone, taps, closes)
  and `themeByEvents(page, mode)` (the same by events, works under an open sheet). Moved to them: ai-questions,
  assistant, test-alert, r450, r495, settings J10a, r561-4 (now checks the name keeps >= 180 px and the panel fits
  390 px, with pictures phone-display-menu-dark/-light). timings.spec checks "Saved" and the new line.
- A panel change: on main, not live until a panel deploy (needs his yes).

## R-580 (15 Nov 2026) Every mobile number box keeps only the 10-digit Indian number
- His ask (15 Nov 2026): when a phone's keyboard suggests the user's own number, it fills in the country code and
  spaces ("+91 98765 43210"); the field must strip anything extra and keep only the last 10 digits.
- **The rule** (ONE pure module, packages/theme/src/indianMobile.ts, imported by both apps and both Workers): digits
  only (spaces, dashes, dots, brackets, "+" go); Hindi/Bengali/Tamil/... keyboard digits map to 0-9 by an explicit
  table (never a Unicode regex); a "+91" in front goes at once; more than 10 digits -> the LAST 10 ("91"+10, "0"+10,
  "0091"+10, anything else); fewer than 10 -> kept so typing goes on; the "enter 10 digits" checks stay.
  Typing (mobileInput(prev, next)): an 11th key after a full number is ignored like a length limit (it may not push
  the first digit out); "+" and "+9" stay until "+91"; "0091 ..." by hand waits for all 14 digits; deleting works.
  Shared tables MOBILE_CASES + MOBILE_INPUT_CASES run in every codebase. Public pages and the HQ page carry a
  plain-JS copy between "// R-580 mobile rule >>>" markers; the dashboard test checks every copy is the same text
  and passes both tables.
- **The maxLength trap (found):** no box had maxLength={10}, but: member app WelcomePhone / Find my gym / Staff door
  maxLength={16} and Check in .slice(0, 16), welcome + Profile maxLength 24; panel pages friend.html, join-online.html
  and both home forms maxlength="16"; the gym page's Ask + chat forms maxlength="14" (deploy/panel/gymPage.js); HQ
  "Owner's mobile" maxlength 16. 14 cut "+91 98765 43210" (15 characters) to "+91 98765 4321", which the server
  refused: the gym page form failed on EVERY autofill. 16 cut "(+91) 98765-43210". All removed; the rule is the limit.
- **Every field changed:** MEMBER APP (India only, mobileInput, autoComplete tel-national + textContentType):
  onboarding/WelcomePhone (sign in with your phone number, R-493/F203), app/find-gym, shop/CheckInScreen,
  shop/StaffDoorCard. Any country (anyCountryMobileInput: a "+44 ..." number stays as typed, SH-26): onboarding
  WelcomeScreen "Mobile number, optional", settings/ProfileCard. No frozen file touched. ADMIN APP: TextField gets
  an autoComplete prop (default off); SignInForms (sign-in + Set up a new gym, tel-national), ForgotPin (both,
  tel-national), GoOnlineCard (tel-national), PeopleScreen (staff number), VisitorsCard (visitor), MemberFormSheet
  mobile + emergency number, Enquiries add, AI Assistant add member / add enquiry cards (dialMobileInput: +91 cleans,
  another code is left alone), Settings gym "Phone" (mobileOrAsTyped: a pasted mobile is cleaned, a landline like
  "0141 2345678" keeps its 0). normalizeMobile = the shared rule; normalizePhone also takes "0091"+10 and Indian
  digits but does NOT cut a stray 11th digit (imports and the AI Assistant must not guess). PUBLIC PAGES:
  join-online.html, friend.html, home (both forms, autocomplete tel-national), gym-page/page.js (Ask + chat).
  WORKERS (never trust the page): panel friend.js, leads.js, gymPageServe.js mobileOf (gym page + chat contact),
  phoneCode.js indianMobile (sign-in codes, self-join WhatsApp check); HQ api.js gym/create. Kept STRICT on purpose:
  the WhatsApp SENDER number (phoneInbound senderMobile): "the last 10 digits" there would let a foreign number
  whose last 10 digits match an Indian one prove that number. HQ page "Owner's mobile" box. Not changed: the gym
  server's SQL _norm_phone (no live database change) and the Excel import's parser.
- **Tests:** apps/mobile/test/lib/indianMobile.test.ts (tables + every phone-pad box uses the rule, no maxLength),
  apps/dashboard/test/crm/mobileNumber.test.ts (tables, normalizeMobile/normalizePhone, every JS copy, no tel box
  with maxlength), deploy/panel/mobileRule.test.mjs + phoneCode.test.mjs (senderMobile strict), e2e
  mobile-number-uat.spec.mjs (Set up a new gym, Add member, friend page, landing page; pictures r580-1..5),
  landing-lead.spec.mjs (the box now shows 9829012348). Phone: u203 step 5b types "+91 98765 43210" into the
  sign-in box and checks 9876543210 (picture rel-f203-5b-keyboard-number).
- What's new: owners ADMIN_NEWS_PENDING 'pending-mobile-digits' (with the next panel deploy); members: PROGRESS.md
  "Waiting for release" R-580 draft line.
- **Fix round (15 Nov 2026, fresh-eyes review before the panel deploy):** (1) BLOCKER: the Settings gym "Phone" box
  (printed on receipts; may hold a landline or two numbers) ran "last 10 digits": "080 23456789" became the fake
  mobile 8023456789 (any area code whose 2nd digit is 6-9: 079, 0712, 0612 ...) and "98290 12345 / 9" collapsed into
  one number. mobileOrAsTyped now cleans ONLY a single mobile with a clear India code in front (12 digits from 91,
  14 from 0091, 6-9 first); a landline, two numbers, a "/", ",", a word or a foreign number stay exactly as typed.
  The member form's EMERGENCY number (may be a landline too) moved to the same rule. Every other switched box is a
  mobile used for sign-in codes, WhatsApp or the 10-digit check, so the owner's "0 + 10 -> last 10" stays there.
  (2) A number with "+" or "00" and another country code ("+44 7911 123456") had passed every server as 7911123456:
  cleanMobile now keeps it whole (refused by every check, as before R-580) and mobileInput shows it as typed so the
  box's own check refuses it. All five plain-JS copies changed alike. Tests: mobileNumber.test.ts (landlines 080 /
  079 / 0712 / 0612 / 0141 / 011, two numbers, foreign refused, Settings + emergency use the safe rule),
  mobileRule.test.mjs (foreign refused by friend, lead, gym page, sign-in), phoneCode.test.mjs, shared tables.
- Journeys fix (d2928aaa): packages/theme/package.json gets "type": "module"; the journey runner had compiled
  indianMobile.ts as CommonJS ("Named export cleanMobile not found") when a spec imported a Worker file.
- **State (15 Nov 2026, paused for the usage limit):** on main: 2c450aa0, 07cbced6, fix round df153fb9, d2928aaa.
  Main CI is red at "Unit tests (mobile)" from 11 tracker test files (targetSettings, r454RepFloor, progression ...)
  that were red BEFORE R-580 (same list on run 43725971912), so later steps skip on main. To run them anyway a
  TEMP branch tmp-r580-ci adds continue-on-error to the 3 mobile unit steps (never on main): run 43727113404
  (pre-fix) passed mobile R-580 tests (49), dashboard unit, Panel Worker (413/0), HQ (178/0); journeys failed to
  load (fixed by d2928aaa). PENDING: run 43729446014 on d2928aaa (journeys + pictures r580-1..5 in artifact
  dashboard-uat-pictures). Device QA 43726397502 (u203,u461) PASSED; picture rel-f203-5b-keyboard-number checked:
  the box shows 9876543210.
- **Left:** read run 43729446014 (journeys green, look at r580 pictures); delete branch tmp-r580-ci
  (git push origin :tmp-r580-ci); remove worktree D:/Apps/ForgeAI/wt-r580; set Status DONE here.
- Status: IN PROGRESS.
## R-583 (15 Nov 2026) Gym reply notification: tap opened nothing (fixed); no sound / no pop-up (open); trainer choice hidden
- His test (15 Nov 2026, his own member on his gym): the gym replied to his feedback. "There is a notification in the
  notifications panel, but there is no sound. And the notification has no pop-up either. Tapping that notification did
  not directly take me to that conversation." Also: no choice of owner or trainer under "Message your gym".
- Server proven fine: member_push_notes row kind gym_reply, route /shop/message, made 14:35:51 UTC, sent 7 s later
  (why_done 'sent'); the member has 1 push address.
- Tap, FIXED: tracker/components/WorkoutPresenceHost.tsx opened only /workout, /shop, /shop/inbox, /shop/ask and the
  workout. Every other route was dropped: /shop/message (gym reply), /settings/feedback (the MettleUp team's reply),
  /shop/orders, /shop/diet, /measures. Now any plain app path opens (lib/alertRoute.ts alertTapPath; test
  test/lib/alertRoute.test.ts). Ships with the next phone release.
- Sound and pop-up, NOT proven: his OPPO's feedback log (id 104) says the "Messages from your gym" channel is
  importance 5 (CORRECTION, R-590: that is expo's number, 5 = DEFAULT = Android 3, no pop-up; not the highest), and expo-notifications 56 plays the channel sound for a data-only push with no "sound" key
  (NotificationData.shouldPlayDefaultSound = sound == null). So the code paths read right; the posted notification's
  record is needed: at home, adb shell dumpsys notification --noredact (the record's channel, importance, flags,
  "silent" group) right after a test reply, with the app closed, in front, and with a workout open.
- Trainer choice: built in 0.78.0 (R-549), shown only when askAccess is 'open' (a plan running today, not a pass).
  His member record on his gym has NO plan, so only "The gym" showed and the page skipped the choice. Asked him:
  keep hidden, or always show "A trainer" with the reason when it is not open.
- Sound and pop-up: cause found and the sound fixed in R-590 (ColorOS strips every non-listed app's channel; the
  app now rings gym messages itself; the pop-up cannot be given back by any app).

## R-582 (15 Nov 2026) Phone sign-in: 0093 APPLIED LIVE, privacy line added; phone-only first screen decided
- His words (15 Nov 2026): "yes 0093", "yes privacy line", and: "we can keep the primary method as phone number login,
  but we can keep the Google method hidden under something like try another way ... the only option that they should
  see is the phone number login, and other options may be hidden."
- 0093 phone_sign_in_find applied live from the Supabase SQL tab (management API; the function body as in the file,
  comments left out). Checked first: every helper it needs is live. anon may run it, public may not. Live test
  supabase/tests/0093 PASS 35; no T93 gym left; phone_code_settings still 1 row.
- Privacy: docs/legal/privacy.body.html (section D, his approved line word for word) + privacy-hi.body.html (Hindi
  rendering, needs his read-aloud check), Meta row now names members too, dates 15 Nov; rebuilt with
  scripts/legal_pages.py. Reaches the site only with the next admin panel deploy (needs his yes).
- Next (queued, a helper slot is needed): first screen = only "Continue with your phone number"; Google, "Join my gym",
  "Bring workouts", "Use without an account" behind one "Try another way" link; an active member found by the number
  goes straight into the gym (no Join tap, no 3 questions, no gym join screen); PHONE_SIGN_IN_ON on for the next
  phone release (ships only with his "release").

## R-581 (15 Nov 2026) New-feature dots on a FIRST install (friend's Android phone)
- His report (15 Nov 2026): a friend's first install showed dots on Settings > "Light or dark", "Plates and bars",
  "Health app". "This is the first time install ... So why there are dots? That's just confusing."
- Cause: lib/newDots.ts parseSeen(null) = [] (nothing seen), so a fresh install lit every feature under 30 days old.
- Fix: lib/newDotsStore.ts loadNewDots. No stored list AND no older version remembered (whatsNew
  installMetEarlierVersion false) = first install: store every feature up to the installed version as seen
  (newDots.ts seenOnFirstInstall). Only features of LATER updates light. A phone that updates from an older version
  still gets its dots. Known gap: a phone updating from a version before dots existed whose What's new card was
  already closed before the dots loaded counts as fresh (no dots; harmless).
- Tests: test/lib/newDots.test.ts "a first install shows no dots (R-581)". Ships with the next phone release.

## R-578 (15 Nov 2026) "Send a test alert" on the admin app's alerts card
- His ask (15 Nov 2026): a "Send a test alert" button in the admin panel, so an owner can check in one tap that alerts
  reach this phone or computer with the admin app closed. Why: today his 2 friend enquiries made urgent alerts, HQ sent
  them to both his browsers and Google's push service took both ("[panel-push] sent 2 failed 0"); his laptop was fine,
  his OPPO phone (installed admin app) showed nothing. Cause unknown; the test plus a "shown" answer lets him (and
  every owner) check it. Never blame his phone settings: the checks are things to look at.
- Built: Settings > "Alerts from your members", for a device with alerts on: "Send a test alert". It goes the REAL way
  (gym_alerts -> hq_panel_push_instant -> HQ Worker -> push company -> the admin app's service worker), to THIS
  browser only (gym_alerts.sub_id = its gym_web_push row). Once a minute a browser, 20 an hour a gym. The service
  worker shows it (tag mettleup-test-<alert id>, title "MettleUp: test alert", tap opens Settings), then tells the gym
  server (panel_test_alert_shown: the alert id only; via /sb, falling back to Supabase's own address) and any open tab.
  The card asks every 5 s, then 20 s, for 10 minutes, and again when the admin app is opened again, and says:
  waiting ("It can take up to a minute. You can close the admin app now ..."), shown ("Sent. Did a notice pop up? It
  showed on this device at 7:41 pm." + "No notice popped up" with 2 things to look at), not shown after 90 s ("We sent
  it, but this device has not shown it yet." + 3 things to look at), not sent yet ("on our side, not your device"),
  or "We could not reach this device". Test alerts never reach owner_alerts, the bell, Today, summaries or counts
  (server and admin app both drop them), so with the admin app open there is one notice (the service worker's), not two.
  The HQ Worker needs NO change (it sends what the server hands it; a new HQ test proves the test send is untouched).
- APPLIED LIVE 15 Nov 2026, test PASS 35: see R-591.
- Migration: supabase/migrations/0095_test_alert.sql, **APPLIED LIVE 15 Nov 2026 (R-591)**: gym_alerts.sub_id +
  shown_at, kind 'test_alert', owner_send_test_alert / owner_test_alert / panel_test_alert_shown, and 0075's
  owner_alerts + 0076's three hq_panel_ calls replaced (tests skip test alerts; every other alert goes as before).
  Test: supabase/tests/0095_test_alert.sql; security.sql's anon list has the 3 new calls.
- To go live: (1) his yes to 0095, then the SQL Editor + live test 0095; (2) an admin panel deploy (sw.js and the card).
  No HQ deploy needed. Until 0095 is live the button stays hidden (the card is as before).
- Fresh-eyes fix (15 Nov 2026, fb9123fa): the button showed when the first read failed for another reason (weak
  network, timeout, 5xx), though 0095 might not be live. Now it shows only after the gym server ANSWERED
  owner_test_alert (testBoxVisible); any failure before that keeps it hidden. Unit + journey tests.
- What's new: ADMIN_NEWS_PENDING 'pending-test-alert' (moves at the deploy after 0095 is live).
- Tests: unit (test/crm/webPush.test.ts: answers, states, polling, clock, words, the service worker's "shown";
  gymAlerts.test.ts: a test alert is never listed), HQ (deploy/hq/panelPush.test.mjs, local pass 12/12), journey
  e2e/test-alert-uat.spec.mjs (no 0095 = no button; every state on phone and computer, dark and light). Cloud runs below.
- Cloud so far: database job green (0095 test PASS) since 71522d95. Run 43727970516 (658ebe6e): dashboard typecheck,
  unit tests, HQ tests, build and panel crawl all green; admin journeys never started (other helpers' r561 spec and
  the R-580 import broke loading; fixed by 43e037e4 + d2928aaa). First run that can run the R-578 journeys: main
  d2928aaa (pending when the session stopped).
- Status: PAUSED (usage limit, 15 Nov 2026). Left to do: (1) read the CI run of d2928aaa or later: "Admin journeys"
  step, fix any R-578 journey failure; (2) download artifact dashboard-uat-pictures and LOOK at the 24 test-alert
  pictures (4 looks x 6 states, e2e/.results/uat/<look>-test-alert-*.png); (3) put run ids here, mark done.
  0095 APPLIED LIVE 15 Nov 2026 (R-591).

## R-579 (15 Nov 2026) One smart app link everywhere, and "Share app link" on every member's page
- The brief (15 Nov 2026), his words: "There should be a permanent share app link button on each member's profile, but you
  have to also think about configuring a link that basically redirects the user to the correct Play Store. If you know they
  are on Android, it goes to the Android Play Store. If the user is on iPhone, when the iPhone app is built, it goes to the
  iPhone. ... Even for the website, we have the link there. So wherever we have the link that the user is sharing should be
  configured in that way."
- Status: BUILT and pushed (2ebca638, 449c029f). The public words, invite lines and Hinglish are all approved by him (R-585).
  Left: (1) read CI run 43730819299 (first run whose admin journeys can load; earlier runs died on other helpers' syntax
  errors): e2e/r579-uat.spec.mjs must pass; fix any R579-1/2/3 failure; (2) LOOK at the pictures r579-*.png in that run's
  dashboard-uat-pictures artifact (member page phone/computer, light/dark, offline; gym link Android/iPhone/computer;
  /app iPhone and computer); (3) fresh-eyes review of the pictures (R-335); (4) the panel deploy (Worker + dist), then
  move ADMIN_NEWS_PENDING 'pending-share-app-link' to ADMIN_NEWS with the deploy day.
- **The smart link (deploy/panel/appLink.js), two forms, one set of device rules:** `/app` (no gym) and `/j/<CODE>` (a gym
  known). /j/<CODE> stays the link with a gym because Android opens it straight in an installed app (an App Link); a
  redirect from another address would not. No cookie, nothing kept, only the User-Agent read; responses `Vary: User-Agent`.
  | visitor | /app | /j/<CODE> |
  |---|---|---|
  | Android (Chrome, Samsung Internet, OPPO, in-app browsers) | one 302 to Google Play, no page | the gym page: opens the app, or Google Play steps (unchanged). The app reads no Play install referrer (checked apps/mobile), so the gym page keeps the gym |
  | iPhone / iPad, APP_STORE_URL empty (today) | public/get-app.html: "The iPhone app is coming soon" + what works now (the front desk can add them) | the gym page: "coming soon" card with the gym's name, "Become a member" when the gym has it open, the gym code |
  | iPhone / iPad, APP_STORE_URL set | 302 to the App Store | 302 to the App Store |
  | iPad asking for the computer site ("Macintosh" + touch) | the page spots it and does the iPhone rule | the same |
  | computer / anything else | get-app.html: QR code of the link, Google Play button, App Store "Coming soon" (a real button once set) | the gym page: QR code of this link + both stores |
  | link previews (WhatsApp, Facebook, iMessage, Telegram, Google) | get-app.html with og: title, description, picture | the gym page with its og: lines (unchanged) |
  APP_STORE_URL (wrangler.jsonc vars, empty) switches iPhones to the App Store with no code change; only an apps.apple.com
  /app/ address counts. appLink.test.mjs pins both states.
- **Every place a person can share or tap an app link, and what changed:**
  | place | link | changed |
  |---|---|---|
  | Admin panel, member page | "Share app link" (WhatsApp icon), every member, among Check in / Archive / Member card | NEW; the small "Send app invite" link (only for members not on the app) is gone. Not on the app: the invite message; on the app: words for a new phone or a reinstall; gym not online: /app. Offline: greyed out, "Needs internet" |
  | Admin panel, Invite members (link, WhatsApp, copy, QR poster) | /j/<CODE> | no link change; the link itself is now smart. "Send app invite" words renamed |
  | Admin panel, gym code card (JoinCode) and new-gym screen (NewGymReady) | /j/<CODE> | no change needed |
  | Printed join poster QR | /j/<CODE> | no change needed |
  | Member website mettleup.fit (3 "Get the app" buttons) | /app | no change needed: /app is smart |
  | Gym invite page join.html | /j/<CODE>, its Play button /app | iPhone and computer views added (replaces "MettleUp is an Android app for now") |
  | Check-in poster page checkin.html | its Play button /app (Android only) | unchanged: an iPhone still reads "Android app for now", which stays true |
  | Help articles | member page and invite poster articles | "Send app invite" -> "Share app link" |
  | Member app | no app-download link is shared (friend link /f/ is a lead page, recommend link is the gyms page, the update screen opens Play itself) | unchanged; apps/mobile not touched |
  | Member card WhatsApp words, HQ Worker, emails | no app link | unchanged |
- **Public sentences that need his yes before the deploy** (new; a fresh-reader pass changed 7 of them, noted *):
  get-app.html: "Get the MettleUp app" / "The free MettleUp app tracks your workouts and connects you with your gym."* /
  "The iPhone app is coming soon" / "MettleUp is on Android phones today. When the iPhone app is ready, this same link will
  open it in the App Store. Keep this link."* / "What you can do now" / "If you train at a gym, ask the front desk to add you
  as a member. You can be a member without the app."* / "Have an Android phone too? Open this link on it to get the app." /
  "Get the MettleUp app on your phone" / "Scan this QR code with your phone's camera"* / "Coming soon" (App Store tile);
  link preview "The free MettleUp app tracks your workouts and connects you with your gym. On Android phones now. The iPhone
  app is coming soon." join.html: "The iPhone app is coming soon" / "MettleUp is on Android phones today. When the iPhone app
  is ready, this same link will open it. Keep this link."* / "Until then, the front desk at <gym> can add you as a member.
  You do not need the app for that." / "Open this link on your phone" / "Scan this QR code with your phone's camera."* /
  "Your gym's code" / "Keep this code. You type it in the MettleUp app to join your gym."* (iPhone and computer only).
  WhatsApp words for a member on the app: "Here is the MettleUp app link from <gym>, in case you need to install the app
  again or use a new phone."* Each page line has its Hinglish line under it. Removed: "MettleUp is an Android app for now" /
  "Open this link on an Android phone, or ask the front desk."
- What's new for owners: waiting as ADMIN_NEWS_PENDING 'pending-share-app-link' (moves at the panel deploy).
- Tests: deploy/panel/appLink.test.mjs (Android Chrome, Samsung Internet, OPPO, Cubot, Facebook in-app; iPhone Safari and
  Chrome, iPad; Windows, Mac, no UA; WhatsApp, Facebook, iMessage, Telegram, Googlebot; with and without a gym code; with
  APP_STORE_URL empty and set); dashboard test/crm/invite.test.ts; admin journey e2e/r579-uat.spec.mjs (pictures r579-*).
  Run ids: 43727970516 (head 658ebe6e, includes R-579): Typecheck dashboard, Unit tests dashboard, Panel Worker tests
  (appLink.test.mjs), Build and Panel crawl all PASSED; Admin journeys could not load (other helpers' r561 duplicate
  "panel" and the indianMobile import, both since fixed). 43730819299 (head 93f0489e): R579-1, R579-2 and R579-3 all PASSED (the run is red only from other helpers' journeys);
  its r579-*.png pictures are in that run's dashboard-uat-pictures artifact, NOT looked at yet.

## R-577 (15 Nov 2026) Watch screens checked on the sizes of the watches members own (owner chose "Option 1")
- The brief (15 Nov 2026): the owner chose "Option 1": render the watch app's screens in the cloud on Galaxy
  Watch, OnePlus and TicWatch sizes too, not only Pixel, plus the biggest text a watch allows; a small-round
  emulator UAT leg next to the large one. A screen that fails at the biggest text is a real bug: fix the layout.
- Status (15 Nov 2026, 16:00 IST-ish, session paused for the usage limit): built and pushed; LAST CHECK PENDING:
  run 43730772694 (wear-build at 83ebbfb1). Resume: read its result; on the small-watch leg read
  watch-uat-api34-small/font-scale (results.txt, font-scale-arrays.txt = the largest text the Settings app
  offers; if it is above 1.3, raise WatchSizes.LARGEST_FONT), look at the two largest-text pictures, then
  finish this entry. Nothing else left.
- Sizes added (WatchSizes.kt; px from the makers, density from Google's Horologist WearDevice list, Samsung 340 dpi):
  | dp | px / density | stands for |
  |---|---|---|
  | 192 (kept, "small") | 384 xhdpi | Pixel Watch 1/2 41 mm |
  | 198 | 396 xhdpi | Galaxy Watch4/5/FE 40 mm, Watch4 Classic 42 mm |
  | 204 | 408 xhdpi | Pixel Watch 3/4 41 mm; also Galaxy Watch6/7/8 40 mm, Watch6 Classic 43, Watch8 Classic (432-438 px at 340 dpi = 203-206) |
  | 212 | 450 at 340 dpi | Galaxy Watch4/5 44 mm, Watch4 Classic 46, Watch5 Pro |
  | 226 | 480 at 340 dpi | Galaxy Watch6/7/8 44 mm, Watch6 Classic 47, Watch Ultra |
  | 228 (kept, "large") | 456 xhdpi | Pixel Watch 3/4 45 mm |
  | 233 | 466 xhdpi | TicWatch Pro 5 / Enduro, OnePlus Watch 2/2R/3 |
  Largest text 1.3 (Galaxy "Largest"; Pixel 1.24) on 192 and 233. No square size: no Wear OS watch on sale in
  India has a square screen. Sources: github.com/google/horologist (roboscreenshots WearDevice.kt), Google
  Wear OS screen-size guide, maker spec pages (GSMArena/Samsung/Google Store), Galaxy font scale per droidwin/technastic.
- Found and FIXED: at the largest text the rest countdown came out 23 % SMALLER (60 -> 46 px on 384 px;
  73 -> 56 on 466), weight/reps 10 % smaller: Px.sp divided by the font scale but Android 14+ grows big text
  non-linearly. Px now uses Density.toSp (WatchScreens.kt, 8a381e30); new test largestTextKeepsTheCountdownSize.
  Before = run 43722838806 screens, after = run 43724481039 (countdown 60 px at both sizes).
- Runs: renders all pass on all 9 sizes (43724481039, 695 tests, 0 failures; I looked at every new size's sheet).
  Small-round emulator UAT (temp ref run 43726347844, branch deleted): keep-screen 6/6, dim 14/14,
  dim-AOD-off 20/20 PASS; the font-size step failed on CI plumbing (adb offline after boot, charging screen),
  fixed in 83ebbfb1. Cost: watch tests 1m13 -> 2m37; small UAT leg runs alongside (~+3 min wall time).
## R-575 (15 Nov 2026) "Your watch app has an update" never showed on his phone: every signal, a why, retries
- The brief (15 Nov 2026): the pop-up never shows on his phone (0.78.0, OPPO CPH2873, Android 17) although his
  watch runs a watch app older than 0.77.0. Later the same day: find the root cause and a fix for EVERY Wear OS
  watch brand (Pixel, Galaxy Watch, OnePlus, TicWatch; Wear OS 3 to 6), several independent signals, no single
  one deciding, retries, a "why" in the answer, the rule table written here.
- **Proof (feedback row 105, 15 Nov 13:27 UTC):** the watch log's head line had NO "Watch app:" part, while the
  same send read his watch's screen diary fine (150 lines, the newest 2 minutes old; "old watch app 23"). The
  diary is a Data Layer item only our watch app writes, so package, signature and the Data Layer itself work.
  "Watch app:" was empty when the native answer was ok:false (a failure, the 8 s timeout, the 5-minute
  "Data Layer paused") OR no watch had hasApp. It cannot say which step gave it.
- **Every step that could give "" (old code, one after another, the first failure ended the read):**
  | step | how it gave "" | ruled out? |
  |---|---|---|
  | unavailable() pause (a put got API_NOT_CONNECTED in the last 5 min) | ok:false at once | yes: the diary read right after checks the same pause and answered |
  | connectedNodes failed | ok:false | no |
  | connectedNodes empty (a watch reconnecting: Google says up to 4 min after Doze or off-wrist) | nodes [] | no |
  | capability (FILTER_REACHABLE) failed | ok:false | no |
  | capability empty or without the watch's node id | hasApp false | no |
  | version items read failed | ok:false | unlikely: the diary items read the same way worked |
  | the whole chain past 8 s (a slow Wear OS on a busy phone; 2.5 s of it is the ask-and-reread) | ok:false | no |
  | the JS side: no native function / an error | null | yes: 0.78.0 exports watchVersions |
- **Root-cause candidates (research: developer.android.com discover-devices and messages pages, the
  CapabilityClient reference, Samsung developer forum and Stack Overflow threads):**
  | candidate | what would prove it | handled now? |
  |---|---|---|
  | resource shrinking removed the watch's android_wear_capabilities array (release builds shrink; nothing in code names it; tools:keep is in values/wear.xml) | aapt2 dump of the release watch APK | **PROVEN, the root cause** (below) |
  | a stale capability cache after a watch app update or a phone app reinstall (reports, no official note) | capR/capA = 0 while nodes = 1 in the next log | yes: items + the ping |
  | FILTER_REACHABLE says not reachable while the watch is paired (cloud-only link, reconnecting) | capR 0, capA 1 | yes: FILTER_ALL counts for a connected watch |
  | no connected node at that moment (reconnect after Doze, Bluetooth off; OEM battery savers such as ColorOS on his OPPO hold back Play services) | nodes=0 with diag=1 | yes: a watch with a fresh diary is reported "not connected" |
  | Wear OS slow or failing on the phone (timeout, a status code) | late / fail:<code> in the why | yes: all steps at once, 2 retries with backoff, a partial answer instead of nothing |
  | app ID or signing mismatch (capabilities and items are per app) | items would not sync either | ruled out: his diary synced |
  | Galaxy Watch / OEM pairing apps (Galaxy Wearable) | same signals; capability and items are Play services, not the OEM app | same rules cover it |
- **ROOT CAUSE, proven (very sure):** every released watch app (0.76.0, 0.77.0, 0.78.0 checked) has NO
  "forgeai_watch_app" anywhere: the APKs' resources.arsc have no array type at all, and the 0.78.0 watch AAB (what
  Play serves) keeps the android_wear_capabilities entry with NO value. Release builds shrink resources, nothing in
  code named the array, and tools:keep on values/wear.xml is not honoured there. So no phone, on any watch brand,
  ever saw the capability: watchVersions said hasApp false (no pop-up), probeWatch said "plain watch", F67 install
  said missing. The new wear-build step failed on exactly this (run 43724579949: "The release watch APK has no
  android_wear_capabilities array"). The phone-side fix (diary and version items count) makes the pop-up work for
  watch apps already installed (0.76.0 on); the watch-side fix makes future watch apps advertise it:
  res/raw/keep.xml keeps the array, WatchCapability names it in code and also announces it at run time
  (addLocalCapability, DUPLICATE_CAPABILITY = fine) from WatchVersion.publish (app start, boot, update, listener).
  Needs a watch release to reach his watch.
- **The rule table (WearWire.watchesSeen; a watch has the app when ANY signal says so, "no app" needs every
  signal that answered to say no; a failed step is never a "no"):**
  | signal | "has the app" | "connected now" |
  |---|---|---|
  | NodeClient.connectedNodes | - | yes |
  | capability forgeai_watch_app, FILTER_REACHABLE | yes | yes |
  | the same, FILTER_ALL | yes, for a connected watch | - |
  | its /forge/watch-version item (0.77.0 on) | yes, with the version | - |
  | its /forge/diag item (every watch app since 5 Nov, 0.76.0 included) | yes | - |
  | the ping: /forge/watch-version-ask to every connected watch without a version item; the item appears (0.77.0+) | yes | yes |
  A watch NOT connected counts only with a diary under 7 days old (a watch he no longer owns would otherwise ask
  for ever); FILTER_ALL or a version item alone never brings in an unconnected watch. The phone's own node never
  counts. ok:false only when connectedNodes AND the reachable capability both failed and nothing was found.
  Each step is tried 3 times at most (0.5 s, 1.5 s backoff) inside a 4.5 s budget, then the ask + 2.5 s reread,
  inside the old 8 s cap. The same rules now feed "Update on watch" and F67 "Install on watch", so the Play
  Store also opens on a watch whose capability is missing. probeWatch (the rest-alert bridging) is unchanged.
- **The answer's why:** "nodes=1 capR=0 capA=0 ver=0 diag=1 asked=1 got=0" (counts; fail:<status code>; ? = no
  answer; late; timeout; paused). No node id, no watch name. The watch log head now ALWAYS says "Watch app:
  0.77.0 (read: ...)", "older than 0.77.0 (not connected) (read: ...)" or "not found (why: ...)", and "Pop-up:
  <time> <state>, <reason>" (shown / waits: phone update first / waits: workout open / waits: another pop-up /
  hidden: Later (24 hours) / hidden: Update on watch tapped for this version / waits: not on the main tabs),
  also in the console as "[watch update] ...".
- **The pop-up itself:** an 'unknown' or 'none' read is tried again after 20 s and 2 min (before: one bad read
  hid it for 6 hours). It waits while another pop-up (a question sheet, the free month's notice) is up. The
  "What's new" after a phone update is NOT a pop-up here: it is the Workout tab's "New in this version" card,
  which stays until he closes it; waiting for it could hide the watch pop-up for a whole version, so it does not.
  The phone's own update screen (UpdatePrompt) already held it (phonePopup).
- **Tests:** WearWireTest (his exact case: capability empty, diary from node X, no version item -> hasApp true,
  version null, pinged; each signal alone; a failed step is not a no; fresh-diary rule; own node; order),
  watchUpdate / watchDiag / watchUpdateCard tests (parse, the head line, the decision and its reasons).
  Cloud runs: CI 43720782230 green; device QA 43720843604 green (u438 + u336 + u401, owner profile: the offer, no
  pop-up when up to date, the not-connected step, the phone update screen, the What's new card); wear unit tests
  passed inside 43720782161 (cancelled by a later push); wear 43724579949 failed on the new capability check (the
  proof above); wear 43726710831 (after the watch fix, fa963d98): the capability check PASSES, build + both large-watch UATs
  green; the small-watch "largest text" step failed because emulator system screens (tray setup, charging) were
  in front, same failure on 43726347844 before this change; re-run of that job started, result not read yet.
  CI on fa963d98 (43726701725) red only on other helpers' rep-hint tests (R-576), already red on the 3 commits
  before it. LEFT: read the 43726710831 re-run; follow-up: probeWatch (rest-alert bridging) is still
  capability-only; the watch fix reaches his watch only with a watch release (none done).
- **Only his real watch can confirm** the pop-up shows, and his next "Add my watch's screen log" says which signal
  found it (no cloud phone can pair a real watch).
