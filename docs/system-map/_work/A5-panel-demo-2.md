# A5-panel-demo-2 checkpoint

Output: docs/system-map/_work/out/A5-panel-demo-2.jsonl (104 rows: 46 journeys, 56 type lines, 2 findings). All 8 features done.

F-panel-116: 6 journeys, 7 type lines
F-panel-117: 6 journeys, 7 type lines
F-panel-118: 6 journeys, 7 type lines
F-panel-119: 6 journeys, 7 type lines
F-panel-120: 6 journeys, 7 type lines
F-panel-121: 5 journeys, 7 type lines
F-panel-122: 5 journeys, 7 type lines
F-panel-123: 6 journeys, 7 type lines

## Entities
- Same rule as A5-panel-demo-1: the demo keeps everything in the page memory and reads or writes no stored data, so
  every journey has empty "writes" and "reads". On type lines, "entity" names the real-gym twin (E-shop-orders,
  E-gym-body-measurements, E-gym-diet-plans, E-gym-pt-bookings, E-gym-challenges, E-gym-timings,
  E-gym-friend-referrals, E-gym-plan-requests). It is not a claim that the demo touches that table.

## Roles
- One role, prospect. The front desk kind (/demo?as=desk) is written as type 2 journeys of the prospect.

## Findings
- FN-A5-panel-demo-2-01 (S3): demo lets two measurements be saved for one day (demoServer.ts:565-571); the real
  server refuses with DAY_TAKEN (0035:47, 294-295).
- FN-A5-panel-demo-2-02 (S3): demo approval of a renew/pause request never fills startsOn/endsOn
  (demoServer.ts:635-639), so the card says only "Approved by ..." instead of the dates and "Collect the fee at the
  desk." (planRequests.ts:218-224; real server 0044:119-122, 320-321).

## Seen in passing (not sure, not findings)
1. demoServer.ts:271-273 and 387: seeded orders are dated today at 06:20, 07:20 and 09:20 and a request at 06:50;
   a demo opened before those times shows them dated later than now. How "time ago" draws a future time not checked.
2. demoServer.ts:568: fixing a measurement in the demo overwrites "Measured by" with whoever fixed it; the real
   update (0035:287-291) keeps the first name.
3. ShopScreen.tsx:365 and 384: "Stock is back" on a cancel; the demo never changes stock (it also never takes stock
   on an order), so this is only the real wording, not a visible wrong number.
4. PlanRequestsCard.tsx:52-56: the front desk can approve a pause (adds days to a plan) while permissions.ts:77
   keeps "freeze" owner-only on the member page. May be on purpose ("the desk's own freeze tool"); not demo-only.
5. demoServer.ts:627-629: the friend summary reads snap.enquiries; whether that is the live demo list or the first
   seed (so marking a friend joined moves the count, J-F-panel-122-04) was not checked.

## Could not check
- Exact save-button and empty-title words of the measurement sheet and the diet builder (not read; journeys say
  "save" / "a plain line").
- The demo's shop error words for a refused product save (ERROR_WORDS.DEMO not read).
