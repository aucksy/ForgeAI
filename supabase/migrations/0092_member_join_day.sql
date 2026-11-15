-- NOT LIVE: needs the owner's yes
-- Re-runnable. Apply after 0035 (_member_roster_link) and 0045 (_report_join_day). Additive: one new function the phone
-- calls. No new table or column, no change to any existing function.
-- Test: supabase/tests/0092_member_join_day.sql (CI runs it after every migration; pasted into the SQL Editor it always
-- ends in an error and so changes nothing).
-- Undo: drop function public.member_join_day(text);
--
-- 0092: F218 (0.78.0 review, R-560). Phones that joined a gym before 23 Oct 2026 (R-86) never kept the day they joined,
-- so since 0.78.0 (R-551 "since joining") they share workouts with the gym's trainers only from the update day on, and
-- the trainers' charts for those long-time members empty out. The gym already has the member's start date: the phone
-- now asks for it and uses it as the join day when it kept none, so the first share covers up to the last 12 months
-- (the Settings caption: "since you joined, up to the last 12 months"). The phone still caps the list at 12 months.
--
--   member_join_day(member key) {ok: true, joinedOn: 'YYYY-MM-DD' | null, why?: text}; BAD_KEY
--     joinedOn: the member's start date at THIS gym from the gym's own list, exactly as the workout report uses it
--     (0045 _report_join_day): the member record's "joinedOn", else the first day of their earliest plan here (not
--     cancelled). Null when neither is there, when that day is after today (India), or when this app member cannot
--     be matched to one person on the gym's list (why = 0035's reason: NO_PHONE, GYM_NOT_ONLINE, NOT_ON_ROSTER,
--     SHARED_NUMBER, NAME_MISMATCH; the same match the trainer's measurements and the shared progress use).
--     Only the member's own day, for their own key; never another member's, never another gym's.
--   A phone that finds no member_join_day (PGRST202, this file not applied) does exactly what 0.78.0 does: it shares
--   from the first day it shared, and logs why. It never shows an error to the member.

create or replace function public.member_join_day(p_key text) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  link jsonb;
  d date;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  link := public._member_roster_link(p_key);
  if link ? 'error' then
    return jsonb_build_object('ok', true, 'joinedOn', null, 'why', link->>'error');
  end if;
  d := public._report_join_day(m.gym_id, link->>'rosterId');
  return jsonb_build_object('ok', true,
    'joinedOn', case when d is not null and d <= today then to_char(d, 'YYYY-MM-DD') end);
end $$;

revoke all on function public.member_join_day(text) from public;
grant execute on function public.member_join_day(text) to anon, authenticated;

-- PostgREST learns the new function at once (instead of on its next schema reload).
notify pgrst, 'reload schema';
