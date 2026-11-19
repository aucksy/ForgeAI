# A5-panel-forms-3 checkpoint

Status: all 8 features done. Output: docs/system-map/_work/out/A5-panel-forms-3.jsonl (177 rows: 68 journeys, 108 type lines, 1 finding).

F-panel-414: 12 journeys, 14 type lines
F-panel-416: 8 journeys, 16 type lines
F-panel-415: 10 journeys, 16 type lines
F-panel-419: 5 journeys, 7 type lines
F-panel-418: 8 journeys, 16 type lines
F-panel-422: 6 journeys, 18 type lines
F-panel-417: 12 journeys, 14 type lines
F-panel-423: 7 journeys, 7 type lines

Type lines above the 7 per role are the "no" lines for type 2 or type 12.

## Finding
- FN-A5-panel-forms-3-01 (S3): the "price is more than the plan price" question and the "Yes, save" button stay after another plan is picked (SellMembershipSheet.tsx:223-229 clears the problem but not the question).

## Entities
- Every sale, receipt and cancel is linked to E-crm-records (the panel's synced rows).
- Left out, nothing checked in code: E-receipt-history (whether a cancel writes a history row), E-pay-requests / E-pay-gyms (the UPI QR block inside the sell sheet), the device's offline queue (no entity id found for it).

## Promises linked
P-A7-panel-1-33, P-A7-panel-2-46, P-A7-panel-3-15, P-A7-legal-3-24. No promise row found for "at most 10% off", "Every receipt shows who took the money", "It will show in Dues" or the dues sentence of the cancel sheet.

## Seen in passing (not findings)
- SellMembershipSheet.tsx:145 compares a typed joining fee with the plan's listed fee, not with the fee due (0 on a renewal). Typing the listed fee on a renewal charges it a second time with no question, although the hint says it is not charged again.
- selling.ts:216 the desk's "joining fee as listed" rule applies only when the member has no earlier plan at all. A member whose only plan was cancelled unpaid has a fee due, yet the desk can remove it. Comment says the server does the same.
- SellMembershipSheet.tsx:71-73 the picked plan is set once when the sheet opens. If the no-plans banner is open while the first plan arrives, the form appears with no plan picked and Confirm answers "Pick a plan first." (not driven).
- SellMembershipSheet.tsx:185 the owner's banner says "You haven't created any plans yet" also when plans exist but all are off sale.
- SellMembershipSheet.tsx:374-383 "Received on" has no hint for staff about the 31 days; CollectPaymentSheet.tsx:251 has one.
- SellMembershipSheet.tsx:94 "Received on" keeps the day the sheet opened; "Starts on" follows today. A sheet left open over midnight dates the receipt yesterday.
- Enquiries.tsx:912-920 opens the sell sheet without the after-sale message, so a sale from an enquiry shows no "Membership saved. Receipt ..." line; closing with Cancel also marks the enquiry as joined.
- SellMembershipSheet.tsx:351-355 showing the UPI QR fills "Received now" with the whole total before any money has come; Confirm then makes a receipt for it.
- SellMembershipSheet.tsx:208 the question banner is at the top of a long sheet, the button at the bottom: on a phone the question may be off screen when the button changes to "Yes, save".
- VoidPaymentSheet.tsx:105-115 the reason box has no upper length limit in the sheet.

## Could not check
- Server rules (migrations 0018, 0019, 0021, 0041) were not opened: every "the server refuses" step is from code comments only.
- Whether the panel has a language or theme setting that reaches these sheets.
- What the member app shows after a sale, part payment or cancelled receipt.
- No test file was opened: every journey has coverage "unknown".
- Code lines read: about 1,150 of 3,000.
