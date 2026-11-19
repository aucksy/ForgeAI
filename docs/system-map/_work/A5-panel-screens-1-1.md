# A5-panel-screens-1-1 checkpoint

Output: docs/system-map/_work/out/A5-panel-screens-1-1.jsonl (245 rows: 101 journeys, 144 type lines, 0 findings).

## Finished features
F-panel-200: 6 journeys, 7 type lines
F-panel-201: 10 journeys, 14 type lines
F-panel-203: 8 journeys, 16 type lines
F-panel-202: 10 journeys, 14 type lines
F-panel-204: 4 journeys, 8 type lines
F-panel-206: 9 journeys, 15 type lines
F-panel-207: 11 journeys, 14 type lines
F-panel-208: 10 journeys, 14 type lines
F-panel-209: 18 journeys, 21 type lines
F-panel-210: 15 journeys, 21 type lines

All 10 items done. Code lines read: about 2,150 of 3,000.

## Entities: what did not fit
- Visits, members, memberships and the gym's own settings (free days per friend) are all inside E-crm-records; there is no separate entity for a visit.
- Confirming a challenge winner adds free days to a membership on the server. Only E-gym-challenge-hits is written in the rows; whether the membership inside E-crm-records is also changed was not read.
- The AI Assistant conversation kept in the browser ("Start a new chat" clears it) has no entity.

## Seen in passing (not findings)
1. Visits, "Losing the habit": the button says "Download Excel file" but the code builds a CSV file (apps/dashboard/src/crm/ui/screens/Attendance.tsx:774-791, 847). The same button is greyed without internet although the list is already on the device (line 846).
2. Visits header: "Pass visits" goes through the language switch, "Check-in QR" and most Visits, Busy machines and Diet plans words are plain English strings (Attendance.tsx:137 against 141). Not checked whether the shared button and title parts translate by themselves.
3. The address /attendance/pass opens for a gym with no pass member; only the button is hidden (Attendance.tsx:90, 97-100, 135).
4. Busy machines: "Back to Settings" leaves with unsaved changes and asks nothing (BusyMachines.tsx:110).
5. Challenges, give free days to all winners: one request per winner in a loop; a failure half-way leaves earlier winners given and later ones not, with only an error toast (Challenges.tsx:514-529).
6. Member page diet plan: the stop button has no busy state (DietPlans.tsx:532-539); "Send" saves the whole plan as this device last read it, so a colleague's edit made meanwhile can be overwritten (DietPlans.tsx:522).
7. Bring a friend: a number being typed is replaced when the saved number changes on another device (BringAFriend.tsx:53-55). The feature name says the owner sees "links" counts; the card shows only asks and joins (BringAFriend.tsx:115).
8. AI Assistant: the line "Every {n} AI questions use 1 credit" (assistant/ui/AssistantHome.tsx:228) sits beside the promise "Questions never use credits" (P-A7-panel-1-14, already marked partly).
9. Visits "Undo" removes a member's own app or QR check-in as well as a desk one, with no question first (Attendance.tsx:498-503; data/local.ts:1098-1105).
10. Attendance.tsx has no owner-only check: a desk login can download the at-risk list with mobile numbers. No promise found that says who may export.
11. The panel knows only two roles, owner and staff (auth/permissions.ts:83-90). "trainer" in F-panel-209 and F-panel-210 is a staff login ticked as a trainer, so the trainer journeys are the staff journeys.

## Could not check
- Nothing was driven on a screen: every "user sees" line comes from reading the code.
- Words not read (written as "unknown" in the rows): the AI Assistant's cards, the check-in poster page, the Pass visits page, the ready-made challenge toasts and turn-off words, the give-free-days button labels, the busy machines status lines, the "who gets it" part of the diet plan editor, the toast after a diet plan is saved.
- Whether the Settings page shows the "Busy machines" and "Bring a friend" cards to a staff login (Settings page not read).
- Whether the gym's server refuses a staff login that tries to save a challenge, hide a member or save machines (server code not in this step; the panel hides the buttons from a "canEdit" answer).
- No tests were opened: every journey has coverage "unknown".
