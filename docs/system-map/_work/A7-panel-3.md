# A7-panel-3 checkpoint

Candidates: promises.txt lines 717-836 (120). Output: docs/system-map/_work/out/A7-panel-3.jsonl

- Unit 1 done (privacy, deletion, support access, time limits): rows 01-21. Candidates covered: promises.txt lines 726, 730, 741, 742, 743, 744, 747, 749, 754, 755, 756, 759, 761, 783, 793, 795, 815, 816, 817, 829, 835.
- Unit 2 done (everything else): rows 22-80, 59 candidates.
- ALL 120 CANDIDATES DONE: 80 rows + 40 "not a promise" lines below. Nothing left.
- Row 21 note: the sentence at OffersSection.tsx:259 runs on into line 260.

## Not a promise (40)
- not a promise: apps/dashboard/src/crm/shop/JoinTrialCard.tsx:34, state label ("Free trials are off.")
- not a promise: apps/dashboard/src/crm/shop/JoinTrialCard.tsx:77, heading
- not a promise: apps/dashboard/src/crm/shop/JoinTrialCard.tsx:83, field label
- not a promise: apps/dashboard/src/crm/shop/ProductSheet.tsx:108, error message about something that happened
- not a promise: apps/dashboard/src/crm/shop/logic.ts:696, status message after a clash ("We updated the list.")
- not a promise: apps/dashboard/src/crm/shop/logic.ts:699, status message after a clash
- not a promise: apps/dashboard/src/crm/shop/logic.ts:711, status message after a clash
- not a promise: apps/dashboard/src/crm/store.tsx:603, error message
- not a promise: apps/dashboard/src/crm/ui/GymDataActions.tsx:24, button label
- not a promise: apps/dashboard/src/crm/ui/GymDataActions.tsx:25, sheet heading (a question)
- not a promise: apps/dashboard/src/crm/ui/GymDataActions.tsx:28, button label
- not a promise: apps/dashboard/src/crm/ui/GymDataActions.tsx:82, advice ("We suggest once a month.")
- not a promise: apps/dashboard/src/crm/ui/GymDataActions.tsx:111, the text of the message sent to MettleUp, the gym user does not read it
- not a promise: apps/dashboard/src/crm/ui/ProgressView.tsx:390, data label
- not a promise: apps/dashboard/src/crm/ui/offline.tsx:259, advice on when to use the button
- not a promise: apps/dashboard/src/crm/ui/offline.tsx:279, button label
- not a promise: apps/dashboard/src/crm/ui/screens/Attendance.tsx:378, search state label
- not a promise: apps/dashboard/src/crm/ui/screens/BringAFriend.tsx:96, field label
- not a promise: apps/dashboard/src/crm/ui/screens/BringAFriend.tsx:110, button label
- not a promise: apps/dashboard/src/crm/ui/screens/Challenges.tsx:776, field label
- not a promise: apps/dashboard/src/crm/ui/screens/Enquiries.tsx:344, data label (trial dates)
- not a promise: apps/dashboard/src/crm/ui/screens/Enquiries.tsx:440, data label
- not a promise: apps/dashboard/src/crm/ui/screens/Enquiries.tsx:565, button label
- not a promise: apps/dashboard/src/crm/ui/screens/Enquiries.tsx:1042, result heading
- not a promise: apps/dashboard/src/crm/ui/screens/Enquiries.tsx:1043, result message
- not a promise: apps/dashboard/src/crm/ui/screens/Enquiries.tsx:1050, state message
- not a promise: apps/dashboard/src/crm/ui/screens/Enquiries.tsx:1075, error message
- not a promise: apps/dashboard/src/crm/ui/screens/Enquiries.tsx:1090, pointer to a setting
- not a promise: apps/dashboard/src/crm/ui/screens/ImportMembers.tsx:309, error message
- not a promise: apps/dashboard/src/crm/ui/screens/ImportMembers.tsx:718, error message
- not a promise: apps/dashboard/src/crm/ui/screens/ImportMembers.tsx:837, result message
- not a promise: apps/dashboard/src/crm/ui/screens/MemberDetail.tsx:602, advice to staff
- not a promise: apps/dashboard/src/crm/ui/screens/MemberDetail.tsx:1154, data label
- not a promise: apps/dashboard/src/crm/ui/screens/MemberDetail.tsx:1155, data label
- not a promise: apps/dashboard/src/crm/ui/screens/MemberMeasurements.tsx:239, question heading
- not a promise: apps/dashboard/src/crm/ui/screens/More.tsx:124, second match on the line ("The gym’s free web page") is a menu label; the "free page" claim has its row from the first match on this line
- not a promise: apps/dashboard/src/crm/ui/screens/OnlineJourney.tsx:99, list of the three parts of the screen; the "free web page" claim has its row at OnlineJourney.tsx:300
- not a promise: apps/dashboard/src/crm/ui/screens/OnlineJourney.tsx:105, heading
- not a promise: apps/dashboard/src/crm/ui/screens/Trainers.tsx:370, slot state label ("free" means empty)
- not a promise: apps/dashboard/src/crm/ui/screens/Trainers.tsx:414, instruction ("free" means empty)

## Could not check
- Lines around the sentence were read for about 35 of the 80 promises; the other 45 were judged from the sentence alone (read limit).
- 63 rows are "unknown": the code that would keep them was not searched (read limit). Highest value to check next: member photo visibility (rows 07, 08), "Members, money and staff never show on the page" (row 80), receipt number never reused (row 15), "A new price is used only for new sales", "Nothing is deleted from your gym's records online", "A demo gym is never put online", owner-only import of plans and payments.
- The database functions hq_delete_gym and hq_gym_records were not read; only comments, tests and callers.
