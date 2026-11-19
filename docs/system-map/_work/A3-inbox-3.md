# A3-inbox-3 checkpoint

Source: docs/system-map/_sources/owner-inbox-redacted-part03.md (600 lines, read top to bottom in 100-line slices). Status: ALL UNITS DONE (19 Nov 2026).
Output: docs/system-map/_work/out/A3-inbox-3.jsonl (9 feature rows, 12 finding rows).

Format: source line - feature the note names - matched feature id(s) / new row / finding.
Not features (no row): the testers Google group (4), logo choice (13), Play Store ID (99), Gemini word check on the laptop (109), rep advice (261), brand name research (374-483), branch pricing (541), setup tasks with keys.

## Unit 1: lines 1-100 DONE
- 27 Continue with Google for members - matched F-phone-1520, F-phone-1606
- 27, 533 Google Drive backup, automatic backup after every workout - matched F-phone-1525, F-phone-1526 (upload hidden), F-phone-1623; finding 08
- 39 Branches: per-branch members, money, staff, receipt numbers; train at another branch; All branches page - matched F-panel-103, 104, 106, 107, F-hq-105
- 40 Online terms tick before a gym is created; existing owners once - matched F-panel-1001, F-panel-1016, F-server-336 (row status unknown: its file header says not applied, the note says live 24 Oct)
- 41 Members' workouts on our server, back on a new phone - matched F-server-334, F-phone-1623, F-phone-1408
- 42 Import fixes: Paid column, branch column, extra columns kept, bad rows listed - matched F-panel-221, F-panel-223
- 46 Delete my account - matched F-phone-1623, F-server-334
- 47 Gym can download everything - matched F-panel-322
- 48 Data agreement own page at Create my gym - matched F-web-139, F-panel-1016
- 49 AI import hides names and addresses - matched F-panel-222 (deploy/panel/aiMatch.js:4)
- 58 rest timer, supersets, plates, warm-ups, swap, targets, charts, records, body map, Hevy/Strong import, Health Connect, watch - matched F-phone-1009, 1125, 600, 1012, 1007, 105, 916, 1103, 114, 1224, 1212
- 62 Monthly gym challenge with ranking - matched F-panel-207, F-panel-208
- 63 How busy is the gym now - matched F-phone-318
- 64 Gym logo on share pictures, before/after - matched F-phone-1132, F-phone-1134
- 65 Bring a friend - matched F-panel-204, F-panel-205
- 66 Strength level - matched F-phone-921
- 67 Badge shelf - matched F-phone-902
- 68 Muscles ready today - matched F-phone-128
- 69 Quick workout - matched F-phone-929
- 70 Gym's form videos - matched F-panel-732, F-phone-414
- 71 Ask your trainer (parked) - partly built anyway: matched F-panel-1124
- 72 Ask your own AI - matched F-phone-901
- 73 Ask the desk to freeze or renew - matched F-phone-314, F-panel-719
- 74 Steps and water - steps matched F-phone-1227; water NEW F-phone-3900, finding 01
- 75 Gym's workout of the day - matched F-phone-413, F-panel-337
- 76 Treadmill and cycle details - matched F-phone-907
- 77 Stronger than X% of your gym (parked) - NEW F-phone-3906, finding 05
- 78 1-rep max and % calculator - matched F-phone-113
- 79 Feed of your gym (parked) - NEW F-phone-3904, finding 05
- 80 Compare with a friend (parked) - NEW F-phone-3905, finding 05
- 81 Log sets on the watch (parked) - built anyway: matched F-phone-1213
- 88 Step challenge across the gym (parked) - NEW F-phone-3907, finding 05
- 100 Settings, Export and import - matched F-phone-131, F-phone-1510

