# A5-panel-logic-2-1 checkpoint (20 Nov 2026)

Output: docs/system-map/_work/out/A5-panel-logic-2-1.jsonl (223 rows: 96 journeys, 126 type lines, 1 finding). All 9 features done, 18 feature x role pairs.

F-panel-700: 12 journeys, 14 type lines
F-panel-702: 10 journeys, 14 type lines
F-panel-704: 10 journeys, 14 type lines
F-panel-705: 10 journeys, 14 type lines
F-panel-706: 12 journeys, 14 type lines
F-panel-707: 12 journeys, 14 type lines
F-panel-726: 5 journeys, 7 type lines
F-panel-710: 15 journeys, 21 type lines
F-panel-711: 10 journeys, 14 type lines

## Finding
FN-A5-panel-logic-2-1-01 (S2): an imported plan named like "3 Days a Week Monthly" is read as a 3-day plan (importTerms.ts:47-58, 91-93, 116).

## Seen in passing (not sure, not written as findings)
- needsYou.ts:60-63: member questions and member messages come as a count, not a list. One answered and one new in the same minute leaves the count the same, so the new one does not ring.
- members.ts:303: the emergency number is always read as an Indian (+91) number; a foreign emergency contact is refused as "looks wrong".
- sendQueue.ts:86-88, 119-150: the WhatsApp done-list lives in one browser's storage; the same owner on a phone and a laptop can message a member twice.
- members.ts:352-358: the same-number check reads the list it is handed (this device's copy); two desks adding one number at the same moment both pass. Whether archived members are in that list was not read.
- memberCard.ts:73: a plan paid ahead (not started yet) prints "No active plan" on the card.
- navGroups.ts:66: folded menu groups are kept per browser, not per person; a group folded by the owner is folded for staff on a shared computer (a waiting number still shows on the folded title).

## Entities
- No entity fits the browser-only stores (WhatsApp done-list, message language, folded menu groups, alert permission): left out of writes.
- Members, plans, memberships, payments, visits are all written as E-crm-records (the panel's synced rows).

## Could not check
- Only the logic files at the entry points were read (about 1,500 lines). The screens were not opened, so some exact words are marked "exact words unknown: screen not read": the not-a-spreadsheet message, the duplicate-number block, the empty-box message of Messages & offers, the not-sharing words of the Progress card, the rising trend word.
- Whether front-desk staff may import, undo an import, or see the Progress card and "Needs you" (role gating lives in the screens and the server).
- Whether the server enforces the desk's sale limits and the trainer's own-members rule (server code not read).
- No test files were opened: every journey has tests [] and coverage "unknown".
- Nothing was driven in a browser and no database was read.
