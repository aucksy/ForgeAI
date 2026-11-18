# What the release gate costs (audit step 3E / E3)

Made by `docs/system-map/_tools/e3_gate_cost.py` from `docs/system-map/test-history.csv` (CI jobs, 2026-10-19 to 2026-11-18 UTC), the workflow files, the Maestro flow files and 6 job logs of run 44011846187. Numbers behind every line: `docs/system-map/_work/E3-numbers.json`, `E3-flow-times.json`, `E3-repeats.json`.

## Headline

**One release round = about 223 minutes wall-clock (3.7 hours) and about 1352 machine minutes (23 machine hours), when everything passes first time.**

- Wall-clock = the phone test on both phones at once with the release UAT (median 189.8 min, slowest 201.6; 4 green rounds since 12 Nov) + the release run after the tag (median 33.0 min).
- Machine minutes = both phones (1259.6) + journeys (42.2) + CI on the commit (17.8) + the release run (32.8). Phone conditions (advisory, 102.7) and the watch build (23.1) are extra when they run.
- **A release needed 4.1 rounds on average (median 3, worst 14)** in the last 30 days, over 29 releases that had at least one whole round between them and the release before. From the first round to the published release: median 8.2 hours, mean 11.9, worst 69.4.
- On top of the rounds, a release had 12.4 partial phone runs on average, and the phone test alone used 42.8 machine hours per release on average.
- 0.79.0, the one release whose rounds are tagged (qa-rel-079 to qa-rel-079j, 10 tags): 12 whole runs (5 green), 20 partial runs, 35.6 hours from the first start to the last end, 8739 machine minutes.

How a round is counted: whole phone runs started within 15 minutes of each other are one round (normally one per phone). A release's rounds are the rounds started after the release before it was published. Whole runs done for other reasons in that time are counted too; the CSV cannot tell them apart.

## 1. What one phone release must pass today

| # | Part | Workflow / job | Started by | Required to release? | Wall min (median / slowest) | Machine min (median / slowest) | Green runs measured |
|---|---|---|---|---|---|---|---|
| 1 | Build check: types, unit tests, ratchets, panel crawl, database | `ci.yml` check + database | every push, any branch, no path filter (`ci.yml:9-14`) | Yes. `phone_gate.py` waits for it on the release commit (`scripts/ci/phone_gate.py:32-34`) | 16.6 / 50.1 | 17.8 / 51.6 | 1195 |
| 2 | Phone test, default phone, whole run + release UAT | `qa-device.yml` plan, build, canary, shards 1-6, report | by hand (`qa-device.yml:30-31`) | Whole run: yes (`phone_gate.py:6-12`). The `uat` extra: not checked by the gate; it only adds checks (`qa-device.yml:61-62`) | 183.9 / 201.6 | 622.1 / 702.7 | 6 |
| 3 | Phone test, owner phone (360 dp, font 1.3, IST), whole run + release UAT | same workflow, `profile: owner` | by hand | Yes, same rule | 179.5 / 193.0 | 633.5 / 637.4 | 5 |
| 4 | Cross-role journeys (phone + admin app + live server) | `qa-journeys.yml` journeys | by hand (`qa-journeys.yml:18-20`) | Yes (`phone_gate.py:14-16`, `REQUIRED` line 126-127) | 42.2 / 54.9 | 42.2 / 54.9 | 74 |
| 5 | Phone conditions (offline, flaky, killed, Doze, upgrade) | `qa-conditions.yml` previous, build old + new, conditions | by hand (`qa-conditions.yml:36-37`) | No: advisory (`qa-conditions.yml:33`) | 91.1 / 99.0 | 102.7 / 113.6 | 7 |
| 6 | Watch build, watch unit tests, watch UAT on 3 watch emulators | `wear-build.yml` build + uat | push to main touching watch paths, or by hand (`wear-build.yml:16-33`) | No: the gate does not read it. The watch's unit tests run again inside part 7 | 23.1 / 63.8 | 23.1 / 106.9 | 46 |
| 7 | Release run: phone-gate, build (types, unit tests, watch tests, APK + AAB + watch), release checks, update proof, publish, Play upload | `release-apk.yml` phone-gate, build, update-proof, publish, play-upload | pushing a `v*` tag (`release-apk.yml:48-51`) | Yes; Play upload runs after publish, so it cannot block the GitHub release (`release-apk.yml:448-450`) | 33.0 / 49.7 | 32.8 / 49.7 | 21 |

