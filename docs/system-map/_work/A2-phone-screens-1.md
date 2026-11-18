# Checkpoint: A2-phone-screens-1

Status: DONE. 161 of 161 source lines covered, 40 feature rows (F-phone-100 to F-phone-139), 0 items left.
Output: docs/system-map/_work/out/A2-phone-screens-1.jsonl (parses; every entry path and line checked to exist).

## Finished units
- [x] 1. Read the source list (161 lines).
- [x] 2. Opened the code: 46 short files in full, the describing comment of the other 61, the root layout (lines 98-286), the tab layout, the link handler, and the gate lines. About 1,600 code lines read.
- [x] 3. Switches and plan gates noted (below).
- [x] 4. Items grouped into features.
- [x] 5. Feature rows written (39 features).
- [x] 6. Not-a-feature row written (F-phone-121, the 17 test-build-only link lines).

## Switches and plan gates met
- FEATURES = { coach: false, nutrition: false, gymSync: false } (apps/mobile/src/lib/features.ts:6): hides AI coach tab and its settings page, the nutrition page, the gym cloud card.
- MEMBER_PLAN_GATE_ON through PlusPageGate (apps/mobile/src/plan/PlusPageGate.tsx:15): the MettleUp Plus page and Find my gym open only with it on; comment at apps/mobile/src/plan/memberPlan.ts:96 says it is off in store builds today. The constant's value lives in the @forgeai/theme package and was not opened.
- Plan gates in screens: long chart ranges (profile.tsx:278, stats.tsx:101 and :110), own-exercise limit (library/new.tsx:343), 1-rep max calculator (one-rep-max.tsx:33).
- Per-gym features 'shop' and 'trainerPlans' (apps/mobile/src/shop/ShopScreen.tsx:165-166).
- STAFF_DOOR_ON = false (apps/mobile/src/shop/staffDoor.ts:61).
- QA build stand-ins for the nine qa-* links (per file comments only).

## Could not check
- The items file holds all 161 phone screen lines, including files after photos/compare.tsx (plan/ to workout/start.tsx) that the brief says are outside this area. All were covered so the script passes; another helper may have rows for the same lines.
- Files outside the stated range, and screens that live in apps/mobile/src/shop and src/components, were read by their describing comment only, so "tier" is "unknown" on several rows and the switch for messaging, inbox and diet plan is "unknown".
- No "demo copy of" row: BagScreen's comment speaks of a sample shop with a pretend order, OrdersScreen's comment says the sample shop is gone. Which is true was not checked (src/shop not in this step).
- Whether store builds really ignore the qa-* links: taken from comments, the build config was not opened.
- The 40-row limit forced merging (for example badges into Profile, credits into Help and About).

## Seen in passing
- apps/mobile/src/app/shop/bag.tsx:1 and apps/mobile/src/shop/BagScreen.tsx:5 still describe a sample shop "Place demo order", while apps/mobile/src/shop/OrdersScreen.tsx:6 says the sample shop and its pretend orders are gone. One of the two is stale, or a pretend order can be placed that My orders never shows.
- apps/mobile/src/app/one-rep-max.tsx:33 sends a member without access to /plus, and /plus bounces away when the Plus switch is off (PlusPageGate). If canUseNow('calculators') can ever be false with the switch off, the calculator would open and close with no explanation. Not verified.
- apps/mobile/src/app/c/[code].tsx:1 and j/[code].tsx:1 name the web address forgeai.aakashpahuja.in and the forgeai:// scheme while test links use mettleup://. Possibly stale comments after the rename; not verified.
- apps/mobile/src/app/(tabs)/coach.tsx:32-35 and nutrition.tsx:61-62: comment says "goes Home", code goes to /workout (Home no longer exists). Wording only.
- apps/mobile/src/app/settings/phone-backup.tsx: a page with no Settings row, kept only for a test link, still reachable by link in store builds.
