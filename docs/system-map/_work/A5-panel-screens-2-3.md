# A5-panel-screens-2-3 checkpoint

Output: docs/system-map/_work/out/A5-panel-screens-2-3.jsonl (176 rows: 70 journeys, 105 type lines, 1 finding). All 10 features done.

F-panel-322: 7 journeys, 7 type lines
F-panel-324: 4 journeys, 8 type lines
F-panel-325: 11 journeys, 14 type lines
F-panel-326: 7 journeys, 17 type lines
F-panel-327: 8 journeys, 17 type lines
F-panel-328: 10 journeys, 14 type lines
F-panel-330: 6 journeys, 7 type lines
F-panel-331: 6 journeys, 7 type lines
F-panel-332: 5 journeys, 7 type lines
F-panel-333: 6 journeys, 7 type lines

## Finding
- FN-A5-panel-screens-2-3-01 (S3): on a trainer's page showing a past week, 'Book with <name>' opens a sheet whose Day list holds only a day already over (Trainers.tsx:902, 548-549, 682; the main calendar's button at 477 handles it).

## Entities
- No entity fits the gym copy kept in the browser (a gym that is not online, the demo gym, the offline copy on a device). Journeys of F-panel-322 that erase or replace it list E-crm-records under reads only, and writes is left empty.
- No entity fits the set-up ticks and the 'moved to the bottom of the menu' choice (F-panel-324), nor the saved range of 'Your numbers' (F-panel-326). Where they are kept was not read; type lines say "unknown".
- Roles of F-panel-330 to 333 are "unknown" in features.json; rows use that word. The screen itself tells owner from non-owner (schedule.owner) and lets a trainer edit only their own page (trainerSchedule.ts:268).

## Seen in passing (not findings)
1. Settings confirm sheet: the red button ('Load demo gym', 'Erase everything') has no busy state while the work runs (Settings.tsx:490-521); a double tap may run it twice.
2. Whole Sign-in & data tab, the 'Workout offer' card on Today (Today.tsx:611-618), 'Your numbers' sub-lines and every Trainers word are plain English strings, not language keys: Hinglish users see English there.
3. 'Talk to these members' builds 'expired' / 'ends' in plain English inside an otherwise translated line (Today.tsx:345).
4. 'N birthdays today' is worked out from birthdays alone (Today.tsx:548): after the wishes are sent the row seems to stay all day and can be tapped again (unless the automatic wish is on).
5. Set up your gym: a step marked done by hand cannot be un-marked (GetStartedCard.tsx:271).
6. 'Cancel booking' cancels on one tap, no 'are you sure' (Trainers.tsx:741-754).
7. Booking sheet makes one request id per open sheet and reuses it after the time or member is changed (Trainers.tsx:557, 591): if a first try reached the server but its answer was lost, a changed second try may be treated as the same request. Server side not read.
8. Booking sheet's member list shows at most 8 names with no "more" word (Trainers.tsx:564).
9. 'What they teach' is cut to 80 letters at save with no count shown while typing (Trainers.tsx:993, 1046).
10. A failed re-read of the trainers week keeps the old week on screen silently (Trainers.tsx:138).
11. Today 'Message' link builds wa.me from the saved digits with no check for an empty or short number (Today.tsx:653).

## Could not check
- Nothing was driven; all rows are from reading code. No test file was opened, so every journey has coverage "unknown".
- Server side of trainers (0065: who may cancel after the start, who may save a profile, double booking) and what the member app shows of a trainer or a booking.
- The refusal words a front-desk login sees on /setup and /money/today (router not read).
- The range chooser words of 'Your numbers' and the exact trial / lapse / renew lines (other files, outside the line budget).
- Whether a member's phone can be empty (the member form was not read).
- Code lines read: about 2,950 of 3,000.
