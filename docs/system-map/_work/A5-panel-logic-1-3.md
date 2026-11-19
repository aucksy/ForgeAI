# A5-panel-logic-1-3 checkpoint

Output: docs/system-map/_work/out/A5-panel-logic-1-3.jsonl (161 rows: 61 journeys, 97 type lines, 3 findings). All 8 features done.

F-panel-624: 9 journeys, 15 type lines
F-panel-625: 6 journeys, 7 type lines
F-panel-626: 10 journeys, 14 type lines
F-panel-627: 12 journeys, 24 type lines
F-panel-628: 4 journeys, 8 type lines
F-panel-629: 6 journeys, 7 type lines
F-panel-630: 4 journeys, 8 type lines
F-panel-631: 10 journeys, 14 type lines

## Notes on roles and entities
- The panel has two sign-in roles only, owner and staff (auth/permissions.ts:86-93). "trainer" in a feature row is a staff sign-in ticked as a trainer; no separate trainer rule was found in the code read for these features.
- F-panel-628 is no longer a card on Today: since R-526 it is its own page, "Set up your gym" (ui/GetStartedCard.tsx:1-9). The feature name in features.json is stale.
- No entity fits: the browser-only state of F-panel-628 (hand ticks, menu place), of F-panel-630 ("Last downloaded") and of F-panel-626 ("Your questions" list). Left out of writes/reads.
- Expenses, workout plans, receipts and gym details are all written as E-crm-records (the panel's synced rows).

## Seen in passing (not sure, or small; not written as findings)
1. Expenses: the list heading says "Expenses this month" even when another month is open (ui/screens/Expenses.tsx:161).
2. Expenses: shop takings are put in the month of the order's last change, not its hand-over; a later change to a collected order could move it to another month (logic/expenses.ts:145-147).
3. Help: a message stops at 2,000 letters with no counter and no word (ui/screens/Feedback.tsx:70; logic/feedback.ts:177).
4. Help: the feature name says the AI answer uses AI credits, and the code sends the gym's key "so the gym's AI credits pay" (ui/screens/Feedback.tsx:36-37); promise P-A7-whats-new-1-38 says "Your and your staff's questions stay free". Could not tell which is true without the server.
5. Help: the "delete our gym" request goes through the same help box, so it may get an AI answer and sits in "Your questions" (ui/GymDataActions.tsx:110-113).
6. Help: when the answer came from the help pages for want of credits, there is no "Did this solve it?" (ui/screens/Feedback.tsx:75-86).
7. Set up your gym: "Mark done" has no undo (ui/GetStartedCard.tsx:271-275); hand ticks live in one browser, so another device shows fewer steps done.
8. Set up your gym: the file's header still says "the five first steps" (logic/getStarted.ts:2); there are 8.
9. Workout report: only the newest request can be downloaded, so asking again hides a sent report that is still inside its 30 days (logic/gymReports.ts:135-141).
10. Workout report: a member name in Hindi letters only gives the file name "workout-report-member-<day>.csv" (logic/gymReports.ts:144-154).
11. Workout report: What's new says the button is "Download report" (P-A7-whats-new-1-86); the button says "Download full history" (logic/gymReports.ts:93).
12. Data download: if the browser blocks the second file, the card still says "Downloaded: an Excel file and a full copy." (ui/GymDataActions.tsx:65-69).
13. Data download: the card has no word that the file holds every member's personal details.
14. GST: the tax split depends on the gym's GSTIN today, so adding a GSTIN makes old receipts show tax (logic/gst.ts:179-181); the receipt code itself was not read.
15. Exercise list: muscle and log-type words are fixed English (logic/exerciseCatalog.ts:214-233); a fast second tap on a search row may add the exercise twice (ui/screens/WorkoutPlans.tsx:730-733).

## Could not check
- Nothing was run or driven: every journey is from reading code, coverage "unknown".
- Receipt wording for GST (logic/receiptDoc.ts) and the add-expense sheet's field labels (Expenses.tsx:355-400): not read, line budget. Journeys there use plain descriptions, not exact labels.
- The server side of help answers (credits, daily limit), of report requests (30 days, who may download, trainer limits) and of staff write refusals: not read.
- The assistant's own use of the exercise list (assistant/planWriter.ts) and its expense card: not read beyond the entry lines.
- Whether a trainer sees the workout report card only for their own members: needs the server rules.
