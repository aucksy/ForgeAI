# A5-panel-screens-2-1 checkpoint

Output: docs/system-map/_work/out/A5-panel-screens-2-1.jsonl (237 rows: 90 journeys, 146 type lines, 1 finding)

F-panel-300: 14 journeys, 23 type lines
F-panel-301: 14 journeys, 14 type lines
F-panel-302: 9 journeys, 15 type lines
F-panel-303: 7 journeys, 7 type lines
F-panel-304: 10 journeys, 14 type lines
F-panel-305: 8 journeys, 16 type lines
F-panel-306: 4 journeys, 8 type lines
F-panel-307: 6 journeys, 7 type lines
F-panel-308: 9 journeys, 15 type lines
F-panel-310: 9 journeys, 27 type lines

All 10 features (19 feature x role pairs) done. Code lines read: about 2,800 of 3,000.

## Finding written (1)
- FN-A5-panel-screens-2-1-01: a MettleUp receipt that fails to load says "Receipt not found" (MettleUpReceipt.tsx:48-51).

## Seen in passing (not sure, no finding row)
- Members.tsx:439: on a phone card the words "ends" / "ended" are not passed through the language switch, while the rest of the card is.
- AppMembers.tsx:60 says new app members "show up here at once"; the list is read once a minute (AppMembers.tsx:39).
- MessagesSection.tsx:296: "Cancel" on a timed message asks "Take back ...? It is removed from every member's inbox." although it never reached an inbox; takeBack has no busy state (a second tap asks again).
- AutoRemindersSection.tsx:176: "the usual ones" shows whenever the changer's name is missing, even if the settings were changed.
- Money.tsx:295 and 717: "Download Excel file" is marked as needing internet although the file is built on the device.
- More.tsx:117-119: the desk may get both "Messages & offers" and "Workout offer" rows leading to the same page (depends on navFor, not read); the "Workout offer" row also shows on a Starter gym and leads to the Pro note.
- Members.tsx:174: a home tile for dues (filter "tile:dues") reads the non-archived list, while the "Has dues" chip includes archived members; the two lists may differ (inTile not read).
- Messages.tsx, MessagesSection, OffersSection, AutoRemindersSection, AppMembers, Money: every word is fixed English (no language switch), while Members and More use it.
- Feature F-panel-300 is named with "open again"; the button reads "Mark as not done".

## Entities
- Member, payment, membership and enquiry rows are all written as E-crm-records (no finer entity exists).
- The push note a reply sends to the member (kind gym_reply) was left out of F-panel-300 writes: not sure whether it is E-push-jobs or E-member-push-notes.
- F-panel-310: the Enquiries badge reads E-crm-records; no entity was linked for the set-up ring (none fits).

## Could not check
- Exact words not read (line limit): the "not switched on", "needs online", "conversation is full", read / not-read lines and Refresh / Try again buttons of Member messages (logic/memberMessages.ts after line 294); the cancel button on a receipt row (Money.tsx:506, 571); the join-code card; the collect-payment and add-member sheets; the message cap line.
- Server rules were not opened: who sees which member message (0069, 0087), whether the desk may give a reward again after a take-back (canGive), navFor and permissions for menu rows. Journeys state these as must-not lines, not as proven.
- No test file was opened: every journey has coverage "unknown".
- Nothing was driven on a screen; all rows are from reading code.
