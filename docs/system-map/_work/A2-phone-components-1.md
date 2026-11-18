# A2-phone-components-1 checkpoint

Output: docs/system-map/_work/out/A2-phone-components-1.jsonl (27 rows, F-phone-1300 to F-phone-1326)

## Finished units
- [x] 1. Read the source list (67 lines)
- [x] 2. Opened the code for each item (headers, exports, buttons; about 1,300 code lines read)
- [x] 3. Switches and plan gates noted: FEATURES.coach, FEATURES.nutrition (apps/mobile/src/lib/features.ts:6, both off); gym branding (theme/gymTheme.ts); Settings voiceEnabled. No "Pro only" gate met in this area.
- [x] 4. Grouped into features
- [x] 5. Unit top-level components (BackupMovedCard .. WhatsNewList, phone.txt#265, #266): rows 1300-1313
- [x] 5. Unit analytics (incl. phone.txt#124): rows 1314-1319
- [x] 5. Unit brand: row 1320
- [x] 5. Unit charts: rows 1321-1322
- [x] 5. Unit chat + chat/cards: rows 1323-1325
- [x] 5. Unit exercise (ExerciseCharts, SessionHistory): rows 1322, 1326
- [x] 6. Not-a-feature rows written (1303, 1304, 1305, 1318, 1319, 1320, 1322)
- [x] Coverage check: all 67 source lines are in some row's "sources"; every entry path:line exists

## Seen in passing
- 15 files of the old Progress tab (apps/mobile/src/components/analytics: WeekCard, WelcomeCard, LiftsSection, PrSection, BodyWeightSection, CaloriesSection, ProteinSection, ConsistencySection, FrequencySection, MuscleSection, VolumeSection, useAnalyticsData, useProgressExtras, useProgressTop, util) are imported by no screen; only apps/mobile/src/app/stats.tsx:16-17 uses BodyMapSection, ReportsCard, SectionSkeleton, StrengthSection, BalanceCard. Tests under apps/mobile/test still import the dead ones (e.g. test/tracker/auditPhase5Fixes.test.ts, test/db/twoWaysReal.test.ts), so those tests can pass while checking code no member sees.
- Same for charts/Heatmap.tsx, charts/MiniBars.tsx, charts/DeltaPill.tsx and exercise/ExerciseCharts.tsx: no live importer.
- GymBrandMark.tsx header comment still says "ForgeAI's own look" (old product name, comment only).
- Coach chat (components/chat) is fully built but unreachable: apps/mobile/src/app/(tabs)/coach.tsx:35 redirects to /workout while FEATURES.coach is false.

## Could not check
- Which plan (free or Pro) gym branding belongs to: decided on the panel/server side, outside this area. Tier written as "unknown".
- Whether the dead Progress tests are counted as coverage for a live feature: not this step.
