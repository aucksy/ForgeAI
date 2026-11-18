# Checkpoint: A2-phone-tracker-components-1

Status: DONE. 52 of 52 source lines covered, 38 rows written (F-phone-700 to F-phone-737).
Output: docs/system-map/_work/out/A2-phone-tracker-components-1.jsonl

## Steps
- [x] 1. Read the source list (52 lines: 11 overlays, 41 files)
- [x] 2. Opened each item (header + export line; exact lines for the gates in ExerciseLogCard and GymWodCard)
- [x] 3. Switches and plan gates noted (below)
- [x] 4. Grouped into features
- [x] 5. Feature rows written
- [x] 6. Non-features given rows (DoneSheet, InfoHeading)

## Finished units (all)
BeforeAfterShare, BodyEntrySheet, BodyMap, CompareNote, Confetti, DateLineChart, DatePickerSheet, DateSparkline,
DoneSheet, DragGrip, DragList, DrawingCredit, EasyWeekNote, EditSessionHeader, ElapsedClock, EntryBar, ExerciseClip,
ExerciseDemoSheet, ExerciseKgRow, ExerciseListRow, ExerciseLogCard, ExerciseMetricChart, ExercisePickerList,
ExercisePictures, ExercisePrRows, ExerciseThumb, FinishSheet, FirstRoutineCard, FolderPickerSheet, GymWodCard,
HeaderCreateButton, HevyLinkReader, HoldTimerSheet, ImportCard, InfoHeading, KgHeroCard, LibraryList, LogPastSheet,
MachineDetailsRow, MachineInUse, MachineStepCard, MonthCalendar, MonthGrid, MuscleTipNote, NameSheet, NewNamesCard,
PlateCalcSheet, PlateSetupCard, PrefChoiceSheet, ReadyCard, RecordToast, RestAlertsStatusRow.

## Switches and plan gates met
- MettleUp Plus "weightSuggestions": ExerciseLogCard.tsx:158 and :806 (free member sees a locked line, opens /plus).
- MettleUp Plus "calculators": ExerciseLogCard.tsx:940 (Plate calculator row opens the locked explainer).
- Gym plan feature "trainerPlans" (Pro gyms; hidden for Starter): GymWodCard.tsx:3, decided in services/gymWodSync.ts:15.
- Member settings: advancedSets (ExerciseLogCard.tsx:167), inUseAfterSet / inUseByExercise (MachineInUse.tsx:211-213),
  machineStep (MachineStepCard.tsx:22).
- Demo: FirstRoutineCard.tsx:22 passes the demo flag to guideCardShows (the card's show rule); no demo copy of a feature in this area.

## Could not check
- Tier "unknown" on 13 rows: the component has no gate of its own, but the screen that draws it is outside this area
  (body map, resting card, charts, records, easy week, start-screen targets, plates setup, machine steps, settings
  choice sheet, import, in-use sign, month report, muscle tips). Their parent screens may gate them.
- Read headers (first 20 lines) and export lines, not every body, to stay inside the 2,500-line limit (about 1,150 used).

## Seen in passing
- MonthCalendar.tsx:2 says History's calendar uses it, but only LogPastSheet.tsx imports it (stale comment, or History
  uses another grid). Not verified further.
- NewNamesCard.tsx:2-4 comments still say "ForgeAI"; the words on screen (lines 23, 36, 68) say MettleUp. Comment only.
