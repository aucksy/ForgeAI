# B-switch-panel-screens-2-a checkpoint (gap-1, panel/screens-2)

## Switch list (H1.1) from journeys writes
auto reminders switches; Plus lock; workout offer start/stop; web page published/ai_helper; WOD; PT bookings; trainer hours;
member messages status; trainer questions status; plan requests; membership plans retire; receipts void; UPI (pay_gyms); Pay MettleUp.

## Done
- 2026-11-26 auto reminders: no server sender; phone schedules and honours every case (autoReminders.ts:24-67, 298-302; 0029:9-11). ok.
- 2026-11-26 Plus lock: phone reads it into plan blob (gymApi.ts:728-734, memberPlan.ts:58-85). ok.
- 2026-11-26 PT bookings: only the admin app reads them; phone app and push notes never (0065 only file; push kinds 0073:36-38; Trainers.tsx:591-592,746) -> finding 01 (S3).
- 2026-11-26 workout offer: Today reward count reads offers (Today.tsx:602-604). ok. Web page ai_helper/show_phone read by chat (pageChat.js:289, 0090:70). ok.
- 2026-11-26 GST number: receipt reads it; collections export has no tax split (collections.ts:256-259; gst.ts:11-12) -> finding 02 (S3).
- 2026-11-26 retired plans: phone renew list, web page, self-join all skip them (0044:149-150, 0080:148-149, 0077:119). ok.
- 2026-11-26 download all data: misses tables outside records -> reuse FN-A5-panel-logic-1-3-01.
- 2026-11-26 join free trial: web page and its AI helper never read it (pageChat.js:108-136, no trial in gymPage.js; 0088:7-15) -> finding 03 (S3).
- 2026-11-26 out file written (3 findings + 1 grid); lens-cover ok; merge --dry 4/4 passed. ITEM DONE.
- Lesson: machine: evidence must be a file in _sources/machine (readers.json is not); cite code lines instead.