Parts 2, 3 and 4 can run at the same time; part 7 can only start after they are green. Each phone passes on the release commit itself, or on a commit up to 8 back when only docs, unit tests, CI scripts or the version line changed since (`phone_gate.py:18-30`, `MAX_WALK = 8`).

### Inside each part (minutes per job, green runs only)

**Phone test, whole run + release UAT, default phone (layout since 12 Nov: canary + 6 shards)**: 6 green runs, e.g. 43817100950, 43841923587, 44011843148. Wall 183.9 / 201.6, machine 622.1 / 702.7.

| Job | Runs | Median | Slowest |
|---|---|---|---|
| device-qa (6-uat-c) | 6 | 161.6 | 173.4 |
| device-qa (1-history-routines) | 6 | 108.5 | 118.0 |
| device-qa (5-uat-b) | 6 | 101.0 | 106.2 |
| device-qa (4-workout) | 6 | 84.5 | 91.1 |
| device-qa (0-affected) | 1 | 82.4 | 82.4 |
| device-qa (3-uat-a) | 6 | 68.8 | 71.9 |
| device-qa (2-gym-backup) | 6 | 61.8 | 62.9 |
| build | 6 | 18.1 | 21.3 |
| device-qa (0-canary) | 6 | 11.8 | 12.6 |
| report | 6 | 0.9 | 1.1 |
| plan | 6 | 0.5 | 1.3 |

**Phone test, whole run + release UAT, owner phone (layout since 12 Nov)**: 5 green runs, e.g. 43817104084, 43841927489, 44011846187. Wall 179.5 / 193.0, machine 633.5 / 637.4.

| Job | Runs | Median | Slowest |
|---|---|---|---|
| device-qa (6-uat-c) | 5 | 161.8 | 177.6 |
| device-qa (1-history-routines) | 5 | 116.2 | 119.1 |
| device-qa (5-uat-b) | 5 | 100.9 | 102.6 |
| device-qa (4-workout) | 5 | 88.4 | 92.4 |
| device-qa (3-uat-a) | 5 | 72.2 | 74.2 |
| device-qa (2-gym-backup) | 5 | 59.4 | 63.5 |
| build | 5 | 16.5 | 17.9 |
| device-qa (0-canary) | 5 | 12.2 | 12.5 |
| report | 5 | 1.0 | 1.1 |
| plan | 5 | 0.6 | 1.3 |

**Phone test, whole run without the UAT extra, either phone (layout since 12 Nov)**: 0 green runs, e.g. none. Wall None / None, machine None / None.

**Phone test, whole run + release UAT, either phone (old layout: 4 shards, before 12 Nov)**: 10 green runs, e.g. 42431470075, 42521872640, 42521874882. Wall 177.7 / 206.3, machine 386.5 / 426.7.

| Job | Runs | Median | Slowest |
|---|---|---|---|
| device-qa (4-uat-b-workout) | 10 | 158.4 | 187.3 |
| device-qa (1-history-routines) | 10 | 108.5 | 114.1 |
| device-qa (2-gym-backup) | 10 | 59.7 | 63.1 |
| device-qa (3-uat-a) | 10 | 42.8 | 45.3 |
| build | 10 | 18.4 | 20.2 |
| report | 10 | 0.7 | 1.1 |
| plan | 10 | 0.1 | 0.7 |

**Phone test, whole run without UAT, either phone (old layout: 4 shards)**: 55 green runs, e.g. 41971904558, 41994334345, 41994337044. Wall 122.0 / 140.0, machine 249.9 / 286.4.

| Job | Runs | Median | Slowest |
|---|---|---|---|
| device-qa (1-history-routines) | 55 | 101.2 | 117.2 |
| device-qa (2-gym-backup) | 55 | 56.1 | 64.0 |
| device-qa (4-uat-b-workout) | 55 | 38.5 | 45.6 |
| device-qa (3-uat-a) | 55 | 37.9 | 44.6 |
| build | 55 | 18.7 | 24.9 |
| report | 55 | 0.5 | 1.5 |
| plan | 55 | 0.1 | 0.7 |

