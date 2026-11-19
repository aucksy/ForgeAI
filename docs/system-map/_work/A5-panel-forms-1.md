# A5-panel-forms-1 checkpoint

F-panel-3100: 18 journeys, 23 type lines
F-panel-400: 4 journeys, 8 type lines
F-panel-401: 10 journeys, 15 type lines
F-panel-421: 10 journeys, 16 type lines
F-panel-420: 9 journeys, 15 type lines
F-panel-402: 13 journeys, 15 type lines
F-panel-403: 8 journeys, 16 type lines
F-panel-404: 6 journeys, 7 type lines
F-panel-405: 4 journeys, 8 type lines

ALL 9 FEATURES DONE. 3 findings (FN-A5-panel-forms-1-01..03).

## Entities left out (none fits)
- The offline waiting list of unsent payments and the device's own receipt series (kept in this browser's storage): no entity id in entities.json; journeys of F-panel-421 use E-crm-records only.
- Enquiries: no separate entity id found by name; written as E-crm-records (the panel's synced rows) - not confirmed that enquiries are stored there.
- The workout code itself is not stored (the sheet says nothing is saved): no entity.

## Seen in passing (not sure, or polish; no finding row)
- Freeze / extra days with 1 day: the button reads "Add 1 days" and the message "Plan moved 1 days later." (apps/dashboard/src/crm/ui/forms/ExtendMembershipSheet.tsx:90, apps/dashboard/src/crm/ui/screens/MemberDetail.tsx:841).
- Freeze / extra days and Change start date carry no request id (unlike payments): a lost answer and a retry, or two owner devices, could add the days twice (apps/dashboard/src/crm/data/cloud.ts:1444-1449, apps/dashboard/src/crm/data/local.ts:982-1022). Not driven.
- Change start date lets the owner move the start to today or up to 31 days back; the plan then counts as started and the button disappears, so the move cannot be undone the same way; the sheet does not warn (apps/dashboard/src/crm/logic/membership.ts:338-340, apps/dashboard/src/crm/ui/screens/MemberDetail.tsx:621).
- No button takes extra days back; a wrong freeze stays (ExtendMembershipSheet only adds).
- A reward given from the workout-code sheet is written as "Gift - extra days", not as a "reward" line, so the history shows "+3 days (Gift - extra days)" and not "Extended free by 3 days (reward)" (apps/dashboard/src/crm/ui/forms/ExtendMembershipSheet.tsx:30-31 against apps/dashboard/src/crm/logic/membership.ts:363). The 3 days are fixed in the code (MemberDetail.tsx:852), whatever the gym's offer says. The same code can be rewarded again: nothing is saved by the check.
- The UPI note shown to the payer names the NEXT normal receipt number counted for today (CollectPaymentSheet.tsx:222); the receipt really saved can differ (a back-dated "Received on", an offline device series, another desk saving first).
- Offline or with a failed check, the "close open links" guard is skipped by design (apps/dashboard/src/crm/pay/useDeskPay.ts:89-96); a link can then still be paid after cash was taken. No screen for that case was in the code read.
- Changing the amount in Collect payment removes an open payment link from the screen without closing it at the company (apps/dashboard/src/crm/pay/CollectOnline.tsx:77-82); it is closed only when the desk saves.
- The collect, freeze and start-date sheets are plain English strings; the "Pay online" block inside the collect sheet uses the language function: with Hinglish on, one sheet can show two languages.
- The freeze reason (medical, or free text about the member) is written into the plan history; who sees it (desk, export, member app) was not read.
- Mobile box, Add member with +91: two numbers pasted into one box keep only the last 10 digits (packages/theme/src/indianMobile.ts:117-124); changing the code picker does not re-clean a number already typed.

## Could not check
- Nothing was driven on a screen: every journey is from code reading; coverage "unknown", no tests opened.
- Whether a trainer login exists in the admin app (the role code has only owner and staff); trainer journeys of F-panel-3100 are written on the sign-in and forgot-PIN boxes.
- Whether a desk login can open Money -> Dues and see "Taken by" of other people.
- Server side of every save (who may freeze, who is stamped as taker, what goes to the payment company): deploy/panel was not read.
- The join pages' own plain-JS copy of the mobile rule (4 files) was not compared line by line with the shared rule.
- Live online payments: live is off in the code, so the real-money path of F-panel-402 / 403 cannot be seen today.
- A double payment across two gyms or two desks offline: needs a second device; not run.
