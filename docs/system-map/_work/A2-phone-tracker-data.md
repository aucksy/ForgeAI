# Checkpoint A2-phone-tracker-data

- [x] step 1: source list read (40 lines)
- [x] step 2: code opened for all 40 items (file headers + export lists, about 1,350 code lines read)
- [x] step 3: switches and plan gates noted
- [x] step 4: items grouped into features
- [x] step 5: 26 feature rows written (F-phone-1000 to F-phone-1025)
- [x] step 6: 4 not-a-feature rows written (F-phone-1026 to F-phone-1029)
- [x] all 40 source lines named in at least one row (checked by script)

Finished units (source lines): phone.txt#456 #457 #458 #486 #487 #543 #544 #545 #546 #547 and all 30 file# lines.

## Switches and plan gates met
- Plan gate: canUseNow('weightSuggestions') = MettleUp Plus; Targets are empty without it (store/targetStore.ts:141, :172).
- Settings: previousFrom, bodyWeightAnyWorkout, advancedSets (Track RPE), coachNotes, sounds, restSound, shareGym, inUseAfterSet, stuckChoice, weeklyGoal (store/trackerPrefsStore.ts:69-125).
- Settings: Muscle tips on/off (store/muscleTipsStore.ts:1-8); ringThroughDnd, watchOpen (store/restAlertPrefsStore.ts:11-12).
- Demo: "Load demo data" adds pretend measurements (db/demoBody.ts:34).

## Could not check
- Tier (free or Plus) of folders, routines, plan builder, import, workout photos, muscle tips, plates, Progress pick: the gate, if any, sits in screens outside this area. Written as "unknown".
- Whether each feature's screen is reachable: only the data layer was read; "live" means the module is imported by other app code (import count checked), not that a screen was driven.
- store/activeWorkoutStore.ts (3,068 lines) was read only around line 99 (the draft key), within the size limit.

## Seen in passing
- store/trackerPrefsStore.ts:46-56: the type PreviousFrom still allows 'folder' though "Same folder" is retired and reads as Any workout; db/historyScope.ts header still describes "Same folder" as a live choice. Stale wording, not confirmed as a bug.
- store/trackerPrefsStore.ts:8: comment says the AI coach note runs "via Groq"; not checked whether that still matches the live provider.
