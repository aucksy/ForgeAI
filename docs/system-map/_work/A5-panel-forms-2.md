# A5-panel-forms-2 checkpoint

F-panel-406: 10 journeys, 14 type lines
F-panel-408: 12 journeys, 14 type lines
F-panel-412: 5 journeys, 7 type lines
F-panel-409: 14 journeys, 14 type lines
F-panel-407: 8 journeys, 16 type lines
F-panel-413: 14 journeys, 14 type lines
F-panel-410: 10 journeys, 16 type lines
F-panel-411: 10 journeys, 16 type lines

All 8 features done. Output: docs/system-map/_work/out/A5-panel-forms-2.jsonl (83 journeys, 111 type lines, 1 finding).

## Entities
- The member row and the enquiry row are written as E-crm-records (the panel's synced list). There is no separate member or enquiry entity id.
- The "every branch" tick has no entity of its own: written as E-crm-records, with E-gyms as a read for the branch list.

## Finding
- FN-A5-panel-forms-2-01 (S3): pass box ticked, no company picked: the message is not scrolled into view, so "Add member" can look dead on a phone.

## Seen in passing (not findings)
- A joining date after today is accepted; only the date of birth is checked against today (logic/members.ts:302-304).
- What's new says "When you add or edit a member, Take photo uses the desk camera" (P-A7-whats-new-1-89), but the edit form has no photo row (MemberFormSheet.tsx:254, "!editing"); the photo is changed on the member's page instead.
- The "photo was not saved" banner drops the reason it was given (MemberFormSheet.tsx:56-57, "_why" unused).
- "Cancel" stays pressable while "Saving…" (MemberFormSheet.tsx:238); Escape and Cancel drop typed text with no question.
- While EDITING member A, typing an archived member B's number and tapping "Bring them back" restores B and opens B's page; A's typed changes are dropped without a word (MemberFormSheet.tsx:193-201).
- English-only lines inside a form that otherwise follows the Hinglish switch: the archived banner and its two buttons, "Can train at every branch" and its hint, every photo word, the archived note, "Could not bring back that member." (lang.ts says untranslated lines stay English, so by design).
- A typed pass company name is cut at 40 letters while typing with no message (MemberFormSheet.tsx:570).
- The same-mobile check runs against this device's copy of the list (data/local.ts:361); whether the server also refuses a second member with the same number was not read.

## Could not check
- Nothing was driven on a screen: every "user sees" line comes from reading the code. No tests were opened: coverage is "unknown" on every journey.
- How a pasted "+91 98765 43210" is trimmed (the shared mobile-input helper was not read).
- The words of the screens after the form: Sell membership, the referred-friend thank-you sheet, the title of the "already a member" sheet.
- What another branch's desk sees of an "every branch" member, and whether the server enforces the tick.
- Whether a trace is kept of who edited a member, and what happens to a member's app sign-in when the desk changes their number.
- Whether the server refuses a staff login that sends the "every branch" tick (the panel only hides the box).
- Two-gym privacy checks (a number used at another gym): needs a second test gym.
