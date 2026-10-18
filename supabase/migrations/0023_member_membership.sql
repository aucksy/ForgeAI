-- 0023: "My membership" in the member app (OWNER-INBOX #6, 18 Oct 2026). Re-runnable. Read-only.
--
-- The member sees their own plan in the app: its name, start and end, days left, a plan already
-- paid for after it, personal-training sessions used of those bought, and how many days they came
-- this month. Members ask the desk "when does mine end?" more than anything else.
--
-- WHO IS ASKING. Only the number this app member already matched at a check-in
-- (gym_members.checkin_phone, 0016) is used. Nothing is typed here, so this cannot be used to look
-- up anyone by number. That number is not verified (no OTP), the same as check-in, so on purpose
-- this shows NO money: no prices, no payments, no dues. Those wait until the desk can confirm who
-- an app member is.
--
-- ANSWERS (never a raise after the key check):
--   {ok:true, gymName, memberName (first name), day,
--    current: {planName, startsOn, endsOn, ptSessions, ptUsed, trainer} | null,
--    next:    {planName, startsOn, endsOn} | null,     the earliest one starting after today
--    lastEndedOn: 'YYYY-MM-DD' | null,                 when the latest past one ended
--    visitsThisMonth: int}                            days checked in this calendar month (IST)
--   {error:'NO_PHONE', gymName}        no check-in yet: the app does not know the member's number
--   {error:'NOT_ON_ROSTER', gymName}   that number is no longer on the gym's list
--   {error:'GYM_NOT_ONLINE', gymName}  the gym keeps no records online
--
-- Apply: Supabase SQL editor, after 0022.

create or replace function public.member_membership(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  g public.gyms;
  ph text;
  roster public.crm_records;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  day text := to_char(today, 'YYYY-MM-DD');
  month_start text := to_char(date_trunc('month', today), 'YYYY-MM-DD');
  cur jsonb;
  nxt jsonb;
  last_end text;
  visits int;
begin
  select * into g from public.gyms where gym_id = m.gym_id;

  ph := public._norm_phone(m.checkin_phone);
  if ph is null then return jsonb_build_object('error', 'NO_PHONE', 'gymName', g.name); end if;

  if coalesce(g.crm_version, 0) = 0
     and not exists (select 1 from public.crm_records where gym_id = g.gym_id and kind = 'member') then
    return jsonb_build_object('error', 'GYM_NOT_ONLINE', 'gymName', g.name);
  end if;

  roster := public._checkin_roster_member(g.gym_id, ph);
  if roster.id is null then return jsonb_build_object('error', 'NOT_ON_ROSTER', 'gymName', g.name); end if;

  -- The plan covering today (the one ending last, when two overlap).
  select jsonb_build_object(
           'planName', r.data->>'planName', 'startsOn', r.data->>'startsOn', 'endsOn', r.data->>'endsOn',
           'ptSessions', case when r.data->>'ptSessions' ~ '^[0-9]{1,4}$' then (r.data->>'ptSessions')::int end,
           'ptUsed', case when jsonb_typeof(r.data->'ptLog') = 'array' then jsonb_array_length(r.data->'ptLog') else 0 end,
           'trainer', nullif(btrim(coalesce(r.data->>'trainer', '')), ''))
    into cur
    from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'membership' and not r.deleted
     and r.data->>'memberId' = roster.id
     and coalesce(r.data->>'cancelled', 'false') <> 'true'
     and r.data->>'startsOn' <= day and r.data->>'endsOn' >= day
   order by r.data->>'endsOn' desc
   limit 1;

  -- A plan already sold that starts later (a renewal paid in advance).
  select jsonb_build_object('planName', r.data->>'planName', 'startsOn', r.data->>'startsOn', 'endsOn', r.data->>'endsOn')
    into nxt
    from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'membership' and not r.deleted
     and r.data->>'memberId' = roster.id
     and coalesce(r.data->>'cancelled', 'false') <> 'true'
     and r.data->>'startsOn' > day
   order by r.data->>'startsOn'
   limit 1;

  select max(r.data->>'endsOn') into last_end
    from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'membership' and not r.deleted
     and r.data->>'memberId' = roster.id
     and coalesce(r.data->>'cancelled', 'false') <> 'true'
     and r.data->>'endsOn' < day;

  select count(distinct r.data->>'visitedOn') into visits
    from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'visit' and not r.deleted
     and r.data->>'memberId' = roster.id
     and r.data->>'visitedOn' between month_start and day;

  return jsonb_build_object('ok', true, 'gymName', g.name,
    'memberName', split_part(btrim(coalesce(roster.data->>'fullName', m.name)), ' ', 1),
    'day', day, 'current', cur, 'next', nxt, 'lastEndedOn', last_end, 'visitsThisMonth', coalesce(visits, 0));
end $$;

revoke all on function public.member_membership(text) from public;
grant execute on function public.member_membership(text) to anon, authenticated;
