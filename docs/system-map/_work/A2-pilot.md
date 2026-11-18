# A2-pilot checkpoint (area panel/pay-machines)

Finished units (all 60 source lines covered; script check: 0 missing, all entry paths and lines exist):
- [x] machines: panel.txt#184-191 -> F-panel-100..102
- [x] branches: panel.txt#221-228, #371 -> F-panel-103..107
- [x] demo: panel.txt#229-269 -> F-panel-108..123
- [x] plan: panel.txt#273 -> F-panel-124
- [x] pay: panel.txt#373 -> F-panel-125..127
- [x] step 3 switches noted: PLAN_GATE_ON (false), pay server flags on/connectOn/testMode, Worker JOIN_PAY, per-gym pay switches app/web, gate Worker not deployed
- [x] output written: docs/system-map/_work/out/A2-pilot.jsonl (28 rows)

Code lines read: about 1,000 of the 2,500 allowed.

## seen in passing
- none clear. (Note, not a bug: the demo's owner_answer_question at apps/dashboard/src/crm/demo/demoServer.ts:486 has no owner/trainer check while the count and list at :480/:483 refuse the desk role; demo-only.)

## could not check
- Whether the gate Worker is really not deployed and migration 0058 really not applied: taken from the code comment at apps/dashboard/src/crm/machines/supabaseStore.ts:3-4 only (no deploy or database reads in this step).
- Tier (free or Pro) of branches and online payments: no plan gate seen in the lines read; written "unknown".
- The area's source list has no lines for move/ (MoveBanner, move.ts), demo/DemoApp, pay/CollectOnline, PaidOnline, PayQr, payApi, or machines/handler, adms, entryMachineAdmin: those files were not inventoried because no source line points to them.
