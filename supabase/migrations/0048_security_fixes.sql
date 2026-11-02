-- 0048: the R-286 security check fixes (2 Nov 2026, owner's yes R-287: "yes, fix security").
-- Additive and re-runnable: one new table, two new columns, three new functions, and four existing
-- functions replaced (each copied from its last file with only the marked changes):
--   member_check_in (0031), staff_sign_in (0034), _challenge_results (0047), staff_me (0010).
-- Apply after 0047. Test: supabase/tests/0048_security_fixes.sql (CI runs it after every migration;
-- pasted into the SQL Editor it always ends in an error and so changes nothing).
--
-- 1. A TYPED CHECK-IN NUMBER IS CONFIRMED BY THE DESK (was: anyone with the poster's gym code could type a
--    member's number and be linked to that member: plan, trainer, measurements, diet, workout plans).
--    member_check_in no longer links a typed number. When it matches the gym's list it keeps ONE pending
--    request per app member (gym_phone_links) and answers {error: TOO_MANY_NUMBERS, deskCheck: true,
--    gymName}: no first name, no plan state. The desk sees the requests (owner_phone_links) and approves
--    or declines (owner_decide_phone_link; owner and front desk alike). Approve sets the app member's
--    check-in number, so the next scan is an ordinary check-in. A member already linked is not touched.
--    At most 30 new requests per gym per hour.
-- 2. OWNER PINS: each lock in the last day lasts longer: 15 minutes for the 1st and 2nd, 1 hour for the
--    3rd, 24 hours from the 4th (was: 15 minutes, again and again, about 480 guesses a day). A correct
--    sign-in (PIN or one-time code) clears it. Never locked for good, so nobody can lock an owner out
--    forever by guessing wrong on purpose.
-- 3. CHALLENGE REWARDS WAIT FOR THE OWNER (was: free days given by themselves on numbers the phone
--    sends). A finished challenge's winners are marked 'confirm'. The owner gives (or skips) each one
--    with owner_confirm_challenge_reward; give = 0047's _challenge_rewards, unchanged. Lines already
--    'pending' from before this file are given as before.
-- 4. AI IMPORT AND DEMO GYMS: staff_me also says hasPeople (the gym has at least one signed-in person).
--    A bare owner key on a gym with no people is a demo gym: the Worker refuses AI matching for it
--    (deploy/panel/aiMatch.js).
--
-- Undo: re-run 0031's member_check_in, 0034's staff_sign_in, 0047's _challenge_results and 0010's
-- staff_me; drop function public.owner_phone_links(text); drop function
-- public.owner_decide_phone_link(text, uuid, text); drop function
-- public.owner_confirm_challenge_reward(text, uuid, uuid, boolean); drop function public._pin_lock_for(int);
-- drop table public.gym_phone_links. Lines left at 'confirm' then need 'pending' to be given.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ 1. typed numbers wait for the desk
create table if not exists public.gym_phone_links (
  link_id         uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(gym_id) on delete cascade,
  app_member      uuid not null references public.gym_members(member_id) on delete cascade,
  roster_id       text not null check (length(roster_id) between 1 and 64),
  phone           text not null check (phone ~ '^\+91[0-9]{10}$'),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid,
  decided_by_name text,
  constraint gym_phone_links_decided check ((status = 'pending') = (decided_at is null))
);
create unique index if not exists gym_phone_links_one_pending on public.gym_phone_links(app_member) where status = 'pending';
create index if not exists gym_phone_links_gym on public.gym_phone_links(gym_id, status, created_at desc);
alter table public.gym_phone_links enable row level security;
revoke all on public.gym_phone_links from public, anon, authenticated;

drop trigger if exists gym_phone_links_not_suspended on public.gym_phone_links;
create trigger gym_phone_links_not_suspended before insert or update or delete on public.gym_phone_links
  for each row execute function public._gym_not_suspended();

-- 0031's member_check_in. Changed: the typed-number block (marked 0048).
create or replace function public.member_check_in(p_key text, p_code text default null, p_phone text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  g public.gyms;
  at_g public.gyms;
  visiting boolean := false;
  tries int;
  ph text;
  tag text;
  typed boolean := false;
  new_miss boolean := false;
  roster public.crm_records;
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  vid text;
  prev jsonb;
  v bigint;
  plan_ok boolean;
  first_name text;
  at_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
  shown text;
  link public.gym_phone_links;
  n_open int;
begin
  -- 10 a minute per member key. Queued per member, so a burst cannot slip past the count.
  perform pg_advisory_xact_lock(hashtextextended('checkin:' || m.member_id::text, 0));
  select count(*) into tries from public.member_checkin_tries
   where member_id = m.member_id and at > now() - interval '1 minute';
  if tries >= 10 then return jsonb_build_object('error', 'TOO_MANY'); end if;
  insert into public.member_checkin_tries(member_id) values (m.member_id);
  delete from public.member_checkin_tries where member_id = m.member_id and what = 'try' and at < now() - interval '10 minutes';
  delete from public.member_checkin_tries where member_id = m.member_id and at < now() - interval '2 days';

  select * into g from public.gyms where gym_id = m.gym_id;

  if nullif(btrim(coalesce(p_code, '')), '') is null then
    return jsonb_build_object('error', 'OTHER_GYM', 'gymName', g.name);
  end if;
  if upper(btrim(p_code)) <> g.join_code then
    -- 0031: another branch of the member's own business?
    if g.group_id is not null then
      select * into at_g from public.gyms where join_code = upper(btrim(p_code)) and group_id = g.group_id;
    end if;
    if at_g.gym_id is null then return jsonb_build_object('error', 'OTHER_GYM', 'gymName', g.name); end if;
    visiting := true;
  end if;

  if nullif(btrim(coalesce(p_phone, '')), '') is not null then
    ph := public._norm_phone(p_phone);
    if ph is null then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  else
    ph := public._norm_phone(m.checkin_phone);
    if ph is null then return jsonb_build_object('error', 'NO_PHONE', 'gymName', g.name); end if;
  end if;

  if coalesce(g.crm_version, 0) = 0
     and not exists (select 1 from public.crm_records where gym_id = g.gym_id and kind = 'member') then
    return jsonb_build_object('error', 'GYM_NOT_ONLINE', 'gymName', g.name);
  end if;

  -- A number that has not matched for this member before is a TYPED try, limited per key (3
  -- numbers a day) and, for numbers that match nobody, per gym (20 an hour). C6-8: the same number
  -- typed again is not a new number — it counts once a day for the member, once an hour for the gym.
  if public._norm_phone(m.checkin_phone) is distinct from ph then
    typed := true;
    tag := 'phone:' || md5(g.gym_id::text || ':' || ph);
    if not exists (select 1 from public.member_checkin_tries
                    where member_id = m.member_id and what = tag and at > now() - interval '1 day') then
      select count(distinct what) into tries from public.member_checkin_tries
       where member_id = m.member_id and what like 'phone%' and at > now() - interval '1 day';
      if tries >= 3 then return jsonb_build_object('error', 'TOO_MANY_NUMBERS'); end if;
      insert into public.member_checkin_tries(member_id, what) values (m.member_id, tag);
    end if;
    perform pg_advisory_xact_lock(hashtextextended('checkin-misses:' || g.gym_id::text, 0));
    if not exists (select 1 from public.gym_checkin_misses
                    where gym_id = g.gym_id and phone_tag = tag and at > now() - interval '1 hour') then
      select count(*) into tries from public.gym_checkin_misses
       where gym_id = g.gym_id and at > now() - interval '1 hour';
      if tries >= 20 then return jsonb_build_object('error', 'TOO_MANY_NUMBERS'); end if;
      new_miss := true;
    end if;
  end if;

  roster := public._checkin_roster_member(g.gym_id, ph);
  if roster.id is null then
    if new_miss then
      insert into public.gym_checkin_misses(gym_id, phone_tag) values (g.gym_id, tag);
      delete from public.gym_checkin_misses where gym_id = g.gym_id and at < now() - interval '1 day';
    end if;
    return jsonb_build_object('error', 'NOT_ON_ROSTER', 'gymName', g.name, 'phone', '+91' || ph);
  end if;

  -- 0031: at another branch only when the member's plan says every branch.
  if visiting and coalesce(roster.data->>'allBranches', 'false') <> 'true' then
    return jsonb_build_object('error', 'OTHER_GYM', 'gymName', g.name, 'branch', at_g.name);
  end if;

  -- 0048: a typed number that matches the gym's list is NOT linked here. It waits for the desk
  -- (owner_decide_phone_link), and nothing about that member is answered: no name, no plan state.
  -- Old apps read TOO_MANY_NUMBERS ("Check in at the desk, and ask them to check your mobile
  -- number"); new apps read deskCheck.
  if typed then
    select * into link from public.gym_phone_links
     where app_member = m.member_id and status = 'pending' for update;
    if link.link_id is null then
      select count(*) into n_open from public.gym_phone_links
       where gym_id = g.gym_id and created_at > now() - interval '1 hour';
      if n_open >= 30 then return jsonb_build_object('error', 'TOO_MANY_NUMBERS'); end if;
      insert into public.gym_phone_links(gym_id, app_member, roster_id, phone)
        values (g.gym_id, m.member_id, roster.id, '+91' || ph);
    elsif link.phone is distinct from '+91' || ph then
      update public.gym_phone_links set phone = '+91' || ph, roster_id = roster.id, created_at = now()
       where link_id = link.link_id;
    end if;
    return jsonb_build_object('error', 'TOO_MANY_NUMBERS', 'deskCheck', true, 'gymName', g.name);
  end if;

  first_name := split_part(btrim(coalesce(roster.data->>'fullName', m.name)), ' ', 1);
  plan_ok := public._checkin_plan_ok(g.gym_id, roster.id, day);
  shown := case when visiting then at_g.name else g.name end;

  -- The gym's row lock (the one crm_push takes) only now, just before the "already in" look and
  -- the write, so versions never collide and a desk check-in cannot slip in between.
  select * into g from public.gyms where gym_id = g.gym_id for update;

  -- Already in today, however it was recorded (desk rows have random ids).
  select r.data into prev from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'visit' and not r.deleted
     and r.data->>'memberId' = roster.id and r.data->>'visitedOn' = day
   order by r.version limit 1;
  if prev is not null then
    -- C6-12: a visit with no real time (an imported paper register says 0) has no time, never 1970.
    return jsonb_build_object('ok', true, 'alreadyIn', true, 'gymName', shown, 'memberName', first_name,
      'day', day, 'planOk', plan_ok,
      'checkedInAt', case when prev->>'checkedInAt' ~ '^[0-9]{1,15}$' and (prev->>'checkedInAt')::bigint > 0
                          then (prev->>'checkedInAt')::bigint else null end);
  end if;

  vid := roster.id || ':' || day;
  v := coalesce(g.crm_version, 0) + 1;
  insert into public.crm_records(gym_id, kind, id, data, version)
    values (g.gym_id, 'visit', vid,
            jsonb_build_object('id', vid, 'gymId', g.gym_id::text, 'memberId', roster.id,
                               'visitedOn', day, 'checkedInAt', at_ms, 'source', 'app')
            || case when visiting then jsonb_build_object('atGymId', at_g.gym_id::text, 'atGymName', at_g.name)
                    else '{}'::jsonb end,
            v)
    on conflict (gym_id, kind, id) do update
      set data = excluded.data, version = v, deleted = false, updated_at = now();
  update public.gyms set crm_version = v where gym_id = g.gym_id;
  update public.gym_members set last_seen = now() where member_id = m.member_id;

  return jsonb_build_object('ok', true, 'alreadyIn', false, 'gymName', shown, 'memberName', first_name,
    'day', day, 'planOk', plan_ok, 'checkedInAt', at_ms);
end $$;

-- Every pending request (oldest first) and those answered in the last 14 days, with the name on the
-- gym's list and the name the app member gave. An empty gym answers [].
create or replace function public.owner_phone_links(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', q.link_id, 'rosterId', q.roster_id, 'phone', q.phone, 'status', q.status,
             'memberName', coalesce(nullif(btrim(r.data->>'fullName'), ''), 'A member'),
             'appName', coalesce(nullif(btrim(m.name), ''), ''),
             'createdAt', floor(extract(epoch from q.created_at) * 1000)::bigint,
             'decidedAt', case when q.decided_at is null then null else floor(extract(epoch from q.decided_at) * 1000)::bigint end,
             'decidedBy', q.decided_by_name)
           order by (q.status <> 'pending'), case when q.status = 'pending' then q.created_at end, q.decided_at desc)
      from (select * from public.gym_phone_links x
             where x.gym_id = g and (x.status = 'pending' or x.decided_at > now() - interval '14 days')
             order by (x.status <> 'pending'), x.created_at limit 150) q
      left join public.crm_records r on r.gym_id = g and r.kind = 'member' and r.id = q.roster_id
      left join public.gym_members m on m.member_id = q.app_member), '[]'::jsonb);
end $$;

-- Approve or decline one request. Approve links the app member to the number. The same answer twice is
-- the same (a lost answer, pressed again). Raises BAD_KEY, INVALID, GONE, ALREADY_DECIDED, SUSPENDED.
create or replace function public.owner_decide_phone_link(p_key text, p_link uuid, p_decision text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  q public.gym_phone_links;
begin
  if p_decision is null or p_decision not in ('approved', 'declined') then raise exception 'INVALID'; end if;
  select * into q from public.gym_phone_links where link_id = p_link and gym_id = g for update;
  if q.link_id is null then raise exception 'GONE'; end if;
  if q.status <> 'pending' then
    if q.status = p_decision then return jsonb_build_object('id', q.link_id, 'status', q.status); end if;
    raise exception 'ALREADY_DECIDED';
  end if;
  update public.gym_phone_links
     set status = p_decision, decided_at = now(), decided_by = st.staff_id, decided_by_name = coalesce(st.name, 'Owner')
   where link_id = q.link_id;
  if p_decision = 'approved' then
    update public.gym_members set checkin_phone = q.phone, phone = q.phone
     where member_id = q.app_member and gym_id = g and left_at is null;
  end if;
  return jsonb_build_object('id', q.link_id, 'status', p_decision);
end $$;

-- ------------------------------------------------------------------ 2. owner PINs: longer locks
alter table public.gym_staff_pins add column if not exists lock_streak int not null default 0;
alter table public.gym_staff_pins add column if not exists last_locked_at timestamptz;

-- How long the n-th lock in a day lasts.
create or replace function public._pin_lock_for(p_streak int) returns interval
  language sql immutable set search_path = public as $$
  select case when p_streak <= 2 then interval '15 minutes' when p_streak = 3 then interval '1 hour' else interval '24 hours' end
$$;

-- 0034's staff_sign_in. Changed: the lock length (lock_streak) and its reset on a correct sign-in (marked 0048).
create or replace function public.staff_sign_in(p_phone text, p_code text, p_device text default null)
  returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare ph text := public._norm_phone(p_phone); v_ip text := public._caller_ip(); mine int; cid uuid; st public.gym_staff;
  t timestamptz := clock_timestamp(); digits text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  sid uuid; v_via text; k text; locked_before int; pin_left int; v_until timestamptz;
begin
  if ph is null then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  perform pg_advisory_xact_lock(hashtext('signin:' || ph));
  delete from public.gym_signin_fails where at < now() - interval '1 day';
  select count(distinct at) into mine from public.gym_signin_fails
   where phone = ph and coalesce(gym_signin_fails.ip, '') = v_ip and at > now() - interval '15 minutes';
  if mine >= 5 then return jsonb_build_object('error', 'TOO_MANY_TRIES'); end if;

  -- 1. The person's own PIN (a locked PIN is not tried). Two people with this mobile and the same
  --    PIN (two gyms): the one whose device was seen last.
  if length(digits) = 6 then
    select s.staff_id into sid
      from public.gym_staff_pins p join public.gym_staff s on s.staff_id = p.staff_id
     where s.phone = ph and s.removed_at is null
       and (p.locked_until is null or p.locked_until <= now())
       and p.pin_hash = crypt(digits, p.pin_hash)
     order by (select max(x.last_seen_at) from public.gym_sessions x where x.staff_id = s.staff_id) desc nulls last,
              s.created_at
     limit 1;
    if sid is not null then v_via := 'pin'; end if;
  end if;

  -- 2. A waiting one-time code (0018, unchanged).
  if sid is null then
    select x.code_id into cid
      from public.gym_signin_codes x join public.gym_staff s on s.staff_id = x.staff_id
     where s.phone = ph and s.removed_at is null and x.used_at is null and x.expires_at > now()
       and x.wrong_tries < 10 and x.code_hash = public._code_hash(x.code_id, p_code)
     limit 1 for update of x;
    if cid is not null then
      update public.gym_signin_codes set used_at = now() where code_id = cid;
      select x.staff_id into sid from public.gym_signin_codes x where x.code_id = cid;
      v_via := 'code';
    end if;
  end if;

  if sid is null then
    -- 0018: one wrong try is recorded against every person with this mobile, with ONE time stamp.
    insert into public.gym_signin_fails(phone, ip, staff_id, at)
      select ph, v_ip, s.staff_id, t from public.gym_staff s where s.phone = ph and s.removed_at is null;
    if not found then
      insert into public.gym_signin_fails(phone, ip, staff_id, at) values (ph, v_ip, null, t);
    end if;
    update public.gym_signin_codes x set wrong_tries = x.wrong_tries + 1
      from public.gym_staff s
     where s.staff_id = x.staff_id and s.phone = ph and s.removed_at is null
       and x.used_at is null and x.expires_at > now() and x.wrong_tries < 10;
    -- 0034: every PIN of this mobile that is not locked takes the try; the 5th in a row locks it.
    select count(*), min(p.locked_until) into locked_before, v_until
      from public.gym_staff_pins p join public.gym_staff s on s.staff_id = p.staff_id
     where s.phone = ph and s.removed_at is null and p.locked_until > now();
    with tried as (
      update public.gym_staff_pins p
         set wrong_tries  = case when p.wrong_tries + 1 >= 5 then 0 else p.wrong_tries + 1 end,
             -- 0048: the lock grows with each lock in the last day (see the top of 0048).
             lock_streak  = case when p.wrong_tries + 1 >= 5
                                 then case when p.last_locked_at > now() - interval '1 day' then p.lock_streak + 1 else 1 end
                                 else p.lock_streak end,
             last_locked_at = case when p.wrong_tries + 1 >= 5 then now() else p.last_locked_at end,
             locked_until = case when p.wrong_tries + 1 >= 5 then now() + public._pin_lock_for(
                                   case when p.last_locked_at > now() - interval '1 day' then p.lock_streak + 1 else 1 end)
                                 else null end
        from public.gym_staff s
       where s.staff_id = p.staff_id and s.phone = ph and s.removed_at is null
         and (p.locked_until is null or p.locked_until <= now())
      returning case when p.locked_until is not null then 0 else 5 - p.wrong_tries end as left_tries)
    select min(left_tries) into pin_left from tried;
    -- Every PIN of this mobile was already locked: say so (no PIN can be right until lockedUntil).
    if pin_left is null and locked_before > 0 then
      return jsonb_build_object('error', 'TOO_MANY_TRIES', 'lockedUntil', v_until);
    end if;
    return jsonb_build_object('error', 'WRONG_CODE', 'triesLeft', greatest(0, least(4 - mine, coalesce(pin_left, 4 - mine))));
  end if;

  select * into st from public.gym_staff where staff_id = sid;
  delete from public.gym_signin_fails where staff_id = st.staff_id;
  -- 0034: a correct sign-in clears this person's PIN tries and lock.
  update public.gym_staff_pins set wrong_tries = 0, locked_until = null, lock_streak = 0 where staff_id = st.staff_id;
  k := public._new_session(st.staff_id, p_device);
  update public.gym_sessions set via = v_via where key_hash = public._hash_key(k);
  return public._signed_in_json(st, k)
         || jsonb_build_object('via', v_via,
                               'hasPin', exists (select 1 from public.gym_staff_pins where staff_id = st.staff_id));
end $$;

-- ------------------------------------------------------------------ 3. challenge rewards: the owner confirms
alter table public.gym_challenge_hits drop constraint if exists gym_challenge_hits_reward_state_check;
alter table public.gym_challenge_hits add constraint gym_challenge_hits_reward_state_check
  check (reward_state is null or reward_state in ('confirm', 'pending', 'added', 'by_hand', 'none'));
alter table public.gym_challenge_hits drop constraint if exists gym_challenge_hits_reward_reason_check;
alter table public.gym_challenge_hits add constraint gym_challenge_hits_reward_reason_check
  check (reward_reason is null or reward_reason in ('no_plan', 'no_match', 'left', 'skipped'));

-- 0047's _challenge_results. Changed: winners start at 'confirm' (marked 0048).
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
         entrants = (select count(distinct d.member_id) from public.gym_member_days d
                       join public.gym_members x on x.member_id = d.member_id
                      where d.gym_id = c.gym_id and x.left_at is null and d.day between c.starts_on and c.ends_on)
   where id = c.id;
  perform set_config('forgeai.hq', prev, true);
  perform public._challenge_rewards(c.id);  -- 0047
end $$;

-- Give (p_give true) or skip one winner's free days. Owner only (like editing challenges). Give hands
-- the line to 0047's _challenge_rewards (the plan, the note, the member's message), unchanged. Skip
-- marks it 'none' with reason 'skipped' (no message). Only a 'confirm' line moves; anything else
-- answers its state as it is. Raises BAD_KEY, NOT_OWNER, GONE.
create or replace function public.owner_confirm_challenge_reward(p_key text, p_challenge uuid, p_member uuid, p_give boolean)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  c public.gym_challenges;
  h public.gym_challenge_hits;
begin
  if st.staff_id is not null and st.role <> 'owner' then raise exception 'NOT_OWNER'; end if;
  select * into c from public.gym_challenges where id = p_challenge and gym_id = g;
  if c.id is null then raise exception 'GONE'; end if;
  select * into h from public.gym_challenge_hits where challenge_id = c.id and member_id = p_member for update;
  if h.challenge_id is null then raise exception 'GONE'; end if;
  if h.reward_state = 'confirm' then
    if coalesce(p_give, false) then
      update public.gym_challenge_hits set reward_state = 'pending' where challenge_id = c.id and member_id = p_member;
      perform public._challenge_rewards(c.id);
    else
      update public.gym_challenge_hits set reward_state = 'none', reward_reason = 'skipped', reward_days = c.prize_days
       where challenge_id = c.id and member_id = p_member;
    end if;
    select * into h from public.gym_challenge_hits where challenge_id = c.id and member_id = p_member;
  end if;
  return jsonb_build_object('state', h.reward_state, 'reason', h.reward_reason,
    'days', coalesce(h.reward_days, c.prize_days), 'newEnd', to_char(h.new_end, 'YYYY-MM-DD'));
end $$;

-- ------------------------------------------------------------------ 4. who the key is, plus hasPeople
-- 0010's staff_me. Changed: hasPeople (marked 0048).
create or replace function public.staff_me(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key); gr public.gyms;
begin
  update public.gym_sessions set last_seen_at = now()
   where key_hash = public._hash_key(p_key) and ended_at is null and last_seen_at < now() - interval '5 minutes';
  select * into gr from public.gyms where gym_id = g;
  return jsonb_build_object('gymId', gr.gym_id, 'name', gr.name, 'joinCode', gr.join_code,
    'person', case when st.staff_id is null then null else public._person_json(st) end,
    -- 0048: a gym with nobody signed up (a demo) has no people; the Worker gives it no AI matching.
    'hasPeople', exists (select 1 from public.gym_staff s where s.gym_id = gr.gym_id and s.removed_at is null));
end $$;

-- ------------------------------------------------------------------ grants
-- create or replace keeps the grants the replaced functions had.
revoke all on function public._pin_lock_for(int)                                  from public, anon, authenticated;
revoke all on function public.owner_phone_links(text)                             from public;
revoke all on function public.owner_decide_phone_link(text, uuid, text)           from public;
revoke all on function public.owner_confirm_challenge_reward(text, uuid, uuid, boolean) from public;
grant execute on function public.owner_phone_links(text)                          to anon, authenticated;
grant execute on function public.owner_decide_phone_link(text, uuid, text)        to anon, authenticated;
grant execute on function public.owner_confirm_challenge_reward(text, uuid, uuid, boolean) to anon, authenticated;

-- PostgREST learns the changed functions at once (instead of on its next schema reload).
notify pgrst, 'reload schema';
