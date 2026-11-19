# A5-panel-logic-2-3 checkpoint

F-panel-722: 7 journeys, 17 type lines
F-panel-723: 6 journeys, 7 type lines
F-panel-709: 12 journeys, 14 type lines
F-panel-724: 5 journeys, 7 type lines
F-panel-701: 14 journeys, 14 type lines
F-panel-727: 8 journeys, 16 type lines
F-panel-729: 8 journeys, 16 type lines
F-panel-730: 7 journeys, 7 type lines

Findings: 3 (FN-A5-panel-logic-2-3-01 S2, -02 S3, -03 S3)

## Seen in passing
- F-panel-722: the sheet's arrow buttons are named for screen readers in English only ('Move … earlier'), not through the language list (QuickActions.tsx:117-120).
- F-panel-722: the saved choice is read once when the block is first drawn; whether it is read again when the owner switches branch without a reload was not checked (QuickActions.tsx:50).
- F-panel-709: the receipt page writes 'Back', 'Print', 'Send on WhatsApp', 'Receipt not found' directly in English; a Hinglish gym may see English there (Receipt.tsx:76-108). Not sure if on purpose (a receipt is a record).
- F-panel-709: the WhatsApp receipt's 'still due' figure is what the member owes today, not on the payment day; sending an old receipt again can show a different figure than the first time (Receipt.tsx:67-69).
- F-panel-709: the setting line says receipts show the UPI ID with a pay link; only the WhatsApp receipt does, and only when money is still due (settingLines.ts:28, whatsapp.ts:280-284). The printed sheet was not read to the end.
- F-panel-724: the Bring a friend card, the thank-you sheets and the row notes write their English words directly (BringAFriend.tsx:88-113, Enquiries.tsx:592-601, 1040-1048).
- F-panel-724: a thank-you that was taken back leaves its line in the plan notes; a later thank-you for the same friend name would then find the old line and add nothing (same cause as finding 01; referrals.ts:108-111). Not driven.
- F-panel-701: when a person paid more than the plan costs, Approve keeps only the plan's amount on the receipt (joinPay.ts:142); the question shown before says 'the rest stays due', which fits a short payment, not an over-payment (JoinedOnlineCard.tsx:72).
- F-panel-701: the request reader always sets 'pay at the desk' on the block (selfJoin.ts:66); the paid state comes only from the join-payments list. Harmless as read; noted.
- F-panel-729: the feature's name still lists two cards, but the 'Get alerts on this device' card left Today for the bell panel (Today.tsx:163); only the install card takes a turn now, and setupCards.ts still lists 'alerts' first. What's-new line P-A7-whats-new-1-39 ('first alerts, then…') describes the older state.
- F-panel-729: the install card's words are written directly in English (InstallCard.tsx:77-104).
- F-panel-730: if saving the typed job fails after the person was added, the sheet is already closed, so the error has nowhere to show and no toast appears (PeopleScreen.tsx:385-397, 530-535). Whether that save can fail loudly was not checked.
- F-panel-730: a typed job longer than 40 letters is cut to 40 with no word to the owner (staffJobs.ts:57-61); whether the box itself stops at 40 was not read.

## Could not check
- No entity fits the quick-button choice, the install card's 'closed' mark, or the typed job kept in the browser (all browser storage): left out of writes/reads.
- F-panel-727 staff: which settings screens the front desk may open was not read; the staff journeys name them only in general.
- F-panel-709: the Collect dues sheet and the cancel sheet themselves were not opened (only the rule file and the receipt page); the staff 'no cancel button' step rests on promise P-A7-legal-3-24, not on the screen code.
- F-panel-730: the server's words for a mobile number that is already on the list were not read.
- F-panel-701: the Approve steps on the server (approveJoin) were not read past the card; the free trial (0088) is not live, so its journeys cannot be driven until it is.
- Nothing was driven on a screen or run in CI: every row is from reading code. tests = [] and coverage 'unknown' on every journey.

All 8 features done. Nothing left.
