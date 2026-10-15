-- 0015: QR self check-in (15 Oct 2026; research: Audit/crm-research/RESEARCH.md "QR check-in |
-- Must | Desk register only").
--
-- THE FLOW. The gym prints a poster (panel: Attendance -> Check-in QR) whose QR is
-- https://forgeai.aakashpahuja.in/c/<JOIN CODE>. A member scans it with the phone camera; Android
-- opens the ForgeAI app on "Check in at <gym>", which calls member_check_in with this phone's
-- MEMBER KEY (0002) and the code it scanned. The visit lands in the gym's online records
-- (crm_records, 0010) exactly like a desk check-in, with source 'app', so the panel's register
-- shows it (with a small "App" tag) on its next pull.
--
-- WHO IS CHECKED IN. An app member (gym_members, made by the app's Join) is NOT the gym's roster
-- member (crm_records kind 'member', made by the desk). They are tied by MOBILE NUMBER: the app
-- member's number against the roster's data->>'phone', both read by _norm_phone (0010) so
-- '+919829012345', '98290 12345' and '09829012345' are the same person. The app never sent a
-- number at Join, so the first check-in asks for it (NO_PHONE); the number given is kept on
-- gym_members.phone and later scans need nothing typed. The number is not verified (no OTP);
-- the register shows the "App" tag, so a check-in the desk did not expect stands out.
--
-- ANSWERS (never a raise after the key check, so the try count and a saved number are kept):
--   {ok:true, alreadyIn, gymName, memberName (first name only), day, checkedInAt}
--   {error:'TOO_MANY'}        more than 10 calls in a minute from this member key
--   {error:'OTHER_GYM', gymName}   the scanned code is not this member's gym
--   {error:'BAD_PHONE'}       the number typed is not an Indian mobile
--   {error:'NO_PHONE', gymName}    no number on this member yet: ask for it
--   {error:'GYM_NOT_ONLINE', gymName}  the gym keeps no records online (crm_version 0, no members)
--   {error:'NOT_ON_ROSTER', gymName, phone}  no live (not archived) roster member has that number
-- A key the gym does not know still raises BAD_KEY (as every member_* function does).
--
-- ONE VISIT A DAY. The visit row's id is '<rosterMemberId>:<YYYY-MM-DD>' (India's date), written
-- under the gym's row lock with version = crm_version + 1 (the same lock and counter crm_push
-- uses), so a desk push racing a scan is refused STALE and redone on top of it. A member already
-- in that day (by the desk, under any id, or by an earlier scan) gets alreadyIn true and nothing
-- is written. A scan after the desk pressed Undo brings the row back.
--
-- Apply after 0014 (SQL Editor -> paste -> Run). Re-runnable. The test block at the end changes
-- nothing: it always ends with an error that reads RESULT PASS ... (or the checks that failed),
-- and that error rolls everything it made back.

-- ------------------------------------------------------------------ tries (rate limit)
create table if not exists public.member_checkin_tries (
  member_id uuid not null references public.gym_members(member_id) on delete cascade,
  at        timestamptz not null default now()
);
-- 'try' = any check-in call; 'phone' = the member typed a number different from the one on file.
alter table public.member_checkin_tries add column if not exists what text not null default 'try';
create index if not exists member_checkin_tries_member on public.member_checkin_tries(member_id, at);
alter table public.member_checkin_tries enable row level security;
revoke all on public.member_checkin_tries from anon, authenticated;

-- ------------------------------------------------------------------ helper (no grants)
-- The live roster member (kind 'member', not deleted, not archived) whose mobile is p_phone10
-- (10 digits, already normalised). Null when none. The earliest-made wins if two share a number.
create or replace function public._checkin_roster_member(p_gym uuid, p_phone10 text)
  returns public.crm_records language sql stable security definer set search_path = public as $$
  select r.* from public.crm_records r
   where r.gym_id = p_gym and r.kind = 'member' and not r.deleted
     and coalesce(r.data->>'archived', 'false') <> 'true'
     and p_phone10 is not null
     and public._norm_phone(r.data->>'phone') = p_phone10
   order by case when r.data->>'createdAt' ~ '^[0-9]{1,15}$' then (r.data->>'createdAt')::bigint end nulls last, r.id
   limit 1
$$;

