# A better test system: proposals (audit step 3E / E4)

Written 18 Nov 2026. Proposals only: no test, flow or workflow was changed. Every number comes from
`docs/system-map/test-history-summary.md` (E1), `test-failures-summary.md` (E2) or `test-gate-cost.md` (E3),
window 19 Oct to 18 Nov 2026, unless a line says "outside source".

## The 3 numbers today

| Number | Today | Target | Where it comes from |
|---|---|---|---|
| Red jobs in 100 that were a test fault or a runner fault, not an app bug | **39** (483 of 1,247). Safe range 29 to 39. Of the reds that could be judged at all: 59 in 100. Another 34 in 100 could not be judged. | under 2 | E2 headline |
| Minutes to label one red run | **Not done in the run today: somebody reads logs.** The time by hand was never measured (unknown). The audit's own script labels a red run in 5 to 25 seconds, plus about 60 seconds per phone job to read the saved screen, but it is not wired into any run. | under 1 minute, with nobody reading a log | E2 "How long it takes to label one red run" |
| Minutes of one release round, all green first time | **223** (phone test on both phones 190 + release run 33). A release needed 4.1 rounds on average (median 3, worst 14); first round to published: median 8.2 hours. | under 90 | E3 headline |

Rule this file serves: a red test must mean a real app bug.

Three facts that shape everything below:

1. **The phone test is where the hours go and where nothing is learnt.** 278 red phone-test jobs: 0 proven app bugs, 13 runner faults, 22 test faults, 243 unknown; 14,702 machine minutes on the failed jobs (E1 step table, E2 per-step table).
2. **The browser journeys are mostly red for test reasons.** 308 red jobs: 176 test faults, 24 app bugs, 108 unknown (E2 "Admin journeys").
3. **The unit tests work.** Unit tests (mobile): 93 red, 81 real app bugs, 460 machine minutes (E2 per-step table).

## Proposals

### T-01 Label every red job inside the run itself  [apply]
- Problem, with our number: 429 of 1,247 red jobs (34%) could not be labelled afterwards, and the label today exists only in the audit's script, run by hand. For the phone test the reason sits in a 350 MB evidence bundle, so 243 of 278 red phone jobs stayed unknown.
- Change, in words: the last step of each test run (it runs even when the run is red) runs the labelling script on the files still on the machine and writes one table at the top of the run page: flow, label (RUNNER FAULT / TEST FAULT / APP BUG / UNKNOWN), the one failing line, and "the wanted text was on the saved screen: yes or no". On the machine the saved screen is a local file, so the 60-second download is not needed. The same rules as E2: emulator, download or port error = runner fault; wanted element on the saved screen, or found twice = test fault; passed on retry = flaky (T-03).
- Files it would touch: `docs/system-map/_tools/e2_label.py` and `e2_artifact_peek.py` (move to `scripts/ci/`), `.github/workflows/qa-device.yml`, `qa-journeys.yml`, `qa-conditions.yml`, `ci.yml`.
- Cost: about 6 hours of work. Saves: about 1 hour per release (estimate: 2 red rounds and 12.4 partial runs per release to read; our own reading time was never measured).
- Source: Slack Engineering, "Handling Flaky Tests at Scale: Auto Detection & Suppression", 5 Apr 2022 (hand triage took them about 28 minutes per failure; outside source, not our number). GitHub Engineering, "Reducing flaky builds by 18x", 16 Dec 2020 (each failure recorded with build, branch, commit).
- Risk: a wrong label is trusted. Keep UNKNOWN as a label; never print APP BUG or TEST FAULT without the proof line next to it.

