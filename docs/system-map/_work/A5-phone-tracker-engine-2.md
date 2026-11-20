F-phone-909: 6 journeys, 7 type lines
F-phone-910: 6 journeys, 7 type lines
F-phone-911: 5 journeys, 7 type lines
F-phone-912: 4 journeys, 8 type lines
F-phone-913: 4 journeys, 8 type lines
F-phone-914: 5 journeys, 7 type lines
F-phone-915: 5 journeys, 7 type lines
F-phone-916: 5 journeys, 7 type lines

Status: all 8 items done (909-916). Output: _work/out/A5-phone-tracker-engine-2.jsonl
Entities: phone-local workouts, sets, exercises, routines, records and own measurements have no entity id in entities.json (only E-member-items, the cloud copy, which these engine features do not write directly). reads/writes left empty; jtype entity "unknown". F-phone-911 reads E-gym-body-measurements (trainer entries).
Findings: FN-A5-phone-tracker-engine-2-01 (body fat accepted above 100 %).
Seen in passing (not sure, no finding):
- Profile chart: a saved 12-month or All-time range loads on open without the free-plan check (pickRange checks, load does not). Limit is switched off at launch, so no live effect today.
- History chart screen-reader summary says "No workouts yet." for a range with zero workouts, while the visible card shows empty bars with the normal caption.
- Muscle tips: muting "back" (or chest) also hides a missing biceps / rear shoulders (or triceps / side shoulders) tip, because those are folded into the muted group first.
- Settings row is titled "Weight step"; What's new and the feature name say "Weight jumps".
- Ready today: a failed read says "Please go back and open this page again." with no Try again button.
Could not check: tests for these features (not opened; coverage left unknown); behaviour on a real phone (no driving in this step).