-- ------------------------------------------------------------------ the check-in
create or replace function public.member_check_in(p_key text, p_code text default null, p_phone text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  g public.gyms;
  tries int;
  ph text;
  roster public.crm_records;
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  vid text;
  prev jsonb;
  v bigint;
  at_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
begin
  -- 10 a minute per member key. Queued per member, so a burst cannot slip past the count.
  perform pg_advisory_xact_lock(hashtextextended('checkin:' || m.member_id::text, 0));
  select count(*) into tries from public.member_checkin_tries
   where member_id = m.member_id and at > now() - interval '1 minute';
  if tries >= 10 then return jsonb_build_object('error', 'TOO_MANY'); end if;
  insert into public.member_checkin_tries(member_id) values (m.member_id);
  delete from public.member_checkin_tries where member_id = m.member_id and what = 'try' and at < now() - interval '10 minutes';
  delete from public.member_checkin_tries where member_id = m.member_id and at < now() - interval '2 days';

  -- The gym's row lock: the same one crm_push takes, so versions never collide.
  select * into g from public.gyms where gym_id = m.gym_id for update;

  if nullif(btrim(coalesce(p_code, '')), '') is not null and upper(btrim(p_code)) <> g.join_code then
    return jsonb_build_object('error', 'OTHER_GYM', 'gymName', g.name);
  end if;

  if nullif(btrim(coalesce(p_phone, '')), '') is not null then
    ph := public._norm_phone(p_phone);
    if ph is null then return jsonb_build_object('error', 'BAD_PHONE'); end if;
    -- Privacy (review, 15 Oct 2026): typing other people's numbers must not become a way to list
    -- who is on the roster. A number different from the one on file may be typed 3 times a day.
    if public._norm_phone(m.phone) is distinct from ph then
      select count(*) into tries from public.member_checkin_tries
       where member_id = m.member_id and what = 'phone' and at > now() - interval '1 day';
      if tries >= 3 then return jsonb_build_object('error', 'TOO_MANY'); end if;
      insert into public.member_checkin_tries(member_id, what) values (m.member_id, 'phone');
    end if;
    update public.gym_members set phone = '+91' || ph where member_id = m.member_id;
  else
    ph := public._norm_phone(m.phone);
    if ph is null then return jsonb_build_object('error', 'NO_PHONE', 'gymName', g.name); end if;
  end if;

  if coalesce(g.crm_version, 0) = 0
     and not exists (select 1 from public.crm_records where gym_id = g.gym_id and kind = 'member') then
    return jsonb_build_object('error', 'GYM_NOT_ONLINE', 'gymName', g.name);
  end if;

  roster := public._checkin_roster_member(g.gym_id, ph);
  if roster.id is null then
    return jsonb_build_object('error', 'NOT_ON_ROSTER', 'gymName', g.name, 'phone', '+91' || ph);
  end if;

  -- Already in today, however it was recorded (desk rows have random ids).
  select r.data into prev from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'visit' and not r.deleted
     and r.data->>'memberId' = roster.id and r.data->>'visitedOn' = day
   order by r.version limit 1;
  if prev is not null then
    return jsonb_build_object('ok', true, 'alreadyIn', true, 'gymName', g.name,
      'memberName', split_part(btrim(coalesce(roster.data->>'fullName', m.name)), ' ', 1), 'day', day,
      'checkedInAt', coalesce((prev->>'checkedInAt')::bigint, at_ms));
  end if;

  vid := roster.id || ':' || day;
  v := coalesce(g.crm_version, 0) + 1;
  insert into public.crm_records(gym_id, kind, id, data, version)
    values (g.gym_id, 'visit', vid,
            jsonb_build_object('id', vid, 'gymId', g.gym_id::text, 'memberId', roster.id,
                               'visitedOn', day, 'checkedInAt', at_ms, 'source', 'app'),
            v)
    on conflict (gym_id, kind, id) do update
      set data = excluded.data, version = v, deleted = false, updated_at = now();
  update public.gyms set crm_version = v where gym_id = g.gym_id;
  update public.gym_members set last_seen = now() where member_id = m.member_id;

  return jsonb_build_object('ok', true, 'alreadyIn', false, 'gymName', g.name,
    'memberName', split_part(btrim(coalesce(roster.data->>'fullName', m.name)), ' ', 1), 'day', day, 'checkedInAt', at_ms);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._checkin_roster_member(uuid, text) from public, anon, authenticated;
revoke all on function public.member_check_in(text, text, text)  from public;
grant execute on function public.member_check_in(text, text, text) to anon, authenticated;

-- The test that ran here on 15 Oct 2026 now lives in supabase/tests/0015_qr_checkin.sql, so this
-- file applies cleanly in the CI database check (scripts/ci/db_checks.sh).
