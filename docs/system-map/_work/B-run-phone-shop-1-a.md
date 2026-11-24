# Checkpoint B-run-phone-shop-1-a
- L6.1 done: order offline keeps bag (gym.ts:379), leave keeps key and resends (gymActions.ts:525-543). no fault.
- L6.2 done: order id + join id idempotent (gym.ts:499, gymActions.ts:399-412); plan request one-pending (0044:89-90,191). FAULT: message send has no request id (gymApi.ts:648-649, 0069:244-267) -> FN-01.
