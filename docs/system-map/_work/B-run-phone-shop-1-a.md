# Checkpoint B-run-phone-shop-1-a
- L6.1 done: order offline keeps bag (gym.ts:379), leave keeps key and resends (gymActions.ts:525-543). no fault.
- L6.2 done: order id + join id idempotent (gym.ts:499, gymActions.ts:399-412); plan request one-pending (0044:89-90,191). FAULT: message send has no request id (gymApi.ts:648-649, 0069:244-267) -> FN-01.
- L6.3-L6.8 done: FN-02 (server fault shown as no internet), FN-03 (try-again no log); backups/cron reuse existing ids; timers fine.
- L15.1-L15.3 done: reuse FN-B-run-phone-components-2-a-04, lib-core-a-04, lib-core-a-06, panel-shop-a-03.
- Output written. Next: run lens-cover and merge --dry.
- Checks passed (lens-cover ok, merge --dry 5/5). Item done.
