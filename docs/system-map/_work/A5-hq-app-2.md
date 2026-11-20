# A5-hq-app-2 checkpoint

F-hq-114: 5 journeys, 7 type lines
F-hq-119: 5 journeys, 7 type lines
F-hq-117: 4 journeys, 8 type lines (type 12 = no: the card shows no personal data)
F-hq-118: 5 journeys, 7 type lines
F-hq-120: 5 journeys, 7 type lines
F-hq-122: 5 journeys, 7 type lines
F-hq-123: 5 journeys, 7 type lines
F-hq-102: 5 journeys, 7 type lines

All 8 items done. Output: docs/system-map/_work/out/A5-hq-app-2.jsonl (97 rows: 39 journeys, 57 type lines, 1 finding). Dry merge: 0 rejected, 0 with gaps.

Entities: no entity fits the HQ "Needs you" counts as a whole (they are read from several tables); used E-leads, E-feedback, E-gyms, E-mettleup-payments. No entity for GitHub release download counts or the Cloudflare weekly usage check (System page); left out.

Finding: FN-A5-hq-app-2-01 (alert sound plays when alerts are off).

Seen in passing (not findings):
- Feedback card: after "Send reply" the sent reply is not drawn under "Your reply" and the "Needs reply" flag stays until the page is reloaded; the box label still says "Reply", so a second send is easy (app.js:806-811).
- Support access records: lists stop at 200 rows ("200+"); the server takes an offset but the page has no way to see the rest (app.js:680, deploy/hq/api.js:371-376).
- Sign-in history: the server pages with "before", the page shows only the first page (app.js:572, deploy/hq/api.js:363-368).
- The open support access card does not close itself when its end time passes; it shows until reload (app.js:673).

Could not check: whether each HQ look is shown to the gym owner (lives in database functions, not in the entry points); whether /api/feedback/status checks the status word against the list (setFeedbackStatus not opened).
