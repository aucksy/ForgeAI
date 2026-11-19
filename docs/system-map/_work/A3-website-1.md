# A3-website-1 checkpoint

Source: the website home pages and the Play listing draft. Status: ALL UNITS DONE (19 Nov 2026).
Output: docs/system-map/_work/out/A3-website-1.jsonl (7 finding rows, 0 new feature rows).

Short names: H = apps/dashboard/public/home/index.html, A = apps/dashboard/public/about.html,
C = apps/dashboard/public/contact.html, G = apps/dashboard/public/get-app.html,
L = branding/mettleup/store/listing-draft.txt.

## Unit 1 done: H (gym-owner home page)

- H:561 Hindi / English switch, H:634 type your gym's name and colour -> matched F-web-102
- H:563 Start free (create a gym) -> matched F-panel-1001, F-panel-503
- H:578 See the demo gym -> matched F-panel-108
- H:586 and H:1099 Call me for a free demo (lead form; details deleted within 12 months) -> matched F-web-103, F-server-140, F-server-228 (12-month delete confirmed, deploy/hq/web.js:393)
- H:573 and H:1050 Founding gym, Pro for life, first 25, until 31 Mar 2027 -> matched F-server-500, F-hq-110 (numbers agree with packages/theme/src/plans.ts:145)
- H:672 last time's numbers on every set -> matched F-phone-1006, F-phone-1116
- H:673 kilos to beat, live -> matched F-phone-716
- H:674 new record the moment it happens -> matched F-phone-533, F-phone-706
- H:716 members scan the QR poster once, app opens in the gym's name -> matched F-phone-1421, F-phone-115, F-phone-403, F-phone-1302
- H:719 Pro adds logo and colours -> matched F-panel-1105, F-panel-805 (see finding 07)
- H:725 workout log -> matched F-phone-1005
- H:728 charts, body map, progress photos -> matched F-phone-1106, F-phone-1314, F-phone-112
- H:729 weekly goal, milestones, monthly report -> matched F-phone-130, F-phone-501, F-phone-108
- H:730 trainer's plans arrive by themselves -> matched F-panel-1125, F-panel-339
- H:731 QR check-in and My membership -> matched F-phone-116, F-phone-308, F-phone-409
- H:732 shop: order in the app, pay at the desk -> matched F-phone-138, F-panel-1119
- H:733 gym messages in the app inbox -> matched F-phone-323, F-phone-406 (see finding 05)
- H:734 logs workouts with no internet -> matched F-phone-1005
- H:735 messages pop up on the lock screen -> matched F-phone-1420, F-phone-324
- H:736 and H:776-780 Wear OS watch: next set, dial in 2.5 kg steps, tick saves on the phone, rest timer, heart rate -> matched F-watch-105, F-watch-106, F-watch-101, F-watch-110, F-phone-1213 (watch logging flag is sent on: WearSync.kt:213)
- H:737 trainers see weekly progress, members can turn it off -> matched F-panel-833, F-panel-523, F-phone-217 (member switch confirmed, gym-sees.tsx:18)
- H:739 workouts stay on the phone or in the MettleUp backup -> matched F-phone-1521
- H:784 Pro: watch shows the gym's colour -> matched F-watch-117, F-phone-1214 (see finding 07)
- H:786 iPhone app and Apple Watch coming soon -> not a claim that it exists; iPhone build matched F-phone-1426; no Apple Watch row, none needed
- H:815-866 AI Assistant: ask about the gym, message members, renew a plan, speak in Hindi or English -> matched F-panel-900, F-panel-537, F-panel-902, F-panel-903, F-panel-906, F-server-119
- H:867 AI credits: 20 in the trial, 50 / 100 a month on yearly -> matched F-server-511 (numbers agree with plans.ts:131) (see finding 03)
- H:882 who stopped coming, WhatsApp ready -> matched F-panel-202, F-panel-516
- H:895 import members with AI -> matched F-panel-222, F-panel-1111 (see finding 02)
- H:914 desk works without internet -> matched F-panel-502, F-panel-1023
- H:927 your own shop in the app (Pro) -> matched F-panel-1119
- H:945 free messages, see how many read -> matched F-panel-303 ("Seen by N of M": messages.ts:286) (see finding 05)
- H:956 trainer plans with starting weights (Pro) -> matched F-panel-339
- H:973 GST invoices -> matched F-panel-1113
- H:974 renewals and dues -> matched F-panel-1112, F-panel-308
- H:975 staff logins -> matched F-panel-1000, F-panel-1018
- H:976 several branches, one sign-in -> matched F-panel-103, F-panel-107
- H:977 expenses and profit -> matched F-panel-217
- H:978 member ID cards -> matched F-panel-511
- H:979 and H:1046 all your data to Excel in one tap -> matched F-panel-1131 (xlsx export confirmed, gymExport.ts:120)
- H:991 member data stored in India -> no feature row; region not checkable from the repo (could-not-check)
- H:992 closed to our staff unless you let them in for 1 hour -> matched F-panel-1017, F-panel-219, F-hq-118 (see finding 01)
- H:993 you see every look -> matched F-panel-538
- H:1013-1031 prices 999 / 9,990 / 1,499 / 14,990, 3 months free -> matched F-panel-314 (agree with plans.ts:116 and 0030 trial default)
- H:1024 check-in by QR poster or at the desk -> matched F-panel-1115, F-panel-201
- H:1038 monthly challenge with a leaderboard -> matched F-panel-1127
- H:1039 trainer plans, diet plans, body measurements -> matched F-panel-1125, F-panel-1126
- H:1040 extra plan days for members who come often -> matched F-panel-1121 (its status in the list is "unknown")
- H:1041 Your numbers: fees, new members, busiest hours -> matched F-panel-509
- H:1043 coming: paying fees in the app, the entry gate -> not a claim that it exists; matched F-phone-431, F-panel-1133
- H:1046 extra branch half price; pay by UPI or bank transfer, we confirm -> matched F-hq-105, F-panel-314, F-hq-129
- H:1052 "When the AI Assistant comes" -> finding 06
- H:1065-1067 three steps (create gym, bring members, QR poster) -> matched F-panel-1001, F-panel-221, F-panel-1117
- H:1084 "we set it up with you at your gym" -> a service by a person, not software: no row

