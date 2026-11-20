# A5-phone-components-1-2 checkpoint

F-phone-1310: 12 journeys, 14 type lines
F-phone-1311: 12 journeys, 16 type lines
F-phone-1312: 10 journeys, 16 type lines
F-phone-1313: 10 journeys, 14 type lines
F-phone-1315: 14 journeys, 14 type lines
F-phone-1314: 12 journeys, 14 type lines
F-phone-1317: 12 journeys, 14 type lines
F-phone-1316: 10 journeys, 16 type lines
F-phone-1321: 12 journeys, 14 type lines
F-phone-1326: 12 journeys, 14 type lines

## Entities
- No entity id exists for phone-local data (workouts, sets, body weight, routines, update/watch snooze marks, What's new seen mark). writes/reads left empty; type lines use entity "unknown". Only E-member-items (cloud copy) was linked, on F-phone-1310 type 10.

## Seen in passing (not sure enough for a finding)
- F-phone-1321: the feature row says small trend lines and bar lists can be tapped for a box; Sparkline.tsx and HBarList.tsx have no touch handling at all. Either the feature name is wrong or the behaviour is missing (journey J-F-phone-1321-03 / -09 marked unknown).
- F-phone-1326: screen-reader label says "Show 1 more workouts, 1 left" (plural for one) at SessionHistory.tsx:118.
- F-phone-1311: "Install on watch" does not save the done mark; closing the app before "Got it" shows the card again next visit (may be intended).
- F-phone-1313: "Got it" save is fire-and-forget (WhatsNewCard.tsx:42); a failed save shows the card again with no word.

## Could not check
- Where the Charts page gates charts older than 3 months for free members vs pass members (P-A7-help-1-44 / P-A7-help-1-11): lives in the page around these components, outside my entry points.
- Empty state of the exercise History tab: not in SessionHistory.tsx; the parent decides.
