# A5-panel-screens-1-3 checkpoint

Output: docs/system-map/_work/out/A5-panel-screens-1-3.jsonl (220 rows: 88 journeys, 131 type lines, 1 finding).

## Features done (all 10)
F-panel-220: 9 journeys, 15 type lines
F-panel-221: 12 journeys, 14 type lines
F-panel-222: 5 journeys, 7 type lines
F-panel-223: 10 journeys, 14 type lines
F-panel-224: 5 journeys, 7 type lines
F-panel-225: 11 journeys, 14 type lines
F-panel-226: 8 journeys, 16 type lines
F-panel-227: 8 journeys, 16 type lines
F-panel-228: 10 journeys, 14 type lines
F-panel-229: 10 journeys, 14 type lines

Type lines above the 7 per role are "no" lines for type 2 or type 12 (F-panel-220 staff type 2; F-panel-226 and F-panel-227 type 12, both roles).

## Finding
FN-A5-panel-screens-1-3-01 (S3): Gym timings says "Right now members see" for times that are not saved yet (GymTimings.tsx:219-223, 288-292).

## Entities
- All imported members, plans, memberships, receipts and visits are written as E-crm-records (no finer entity exists).
- F-panel-222: E-ai-usage (written) and E-ai-limits (read) are used on the word of entities.json; the server side of the AI call was not read.
- F-panel-229 and F-panel-228: nothing is stored, so "writes" is empty.

## Seen in passing (not findings; not sure, or by design)
- MemberDetail.tsx:352-367: "Archive member" has no "are you sure" question and the button is not greyed while saving (Check in is: line 332). A fast second tap after the first save lands can restore the member straight away.
- MemberDetail.tsx:329-338: "Check in" is offered for an archived member and for a member whose plan has ended, with no word on this page. May be by design.
- ImportMembers.tsx:1553-1554: the time of each past import is shown in the device's own clock (no India time zone set), unlike Gym timings which uses the India clock.
- ImportMembers.tsx:450-456: the Add run has no "already running" guard of its own; it relies on the screen switching to "Adding members…" before a second tap lands.
- shop/invite.ts:56-71 with MemberDetail.tsx:384: in a gym that is not online the "Share app link" message has no gym code, though the feature is named "app link and gym code". The button also needs the internet, so this is rare.
- MemberDetail.tsx:300: a failed check-in or archive shows the raw error message text from the store.
- GymTimings.tsx:267-282: leaving the editor with unsaved changes asks nothing (no "keep or drop" question).
- GymTimings.tsx (whole screen) and ImportMembers.tsx: almost all words are fixed English and do not go through the language setting (only the timings note hint and the pass-member words do).

## Could not check
- F-panel-223 staff: whether a front-desk sign-in can see or save into another branch (branch context and server rules not read). Journey J-F-panel-223-10 says "unknown".
- Exact refusal words for broken gym timings (logic/gymTimings.ts timingsPayload) and for an empty name in the member form (MemberFormSheet): not read; journeys say so.
- The invite message for a member not on the app (inviteMessage) and the card message (cardMessage): words not read.
- What is printed on the member card and inside its QR (CardFace): not read; the type 12 journey rests on promise P-A7-panel-3-09 only.
- Whether an undo removes the members' data from the server for good, and whether the list keeps an import whose members partly stayed (logic/undoImport.ts not read).
- The Members-screen button that opens the Import page (its words): not read.
- No test files were opened: every journey has coverage "unknown".
- Nothing was driven on a screen; all rows are from reading code.
- Code lines read: about 2,300 of the 3,000 allowed.
