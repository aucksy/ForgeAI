# B-switch-panel-screens-1-a checkpoint (gap-1, panel/screens-1)

## Switch list (H1.1) from journeys writes
busy-machines switch+counts; gym timings; bring-a-friend days; leaderboard hide; challenge create/cancel; diet plan withdraw;
member archive; membership cancel/freeze/void; enquiry status/follow-up; expenses; MettleUp access grant; member photo; entry machine PIN.

## Done
- 2026-11-26 busy machines: member view + push of starts read `enabled` (0049:260-277, 355-363). ok.
- 2026-11-26 timings: phone, public page, page chat read it (gymPage.js:344-356, pageChat.js:123-131). ok.
- 2026-11-26 archive: server roster reads honour archived; but phone app leaderboard/messages only use left_at
  (0037:242-254, 0025:762-777; only member_leave sets left_at 0016:148-156) -> finding 01 (S3).
- 2026-11-26 friend days, diet withdraw, challenge cancel, hide on board, Plus lock (cancel/freeze via endsOn), enquiry status, photo: read. ok.
- 2026-11-26 expenses: assistant month profit leaves out shop takings (answer.ts:539-547 vs Expenses.tsx:71-73) -> finding 02 (S2).
- Reused: FN-B-time-panel-pay-machines-02 (archive/cancel vs door machine), FN-B-switch-hq-app-01 (access list).
- Output written: 2 findings + 1 grid (H1.1-H1.4). lens-cover ok; merge --dry 3/3 passed. ITEM DONE.
