# A3-notes-claude-2 checkpoint

Source: docs/system-map/_sources/claude-notes-redacted-part02.md (600 lines) and part03.md (43 lines).
Output: docs/system-map/_work/out/A3-notes-claude-2.jsonl

## Finished units
- UNIT 1 DONE: part02 lines 1-200 read, features listed and matched.
- UNIT 2 DONE: part02 lines 201-400 read, features listed and matched.
- UNIT 3 DONE: part02 lines 401-600 read, features listed and matched.
- UNIT 4 DONE: part03 lines 1-43 read, features listed and matched.
- UNIT 5 DONE: code checks for "says more than the feature"; 4 finding rows written. ALL DONE.

## Features named (source line -> result)
part02
- L1-2 panel "Screen and language" button, Dark/Light + English/Hinglish -> matched F-panel-501, F-panel-1100 (code: DisplayMenu.tsx:15)
- L1 "Save and show members" / "These timings are saved" (Gym timings) -> matched F-panel-220, F-panel-529 (code: GymTimings.tsx:377)
- L1-2, L468+ "Share app link" on member page -> matched F-panel-229
- L3-6 What's new for owners (ADMIN_NEWS, waiting lines) -> matched F-panel-506, F-panel-738
- L5 mobile digits (10-digit rule) -> matched F-panel-3100
- L5 day-first dates, logo background -> matched F-panel-1105 (logo); day-first dates: no own row, part of What's new line only (not a feature on its own)
- L6 pending-gym-web-pages (switch off) -> matched F-panel-334, F-hq-117; pending-plus-lock -> matched F-panel-317, F-panel-533
- L7-9 member app alert channels, sound -> matched F-phone-324, F-phone-1202
- L13-68 Message your gym: "Who should read it?" (Gym owner / a trainer / Gym admin) -> matched F-phone-424, F-phone-320, F-server-508 (code: gymMessages.ts:170, gymApi.ts:660)
- L33-36 Member messages "To: ..." line, desk Complaints button, staff note -> matched F-panel-703, F-panel-300 (code: memberMessages.ts:263, :282)
- L35 Settings browser alerts line for staff -> matched F-panel-836
- L60 pass member also gets the picker -> matched F-phone-424
- L74-80 welcome screens (beat your last workout, watch screen, gym screen, Skip, Recommend MettleUp to my gym) -> matched F-phone-1601
- L76 "Install on my watch" / "On your watch" -> matched F-phone-1601, F-phone-1311
- L81-84 phone-number-first sign-in, "Try another way" -> matched F-phone-1600, F-phone-1604 (PHONE_SIGN_IN_ON = true, phoneSignIn.ts:32)
- L85-89, L119-121 straight in for a found member + one-off Workout tab note -> matched F-phone-1605
- L116 "Used MettleUp before? Bring back your workouts" -> matched F-phone-1604 (phoneSignIn.ts:258)
- L138-145 "Your number is checked once and is not kept" promise -> matched F-phone-1604, F-phone-117 (phoneSignIn.ts:238)
- L146-149, L559+ watch app update pop-up -> matched F-phone-1312, F-phone-633 (G4 looks fixed: WatchUpdatePrompt.tsx:20-22)
- L153 staff door PIN line -> matched F-phone-334 (hidden) / F-phone-401 -> FINDING 04
- L153 gym lead "We never share your number" -> matched F-phone-333
- L154 sleep lines -> matched F-phone-1228; trainer share lines -> matched F-phone-1235
- L155-158 progress photos stay on this phone; "Include photos in my backup" -> matched F-phone-112, F-phone-1412 (hidden)
- L156 Profile number "Stays on this phone" -> matched F-phone-1600 (welcome optional number) / profile row not searched further
- L159-161 import card "Everything stays on this phone" -> matched F-phone-1600 (bring workouts); the untrue-for-signed-in line is FIXED in code (SwitcherCard.tsx:34)
- L170 gym staff found by number keep the old path -> matched F-phone-1604
- L207-270 target box (Previous, today's target, reason line, standing-out "i", row marks, 6-week break) -> matched F-phone-1116, F-phone-802 (progression.ts:893, :895)
- L222 target on the watch and In use screen -> matched F-watch-105, F-phone-734
- L231 live box "X kg done / Y kg to go" -> matched F-phone-1116
- L282 Hindi privacy -> matched F-web-139 -> FINDING 01
- L294-312 Save timings "Saved" + phone top bar -> matched F-panel-220, F-panel-500, F-panel-501
- L314-379 10-digit mobile rule in every box (member app, admin app, public pages, Workers, HQ) -> matched F-panel-3100; boxes: F-phone-1604, F-phone-117, F-phone-308, F-phone-334, F-panel-1001, F-panel-1003, F-panel-1015, F-panel-1008, F-panel-106, F-panel-406, F-panel-1116, F-panel-320, F-server-106, F-server-107, F-hq-107, F-server-133
- L337 AI Assistant add member / add enquiry cards -> matched F-panel-537 (no card-level row searched further)
- L380-399 gym reply notification: tap opens the conversation -> matched F-phone-1727 (alertRoute.ts:13); sound -> F-phone-324
- L395 trainer choice only with a running plan (R-549) -> matched F-phone-227
- L401-414 phone sign-in find (0093), privacy line -> matched F-phone-1604, F-web-139
- L416-425 new-feature dots, none on a first install -> matched F-phone-1709 (newDotsStore.ts:52)
- L427-466 "Send a test alert" -> matched F-panel-836, F-server-518
- L468-527 smart app link /app and /j/CODE, get-app page, join page iPhone/computer views, QR poster, Invite members -> matched F-web-105, F-server-109, F-web-108, F-panel-1117, F-panel-229
- L502 check-in poster page still "Android app for now" -> matched F-web-109 -> FINDING 03
- L503 help articles "Share app link" -> no leftover "Send app invite" found in panel code or pages
- L504 friend link, recommend link, update screen -> matched F-server-106, F-phone-432, F-phone-1310
- L529-558 watch screens on more watch sizes and largest text (a test set-up) -> matched F-server-620; countdown size -> F-watch-101
- L559-600 watch tells the phone it is installed (capability, version) -> matched F-watch-118, F-phone-1216
part03
- L2-17 several-signal rule for "has the watch app"; "Update on watch", "Install on watch" -> matched F-phone-1216, F-phone-1311, F-phone-1312
- L17, L39 rest-alert watch check still single-signal -> matched F-phone-1200 -> FINDING 02
- L19-23 watch log head line in "Add my watch's screen log" -> matched F-phone-1718, F-phone-1404, F-watch-115
- L26 "New in this version" card on the Workout tab -> matched F-phone-1313, F-phone-1708
- L28 phone's own update screen -> matched F-phone-1310

## Counts
- Named: 47. Matched: 47. New feature rows: 0. Findings: 4 (S2: 1, S3: 3).

## Could not check
- Whether a real watch shows the welcome watch screen or the update pop-up (needs his real watch; notes say only a stand-in was used).
- The welcome words scrolling under the dots at the biggest text (needs a picture from a cloud phone run, not code).
- Whether members on a failed setup save get the 3 questions (unit tests only, per the notes).
- What a member actually sees or hears on the watch when the rest alert misreads an older watch app (finding 02 is code-read only).
- Whether 0095 and 0096 are live in the database (not queried; notes say applied 15 Nov 2026).
- The watch "largest text" constant named in the notes was not found under that name in the watch app code (test code not opened).
