# A2-phone-shop-2 checkpoint

Status: DONE (18 Nov 2026). Output: docs/system-map/_work/out/A2-phone-shop-2.jsonl (36 rows, F-phone-400 to F-phone-435).

## Finished units
- [x] 1. Source list read (185 lines).
- [x] 2. Code opened: gymApi.ts (function list + exact lines for 7 calls), the first lines of all 50 "file" items, and the lines behind every channel, task, notification, deep link and storage item (about 1,100 code lines read).
- [x] 3. Switches and plan gates noted (in each row's "switch").
- [x] 4-5. 34 feature rows written (2 of them "demo copy of ...").
- [x] 6. 2 not-a-feature rows (shared server-call helper phone.txt#153; pack reader phone.txt#166).
- [x] Self-check: all 185 source ids are in some row's "sources"; no unknown ids; every "entry" path and line exists.

## Switches and gates met
- Phone settings: gymMessagesOn, gymRemindersOn, showNameOnBoard, shareWorkoutsWithGym, shareWithTrainers, shareMachineUse.
- Gym owner side: reminder switches (member_auto_reminders), busy-by-exercise on/off (member_machine_busy), lockAfterEnd (member_plus_lock, default on).
- Plan gates: PLAN_GATE_ON = false (packages/theme/src/plans.ts:40) and MEMBER_PLAN_GATE_ON = false (packages/theme/src/memberPlan.ts:28); the leaderboard checks hasFeature(link,'challenge') (leaderboardSync.ts:121), so "Pro" is written in code but not enforced today.
- Server-not-ready fallbacks: most calls hide the feature when the database function is missing ("missing"), so whether each is live on the real server is not provable from code.

## Could not check
- Whether each server function is live on the real database (no database reads in this step): "Message your gym" (0069) and "Pay the gym" (/api/pay, test mode) are written status "unknown".
- Tier for features whose gate lives outside this area (offers, report, ask trainer, bring a friend, machine busy, Plus lock, pay): written "unknown".
- Screens (.tsx) that draw these features are outside this area's file range; not opened.

## Seen in passing
- none clear enough to call a bug.
