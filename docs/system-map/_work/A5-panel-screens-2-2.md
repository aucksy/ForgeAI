# A5-panel-screens-2-2 checkpoint

Output: docs/system-map/_work/out/A5-panel-screens-2-2.jsonl (197 rows: 70 journeys, 125 type lines, 2 findings). All 10 features done.

F-panel-311: 10 journeys, 14 type lines
F-panel-312: 6 journeys, 7 type lines
F-panel-313: 4 journeys, 8 type lines
F-panel-314: 6 journeys, 7 type lines
F-panel-315: 8 journeys, 17 type lines
F-panel-317: 7 journeys, 17 type lines
F-panel-318: 8 journeys, 16 type lines
F-panel-319: 9 journeys, 15 type lines
F-panel-320: 8 journeys, 16 type lines
F-panel-321: 4 journeys, 8 type lines

Type lines above include the "no" lines for types 2 and 12 where no journey was written.

## Findings written
- FN-A5-panel-screens-2-2-01 (S3): the desk can never see the MettleUp Plus lock; the read-only card is only drawn on the owner's tab.
- FN-A5-panel-screens-2-2-02 (S2): a receipt whose number is not confirmed yet greys Print but still offers Send on WhatsApp, and the message carries the number.

## Entities: nothing fits
- F-panel-312: the "Not now" choice and the "You have shared your link" mark are kept by the Get started store (setPageNotNow, noteLinkShared); no entity in entities.json names them. Left out of writes; type lines 10 and 11 say "unknown".
- F-panel-320 staff: the Dark or light choice is kept in the browser; no entity. Type line 10 says "unknown".
- F-panel-311: reading one member's workouts (useMemberProgress) may read E-member-items or gym_mate_workouts; not opened, so only E-gym-progress-summaries is listed.
- F-panel-319: receipts are built from the synced gym records (E-crm-records); there is no separate member-receipt entity (E-gym-receipts is MettleUp's receipt to the gym, used only for F-panel-314).

## Seen in passing (not written as findings)
1. MyMembers.tsx:271 - one member's progress page decides "not ready" from the QUESTIONS server check (questionsApi.questionsMissing), not from a training-progress check. Not sure it is wrong: the read may live in the same server part.
2. MyMembers.tsx:104 and 260 - a trainer's page is headed "Your members: who to talk to today" but the trainer cannot send either ready message ("Only the gym owner can send these from here for now.").
3. MyMembers.tsx:242-244 - after "Sent" the two buttons are live again; a second tap sends a second message with no question.
4. OnlineJourney.tsx:160-162 and 133-136 - "Print poster" and "Send on WhatsApp" mark the link as shared (and the set-up step moves on) even when the print or the WhatsApp is cancelled.
5. OnlineJourney.tsx:85-88 - the toast timer is never cleared, so a second toast can be hidden early by the first one's timer.
6. PlusLock.tsx:49 and 61 - when reading the switch fails the card is simply not drawn; the owner gets no word.
7. PayMettleUp.tsx:129-132 - once the owner types in "Amount paid", the box stops following the picked plan, also after a successful send; the next payment can go out with the old amount typed in.
8. PayMettleUp.tsx:238 - only the 5 newest payments are listed, with no word that older ones exist.
9. Plans.tsx:345 - "Save plan" has no wait-for-internet mark although "+ Add plan" and "Edit" have.
10. Plans.tsx:282-301 - no duplicate plan-name check on the sheet; a price typed as 0 is accepted.
11. Settings.tsx:157-165 - Save details is two calls (gym record, then the name for members); if the second fails the first is already saved and the owner sees an error.
12. Many words on these screens are not passed through the language helper t(): PayMettleUp (all), Settings titles and buttons, MyMembers title and empty states, Questions word list, Receipt. In Hinglish these would stay English. Not checked against the Hinglish word file.
13. PassVisits.tsx has no role check of its own; the feature row lists owner only. Whether the desk can open it and download phone numbers was not checked (route rules not read).

## Could not check
- PayOnline block ("Pay online", receipts) inside Pay MettleUp: not read (size limit); its words are "unknown" in J-F-panel-314-03.
- Exact words of: the reference-number error, the payment status pills and lines, the plan-now and trial lines (logic files not read); the Plus lock card body and last-changed line; the GSTIN, name and UPI error lines; the server error words for a question answered twice.
- Whether the owner sees a question a member sent to one named trainer (server rule not read).
- Whether switching "Comes with a pass" off keeps past pass visits counted (logic/passMembers.ts not read).
- The routes and menu words that lead to each page (router not read): starts are written as "from the menu".
- Nothing was driven on a screen and no data was read; every row is from code reading. No test was opened, so every journey has tests [] and coverage "unknown".
- The merge check (_tools/merge.mjs) was not run by this helper.
- Code lines read: about 2,750 of 3,000.
