# Checkpoint: A2-phone-tracker-services-1

Status: DONE (all 74 source lines placed in 40 feature rows, F-phone-500 to F-phone-539).

## Finished units
- [x] 1. Source list read (74 lines: 20 storage-key lines, 54 file lines).
- [x] 2. Code opened: the top 22 lines of each of the 54 files, plus the lines around every storage key (about 1,600 code lines of the 2,500 allowed).
- [x] 3. Switches and plan gates noted (below).
- [x] 4. Items grouped into features in user words.
- [x] 5. Feature rows written: docs/system-map/_work/out/A2-phone-tracker-services-1.jsonl (40 rows).
- [x] 6. Not-a-feature rows: none needed (every file is used by a feature).
- [x] Self-check: JSON parses, all 74 ids covered, every entry path and line exists.

## Switches and plan gates met
- trainerPlans (Pro, hasFeature(link,'trainerPlans')): gymBodySync.ts:60 and :108, gymPlansSync.ts:89, gymWodSync.ts:45.
- FEATURES.coach: coachNote.ts:314 (AI finish note), dashboardPhase2.ts:64 (insight line, strength score).
- FEATURES.nutrition: coachNote.ts:53 and :306 (no food or sleep words while nutrition is hidden).
- trackerPrefs.coachNotes (member opt-in) + a Groq key: coachNote.ts header lines 13-15.
- Member settings: Muscle tips (muscleTips.ts header), photo_backup_on (photoBackup.ts:43, default off).
- Demo data guard: measurementsExport.ts:135 (no file while demo loaded); milestones.ts:40 and coachNote.ts:177 leave demo workouts out.

## Could not check
- Only file headers were read (size limit), so "status" comes from the header comment plus a search for which screens import each file; no screen was opened to confirm the feature is reachable.
- Whether FEATURES.coach is on or off today: lib/features is outside this area.
- Whether the gym server side of workout of the day (migration 0051) is live: the gymWodSync.ts header says "not live yet"; no database reads in this step.
- liveCardImage.ts, liveClock.ts, livePlan.ts, cardSplit.ts, csvText.ts have no importer outside tracker/services (only other service files or tests use them); the chain to a screen was not followed.

## Seen in passing
- None clear.
