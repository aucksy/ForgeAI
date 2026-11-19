F-panel-510: 12 journeys, 14 type lines
F-panel-510 note: members, plans, memberships and payments all map to E-crm-records (no finer entity exists).
Seen in passing: the member page words (Edit, Collect payment, Archive member, the Details labels) are plain strings, not translated, so that page stays English when the panel is in Hinglish (apps/dashboard/src/crm/ui/screens/MemberDetail.tsx:400-412, 700-712).
F-panel-520: 13 journeys, 14 type lines
F-panel-520 note: the done ticks and the message language are kept only in the browser (no entity fits, left out). The Messages section itself (MessagesSection) was not opened: its group picker words are from the promise text only.
Seen in passing: in the one-member WhatsApp sheet, changing the language rebuilds the words and drops hand edits without a word (apps/dashboard/src/crm/ui/WhatsAppSheet.tsx:93-98).
Seen in passing: Messages page, WhatsApp sheets and the queue are plain English strings, not translated (Messages.tsx:36-46).
