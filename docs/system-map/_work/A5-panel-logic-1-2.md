# A5-panel-logic-1-2 checkpoint
F-panel-614: 5 journeys, 7 type lines
F-panel-616: 10 journeys, 14 type lines
F-panel-617: 8 journeys, 7 type lines
F-panel-618: 8 journeys, 16 type lines (type 2 is a "no" line for each role)
F-panel-619: 10 journeys, 14 type lines
F-panel-620: 9 journeys, 15 type lines (staff type 2 is a "no" line)
F-panel-622: 10 journeys, 14 type lines
F-panel-623: 10 journeys, 14 type lines
DONE: 8 of 8 features, 70 journeys, 101 type lines, 3 findings (FN-A5-panel-logic-1-2-01..03). Rows: _work/out/A5-panel-logic-1-2.jsonl (174 lines).

## Entity notes
- Enquiries: no entity of their own in entities.json; linked to E-crm-records (the panel's synced rows) as the nearest fit. Not confirmed that enquiries are stored there.
- F-panel-618 and F-panel-620 write nothing (a check on the device; a file saved on the device).

## Seen in passing (not findings, not verified)
1. Today card "Came in today...": the "{n} more in the register." link opens the whole attendance register, not a list of only the people with an ended plan or dues (apps/dashboard/src/crm/ui/screens/Today.tsx:479-484).
2. "Download Excel file" on Money and Attendance is marked as needing the internet, though the file is made on the device (Money.tsx:295, 717; Attendance.tsx:846). On Your growth the same button works offline (BusinessGrowth.tsx:89).
3. No download button has a busy state: a double tap saves two files (BusinessGrowth.tsx:61-64, Money.tsx:191-199).
4. Your growth: a month before the start counts as "on record" only if a plan ended and was decided in it; a month with fees and joins but no plan ending is left out of the "before" average (businessGrowth.ts:270, 391).
5. csvFilename drops every non-Latin letter: a gym named only in Hindi gets a file name without the gym (csv.ts:65-72).
6. Give all free days runs one call per winner in a row; a failure mid-way shows only the error, not how many were already given (Challenges.tsx:514-529).
7. Diet: "Send to one member" saves the whole plan again from the copy on screen, so two people changing one plan at the same time can overwrite each other (dietPlans.ts:539-548).
8. Promise P-A7-legal-3-30 says plans can be changed, deleted or added at any time; a diet plan cannot be deleted, only withdrawn. Not linked: unclear whether that promise is about diet plans.
9. The Your growth page, Money, Diet plans, Enquiries and the workout-code sheet use plain English strings (no Hinglish table), unlike Today and Challenges.

## Could not check
- Nothing was driven in a browser: every journey is from reading code; coverage is "unknown" and no test was opened.
- Words not read: the ready-made challenge buttons and toasts, the Enquiries duplicate-number warning, the diet builder's save button, the owner-only screen's title, the staff attendance toast wording.
- Whether the server really writes "Asked on your web page: " / "Joined online: " into the interest field of every such enquiry (finding 01 rests on the panel code that hides those notes).