## Unit 2 done: A, C, G

- A, C whole pages -> matched F-web-139
- A:18 desk app, member app, AI import -> matched (as above)
- A:27 not GST registered; founding offer wording -> price facts, matched F-server-500
- A:30-49 AI Assistant on every plan; 1 credit a task, 3 a plan; free credits; packs 149 / 399 / 999 -> matched F-panel-907, F-server-511 (agree with plans.ts:131-141) (see finding 03)
- A:53 free set-up, data move, free staff training -> services by a person, not software: no row
- A:56 no lock-in, all data to Excel, never charged automatically -> matched F-panel-1131, F-panel-314
- C:30 complaints answered in 48 hours, resolved in a month -> a process promise, not software: no row
- G whole page: smart app link, QR for a computer, iPhone "coming soon" -> matched F-web-105, F-server-109

## Unit 3 done: L (Play listing draft)

- L:3 tap each set, last time beside it -> matched F-phone-1005, F-phone-1006
- L:5 400+ exercises with steps and drawings, add your own -> matched F-phone-1100, F-phone-1102, F-phone-1003 (count not checked)
- L:6 warm-up, drop, failure sets; RPE -> matched F-phone-1005, F-phone-1123
- L:7 supersets, note on an exercise -> matched F-phone-1125, F-phone-1008
- L:8 rest timer buzzes with the screen off -> matched F-phone-1009, F-phone-1201
- L:9 tick a set from the notification -> matched F-phone-1206, F-phone-1208
- L:10 plate calculator with the gym's plates and bars -> matched F-phone-600, F-phone-1023
- L:12 suggested weight and reps -> matched F-phone-1007 (behind the member-plan gate, which is off: open to all today)
- L:13 start screen shows kilos to beat -> matched F-phone-716
- L:14 went up, same, down after the workout -> matched F-phone-1128
- L:15 new record pop-up -> matched F-phone-706
- L:17 ready programs PPL, Upper / Lower, Full Body Basics, Strength Starter -> matched F-phone-202 (names confirmed, programs.ts:73-141)
- L:18 plan builder by equipment -> matched F-phone-201
- L:19 routines in folders -> matched F-phone-1011
- L:20 easy week every 6 weeks -> matched F-phone-538
- L:22 charts per lift and weekly -> matched F-phone-109, F-phone-1106
- L:23 body map, last 7 days -> matched F-phone-1314
- L:24 strength level, 1-rep max -> matched F-phone-921, F-phone-113
- L:25 body weight, measurements, private photos side by side -> matched F-phone-111, F-phone-112
- L:26 monthly report, year in review, badges -> matched F-phone-108, F-phone-501
- L:28 works offline -> matched F-phone-1005
- L:29 back up to Google Drive, or one backup file -> backup file matched F-phone-1413; Drive: finding 04 (F-phone-1526 hidden)
- L:30 export workouts to Excel -> matched F-phone-1410
- L:31 import from Hevy or Strong -> matched F-phone-114
- L:32 kg or pounds, Health Connect -> matched F-phone-1627, F-phone-1224
- L:34 Wear OS watch app -> matched F-watch-101, F-watch-103, F-watch-110, F-watch-106
- L:35 widgets, workout reminders -> matched F-phone-1219, F-phone-1218
- L:37 join with code or QR poster -> matched F-phone-1421
- L:38 check in with one scan; plan, end date, days left -> matched F-phone-308, F-phone-409
- L:39 gym messages and offers, opening hours, how busy now -> matched F-phone-323, F-phone-229, F-phone-318
- L:40 ask the desk to pause or renew -> matched F-phone-314
- L:41 trainer's workout and diet plans, shop, challenge with leaderboard -> matched F-phone-228, F-phone-138, F-phone-137
- L:42 logging is free, no ads -> matched F-phone-1701 (member-plan gate off: memberPlan.ts:28)

## Counts

Features named: 96. Matched: 96 (5 service or process promises and 3 "coming soon" lines noted above, no row needed).
New feature rows: 0. Findings: 7 (S2: 5, S3: 2).

## Could not check

- Whether the AI Assistant and its voice are really switched on for live gyms: it needs server secrets and a live database part that the repo cannot show.
- "Data kept in India (Mumbai)": the database region is not written anywhere in the repo.
- Whether the Play listing draft is the text that is live on Google Play: not opened (source was the draft file only).
- The exact exercise count behind "more than 400 exercises": not counted.
- Nothing was driven on a screen; every finding is from reading code.
