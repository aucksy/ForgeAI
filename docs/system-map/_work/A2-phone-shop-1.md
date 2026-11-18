# Checkpoint A2-phone-shop-1

- [x] 1. Read the source list (68 lines)
- [x] 2. Opened the code at each item (file headers + the exact lines; about 1,600 code lines read)
- [x] 3. Noted switches and plan gates
- [x] 4. Grouped into features
- [x] 5. Wrote feature rows F-phone-300 to F-phone-335 (36 features)
- [x] 6. Not-a-feature row: F-phone-336 (claimCode.ts)
- [x] Coverage check: all 68 source lines named in "sources"; every entry path:line exists; JSON parses

Finished units: all 68 lines. Output: docs/system-map/_work/out/A2-phone-shop-1.jsonl (37 rows).

## Switches and plan gates met
- PLAN_GATE_ON = false (packages/theme/src/plans.ts:40): hasFeature passes every gym today. Used for 'shop' and 'trainerPlans' (ShopScreen.tsx:165-166); 'branding', 'challenge', 'workoutOffer' are checked outside this area.
- MEMBER_PLAN_GATE_ON = false (packages/theme/src/memberPlan.ts:28): "Find my gym with my number" card not drawn (findGym.ts:157, ShopScreen.tsx:99).
- STAFF_DOOR_ON = false (shop/staffDoor.ts:61): staff sign-in card never drawn (ShopScreen.tsx:116).
- Shop tab part shows only once the gym lists a product (gymShopOn, ShopScreen.tsx:165).
- Ask a trainer: only a running paid gym plan (askTrainer.ts:189 askAccess, R-505).
- Server-version hides (card absent until the migration is live): 0023 membership, 0036 hours, 0037 leaderboard, 0039 busy, 0044 plan requests, 0045 report, 0049 busy machines, 0053 ask, 0056 bring a friend, 0069 message your gym.

## Seen in passing
- BagScreen.tsx:109 still carries the sample shop's "Demo order" words and branch, but BagScreen is wrapped in GymOnly (BagScreen.tsx:26), so a phone with no gym can never reach it: dead branch. Same for the demo catalog in shopSource.ts:32 (mode 'sample').
- claimCode.ts / workoutCode.ts getWorkoutCode: no caller on the phone since R-279 (only type imports in offer.ts:16 and offerActions.ts:38). Dead code that still ships.
- Comments disagree on where the gym code box is for a phone with no gym: InviteScreen.tsx header says "Settings -> Your gym's code box", GymNotFoundCard.tsx header says "the Gym tab's code box". Which one the screen really sends to was not checked.
- askReplySync.ts:26 and its header name AskTrainerScreen / AskTrainerRow, which no longer exist (R-549 merged them into GymTalkScreen / GymTalkRow). Comment only.

## Could not check
- Tier (free or Pro) for pay panels, machine tip, leaderboard, header logo, auto reminders, find my gym, staff door: no plan check in the files of this area; a server-side rule was not read (no database reads in this step). Written as "unknown".
- Whether the gym's server really has each migration live: not in this step.
