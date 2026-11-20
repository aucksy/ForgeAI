# A5-phone-lib-core-1 checkpoint (done, 2026-11-20)

F-phone-1720: 5 journeys, 7 type lines
F-phone-1727: 6 journeys, 7 type lines
F-phone-1726: 5 journeys, 8 type lines
F-phone-1706: 6 journeys, 7 type lines
F-phone-1710: 5 journeys, 7 type lines
F-phone-1719: 9 journeys, 15 type lines (member + system)
F-phone-1729: 4 journeys, 8 type lines
F-phone-1721: 4 journeys, 8 type lines
F-phone-1713: 5 journeys, 7 type lines

Output: _work/out/A5-phone-lib-core-1.jsonl (125 rows: 49 journeys, 74 type lines, 2 findings). merge.mjs --dry: 125 passed, 0 rejected.

## Entities
- No entity exists for phone-only data (workouts, sets, records, the phone's meta keys such as update_seen,
  backup_moved_seen, drive_linked, feedback_sender). Workout/record journeys list none; type lines say "unknown".
- Feedback and crash reports use E-feedback.

## Seen in passing (not findings)
- The overload engine's plateau note says "stuck ... for three weeks" but counts three sessions, which may be days apart (engine/overload.ts:149).
- Overload notes are written in kg ("60 kg") and shown raw on the coach plan card (components/chat/cards/WorkoutPlanCard.tsx:117); a lb member may see kg in the note. Not checked whether planRowView hides it for lb.
- Suggested weights are promised as a paid feature (P-A7-help-1-11), the feature row says tier free; gating not checked.
- findUpdate (lib/appUpdate.ts:87), the listed entry point, has no caller outside tests; updateStore uses findLatest.
- Credits: a failed "Read the licence" open is silent (app/credits.tsx:16).
- useBackGuard: leave() re-runs the handler; a screen still "busy" would ask again (lib/useBackGuard.ts:27) - caller's job per its comment.

## Could not check
- Whether the help server keeps the push address beyond the reply (server code not in this item).
- Real UI of the update full screen button words (UpdatePrompt.tsx not opened past the words file).
