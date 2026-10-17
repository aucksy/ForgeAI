# Pairwise phone-setting matrix (UAT WP14)

Why: most phone bugs need at most two settings to line up (a big font AND a narrow screen; no
internet AND Indian time). Testing every combination would be 216 phones; covering every PAIR of
settings once takes 12. The rows come from `python3 scripts/ci/pairwise.py --markdown`
(deterministic; `scripts/ci/test_pairwise.py` proves every pair is covered).

Each row is one PARTIAL phone run (never opens the release gate):
`qa-device.yml` with `only = a,b,h,h3` (a workout with ticks and a rest, the rest alert with the
screen off, the notification's own buttons, the watch's rest card, "Complete set" with the app
closed), `api = <row>`, `env = <row>`. E1 is the phone every whole run already uses (default
profile, API 34), so it is not run again here.

| # | api | font | width (dp) | network | time zone | battery saver |
|---|---|---|---|---|---|---|
| E1 | 34 | 1.0 | 411 | online | UTC | off |
| E2 | 34 | 1.3 | 360 | offline | IST | on |
| E3 | 35 | 2.0 | 411 | flaky | UTC | on |
| E4 | 36 | 1.0 | 360 | flaky | IST | off |
| E5 | 35 | 2.0 | 360 | online | IST | off |
| E6 | 36 | 1.3 | 411 | offline | UTC | off |
| E7 | 35 | 1.0 | 411 | offline | IST | on |
| E8 | 36 | 1.3 | 360 | online | UTC | on |
| E9 | 34 | 1.3 | 411 | flaky | UTC | off |
| E10 | 34 | 2.0 | 411 | offline | UTC | off |
| E11 | 35 | 1.3 | 411 | online | UTC | off |
| E12 | 36 | 2.0 | 411 | online | UTC | off |

12 runs cover all 93 pairs (every combination would be 216).

How each setting is made (run-device-qa.sh, QA_ENV): font = Android's font size; width 360 dp =
density 480 on the Pixel 6 emulator (411 = its own); offline = airplane mode, Wi-Fi and data off;
flaky = the emulator's GPRS speed and delay; IST = Asia/Kolkata; battery saver = `cmd power
set-mode 1`.

## Runs

| # | Run | Result | Notes |
|---|---|---|---|
| E1 | (every whole default run) | - | covered by the release gate |
| E2 | 38997271281 | PASS | battery saver did NOT turn on (emulator on AC); offline really on (airplane 1) |
| E3 | 38997272780 | red: harness only | all 9 parts passed; notif.py could not read Android 15+ flags (fixed 515dd52); re-run |
| E4 | 38997274321 | red: harness only | all 9 parts passed; notif.py could not read Android 15+ flags (fixed 515dd52); re-run |
| E5 | 38997276238 | red: harness only | all 9 parts passed; notif.py could not read Android 15+ flags (fixed 515dd52); re-run |
| E6 | 38997277461 | red: harness only | all 9 parts passed; notif.py could not read Android 15+ flags (fixed 515dd52); re-run |
| E7 | 38997278881 | red: harness only | all 9 parts passed; notif.py could not read Android 15+ flags (fixed 515dd52); re-run |
| E8 | 38997280249 | red: harness only | all 9 parts passed; notif.py could not read Android 15+ flags (fixed 515dd52); re-run |
| E9 | 38997281668 | PASS |  |
| E10 | 38997283134 | PASS |  |
| E11 | 38997284695 | red: harness only | all 9 parts passed; notif.py could not read Android 15+ flags (fixed 515dd52); re-run |
| E12 | 38997286258 | red: harness only | all 9 parts passed; notif.py could not read Android 15+ flags (fixed 515dd52); re-run |

Round 1 (9783923): every part passed in all 11 runs; the rest alert came 0-1 ms after its due time
on every Android version, with the screen off, offline, on a slow link and at font 2.0. The 8 red
runs (all API 35/36) were the checker, not the app: Android 15+ prints notification flags as names.
Round 2 (515dd52): E2-E8, E11, E12 again (E2 for a real Battery Saver).