### T-02 A phone flow says why it failed, and every part starts from a proven home screen  [apply]
- Problem, with our number: of 66 failed phone flows read by hand, 64 waited for a text that was not on the screen; in 11 of 24 jobs four or more flows failed together, often on the very first check (`^Workout$`, `^Profile$`, the home tabs). `^Profile$` is waited for in 73 flows, `^Workout$` in 40. That fits "the app was not where the flow expected at its start", not many separate bugs. E2 says this is not proven.
- Change, in words: (a) the phone script prints, next to `PART X FAILED`, the test tool's own failure line and whether the wanted text was on the saved screen; (b) one shared "am I on the home tabs" step runs before each part: if not, it restarts the app once, and writes a counted "start-state reset" line. A part that still cannot reach home fails with the label "start state", not as a feature failure.
- Files it would touch: `apps/mobile/qa/run-device-qa.sh`, `apps/mobile/qa/sub-back-to-tabs.yaml` (used by 34 flows), one new shared sub-flow.
- Cost: about 5 hours. Saves: about 1.8 hours per release (estimate: one red round, median 108 minutes, if the pattern is what it looks like; not proven).
- Source: our own numbers (E2 "Phone flows: what a closer look found"). No outside source needed.
- Risk: a real bug where the app does not return to home gets hidden by the restart. The reset count is printed in the run summary; more than 2 resets in a round turns the round red.

### T-03 A failed flow re-runs once on the same machine; pass on retry = "flaky", counted, not a blocker  [needs Aakash]
- Problem, with our number: 91 jobs failed and then passed on the same commit (a floor: 72 on a re-run started by hand). 46 of them carry the label "same commit passed" and cost 1,732 machine minutes. Nothing retries today: the browser tests are set to 0 retries (`apps/dashboard/playwright.config.mjs:21`) and the phone script has no retry. Worse, a whole phone round stops at the first red piece (`.github/workflows/qa-device.yml:24-26`), so one random failure throws away the round: a red round is a median 108 minutes.
- Change, in words: a failed phone part or browser test runs once more, at once, on the same machine. Pass on the retry = "flaky": written into the run summary and a flaky log, counted, and the round stays green. Fail twice = red, as today. The retry is the whole part from its clean start, never a retry wrapped around single steps inside a flow.
- Files it would touch: `apps/mobile/qa/run-device-qa.sh`, `apps/dashboard/playwright.config.mjs` (retries 1 in the cloud, keep the trace of the first failure), `.github/workflows/qa-device.yml`, `scripts/ci/phone_gate.py` (reads the flaky count), a new flaky log file.
- Cost: about 6 hours. Saves: about 1.2 hours per release (19 flaky phone-shard jobs in 30 days over 29 releases, each costing a 108-minute red round; a floor).
- Source: GitHub Engineering, "Reducing flaky builds by 18x", 16 Dec 2020 (a retry that passes keeps the build green; red builds from flaky tests went from 1 commit in 11 to 1 in 200). Playwright docs, "Retries", read 18 Nov 2026 (failed first, passed on retry = "flaky", a separate group in the report). Maestro docs, "retry", read 18 Nov 2026 (warns that retrying large parts can hide an app that works only half the time).
- Risk: a real app bug that shows up only sometimes passes on the retry. Guard: every flaky is logged with its saved screen, and T-04 forces a look at the second one.
- My view: do it. Today a random failure costs you a round and tells you nothing; a counted flaky costs seconds and leaves a record. Options: (A) retry once, flaky does not block the release, and the release notes for you list the flaky flows of that round; (B) retry once but any flaky still blocks, which only saves the reading time.