**Cross-role journeys**: 74 green runs, e.g. 43817112692, 43841931157, 44011857204. Wall 42.2 / 54.9, machine 42.2 / 54.9.

| Job | Runs | Median | Slowest |
|---|---|---|---|
| journeys | 74 | 42.2 | 54.9 |

**Phone conditions (all)**: 7 green runs, e.g. 43817110240, 43841935528, 44011853645. Wall 91.1 / 99.0, machine 102.7 / 113.6.

| Job | Runs | Median | Slowest |
|---|---|---|---|
| conditions | 7 | 71.5 | 72.1 |
| build (old) | 7 | 17.4 | 20.8 |
| build (new) | 7 | 16.9 | 21.0 |
| previous | 7 | 0.1 | 0.2 |

**Build & Release on a tag (published)**: 21 green runs, e.g. 43195542456, 43689666626, 44091025092. Wall 33.0 / 49.7, machine 32.8 / 49.7.

| Job | Runs | Median | Slowest |
|---|---|---|---|
| build | 21 | 23.3 | 30.4 |
| update-proof | 21 | 3.1 | 4.9 |
| play-upload / upload | 10 | 1.9 | 2.8 |
| publish | 21 | 0.3 | 0.4 |
| phone-gate | 21 | 0.2 | 17.1 |

**CI on main (every push)**: 1195 green runs, e.g. 44267301607, 44267777490, 44270144913. Wall 16.6 / 50.1, machine 17.8 / 51.6.

| Job | Runs | Median | Slowest |
|---|---|---|---|
| check | 1195 | 16.5 | 50.1 |
| database | 1194 | 1.3 | 2.6 |
| razorpay-test-mode | 107 | 0.3 | 0.5 |

**Wear OS build + watch UAT**: 46 green runs, e.g. 43817115099, 43841939870, 44011860511. Wall 23.1 / 63.8, machine 23.1 / 106.9.

| Job | Runs | Median | Slowest |
|---|---|---|---|
| watch UAT (api 34, wearos_small_round) | 5 | 28.0 | 29.4 |
| watch UAT (api 34, wearos_large_round) | 5 | 26.0 | 26.5 |
| watch UAT (api 35-ext15, wearos_large_round) | 5 | 25.6 | 25.9 |
| build | 46 | 19.9 | 25.4 |
| watch UAT (api 34) | 14 | 17.1 | 26.3 |
| watch UAT (api 35-ext15) | 14 | 16.9 | 26.1 |

**Play upload started by hand**: 17 green runs, e.g. 43694560659, 43740436255, 44109513123. Wall 0.4 / 1.8, machine 0.4 / 1.8.

| Job | Runs | Median | Slowest |
|---|---|---|---|
| upload | 17 | 0.4 | 1.8 |

## 2. Rounds per release (last 30 days)

