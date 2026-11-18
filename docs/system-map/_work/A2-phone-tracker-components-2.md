# A2-phone-tracker-components-2 checkpoint

Status: DONE (18 Nov 2026). All 50 source lines covered, 40 rows written (F-phone-800 to F-phone-839).
Output: docs/system-map/_work/out/A2-phone-tracker-components-2.jsonl (parses; every entry line checked to be inside its file).

## Steps
- [x] 1. Read the source list (50 lines: 11 overlays, 39 files)
- [x] 2. Opened the code of each item (file header + the entry lines; about 1,600 code lines read)
- [x] 3. Switches and plan gates noted (below)
- [x] 4. Grouped into features
- [x] 5. Feature rows written (39)
- [x] 6. Not-a-feature row written (1: F-phone-839, shared building blocks)

## Finished units
- overlays phone.txt#131-133, #141-148: done
- workout-screen files (RestTimerBar, SetRow, setRowLayout, RetapLayer, unitText, WhyIcon, WorkoutMiniBar, WatchStartCard, WorkoutPhotos, ZoomImage, zoomMath): done
- Workout tab files (UpNextCard, WorkoutRoutines, SwitcherCard, RoutineImportSteps, routineImportStepKey): done
- history / summary files (SessionSummary, WorkoutDetail, SetTable, WorkoutCard, ShortDayLine, StrengthLevelLine, ShareTextRow, TrainerVideoLink): done
- settings (WorkoutPrefsCard: 7 cards), tab bar, WorkoutPresenceHost: done
- exerciseForm, profile, progress folders, useOpenPeriod: done
- shared helpers (SegmentedControl, SegmentedTabs, TrackerGlyph, TrackerSheet, StatsRow): done

## Switches and gates met
- No per-gym switch and no "Pro only" rule is read anywhere in this area's code.
- Member settings that show or hide something: "Rate how hard each set felt" (advancedSets; SetRow.tsx:152, WorkoutPrefsCard.tsx:447) shows the RPE box; "Your gym on the picture" (shareGym; ShareSheet.tsx:116); "Open MettleUp on my watch" (WorkoutPrefsCard.tsx:159); "Muscle tips" (WorkoutPrefsCard.tsx:476); "Sleep and workouts" (named in ShortDayLine.tsx:3, read elsewhere).
- "AI coach notes" row shows only when the parent page passes showCoachNotes (WorkoutPrefsCard.tsx:461). Where "the coach is on" is decided is outside this area: tier written as unknown.
- Android only: "Ring through Do Not Disturb" (WorkoutPrefsCard.tsx:232); the on-time alert prompt (RestTimerBar.tsx:118).
- Trainer video shows only when a gym trainer gave a link (TrainerVideoLink.tsx:33); any plan gate on that is on the gym side, not here: tier unknown.

## Could not check
- Tier for trainer video and AI coach notes (decided outside this area).
- Large files were read by header, exports and searched lines only, not whole (SetRow 798, WorkoutRoutines 800, RoutineImportSteps 636, WorkoutPrefsCard 506 lines): small actions inside them may be missing from the feature names.

## Seen in passing
- None that is a clear bug. Note only: WorkoutPresenceHost.tsx:69-75, a tapped notification that names a page the app does not know only writes a log line; the member sees the app open with no page and no message.
