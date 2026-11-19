# A3-inbox-2 checkpoint

Source: docs/system-map/_sources/owner-inbox-redacted-part02.md (600 lines, read top to bottom in 100-line slices).
Status: ALL UNITS DONE (19 Nov 2026).
Output: docs/system-map/_work/out/A3-inbox-2.jsonl (2 feature rows, 6 finding rows).

Format: source line - feature the source names - matched feature id(s) / new row / finding.
"plan only" = the source describes an idea or proposal and does not say it is built; no row written.

## Unit 1: backlog table rows F161-F189 (lines 1-25) DONE
- 1 brand addresses, old address sends people on - matched F-web-100, F-server-100
- 2 block-proof server address - matched F-server-102, F-web-137, F-phone-1530
- 3-5 automatic tests, cloud phone tests, release gate - matched F-server-613, F-server-612, F-server-614
- 6 server safety checks (one gym cannot see another) - matched F-server-614 (name match only; test body not opened)
- 7 private signing key - matched F-server-615; FINDING 06 (key is also a cloud build secret)
- 8 workouts stay on the phone - matched F-phone-1521, F-phone-1408; FINDING 05 (row is stale)
- 9 works without internet - matched F-phone-126 (offline logging), F-phone-1521 (queue waits)
- 10 owner inbox page - no row in the map; code exists; NEW F-hq-3800; FINDING 01
- 11 feature backlog with comments - same page; covered by F-hq-3800; FINDING 01
- 12 Play Store release - store work, not a product feature; no row
- 13 landing page, try your gym's name, free demo, leads, Get started list - matched F-web-102, F-web-103, F-hq-125, F-panel-628, F-panel-108
- 14 paid server with backups - Not doing; no row
- 15 test server before live - not a product feature; no row
- 16 crash notes and outage check every 10 minutes - matched F-phone-1719, F-server-115, F-web-121, F-server-600
- 17 real-phone tests on Google's lab - matched F-server-617 (behind two secrets; could not check they are set)
- 18 "New version ready" in the app - matched F-phone-1706, F-phone-1310, F-phone-1231
- 19 privacy notice, terms, consent tick - matched F-web-139, F-panel-1016
- 20 gym data export and delete request - matched F-panel-630, F-panel-528, F-hq-126
- 21 feedback by text or voice, sorted - matched F-phone-1401, F-web-117, F-web-120, F-server-205, F-hq-123
- 22 help answers in both apps - matched F-web-118, F-panel-626, F-phone-133 (source says 15 help pages; code has 40: more, no finding)
- 23 launch plan - not a feature
- 24 Play banner video - Idea; plan only

## Unit 2: entries 101-97 (lines 26-143) DONE
- 33 panel update: menu headings, set-up ring - matched F-panel-1100, F-panel-1118
- 33 Turn on alerts card, bell groups - matched F-panel-505, F-panel-1108
- 33 English/Hinglish beside Dark/Light - matched F-panel-501
- 33 one Refresh, ready-made challenges - matched F-panel-207, F-panel-723
- 33 one link per gym on Invite members - matched F-panel-1117, F-panel-811
- 33 festival date fixes - matched F-panel-911
- 36/44 gym web pages with HQ per-gym switch - matched F-web-113, F-hq-117, F-panel-1106 (GYM_PAGES off; source says "then I switch on": consistent)
- 47 check-in challenges, "5 of 12 visits" - matched F-server-530 (hidden; source says later: consistent)
- 51 question line on the gym page - matched F-web-114 (words found in code)
- 51 join form QR on a computer for WhatsApp check - matched F-web-111, F-web-135 (words found in code)
- 51 one set-up journey (web page, link, poster, how people pay) - matched F-panel-312, F-panel-504
- 58 payment steps under free-plan limits, 10-minute payment check - matched F-server-131, F-web-131
- 71-73 gyms pick Razorpay or Cashfree; PayU and PhonePe hidden - matched F-panel-126, F-server-125
- 80 member day limit words for AI answers - matched F-web-119 (words found in code)
- 85-89 AI credits: owner free, members 10 answers = 1 credit, owner switch, monthly limit - matched F-server-123, F-server-513, F-panel-908
- 99-103 gym page: AI answers only from owner's facts, enquiry with phone - matched F-web-115, F-server-144, F-panel-214
- 116 Report link, take a page down - matched F-server-525, F-server-142
- 117 owner sees visits and joins; Powered by MettleUp - plan only
- 124 gym's own domain - declined by owner (line 127); no row
- 130 weekly Cloudflare limit alert at 60% and 80% - matched F-hq-120 (code found)
- 127/131 gym page from plans, timings, photos; join form - matched F-panel-1106, F-web-111
- 127 (4)/133 AI sales helper with a leaving offer - research; plan only
- 135/139 owner switch for the page's AI helper - matched F-panel-1106
- 135/140 free trial for sign-ups, owner sets days - matched F-panel-813, F-panel-701, F-server-107
- 138 self sign-up with two tick boxes - matched F-web-111
- 143 small trial fee taken off the plan - part of F-panel-813; FINDING 03 (fee is always zero)

