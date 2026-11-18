# Why the tests went red, last 30 days (audit step 3E / E2)

Made by `docs/system-map/_tools/e2_label.py` from `docs/system-map/test-history.csv` and the job logs on GitHub (`aucksy/ForgeAI`).
One row per failed job, with its run id, job id and the log line it was judged on: `docs/system-map/test-failures.jsonl`.

## Headline

**483 of 1247 red jobs were not app bugs (39%).** 73 were a runner fault (the machine, the network, the emulator) and 410 a test fault (the test failed while the app was right, or it passed again with no app change).

- How sure: 121 of the 410 test faults rest on the weaker rule "went green while only tests, notes or ANOTHER app's code changed"; without them it is **362 of 1247 (29%)**. So the honest range is 29% to 39%, and it can only go up: every UNKNOWN is a red nobody could tie to an app bug either.
- App bug (the red was right): **333** (27%). 113 of these are the weaker kind too: the fix changed the app code AND the failing test file in one go, so the test may simply have been brought up to date.
- Could not be told from the log: **429 UNKNOWN** (34%).
- Log no longer on GitHub: **2 NO LOG KEPT**.
- Of the 816 jobs that could be judged, 483 were not app bugs (59%).
- Not in these numbers: 365 echo jobs (a job that only repeats another job's red: 359 `report` / `phone-gate` jobs skipped unread, 6 release checks whose log says only "run the phone test on this commit first").
- 63 labels were set by reading the log by hand (rule starts with `HAND`); the rest by rule.

| Label | Jobs | Share of 1247 | Machine minutes | What it means |
|---|---|---|---|---|
| RUNNER FAULT | 73 | 6% | 354 | the machine, network, emulator or a setup step failed |
| TEST FAULT | 410 | 33% | 7,152 | the test was wrong or random; the app was fine |
| APP BUG | 333 | 27% | 1,957 | the test caught a real mistake in the app's code |
| UNKNOWN | 429 | 34% | 15,956 | the job log does not say enough |
| NO LOG KEPT | 2 | 0% | 0 | GitHub no longer has the log |
| ECHO | 6 | - | 133 | only repeats another red (not counted) |

## Which rule decided

| Label | Rule | Jobs | Minutes |
|---|---|---|---|
| RUNNER FAULT | R: network or download failed | 36 | 126 |
| RUNNER FAULT | R: emulator did not boot or device offline | 17 | 214 |
| RUNNER FAULT | R: a setup step failed | 11 | 8 |
| RUNNER FAULT | R: port in use | 9 | 7 |
| TEST FAULT | T4: went green with no change to the app code this step tests (only tests, notes, or another app's code) | 121 | 915 |
| TEST FAULT | T4: went green with no app code changed at all (only tests, test tools or notes) | 109 | 1,757 |
| TEST FAULT | T3: Playwright strict mode violation (the wanted element was on screen, more than once) | 37 | 683 |
| TEST FAULT | T1: same commit passed this job on a re-run (no code change) | 33 | 1,191 |
| TEST FAULT | T6: every type error is in a test file | 30 | 178 |
| TEST FAULT | T5: the failed check lints the phone-test files themselves | 21 | 6 |
| TEST FAULT | T1: same commit passed this job on another run of it (no code change) | 13 | 541 |
| TEST FAULT | HAND: wrong clock in the test: read one log (run 43565878978) and the fix, commit b6cf9f97 'alerts journey reads the page's own clock', which changes only the spec so its times come from the page's clock; no app code in that commit | 13 | 270 |
| TEST FAULT | HAND: stale expectation: read one log (run 43576089586) and the fix, commit 23eac447, which changes the spec's count from 1 to 2 because the new 14 Nov feature rightly lights a second dot; the app showed what it was built to show | 13 | 281 |
| TEST FAULT | HAND: test did not bring the card into view: read one log (run 43594657561) and the fix, commit bf53a853 'fix the red demo screen test', which makes the spec scroll every card into view before looking (the tag loads only near the screen) | 7 | 161 |
| TEST FAULT | HAND: a date pinned in the test went stale: read one log (run 43737944737) and the fix, commit 5b886cd5 'the bell test reads the 15 Nov update (was 14 Nov)', which changes only the spec | 7 | 190 |
| TEST FAULT | T2: every failed flow ran clean on the same commit in another job | 6 | 978 |
| APP BUG | A1: unit/database test went green after app code changed; the failing test file was also changed | 113 | 649 |
| APP BUG | A1: unit/database test went green after app code changed; the failing test file was unchanged | 92 | 630 |
| APP BUG | A0: lint / ratchet / release check failed | 70 | 85 |
| APP BUG | A0: type error | 34 | 181 |
| APP BUG | A2: browser journey red 2+ runs in a row, went green after app code changed with the spec file unchanged | 14 | 271 |
| APP BUG | A0: compile error | 10 | 139 |
| UNKNOWN | no rule matched | 286 | 12,113 |
| UNKNOWN | no rule matched: went green after app code changed, spec also changed, red 2+ runs in a row | 84 | 1,830 |
| UNKNOWN | no rule matched: went green after app code changed, spec unchanged, a one-off red | 13 | 195 |
| UNKNOWN | no rule matched: no later green run of this job on its branch | 10 | 56 |
| UNKNOWN | no rule matched: went green after app code changed, spec also changed, a one-off red | 7 | 148 |
| UNKNOWN | no rule matched: went green after app code changed, spec not named, red 2+ runs in a row | 6 | 154 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 41395559723: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 8 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 41467000998: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 8 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 41893668534: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 45 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 41902368034: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 47 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 41988654066: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 37 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 41988716247: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 42 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 41997519660: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 58 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 42001465285: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 73 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 42001468763: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 64 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 42007309172: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 68 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 42008396524: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 109 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 42014586705: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 80 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 42042517157: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 101 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 42042522492: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 123 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 42059791344: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 24 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 42099510423: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 148 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 42099515859: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 137 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 42506479727: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 60 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 42506481894: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 51 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 43562670140: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 10 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 43566434502: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 104 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 43753637769: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 29 |
| UNKNOWN | HAND: read the flow's own log and screen dump inside the qa-out artifact of run 43753639925: the wanted text was NOT on screen, so this is not a proven test fault; app bug or stale flow, the log cannot say | 1 | 32 |
| NO LOG KEPT | GitHub gave no log for this job | 2 | 0 |
| ECHO | E: a release gate that only repeats 'no green phone test on this commit yet' | 6 | 133 |

## Per workflow and failed step

| Workflow | Failed step | Jobs | Runner fault | Test fault | App bug | Unknown | No log | Not app bug % of judged |
|---|---|---|---|---|---|---|---|---|
| ci.yml | Admin journeys (phone, real forms) | 308 | 0 | 176 | 24 | 108 | 0 | 88% |
| qa-device.yml | Run the workout QA on an emulator | 278 | 13 | 22 | 0 | 243 | 0 | 100% |
| ci.yml | Security check and feature tests | 103 | 0 | 58 | 38 | 7 | 0 | 60% |
| ci.yml | Unit tests (mobile) | 93 | 0 | 11 | 81 | 1 | 0 | 12% |
| ci.yml | Panel Worker tests | 87 | 0 | 44 | 42 | 1 | 0 | 51% |
| ci.yml | Unit tests (dashboard/CRM) | 40 | 0 | 5 | 35 | 0 | 0 | 12% |
| ci.yml | Typecheck (mobile) | 39 | 0 | 17 | 22 | 0 | 0 | 44% |
| ci.yml | Help library covers every screen | 29 | 0 | 0 | 29 | 0 | 0 | 0% |
| ci.yml | Typecheck (dashboard/CRM) | 25 | 0 | 13 | 12 | 0 | 0 | 52% |
| ci.yml | Set up Supabase CLI | 23 | 23 | 0 | 0 | 0 | 0 | 100% |
| ci.yml | Silent-catch ratchet | 22 | 0 | 0 | 22 | 0 | 0 | 0% |
| qa-device.yml | Build an emulator APK (x86_64) | 18 | 8 | 7 | 0 | 3 | 0 | 100% |
| qa-journeys.yml | Run the cross-role journeys | 17 | 2 | 5 | 0 | 10 | 0 | 100% |
| ci.yml | Panel crawl (every page, phone + computer, dark theme) | 17 | 0 | 13 | 0 | 4 | 0 | 100% |
| ci.yml | Promise ratchet | 14 | 0 | 0 | 14 | 0 | 0 | 0% |
| ci.yml | HQ Worker and page tests | 13 | 0 | 12 | 1 | 0 | 0 | 92% |
| ci.yml | Phone-test files parse | 12 | 0 | 12 | 0 | 0 | 0 | 100% |
| qa-conditions.yml | Run the phone conditions | 11 | 5 | 0 | 0 | 6 | 0 | 100% |
| ci.yml | Start a local Supabase (applies every migration) | 11 | 11 | 0 | 0 | 0 | 0 | 100% |
| ci.yml | Unit tests (mobile, TZ=America/New_York) | 10 | 0 | 2 | 8 | 0 | 0 | 20% |
| ci.yml | Phone-test scroll lint | 9 | 0 | 9 | 0 | 0 | 0 | 100% |
| wear-build.yml | Watch unit tests + watch screens (rendered) | 8 | 0 | 0 | 0 | 8 | 0 | - |
| wear-build.yml | Workout dims after interruptions (Always-on screen on) | 7 | 0 | 0 | 0 | 7 | 0 | - |
| wear-build.yml | Workout keeps MettleUp in front (Always-on screen off) | 5 | 2 | 0 | 0 | 3 | 0 | 100% |
| owner-ads.yml | Probe lengths (video vs audio) | 5 | 0 | 0 | 0 | 5 | 0 | - |
| watch.yml | New kinds of crash -> one issue each | 4 | 0 | 0 | 0 | 4 | 0 | - |
| wear-build.yml | Workout dims with Always-on display OFF (the app dims itself) | 4 | 0 | 0 | 0 | 4 | 0 | - |
| wear-build.yml | The largest text on the small watch (real app) | 4 | 4 | 0 | 0 | 0 | 0 | 100% |
| store-shots.yml | Take the screens | 3 | 3 | 0 | 0 | 0 | 0 | 100% |
| release-apk.yml | The tag's What's new file | 3 | 0 | 0 | 3 | 0 | 0 | 0% |
| release-apk.yml | Upload to Play (internal + closed testing) | 3 | 0 | 3 | 0 | 0 | 0 | 100% |
| ios.yml | Every picture is there | 3 | 0 | 0 | 0 | 3 | 0 | - |
| qa-journeys.yml | Build an emulator APK (x86_64) | 2 | 1 | 1 | 0 | 0 | 0 | 100% |
| release-apk.yml | Upload the watch app to Play (Wear OS internal testing) | 2 | 0 | 0 | 0 | 2 | 0 | - |
| ios.yml | Build for the iPhone simulator | 2 | 0 | 0 | 0 | 2 | 0 | - |
| wear-build.yml | The watch APK still declares its capability (after resource shrinking) | 2 | 0 | 0 | 2 | 0 | 0 | 0% |
| play-upload.yml | Upload to Play (internal + closed testing) | 1 | 0 | 0 | 0 | 1 | 0 | - |
| play-upload.yml | Upload the watch app to Play (Wear OS internal testing) | 1 | 0 | 0 | 0 | 1 | 0 | - |
| whatsapp-setup.yml | (c) Put WHATSAPP_TOKEN into the panel Worker | 1 | 0 | 0 | 0 | 1 | 0 | - |
| voice-samples.yml | Run python gen_magpie.py | 1 | 0 | 0 | 0 | 1 | 0 | - |
| final-voice.yml | Run python final_chatterbox.py refs/hf_beta.wav final "03-own-app,06-progress" | 1 | 0 | 0 | 0 | 1 | 0 | - |
| ci.yml | (no failed step recorded) | 1 | 0 | 0 | 0 | 0 | 1 | - |
| qa-device.yml | Get every shard's evidence | 1 | 1 | 0 | 0 | 0 | 0 | 100% |
| qa-device.yml | (no failed step recorded) | 1 | 0 | 0 | 0 | 0 | 1 | - |
| exercise-clips.yml | Stills machine_lat_pulldown (exercise pictures + checks) | 1 | 0 | 0 | 0 | 1 | 0 | - |
| exercise-clips.yml | Stills iso_lateral_low_row (exercise pictures + checks) | 1 | 0 | 0 | 0 | 1 | 0 | - |
| exercise-clips.yml | Stills iso_lateral_row (exercise pictures + checks) | 1 | 0 | 0 | 0 | 1 | 0 | - |

## Top 15 flows by test-fault and flaky count

A flow here is one phone flow file, one journey step, one browser spec or one unit test. "Flaky" = it passed on the same commit
(rules T1, T2). "Test fault" = the other TEST FAULT rules. When a job failed in several flows its minutes are split evenly.

| # | Flow | Flaky | Test fault | Minutes lost on those | All red jobs with this flow | ...of which unknown | Example run / job |
|---|---|---|---|---|---|---|---|
| 1 | ci: e2e/whatsnew.spec.mjs › J149 Notifications bell: counts new updates, opens with a short What is new summary, marks them seen | 0 | 33 | 546 | 50 | 13 | 43740195697 / 132891442065 |
| 2 | ci: supabase/tests/security.sql | 0 | 24 | 33 | 40 | 7 | 43817737306 / 133133535995 |
| 3 | ci: node test: Gemini fails (error, timeout, bad JSON, cut short) -> Claude, with a log line each time (first of several failed in the job) | 0 | 18 | 99 | 30 | 1 | 39920541712 / 120304425802 |
| 4 | ci: e2e/reminders.spec.mjs › J38b the front desk can look at the automatic reminders but not change them | 0 | 16 | 184 | 16 | 0 | 39974926516 / 120486909026 |
| 5 | ci: node test: GitHub down after one good answer: the kept copy is served | 0 | 15 | 158 | 15 | 0 | 42589174469 / 129066283786 |
| 6 | ci: e2e/alerts-uat.spec.mjs › Latest from your members on a computer, light theme; payments and joins; the desk who trains | 5 | 9 | 315 | 22 | 8 | 44264776182 / 134666456985 |
| 7 | ci: e2e/alerts-uat.spec.mjs › Gym alerts: not ready, the latest on Today, a new one rings once, a tap opens its page | 0 | 13 | 207 | 13 | 0 | 43567839667 / 132365480147 |
| 8 | ci: (Panel crawl (every page, phone + computer, dark theme)) | 0 | 13 | 181 | 17 | 4 | 43039545112 / 130613445242 |
| 9 | ci: e2e/newdots-uat.spec.mjs › F198 time: 5 Nov features end on 5 Dec, the 6 Nov ones on 6 Dec, Trainers (7 Nov) on 7 Dec | 0 | 13 | 140 | 18 | 5 | 43579354395 / 132400539610 |
| 10 | ci: (Phone-test files parse) | 0 | 12 | 3 | 12 | 0 | 43206975584 / 131144500685 |
| 11 | ci: e2e/settings.spec.mjs › J10a Dark/Light: the colours change, and the choice is kept after a reload | 0 | 10 | 240 | 12 | 2 | 43731590713 / 132865010740 |
| 12 | ci: e2e/r579-uat.spec.mjs › R579-1 the member page: "Share app link" for every member, the smart link and the gym code, phone and computer, ligh | 1 | 8 | 137 | 13 | 4 | 44253299398 / 134628915470 |
| 13 | ci: e2e/demo-showcase-uat.spec.mjs › the sales demo, as the owner | 0 | 9 | 92 | 11 | 2 | 43611174825 / 132496327618 |
| 14 | ci: (Phone-test scroll lint) | 0 | 9 | 4 | 9 | 0 | 43748144513 / 132915910617 |
| 15 | ci: test/tracker/r350SimpleRule.test.ts TS2551 | 0 | 8 | 20 | 8 | 0 | 43724941023 / 132844728094 |

### Top 15 flows by red jobs of any label (for the flows nobody could judge)

| # | Flow | Red jobs | Runner | Test fault | App bug | Unknown | Minutes (split) |
|---|---|---|---|---|---|---|---|
| 1 | ci: e2e/whatsnew.spec.mjs › J149 Notifications bell: counts new updates, opens with a short What is new summary, marks them seen | 50 | 0 | 33 | 4 | 13 | 775 |
| 2 | ci: supabase/tests/security.sql | 40 | 0 | 24 | 9 | 7 | 51 |
| 3 | ci: node test: Gemini fails (error, timeout, bad JSON, cut short) -> Claude, with a log line each time (first of several failed in the job) | 30 | 0 | 18 | 11 | 1 | 159 |
| 4 | qa-device: part R | 26 | 0 | 1 | 0 | 25 | 1,595 |
| 5 | ci: e2e/alerts-uat.spec.mjs › Latest from your members on a computer, light theme; payments and joins; the desk who trains | 22 | 0 | 14 | 0 | 8 | 419 |
| 6 | ci: test/tracker/auditC1LiveWorkout.test.ts > C1-9: the card's tag row wraps at 360 dp and font 1.3 > the muscle badge, superset badge and rest  | 20 | 0 | 0 | 20 | 0 | 75 |
| 7 | ci: node test: each text is at most 120 words | 19 | 0 | 0 | 19 | 0 | 199 |
| 8 | qa-device: uat-rel-r355-a-last-set.yaml | 18 | 0 | 0 | 0 | 18 | 258 |
| 9 | ci: e2e/newdots-uat.spec.mjs › F198 time: 5 Nov features end on 5 Dec, the 6 Nov ones on 6 Dec, Trainers (7 Nov) on 7 Dec | 18 | 0 | 13 | 0 | 5 | 192 |
| 10 | ci: e2e/reminders.spec.mjs › J38b the front desk can look at the automatic reminders but not change them | 16 | 0 | 16 | 0 | 0 | 184 |
| 11 | ci: test/backup/backupCoverage.test.ts > every stored thing is in the backup or left out on purpose > meta keys | 16 | 0 | 0 | 16 | 0 | 63 |
| 12 | ci: e2e/member-messages-uat.spec.mjs › Member messages: not ready, the list, types, reply, done, the desk, a gone message | 16 | 0 | 6 | 2 | 8 | 217 |
| 13 | ci: test/backup/backupCoverage.test.ts > every stored thing is in the backup or left out on purpose > AsyncStorage keys, saved stores, the key-v | 15 | 0 | 0 | 15 | 0 | 51 |
| 14 | ci: node test: GitHub down after one good answer: the kept copy is served | 15 | 0 | 15 | 0 | 0 | 158 |
| 15 | qa-device: uat-rel-f61-ask-ai.yaml | 14 | 0 | 1 | 0 | 13 | 579 |

## CI step "Admin journeys (phone, real forms)"

308 red jobs, 6,388 machine minutes.

| Label | Jobs | Share |
|---|---|---|
| TEST FAULT | 176 | 57% |
| APP BUG | 24 | 8% |
| UNKNOWN | 108 | 35% |

### The 5 specs that failed most

| # | Spec file | Red jobs | Runner | Test fault | App bug | Unknown |
|---|---|---|---|---|---|---|
| 1 | e2e/whatsnew.spec.mjs | 55 | 0 | 38 | 4 | 13 |
| 2 | e2e/alerts-uat.spec.mjs | 35 | 0 | 27 | 0 | 8 |
| 3 | e2e/assistant-uat.spec.mjs | 24 | 0 | 10 | 0 | 14 |
| 4 | e2e/newdots-uat.spec.mjs | 21 | 0 | 15 | 0 | 6 |
| 5 | e2e/reminders.spec.mjs | 17 | 0 | 16 | 0 | 1 |

### The 5 failing lines seen most

The line Playwright stopped at (first failure of the job), with line numbers removed so the same line counts once.

| # | Failing line | Red jobs | Labels | Example run / job |
|---|---|---|---|---|
| 1 | `Error: expect.toBeVisible: Error: strict mode violation: getByRole('heading', { name: 'Automatic reminders' }) resolved to 2 elements: / > await expect(desk.getByRole('heading', { name: 'Automatic reminders' })).toBeVisible({ time` | 16 | TEST FAULT 16 | 39974926516 / 120486909026 |
| 2 | `Error: expect(locator).toHaveCount(expected) failed / Locator: getByRole('main').getByTestId('latest-alerts').getByRole('button') / > await expect(lines).toHaveCount(2, { timeout: 10_000 });` | 16 | TEST FAULT 14, UNKNOWN 2 | 44264776182 / 134666456985 |
| 3 | `Error: expect(locator).toContainText(expected) failed / Locator: getByRole('main').getByTestId('latest-alerts').getByRole('button').first() / > await expect(lines.nth(0)).toContainText('5 min ago');` | 13 | TEST FAULT 13 | 43567839667 / 132365480147 |
| 4 | `Error: expect(locator).toHaveCount(expected) failed / Locator: getByRole('main').locator('[data-new-dot]') / > await expect(dot(page.getByRole('main'))).toHaveCount(1);` | 13 | TEST FAULT 13 | 43579354395 / 132400539610 |
| 5 | `Error: expect(locator).toBeVisible() failed / Locator: getByRole('heading', { name: 'Today', exact: true }) / > await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });` | 12 | TEST FAULT 11, UNKNOWN 1 | 41109463634 / 124247816176 |

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

