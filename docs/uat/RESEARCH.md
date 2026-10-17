# UAT research (17 Oct 2026) — how professionals run full-coverage UAT, applied to ForgeAI

Source: research helper, 17 Oct 2026 (web, cited). Owner asked: "research and plan a full coverage
professional UAT", then "complete everything and start executing that UAT".

## Structure (ISTQB / ISO/IEC/IEEE 29119-3, small-team cut)
- Acceptance testing = formal testing against user needs and business processes; acceptance
  criteria = exit criteria the user must see met. UAT is one kind (also contract, regulatory,
  operational). https://astqb.org/assets/documents/Glossary-of-Software-Testing-Terms-v3.pdf
- 29119-3:2021 replaced IEEE 829: Test Plan (risk register, strategy, entry/exit) + Test Completion
  Report. Small team: mandatory fields only = 1-page plan + 1-page completion report.
- Scenario (business goal end to end, Given/When/Then) is not a test case (scripted steps). Build
  scenarios with Example Mapping (rules, examples, questions). https://site.draft.io/example-mapping/
- Traceability matrix, 6 columns: story id | scenario id | automated flow | evidence link | status |
  sign-off. Coverage = % stories with a passing scenario; also trace back to find orphan tests.
- Entry: build passed QA, no open P0/P1, production-like env, seeded data. Exit: pass rate threshold,
  no open P1/P2, owner sign-off recorded.
- Severity (impact) and priority (fix order) are separate. ForgeAI: wrong money, gym-to-gym leak or
  data loss = S1 automatically. P1/P2 block release unless workaround + fix date.
- Sign-off page: Go / Go with conditions / No-go first; open defects + workarounds, not tested,
  residual risk, rollback, named owner. Never invent pass rates.

## Deriving "full" coverage
- Actors: member (solo, gym member), owner, front desk, OTHER gym's owner (isolation), signed-out.
- Story map (Patton): activities along the top; every scenario under one; empty column = gap.
- CRUD x role x gym matrix (OWASP WSTG role definitions): ~10 entities (member, plan, membership,
  payment/receipt, due, attendance, enquiry, expense, staff, order) x C/R/U/D x 4 roles; every
  "other gym" cell = deny. Mostly SQL tests.
- State models: 0-switch = every valid transition once; invalid transitions from a state TABLE, one
  per case; 1-switch only where risk is high. https://tmap.net/wiki/state-transition-testing
- Risk = likelihood x impact (ISTQB); high first and deepest.
- Pairwise (NIST: 93% of failures are 2-way): Microsoft PICT over API {34,35,36} x font {1.0,1.3,2.0}
  x width {360,411} x network {online,offline,flaky} x TZ {IST,UTC} x battery saver -> ~12 runs, not 324.
- Boundaries: Rs 0 / 1 / max, part payment, overpayment, plan ending today, 23:59 vs 00:00 IST,
  31 March FY rollover, double tap on Collect, offline replay, revoked staff login.
- Report 3 numbers per release: story coverage %, CRUDxrole cells asserted %, transitions covered %.

## Mobile dimensions (Google Core App Quality + OWASP MAS)
- https://developer.android.com/docs/quality-guidelines/core-app-quality : Consistent_UX
  (interruptions), App_Switcher / Sleep_Resume / Lock_Resume, State_Preservation (process death),
  Power_Management (alarms/notifications in Doze: rest timers!), Runtime_Permissions,
  Graceful_Degradation, Notification_Quality, Touch_Target_Size 48dp, Visual_Contrast,
  Content_Description, Stability_ANR.
- OWASP MAS checklist https://mas.owasp.org/checklists/ : STORAGE (offline cache), AUTH (staff
  sign-in), NETWORK — once a quarter.
- Android 14 exact alarms: SCHEDULE_EXACT_ALARM denied by default on new installs, kept on upgrade,
  denied after a backup-restore -> test rest timers on fresh / upgraded / restored installs.
- Doze: `dumpsys deviceidle force-idle`; `am set-standby-bucket <pkg> rare`; `am set-inactive`.
- Interruptions: `adb emu gsm call <n>`, `adb emu sms send`.
- DND: `cmd notification set_dnd priority|off`; font: `settings put system font_scale 1.3`
  (community sources: verify per API).
- Money format: en-IN lakh grouping, assert exact "Rs 1,00,000" strings.
- External devices: Play internal-track pre-launch report; Firebase Test Lab free 10 virtual +
  5 physical runs/day.

