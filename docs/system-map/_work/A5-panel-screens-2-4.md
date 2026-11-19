# A5-panel-screens-2-4: checkpoint

Status: all 9 features done (22 feature x role pairs). Output: `_work/out/A5-panel-screens-2-4.jsonl` (266 rows: 105 journeys, 159 type lines, 2 findings). Not merged, not committed (the coordinator does both).

F-panel-334: 9 journeys, 15 type lines
F-panel-336: 5 journeys, 7 type lines
F-panel-335: 4 journeys, 8 type lines
F-panel-337: 15 journeys, 21 type lines
F-panel-338: 15 journeys, 21 type lines
F-panel-339: 15 journeys, 21 type lines
F-panel-342: 15 journeys, 21 type lines
F-panel-340: 12 journeys, 24 type lines
F-panel-341: 15 journeys, 21 type lines

## Findings written
- FN-A5-panel-screens-2-4-01 (S3): 'Copy link' on Your web page shows nothing when the browser refuses to copy.
- FN-A5-panel-screens-2-4-02 (S4): the Fees row reads '1 plans from Plans' / '0 plans from Plans'.

## Seen in passing (not sure, no finding row)
1. Workout of the day, 'Change', then pick another Day in the sheet: the save makes a workout on the new day and the old day's workout stays (WorkoutOfTheDay.tsx:145-148, 213). 'Change' reads like a move; it acts like a copy. Intent unknown.
2. Workout of the day reads 'today' once when the card loads (WorkoutOfTheDay.tsx:98). Left open past midnight, 'Saved. Members see it now.' can be said about yesterday's date.
3. Web page editor: no 'unsaved changes' question was seen in WebPage.tsx; leaving the screen may drop a long draft. The router and Sheet were not read.
4. Web page photos are uploaded as soon as they are picked (WebPage.tsx:261); if the owner leaves without Save, or removes a photo, the file's fate in storage was not read.
5. 'Adding 2 photos…' can never show: photos upload one after another, so the count is never above 1 (WebPage.tsx:258-268, 382). Harmless wording.
6. Desk view of a page not yet made says 'Not made yet. Fill in the parts below, then publish.' although the desk has no parts to fill (WebPage.tsx:135, 160-168).
7. Web page save sends the whole page with no version check (gympage/logic.ts:235-254): two open tabs, the older one can save over the newer. Owner only, so low odds.
8. 'Show my gym's phone number' stays ticked but greyed if the gym phone is later removed in Settings; the save still sends it as on (WebPage.tsx:273, 418-421; logic.ts:246). Server handling not read.
9. Terms of use say the gym can 'change, delete or add plans at any time' (promise P-A7-legal-3-30); a workout plan can only be withdrawn, never deleted (WorkoutPlans.tsx:14-16).
10. 'Send to' in the plan builder shows at most 30 matching members and says nothing when more match (WorkoutPlans.tsx:798).
11. Plan builder 'Cancel' closes at once; no keep-or-drop question seen in WorkoutPlans.tsx (the Sheet part was not read).
12. Member detail hides 'Send a plan' behind the Pro check (MemberDetail.tsx:168-170, 638-639); whether the Workout plans screen itself has the same check was not read.

## Notes on rows
- Role 'trainer': permissions.ts knows only owner and staff (permissions.ts:83-84), so a trainer acts as a staff login. Trainer journeys are the staff journeys, written under the role name the feature rows use.
- Entities: workout plans are rows of E-crm-records; no closer entity exists. The member's phone copy of a sent plan has no entity id that clearly fits, so it is left out of 'writes'.
- Exact words not read (marked 'unknown' in steps): the red words under Page address, About and the map link (gympage/logic.ts WORDS), the 'no exercises' line of the workout of the day, the Set up your gym step's words, the Pro note.

## Could not check
- Nothing was driven on a screen: every row is from reading code. Coverage is 'unknown' on every journey; no test file was opened.
- The public page itself, the server save rules (0080, 0082, 0051, 0024) and the member app side were outside this item's files.
- Two-gym privacy checks (a member or plan of another gym showing up): needs a second test gym.
- Code lines read: about 2,600 of the 3,000 allowed.
