# ForgeAI UAT plan (17 Oct 2026)

Owner, 17 Oct: "research and plan a full coverage professional UAT", then "complete everything
that you have and then start executing that UAT". Method: ISO/IEC/IEEE 29119-3 small-team cut
(1-page plan + 1-page completion report), scenarios in Given/When/Then, a traceability sheet,
risk-based order. Research and sources: RESEARCH.md. Task inventory: INVENTORY.md (+ the
sub-reports summarised in FINDINGS.md). Live progress: STATUS.md.

## 1. Scope
- Member app (Android phone), every role variant: solo member, gym member.
- Admin app (website / installed app): owner, front desk.
- Server (Supabase): every function and table, per role and per gym.
- Watch app (Wear OS).
- Cross-role chains: owner <-> member <-> front desk through the server.
- Out of scope today (hidden features): AI coach, Drive backup, gym sync, nutrition. Each gets
  a UAT section the day its switch is turned on.

## 2. Actors (personas)
| Actor | Who | Device |
|---|---|---|
| Solo member | Trains alone; Hevy/Strong history | His Pixel profile: 360 dp, font 1.3, IST |
| Gym member | Joined a gym; shop, check-in | Same |
| Owner | Runs the gym; money, staff | Phone browser (installed admin app) + PC |
| Front desk | Staff with fewer rights | Phone browser |
| Other gym's owner | Isolation check only | Server tests |
| Watch wearer | Pixel Watch with the ForgeAI watch app | Real watch (owner check) |

## 3. Severity and gate
- S1 = money wrong, one gym reaching another's data, data loss. Blocks release, always.
- S2 = the main loop broken or a silent failure (alert missing, set lost, cash can vanish).
  Blocks release unless a workaround + fix date is written.
- S3 = wrong or confusing, workaround exists. S4 = cosmetic.
- Entry to UAT: CI green, full phone runs green on both profiles (release gate, phone_gate.py).
- Exit (Go): every H-risk scenario passes or has a written workaround; no open S1; S2 only with
  workaround + date; owner checklist signed. Report: Go / Go with conditions / No-go.

## 4. How scenarios are derived (so "full" is provable)
1. Task inventory per actor (INVENTORY.md): every goal-level task, its states (empty, 0/1/many,
   offline, permission denied, error path), risk H/M/L, and what covers it today.
2. Lifecycle state tables: workout, membership, receipt, enquiry, gym link, shop order,
   check-in. Every valid transition once (0-switch); one invalid transition per risky state.
3. CRUD x role x gym matrix on the server (412 cells today; uat_access_matrix.sql).
4. Environment pairs (PICT): Android 34/35/36 x font 1.0/1.3/2.0 x width 360/411 x network
   online/offline/flaky x time zone IST/UTC x battery saver -> ~12 runs, not 324.
5. Boundaries: Rs 0 / 1 / max, part payment, overpayment, plan ending today, 23:59 vs 00:00 IST,
   31 March year-end, double tap, offline replay, revoked staff.
6. Google Core App Quality + OWASP MAS items that apply (interruptions, process death, Doze,
   permissions, notifications, storage, auth).

Coverage is reported as 3 numbers each release: tasks with a passing scenario (%), matrix cells
asserted (%), state transitions driven (%). The traceability sheet (TRACE.md, generated) links
task id -> scenario -> test -> last run -> status.

## 5. Test layers (who proves what)
| Layer | Tool | Proves | Runs |
|---|---|---|---|
| Server rules + isolation | SQL tests (supabase/tests) | money, access matrix, orders, check-in | every push (CI) + live loop |
| Logic | vitest (mobile, admin) | rules, words, numbers | every push |
| Member screens | Maestro on the emulator, owner profile | real taps on real screens | release gate (both profiles) |
| Admin screens | Playwright, phone size, en-IN, IST | real taps, forms, money | every push (new) |
| Cross-role journeys | script: seed -> Maestro member -> Playwright owner -> SQL check -> Maestro member | the whole business chain | release gate (new) |
| Phone conditions | adb: airplane / slow network, am kill, Doze, standby rare, DND, upgrade install | real-life breakage | release gate (opt-in parts become gate parts) |
| Owner acceptance | 12-line checklist + one real workout + one front-desk hour | what only a person can judge | each release |

## 6. Work packages (execution order = risk)
| WP | What | Closes |
|---|---|---|
| 1 | Money SQL suite | DONE 17 Oct (uat_money.sql, 61 checks) |
| 2 | Access matrix + shop/messages/orders | DONE 17 Oct (412 cells + 66 checks) |
| 3 | Fix the money/server findings F-01..F-14 (migration 0021 + admin app) | F-02, F-03 (S2) first |
| 4 | Member destructive + never-pressed flows (Maestro): erase (solo/gym), remove demo, delete workout, import Replace + Undo, save history, edit/log past workout Save, Update routine, remove set + Undo, start while open, rest-alerts-off bar, restore checks units/routines/photos | U-M3, U-M4 |
| 5 | Admin Playwright journeys driving real forms: add member, sell (full/part/0/discount), collect, cancel receipt, renew early, freeze, cancel + undo, enquiry -> member, expenses, staff sign-in + refusals, import + undo, load demo / erase confirm, dark/light | U-A2, U-A3, U-A6 |
| 6 | Cross-role journeys: gym create -> join -> order -> owner ready/handed over -> member sees; gym cancel -> stock back; message -> inbox -> seen; poster -> check-in -> owner sees visit; plan sold -> check-in "active" | chains 1-15 |
| 7 | Phone conditions: offline + flaky network mid-order / check-in / leave; process death in live workout and mid-import; upgrade v0.45 -> v0.46 with data + open workout; Doze / standby rare; exact alarm after restore | A-gaps 4, 7, 10 |
| 8 | Watch fixes U-W1..W3 + watch tests in the release build (U-W4) + bridge-tag checks (U-W5) | U-W* |
| 9 | Gym-side fixes: Leave with an open order (U-G1), Settings "Your gym" shows the joined gym (U-G2), receipt shows who took the money (U-A1) | U-G1, U-G2, U-A1 |
| 10 | Fixed clocks: midnight IST, plan expiry, 31 March, 1st of month / Monday | boundaries |
| 11 | Traceability sheet generator + 3 coverage numbers printed by CI | reporting |
| 12 | Owner UAT kit: 12-line checklist, exploratory session sheet, Go/No-go page | owner sign-off |
| 13 | Accessibility: labels/touch-target lint on the phone; TalkBack pass by hand | a11y |
| 14 | Pairwise environment matrix (PICT) feeding qa-device api/profile runs | env |
| 15 | External: Play pre-launch report, Firebase Test Lab free runs, OWASP MAS quarterly | devices |

## 7. Owner-only checks (cannot be automated)
1. Real watch: rest ends -> one buzz (not zero, not two), with the phone in hand and in pocket.
2. Hear the rest sound in the gym; ringer on vibrate -> buzz only.
3. Import your own Hevy export once.
4. One full real workout on your phone with the new release.
5. One hour at the front desk on the admin app (sell, collect, print, check-in).
6. Approve or reject the listed differences from Hevy.

## 8. Reporting
- Per release: UAT-REPORT-<tag>.md: verdict first, the 3 coverage numbers, open S1/S2 with
  workarounds, not tested, owner checks pending. Never an invented pass rate.
