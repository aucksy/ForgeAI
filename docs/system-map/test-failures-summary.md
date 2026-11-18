# Why the tests went red, last 30 days (audit step 3E / E2)

Made by `docs/system-map/_tools/e2_label.py` from `docs/system-map/test-history.csv` and the job logs on GitHub (`aucksy/ForgeAI`).
One row per failed job, with its run id, job id and the log line it was judged on: `docs/system-map/test-failures.jsonl`.

## Headline

**133 of 1248 red jobs were not app bugs (11%).** 36 were a runner fault (the machine, the network, the emulator) and 97 a test fault (the test failed while the app was right, or it passed again with no app change).

- App bug (the red was right): **152** (12%).
- Could not be told from the log: **187 UNKNOWN** (15%).
- Log no longer on GitHub: **776 NO LOG KEPT**.
- Of the 285 jobs that could be judged, 133 were not app bugs (47%).
- Not in these numbers: 364 echo jobs (a job that only repeats another job's red: 359 `report` / `phone-gate` jobs skipped unread, 5 release checks whose log says only "run the phone test on this commit first").
- 0 labels were set by reading the log by hand (rule starts with `HAND`); the rest by rule.

| Label | Jobs | Share of 1248 | Machine minutes | What it means |
|---|---|---|---|---|
| RUNNER FAULT | 36 | 3% | 211 | the machine, network, emulator or a setup step failed |
| TEST FAULT | 97 | 8% | 2,434 | the test was wrong or random; the app was fine |
| APP BUG | 152 | 12% | 700 | the test caught a real mistake in the app's code |
| UNKNOWN | 187 | 15% | 7,859 | the job log does not say enough |
| NO LOG KEPT | 776 | 62% | 14,246 | GitHub no longer has the log |
| ECHO | 5 | - | 102 | only repeats another red (not counted) |

## Which rule decided

| Label | Rule | Jobs | Minutes |
|---|---|---|---|
| RUNNER FAULT | R: network or download failed | 24 | 103 |
| RUNNER FAULT | R: emulator did not boot or device offline | 9 | 105 |
| RUNNER FAULT | R: port in use | 3 | 3 |
| TEST FAULT | T4: went green with no app code changed | 38 | 619 |
| TEST FAULT | T1: same commit passed this job on a re-run (no code change) | 22 | 840 |
| TEST FAULT | T3: Playwright strict mode violation (the wanted element was on screen, more than once) | 21 | 327 |
| TEST FAULT | T1: same commit passed this job on another run (no code change) | 12 | 529 |
| TEST FAULT | T2: every failed flow ran clean on the same commit in another job  | 2 | 107 |
| TEST FAULT | T6: every type error is in a test file | 1 | 10 |
| TEST FAULT | T5: the failed check lints the phone-test files themselves | 1 | 0 |
| APP BUG | A1 | 116 | 577 |
| APP BUG | A0: lint / ratchet / release check failed | 20 | 17 |
| APP BUG | A0: type error | 13 | 80 |
| APP BUG | A2: red 2 runs in a row, went green after app code changed with the spec file unchanged | 3 | 26 |
| UNKNOWN | no rule matched | 187 | 7,859 |
| NO LOG KEPT | GitHub answered nothing for the job log | 776 | 14,246 |
| ECHO | E: a release gate that only repeats 'no green phone test on this commit yet' | 5 | 102 |

## Per workflow and failed step

| Workflow | Failed step | Jobs | Runner fault | Test fault | App bug | Unknown | No log | Not app bug % of judged |
|---|---|---|---|---|---|---|---|---|
| ci.yml | Admin journeys (phone, real forms) | 308 | 0 | 58 | 3 | 46 | 201 | 95% |
| qa-device.yml | Run the workout QA on an emulator | 278 | 6 | 15 | 0 | 108 | 149 | 100% |
| ci.yml | Security check and feature tests | 103 | 0 | 9 | 31 | 7 | 56 | 22% |
| ci.yml | Unit tests (mobile) | 93 | 0 | 1 | 31 | 0 | 61 | 3% |
| ci.yml | Panel Worker tests | 87 | 0 | 1 | 33 | 1 | 52 | 3% |
| ci.yml | Unit tests (dashboard/CRM) | 40 | 0 | 1 | 5 | 0 | 34 | 17% |
| ci.yml | Typecheck (mobile) | 39 | 0 | 0 | 7 | 0 | 32 | 0% |
| ci.yml | Help library covers every screen | 29 | 0 | 0 | 3 | 0 | 26 | 0% |
| ci.yml | Typecheck (dashboard/CRM) | 25 | 0 | 1 | 6 | 0 | 18 | 14% |
| ci.yml | Set up Supabase CLI | 23 | 15 | 0 | 0 | 0 | 8 | 100% |
| ci.yml | Silent-catch ratchet | 22 | 0 | 0 | 8 | 0 | 14 | 0% |
| qa-device.yml | Build an emulator APK (x86_64) | 18 | 1 | 2 | 0 | 0 | 15 | 100% |
| qa-journeys.yml | Run the cross-role journeys | 17 | 2 | 5 | 0 | 9 | 1 | 100% |
| ci.yml | Panel crawl (every page, phone + computer, dark theme) | 17 | 0 | 0 | 0 | 4 | 13 | - |
| ci.yml | Promise ratchet | 14 | 0 | 0 | 8 | 0 | 6 | 0% |
| ci.yml | HQ Worker and page tests | 13 | 0 | 0 | 6 | 0 | 7 | 0% |
| ci.yml | Phone-test files parse | 12 | 0 | 0 | 0 | 0 | 12 | - |
| qa-conditions.yml | Run the phone conditions | 11 | 5 | 0 | 0 | 5 | 1 | 100% |
| ci.yml | Start a local Supabase (applies every migration) | 11 | 3 | 0 | 0 | 0 | 8 | 100% |
| ci.yml | Unit tests (mobile, TZ=America/New_York) | 10 | 0 | 0 | 10 | 0 | 0 | 0% |
| ci.yml | Phone-test scroll lint | 9 | 0 | 1 | 0 | 0 | 8 | 100% |
| wear-build.yml | Watch unit tests + watch screens (rendered) | 8 | 0 | 0 | 0 | 3 | 5 | - |
| wear-build.yml | Workout dims after interruptions (Always-on screen on) | 7 | 0 | 0 | 0 | 0 | 7 | - |
| wear-build.yml | Workout keeps MettleUp in front (Always-on screen off) | 5 | 0 | 0 | 0 | 0 | 5 | - |
| owner-ads.yml | Probe lengths (video vs audio) | 5 | 0 | 0 | 0 | 0 | 5 | - |
| watch.yml | New kinds of crash -> one issue each | 4 | 0 | 0 | 0 | 0 | 4 | - |
| wear-build.yml | Workout dims with Always-on display OFF (the app dims itself) | 4 | 0 | 0 | 0 | 0 | 4 | - |
| wear-build.yml | The largest text on the small watch (real app) | 4 | 1 | 0 | 0 | 0 | 3 | 100% |
| store-shots.yml | Take the screens | 3 | 2 | 0 | 0 | 0 | 1 | 100% |
| release-apk.yml | The tag's What's new file | 3 | 0 | 0 | 1 | 0 | 2 | 0% |
| release-apk.yml | Upload to Play (internal + closed testing) | 3 | 0 | 2 | 0 | 0 | 1 | 100% |
| ios.yml | Every picture is there | 3 | 0 | 0 | 0 | 0 | 3 | - |
| qa-journeys.yml | Build an emulator APK (x86_64) | 2 | 1 | 1 | 0 | 0 | 0 | 100% |
| release-apk.yml | Upload the watch app to Play (Wear OS internal testing) | 2 | 0 | 0 | 0 | 2 | 0 | - |
| ios.yml | Build for the iPhone simulator | 2 | 0 | 0 | 0 | 0 | 2 | - |
| wear-build.yml | The watch APK still declares its capability (after resource shrinking) | 2 | 0 | 0 | 0 | 0 | 2 | - |
| play-upload.yml | Upload to Play (internal + closed testing) | 1 | 0 | 0 | 0 | 1 | 0 | - |
| play-upload.yml | Upload the watch app to Play (Wear OS internal testing) | 1 | 0 | 0 | 0 | 1 | 0 | - |
| whatsapp-setup.yml | (c) Put WHATSAPP_TOKEN into the panel Worker | 1 | 0 | 0 | 0 | 0 | 1 | - |
| voice-samples.yml | Run python gen_magpie.py | 1 | 0 | 0 | 0 | 0 | 1 | - |
| final-voice.yml | Run python final_chatterbox.py refs/hf_beta.wav final "03-own-app,06-progress" | 1 | 0 | 0 | 0 | 0 | 1 | - |
| ci.yml | (no failed step recorded) | 1 | 0 | 0 | 0 | 0 | 1 | - |
| qa-device.yml | Get every shard's evidence | 1 | 0 | 0 | 0 | 0 | 1 | - |
| qa-device.yml | (no failed step recorded) | 1 | 0 | 0 | 0 | 0 | 1 | - |
| exercise-clips.yml | Stills machine_lat_pulldown (exercise pictures + checks) | 1 | 0 | 0 | 0 | 0 | 1 | - |
| exercise-clips.yml | Stills iso_lateral_low_row (exercise pictures + checks) | 1 | 0 | 0 | 0 | 0 | 1 | - |
| exercise-clips.yml | Stills iso_lateral_row (exercise pictures + checks) | 1 | 0 | 0 | 0 | 0 | 1 | - |
| release-apk.yml | Release checks (signing, version, permissions, 16 KB, size) | 1 | 0 | 0 | 0 | 0 | 1 | - |

## Top 15 flows by test-fault and flaky count

A flow here is one phone flow file, one journey step, one browser spec or one unit test. "Flaky" = it passed on the same commit
(rules T1, T2). "Test fault" = the other TEST FAULT rules. When a job failed in several flows its minutes are split evenly.

| # | Flow | Flaky | Test fault | Minutes lost on those | All red jobs with this flow | ...of which unknown | Example run / job |
|---|---|---|---|---|---|---|---|
| 1 | ci: e2e/reminders.spec.mjs › J38b the front desk can look at the automatic reminders but not change them | 0 | 16 | 184 | 16 | 0 | 39974926516 / 120486909026 |
| 2 | ci: e2e/alerts-uat.spec.mjs › Latest from your members on a computer, light theme | 5 | 9 | 112 | 22 | 8 | 44264776182 / 134666456985 |
| 3 | ci: payments and joins | 5 | 9 | 112 | 22 | 8 | 44264776182 / 134666456985 |
| 4 | ci: the desk who trains | 5 | 9 | 112 | 22 | 8 | 44264776182 / 134666456985 |
| 5 | ci: e2e/r579-uat.spec.mjs › R579-1 the member page: "Share app link" for every member, the smart link and the gym code, phone and computer, ligh | 1 | 5 | 80 | 10 | 4 | 44253299398 / 134628915470 |
| 6 | ci: e2e/bell-inbox-uat.spec.mjs › Owner on a phone: the bell keeps what is not done, news until opened, X with Undo, History at the top | 0 | 6 | 55 | 6 | 0 | 43822375917 / 133148191272 |
| 7 | qa-journeys: J7 step 1 (admin: asks AI to match an odd register (real AI) | 5 | 0 | 211 | 7 | 2 | 40695620891 / 122987740281 |
| 8 | ci: e2e/bell-inbox-uat.spec.mjs › Desk at 360 and a trainer: each their own bell | 0 | 5 | 30 | 5 | 0 | 43822020504 / 133147044891 |
| 9 | ci: the X never marks done | 0 | 5 | 30 | 5 | 0 | 43822020504 / 133147044891 |
| 10 | ci: the trainer’s answer is done for all | 0 | 5 | 30 | 5 | 0 | 43822020504 / 133147044891 |
| 11 | ci: e2e/today-handled-uat.spec.mjs › R-593 Today: a message he replied to or marked done leaves Today and the bell number | 2 | 2 | 45 | 4 | 0 | 44097074016 / 134086906049 |
| 12 | ci: news shows once | 2 | 2 | 45 | 4 | 0 | 44097074016 / 134086906049 |
| 13 | qa-device: (Run the workout QA on an emulator) | 2 | 0 | 223 | 165 | 8 | 41273722168 / 124754200115 |
| 14 | qa-device: uat-r.yaml | 2 | 0 | 108 | 6 | 4 | 40175718272 / 121119288490 |
| 15 | qa-device: part BR | 2 | 0 | 58 | 6 | 4 | 40134268397 / 120995351909 |

### Top 15 flows by red jobs of any label (for the flows nobody could judge)

| # | Flow | Red jobs | Runner | Test fault | App bug | Unknown | Minutes (split) |
|---|---|---|---|---|---|---|---|
| 1 | ci: supabase/tests/security.sql | 33 | 0 | 2 | 24 | 7 | 46 |
| 2 | ci: node test: Gemini fails (error, timeout, bad JSON, cut short) -> Claude, with a log line each time | 30 | 0 | 1 | 28 | 1 | 9 |
| 3 | ci: node test: Claude is asked with low effort and a JSON schema, never a prefill | 30 | 0 | 1 | 28 | 1 | 9 |
| 4 | ci: a refusal is a failure | 30 | 0 | 1 | 28 | 1 | 9 |
| 5 | ci: node test: a provider without its key is skipped | 30 | 0 | 1 | 28 | 1 | 9 |
| 6 | ci: no keys at all = off | 30 | 0 | 1 | 28 | 1 | 9 |
| 7 | ci: node test: a Gemini model can be swapped without a code change | 30 | 0 | 1 | 28 | 1 | 9 |
| 8 | ci: node test: an error message never carries a key | 30 | 0 | 1 | 28 | 1 | 9 |
| 9 | ci: node test: an owner gets the checked mapping and how many reads are left today | 30 | 0 | 1 | 28 | 1 | 9 |
| 10 | ci: node test: the daily limit: 20 reads per gym per India day, then 429 with no AI call | 30 | 0 | 1 | 28 | 1 | 9 |
| 11 | ci: node test: all gyms together are capped too | 30 | 0 | 1 | 28 | 1 | 9 |
| 12 | ci: node test: only an owner: no key 401, a wrong key 401, the front desk 403, gym server down 503 | 30 | 0 | 1 | 28 | 1 | 9 |
| 13 | ci: node test: no AI key set: 503 off, and nothing is asked or counted | 30 | 0 | 1 | 28 | 1 | 9 |
| 14 | ci: node test: every provider fails: 502 failed, the read is counted as failed | 30 | 0 | 1 | 28 | 1 | 9 |
| 15 | ci: node test: plain answers for a wrong method, a bad body, a big body | 30 | 0 | 1 | 28 | 1 | 9 |

## CI step "Admin journeys (phone, real forms)"

308 red jobs, 6,388 machine minutes.

| Label | Jobs | Share |
|---|---|---|
| TEST FAULT | 58 | 19% |
| APP BUG | 3 | 1% |
| UNKNOWN | 46 | 15% |
| NO LOG KEPT | 201 | 65% |

### The 5 specs that failed most

| # | Spec file | Red jobs | Runner | Test fault | App bug | Unknown |
|---|---|---|---|---|---|---|
| 1 | (Admin journeys (phone, real forms)) | 204 | 0 | 0 | 0 | 3 |
| 2 | the desk who trains | 22 | 0 | 14 | 0 | 8 |
| 3 | e2e/alerts-uat.spec.mjs | 22 | 0 | 14 | 0 | 8 |
| 4 | payments and joins | 22 | 0 | 14 | 0 | 8 |
| 5 | e2e/reminders.spec.mjs | 16 | 0 | 16 | 0 | 0 |

### The 5 failing lines seen most

The line Playwright stopped at (first failure of the job), with line numbers removed so the same line counts once.

| # | Failing line | Red jobs | Labels | Example run / job |
|---|---|---|---|---|
| 1 | `(no line in the log)` | 201 | NO LOG KEPT 201 | 43731550729 / 132864878152 |
| 2 | `Error: expect.toBeVisible: Error: strict mode violation: getByRole('heading', { name: 'Automatic reminders' }) resolved to 2 elements: / > await expect(desk.getByRole('heading', { name: 'Automatic reminders' })).toBeVisible({ time` | 16 | TEST FAULT 16 | 39974926516 / 120486909026 |
| 3 | `Error: expect(locator).toHaveCount(expected) failed / Locator: getByRole('main').getByTestId('latest-alerts').getByRole('button') / > await expect(lines).toHaveCount(2, { timeout: 10_000 });` | 16 | TEST FAULT 14, UNKNOWN 2 | 44264776182 / 134666456985 |
| 4 | `Error: expect(locator).toBeVisible() failed / Locator: getByRole('heading', { name: 'Today', exact: true }) / > await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });` | 12 | TEST FAULT 8, UNKNOWN 4 | 41109463634 / 124247816176 |
| 5 | `Error: expect(locator).toHaveAttribute(expected) failed / Locator: getByRole('region', { name: 'Demo gym' }).getByRole('link', { name: 'Leave the demo' }) / > await expect(banner.getByRole('link', { name: 'Leave the demo' })).toHa` | 10 | UNKNOWN 9, TEST FAULT 1 | 41283471414 / 124779944081 |

