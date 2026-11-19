# A3-whats-new-phone: checkpoint

Source: apps/mobile/src/lib/whatsNew.ts (743 lines, read top to bottom: every text line, every comment, lines 1-100 and 640-743 in full).
Output: docs/system-map/_work/out/A3-whats-new-phone.jsonl (1 feature row, 4 findings). STATUS: DONE, all 40 versions finished.

How to read a line: `<whatsNew.ts line> <what it names> -> matched <feature id>`.
"(opened)" = the code behind the row was opened and read. No mark = matched on the row's name and switch only.
The app shows members only the last 3 updates (whatsNew.ts:666, settings/news.tsx:12), so today a member reads 0.79.0, 0.78.0 and 0.77.0.

## 0.79.0 (shown to members today)
- 84 Message your gym: pick who reads it -> matched F-server-509, F-phone-320
- 88 Today's target always beats the previous workout, "i" says why -> matched F-phone-1116
- 89 Sound for gym messages and Rest is over on phones that were silent -> matched F-phone-1202; FINDING 01 (not proven on the OPPO, whatsNew.ts:77)
- 90 Tapping a notification opens its page -> matched F-phone-1727
- 91 New exercise: tap a row to change it -> matched F-phone-516, F-phone-1003
- 92 Watch keeps big numbers full size at the largest text -> NO ROW; code exists (LogScreens.kt:151, opened); new row F-watch-3200; FINDING 04

## 0.78.0 (shown today)
- 105 Message your gym: question, feedback, complaint -> matched F-phone-320
- 109 Gym messages pop up while the app is open -> matched F-phone-407 (member switch, on by default: phonePrefs.ts:157, opened)
- 110 Bar under each exercise: kilos lifted and still to go -> matched F-phone-1116 (ExerciseLogCard.tsx:684, opened)
- 111 Suggested reps never drop below the previous workout -> matched F-phone-1720
- 112 81 exercises have new pictures -> matched F-phone-1102 (the count 81 was not checked)
- 113 Watch: turn the dial to change reps -> matched F-watch-106 (flag logFlow is always sent as true by this phone app: WearSync.kt:213, opened)

## 0.77.0 (shown today)
- 126 Light mode follows the phone -> matched F-phone-1625
- 130 Start empty workout brings last time's exercises; Start blank -> matched F-phone-515
- 131 Suggested reps follow the same set last time -> matched F-phone-1720
- 132 Watch stays on dimmed in a workout -> matched F-watch-114
- 133 Phone says when the watch app has an update -> matched F-phone-633, F-phone-1312
- 134 18+ and terms tick before Google sign-in -> matched F-phone-1408 (AccountCard.tsx:68; account offered to everyone: accountGate.ts, opened)

## 0.76.0
- 143 Progress on the Profile tab -> matched F-phone-103
- 144 Tap a dot or bar, then the date -> matched F-phone-1321
- 145 Month names on bar charts -> matched F-phone-1106
- 146 Small fixes -> not a feature

## 0.75.0
- 156 2.5 or 5 kg steps for machines and cables in Plates and bars -> matched F-phone-1023, F-phone-130
- 160 Exercise charts add up the total -> matched F-phone-1723
- 161 Chart dot, then date, opens the workout -> matched F-phone-1321

## 0.74.0
- 170 New features have a dot -> matched F-phone-1709, F-phone-1306

