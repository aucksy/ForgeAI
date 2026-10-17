# Audit v2 — register (16 Oct 2026)

Plan: `../E2E-AUDIT-v2-PLAN.md`. One file per area holds every finding with file:line, scenario,
proof and fix; each finding's status is updated IN that file (FIXED <commit> / KEPT (why) /
SKIPPED (why)). This page is the overview and the fix order.

## Findings by area

| Area | File | Total | S1 | S2 | S3 | S4 | Fix wave |
|---|---|---|---|---|---|---|---|
| A test setup gaps | A-test-setup-gaps.md | 10 top gaps | | | | | B gates |
| C1 live workout | C1-live-workout.md | 14 | 0 | 4 | 6 | 4 | 1 (running) |
| C2 numbers vs labels | C2-numbers.md | 10 | 0 | 3 | 4 | 3 | 1 (running) |
| C3 routines + suggestions | C3-routines-suggestions.md | 31 | 4 | 11 | 12 | 4 | 2 |
| C4 import / export | C4-import-export.md | 11 | 0 | 4 | 5 | 2 | 2 |
| C5 notifications + watch | C5-notifications-watch.md | 15 | 0 | 3 | 4 | 8 | 4 (native) |
| C6 gym side (member app) | C6-gym-side.md | 16 | 0 | 2 | 6 | 8 | 4 |
| C7 admin app | C7-admin-app.md | 45 | 9 | 15 | 15 | 6 | 3 |
| C8 server security | C8-server-security.md | 14 | 1 | 6 | 4 | 3 | 0018 (running) |
| C9 words | C9-words.md | 47 | 0 | 5 | 20 | 22 | 4 |

About 203 findings. No finding loses saved workouts.

## Answers the owner asked for
- **Drop sets "imported as warm-ups" (C4):** the import is correct (all 418 drop sets arrive as drop
  sets). Hevy itself saved the last curl set of one Pull 2 workout (22 Aug) and his Hevy "Pull 2"
  routine as a warm-up. The real ForgeAI bug nearby: a drop row's PREVIOUS can show a normal
  set's numbers when the routine's drop sits elsewhere than last time (C1-3, C4) — wave 2.

## Fix order
- 0018 server rules (C8-1/2/3/4/7/11) — DONE: reviewed, APPLIED LIVE 16 Oct (5 test files pass on the live DB, 138 checks); admin app freeze fix a31bbd3 deployed first.
- Wave 1 — C1 + C2 (member app tracker) — helper running.
- Wave 2 — C3 + C4 (suggestions, routines, import, PREVIOUS matching) after wave 1 (same files).
- Wave 3 — C7 admin app (money first) — helper running; any 0019 migration is applied live by me after CI.
- Wave 4 — C6 gym side, C5 notifications (native: cloud builds), C9 words.
- Then: full phone run (owner profile, API 34) + API 35/36 runs from phase B; tag; APK link.

## Owner decisions collected
- C8-5 check-in privacy: confirm a member's number at the desk (or OTP) before showing name/plan.
- C8-6 join codes: 8 characters for NEW gyms (printed posters keep working) + rate limits.
- Differences from Hevy listed in C1 (16), C3 (9), C2: approve or reject.
- Hevy screen recordings (full workout + settings) for a real behaviour table.
- UAT F-12 (17 Oct, for the gym's accountant): should each receipt round its GST to the whole rupee? Today it is kept to the paisa (Rs 71.43 on Rs 1,500 at 5%); Section 170 rounds the tax paid in the return. Unchanged until the accountant says so (Audit/uat/MONEY-ACCESS.md).
