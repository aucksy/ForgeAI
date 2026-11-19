# A3-help checkpoint (source: deploy/panel/helpArticles.js + helpPages.js)

Status: ALL UNITS DONE (2026-11-19). Output: docs/system-map/_work/out/A3-help.jsonl (1 feature row, 7 finding rows).

Method: read the source top to bottom (lines 1-1029, and helpPages.js 1-98). Each article's features searched in
features.json by the user's word and the screen. Extra machine pass: every "quoted" button or label in the articles
(about 560) was searched in apps/dashboard/src, apps/mobile/src and packages; 4 real misses (lines 311, 503, 518 wording, 11 note).

Format: article id (source line) : feature named -> matched feature id(s)

## Unit 1: owner articles, lines 15-520 (done)
- today-page (18): Today page -> matched F-panel-507; quick actions / Change buttons -> matched F-panel-722; Requests from the app approve/decline -> matched F-panel-719; cards (money to collect, losing the habit, birthdays, enquiries to call) -> matched F-panel-325, F-panel-327; Last week share on WhatsApp -> matched F-panel-735
- set-up-your-gym (31): Set up your gym steps and ring -> matched F-panel-324, F-panel-1118; join-online step -> matched F-panel-312 (behind switch)
- needs-you-alerts (43): Needs you card, red number, tab title, Turn on alerts -> matched F-panel-711, F-panel-505
- bell-to-do-list (56): bell list, X, Undo, History 7 days -> matched F-panel-604 (7 days confirmed in alertInbox.ts)
- add-a-member (66): add member -> matched F-panel-406; sell membership -> matched F-panel-414; search and filter members -> matched F-panel-301
- renew-or-take-payment (80): renew -> matched F-panel-415; collect payment -> matched F-panel-401; Money > Dues -> matched F-panel-308
- online-payments (90): UPI QR -> matched F-panel-125; payment company link (Razorpay/Cashfree) -> matched F-panel-126, F-server-126 (FINDING 01: test mode only); Paid online, receipt not made -> matched F-panel-402 (string found in pay/PaidOnline.tsx)
- member-page-tools (101): check in -> matched F-panel-226; freeze / extra days -> matched F-panel-404; member card -> matched F-panel-511; share app link -> matched F-panel-229; body measurements -> matched F-panel-239; request workout report -> matched F-panel-631; archive / restore -> matched F-panel-227
- money-and-receipts (116): Collections -> matched F-panel-307; receipt print / WhatsApp -> matched F-panel-319; Dues -> matched F-panel-308; Download Excel file -> matched F-panel-307; Cancel receipt -> matched F-panel-236
- check-in-at-the-desk (128): Visits check someone in -> matched F-panel-201; Check-in QR poster -> matched F-panel-814; app check-in -> matched F-phone-116; Losing the habit tab -> matched F-panel-202
- pass-members (141): Comes with a pass -> matched F-panel-411; Pass visit -> matched F-panel-226; Pass visits page + Excel -> matched F-panel-313
- import-members-from-excel (153): import, column match, check list, undo, no Aadhaar/PAN -> matched F-panel-221, F-panel-1111 (importIds.ts confirms Aadhaar/PAN rule)
- plans-and-prices (166): add plan, joining fee, starter price list, not for sale, PT plan -> matched F-panel-1112
- send-messages-to-members (181): Messages & offers, send in the app, schedule, WhatsApp one by one -> matched F-panel-303, F-panel-1120; Reminders tab -> matched F-panel-305
- workout-offer-admin (194): workout offer -> matched F-panel-1121 (status unknown in features.json)
- enquiries (206): enquiries list, follow-up, mark joined, not interested, where enquiries came from -> matched F-panel-211, F-panel-1116
- bring-a-friend-admin (219): free days per friend, Thank page, Give -> matched F-panel-204, F-panel-205
- join-online-admin (229): join link, WhatsApp number check, pick plan, Joined online, Make member -> matched F-panel-1117, F-panel-701
- join-pay-online-admin (238, onlyWhen JOIN_PAY, off): two payment switches, Paid online approve -> matched F-panel-127, F-server-108 (article correctly held back)
- ai-assistant (252): AI Assistant ask/task, voice, credits, AI workout plan 3 credits, no diet plans -> matched F-panel-537, F-panel-200, F-panel-1130 (3 credits and "cannot write diet plans yet" confirmed)
- plus-lock-admin (267, unreleased): MettleUp Plus lock -> matched F-panel-317, F-panel-533 (article correctly held back)
- expenses-and-profit (279): expenses, profit, by category -> matched F-panel-217
- workout-plans-for-members (292): workout plans build and send -> matched F-panel-1125, F-panel-338; workout of the day -> matched F-panel-337
- diet-plans-for-members (306): diet plans -> matched F-panel-526 (FINDING 05: wrong button name)
- trainers-and-personal-training (319): trainer pages, PT bookings -> matched F-panel-330, F-panel-1123
- my-members-trainers (331): My members progress -> matched F-panel-311, F-panel-523
- answer-member-questions (344): Member questions -> matched F-panel-318
- answer-member-messages (360): Member messages reply, mark done, name hidden -> matched F-panel-300, F-panel-1122
- member-messages-who-reads (375): who reads what -> matched F-panel-522; 180-day delete -> matched F-panel-1122 (FINDING 02)
- member-progress-card (388): Progress card on member page -> matched F-panel-831, F-panel-705
- challenges-and-leaderboard (399): challenges, ready-made, leaderboard, copy list -> matched F-panel-527, F-panel-208 ("within 10 minutes" matches the phone's 10-minute refresh)
- shop-orders-and-products (411): orders -> matched F-panel-800; products, stock, hide -> matched F-panel-801
- invite-poster-and-gym-code (422): invite poster, link, gym code -> matched F-panel-1117
- member-cannot-join (436): turn on the member app, gym code, 18+ tick -> matched F-panel-804, F-phone-1421
- gym-settings-admin (447): Settings three tabs, language, install card, gym details -> matched F-panel-320, F-panel-501; Member app tab -> matched F-panel-321; Sign-in & data: backup, records, clear offline copy, delete our gym -> matched F-panel-322, F-panel-528
- gym-timings-and-busy-machines (459): gym timings -> matched F-panel-1132; busy machines -> matched F-panel-206
- gym-web-page (469, onlyWhen GYM_PAGES, off): gym web page -> matched F-panel-334 (article correctly held back)
- branding-logo-colours (482): branding, logo box removal, colour, headings -> matched F-panel-1105
- staff-and-sign-in (498): add a person, sign-in code, Set my PIN, sign out other devices -> matched F-panel-1000, F-panel-1004, F-server-311 (FINDING 04: wrong label and choices)
- your-growth-report (511): Your growth, print/PDF, share, Excel -> matched F-panel-614; Add old records -> matched F-panel-614 (FINDING 06: wording)

## Unit 2: member articles, lines 522-955 (done)
- join-your-gym (524): scan the poster / gym code -> matched F-phone-1421; check in by QR -> matched F-phone-116; Recommend MettleUp to my gym -> matched F-phone-432
- my-membership (543): My membership -> matched F-phone-409; pause / renew request -> matched F-phone-410; gym timings -> matched F-phone-229; diet plan -> matched F-phone-325
- bring-a-friend (555): invite a friend, friends who joined -> matched F-phone-428
- gym-reminders-and-messages (566): workout reminders -> matched F-phone-1218; reminders/messages from my gym -> matched F-phone-1235; gym inbox bell -> matched F-phone-323
- gym-shop-order (576): shop, bag, my orders, cancel -> matched F-phone-138
- gym-privacy-and-leaving (589): what my gym can see, leaderboard name, gym mates, share with trainers -> matched F-phone-217, F-phone-421; gym logo on home screen -> matched F-phone-1223; leave gym -> matched F-phone-312; Ranking -> matched F-phone-137
- message-your-gym (607): Message your gym, who should read it, without my name, write back -> matched F-phone-320
- ask-a-trainer (621): ask a trainer -> matched F-phone-227
- log-a-workout (633): start routine / empty workout, sets, finish -> matched F-phone-1005; PREVIOUS column and its setting -> matched F-phone-1006; exercise History -> matched F-phone-1326
- kg-to-beat-box (652): kg to beat box -> matched F-phone-1116
- routines (663): routine editor -> matched F-phone-1012; Up next / See exercises -> matched F-phone-1113; share / folder / delete -> matched F-phone-1011, F-phone-930
- find-a-plan (683): Build a plan -> matched F-phone-1013; ready programs -> matched F-phone-122; import a routine file -> matched F-phone-622
- past-workouts (701): share as picture/text, repeat, save as routine, edit, delete -> matched F-phone-1127; Calendar and search -> matched F-phone-106; log a past workout -> matched F-phone-732
- progress-and-records (712): Profile chart -> matched F-phone-103; Charts -> matched F-phone-1314; Records -> matched F-phone-1616; Reports -> matched F-phone-108; Badges -> matched F-phone-501
- exercises-and-your-own (733): exercise list and page -> matched F-phone-1326; create own exercise, hide / show -> matched F-phone-110
- body-weight-and-photos (749): body weight and measurements -> matched F-phone-1001, F-phone-1000; progress photos and compare -> matched F-phone-1000
- plates-and-one-rep-max (767): plates and bars, plate calculator -> matched F-phone-1023; 1-rep max calculator -> matched F-phone-113
- rest-timer-and-sound (777): rest timer, sounds -> matched F-phone-1009, F-phone-1203; Do Not Disturb -> matched F-phone-1204
- more-workout-choices (790): next weight, weight step -> matched F-phone-130; muscle tips -> matched F-phone-1022; stuck at a weight -> matched F-phone-1118
- rate-how-hard-rpe (807): RPE -> matched F-phone-1123
- profile-units-weekly-goal (819): edit profile -> matched F-phone-104; units, light or dark -> matched F-phone-214; weekly goal -> matched F-phone-130; share this month -> matched F-phone-1133
- watch-widgets-health (839): install on watch -> matched F-phone-1311; widgets -> matched F-phone-1219, F-phone-1220; Health Connect -> matched F-phone-1224; Sleep and workouts -> matched F-phone-1228
- bring-in-from-hevy-or-strong (858): Hevy / Strong import, Hevy link -> matched F-phone-114
- backup-and-restore (875): account backup, download my data, restore, Drive backup -> matched F-phone-131, F-phone-1413
- spreadsheet-erase-and-app-info (892): spreadsheet -> matched F-phone-1410; erase all data -> matched F-phone-1416; What's new (last 3 updates confirmed) -> matched F-phone-1313; About / Credits -> matched F-phone-133
- ready-today-and-quick-workout (911): muscles ready today, quick workout -> matched F-phone-128
- ask-an-ai (921): Ask an AI -> matched F-phone-132 (privacy line matches the screen)
- find-my-gym-by-number (931, unreleased): Find my gym -> matched F-phone-117 (article correctly held back)
- mettleup-plus (944, unreleased): MettleUp Plus -> matched F-phone-118 (article correctly held back)

## Unit 3: both-apps articles, notes and helpPages.js (done)
- send-feedback (958): help and feedback, speak, round button -> matched F-phone-133, F-phone-1401, F-panel-218; MettleUp access -> matched F-panel-1017
- replies-from-the-team (971): replies, Your questions -> matched F-phone-1402, F-panel-626
- helpPages.js (1-98): help-page answer when no AI credit / day limit -> matched F-server-113, F-web-118
- file notes (6, 10-11, 990): "the help library" -> NOT FOUND in code (new row F-panel-3000, FINDING 03)
- NO_HELP_SCREENS (999-1028): Pay MettleUp, MettleUp receipt, entry machines, AI coach, food logging named as not live -> matched F-panel-314, F-panel-101, F-phone-1505 (all hidden or behind switch, consistent)

## Counts
- Articles read: 71 (67 in the live help, 4 held back by unreleased/onlyWhen). Features named: 146. Matched: 145. New rows: 1. Findings: 7.

## Could not check
- Whether the server parts some live articles rely on are applied on the live database (0045, 0050, 0051, 0053, 0056, 0065, 0069, 0071, 0075, 0098): features.json calls those rows "behind switch"; this step read only the help source.
- The live Worker's switch values (PAY_LIVE, JOIN_PAY, GYM_PAGES): only the repo file was read; the Cloudflare dashboard can override it.
- Whether a payment-company master key is set on the live Worker (decides if "Test and connect" shows at all).
- Nothing was driven on a screen; all checks are code reads.
