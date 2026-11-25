# B-switch-panel-screens-1-a checkpoint (gap-1, panel/screens-1)

## Switch list (H1.1) from journeys writes
busy-machines switch+counts; gym timings; bring-a-friend days; leaderboard hide; challenge create/cancel; diet plan withdraw;
member archive; membership cancel/freeze/void; enquiry status/follow-up; expenses; MettleUp access grant; member photo; entry machine PIN.

## Done
- 2026-11-26 busy machines: member view + push of starts read `enabled` (0049:260-277, 355-363). ok.
- 2026-11-26 timings: phone, public page, page chat read it (gymPage.js:344-356, pageChat.js:123-131). ok.
- 2026-11-26 archive: server roster reads honour archived; but phone app leaderboard/messages only use left_at
  (0037:242-254, 0025:762-777; only member_leave sets left_at 0016:148-156) -> finding 01 (S3).