### T-04 Flaky twice in 7 days = quarantine, on a visible fix list  [needs Aakash]
- Problem, with our number: a few tests cause most of the noise. The 5 worst browser files hold 106 of the 176 test-fault reds of the browser journeys (whatsnew 38, alerts 27, newdots 15, reminders 16, assistant 10). One test alone, the notifications bell (J149), was a test fault 33 times and cost 546 machine minutes.
- Change, in words: a flow that is flaky twice in 7 days moves to a quarantine list. It still runs every time and its result is shown, but it cannot turn a round red. The list is a file in the repo, printed at the top of every run summary, with the date each flow went in. At most 5 flows may sit there, and none longer than 7 days: past either limit, the round goes red until one is fixed. Nothing is ever deleted silently.
- Files it would touch: one new quarantine list file, `scripts/ci/phone_gate.py`, `apps/mobile/qa/run-device-qa.sh`, `apps/dashboard/playwright.config.mjs`, the run-summary script from T-01.
- Cost: about 5 hours. Saves: about 1 hour per release (106 test-fault reds in 30 days is 3.7 red build checks per release, 16.6 minutes each to run again, before any fixing time).
- Source: Slack Engineering, same article, 5 Apr 2022 (automatic suppression with a ticket for the owning team: test-job failures from 57% to under 4%; they also report that getting tests back out of suppression was the hard part, which is why the list here has a size and age limit).
- Risk: a quarantined flow is a hole in what a release proves. The limits (5 flows, 7 days) keep the hole small and temporary.
- My view: do it, with the limits. Options: (A) quarantined flows keep running and are shown but do not block; (B) no quarantine, every flaky flow keeps blocking until fixed (today).

### T-05 Runner faults fix themselves and never count against the app  [apply]
- Problem, with our number: 73 red jobs were the machine, not the app or the test: 36 a failed download, 17 an emulator that did not start, 11 a setup step, 9 a busy port. "Set up Supabase CLI" failed 23 times and "Start a local Supabase" 11 times. The step "Install the Android emulator (3 tries)" failed all 3 tries in every phone log read (in 3 of 4 with `sdkmanager: command not found`), wasting about 1 minute per phone job.
- Change, in words: (a) setup steps (downloads, emulator start, database start) retry themselves up to 3 times with a pause, and a run that still fails there is labelled RUNNER FAULT and re-queued once automatically; (b) repair the emulator install step that never works; (c) keep a saved copy of the started emulator and of the database tool between runs, so fewer downloads can fail.
- Files it would touch: `.github/workflows/qa-device.yml`, `qa-journeys.yml`, `qa-conditions.yml`, `ci.yml` (the two Supabase steps), `wear-build.yml`.
- Cost: about 4 hours. Saves: about 0.5 hours per release (about 1 runner-fault red per release on the phone side: 13 phone, 5 conditions, 2 journeys, 9 builds in 30 days).
- Source: ReactiveCircus android-emulator-runner README, read 18 Nov 2026 (caching the emulator snapshot "significantly" cuts start time; it gives no figure).
- Risk: a retry hides a setup step that is truly broken. Count the retries in the run summary.

### T-06 The browser tests get the same "scroll before you check" helper the phone flows have  [apply]
- Problem, with our number: the phone side already has it (`apps/mobile/qa/sub-see.yaml` looks down, then up, then checks; used by 153 flows, 1,235 calls; enforced by `scripts/ci/flow_scroll_lint.py`). The browser side has no equal: 7 red jobs (161 machine minutes) were "the test did not bring the card into view".
- Change, in words: one shared browser helper scrolls the wanted thing into view, then checks it; a small check in the build refuses a bare "is visible" in a journey file. On the phone side: 126 of 289 flow files still contain a direct visible-check line; list which of those the scroll check allows and why (not read one by one in this step).
- Files it would touch: a new helper under `apps/dashboard/e2e/`, the journey files that check cards below the fold, one new lint script next to `scripts/ci/flow_scroll_lint.py`.
- Cost: about 3 hours. Saves: about 5 minutes per release (7 reds in 30 days).
- Source: our own fix, commit bf53a853 (E2 rule table).
- Risk: a real "missing card" bug takes a few seconds longer to fail.

