# A2-phone-lib-core checkpoint

Output: docs/system-map/_work/out/A2-phone-lib-core.jsonl (35 rows, F-phone-1700 to F-phone-1734).

## Finished units
- [x] 1. Read the source list (131 lines).
- [x] 2. Opened the code of every item (top comment + main functions; about 1,300 code lines read).
- [x] 3. Switches and plan gates noted (below).
- [x] 4. Items grouped into features.
- [x] 5. Feature rows written (33 features).
- [x] 6. Not-a-feature rows written (2: shared helpers; type definitions).
- [x] Coverage check: every one of the 131 source ids is in at least one row; every entry path:line exists.

## Switches and gates met
- MEMBER_PLAN_GATE_ON = false (packages/theme/src/memberPlan.ts:28): MettleUp Plus (free month, locks, Plus page, Find my gym page) is off for everyone.
- MEMBER_PAYMENTS_LIVE = false (packages/theme/src/memberPlan.ts:34): no real Google Play purchase is ever started.
- FEATURES = { coach: false, nutrition: false, gymSync: false } (apps/mobile/src/lib/features.ts:6): AI coach, nutrition and gym sync hidden.
- Member's own settings: feedback_button (floating feedback button on/off), unitSystem (kg/lb).
- QA-build stand-ins: update_qa_stand_in (updateStore.ts:37), 'memberPlan' and 'newDots' in extra.qaStandIns.
- Install source (Google Play or GitHub APK, lib/installSource.ts) decides which update path a phone gets.

## Seen in passing
- apps/mobile/src/lib/appUpdate.ts:16 and :121: the update check and the what-changed file still read the GitHub repo "aucksy/ForgeAI" (old product name in a live address; works only while that repo keeps its name and stays public).
- apps/mobile/src/lib/keys.ts:8-10 and lib/feedback.ts:19: stored keys still carry the old name "forgeai" (harmless to users; a rename would lose saved values).
- apps/mobile/src/lib/layoutHints.ts:11: the 'progressTab' hint is retired (F199) but its code is still in the file.
- apps/mobile/src/lib/voiceProblem.ts:4: comment says "ForgeAI", the member-facing words say MettleUp (words are right).

## Could not check
- Whether the Home recovery / strength / insight cards are on screen today (F-phone-1722): the screens are outside this area.
- Whether an iPhone build is with members (F-phone-1731).
- Tier of MettleUp Plus features: the row format has only free | Pro; Plus is a member paid plan that is switched off, so the rows say "free" and name the switch.