| Release | Published (UTC) | Days since the one before | Rounds (with UAT) | Rounds green on both phones | Whole runs: green / red / cancelled | Partial runs | Journey runs | Release runs on the tag (red) | Hours, first round to published | Phone-test machine min |
|---|---|---|---|---|---|---|---|---|---|---|
| v0.50.0 | 2026-10-21 22:16 | 0.2 | 2 (0) | 0 | 2 / 3 / 0 | 0 | 2 | 1 (0) | 4.5 | 693 |
| v0.54.0 | 2026-10-22 14:26 | 0.67 | 7 (0) | 1 | 4 / 12 / 0 | 0 | 7 | 1 (0) | 9.9 | 2653 |
| v0.54.1 | 2026-10-22 19:21 | 0.21 | 1 (0) | 1 | 2 / 0 / 0 | 0 | 1 | 1 (0) | 2.8 | 487 |
| v0.55.0 | 2026-10-24 01:11 | 1.24 | 10 (0) | 0 | 5 / 14 / 0 | 0 | 9 | 1 (0) | 20.6 | 3545 |
| v0.55.1 | 2026-10-24 09:12 | 0.33 | 1 (0) | 1 | 2 / 0 / 0 | 0 | 1 | 1 (0) | 2.6 | 472 |
| v0.56.0 | 2026-10-24 20:33 | 0.47 | 3 (0) | 1 | 3 / 3 / 0 | 0 | 4 | 1 (0) | 7.2 | 1448 |
| v0.56.1 | 2026-10-25 00:57 | 0.18 | 2 (0) | 0 | 2 / 1 / 0 | 0 | 1 | 1 (0) | 3.5 | 547 |
| v0.55.2 | 2026-10-25 07:14 | 0.26 | 4 (0) | 1 | 3 / 9 / 0 | 0 | 6 | 2 (1) | 3.4 | 1997 |
| v0.57.0 | 2026-10-25 12:45 | 0.23 | 2 (0) | 1 | 2 / 2 / 0 | 0 | 2 | 1 (0) | 4.6 | 677 |
| v0.57.1 | 2026-10-25 19:54 | 0.3 | 2 (0) | 1 | 2 / 2 / 0 | 0 | 2 | 1 (0) | 4.1 | 945 |
| v0.58.0 | 2026-10-26 10:12 | 0.6 | 2 (0) | 1 | 2 / 2 / 0 | 0 | 2 | 1 (0) | 3.8 | 945 |
| v0.59.0 | 2026-10-28 19:39 | 2.39 | 5 (0) | 0 | 4 / 4 / 0 | 1 | 8 | 1 (0) | 14.1 | 1720 |
| v0.60.0 | 2026-10-29 08:32 | 0.54 | 5 (0) | 0 | 2 / 6 / 0 | 3 | 3 | 4 (3) | 12.0 | 2012 |
| v0.61.0 | 2026-10-29 19:22 | 0.45 | 1 (0) | 1 | 2 / 1 / 0 | 0 | 1 | 1 (0) | 3.0 | 536 |
| v0.62.1 | 2026-10-30 22:13 | 1.12 | 9 (0) | 1 | 4 / 14 / 0 | 2 | 10 | 9 (8) | 19.1 | 4604 |
| v0.65.0 | 2026-10-31 16:00 | 0.74 | 3 (0) | 2 | 5 / 1 / 0 | 2 | 4 | 2 (1) | 11.1 | 1590 |
| v0.67.0 | 2026-11-01 18:08 | 1.09 | 5 (0) | 0 | 4 / 4 / 0 | 1 | 3 | 7 (3) | 13.5 | 1729 |
| v0.68.0 | 2026-11-02 11:31 | 0.72 | 1 (0) | 1 | 2 / 0 / 0 | 10 | 1 | 1 (0) | 2.9 | 843 |
| v0.69.0 | 2026-11-02 22:58 | 0.48 | 4 (0) | 1 | 2 / 5 / 1 | 1 | 3 | 1 (0) | 9.4 | 1554 |
| v0.70.0 | 2026-11-03 07:29 | 0.35 | 2 (0) | 1 | 2 / 2 / 0 | 0 | 2 | 1 (0) | 3.3 | 599 |
| v0.71.0 | 2026-11-03 21:52 | 0.6 | 3 (1) | 2 | 6 / 2 / 0 | 8 | 6 | 1 (1) | 8.2 | 2340 |
| v0.72.0 | 2026-11-05 11:16 | 1.56 | 3 (0) | 1 | 3 / 3 / 0 | 83 | 3 | 2 (1) | 8.1 | 5123 |
| v0.73.0 | 2026-11-06 05:27 | 0.76 | 4 (4) | 1 | 3 / 5 / 0 | 24 | 4 | 2 (1) | 15.3 | 3662 |
| v0.74.0 | 2026-11-07 13:39 | 1.34 | 1 (1) | 1 | 2 / 2 / 0 | 5 | 2 | 1 (1) | 3.6 | 1061 |
| v0.75.0 | 2026-11-08 05:21 | 0.65 | 3 (3) | 0 | 2 / 3 / 0 | 1 | 2 | 2 (1) | 11.1 | 2039 |
| v0.76.0 | 2026-11-09 00:48 | 0.81 | 3 (3) | 1 | 2 / 6 / 0 | 18 | 4 | 1 (1) | 10.6 | 2732 |
| v0.77.0 | 2026-11-12 10:25 | 3.4 | 8 (8) | 0 | 2 / 11 / 0 | 52 | 5 | 1 (0) | 24.2 | 6264 |
| v0.78.0 | 2026-11-15 07:51 | 2.89 | 14 (14) | 1 | 4 / 24 / 1 | 82 | 4 | 2 (1) | 69.4 | 10093 |
| v0.79.0 | 2026-11-17 13:50 | 2.25 | 8 (8) | 3 | 7 / 7 / 0 | 66 | 5 | 1 (0) | 40.1 | 11514 |