## Multi-actor journeys
- Pattern: seed backend -> Maestro (member) -> Playwright mobile (owner) -> SQL asserts -> Maestro
  (member) again. Run actors in turn from one script; Appium only for truly simultaneous devices.
- Maestro web is beta/Chromium only: keep Playwright for the admin PWA.
- Clocks: Playwright `clock.install` / `setFixedTime` / `fastForward`; DB: pass `now` to RPCs in
  tests; phone: a test-only clock override in the app (changing emulator time needs root).

## Tools that work on GitHub-hosted runners
- Network: `adb emu network speed edge|gsm|up:down`, `adb emu network delay gprs|min:max`; offline:
  Maestro `setAirplaneMode` / `toggleAirplaneMode`, `adb emu gsm data off`.
- Battery: `adb emu power capacity 15`, `power ac off`.
- Permissions: Maestro `setPermissions`; `adb shell pm revoke` mid-session.
- Process death: Maestro `killApp` (= am kill after Home); NOT force-stop. "Don't keep activities".
- Upgrade: install last release APK, seed via flow, `adb install -r` new APK (same key, higher
  versionCode), assert data survived (Chromium update_verification.py pattern).
- TalkBack: needs a Play image; automate labels/contrast, TalkBack pass by hand.
- PWA: Playwright devices[...] + locale en-IN + timezoneId Asia/Kolkata; `context.setOffline(true)`.
- Wear: Health Services synthetic data via adb broadcast; no headless phone+watch pairing in CI.
- Supabase local: `supabase start` / `db reset` + seed / `supabase test db` (pgTAP) in Actions, free.
  Branching costs money (Pro).

## Money and receipts (POS / gym go-live / India)
- Gym go-live checks: freeze moves end date and next due; mid-term upgrade proration; first billing
  runs and debtor reports watched.
- POS: refund <= paid; void needs reason + approval + audit row; receipt fields; offline sales sync
  once; end-of-day totals by method reconcile; supervisor-only voids.
- GST Rule 46: legal name, address, GSTIN, consecutive invoice no. unique per FY (<=16 chars, letters
  digits - /), SAC, taxable value, rate, amount. Section 170: round tax to nearest rupee.
- Gym GST: 5% without ITC from 22 Sep 2025 (56th GST Council). ForgeAI gst.ts ALREADY does this
  (GYM_SAC_CODE 999723, legacy 18% before the cutover) — checked 17 Oct.
- Audit trail (Companies Accounts Rules 3(1), FY 2023-24 on): accountants expect an edit log.
- ForgeAI money criteria: paid + due = price in paise; no duplicate from double tap / offline
  replay; receipt numbers gapless per gym per FY, reset 1 April; every change leaves an audit row;
  front desk cannot cancel receipts; dashboard = Excel export = sum of receipts; lakh format; IST days.

## Ranked recommendations (effort)
1. Money-correctness SQL suite (paid+due=price, no duplicates, gapless receipt nos per FY, audit
   rows) — 2-3 days.
2. CRUD x role x gym isolation matrix as SQL allow/deny — 2 days.
3. One-page traceability sheet with coverage printed by CI — 1 day, then ~15 min/release.
4. Multi-actor golden journeys (seed -> Maestro member -> Playwright owner -> SQL -> Maestro) x5 —
   3-4 days.
5. Rest timer under Doze / standby rare / DND / lock, fresh vs upgrade vs restore — 1-2 days.
6. Upgrade test v(N-1) APK -> v(N) with data and an open workout — 1 day.
7. Process death (killApp) in live workout, mid-payment form, mid-import — 1 day.
8. Network shaping + airplane toggle mid-sync, assert no server duplicates — 1 day.
9. Fixed clocks: midnight IST, plan expiry, 31 March rollover — 2 days.
10. GST/receipt acceptance (Rule 46 fields, rounding, rate, lakh format) — 1 day.
11. Membership + workout state tables, 0-switch + invalid transitions — 1-2 days.
12. PICT pairwise environment matrix — 0.5 day.
13. Owner UAT kit: 12-line checklist, 60-min exploratory session, 1-page Go/No-go — 0.5 day/release.
14. Accessibility: axe on admin (exists), label/touch-target lint on phone, 20-min TalkBack by hand.
15. Play pre-launch report + Firebase Test Lab free runs; OWASP MAS pass quarterly.
