# A2-phone-tracker-lib checkpoint

Output: docs/system-map/_work/out/A2-phone-tracker-lib.jsonl (38 rows, F-phone-1100 to F-phone-1137)

## Finished units
- [x] 1. Source list read (59 lines)
- [x] 2. Code opened for every item (file headers + export lines + who imports each file; about 1,500 code lines read)
- [x] 3. Switches and plan gates noted (see below)
- [x] 4. Items grouped into features
- [x] 5. Feature rows written: catalog (F-phone-1100 to 1103), lib (1104 to 1129), share (1130 to 1134)
- [x] 6. Not-a-feature rows written (1135 to 1137)
- [x] All 59 source lines are in the "sources" of at least one row

## Switches and plan gates met
- Plan gate: a Starter gym's share picture carries the gym's name only, no logo (apps/mobile/src/tracker/share/gymBrand.ts:7).
- Member choice "Hide" the gym on share pictures (apps/mobile/src/tracker/share/gymBrand.ts:7).
- Member choice per exercise: "Show after every set of this exercise" for In use (apps/mobile/src/tracker/lib/inUse.ts:11).
- Member choice "Ask me" decides whether the step-back card asks first (apps/mobile/src/tracker/lib/stepBack.ts:3); the setting itself lives outside this area.
- Member choices: body figure (bodyMapPaths.ts:12), share size and background (share/frame.ts:50, :55), "Previous values" scope (lib/previousSource.ts:7).
- No per-gym on/off switch and no "Pro only" rule is read anywhere in these three folders (search for Pro/tier/Starter/flag/paywall found only the two comment lines above and firstRoutine.ts:13 "nothing behind a paywall").

## Seen in passing
- lib/historyView.ts:14 is imported only by its test. Its header says it is the guard that stops the History search box losing the keyboard mid-word (device QA run 38081757903). Either the screen has its own copy of the rule or the guard is not wired: worth a look at src/app/history.tsx.
- lib/sheetChange.ts and lib/tileFit.ts are imported only by tests (dead code kept green by tests).
- lib/workoutTab.ts:19 comment says "Drag to reorder is not built", but components/WorkoutRoutines.tsx:20 imports DragList and lib/dragOrder.ts is live: stale comment.
- catalog/catalogSync.ts and lib/firstRoutine.ts have no "file" line in the source list (only their storage-key lines phone.txt#455 and #459); covered through those.

## Could not check
- Whether gym plans on the phone (F-phone-1114) sit behind a gym switch or plan: the rule would be in services/gymPlansSync.ts and src/shop, outside this area. Written as "unknown".
- Whether pass members reach these tracker features: role rules are outside this area; rows say "member" only.
- "live" status rests on a non-test file importing each module; no screen was opened on a device.
