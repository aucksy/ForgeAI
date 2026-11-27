-- R-631 (owner yes, 27 Nov 2026: "Yes" to deleting the old member summary rows).
-- member_summary was the first version's one-row rollup from the phone (0001): name, last active,
-- latest body weight, today's calories and protein, streaks. Nothing reads it: the gym dashboard made
-- for it was never switched on, and restore uses the MettleUp account copy, not this row. The phone
-- stops sending it in the same change (apps/mobile/src/cloud/outbox.ts).
--
-- This deletes every row and closes the table to app sign-ins, so an older app version cannot send a
-- new row. The table itself stays: member_account_delete and the under-18 delete (0101) still empty
-- it, and both run as the table owner, so they keep working.

delete from public.member_summary;

drop policy if exists summary_self on public.member_summary;
drop policy if exists summary_staff_read on public.member_summary;

revoke all on public.member_summary from anon, authenticated;