## 0.73.0
- 179 Simpler suggested weights -> matched F-phone-1720
- 180 Bodyweight green line (beat last time's reps) -> matched F-phone-716, F-phone-1116
- 181 Sleep and workouts -> matched F-phone-1228
- 182 Watch: bigger -15 / +15 -> matched F-watch-101
- 183 Muscles ready today and Quick workout are gone -> matched F-phone-128, F-phone-605, F-phone-234; FINDING 02 (rows say live; switched off at workout.tsx:488, opened)
- 184 Many small fixes -> not a feature

## 0.72.0
- 195 Ask an AI about your workouts -> matched F-phone-132
- 196 Gym logo on share pictures; Share before and after -> matched F-phone-1132, F-phone-200
- 197 Invite a friend on the Gym tab -> matched F-phone-327, F-phone-428 (button label "Invite a friend": bringFriend.ts:31, opened; hidden until the gym's server has its part, not checked live)

## 0.71.0
- 206 In use + kg to beat after a set -> matched F-phone-734, F-phone-1116
- 207 Each set its own rep goal; asks before a lighter weight -> matched F-phone-1720, F-phone-1118
- 208 Machine weights follow the machine's steps -> matched F-phone-1023
- 209 Chart point, then label, opens the workout -> matched F-phone-1321
- 210 Log each set on the watch -> matched F-watch-106

## 0.70.0
- 219 Workout of the day -> matched F-phone-528, F-phone-413 (needs the gym's trainer plans; the line says "can")
- 220 Watch your trainer -> matched F-phone-414, F-phone-819
- 223 Share my workouts with my trainers -> matched F-phone-421 (member switch, the line asks to switch it on)
- 226 What my gym can see (busy machines) -> matched F-phone-217, F-server-417 (the line says "if your gym shows")

## 0.69.0
- 236 Strength level, body weight private -> matched F-phone-921
- 237 Badges -> matched F-phone-501
- 238 Felt easy -> a little more; rest over shows in red -> matched F-phone-1123; red row REMOVED (RestTimerBar.tsx:17, opened); FINDING 03
- 239 Charts offers one exercise swap for 8 weeks -> matched F-phone-502, F-phone-1315; swap offer REMOVED (BalanceCard.tsx:23, opened); FINDING 03
- 240 Simpler Settings, one place for backup; muscle map 30 or 90 days -> matched F-phone-131, F-phone-1103
- 241 Desk confirms the mobile number at check-in -> matched F-phone-308

## 0.68.0
- 250, 251 Exercise pictures -> matched F-phone-1102

## 0.67.0
- 261 Health Connect weigh-ins and steps -> matched F-phone-1226, F-phone-1227
- 264 Watch: bigger rest text, "Workout saved" -> matched F-watch-101, F-watch-121
- 265 Scan the gym poster to join -> matched F-phone-1421
- 266 Recommend MettleUp to my gym -> matched F-phone-432

## 0.65.0
- 276 New MettleUp logo -> brand change, not a feature
- 277 Update pop-up, "Later" asks again in 3 days -> matched F-phone-1310; the 3-day rule was REPLACED (updatePrompt.ts:5, opened); FINDING 03
- 278 Resume workout from the app icon -> matched F-phone-1222

## 0.64.0
- 287 Install on watch -> matched F-phone-1311

## 0.63.0
- 296 Watch keeps MettleUp open -> matched F-watch-114
- 297 Next set first -> matched F-phone-1116
- 298 Photo of the start position -> matched F-phone-1102
- 300 Leaderboard is now Ranking -> matched F-phone-328 (label "Ranking": gymTab.ts:22, opened)
- 303 Scan the poster is the first button -> matched F-phone-1421
- 304 Allow the camera in Settings -> matched F-phone-1730

## 0.62.1
- 313 Check in opens a scanner -> matched F-phone-116
- 316 Crash fix -> not a feature

## 0.62.0
- 325 Gym tab has 3 parts -> matched F-phone-137 (gymTab.ts:24, opened)
- 329 Pause my plan / Renew my plan -> matched F-phone-314
- 332 Workout report only if you say yes -> matched F-phone-315
- 333 Start and end pictures -> matched F-phone-1102
- 334 1-rep max and % calculator -> matched F-phone-113 (member plan gate is off today)
- 335 Voice feedback second way to send -> matched F-phone-1401

## 0.61.0
- 344 Speak feedback in Hindi or English -> matched F-phone-1401
- 348 First 2 gym messages a day pop up -> matched F-server-411

## 0.60.0
- 360 Round feedback button on any screen -> matched F-phone-1400 (member can switch it off)
- 363 Kg lifted today next to last time; History kg -> matched F-phone-209
- 364 Bodyweight moves show last time from any routine -> matched F-phone-716
- 365 How busy your gym is -> matched F-phone-318
- 367 Tap a name on the leaderboard -> matched F-phone-137
- 370 Moving demo for 2 exercises -> matched F-phone-900

## 0.59.0
- 380 Gym messages pop up with the app closed -> matched F-phone-407
- 383, 385 kg to beat and Previous match; reached / beaten -> matched F-phone-1116
- 384 Main weight for a lighter first set -> matched F-phone-1720
- 386 Resume workout opens at the exercise -> matched F-phone-1122

## 0.58.0
- 395 Gym leaderboard -> matched F-phone-328 (Ranking part always shows, with a plain line when the gym has none: LeaderboardCard.tsx:35, opened)
- 398 Challenge goal and reward -> matched F-phone-419
- 400 Name shown only if switched on -> matched F-phone-134

## 0.57.1
- 410 Kg lifted, Sets, Duration tabs -> matched F-phone-838, F-phone-909
- 414 Next workout's total kg -> matched F-phone-838 (Today goal card; todayGoal.ts:120)
- 418 Continue with Google restores a Drive backup -> matched F-phone-1408, F-phone-1525 (Drive is now only "bring back an old backup")

## 0.57.0
- 428, 432 Save a backup / Restore from a backup -> matched F-phone-131
- 436 Trainer's measurements in Body -> matched F-phone-415
- 440 Diet plan -> matched F-phone-228
- 445 Gym open now, hours, holiday -> matched F-phone-229

## 0.56.1
- 456 Alarms & reminders -> matched F-phone-1209, F-phone-1210

## 0.56.0
- 465 ForgeAI is now MettleUp -> brand change, not a feature
- 466 Same 4 tabs -> matched F-phone-100 (now 3 tabs; Progress moved into Profile in 0.76.0, which the list itself says)
- 468 Progress tab -> matched F-phone-103
- 472 Join or check in on the Gym tab -> matched F-phone-1421, F-phone-116
- 476 Settings in groups; Rest timer and sounds -> matched F-phone-825
- 480 Health Connect stays on -> matched F-phone-1224

## 0.55.1
- 490, 493 What's new easier to read, last 3 updates -> matched F-phone-1313 (3 = whatsNew.ts:666)

## 0.55.0
- 501, 504 Gym rewards training with free days -> matched F-phone-326

## 0.54.1: no lines.

## 0.54.0
- 517 Gym's name and colours -> matched F-phone-100
- 520 Gym button appears after joining -> matched F-phone-137 (the Gym tab is always there now: whatsNew.ts:46)
- 521 Leave your gym -> matched F-phone-134

## 0.53.0
- 528 Beat your last time on the same routine -> matched F-phone-209
- 530 Muscle not trained in 3 weeks -> matched F-phone-1022
- 534 Show workout days to the front desk -> REMOVED 2 Nov (MembershipCard.tsx:6, opened); row F-phone-336 says so; FINDING 03

## 0.52.0
- 543, 545, 549 kilos to beat; last time from any routine; bodyweight reps -> matched F-phone-1116, F-phone-716
- 548 Warm-up sets stay -> matched F-phone-1720
- 551 Big In use screen -> matched F-phone-734
- 555 Asks before sending past workouts to Health Connect -> matched F-phone-1224

## 0.51.0
- 564 Notification shows how long you have trained -> matched F-phone-532
- 566 Pick the rest-over sound -> matched F-phone-1203 (4 sounds: restSounds.ts:20, opened)

## 0.50.0
- 575 Save as routine -> matched F-phone-619
- 576 In use from the rest timer -> matched F-phone-1115
- 577 Change rest time while resting -> matched F-phone-1009 (restRules.ts:143)

## 0.49.0
- 586 New version notice on the Workout tab -> matched F-phone-1310, F-phone-1706
- 587 Feedback by typing or speaking -> matched F-phone-133
- 588 18+ and terms when joining a gym -> matched F-phone-400
- 589 No longer asks for the microphone -> later undone on purpose by Speak (0.61.0); matched F-phone-1401

## 0.48.0
- 596 Trainer's plans on the Workout tab -> matched F-phone-528 (same gym switch)
- 597 Kilos to beat in a routine -> matched F-phone-716
- 599 My membership -> matched F-phone-409, F-phone-313
- 602 Scan the QR, then start today's workout -> matched F-phone-308
- 603 Join from the first screen; gym logo on the home screen -> matched F-phone-1607, F-phone-1223

## 0.47.1
- 610 Tick after rating a set -> matched F-phone-1123
- 611 Switching gyms with an order waiting -> matched F-phone-310

## 0.47.0
- 618 Join your gym with its code -> matched F-phone-400
- 619 Rate a set and it ticks itself -> matched F-phone-1123
- 620 Drag handle -> matched F-phone-1109
- 621 Fixes -> not a feature

## 0.46.0
- 628 The watch app: rest countdown -> matched F-watch-101
- 629 Camera refused -> matched F-phone-1730
- 630 Fixes -> not a feature

## 0.45.0
- 638 Rep range shows in the routine editor -> matched F-phone-507
- 641 New app icon -> not a feature

## 0.44.0
- 648 Rate a set, rest starts -> matched F-phone-1123
- 649 Rest is over sound same with the screen off -> matched F-phone-1201
- 650 New record with confetti -> matched F-phone-505
- 651 Drag an exercise in a workout -> matched F-phone-126
- 653 Weight jumps -> matched F-phone-130

## Counts
About 150 lines read in 40 versions (1 version empty). Matched: all but 1. New rows: 1 (F-watch-3200). Findings: 4 (1 S2, 3 S3).

## Could not check
- The count "81 exercises" (line 112): would need to count picture files against the exercise list.
- Whether the alert sound fix works on a real OPPO (line 89): needs the phone.
- Whether each gym-side part is switched on for real gyms (Invite a friend, How busy, leaderboard, workout of the day): needs the live server, not in this step.
- Most matches rest on the feature row's name and switch; only the rows marked "(opened)" had their code read.
