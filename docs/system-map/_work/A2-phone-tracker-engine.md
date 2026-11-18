# A2-phone-tracker-engine checkpoint

Output: docs/system-map/_work/out/A2-phone-tracker-engine.jsonl (33 rows, F-phone-900 to F-phone-932)

## Finished units
- [x] 1. Source list read (35 lines, all "file" lines)
- [x] 2. Code opened: top 36-40 lines of every file, export list, importing screens (about 1,750 code lines read)
- [x] 3. Switches and plan gates noted: no Pro gate and no per-gym switch anywhere in the three folders (grep for Pro / premium / paywall / flag: only comments). Member on/off settings met: muted muscle tips (muscleTipsStore.muted), Easy weeks per plan (EASY_WEEKS_DEFAULT = true). Member choices met: Weight jumps, Rep range, Machine and cable steps (trackerPrefsStore.ts:102-106).
- [x] 4-5. clips (3 files) -> F-phone-900
- [x] 4-5. engine (23 files) -> F-phone-901 to F-phone-923
- [x] 4-5. plans (9 files) -> F-phone-924 to F-phone-932
- [x] 6. not-a-feature rows: F-phone-905 (bodyHistory.ts)
- [x] Self-check: JSON parses, all 35 source lines covered, every entry path and line exists

## Seen in passing
- apps/mobile/src/tracker/engine/bodyHistory.ts:10 `historyPage` ("Show older", 60 rows a page) is imported by no screen, only by test/tracker/auditPhase5Fixes.test.ts:27. The weigh-in list at apps/mobile/src/app/measures/index.tsx:336 draws every row (`[...sorted].reverse().map`). So the test covers a helper the app does not use; whether the screen pages another way was not checked.
- apps/mobile/src/tracker/plans/easyWeek.ts:28-32 says the Easy weeks default is an OPEN OWNER DECISION (on until he chooses).
- apps/mobile/src/tracker/clips/clipManifest.ts:24 the clips download from the public GitHub release of aucksy/ForgeAI; only 2 exercises have a clip (lines 19-20).

## Could not check
- F-phone-927 switch: the "Track RPE" setting that decides who sees the weekly effort is named in a comment (plans/effort.ts:5-9) but its setting name was not found in the stores searched: written as "unknown".
- Whether each feature shows for a pass member or only a full member: not decided in these folders (pure rules, no role check).
- Demo gym copies: none in these folders.
