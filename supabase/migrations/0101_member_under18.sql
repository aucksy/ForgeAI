-- NOT APPLIED. Needs the owner's yes before it goes live (R-630; the app version that calls it ships only after).
-- Re-runnable. Apply after 0100. Test: supabase/tests/0101_member_under18.sql (CI runs it after every migration;
-- pasted into the SQL Editor it always ends in an error and so changes nothing).
-- Undo: drop function public.member_under18_delete(); drop function public.gym_member_under18_delete(text).
--
-- 0101 (R-630 slice A, design note docs/designs/R-630.md): the privacy notice promises "If we learn that we hold data
-- of someone under 18, we delete it." Until now the app only stopped new backups. Two deletes, each the member's own:
--
-- member_under18_delete(): the signed-in member's MettleUp account: the cloud copy (member_items), the summary
--   (member_summary), the profile and the sign-in itself. REFUSED (STAFF_LOGIN) for an owner or trainer login: a Google
--   sign-in in the member app can join onto a gym owner's or trainer's login (0032), and that login opens the desk.
--   member_account_delete (0032) is NOT widened, for the same reason.
-- gym_member_under18_delete(key): by the gym member's own key (most gym members have no MettleUp sign-in): the trainer
--   summary (gym_progress_summaries), leaderboard days and board row, and the pop-up code (member_push_tokens). The
--   gym's own member record (gym_members) stays: it is the gym's record under the data agreement.

create or replace function public.member_under18_delete() returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SIGN_IN'; end if;
  if exists (select 1 from public.profiles p where p.id = uid and p.role in ('owner', 'trainer')) then
    raise exception 'STAFF_LOGIN';
  end if;
  delete from public.member_items where member_id = uid;
  delete from public.member_summary where member_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
  return jsonb_build_object('deleted', true);
end $$;

create or replace function public.gym_member_under18_delete(p_key text) returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare m public.gym_members;
begin
  m := public._member(p_key);
  delete from public.gym_progress_summaries where member_id = m.member_id;
  delete from public.gym_member_days where member_id = m.member_id;
  delete from public.gym_member_board where member_id = m.member_id;
  delete from public.member_push_tokens where member_id = m.member_id;
  return jsonb_build_object('deleted', true);
end $$;

revoke all on function public.member_under18_delete() from public, anon;
grant execute on function public.member_under18_delete() to authenticated;
revoke all on function public.gym_member_under18_delete(text) from public;
grant execute on function public.gym_member_under18_delete(text) to anon, authenticated;
