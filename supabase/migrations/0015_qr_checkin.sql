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

-- ------------------------------------------------------------------ test (changes nothing)
-- Run on its own after the part above. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed.
do $$
declare
  gid uuid; gid2 uuid;
  ka text := 'qr-test-key-a'; kb text := 'qr-test-key-b'; kc text := 'qr-test-key-c';
  kd text := 'qr-test-key-d'; ke text := 'qr-test-key-e'; kz text := 'qr-test-key-z';
  r jsonb; n int; ver bigint; fails text := ''; checks int := 0;
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  i int;
begin
  insert into public.gyms(name, join_code) values ('QR Test Gym', 'QRTST1') returning gym_id into gid;
  insert into public.gyms(name, join_code) values ('QR Other Gym', 'QRTST2') returning gym_id into gid2;
  -- App members: A has a 10-digit number, B none yet, C a number only an ARCHIVED roster row has,
  -- D a number with a leading 0 (roster has 91...), E for the rate limit, Z in the other gym.
  insert into public.gym_members(gym_id, name, phone, key_hash) values
    (gid, 'Asha app', '9829012345', public._hash_key(ka)),
    (gid, 'Bilal app', null, public._hash_key(kb)),
    (gid, 'Chand app', '+91 90000 00001', public._hash_key(kc)),
    (gid, 'Dev app', '09876543210', public._hash_key(kd)),
    (gid, 'Esha app', null, public._hash_key(ke)),
    (gid2, 'Zoya app', '9829012345', public._hash_key(kz));

  -- 1. No records online yet.
  r := public.member_check_in(ka, 'QRTST1');
  checks := checks + 1;
  if r->>'error' is distinct from 'GYM_NOT_ONLINE' then fails := fails || ' 1:' || r::text; end if;

  -- The roster: phones as the panel saves them (E.164) and as typed by hand.
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829012345","archived":false,"createdAt":1}', 1),
    (gid, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"98290 54321","archived":false,"createdAt":2}', 1),
    (gid, 'member', 'm-chand', '{"fullName":"Chand Old","phone":"+919000000001","archived":true,"createdAt":3}', 1),
    (gid, 'member', 'm-dev', '{"fullName":"Dev Rao","phone":"919876543210","archived":false,"createdAt":4}', 1),
    (gid, 'member', 'm-gone', '{"fullName":"Gone","phone":"+919111111111","archived":false,"createdAt":5}', 1);
  update public.crm_records set deleted = true where gym_id = gid and id = 'm-gone';
  -- Dev was already checked in at the desk today (a random id).
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'visit', 'desk-uuid-1', jsonb_build_object('id','desk-uuid-1','gymId',gid::text,'memberId','m-dev',
      'visitedOn', day, 'checkedInAt', 1700000000000, 'source','desk'), 2);
  update public.gyms set crm_version = 2 where gym_id = gid;

  -- 2. Match: app '9829012345' against roster '+919829012345'.
  r := public.member_check_in(ka, 'qrtst1');
  checks := checks + 1;
  if not coalesce((r->>'ok')::boolean, false) or (r->>'alreadyIn')::boolean or r->>'memberName' is distinct from 'Asha'
     or r->>'day' is distinct from day or r->>'gymName' is distinct from 'QR Test Gym' then fails := fails || ' 2:' || r::text; end if;
  select crm_version into ver from public.gyms where gym_id = gid;
  select count(*) into n from public.crm_records
   where gym_id = gid and kind = 'visit' and id = 'm-asha:' || day and version = 3
     and data->>'source' = 'app' and data->>'memberId' = 'm-asha' and data->>'visitedOn' = day and not deleted;
  checks := checks + 1;
  if ver <> 3 or n <> 1 then fails := fails || ' 2b:ver=' || ver || ',rows=' || n; end if;

  -- 3. Twice the same day: alreadyIn, nothing written.
  r := public.member_check_in(ka, 'QRTST1');
  select crm_version into ver from public.gyms where gym_id = gid;
  select count(*) into n from public.crm_records where gym_id = gid and kind = 'visit' and data->>'memberId' = 'm-asha';
  checks := checks + 1;
  if not coalesce((r->>'alreadyIn')::boolean, false) or ver <> 3 or n <> 1 then fails := fails || ' 3:' || r::text; end if;

  -- 4. Desk already checked Dev in (different id); '09876543210' against '919876543210'.
  r := public.member_check_in(kd, null);
  select count(*) into n from public.crm_records where gym_id = gid and kind = 'visit' and data->>'memberId' = 'm-dev';
  checks := checks + 1;
  if not coalesce((r->>'alreadyIn')::boolean, false) or (r->>'checkedInAt')::bigint is distinct from 1700000000000 or n <> 1 then
    fails := fails || ' 4:' || r::text; end if;

  -- 5. No number yet, then a badly typed one, then '+91 98290-54321' against '98290 54321'.
  r := public.member_check_in(kb, 'QRTST1');
  checks := checks + 1;
  if r->>'error' is distinct from 'NO_PHONE' then fails := fails || ' 5a:' || r::text; end if;
  r := public.member_check_in(kb, 'QRTST1', '12345');
  checks := checks + 1;
  if r->>'error' is distinct from 'BAD_PHONE' then fails := fails || ' 5b:' || r::text; end if;
  r := public.member_check_in(kb, 'QRTST1', '+91 98290-54321');
  checks := checks + 1;
  if not coalesce((r->>'ok')::boolean, false) or r->>'memberName' is distinct from 'Bilal' then fails := fails || ' 5c:' || r::text; end if;
  select count(*) into n from public.gym_members where key_hash = public._hash_key(kb) and phone = '+919829054321';
  checks := checks + 1;
  if n <> 1 then fails := fails || ' 5d:phone not kept'; end if;

  -- 6. No match: only an ARCHIVED roster row has Chand's number.
  r := public.member_check_in(kc, 'QRTST1');
  checks := checks + 1;
  if r->>'error' is distinct from 'NOT_ON_ROSTER' or r->>'phone' is distinct from '+919000000001' then fails := fails || ' 6:' || r::text; end if;
  -- ... and a DELETED roster row does not count either.
  r := public.member_check_in(kc, 'QRTST1', '9111111111');
  checks := checks + 1;
  if r->>'error' is distinct from 'NOT_ON_ROSTER' then fails := fails || ' 6b:' || r::text; end if;

  -- 7. The other gym's poster.
  r := public.member_check_in(ka, 'QRTST2');
  checks := checks + 1;
  if r->>'error' is distinct from 'OTHER_GYM' then fails := fails || ' 7:' || r::text; end if;

  -- 8. The same number in another gym never reaches this gym's roster (Zoya's gym is not online).
  r := public.member_check_in(kz, 'QRTST2');
  checks := checks + 1;
  if r->>'error' is distinct from 'GYM_NOT_ONLINE' then fails := fails || ' 8:' || r::text; end if;

  -- 9. Undo at the desk, then scan again: the row comes back.
  update public.crm_records set deleted = true where gym_id = gid and kind = 'visit' and id = 'm-asha:' || day;
  r := public.member_check_in(ka, 'QRTST1');
  select count(*) into n from public.crm_records where gym_id = gid and kind = 'visit' and id = 'm-asha:' || day and not deleted;
  checks := checks + 1;
  if (r->>'alreadyIn')::boolean is distinct from false or n <> 1 then fails := fails || ' 9:' || r::text; end if;

  -- 10. A key nobody has.
  begin
    r := public.member_check_in('no-such-key', 'QRTST1');
    fails := fails || ' 10:no BAD_KEY';
  exception when others then
    if sqlerrm <> 'BAD_KEY' then fails := fails || ' 10:' || sqlerrm; end if;
  end;
  checks := checks + 1;

  -- 11. Rate limit: the 11th call in a minute is refused.
  for i in 1..10 loop r := public.member_check_in(ke, 'QRTST1'); end loop;
  r := public.member_check_in(ke, 'QRTST1');
  checks := checks + 1;
  if r->>'error' is distinct from 'TOO_MANY' then fails := fails || ' 11:' || r::text; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