## Unit 3: entries 96-94 (lines 145-216) DONE
- 150-154 testers and public beta - Play setting, not code; no row
- 159-167 Continue with your phone number, app finds gym and role - matched F-phone-1604, F-phone-1600
- 161 "Do you run a gym on MettleUp?" card taken out - matched F-phone-334 (hidden: consistent)
- 167 Google stays for backups - matched F-phone-1606, F-phone-1520
- 179 workout logging, rest bar, finish, records - matched F-phone-126, F-phone-1009
- 180 routines, Up next, muscle tips, plan builder - matched F-phone-1113, F-phone-1022, F-phone-1011
- 182 gym part: check-in, plan and dues, messages, trainer plans, shop, help - matched F-phone-403, F-phone-139, F-phone-527, F-phone-133
- 183 imports from Hevy and Strong, backup files - matched F-phone-1014, F-phone-114, F-phone-131
- 190 rest countdown on lock screen, Rest is over - matched F-phone-1201
- 191 live workout card with Complete set - matched F-phone-1208, F-phone-1206
- 192 reminders, gym notices, pop-ups for replies - matched F-phone-407, F-phone-322, F-server-230
- 193 watch app (sets, rest, heart rate) - matched F-watch-110, F-phone-1213
- 194 phone-to-watch link, gym colour - matched F-phone-1216, F-phone-1214
- 195 Health: save workouts, read weight, steps, sleep - matched F-phone-1224, F-phone-1226, F-phone-1227, F-phone-1228
- 196 widgets Today, Week, Gym - matched F-phone-1219, F-phone-1220
- 197 long-press shortcuts - matched F-phone-1222
- 198 paying for MettleUp Plus by Play Billing - matched F-phone-1703 (behind switch)
- 199 Google sign-in and Drive backup - matched F-phone-1520, F-phone-1411
- 200 Update the app prompt - matched F-phone-1231, F-phone-1707
- 201 open a Hevy file from the Share menu - matched F-phone-114 (code found)
- 202 check-in and invite links open the app - matched F-web-108, F-web-109, F-phone-1727
- 203 back button guards - matched F-phone-126 (no row of its own; not checked further)
- 205 gym logo icon, gym start-up screen, silent switch reading - matched F-phone-1223, F-phone-1233, F-phone-737
- 211 iPhone gap list with a cloud check - matched F-phone-1426, F-phone-1731 (check found in the cloud build file)

