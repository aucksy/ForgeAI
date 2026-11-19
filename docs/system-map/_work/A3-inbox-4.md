# A3-inbox-4 checkpoint

Source: docs/system-map/_sources/owner-inbox-redacted-part04.md (600 lines) and part05.md (7 lines). Both read top to bottom.
Output: docs/system-map/_work/out/A3-inbox-4.jsonl (4 feature rows, 6 finding rows).

## Unit 1: part04 lines 1-200 — FINISHED
- L27 floating feedback button, voice in Hindi or English or typing — matched F-phone-1400, F-phone-1401
- L5-7 reply to the sender in the app — matched F-hq-123, F-phone-1402
- L2 feedback sorted bug / idea / question / praise — matched F-server-205, F-hq-122
- L28 twice-a-day reader on his PC, L33-35 testers-first rollout — a working process, not product code: could not check
- L46-48 tick box at Create my gym, date and version kept, shown in Settings — matched F-panel-1001, F-panel-1016, F-server-336 (FINDING 05: server file still says not applied; live function list has owner_terms and owner_accept_terms)
- L55-57 complaints contact in privacy notice and both apps — matched F-web-139; member app part FINDING 06
- L69 AI import of other software's sheets — matched F-panel-222, F-panel-700
- L89/L185 nightly backup — matched F-server-227, F-server-421
- L93 crash and site-is-down alerts — matched F-server-115 (crash); outage watch is the scheduled cloud job (.github/workflows/watch.yml:4), no feature id searched further
- L104 AI that answers owners and members — matched F-panel-218, F-phone-1403
- L147 Starter list (members, plans, dues, GST receipts, QR and desk check-in, offline desk, expiry and stopped-coming lists, WhatsApp, messages to phones, member app, AI import) — matched F-panel-1110, F-panel-1112, F-panel-1113, F-panel-629, F-panel-201, F-panel-502, F-panel-202, F-panel-230, F-panel-1120, F-panel-222
- L148 Pro list (logo and colours, shop, challenges, leaderboard, workout offer, trainer plans, diet plans, measurements; later: numbers, bring a friend, paying in the app, entry gate) — matched F-panel-1105, F-panel-1119, F-panel-1127, F-panel-208, F-panel-1121, F-panel-1125, F-panel-210, F-panel-239, F-panel-509, F-panel-205, F-panel-1114, F-panel-1133
- L147-157 Starter / Pro split — matched F-panel-124 (switch off; already written up as FN-A3-website-1-07, not repeated)
- L149 Pro + AI pack — NOT FOUND (retired) -> F-web-4002, FINDING 03
- L150 Own it (on request only) — matched F-hq-110 (set by hand as Pro)
- L151 founding gyms 29,999, first 25, until 31 Mar 2027 — matched F-server-500 (numbers equal in packages/theme/src/plans.ts:145)
- L152 extra branches half price — matched F-hq-105; switching offer — NOT FOUND -> F-web-4003, FINDING 04
- L146/L156 prices 999 / 9,990 / 1,499 / 14,990 — equal to packages/theme/src/plans.ts:116
- L163 member app 18 and over — matched F-phone-400, F-phone-310 (also asked before Google sign-in)
- L195 gym workout plans, kg to beat, My membership, check-in offers the workout — matched F-panel-1125, F-phone-716, F-phone-313, F-phone-308

