## Phone flows: what a closer look found (hand-read, 18 Nov 2026)

The phone job log names the flow that failed (`[qa] PART UAT15 FAILED (uat-rel-15-inuse-journey.yaml: ...)`) but never says WHY.
The reason is inside the run's `qa-out` artifact (about 350 MB each): `part-<x>.log` holds one line from the test tool, and
`<x>-hierarchy.json` holds what was on the screen. `docs/system-map/_tools/e2_artifact_peek.py` reads just those two small files
out of the artifact without downloading it.

Read this way: 24 red phone jobs (the two newest for each of the 12 most-failing unlabelled flows), 66 failed flows in them.

- 64 of 66: the text the flow waited for was **not on the screen**. That rules out the easy "test fault" proof; it does not say
  whether the app was wrong, the flow was out of date, or the emulator was slow. These jobs stay UNKNOWN, now with their real
  failure line in `log_line`.
- 2 of 66: the wanted text **was** on the screen (`uat-rel-f146-share-gym.yaml`, wanted `^Share picture$`, runs 41902368034 and
  41893668534, jobs 126839559454 and 126806290149). That flow is a test fault in those runs; the jobs stay UNKNOWN because two
  other flows failed in them too.
- 1 job (132582083041) could not be read (the file inside the artifact did not unpack).
- What the 66 failures say: 42 "X is visible" was false, 15 "no visible element found", 3 "X is not visible" was false, 3
  "element not found", 3 other. Most often waited for and never seen: `Skip rest`, `^Workout$`, `^Profile$`.
- Seen in most of the 24 jobs: several flows fail together in one job (4 or more in 11 of them), often on the first check of
  the flow (`^Workout$`, `^Profile$` = the home tabs). That pattern fits "the app was not where the flow expected at its start"
  more than many separate bugs, but nothing read here proves it.

## How long it takes to label one red run

`python docs/system-map/_tools/e2_label.py one <job_id> --cache <folder>` downloads the log, cuts it down and labels it:
**3 to 9 seconds per job** on this laptop (measured on jobs 134666456985, 133807729682, 133133535995: 8.6 s, 3.4 s, 2.9 s).
A red run has 1 to 3 failed jobs, so **about 5 to 25 seconds per red run**. The whole 30 days (1,253 logs, about 2 GB read and
thrown away, 67 MB kept while working) took about 25 minutes with 8 downloads side by side. A phone flow's real reason costs
about 60 seconds more per job (`e2_artifact_peek.py`).

## What could not be labelled, and why

- **Phone test (qa-device.yml), 243 jobs, about 12,500 machine minutes.** The job log has the flow name but not the reason,
  and a phone run is started by hand on one commit, so there is no "next push went green" to compare with. Only three things
  can be proved from here: the emulator died (runner fault), the same commit passed elsewhere (test fault), or the wanted text
  was on the screen (needs the artifact). Everything else is UNKNOWN.
- **Admin journeys, 108 jobs.** The log gives the exact failing line, but the commit that turned it green changed the app code
  AND the same spec file (or the red was a one-off), so the log cannot say which side was wrong. Four such groups were settled
  by reading the fix commit (40 jobs, all test faults); the rest were not read.
- **Cross-role journeys (10), phone conditions (6), watch checks (22), others (about 40).** Same reason as the phone test: a
  step name, no reason in the job log.
- **2 jobs have no log on GitHub** (runs 42671525099 and 43187328562): no failed step was recorded for them either.

## How to read the labels (limits)

- Every label names its rule in `rule_that_fired`; the text after ` -- ` is the proof (the run that passed, the two commits compared).
- "Next run where it passed" = the next push on the same branch where the job was green, or was red only for OTHER tests.
- TEST FAULT rule T4 comes in two strengths. Strong: between the red and the pass, no app code changed at all. Weaker: only
  tests, notes or another app's code changed (for example a dashboard test went green while only phone-app code changed).
  The weaker one can be wrong when a test reads a file of another app.
- APP BUG rule A1 is the brief's rule ("a later commit touching app code turned it green"). It is strongest when the failing
  test file was left unchanged, weaker when the test file changed in the same stretch: the summary shows both.
- Lint, ratchet and type failures count as APP BUG (the code broke a rule), except type errors that sit only in test files and
  the two checks that lint the phone-test files themselves (TEST FAULT).
- A release check that only says "run the phone test on this commit first" is an ECHO, counted apart.
- Passing jobs were not downloaded. So "this flow passed on the same commit" (T2) can only be seen inside other RED jobs:
  the flaky count is a floor.
- Nothing here was re-run. No test, flow or workflow was changed.
