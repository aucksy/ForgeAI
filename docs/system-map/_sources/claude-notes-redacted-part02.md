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
