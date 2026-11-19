# A5-panel-shop-1 checkpoint

F-panel-807: 10 journeys, 14 type lines
F-panel-814: 11 journeys, 15 type lines
F-panel-811: 14 journeys, 14 type lines
F-panel-808: 12 journeys, 15 type lines
F-panel-801: 11 journeys, 15 type lines
F-panel-800: 12 journeys, 14 type lines

All 6 features done. 3 findings written (FN-A5-panel-shop-1-01 to -03).

## Entities left out (none fits)
- The 'done on WhatsApp' ticks of a message and the Set up your gym 'poster' tick live only in the browser: no entity id.
- A check-in made by scanning the poster: written as E-crm-records (the visit is one of the panel's synced rows).

## Seen in passing (not sure, not findings)
- Joined in the app says new members 'show up here at once' but the list re-reads every 60 seconds (AppMembers.tsx:39, :60).
- Empty orders says new orders 'show up here on their own in a few seconds' but orders re-read every 60 seconds (ShopScreen.tsx:176, ShopProvider.tsx:42); another refresh path may exist, not read.
- 'Collected (paid)' has no question and no undo; one wrong tap on a new order closes it as paid (ShopScreen.tsx:200-221, logic.ts:269-273).
- Check-in QR: the Set up step is ticked before the print page opens, so cancelling the print still ticks it (CheckInQrScreen.tsx:94-97). The same poster buttons on Invite members tick nothing.
- Take back has no busy state and its error shows in the red line at the top of the page, far from the Sent list (MessagesSection.tsx:294-303, :338).
- The 'Sent in the app' mark that stops a double send lives only on the open page; after a reload the same words can be sent again (MessagesSection.tsx:136, :181).
- Joined in the app: a number saved without '+' is turned into +91 plus its last 10 digits for the add form, which is wrong for a non-Indian number (AppMembers.tsx:73).
- Product sheet: Cancel drops typed values with no question; a photo uploaded before Cancel may stay on the server (ProductSheet.tsx:174, not followed further).
- Staff see each app member's shop spend (AppMembers.tsx:102-104) though staff see no money totals; it is one member's figure, not a total.

## Could not check
- Server side of every call (owner_* functions): whether a staff key is refused for products and messages is taken from the comment in permissions.ts:14-19, not from the SQL.
- Exact words of the 'just paid online' line on an order card (justPaidOnline) and of the seen count (seenText): not opened, code-line budget.
- The label of the register's button that opens Check-in QR (Attendance.tsx:140) and the WhatsApp queue sheet: not opened.
- No test file opened: every journey has coverage 'unknown'.
- Nothing was driven on a screen; all rows are from reading code.
