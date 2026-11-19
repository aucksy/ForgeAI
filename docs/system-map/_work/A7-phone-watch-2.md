# A7-phone-watch-2 checkpoint

Source: docs/system-map/_sources/promises.txt lines 968-1087 (120 candidates). Output: docs/system-map/_work/out/A7-phone-watch-2.jsonl

## Finished units
- unit 1 done: promises.txt 968-995 (onboarding + plan words). Rows 01-24.
- unit 2 done: promises.txt 996-1046 (gym tab: board, find my gym, messages, mates, offer, staff door, trainer). Rows 25-65.
- unit 3 done: promises.txt 1047-1087 (tracker). Rows 66-79.
- ALL 120 candidates handled: 79 rows, 41 "not a promise" lines. Lines read: about 1,420 of 1,500.

## Not a promise
- not a promise: apps/mobile/src/onboarding/phoneSignIn.ts:260, an error line that says setup did not finish
- not a promise: apps/mobile/src/onboarding/welcomeStart.ts:61, a result line ("We found your backup") followed by a question
- not a promise: apps/mobile/src/plan/planWords.ts:40, a result line after "I already paid"
- not a promise: apps/mobile/src/plan/planWords.ts:125, a button label
- not a promise: apps/mobile/src/shop/findGym.ts:184, a result title
- not a promise: apps/mobile/src/shop/gym.ts:369, a status line after the shop reloads
- not a promise: apps/mobile/src/shop/gym.ts:440, a stock count line
- not a promise: apps/mobile/src/shop/gym.ts:907, an error title
- not a promise: apps/mobile/src/shop/gymIconWords.ts:26, an instruction about the phone's own home screen
- not a promise: apps/mobile/src/shop/gymMessages.ts:177, describes who can be picked right now, a screen state
- not a promise: apps/mobile/src/shop/gymReport.ts:106, an error line
- not a promise: apps/mobile/src/shop/gymTalk.ts:288, the pretend gym's made-up reply (demo data)
- not a promise: apps/mobile/src/shop/money.ts:258, a stock count line
- not a promise: apps/mobile/src/shop/staffDoor.ts:113, an error line
- not a promise: apps/mobile/src/tracker/catalog/bodyMapPaths.ts:22, the MIT licence text of a picture library
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:39, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:44, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:54, an exercise search word
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:102, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:214, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:220, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:243, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:270, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:272, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:318, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:332, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:337, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:365, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:369, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:401, exercise instruction
- not a promise: apps/mobile/src/tracker/catalog/catalogData.ts:403, exercise instruction
- not a promise: apps/mobile/src/tracker/components/BodyEntrySheet.tsx:155, a button's screen-reader label
- not a promise: apps/mobile/src/tracker/components/MuscleTipNote.tsx:63, a button's screen-reader label
- not a promise: apps/mobile/src/tracker/components/RoutineImportSteps.tsx:334, a result heading
- not a promise: apps/mobile/src/tracker/components/RoutineImportSteps.tsx:335, a result heading
- not a promise: apps/mobile/src/tracker/components/RoutineImportSteps.tsx:342, explains what just happened in this import, followed by "You check each one next"
- not a promise: apps/mobile/src/tracker/components/ShareSheet.tsx:146, a status line after the gym logo failed to load
- not a promise: apps/mobile/src/tracker/components/WorkoutPrefsCard.tsx:223, a setting's state caption
- not a promise: apps/mobile/src/tracker/components/profile/FeedMenu.tsx:142, an error line
- not a promise: apps/mobile/src/tracker/db/historyScope.ts:273, a switch title
- not a promise: apps/mobile/src/tracker/engine/muscleBalance.ts:504, a sheet title

## Could not check
- deploy/panel/phoneInbound.js (the WhatsApp number check) was not opened: "we never message you" and "not kept" on the service side stay unknown.
- Whether each item on the "Free for everyone" list is really free on its own screen: call sites and plan tests not opened (read limit).
- trainerRecent.ts and the later server change for recent workouts: what is sent and whether it is deleted on switch-off.
- Tracker behaviour lines (swap for this workout only, plan only changes if you pick it, strength level, suggestions): no code read, status unknown.
- No test file was opened; every "kept" rests on the code lines named in its row.