## Unit 4: entries 93-84 (lines 217-345) DONE
- 221 Home "Accounts and services" - part of the owner inbox page, F-hq-3800
- 235 sign-in codes by WhatsApp - matched F-web-134, F-web-135
- 237-238 AI member import (Gemini first, Claude backup) - matched F-web-123, F-panel-1111
- 239 spoken feedback to text - matched F-web-120
- 258 gym stops paying: 7 extra days, basic mode, read-only - matched F-panel-536 (hidden), F-server-433 (behind switch)
- 260 owner's UPI and bank for paying MettleUp - matched F-panel-314
- 267 Ask a trainer - matched F-phone-423, F-panel-318, F-panel-830
- 268 follow gym mates feed - plan only
- 270 AI assistant that does things - matched F-web-124, F-panel-1130 (source describes a plan)
- 277 logo background tip - matched F-panel-1105 (words found in code)
- 278 round preview and clean round icon - matched F-panel-1105, F-phone-1223 (code found)
- 294 gym pop-ups (pause or renew answer, report asked, order ready) - matched F-server-230
- 295 team replies in Your questions - matched F-hq-123, F-phone-133
- 297 Questions page in the admin app - matched F-panel-606
- 302-303 pass members - matched F-panel-313, F-panel-226
- 302-305 Bring a friend - matched F-web-110, F-panel-204 (member words found in code)
- 304-308 online payments in test mode, connect by sign-in - matched F-web-126, F-web-127, F-server-125
- 315 trainer view, My members - matched F-panel-311, F-panel-523, F-panel-1025
- 316 trainer videos, Watch your trainer - matched F-panel-342, F-phone-414
- 317 workout of the day - matched F-panel-337, F-panel-634
- 319-321 Share my workouts with my trainers, Ask my trainer for help - matched F-phone-421
- 330 typed check-in number waits for the desk - matched F-server-416, F-panel-508
- 330 challenge rewards Give / Skip - matched F-server-406, F-panel-1127
- 341-342 busy machines, Share which machines I use - matched F-panel-206, F-phone-1235, F-server-417

## Unit 5: entries 83-70 (lines 346-494) DONE
- 350-364 help answers, Did this solve it - matched F-web-118 (see line 22)
- 362 Claude groups problems twice a day, drafts replies - a working habit, not product code; no row
- 365 WhatsApp AI bot - plan only
- 374 challenge winners get free days, Give by hand - matched F-server-406, F-panel-207 (words found in code)
- 384 Health Connect weight and steps - matched F-phone-1226, F-phone-1227
- 394-397 member site, gym site, old links, "from a member" lead mark - matched F-web-104, F-web-102, F-web-100, F-hq-125
- 404-410 Starter and Pro split behind a switch - matched F-panel-124 (behind switch: consistent)
- 419-426 workout report request - matched F-panel-631, F-panel-822, F-phone-315 (30-day rule found in the database change)
- 431-433 pause and renew requests - matched F-phone-314, F-panel-828, F-panel-719
- 438-440 desk photos, Take photo - matched F-panel-409
- 446-458 spoken feedback, counts deleted after 7 days - matched F-phone-1401, F-web-120, F-server-116
- 469 crash reports deleted after 90 days - matched F-server-116, F-web-140
- 475 watch heart rate, never saved or sent - matched F-watch-110
- 486-492 GST, bank, Play account advice - not a feature

## Unit 6: entries 69-62 (lines 495-600) DONE
- 500-503 online payments by link or QR, recorded by themselves - matched F-web-127, F-web-131, F-web-129
- 514 daily bank report upload and match - plan only
- 532-540 busy machines: owner switch, machine counts, add a machine - matched F-panel-206, F-panel-532
- 533 member tip "quieter on Tuesday", Move it, Not now - matched F-phone-319; FINDING 04 (no Move it button)
- 541 AI fills the machine list from photos - plan only
- 547 how busy the gym is right now - matched F-phone-417, F-phone-318, F-server-408
- 547 tap a name on the leaderboard - matched F-phone-329, F-server-409
- 557-562 phone pop-ups, 15-minute backup check - matched F-server-230, F-phone-407 ("40 phones a minute" not checked)
- 571-575 Google sign-in on the GitHub copy - matched F-phone-1520
- 581-586 trainer measurements and diet plans - matched F-panel-239, F-panel-209, F-phone-139
- 597-598 teen accounts with a parent's OK - not found; NEW F-phone-3801; FINDING 02
- 598 18+ for now - matched F-phone-400

## Could not check
- Whether the two Test Lab secrets are set, so "Google's robot tries each release" is really on (needs the repository settings).
- Whether the owner inbox page works today (not driven; it is published from a chat, not from a server).
- "40 phones a minute" for pop-ups and "about 40 common machines" in the ready list (numbers not counted).
- Matches were made by name and, where words were quoted, by finding the words in code; rows were not driven.