0.79.0 by its own tags:

| Tag | Whole runs (phone, result, wall min, run id) | Partial runs |
|---|---|---|
| qa-rel-079 | default red 39.1 min (43765513595); owner red 27.3 min (43765515975) | 2 |
| qa-rel-079b | default red 68.2 min (43770159330); owner red 63.6 min (43770161543) | 1 |
| qa-rel-079c | default green 187.5 min (43776696006); owner red 69.1 min (43776698253) | 2 |
| qa-rel-079d | owner red 109.1 min (43784919647) | 2 |
| qa-rel-079e | owner red 102.7 min (43796622071) | 2 |
| qa-rel-079f | default green 181.3 min (43841923587); owner green 193.0 min (43841927489) | 1 |
| qa-rel-079g | none | 3 |
| qa-rel-079h | none | 3 |
| qa-rel-079i | none | 3 |
| qa-rel-079j | default green 201.6 min (44011843148); owner green 181.2 min (44011846187) | 1 |

## 3. The 20 slowest parts of a whole round

From the 6 shard logs of the green owner-phone round 44011846187 (17 Nov 2026): each `[qa] part X start` line to the next one. A name ending `_seed` is the wipe + demo data load before a part.

| # | Part (log name) | Shard | Minutes |
|---|---|---|---|
| 1 | R | (1-history-routines) | 19.5 |
| 2 | uatr454a | (6-uat-c) | 14.2 |
| 3 | uatr454b | (6-uat-c) | 12.6 |
| 4 | uat15 | (4-workout) | 11.2 |
| 5 | ud | (3-uat-a) | 10.9 |
| 6 | uatr436a | (6-uat-c) | 10.6 |
| 7 | M | (2-gym-backup) | 10.6 |
| 8 | uh | (2-gym-backup) | 10.1 |
| 9 | uatr576a | (6-uat-c) | 9.5 |
| 10 | I | (1-history-routines) | 8.8 |
| 11 | uatr344c | (5-uat-b) | 8.7 |
| 12 | C | (1-history-routines) | 8.4 |
| 13 | ur | (2-gym-backup) | 7.9 |
| 14 | uatr461 | (5-uat-b) | 7.9 |
| 15 | G | (1-history-routines) | 7.6 |
| 16 | D | (1-history-routines) | 7.6 |
| 17 | uat4 | (4-workout) | 7.4 |
| 18 | ug | (3-uat-a) | 7.2 |
| 19 | uatf194 | (5-uat-b) | 7.2 |
| 20 | uatf203 | (6-uat-c) | 6.8 |

Per shard in that round:

| Shard | Job minutes | Setup before the first test line (boot, Maestro, emulator) | Parts | Test minutes | After the last test line (summary, upload) |
|---|---|---|---|---|---|
| (1-history-routines) | 119.1 | 3.0 | 30 | 116.0 | 0.2 |
| (2-gym-backup) | 59.3 | 2.8 | 17 | 56.6 | 0.1 |
| (3-uat-a) | 69.9 | 2.8 | 24 | 67.1 | 0.1 |
| (4-workout) | 92.1 | 2.6 | 35 | 89.0 | 0.2 |
| (5-uat-b) | 99.5 | 3.0 | 35 | 96.8 | 0.2 |
| (6-uat-c) | 165.5 | 2.6 | 66 | 163.6 | 0.2 |