## Unit 2: lines 100-222 DONE
- 119 Free trial 3 months, HQ extends to 6 with a reason, days left on Today - matched F-hq-109, F-panel-534 (3 and 6 months confirmed in 0030 and deploy/hq/api.js:460)
- 119 Nothing locks at trial end - finding 11
- 119 HQ records a gym's pack and paid-until - matched F-hq-110 (the AI pack named in the note is retired, shown as Pro)
- 120 Landing page, Start free sign-up, HQ search, filters, export - matched F-web-102, F-panel-1001, F-hq-104, F-hq-106
- 129-134 HQ shows gym facts only; support look 1 hour; emergency 15-60 min; owner sees every look - matched F-hq-118, F-panel-1017, F-panel-219; website promise: finding 06
- 141 Automatic reminders, phone sets them at 9:30 am, one a day; owner's switches - matched F-panel-609, F-panel-305, F-phone-1420 (apps/mobile/src/shop/autoReminders.ts:9)
- 149 HQ sign-in with the owner's Google account - matched F-server-200 (passkey and 2-step are Google's own)
- 166 HQ counts per gym (members, check-ins, shop orders, takings, wrong codes, feedback, leads, AI use) - matched F-server-203, F-hq-120; app versions: finding 10
- 171 HQ actions: check or pause a gym, gym from a lead, reset owner sign-in, delete requests, AI limits - matched F-hq-111, F-hq-107, F-hq-112, F-hq-126, F-hq-114; export a gym's data NEW F-hq-3903, finding 04
- 175 HQ log kept 2 years - matched F-hq-132, F-server-329
- 176 New gyms limited to 5 an hour - matched F-panel-1001 (0033 line 138)
- 185-221 Workouts on our server - matched F-server-334

## Unit 3: lines 223-372 DONE
- 230 Ready messages English and Hindi, who gets it, WhatsApp send-to-next, menu item, Today nudges - matched F-panel-726, F-panel-608, F-panel-1120, F-panel-327
- 235 Show my workouts to the desk with a code - matched F-phone-336 (removed), F-panel-237; finding 07
- 238 Counts only on a check-in day, 20+ min, 6+ sets - matched F-phone-426 (apps/mobile/src/shop/workoutCode.ts:16)
- 242 Reprinted receipt says Extended free by N days (reward) - in code (crm/logic/receiptDoc.ts:213); part of F-panel-1121
- 245 Join the offer, progress, Give button, group messages, message at a chosen time - matched F-phone-426, F-panel-1121, F-panel-608, F-panel-303
- 248 Pop-up notifications, automatic birthday, plan-ending, welcome - matched F-panel-609, F-panel-610
- 250 Give the days by themselves or I give them - matched F-panel-1121 (crm/logic/workoutOffer.ts:43)
- 253 Leave the offer, dates deleted, 90 days - matched F-phone-426 (0025 line 53)
- 273 Targets, add weight at top of range - matched F-phone-1007, F-phone-1116
- 290 AI import: file, preview, undo, extra fields on member page, duplicates, 20 reads a day, Gemini then Claude - matched F-panel-221, F-panel-222, F-panel-224 (aiMatch.js:44, MemberDetail.tsx:714)
- 290 Photos of a register - NEW F-panel-3902, finding 03
- 306 Mr. Ramesh name fix - in code (crm/logic/members.ts:135); F-server-319
- 323-346 Trainer view, Trainer tick, Ask my trainer, join-screen line, Share my workouts switch - matched F-panel-1124, F-panel-1025, F-panel-523, F-phone-421, F-phone-310
- 352 Count reps by listening (cancelled) - NEW F-phone-3908, finding 05

## Unit 4: lines 373-600 DONE
- 480-482 One app; owners use the browser, add to home screen, offline - matched F-panel-320, F-panel-1022, F-web-100
- 501-507 Sign-in choices: Google, gym code, no account - matched F-phone-1600, F-phone-400
- 505 Limits without a gym, switched from HQ, tell your gym button - matched F-phone-1701, F-phone-333; finding 09
- 517 Join by email match - NEW F-phone-3901, finding 02
- 518 Email box on add member - matched F-panel-406
- 568 Branch switch, All branches, import branch column - matched F-panel-103, F-panel-107, F-panel-223
- 578 Landing page: gym name and colour demo, Member Facts, Free demo form, Hindi - matched F-web-102, F-web-103, F-server-140
- 598 Send feedback, type or speak, both apps - matched F-phone-1401, F-phone-1713, F-panel-1135; finding 12

## Could not check
- Whether each matched feature really works when driven (code read only).
- Item 39 is cut off at line 600 (the rest of the feedback loop plan is in another part).
- The live database state for 0032 and 0033 (rows say header "not applied", the note says live): not queried.
- Privacy and agreement wording quoted in the notes (lines 46-47, 253-254) against the live legal pages: left to the legal lens.
