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
| E2 | 38997271281 | running | |
| E3 | 38997272780 | running | |
| E4 | 38997274321 | running | |
| E5 | 38997276238 | running | |
| E6 | 38997277461 | running | |
| E7 | 38997278881 | running | |
| E8 | 38997280249 | running | |
| E9 | 38997281668 | running | |
| E10 | 38997283134 | running | |
| E11 | 38997284695 | running | |
| E12 | 38997286258 | running | |
