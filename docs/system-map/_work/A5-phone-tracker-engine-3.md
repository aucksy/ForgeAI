# A5-phone-tracker-engine-3 checkpoint

F-phone-917: 5 journeys, 8 type lines
F-phone-918: 5 journeys, 8 type lines
F-phone-919: 5 journeys, 8 type lines
F-phone-920: 4 journeys, 9 type lines
F-phone-921: 6 journeys, 7 type lines
F-phone-922: 6 journeys, 7 type lines
F-phone-923: 5 journeys, 8 type lines
F-phone-924: 6 journeys, 7 type lines

All 8 items done. 105 rows: 42 journeys, 62 type lines, 1 finding.

## Entities
No entity in entities.json fits the phone's own workout log, routines, weigh-ins or settings (only server tables are listed),
so most writes/reads are left empty. Used: E-member-items (cloud copy, F-phone-919 journey 05) and E-gym-member-days
(leaderboard kg, F-phone-922 journey 06).

## Seen in passing (not sure enough for a finding)
- 'Machine and cable steps' (F-phone-923): the chosen 2.5 / 5 kg step is used only when the units are kg
  (weightLadder.ts:199); in lb the setting is saved and shown but changes nothing, and the sheet does not say so.
- Strength level (F-phone-921): a body weight under 25 kg or over 300 kg gives no line at all (strengthLevel.ts:140),
  so a typo weigh-in makes the level vanish without a word.
- Plan builder (F-phone-924): the answers are kept only in memory (planBuilderStore has no saved copy); a killed app
  starts over. Save is guarded against a double tap but shows no busy state.
- Plan builder preview shows the goal's rep ranges; once saved, a 'Reps to aim for' choice other than 'Match my goal'
  shows different ranges in the routine.
- Settings wording: the feature is called 'Rep range', the row is 'Reps to aim for', the editor line points to
  'Settings -> More workout choices -> How the app picks your next weight' (routines/[id].tsx:588). Path is right; three names for one thing.

## Could not check
- Whether the watch shows the Target weight or ticks sets with a tick time (F-phone-919, F-phone-923 type 11).
- Whether a trainer progress summary carries the rest seconds (F-phone-919 type 12).
- Whether retick of a set updates its tick time (F-phone-919 journey 03): not read.
