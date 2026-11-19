# A5-panel-screens-1-2 checkpoint

Output: docs/system-map/_work/out/A5-panel-screens-1-2.jsonl (210 rows: 88 journeys, 121 type lines, 1 finding)

F-panel-211: 10 journeys, 14 type lines
F-panel-213: 14 journeys, 14 type lines
F-panel-214: 10 journeys, 14 type lines
F-panel-212: 10 journeys, 14 type lines
F-panel-205: 6 journeys, 7 type lines
F-panel-215: 9 journeys, 15 type lines
F-panel-216: 10 journeys, 14 type lines
F-panel-217: 5 journeys, 7 type lines
F-panel-218: 10 journeys, 14 type lines
F-panel-219: 4 journeys, 8 type lines

All 10 features (17 feature x role pairs) done. Code lines read: about 2,450 of 3,000.

## Finding written (1)
- FN-A5-panel-screens-1-2-01: a second friend with the same name gives the inviting member no free days, yet the sheet says "Free days added" (referrals.ts:108-111).

## Entities
- Enquiries, members, memberships, payments and expenses have no entity of their own: all written as E-crm-records (the panel's synced rows).
- Help questions kept in the browser ("Your questions") have no entity: only E-feedback (the server copy) is written.

## Seen in passing (not sure, not filed)
- Feedback.tsx:71: the message box cuts at 2,000 letters with no word to the person.
- Enquiries.tsx:410-411 and :440: with gym web pages closed, a visitor's web question shows nowhere on the enquiry (the interest-line copy is hidden too). The comment says this is meant.
- Enquiries.tsx:140-162: "Not interested", "Reopen", the reason box and "Mark as done" have no busy state (a double tap saves twice; looks harmless).
- Enquiries.tsx:877: the "already a member" check is frozen when the flow opens; two desks making the same enquiry a member could make two members. Not checked in the save code.
- Expenses.tsx:221 and :365: the sheet's "Remove" and "Save expense" are not held back when the internet is off (the row buttons are). What the save does offline was not read.
- ForgeAccessCard.tsx:103-107 and :139: same, no internet hold on the support-access buttons; the list is read once, never again while the card is open.
- Enquiries screen has no way to delete an enquiry (a non-member's name and number stay under "Not interested").
- Feedback.tsx:38: a staff question is paid from the gym's AI credits the same as the owner's; staff get no "Open AI Assistant" button when credits run out.
- "Your questions" is read from the browser: on a shared desk computer whether one sign-in sees another's questions was not checked (logic/feedback.ts readHistory not read).

## Could not check
- Exact chip words of the Enquiries filters (only "All" was in the lines read), the chat status words (CHAT_STATUS_WORDS), the WhatsApp follow-up message text, the phone-number error in Add enquiry, the Add member and Sell membership sheet words, the offline words of Help and feedback, the access-list line words (grantLine / actionLine), the enrol line: written in general words in the journeys.
- Entry machines (F-panel-215, 216) are hidden and not live (file header: migration 0059 not applied, gate Worker not deployed): journeys are from the code only.
- Whether the server refuses a staff sign-in that tries to add a machine, give free days or open support access: server code not read (out of this item's area).
- No test file was opened: every journey has coverage "unknown".
