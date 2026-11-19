# A5-panel-ui-shell-2b checkpoint
F-panel-529: 8 journeys, 16 type lines
F-panel-519: 9 journeys, 15 type lines
F-panel-522: 15 journeys, 21 type lines
All 3 features done. No finding rows (no plain bug seen).

Seen in passing (not sure, not findings):
- GymTimings.tsx:121 'Back to Settings' leaves the editor with unsaved changes and asks nothing.
- GymTimings.tsx:219-223 and :189 the 'Right now members see' line is worked out once (per change / per page open); it does not tick over at closing time or midnight.
- GymTimings.tsx:255 two owners on two devices: the last save wins, the other is not told (no version check seen in the page).
- GymTimings.tsx most words are fixed English (only the note hint goes through t()); MemberMessages.tsx: the trainer note goes through t(), the staff note does not.
- ImportMembers.tsx:463-476 closing the tab during 'Adding members…' leaves a part import; staff have no 'Undo this import' (owner only, :787).
- MemberMessages.tsx / Questions.tsx: a half-typed reply lives only in the card's state; leaving the page drops it with no question.
- Questions.tsx:74-76 'replaced' lowers the open count by one on every answer without checking the question was open (safe today: only open ones can be answered).

Entities: no separate entity for the import's 'extra details' or for the import id; both sit inside E-crm-records. Staff 'Trainer tick' is read from E-gym-staff.
Could not check: what the server really returns per role (0036, 0069, 0096, 0053 functions not opened); the exact red words for bad times (packages/theme/src/gymHours.ts not opened); the exact words for an unreadable file and the row cap; whether the route /members/import and /questions are blocked by the router for a role; nothing was run on a screen.
