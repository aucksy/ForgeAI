F-panel-510: 12 journeys, 14 type lines
F-panel-510 note: members, plans, memberships and payments all map to E-crm-records (no finer entity exists).
Seen in passing: the member page words (Edit, Collect payment, Archive member, the Details labels) are plain strings, not translated, so that page stays English when the panel is in Hinglish (apps/dashboard/src/crm/ui/screens/MemberDetail.tsx:400-412, 700-712).
F-panel-520: 13 journeys, 14 type lines
F-panel-520 note: the done ticks and the message language are kept only in the browser (no entity fits, left out). The Messages section itself (MessagesSection) was not opened: its group picker words are from the promise text only.
Seen in passing: in the one-member WhatsApp sheet, changing the language rebuilds the words and drops hand edits without a word (apps/dashboard/src/crm/ui/WhatsAppSheet.tsx:93-98).
Seen in passing: Messages page, WhatsApp sheets and the queue are plain English strings, not translated (Messages.tsx:36-46).
F-panel-513: 12 journeys, 14 type lines
F-panel-513 note: the cash book rows and receipts map to E-crm-records; E-receipt-history for the cancel record. The Collections list body (Money.tsx:140-590) was read only by its button and empty-state words.
F-panel-534: 6 journeys, 7 type lines
F-panel-534: owner only (1 role).
Seen in passing: the 'Amount paid' box stops following the plan once the owner types in it, and is not reset after a send, so switching Starter/Pro later can send a proof with the old plan's amount (apps/dashboard/src/crm/ui/screens/PayMettleUp.tsx:96,131-133,206-209).
Seen in passing: the 'not ready yet' and 'not available yet' cards say 'message MettleUp' but have no button or number to do it (PayMettleUp.tsx:160-176).
F-panel-515: 8 journeys, 16 type lines
F-panel-515: plans map to E-crm-records.
Seen in passing: the plan sheet has no check for a plan name that already exists (apps/dashboard/src/crm/ui/screens/Plans.tsx:283-287), and a comment says plans can only be retired, never deleted (Plans.tsx:53-57).
F-panel-528: 10 journeys, 14 type lines
F-panel-528 note: StaffSettings (the staff page) was not opened; its content is from the code comment at Settings.tsx:95-96. The words of the delete sheet (DELETE_WORDS) were not opened.
Seen in passing: 'Download all your gym’s data' is switched off with no internet although the file is made from the copy already on the device (apps/dashboard/src/crm/ui/GymDataActions.tsx:63,87).
Seen in passing: the delete request names the asker as '(role)' and is sent through the feedback channel; nothing stops a second send (GymDataActions.tsx:106-116).
F-panel-504: 6 journeys, 7 type lines
F-panel-504: owner only (1 role). Hand ticks, hidden and pageNotNow are kept in browser storage (no entity fits, left out).
Seen in passing: because hand ticks are per browser, an owner who ticked 'Add your logo and colours' on the laptop sees it not done on the phone (apps/dashboard/src/crm/ui/GetStartedCard.tsx:49, 96-98).