Wipe + demo loads (`*seed` parts) in that one round: 18 of them, 16 minutes in total (median 0.8 each).

## 4. Repeated work

### 4a. The same thing done more than once in a round (measured)

- **The whole phone test runs twice, once per phone**: 622.1 + 633.5 machine minutes (medians). By design (`phone_gate.py:6-12`).
- **The app is built from the same commit up to 6 times per release**: once per phone run (`qa-device.yml` build, median 18.1 min each, two runs), once in journeys (inside its 42.2 min), twice in conditions (old + new, median 16.9 and 17.4), once in the release run (build job median 23.3). Only the release build is a different build (signed, ARM); the two phone-run builds and the journeys build are the same x86_64 test build.
- **Wipe + demo data load before most UAT parts**: 18 loads, 16 minutes in one round on one phone (section 3). `gate-demo.yaml` is called 29 times in `run-device-qa.sh`.
- **The canary re-runs two parts that shard 6 also runs** (u444, u401: `qa_shards.py` CANARY and UAT_SPLIT): median 11.8 min per phone, a deliberate fail-fast cost.
- **The 0-affected piece re-runs parts the shards run anyway** (`qa-device.yml:19-22`): 1 green runs, median 82.4 min, slowest 82.4.
- **Emulator setup per shard**: about 3 minutes of each shard is boot, installs and upload, not tests (section 3); with 7 pieces per phone and 2 phones that is about 41 machine minutes a round.
- **Watch unit tests** run in `wear-build.yml` and again in the release run's build job (`release-apk.yml:150-154`). **Types and unit tests** run in `ci.yml` and again in the release run (`release-apk.yml:107-116`).

### 4b. Rounds that re-tested an app that had not changed

Whole phone runs, compared with the whole run before them on the same phone (local git diff of the two commits):

| What changed since the previous whole run on that phone | Whole runs | Machine minutes | Example runs |
|---|---|---|---|
| phone app changed | 152 | 34010 | 39599877750, 39599880778, 39604087736, 39604091364 |
| only phone-test files, CI scripts, unit tests or docs changed | 47 | 14465 | 39902230052, 39902232208, 39950792788, 39950796016 |
| server or web panels changed, phone app not | 20 | 7809 | 39920974273, 39920977372, 40107399956, 40107401680 |
| same commit as the previous whole run on this phone | 6 | 1471 | 39664337093, 39936640177, 40002348835, 40034087489 |
| unknown (commit not in the local clone) | 4 | 514 | 40160126116, 40160127473, 40160846314, 40160847577 |

CI on a push (`ci.yml` has no path filter, so every push runs the full check), by what the pushed head commit touched (2061 push runs):

| Head commit touched | CI runs | Machine minutes |
|---|---|---|
| code | 891 | 13983 |
| docs only | 843 | 13753 |
| nothing the phone app or the panels are built from (tests, CI scripts, docs) | 162 | 2857 |
| phone-test files only (+docs) | 149 | 2590 |
| merge or empty commit | 11 | 99 |
| unknown (commit not in the local clone) | 5 | 43 |

### 4c. Flow files that open the same screens and check the same words

289 flow files (46 shared sub-flows). 16 of them wipe the app and start it fresh; 128 `launchApp` steps in all. Compared by script: the set of words each top-level flow waits for or asserts (`assertVisible` and `visible:` lines); 3 pairs share half or more.

| Flow A | Flow B | Same words | Words in A / B | Overlap |
|---|---|---|---|---|
| uat-rel-r439-a-history.yaml | uat-rel-r454-a-history.yaml | 9 | 9 / 10 | 0.9 |
| uat-rel-f194-a-history.yaml | uat-rel-r454-a-history.yaml | 7 | 9 / 10 | 0.58 |
| uat-rel-f194-a-history.yaml | uat-rel-r439-a-history.yaml | 6 | 9 / 9 | 0.5 |

Sub-flows used by the most flow files:

