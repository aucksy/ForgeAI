# A2-panel-forms checkpoint

Finished units (all 6 items done, 24 feature rows in docs/system-map/_work/out/A2-panel-forms.jsonl):
- [x] panel.txt#79 ChangeStartSheet -> F-panel-400
- [x] panel.txt#80 CollectPaymentSheet -> F-panel-401, 402, 403, 419, 420, 421
- [x] panel.txt#81 ExtendMembershipSheet -> F-panel-404, 405
- [x] panel.txt#82 MemberFormSheet -> F-panel-406 to 413
- [x] panel.txt#83 SellMembershipSheet -> F-panel-402, 414 to 422
- [x] panel.txt#84 VoidPaymentSheet -> F-panel-423
- [x] Step items 1-6 done. Code lines read: about 1,790 (1,647 in the six sheets + about 140 in auth/permissions.ts, ui/MemberPhoto.tsx and grep hits in ui/screens/MemberDetail.tsx).

Switches and gates met:
- Role rules (apps/dashboard/src/crm/auth/permissions.ts:68-80): voidReceipt, freeze, manageGym are owner only. Change start date is shown only with the "freeze" permission (apps/dashboard/src/crm/ui/screens/MemberDetail.tsx:621).
- Desk photo key (apps/dashboard/src/crm/ui/MemberPhoto.tsx:27): photo row only for an online gym whose server keeps photos; hidden offline and in demo.
- Multi-branch + manageGym (MemberFormSheet.tsx:96-98): "Can train at every branch".
- No plan (Pro) gate seen in these six files: tier written as "unknown".

Could not check:
- What switch shows the UPI QR / payment link (inside pay/CollectOnline, outside this area).
- Where the "gift" reward days come from (workout offer, outside this area).
- No demo-copy lines in this area.

Seen in passing (not verified beyond the lines named):
- SellMembershipSheet.tsx:133-134 vs :145: the staff discount check uses the joining fee DUE (defaults.joiningFeeP, 0 for a returning member) but the "unusual price" warning is given the plan's listed joining fee (plan.joiningFeeP). A renewal with the fee correctly at 0 may be compared against the full listed fee. Needs a look at logic/selling.ts saleWarning.
- SellMembershipSheet.tsx:223-229: changing the plan clears the problem but not the "warned" question (other fields call changed()), so the button can stay "Yes, save" for a different plan; the save re-asks only if the warning text differs.
- SellMembershipSheet.tsx:340-355: the UPI QR is shown before the membership is saved (payRef null); if the member pays by QR and the desk closes the sheet, the gym has money with no membership or receipt.
- CollectPaymentSheet.tsx:83-99: a receipt paid online is saved with paidOn = today and amount r.paidP || r.amountP, without the amount-above-due check the desk path runs at :106.
- MemberFormSheet.tsx:241: Cancel calls onClose, not close(); harmless today because that button is hidden once addedNoPhoto is set.