### T-07 One shared tap for screens that never stand still  [apply]
- Problem, with our number: the text most often waited for and never seen in the hand-read phone failures is `Skip rest`, which only exists while a countdown runs; 18 flows wait for it. The safe tap (do not wait for a still screen) exists, but copied by hand: 133 lines in 43 flow files. Whether the other flows that tap during a countdown use it is unknown.
- Change, in words: one shared sub-flow "tap on a ticking screen" replaces the 133 hand copies, and the flow lint refuses a plain tap in any flow that starts a rest timer.
- Files it would touch: one new sub-flow, `apps/mobile/qa/sub-uat-tick.yaml`, 43 flow files, `scripts/ci/flow_scroll_lint.py`.
- Cost: about 3 hours. Saves: unknown (no number ties a red to a late tap yet; T-01 would show it).
- Source: our own helper notes (`sub-uat-tick.yaml` lines 6-8).
- Risk: almost none; it is the same tap, written once.

### T-08 One clock and one set of dates for every browser test  [apply]
- Problem, with our number: at least 33 red jobs were a test that disagreed with the clock or the calendar: 13 "wrong clock in the test" (270 machine minutes), 7 "a date pinned in the test went stale" (190), 13 on the dated new-feature test F198 (140). The browser tests already fake the clock (`playwright.config.mjs:2`), but each file carries its own times, and some read the live list of updates, which changes with every release note.
- Change, in words: every journey takes "now" from one shared fixture that pins the page's clock to one fixed moment, and the tests of dated things (What's new, new-feature dots, "5 min ago") read a fixed test list of updates instead of the live one. A new release note can then never turn a test red.
- Files it would touch: a shared fixture under `apps/dashboard/e2e/`, `whatsnew.spec.mjs`, `alerts-uat.spec.mjs`, `newdots-uat.spec.mjs`, and the other journey files that hold their own dates.
- Cost: about 5 hours. Saves: about 0.3 hours per release (33 reds in 30 days, 16.6 minutes each to run again).
- Source: Playwright docs, "Clock", read 18 Nov 2026 (fix the page's time before anything else touches it). GitHub Engineering, 16 Dec 2020 (their second retry shifts the clock forward, because wrong assumptions about time are a main cause of flaky tests).
- Risk: a real bug in how the live update list is read is no longer covered by these tests; keep one small test that reads the live list and checks only that it loads.

### T-09 A phone test build with a frozen clock  [needs Aakash]
- Problem, with our number: no number proves it yet. 243 red phone jobs are unknown, and nothing read says how many were caused by time. The phone app has no test-only clock switch today (search of `apps/mobile/src` and `apps/mobile/app`: none found).
- Change, in words: the emulator test build (never the signed release build) reads one "pretend it is this moment" setting, so a flow about streaks, weeks or "last 7 days" sees the same date on every run. A release check fails if the switch is found in the signed build.
- Files it would touch: one small clock module in the phone app, `apps/mobile/qa/run-device-qa.sh`, `.github/workflows/release-apk.yml` (the release check).
- Cost: about 8 hours, and it changes app code. Saves: unknown.
- Source: Playwright docs, "Clock" (same idea on the web side).
- Risk: a test-only switch inside the app is one more thing that could ship by mistake; the tested build then differs a little from the released one.
- My view: wait. Do T-01 first; build this only if the labels show clock-caused phone reds. Options: (A) wait for 30 days of labelled reds, then decide; (B) build it now.

### T-10 Ids instead of words where the words change  [apply]
- Problem, with our number: the phone flows find things by their words almost everywhere: 218 id lines against 2,432 tap and check lines in 289 flow files, and only 28 app source files carry a test id (54 ids). On the browser side 37 red jobs (683 machine minutes) were "found the wanted thing twice on the screen", and 16 of them were one heading, "Automatic reminders". Every wording change or second copy of a word breaks a test while the app is right.
- Change, in words: give a fixed id to the parts every flow passes through (the home tabs, Finish workout, Skip rest, Add exercise: the top of E3's "words waited for" table) and find them by id. Keep words only where the words are what the test is about. In the 5 worst browser files, find things by id or by an exact, single role.
- Files it would touch: about 20 components in `apps/mobile/src` (an invisible id each), `sub-back-to-tabs.yaml` and the shared sub-flows, the 5 browser files named in T-04.
- Cost: about 8 hours. Saves: about 0.35 hours per release on the browser side (37 reds in 30 days); the phone side is unknown until T-01 labels it.
- Source: Maestro docs, "retry" page example uses an id to find a button (read 18 Nov 2026); Playwright strict-mode errors in our own logs (E2 "The 5 failing lines").
- Risk: a test that finds a button by id no longer notices that its label is wrong; keep one wording check per screen.

### T-11 Even out the phone shards, then cut the long chain  [apply]
- Problem, with our number: a round waits for its slowest piece. Shard 6-uat-c takes a median 161.8 minutes; the shortest takes 59.4. Round = build 16.5 + 161.8 + report 1 = 179 minutes on one phone.
- Change, in words: step 1, move the free-standing parts out of shard 6 into the two short shards: the round drops to about 136 minutes. Step 2, cut the A to R chain (116 test minutes that must run in one piece today) into pieces that each load their own starting data (a load takes a median 0.8 minutes), then go to 10 shards: about 79 minutes for the phone test.
- Files it would touch: `scripts/ci/qa_shards.py`, `scripts/ci/test_qa_shards.py`, `apps/mobile/qa/run-device-qa.sh` (chain cut), `.github/workflows/qa-device.yml`.
- Cost: step 1 about 2 hours; step 2 about 10 hours. Saves: 0.7 hours per whole round after step 1, 1.7 hours after step 2.
- Source: E3 section 5 (our own measured table). Emulator runner README (start time per shard can be cut by a saved snapshot).
- Risk: 10 shards on 2 phones is 20 emulators at once plus the canaries; whether the account allows that many jobs at once was not checked (could-not-check). Each extra shard adds about 3 machine minutes of setup. A cut chain no longer proves that state carries from part A to part R; keep one weekly run of the uncut chain.

### T-12 A smaller release gate: what the change touches + a fixed smoke set; the whole round weekly  [needs Aakash]
- Problem, with our number: every release runs everything on both phones: 223 minutes when green, and 4.1 rounds per release. 20 whole phone runs (7,809 machine minutes) re-tested a phone app that had not changed at all (only the server or the web panels had).
- Change, in words: the release gate becomes: the canary (11.8 minutes today) + the parts that use what changed since the last green whole run (the existing "0-affected" piece, `qa-device.yml:21-23`) + a fixed smoke set of about 10 parts (one real workout, backup and restore, sign-in, the gym tab), on both phones. The whole round runs once a week on a timer and before any release where the change touches more parts than the affected limit. Arithmetic: build 17 + pieces of at most 40 minutes + report 1 = 58, + release run 33 = **91 minutes**; under 90 once T-14 stops the release run repeating checks.
- Files it would touch: `scripts/ci/phone_gate.py` (accept "smoke + affected" when a whole green run is at most 7 days old), `scripts/ci/qa_shards.py`, `scripts/ci/flows_to_check.py`, `.github/workflows/qa-device.yml` (weekly timer).
- Cost: about 12 hours. Saves: about 2.2 hours per green round.
- Source: Paul Hammant on martinfowler.com, "The Rise of Test Impact Analysis", 7 Aug 2017 (run only the tests a change touches: 60 to 70% time saved at Google's tool; warns the map misses tests that depend on data files, and that teams add a regular run of everything).
- Risk: a bug in a part the map thought untouched ships and is found up to 7 days late, by the weekly round. The map must treat any change to a shared file as "everything".
- My view: do it, after T-01 to T-04 have run for two weeks, so the smoke set is chosen from labelled data. Options: (A) smoke + affected for every release, whole round weekly; (B) keep the whole round for every release and only do T-11 (round about 112 minutes at best, not under 90).

### T-13 A test-only fix never re-runs the whole round  [needs Aakash]
- Problem, with our number: 47 whole phone runs (14,465 machine minutes) ran when only phone-test files, build scripts, unit tests or notes had changed since the whole run before; 6 more (1,471) ran on the very same commit. The rule that should prevent this exists (`scripts/ci/phone_gate.py:18-30`: a partial run of the fixed parts is enough when only test files changed), but it needs a whole green run at most 8 commits back, and two things defeat it: the round is cancelled at the first red piece, so often no whole green run exists to lean on; and 843 of 2,061 pushes in 30 days were notes only, so 8 commits pass in hours.
- Change, in words: (a) when a piece goes red, the other pieces finish instead of being cancelled, unless the red piece is the canary; then a test fix needs only the red piece again ("re-run failed jobs", already described at `qa-device.yml:27-29`); (b) the gate's look-back counts only commits that change the app, not notes; (c) the run summary from T-01 prints the exact partial run to start after a test fault.
- Files it would touch: `.github/workflows/qa-device.yml` (fail-fast only on the canary), `scripts/ci/phone_gate.py` and `test_phone_gate.py`.
- Cost: about 5 hours. Saves: about 2 hours per release (47 runs on 2 phones is about 23 rounds in 29 releases, 0.8 of a round each).
- Source: E3 section 4b (our own table).
- Risk: (a) undoes part of your 11 Nov "fail fast" decision: a round with a real app bug runs on and uses machine time (up to about 600 machine minutes per phone). With T-01's label the script could cancel only when the label is APP BUG.
- My view: do it. Fail-fast was right when a red meant a bug; with 0 proven app bugs in 278 red phone jobs it mostly throws away good evidence. Options: (A) cancel the round only when the canary is red or the label says APP BUG; (B) keep fail-fast as it is and change only the look-back rule.

### T-14 Pushes that change no code skip the heavy checks; the release run stops repeating them  [apply]
- Problem, with our number: the build check runs in full on every push, with no filter (`ci.yml:9-14`): 843 notes-only pushes used 13,753 machine minutes and 149 phone-test-only pushes used 2,590, out of 33,856. The release run then repeats the type checks and unit tests the build check already passed on the same commit (`release-apk.yml:107-116`), and the app is built up to 6 times per release.
- Change, in words: a push that touches only notes runs a 1-minute check that reports green; a push that touches only phone-test files runs the two flow lints and nothing else. The release run trusts the green build check the gate already demands and skips its own copy. The journeys run uses the test build the phone run already made.
- Files it would touch: `.github/workflows/ci.yml`, `release-apk.yml`, `qa-journeys.yml`, `scripts/ci/phone_gate.py` (it waits for the build check on the release commit).
- Cost: about 5 hours. Saves: about 270 machine hours a month; minutes off the 33-minute release run are unknown (step times are not in the data).
- Source: E3 section 4a and 4b (our own tables).
- Risk: a "notes-only" push that in fact changes something the app reads (the help library check reads notes: it failed rightly 29 times). The filter must list such files as code.

### T-15 Screen checks as component tests, the emulator only for what needs a phone  [needs Aakash]
- Problem, with our number: per machine minute the two tools are far apart. Unit tests (mobile): 81 real app bugs found for 460 machine minutes on red jobs. Phone flows: 0 proven app bugs for 14,702. One existing unit test of a screen ("the tag row wraps at 360 dp and font 1.3") caught 20 real bugs for 75 minutes. A whole phone round is 1,260 machine minutes, and 3 history flows check the same words (50 to 90% overlap).
- Change, in words: a pilot, not a switch. Pick 5 emulator flows that only check what a screen shows (labels, light and dark looks, new-feature dots, the What's new card). Write the same checks as component tests that draw the screen in the unit-test run at 360 dp and font 1.3. Run both for two weeks and compare: reds, labels, minutes. Keep the emulator for what only a phone can prove: alerts with the screen off, backup, upgrade, a real workout, the keyboard. No flow is retired before you see the comparison. The browser tool stays: its reds are selectors and clocks (T-08, T-10), not the tool.
- Files it would touch: 5 new test files under `apps/mobile/test/`; no flow removed in the pilot.
- Cost: about 10 hours for the pilot. Saves: unknown until the pilot; the ceiling is the 163-minute shard 6 leaving the round.
- Source: Google Testing Blog, Mike Wacker, "Just Say No to More End-to-End Tests", 22 Apr 2015 (many small tests, few end-to-end ones, because the big ones are slow, flaky and do not say where the fault is; the article body could not be read here, the 70/20/10 split is taken from its comments).
- Risk: a component test draws a screen without a real phone around it: it cannot see the keyboard covering a field or the status bar. Your own rule "green CI is not a working screen" applies; that is why the pilot runs both.
- My view: run the pilot. The numbers say the emulator is being used for jobs a 1-second test does better. Options: (A) pilot 5 flows for two weeks, then decide with numbers; (B) leave the split as it is.

## Order to do them in

T-01 and T-02 first (everything else needs the labels), then T-03, T-05, T-13, T-11 step 1, then T-04, T-08, T-10, T-14, then T-12 and T-15 with two weeks of labelled data. T-09 waits.

## Could not check, and why

- **Our own time to label a red run by hand**: never measured; only the script's time is known.
- **How many jobs the GitHub account may run at once, and whether its minutes are billed**: not in the input files. T-11 step 2 and T-12 need it.
- **Whether phone reds are caused by time or by late taps**: 243 phone reds are unknown; T-07 and T-09 rest on that gap.
- **Which of the 126 flow files with a direct visible-check are allowed by the scroll lint**: not read one by one.
- **Minutes the release run spends repeating checks**: step times are not in the data.
- **Outside sources**: the body of the two Google Testing Blog posts (27 May 2016, flaky tests; 22 Apr 2015, end-to-end tests) could not be read, only their titles, dates and comments, so no figure from them is used as proof. Pages read: 9.
- **The savings below are estimates from 30 days of our numbers, and they overlap**: T-02, T-03, T-05 and T-13 all remove red rounds, so the column must not be added up.

## Summary table

| Proposal | Hours saved per release | Cost |
|---|---|---|
| T-01 Label every red job in the run [apply] | about 1 (estimate) | 6 h |
| T-02 Flow says why + proven home start [apply] | about 1.8 (if the pattern holds) | 5 h |
| T-03 Retry once, flaky counted [needs Aakash] | about 1.2 (a floor) | 6 h |
| T-04 Quarantine after 2 flaky in 7 days [needs Aakash] | about 1 | 5 h |
| T-05 Runner faults fix themselves [apply] | about 0.5 | 4 h |
| T-06 Browser scroll-before-check helper [apply] | about 0.1 | 3 h |
| T-07 One tap for ticking screens [apply] | unknown | 3 h |
| T-08 One clock and fixed dates, browser [apply] | about 0.3 | 5 h |
| T-09 Frozen clock in the phone test build [needs Aakash] | unknown | 8 h |
| T-10 Ids instead of words [apply] | about 0.35 (browser side only) | 8 h |
| T-11 Even shards, then cut the chain [apply] | 0.7, then 1.7 per whole round | 2 h, then 10 h |
| T-12 Smaller gate: affected + smoke, weekly whole round [needs Aakash] | about 2.2 per green round | 12 h |
| T-13 Test-only fix never re-runs the round [needs Aakash] | about 2 | 5 h |
| T-14 No-code pushes skip heavy checks [apply] | unknown for the release; 270 machine hours a month | 5 h |
| T-15 Component-test pilot [needs Aakash] | unknown until the pilot | 10 h |
