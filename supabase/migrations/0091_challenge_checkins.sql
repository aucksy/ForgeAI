-- NOT LIVE - needs the owner's yes
-- Re-runnable. Apply after 0048 (it replaces 0048's _challenge_results, 0047's owner_challenges and 0037's member_board,
-- owner_save_challenge and _challenge_hitters; each is the last file's own text with only the marked changes).
-- Test: supabase/tests/0091_challenge_checkins.sql (CI runs it after every migration; pasted into the SQL Editor it
-- always ends in an error and so changes nothing). 0037's, 0047's and 0048's own tests still run against the
-- functions replaced here, so a workouts or kg challenge must behave exactly as before.
-- Undo: re-run 0037's member_board, owner_save_challenge and _challenge_hitters, 0047's owner_challenges and 0048's
-- _challenge_results; drop the three helpers below. A check-in challenge already made would then read as workouts:
-- cancel it first (owner_cancel_challenge).
--
-- 0091: ready-made challenges, step 2 (R-561 item 6, owner 15 Nov 2026: "these challenges should be activated for users
-- to get in the habit of scanning the QR code or in the habit of tracking their workouts ... the challenges should also
-- kind of make use of the leaderboard for users to be able to track their progress towards the challenge").
-- Step 1 (the admin app only, no database change) gives the owner ready-made WORKOUT challenges to turn on with one tap.
-- This file lets a challenge count VISITS too, so the ready-made "Check-in habit" can be turned on.
--
-- WHAT COUNTS (measure 'checkins'). The number of different days inside the challenge's dates on which the gym's own
-- visit register (crm_records kind 'visit', not deleted) shows the member: a QR scan (0015's member_check_in) or a
-- check-in at the desk. One a day at most, however many rows that day has. Only app members take part (the line, the
-- reward and the member's progress are keyed by the app member, as for workouts). The app member is tied to the gym's
-- own member by the number the app checked in with (gym_members.checkin_phone, set on the first QR check-in or when the
-- desk confirms the number, 0048), through 0015's _checkin_roster_member: the same person member_check_in writes the
-- visit for. A member who never checked in with the app has no linked number, so counts 0 until their first QR scan.
-- Nothing new leaves any phone: the visits are the gym's own records.
--
-- THE RULES for 'checkins': the goal is a whole number from 1 to 31 and at most the number of days it runs (a goal
-- of 13 visits in 12 days is a typing slip: INVALID). Everything else is 0037's: 7 to 31 days, starts today or later
-- and at most 60 days ahead, 0 to 60 free days, one challenge at a time (OVERLAP), winners kept when it is over, and
-- 0048's owner Give or Skip for each winner's free days.
--
-- CHANGED
--   gym_challenges.measure    may also be 'checkins'.
--   owner_save_challenge      takes measure 'checkins' (the rules above).
--   _challenge_hitters(c)     a 'checkins' challenge counts visit days; workouts and kg exactly as 0037.
--   member_board(key)         the member's own number comes from _challenge_value (workouts and kg the same sums as
--                             0037). The answer's shape is unchanged; the challenge's measure can be 'checkins'. A
--                             member app from before step 2 does not know 'checkins' and simply shows no challenge
--                             card (apps/mobile leaderboard.ts reads only workouts and kg): nothing wrong is shown.
--   owner_challenges(key)     entrants from _challenge_entrants; the answer gains checkins: true (the admin app shows
--                             the ready-made check-in challenges and "Visits" only when it sees this key).
--   _challenge_results(id)    entrants from _challenge_entrants; otherwise 0048's.
-- NEW (no grants: only the functions above call them)
--   _challenge_checkin_days(gym, from, to, member)  per app member: the visit days inside [from, to].
--   _challenge_value(c, member)                     one member's number for a challenge.
--   _challenge_entrants(c)                          how many members took part (any workout day, or any visit day).
--
-- BEFORE SAYING YES: members see a check-in challenge only in a member app that knows 'checkins' (a phone release).
-- Apply this after that release has reached most members, or members on the old app will not see the challenge.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ the measure
alter table public.gym_challenges drop constraint if exists gym_challenges_measure_check;
alter table public.gym_challenges add constraint gym_challenges_measure_check check (measure in ('workouts', 'kg', 'checkins'));

-- ------------------------------------------------------------------ helpers (no grants)
-- Visit days per app member inside [p_from, p_to] (p_member null = every member of the gym who has not left).
-- A member with no linked number, or whose number is on no live member of the gym's list, has no row.
create or replace function public._challenge_checkin_days(p_gym uuid, p_from date, p_to date, p_member uuid)
  returns table(member_id uuid, total numeric)
  language sql stable security definer set search_path = public as $$
  select m.member_id, count(distinct v.data->>'visitedOn')::numeric
    from public.gym_members m
    join lateral (select (public._checkin_roster_member(p_gym, public._norm_phone(m.checkin_phone))).id as roster_id) ro
      on ro.roster_id is not null
    join public.crm_records v
      on v.gym_id = p_gym and v.kind = 'visit' and not v.deleted
     and v.data->>'memberId' = ro.roster_id
     and (v.data->>'visitedOn') ~ '^\d{4}-\d{2}-\d{2}$'
     and (v.data->>'visitedOn') between to_char(p_from, 'YYYY-MM-DD') and to_char(p_to, 'YYYY-MM-DD')
   where m.gym_id = p_gym and m.left_at is null and m.checkin_phone is not null
     and (p_member is null or m.member_id = p_member)
   group by m.member_id
$$;

-- One member's number for a challenge: workouts or kg from the phone's days (0037's sums), or visit days.
create or replace function public._challenge_value(c public.gym_challenges, p_member uuid) returns numeric
  language plpgsql stable security definer set search_path = public as $$
declare v numeric;
begin
  if c.measure = 'checkins' then
    select x.total into v from public._challenge_checkin_days(c.gym_id, c.starts_on, c.ends_on, p_member) x;
  else
    select sum(case when c.measure = 'kg' then d.kg else d.workouts end) into v
      from public.gym_member_days d
     where d.gym_id = c.gym_id and d.member_id = p_member and d.day between c.starts_on and c.ends_on;
  end if;
  return coalesce(v, 0);
end $$;

-- How many members took part: any workout day inside its dates (0037), or any visit day for 'checkins'.
create or replace function public._challenge_entrants(c public.gym_challenges) returns int
  language plpgsql stable security definer set search_path = public as $$
declare n int;
begin
  if c.measure = 'checkins' then
    select count(*) into n from public._challenge_checkin_days(c.gym_id, c.starts_on, c.ends_on, null);
  else
    select count(distinct d.member_id) into n
      from public.gym_member_days d join public.gym_members x on x.member_id = d.member_id
     where d.gym_id = c.gym_id and x.left_at is null and d.day between c.starts_on and c.ends_on;
  end if;
  return coalesce(n, 0);
end $$;

-- 0037's _challenge_hitters. Changed (0091): a 'checkins' challenge counts visit days. Workouts and kg: 0037's query.
create or replace function public._challenge_hitters(c public.gym_challenges)
  returns table(m_id uuid, m_name text, m_phone text, total numeric)
  language plpgsql stable set search_path = public as $$
begin
  if c.measure = 'checkins' then
    return query
      select m.member_id, m.name, m.phone, x.total
        from public._challenge_checkin_days(c.gym_id, c.starts_on, c.ends_on, null) x
        join public.gym_members m on m.member_id = x.member_id
       where x.total >= c.goal;
    return;
  end if;
  return query
    select m.member_id, m.name, m.phone, sum(case when c.measure = 'kg' then d.kg else d.workouts end)
      from public.gym_member_days d
      join public.gym_members m on m.member_id = d.member_id and m.gym_id = d.gym_id
     where d.gym_id = c.gym_id and m.left_at is null and d.day between c.starts_on and c.ends_on
     group by m.member_id, m.name, m.phone
    having sum(case when c.measure = 'kg' then d.kg else d.workouts end) >= c.goal;
end $$;

-- ------------------------------------------------------------------ 0048's _challenge_results
-- Changed (0091): entrants from _challenge_entrants (the same count for workouts and kg).
create or replace function public._challenge_results(p_challenge uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c public.gym_challenges; today date := (now() at time zone 'Asia/Kolkata')::date;
  prev text := coalesce(current_setting('forgeai.hq', true), 'off');
begin
  select * into c from public.gym_challenges where id = p_challenge for update;
  if c.id is null or c.cancelled_at is not null or c.ends_on >= today then return; end if;
  if c.results_at is not null then
    perform public._challenge_rewards(c.id);  -- 0047: a paused gym's rewards, given once it is back on
    return;
  end if;
  perform set_config('forgeai.hq', 'on', true);
  insert into public.gym_challenge_hits(challenge_id, member_id, name, phone, value, reward_state)
    select c.id, h.m_id, regexp_replace(btrim(h.m_name), '\s+', ' ', 'g'), h.m_phone, h.total,
           case when c.prize_days > 0 then 'confirm' else 'none' end  -- 0048: the owner confirms first
      from public._challenge_hitters(c) h
  on conflict do nothing;
  update public.gym_challenges set results_at = now(),
         entrants = public._challenge_entrants(c)  -- 0091
   where id = c.id;
  perform set_config('forgeai.hq', prev, true);
  perform public._challenge_rewards(c.id);  -- 0047
end $$;

-- ------------------------------------------------------------------ 0037's member_board
-- Changed (0091): the member's own number from _challenge_value (three places, marked). Same answer shape.
-- Volatile on purpose: a read may run the clean-up and keep the result of a challenge that is over.
create or replace function public.member_board(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  g public.gyms; c public.gym_challenges; cj jsonb := null; mine numeric; n int; hits int; hit boolean;
begin
  perform public._board_cleanup(m.gym_id);
  select * into g from public.gyms where gym_id = m.gym_id;
  select count(distinct d.member_id) into n
    from public.gym_member_days d join public.gym_members x on x.member_id = d.member_id
   where d.gym_id = m.gym_id and x.left_at is null and d.day between today - 29 and today;

  select * into c from public.gym_challenges
   where gym_id = m.gym_id and cancelled_at is null and starts_on <= today and ends_on >= today;
  if c.id is null then
    select * into c from public.gym_challenges
     where gym_id = m.gym_id and cancelled_at is null and ends_on < today and ends_on >= today - 7
     order by ends_on desc limit 1;
  end if;
  if c.id is not null then
    mine := public._challenge_value(c, m.member_id);  -- 0091
    if c.ends_on < today then
      -- Over: the kept result decides, never a number pushed late.
      perform public._challenge_results(c.id);
      select count(*) into hits from public.gym_challenge_hits where challenge_id = c.id;
      select value into mine from public.gym_challenge_hits where challenge_id = c.id and member_id = m.member_id;
      hit := mine is not null;
      if not hit then
        mine := public._challenge_value(c, m.member_id);  -- 0091
        -- A late push cannot show a number at or above the goal without the prize.
        if mine >= c.goal then mine := greatest(c.goal - case when c.measure = 'kg' then 0.1 else 1 end, 0); end if;
      end if;
    else
      select count(*) into hits from public._challenge_hitters(c);
      hit := mine >= c.goal;
    end if;
    cj := jsonb_build_object('id', c.id::text, 'title', c.title, 'measure', c.measure, 'goal', c.goal,
      'startsOn', to_char(c.starts_on, 'YYYY-MM-DD'), 'endsOn', to_char(c.ends_on, 'YYYY-MM-DD'),
      'prizeDays', c.prize_days, 'myValue', mine, 'hit', hit, 'hitters', hits);
  end if;

  return jsonb_build_object('ok', true, 'gymName', g.name, 'members', n,
    'workouts', public._board_top(m.gym_id, 'workouts', m.member_id, false),
    'kg', public._board_top(m.gym_id, 'kg', m.member_id, false),
    'challenge', cj);
end $$;

-- ------------------------------------------------------------------ 0047's owner_challenges
-- Changed (0091): entrants from _challenge_entrants; the answer gains checkins: true.
-- Volatile on purpose: a read may run the clean-up and keep the result of a challenge that is over.
create or replace function public.owner_challenges(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  out jsonb; cx uuid;
begin
  perform public._board_cleanup(g);
  for cx in select id from public.gym_challenges c
            where c.gym_id = g and c.cancelled_at is null and c.ends_on < today and c.ends_on >= today - 365
              and (c.results_at is null
                   or exists (select 1 from public.gym_challenge_hits h where h.challenge_id = c.id and h.reward_state = 'pending')) loop
    perform public._challenge_results(cx);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id::text, 'title', c.title, 'measure', c.measure, 'goal', c.goal,
      'startsOn', to_char(c.starts_on, 'YYYY-MM-DD'), 'endsOn', to_char(c.ends_on, 'YYYY-MM-DD'),
      'prizeDays', c.prize_days, 'createdByName', c.created_by_name,
      'createdAt', floor(extract(epoch from c.created_at) * 1000)::bigint,
      'cancelledAt', case when c.cancelled_at is null then null else floor(extract(epoch from c.cancelled_at) * 1000)::bigint end,
      'status', case when c.cancelled_at is not null then 'cancelled' when today < c.starts_on then 'upcoming'
                     when today <= c.ends_on then 'running' else 'ended' end,
      'entrants', case when c.ends_on < today and c.results_at is not null then coalesce(c.entrants, 0)
                       else public._challenge_entrants(c) end,  -- 0091
      'hitters', case
        when c.cancelled_at is not null then '[]'::jsonb
        when c.ends_on < today then coalesce((
          select jsonb_agg(jsonb_build_object('memberId', h.member_id::text, 'name', h.name, 'phone', h.phone, 'value', h.value,
                             'reward', case when h.reward_state is null then null else jsonb_build_object(
                               'state', h.reward_state, 'reason', h.reward_reason, 'days', coalesce(h.reward_days, c.prize_days),
                               'newEnd', to_char(h.new_end, 'YYYY-MM-DD')) end)
                           order by h.value desc, h.name, h.member_id)
            from public.gym_challenge_hits h where h.challenge_id = c.id), '[]'::jsonb)
        else coalesce((
          select jsonb_agg(jsonb_build_object('memberId', h.m_id::text, 'name', regexp_replace(btrim(h.m_name), '\s+', ' ', 'g'), 'phone', h.m_phone, 'value', h.total)
                           order by h.total desc, h.m_name, h.m_id)
            from public._challenge_hitters(c) h), '[]'::jsonb) end
    ) order by c.starts_on desc, c.created_at desc), '[]'::jsonb)
    into out
    from public.gym_challenges c
   where c.gym_id = g and c.ends_on >= today - 365;
  return jsonb_build_object('canEdit', st.staff_id is null or st.role = 'owner', 'autoRewards', true,
                            'checkins', true,  -- 0091
                            'challenges', out);
end $$;

-- ------------------------------------------------------------------ 0037's owner_save_challenge
-- Changed (0091): measure 'checkins' (a whole-number goal from 1 to 31, at most the number of days it runs).
create or replace function public.owner_save_challenge(p_key text, p_challenge jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  p jsonb := p_challenge; prev public.gym_challenges; cid uuid;
  ttl text; ms text; gl numeric; s date; en date; pz numeric;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 2000 then raise exception 'INVALID'; end if;
  if exists (select 1 from jsonb_object_keys(p) x where x not in ('id', 'title', 'measure', 'goal', 'startsOn', 'endsOn', 'prizeDays')) then
    raise exception 'INVALID';
  end if;
  if jsonb_typeof(p->'title') is distinct from 'string' or jsonb_typeof(p->'measure') is distinct from 'string'
     or jsonb_typeof(p->'goal') is distinct from 'number' or jsonb_typeof(p->'prizeDays') is distinct from 'number'
     or jsonb_typeof(p->'startsOn') is distinct from 'string' or jsonb_typeof(p->'endsOn') is distinct from 'string' then
    raise exception 'INVALID';
  end if;
  ttl := btrim(p->>'title');
  if length(ttl) not between 1 and 60 then raise exception 'INVALID'; end if;
  ms := p->>'measure';
  if ms not in ('workouts', 'kg', 'checkins') then raise exception 'INVALID'; end if;  -- 0091: + checkins
  gl := (p->>'goal')::numeric;
  -- A goal nobody can reach is a typing slip: at most 3 workouts and 60000 kg a day, 31 days; one visit a day (0091).
  if gl <= 0 or (ms = 'workouts' and (gl <> trunc(gl) or gl > 93)) or (ms = 'kg' and gl > 1860000)
     or (ms = 'checkins' and (gl <> trunc(gl) or gl > 31)) then
    raise exception 'INVALID';
  end if;
  gl := trim_scale(round(gl, 1));
  pz := (p->>'prizeDays')::numeric;
  if pz <> trunc(pz) or pz not between 0 and 60 then raise exception 'INVALID'; end if;
  if (p->>'startsOn') !~ '^\d{4}-\d{2}-\d{2}$' or (p->>'endsOn') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID'; end if;
  begin
    s := (p->>'startsOn')::date;
    en := (p->>'endsOn')::date;
  exception when others then
    raise exception 'INVALID';
  end;
  if to_char(s, 'YYYY-MM-DD') <> p->>'startsOn' or to_char(en, 'YYYY-MM-DD') <> p->>'endsOn' then raise exception 'INVALID'; end if;
  if s < today or s > today + 60 or en - s not between 6 and 30 then raise exception 'INVALID'; end if;
  if ms = 'checkins' and gl > en - s + 1 then raise exception 'INVALID'; end if;  -- 0091: more visits than days

  -- One at a time per gym while the overlap is checked.
  perform pg_advisory_xact_lock(hashtext('gym_challenges:' || g::text));

  if p ? 'id' and jsonb_typeof(p->'id') <> 'null' then
    if jsonb_typeof(p->'id') <> 'string' or (p->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'INVALID'; end if;
    cid := (p->>'id')::uuid;
    select * into prev from public.gym_challenges where id = cid and gym_id = g;
    if prev.id is null or prev.cancelled_at is not null or prev.starts_on <= today then raise exception 'INVALID'; end if;
  end if;

  if exists (select 1 from public.gym_challenges o
              where o.gym_id = g and o.cancelled_at is null and o.id is distinct from cid
                and o.starts_on <= en and o.ends_on >= s) then
    raise exception 'OVERLAP';
  end if;

  if cid is not null then
    update public.gym_challenges
       set title = ttl, measure = ms, goal = gl, starts_on = s, ends_on = en, prize_days = pz::int
     where id = cid;
    return jsonb_build_object('id', cid::text);
  end if;
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days, created_by, created_by_name)
    values (g, ttl, ms, gl, s, en, pz::int, st.staff_id, case when st.staff_id is null then null else st.name end)
  returning id into cid;
  return jsonb_build_object('id', cid::text);
end $$;

-- ------------------------------------------------------------------ grants
-- create or replace keeps the grants 0037 and 0047 gave; the new helpers are closed.
revoke all on function public._challenge_checkin_days(uuid, date, date, uuid) from public, anon, authenticated;
revoke all on function public._challenge_value(public.gym_challenges, uuid) from public, anon, authenticated;
revoke all on function public._challenge_entrants(public.gym_challenges) from public, anon, authenticated;

-- PostgREST learns the changed functions at once (instead of on its next schema reload).
notify pgrst, 'reload schema';
