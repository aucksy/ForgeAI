# A5-phone-tracker-services-1-2 checkpoint

F-phone-514: 5 journeys, 8 type lines
F-phone-515: 5 journeys, 7 type lines
F-phone-516: 5 journeys, 8 type lines
F-phone-517: 5 journeys, 7 type lines
F-phone-518: 5 journeys, 8 type lines
F-phone-512: 6 journeys, 8 type lines
F-phone-519: 6 journeys, 7 type lines
F-phone-521: 5 journeys, 8 type lines

All 8 items done. 103 rows in _work/out/A5-phone-tracker-services-1-2.jsonl (43 journeys, 60 type lines, 0 findings).

## Entities
The phone's own tables (sessions, set entries, exercises, meta) have no entity in entities.json, so most
writes/reads are empty and type lines name "unknown". Used: E-member-items (the empty-workout list's cloud
copy, F-phone-515) and E-gym-mate-profiles (gym mate's shared profile, F-phone-519). No entity for the shared
workouts table (gym_mate_workouts).

## Seen in passing (not findings)
- Minutes and start-hour boxes strip every non-digit (editFields.ts:22, 50): a typed "1.5" reads as 15 minutes, "-5" as 5, with no message.
- New exercise name box has no length limit (library/new.tsx:488-496); only a name passed in from search is cut to 80.
- Exercise chart opens on 12 months or All time when nothing is in the last 3 months (exerciseChart.ts:381-388) without the paid-range check the range chips use (ExerciseMetricChart.tsx:167); the limit is said to be switched off at launch, so not live.
- Search: typing the exact name of an exercise the member hid shows "No exercises found" and no Create row (createOffer reads the full list incl. hidden, ExercisePickerList.tsx:186).
- Exercise media: a gallery clip whose size and length the picker does not report is copied whole (exerciseMedia.ts:45-49).
- The media sheet's "It stays on this phone." (formChoices.ts) is not in promises.json.

## Could not check
- Whether the empty-workout list restores from the cloud copy on a new phone (copyLocal.ts / pack.ts not read).
- Whether a workout edit or a past log reaches the watch, the gym leaderboard or the gym mate copy.
- Another gym's member reaching a gym mate page: needs a second test gym.
- Exact RECORD_LABEL words for "Best · …" and durationText output on feed cards (not read).