## Unit 2: part04 lines 201-400 — FINISHED
- L204/L220 Google's robot tries each release on real phones — test tooling, not a user feature (test-lab workflow exists); no row
- L251 "Camera not allowed" with Open settings — matched F-phone-1730
- L260-265 Cancel receipt — matched F-panel-423
- L274 My membership — matched F-phone-313, F-phone-409, F-server-319
- L278 workout plans from gym or trainer — matched F-panel-339, F-panel-341
- L281 trainer's own staff login — matched F-panel-1008
- L282 members, plans, renewals, dues, receipts, expenses, enquiries, reports, staff roles, QR check-in, ID card, shop with stock, typed WhatsApp — matched F-panel-1110, F-panel-1112, F-panel-1113, F-panel-217, F-panel-211, F-panel-509, F-panel-1018, F-phone-308, F-panel-511, F-panel-801, F-panel-725
- L287 entry machine — matched F-panel-1133 (behind switch, as the note says: planned)
- L288 automatic reminders — matched F-panel-609 (built since the note)
- L289 Today tiles Ending today / 1-3 / 4-7 / 8-15 — matched F-panel-325 (apps/dashboard/src/crm/logic/homeTiles.ts:103)
- L290 class booking — NOT FOUND -> F-phone-4001, FINDING 02
- L291 diet plans — matched F-panel-210; L292 trainer schedules — matched F-panel-330
- L293 staff salaries — the note says left out on purpose; not found as a feature (only an expense category); no row
- L294 several branches — matched F-panel-103, F-panel-104
- L295 webcam photo — matched F-panel-409; L296 measurements by the gym — matched F-panel-239
- L297 AI assistant for the owner — matched F-panel-1130; L298 offline admin app — matched F-panel-502
- L299 member's payments in the app — the note says left out on purpose; no row
- L303-334 owner inbox page, L336-396 split test runs — owner tooling and test tooling, not product; no row

## Unit 3: part04 lines 401-600 and part05 — FINISHED
- L407 "workouts never leave the phone" promise — out of date by design: workouts now save to the member's account (apps/mobile/src/cloud/accountWords.ts:18); the remaining "stay on this phone" words are about photos only; no finding
- L425 best times to go from check-ins — matched F-server-408, F-phone-1220
- L436-440 exercise-hour advice, opt-in sharing — matched F-server-417, F-phone-1235, F-panel-206 (built with the owner's machine counts, per a later decision)
- L451 QR poster opens Check in — matched F-phone-116, F-phone-308; L453 ready Push Pull Legs, Upper/Lower, Full Body plans — matched F-panel-340
- L470-473 after check-in: Start today's routine / Back to your workout / Add Push Pull Legs — matched F-phone-308 (apps/mobile/src/shop/checkIn.ts:225)
- L458 door opens from the scan, L463 changing QR — described as waiting / an idea only; entry machines F-panel-1133; no row for the changing QR
- L476-482 location check at the QR scan — NOT FOUND -> F-phone-4000, FINDING 01
- L484 Pass member — matched F-server-424, F-panel-313
- L492 gym kept in this browser only — matched F-panel-1020; L494 payment resent once, never twice — matched F-panel-1023, F-server-314
- L497-503 offline front desk, banner, greyed-out buttons — matched F-panel-502, F-panel-1022, F-panel-1023
- L533-540 My membership card details and name-match safety — matched F-phone-313, F-server-319
- L565 competitor gap list (reminders, AI chat, expiring split, class booking, trainer section, salaries, branches, webcam, birthday wishes) — all handled above; birthday wish matched F-panel-610
- L585-597 entry machine research (Matrix kit, turnstile) — matched F-panel-1133, F-panel-215 (hidden)
- part05 L3-5 entry machine brands — same, matched F-panel-1133

## Counts
Named: 62 features. Matched: 54. Not found, rows written: 4 (F-phone-4000, F-phone-4001, F-web-4002, F-web-4003). Named as left out on purpose or tooling, no row: 4.
Findings: 6 (S2: 1, S3: 5).

## Could not check
- The twice-a-day feedback reader and the testers-first 24-hour rollout: they run on his PC and in the Play Console, not in this repo.
- Whether the nightly backup really stored a copy last night (needs the live HQ server; code only was read).
- Whether the "not applied" first lines of other server files are also stale: only the terms file was checked against the live function list.
- Whether the changing QR or the door-open scan are wanted: the note leaves them as ideas.

ALL UNITS DONE.
