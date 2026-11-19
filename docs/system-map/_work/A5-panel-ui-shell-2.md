F-panel-502: 13 journeys, 23 type lines
F-panel-516: 12 journeys, 14 type lines
F-panel-527: 8 journeys, 16 type lines
F-panel-526: 18 journeys, 21 type lines
F-panel-517: 13 journeys, 14 type lines
F-panel-514: 4 journeys, 8 type lines
F-panel-538: 11 journeys, 14 type lines

NOT DONE (limit reached, 3 items left): F-panel-529, F-panel-519, F-panel-522. No row written for them.
Entity notes: enquiries and expenses have no entity of their own in entities.json; E-crm-records used (they sit in the panel's synced snapshot; the table was not confirmed). The offline copy on the device (browser storage) has no entity; E-crm-records used.
promise_ids: left empty everywhere; promises.json was not searched (token limit).
Seen in passing:
- Visits, Losing the habit: the 'Message' link is wa.me/<phoneDigits(member.phone)>; not checked that the digits always carry the country code (apps/dashboard/src/crm/ui/screens/Attendance.tsx:941).
- Help and feedback: 'Your questions' is kept in the browser (readHistory), so on a shared desk device the next person may read the last person's questions; sign-out clearing not checked (apps/dashboard/src/crm/ui/screens/Feedback.tsx:42).
- Help and feedback: typing is cut at FEEDBACK_MAX with slice(); no counter or word seen in the lines read (Feedback.tsx:73).
- Offline bar says 'Check-ins, payments and new members are saved on this device' even on a device that cannot take payments offline; a second line corrects it (apps/dashboard/src/crm/ui/offline.tsx:144-157).
Could not check: exact validation words of the challenge and diet sheets; whether staff see the reward confirm buttons in Challenges (Challenges.tsx:559); what staff see at the Expenses address; the trainer's offline check-in right; no test files opened (coverage unknown everywhere).

- Coordinator note (20 Nov): 12 type-10 lines had at_step 0 with applies yes; merge refused them; set to 1 (the first step of the happy journey). Check them in the verify pass. The 3 features left are item A5-panel-ui-shell-2b.
