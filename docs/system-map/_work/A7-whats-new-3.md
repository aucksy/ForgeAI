# A7-whats-new-3 checkpoint

Candidates: promises.txt lines 1367-1439 (73). Output: docs/system-map/_work/out/A7-whats-new-3.jsonl

## Finished units
- unit 1: promises.txt 1367-1392 (whatsNew.ts 441-521) done: rows 01-16
- unit 2: promises.txt 1393-1414 (whatsNew.ts 528-589) done: rows 17-34
- unit 3: promises.txt 1415-1439 (whatsNew.ts 596-654) done: rows 35-54
- ALL DONE: 54 promise rows + 19 "not a promise" lines = 73 candidates.

## Not a promise
- not a promise: apps/mobile/src/lib/whatsNew.ts:441, button label "Open the Gym tab" (its sentence, line 440, belongs to part 2)
- not a promise: apps/mobile/src/lib/whatsNew.ts:446, button label "Open the Gym tab"
- not a promise: apps/mobile/src/lib/whatsNew.ts:457, button label "Open Rest timer and sounds"
- not a promise: apps/mobile/src/lib/whatsNew.ts:473, button label "Open the Gym tab"
- not a promise: apps/mobile/src/lib/whatsNew.ts:477, button label "Open Rest timer and sounds"
- not a promise: apps/mobile/src/lib/whatsNew.ts:481, button label "Health Connect settings" (note: the page it opens is now titled "Health apps", apps/mobile/src/app/settings/health.tsx:7)
- not a promise: apps/mobile/src/lib/whatsNew.ts:491, button label "See what's new"
- not a promise: apps/mobile/src/lib/whatsNew.ts:502, button label "See your gym's offer"
- not a promise: apps/mobile/src/lib/whatsNew.ts:518, button label "Open the Gym tab"
- not a promise: apps/mobile/src/lib/whatsNew.ts:521, button label "Open Your gym" (the sentence on the same line has row 16)
- not a promise: apps/mobile/src/lib/whatsNew.ts:531, button label "Turn tips on or off"
- not a promise: apps/mobile/src/lib/whatsNew.ts:535, button label "Open My membership"
- not a promise: apps/mobile/src/lib/whatsNew.ts:552, button label "Turn it on"
- not a promise: apps/mobile/src/lib/whatsNew.ts:567, button label "Pick a sound"
- not a promise: apps/mobile/src/lib/whatsNew.ts:600, button label "Open My membership"
- not a promise: apps/mobile/src/lib/whatsNew.ts:618, button label "Open the Gym tab" (the sentence on the same line has row 42)
- not a promise: apps/mobile/src/lib/whatsNew.ts:630, "Many small fixes from a full check of the app." names nothing a reader could check
- not a promise: apps/mobile/src/lib/whatsNew.ts:639, button label "Choose your reps"
- not a promise: apps/mobile/src/lib/whatsNew.ts:654, button label "Choose your weight step"

## Could not check
- Whether old notes (0.45-0.56) are still shown to anyone: Settings shows the last 3 updates only (whatsNew.ts:666); the news page was not opened.
- Watch app code: not under apps/ (dashboard, hq, mobile only); not searched further (size limit).
- Effort-rating promises (rows 40, 43, 50), rest-time change while resting (row 30), large-text/keyboard fixes (row 45): no code found within the read limit.
- No test file was opened (read limit ~1,500 lines reached at about 1,150); every "test exists" note is a file name only, never used as proof of "kept".
- Server side of the workout offer (free days added, dates deleted on Leave): database not in scope of this step.
