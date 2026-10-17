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
| E2 | 39000423508 | PASS | battery saver set after unplugging (its ENV log line not re-read) | offline | IST | on |
| E3 | 39000424837 | PASS | | flaky | UTC | on |
| E4 | 39000426353 | PASS | | flaky | IST | off |
| E5 | 39006324165 | PASS | 3rd try: found a layout slip (the "Coming from Hevy" heading off the edge, fixed 00a1a8f) + 2 test-script slips | online | IST | off |
| E6 | 39000429450 | PASS | | offline | UTC | off |
| E7 | 39000430902 | PASS | | offline | IST | on |
| E8 | 39000432718 | PASS | | online | UTC | on |
| E9 | 34 | 1.3 | 411 | flaky | UTC | off |
| E10 | 34 | 2.0 | 411 | offline | UTC | off |
| E11 | 39000434137 | PASS | | online | UTC | off |
| E12 | 39000435903 | PASS | | online | UTC | off |

12 runs cover all 93 pairs (every combination would be 216).

How each setting is made (run-device-qa.sh, QA_ENV): font = Android's font size; width 360 dp =
density 480 on the Pixel 6 emulator (411 = its own); offline = airplane mode, Wi-Fi and data off;
flaky = the emulator's GPRS speed and delay; IST = Asia/Kolkata; battery saver = `cmd power
set-mode 1`.

## Runs

| # | Run | Result | Notes |
|---|---|---|---|
| E1 | (every whole default run) | - | covered by the release gate |
| E2 | 39000423508 | PASS | battery saver set after unplugging (its ENV log line not re-read) |
| E3 | 39000424837 | PASS | |
| E4 | 39000426353 | PASS | |
| E5 | 39006324165 | PASS | 3rd try: found a layout slip (the "Coming from Hevy" heading off the edge, fixed 00a1a8f) + 2 test-script slips |
| E6 | 39000429450 | PASS | |
| E7 | 39000430902 | PASS | |
| E8 | 39000432718 | PASS | |
| E9 | 38997281668 | PASS |  |
| E10 | 38997283134 | PASS |  |
| E11 | 39000434137 | PASS | |
| E12 | 39000435903 | PASS | |

Round 1 (9783923): every part passed in all 11 runs; the rest alert came 0-1 ms after its due time
on every Android version, with the screen off, offline, on a slow link and at font 2.0. The 8 red
runs (all API 35/36) were the checker, not the app: Android 15+ prints notification flags as names.
Round 2 (515dd52): E2-E8, E11, E12 again (E2 for a real Battery Saver).

**Result (17 Oct 2026, 06:10 UTC): all 11 runs PASS** (E9, E10 round 1; the rest round 2/3).
App change found by the matrix: the welcome screen's "Coming from Hevy or Strong?" heading ran off
the screen at font 2.0 (fixed). Checker fixes: Android 15+ notification flags, Battery Saver on AC,
two scroll assumptions at font 2.0 on 360 dp. The rest alert was on time (0-1 ms) everywhere.