| Sub-flow | Used by flow files | Calls |
|---|---|---|
| sub-see.yaml | 153 | 1235 |
| sub-find.yaml | 106 | 439 |
| sub-settings-page.yaml | 35 | 60 |
| sub-back-to-tabs.yaml | 34 | 61 |
| sub-workout-fresh.yaml | 33 | 45 |
| sub-inuse-close.yaml | 26 | 46 |
| sub-start-blank.yaml | 24 | 25 |
| sub-type.yaml | 23 | 67 |
| sub-progress-row.yaml | 22 | 38 |
| gate-demo.yaml | 22 | 22 |
| xc-sub-find.yaml | 18 | 40 |
| sub-gym-none.yaml | 15 | 20 |
| sub-other-ways.yaml | 15 | 20 |
| xc-sub-back-to-tabs.yaml | 14 | 24 |
| sub-uat-tick.yaml | 14 | 39 |

Words waited for or asserted in the most top-level flows:

| Words | Flows |
|---|---|
| `^Profile$` | 73 |
| `^Workout$` | 40 |
| `Edit profile` | 30 |
| `Search exercises` | 24 |
| `Log a set to finish\|Finish workout` | 22 |
| `Finish workout\?` | 21 |
| `Skip rest` | 18 |
| `^${GYM}$` | 17 |
| `Workout complete` | 15 |
| `Add exercise` | 14 |
| `^Skip$\|Start fresh\|Get stronger every week\|Welcome to MettleUp\|Step 1 of 3\|Restore from a ` | 12 |
| `Add measures` | 11 |
| `Start fresh\|Get stronger every week\|Welcome to MettleUp\|Step 1 of 3\|Your name\|^Next$\|Resto` | 10 |
| `Choose Hevy file` | 10 |
| `Last 7 days` | 9 |
| `${GYM}` | 9 |
| `First check-in: go to the front desk and ask them to confirm your mobile number\. When the` | 8 |
| `Resume workout` | 8 |
| `Step 1 of 3` | 8 |
| `Update routine` | 8 |

## 5. Parallel room

Owner phone, whole run + UAT, medians of 5 green runs (the default phone is within a few minutes):

- Pieces at once now: 7 per phone (canary + 6 shards; 8 when the 0-affected piece runs), so 14 to 16 emulators for a round on both phones.
- Shard minutes: (1-history-routines) 116.2, (2-gym-backup) 59.4, (3-uat-a) 72.2, (4-workout) 88.4, (5-uat-b) 100.9, (6-uat-c) 161.8. Sum 599.
- **Longest shard: (6-uat-c), median 161.8 min, slowest 177.6.** The shortest is 59.4 min. The round waits for the longest.
- Round length now = build 16.5 + longest shard 161.8 + report 1 = **179 min** (measured wall median 179.5).
- Test work without the per-shard setup (3 min each): 582 min.

| Shards | Balanced shard = setup + work / shards | Round = build + shard + report | Saved against today |
|---|---|---|---|
| 6 | 100 min | 117 min | 62 min |
| 8 | 76 min | 93 min | 86 min |
| 10 | 61 min | 79 min | 101 min |
| 12 | 51 min | 69 min | 110 min |

Limits on balancing, from the files: parts A to R are one chain that must stay in one shard (`qa_shards.py:9-14`); in the read round that chain was 116.0 test minutes, so no shard plan goes under about 119 min for the shard and **136 min for the round** unless the chain is cut. The UAT chain `uatc` must also stay in one piece (`qa_shards.py:55-57`); with W it was 88 test minutes. Every other u-part starts from a fresh install and can move freely.

So with today's 6 shards, only moving u-parts out of 6-uat-c into the short shards (2-gym-backup, 3-uat-a) brings the round from about 179 to about 136 minutes; 8 shards would not be faster than that until the A to R chain is split.

## What could not be measured

- Which whole runs were release rounds and which were routine checks: the CSV has no such mark, so every whole run between two releases is counted for the later release.
- Per-part times come from ONE green round (6 logs, the brief's limit), not a median over many.
- How long the app build takes inside the journeys job (one job, no step times in the CSV): unknown.
- Waiting time between a red round and the next start (fixing time) is inside the hours figure and cannot be split from machine time.
- CI push runs are classed by the head commit only; a push of several commits may hide a code change behind a docs commit.
- Queue time before a job starts is not in the wall-clock figures (first job start to last job end).
