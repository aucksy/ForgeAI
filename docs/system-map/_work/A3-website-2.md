# A3-website-2 checkpoint

Source: join-online page, friend page, member website. Status: ALL UNITS DONE (19 Nov 2026).
Output: docs/system-map/_work/out/A3-website-2.jsonl (2 feature rows, 7 finding rows).

## Unit 1: join-online page (apps/dashboard/public/join-online.html) - done
- :126 Become a member page, 3 steps -> matched F-web-111 (also F-server-107, F-server-519)
- :144 Verify with WhatsApp number check -> matched F-web-135 (F-server-134)
- :152 QR code that opens WhatsApp from a computer -> matched F-web-135 (same check)
- :176 Pick a plan with price, joining fee, start date -> matched F-web-111
- :205 Pay at the desk -> matched F-web-111
- :204 Pay now (UPI or card), :208 test mode, :236 I have paid, :237 pay at the desk instead -> matched F-web-112 / F-server-108 (behind JOIN_PAY, off; page shows it only when the server says so)
- :210 18+ and health tick boxes, :211 under 18 join at desk -> matched F-web-111
- :243 already a member -> matched F-web-111; :244 "renew in the app: Gym > My gym > Renew my plan" -> matched F-phone-314, says more than the app does -> FN-07
- :250 gym not taking sign-ups online -> matched F-web-111 (its switch) / F-server-519
- :256 link does not work, :260 offline -> matched F-web-111
- :124 Hindi switch -> matched F-web-111 (same page); back link to the gym's own page -> matched F-web-113 (GYM_PAGES off)
- script :363-373 free trial (Try free for N days) -> matched F-panel-813 / F-panel-701 / F-server-107 (shown only when the server sends a trial)
- script :359 "If money was taken, it comes back to you" -> NOT FOUND -> new row F-web-3401 + FN-06
- script :326 "Only {gym} sees your details" -> a promise, not a feature (left to the promises lens)

## Unit 2: friend page (apps/dashboard/public/friend.html) - done
- :67 leave name and number, gym calls you -> matched F-server-106 (F-server-425)
- :82 when would you like to train -> matched F-server-106 (same form)
- :94 only the gym sees your number -> matched F-server-106 (promise, same form)
- :127 too many requests today -> matched F-server-106 (5 sends a day)
- :214 inviter first name, gym logo and colour -> matched F-server-106
- :104 invite link does not work any more -> matched F-server-106

## Unit 3: member website (apps/dashboard/public/member-site/index.html) - done
- :272 free workout log, last time's weight and reps on every set -> matched F-phone-1006 / F-phone-1117
- :281 works without internet -> matched F-phone-1615 (workouts saved on the phone)
- :282, :397 backup to your own Google Drive -> matched F-phone-1526 (hidden, stopped) -> FN-01
- :260 Hindi switch, :444 Send to my gym share -> matched F-web-104 (phone twin F-phone-432)
- :274 Get the app smart link, :278 iPhone note -> matched F-web-105 / F-server-109; iPhone coming soon -> F-server-607 paused -> FN-03
- :319 free watch app on Wear OS -> matched F-watch-106 / F-phone-1212 (paid-plan switch off) -> FN-04
- :321 see next set with last time's numbers -> matched F-watch-106 (watch shows Previous)
- :322 turn the dial, 2.5 kg steps -> matched F-watch-106 -> FN-05
- :323 tap the tick, saved on phone, rest starts -> matched F-phone-1213 / F-watch-106
- :324 watch tells you when rest is over -> matched F-phone-614; heart rate on screen -> matched F-watch-110
- :328, :422 Apple Watch coming soon -> NOT FOUND -> new row F-watch-3400 + FN-02
- :353 new record pop-up -> matched F-phone-706
- :354 today's total kg next to last time -> matched F-phone-705 / F-phone-209
- :369 graph of heaviest weight per exercise -> matched F-phone-707 / F-phone-512
- :369 body picture of muscles trained in 7 days -> matched F-phone-1314
- :384 ready-made plans -> matched F-phone-202; plan built from goal, days, equipment, sore joints -> matched F-phone-201
- :392 import from Hevy or Strong -> matched F-phone-114 / F-phone-1014
- :393 402 exercises -> matched F-phone-1100 (app itself says "Search 402 exercises"; count not re-counted); warm-up, drop sets -> F-phone-803; supersets -> F-phone-805
- :394 rest timer starts on tick, rings with phone locked -> matched F-phone-613 / F-phone-1201
- :395 1-rep max and % calculator on every exercise page -> matched F-phone-113 (link on the exercise page)
- :396 progress photos stay on the phone -> matched F-phone-603
- :421 phone app offers the watch app when it finds a watch -> matched F-phone-1311 / F-phone-632
- :435 trainer's workout plans -> matched F-phone-527 (gym plan switch off = open)
- :436 membership: plan, end date, days left -> matched F-phone-409
- :437 check in by scanning the poster -> matched F-phone-308 / F-phone-309
- :442 every member of a MettleUp gym gets every feature free -> matched F-phone-1701 (switch off) -> FN-04
- :445 WhatsApp text "memberships, check-ins, can also run a shop" -> owner-side claims, belong to the gym-owner site source (not re-checked here)
- :453 join gym by poster or code -> matched F-phone-301
- :462-466 Privacy, Terms, Refunds, Contact, About -> matched F-web-139

## Notes for the coordinator
- features.json F-watch-106 says "behind switch (logFlow)"; the phone always sends logFlow true during a workout (apps/mobile/modules/forge-rest/android/src/main/java/com/forgeai/rest/WearSync.kt:213), so it is live in practice.
- Counts: 52 features named, 50 matched, 2 new rows, 7 findings (S2: 3, S3: 4).
