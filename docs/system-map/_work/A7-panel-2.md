# A7-panel-2 checkpoint

DONE: all 120 candidates (promises.txt lines 597-716). 73 promise rows in docs/system-map/_work/out/A7-panel-2.jsonl, 47 not-a-promise lines below.
Status counts: kept 29, partly 9, unknown 35

Units finished, in order: hinglish.ts (597-613); logic/*.ts (614-700); machines, move, pay, shop (701-716).

## Not a promise
- not a promise: apps/dashboard/src/crm/lang/hinglish.ts:1355, a button label, not a promise
- not a promise: apps/dashboard/src/crm/lang/hinglish.ts:1574, a heading
- not a promise: apps/dashboard/src/crm/lang/hinglish.ts:1577, a field label
- not a promise: apps/dashboard/src/crm/lang/hinglish.ts:1586, an instruction to the desk, not something the product promises
- not a promise: apps/dashboard/src/crm/lang/hinglish.ts:1588, a label with dates
- not a promise: apps/dashboard/src/crm/logic/attendance.ts:406, a status label about one member
- not a promise: apps/dashboard/src/crm/logic/attendance.ts:503, a fact line about one member
- not a promise: apps/dashboard/src/crm/logic/attendance.ts:507, a fact line about one member
- not a promise: apps/dashboard/src/crm/logic/attendance.ts:532, a status label
- not a promise: apps/dashboard/src/crm/logic/autoReminders.ts:91, a reminder title
- not a promise: apps/dashboard/src/crm/logic/autoReminders.ts:93, an example message
- not a promise: apps/dashboard/src/crm/logic/challenges.ts:324, a form check message
- not a promise: apps/dashboard/src/crm/logic/challenges.ts:358, a label
- not a promise: apps/dashboard/src/crm/logic/challenges.ts:359, a label
- not a promise: apps/dashboard/src/crm/logic/challenges.ts:431, a result line for one winner
- not a promise: apps/dashboard/src/crm/logic/challenges.ts:448, a button label
- not a promise: apps/dashboard/src/crm/logic/challenges.ts:454, a result line for one winner
- not a promise: apps/dashboard/src/crm/logic/challenges.ts:544, advice to the owner
- not a promise: apps/dashboard/src/crm/logic/claimMatch.ts:37, a form check message
- not a promise: apps/dashboard/src/crm/logic/dietPlans.ts:261, diet advice text, not a product promise
- not a promise: apps/dashboard/src/crm/logic/enquiries.ts:33, a pick-list label
- not a promise: apps/dashboard/src/crm/logic/gymAlerts.ts:22, a pattern that rewrites an alert line
- not a promise: apps/dashboard/src/crm/logic/gymState.ts:58, not shown to anyone today: the plan gate is off (PLAN_GATE_ON false, apps/dashboard/test/crm/gymState.test.ts:34)
- not a promise: apps/dashboard/src/crm/logic/gymState.ts:72, not shown to anyone today: the plan gate is off (PLAN_GATE_ON false, apps/dashboard/test/crm/gymState.test.ts:34). If switched on it promises what still works for 30 days; not checked
- not a promise: apps/dashboard/src/crm/logic/importMembers.ts:1289, a form check message
- not a promise: apps/dashboard/src/crm/logic/importMembers.ts:1344, a form check message
- not a promise: apps/dashboard/src/crm/logic/importMembers.ts:1484, advice to the owner
- not a promise: apps/dashboard/src/crm/logic/payMettleUp.ts:234, a status line
- not a promise: apps/dashboard/src/crm/logic/payMettleUp.ts:235, a status line
- not a promise: apps/dashboard/src/crm/logic/payMettleUp.ts:237, a status line
- not a promise: apps/dashboard/src/crm/logic/payMettleUp.ts:336, not shown to anyone today: only when TRIAL_KEPT_ON_PAY is false, and it is true (apps/dashboard/src/crm/logic/payMettleUp.ts:315). NOTE: if ever shown it says the opposite of the server (supabase/migrations/0063_gym_checkout.sql:249: paid time starts when the trial ends)
- not a promise: apps/dashboard/src/crm/logic/payMettleUp.ts:336, not shown to anyone today: same switch as line 664 (payMettleUp.ts:315)
- not a promise: apps/dashboard/src/crm/logic/phoneLinks.ts:74, advice to the desk
- not a promise: apps/dashboard/src/crm/logic/plusLock.ts:46, a heading; its promise is the row for plusLock.ts:48
- not a promise: apps/dashboard/src/crm/logic/trial.ts:94, a status line
- not a promise: apps/dashboard/src/crm/logic/trial.ts:104, a status line
- not a promise: apps/dashboard/src/crm/logic/trial.ts:105, a status line
- not a promise: apps/dashboard/src/crm/logic/webPush.ts:237, a progress message
- not a promise: apps/dashboard/src/crm/logic/webPush.ts:241, a status message
- not a promise: apps/dashboard/src/crm/logic/webPush.ts:248, a status message
- not a promise: apps/dashboard/src/crm/logic/words.ts:81, an amount written in words
- not a promise: apps/dashboard/src/crm/logic/words.ts:82, an amount written in words
- not a promise: apps/dashboard/src/crm/logic/words.ts:83, an amount written in words
- not a promise: apps/dashboard/src/crm/logic/workoutOffer.ts:239, a history label
- not a promise: apps/dashboard/src/crm/machines/entryMachine.ts:354, an error label
- not a promise: apps/dashboard/src/crm/machines/entryMachineAdmin.ts:128, a form check message
- not a promise: apps/dashboard/src/crm/pay/PaidOnline.tsx:205, advice to the owner

## Could not check
- Whether migrations are live (0059 says "(NOT APPLIED)" at its top): this step had no database reads.
- Rows marked unknown: read limit (1,500 lines) reached before their code could be opened; each row says what was not read.
- Hinglish rows: the Hinglish wording was not checked against the English line for meaning.
