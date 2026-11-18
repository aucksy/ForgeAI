# A2-panel-shop checkpoint
- [x] 1 read source list (128 lines)
- [x] 2 opened code for each item (every file's header comment + targeted lines; about 1,000 code lines read)
- [x] 3 switches and plan gates noted (no Pro/plan gate found inside this folder; gating is by server migration presence, gym online, demo lock)
- [x] 4 grouped into features
- [x] 5 wrote 39 rows to docs/system-map/_work/out/A2-panel-shop.jsonl (F-panel-800..838)
- [x] 6 not-a-feature row: panel.txt#192
Finished units: all 128 source lines covered (self-check: 0 missing, 0 extra).

## could-not-check
- tier (free/Pro) for every row: no plan gate in this folder; a gate, if any, sits in screens outside this area. Written as "unknown".
- whether migrations 0059, 0060, 0063, 0065 are applied: code comments say NOT APPLIED; no database reads in this step.
- which roles reach each screen exactly: role checks live on the server and in nav code outside this area; roles come from the file header comments.
- "live" for server-gated features (0025..0098): the panel hides them until the gym server has the migration; not checked against the database.

## seen in passing
- Header comments of billingApi.ts:2, entryMachinesApi.ts:2, payMettleUpApi.ts:2, trainerScheduleApi.ts:3 say "NOT APPLIED": may be stale, check against the migration list.
- cloudGym.ts:4-7: the browser-held owner key is the login; losing it makes the gym unreachable (comment accepts this for demo gyms only).
