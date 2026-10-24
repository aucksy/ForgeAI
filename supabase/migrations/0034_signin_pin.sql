-- APPLIED LIVE 24 Oct 2026 (owner: "yes apply 0034"); live tests 0034 PASS 68, security PASS 9.
--
-- 0034: a lasting 6-digit PIN for every person who signs in to a gym's admin app (R-117, 24 Oct
-- 2026). The owner's words: "When I create a new gym ... later I have no code to sign in." Until
-- now the only way in was a ONE-TIME code (30 minutes) the owner makes (0010). Now each person
-- (owner or staff) may keep their OWN PIN and sign in with mobile number + PIN, every time. The
-- one-time codes keep working exactly as before (first sign-in for staff, a new phone, recovery,
-- HQ's reset). Additive and re-runnable. Apply after 0033 (it replaces 0033's gym_create_online).
-- Test: supabase/tests/0034_signin_pin.sql (CI runs it after every migration; pasted into the SQL
-- Editor it always ends in an error and so changes nothing).
--
-- STORED: gym_staff_pins, one row per person who set a PIN: a slow salted hash (pgcrypto bcrypt,
--   crypt(pin, gen_salt('bf', 10)); the 0010 code hash is a fast sha256, too weak for a secret that
--   lasts), when it was set, and the wrong-try count and lock. Never returned by any function; the
--   apps only ever see "hasPin". RLS on, no grants to anon or authenticated.
-- PIN RULES (_pin_problem, the same rules as the admin app's signin.ts pinProblem): exactly 6
--   digits (BAD_PIN); not one digit six times (111111), not a straight run up or down (123456,
--   654321, 012345, 987654 ...), not the last 6 digits of the person's own mobile (WEAK_PIN).
-- SIGNING IN (staff_sign_in, same arguments and answers as 0018 plus 'via' and 'hasPin'): the one
--   box takes a PIN or a code. The server tries the person's PIN first, then a waiting one-time
--   code. Every throttle of 0018 stays (5 wrong tries per caller per mobile in 15 minutes; a code
--   is void after 10 wrong tries). NEW: every wrong try (PIN or code) also counts against every PIN
--   of that mobile; the 5th wrong try in a row LOCKS that PIN for 15 minutes (the answer is then
--   TOO_MANY_TRIES with lockedUntil). A correct sign-in (PIN or code) clears that person's count
--   and lock. The lock stops the PIN only: a one-time code still works while a PIN is locked
--   (codes "keep working exactly as today", and an owner or HQ can always let a person in).
--   gym_sessions.via records how a device signed in ('pin' or 'code'; null for the other doors).
-- SETTING A PIN (staff_set_pin): only your own, with your session key. A person with no PIN sets
--   one at once (their session proves who they are). CHANGING an existing PIN needs the current
--   PIN, OR this device signed in with a one-time code in the last 15 minutes (the "forgot my PIN"
--   way: ask the owner, or HQ, for a code). Why not "any signed-in device": a desk tablet stays
--   signed in for weeks, and whoever picks it up must not be able to replace the owner's PIN and
--   keep the gym. A wrong current PIN counts as a wrong try (so this is no way round the lock).
--   An OWNER's PIN is set on every owner row of theirs in the business (0031 branches: one person,
--   one PIN). Desk staff are per branch, as before.
-- CLEARING A PIN: "Sign out everywhere" (owner_sign_out_person, 0031's version) now also clears the
--   PIN of the person signed out (for an owner: in every branch), so it really locks the old holder
--   out; they come back with a new code and set a new PIN. HQ's hq_reset_owner_signin (0027) clears
--   the owner's PIN before it makes the code. A removed person's PIN is deleted by a trigger the
--   moment they are removed (any path: owner_remove_person, branches, HQ).
-- GYM ISOLATION: every function acts only on the caller's own person (staff_set_pin,
--   staff_pin_status) or on a person of the key's own gym / business (owner_people,
--   owner_sign_out_person), exactly like 0010/0031.
--
-- NEW: gym_staff_pins; gym_sessions.via; _pin_problem(pin, phone); _staff_pin_forget() trigger;
--   staff_set_pin(key, pin, current) -> {ok, hasPin, setAt} or {error: NO_PERSON | BAD_PIN |
--   WEAK_PIN | NEED_CURRENT | WRONG_PIN (+triesLeft) | TOO_MANY_TRIES (+lockedUntil)};
--   staff_pin_status(key) -> {canSet, hasPin, setAt, needsCurrent, lockedUntil}.
-- CHANGES (create or replace, same arguments): staff_sign_in (0018), owner_people (0018: + hasPin,
--   pinLockedUntil), owner_sign_out_person (0031: + clears the PIN), hq_reset_owner_signin (0027:
--   + clears the PIN). gym_create_online (0033) gains p_pin (default null; the 5-argument version
--   is dropped so PostgREST has one function to pick; an older admin app that sends no PIN makes a
--   gym exactly as before). RE-RUNNING 0018, 0027, 0031 or 0033 puts back their own versions:
--   always re-run 0034 after them.

set lock_timeout = '3s';

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_staff_pins (
  staff_id     uuid primary key references public.gym_staff(staff_id) on delete cascade,
  pin_hash     text not null,
  set_at       timestamptz not null default now(),
  wrong_tries  int not null default 0,
  locked_until timestamptz
);
alter table public.gym_staff_pins enable row level security;
revoke all on public.gym_staff_pins from anon, authenticated;

alter table public.gym_sessions add column if not exists via text;

-- ------------------------------------------------------------------ helpers (no grants)
-- 'BAD_PIN' (not exactly 6 digits), 'WEAK_PIN' (easy to guess), or null (fine). The admin app
-- checks the same rules first (auth/signin.ts pinProblem) with fuller words.
create or replace function public._pin_problem(p_pin text, p_phone text) returns text
  language plpgsql immutable set search_path = public as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then return 'BAD_PIN'; end if;
  if p_pin ~ '^(.)\1{5}$' then return 'WEAK_PIN'; end if;
  if position(p_pin in '0123456789') > 0 or position(p_pin in '9876543210') > 0 then return 'WEAK_PIN'; end if;
  if p_phone is not null and p_pin = right(p_phone, 6) then return 'WEAK_PIN'; end if;
  return null;
end $$;

-- A removed person's PIN dies with them, whichever way they were removed.
create or replace function public._staff_pin_forget() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.gym_staff_pins where staff_id = new.staff_id;
  return new;
end $$;

drop trigger if exists gym_staff_pin_forget on public.gym_staff;
create trigger gym_staff_pin_forget after update of removed_at on public.gym_staff
  for each row when (old.removed_at is null and new.removed_at is not null)
  execute function public._staff_pin_forget();

-- The person and every owner row of theirs in the business (an owner's PIN is one PIN in every
-- branch, 0031); a desk person is just themselves.
create or replace function public._pin_people(st public.gym_staff) returns uuid[]
  language sql stable security definer set search_path = public as $$
  select case when st.role = 'owner' then
           array(select s.staff_id from public.gym_staff s
                  where s.role = 'owner' and s.phone = st.phone and s.removed_at is null
                    and s.gym_id = any(public._branch_ids(st.gym_id)))
              || array[st.staff_id]
         else array[st.staff_id] end
$$;

-- ------------------------------------------------------------------ Create my gym (0033, plus the PIN)
drop function if exists public.gym_create_online(text, text, text, text, text);
create or replace function public.gym_create_online(p_gym_name text, p_name text, p_phone text, p_device text default null,
                                                    p_terms_version text default null, p_pin text default null)
  returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare g public.gyms; st public.gym_staff; ph text := public._norm_phone(p_phone); n int; v_ip text := public._caller_ip();
  tv text := case when nullif(btrim(coalesce(p_terms_version, '')), '') is null then null else public._terms_version(p_terms_version) end;
  pin text := nullif(btrim(coalesce(p_pin, '')), ''); bad text;
begin
  if ph is null then raise exception 'BAD_PHONE'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 or length(btrim(coalesce(p_gym_name, ''))) = 0 then raise exception 'EMPTY'; end if;
  -- 0034: a PIN that is sent must be a good one (checked before anything is made).
  if pin is not null then
    bad := public._pin_problem(pin, ph);
    if bad is not null then raise exception '%', bad; end if;
  end if;
  if v_ip <> '' then
    select count(*) into n from public.gym_creator_ips where ip = v_ip and created_at > now() - interval '1 hour';
    if n >= 5 then raise exception 'BUSY'; end if;
  end if;
  select count(*) into n from public.gyms where created_at > now() - interval '1 hour';
  if n >= 1000 then raise exception 'BUSY'; end if;
  insert into public.gyms(name, join_code, creator_ip)
    values (left(btrim(p_gym_name), 60), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), nullif(v_ip, ''))
    returning * into g;
  insert into public.gym_staff(gym_id, name, phone, role)
    values (g.gym_id, left(btrim(p_name), 60), ph, 'owner') returning * into st;
  if tv is not null then perform public._record_terms(g.gym_id, st, tv, 'create'); end if;
  if pin is not null then
    insert into public.gym_staff_pins(staff_id, pin_hash) values (st.staff_id, crypt(pin, gen_salt('bf', 10)));
  end if;
  return public._signed_in_json(st, public._new_session(st.staff_id, p_device))
         || jsonb_build_object('termsVersion', tv, 'hasPin', pin is not null);
end $$;

-- ------------------------------------------------------------------ signing in (0018, plus the PIN)
-- Mobile + PIN or code -> a session. Never raises for a wrong try (the counts must be kept).
-- Errors: BAD_PHONE; TOO_MANY_TRIES (this caller: 5 wrong tries for the mobile in 15 minutes; or
-- every PIN of this mobile is locked: with lockedUntil); WRONG_CODE with triesLeft (also when
-- nothing is waiting: one answer for all). Success adds via ('pin' | 'code') and hasPin.
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
             locked_until = case when p.wrong_tries + 1 >= 5 then now() + interval '15 minutes' else null end
        from public.gym_staff s
       where s.staff_id = p.staff_id and s.phone = ph and s.removed_at is null
         and (p.locked_until is null or p.locked_until <= now())
      returning case when p.locked_until is not null then 0 else 5 - p.wrong_tries end as left_tries)
    select min(left_tries) into pin_left from tried;
    -- Every PIN of this mobile was already locked: say so (no PIN can be right for 15 minutes).
    if pin_left is null and locked_before > 0 then
      return jsonb_build_object('error', 'TOO_MANY_TRIES', 'lockedUntil', v_until);
    end if;
    return jsonb_build_object('error', 'WRONG_CODE', 'triesLeft', greatest(0, least(4 - mine, coalesce(pin_left, 4 - mine))));
  end if;

  select * into st from public.gym_staff where staff_id = sid;
  delete from public.gym_signin_fails where staff_id = st.staff_id;
  -- 0034: a correct sign-in clears this person's PIN tries and lock.
  update public.gym_staff_pins set wrong_tries = 0, locked_until = null where staff_id = st.staff_id;
  k := public._new_session(st.staff_id, p_device);
  update public.gym_sessions set via = v_via where key_hash = public._hash_key(k);
  return public._signed_in_json(st, k)
         || jsonb_build_object('via', v_via,
                               'hasPin', exists (select 1 from public.gym_staff_pins where staff_id = st.staff_id));
end $$;

-- ------------------------------------------------------------------ your own PIN
-- This device signed in with a one-time code in the last 15 minutes.
create or replace function public._fresh_code_session(p_key text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.gym_sessions
                  where key_hash = public._hash_key(p_key) and ended_at is null
                    and via = 'code' and created_at > now() - interval '15 minutes')
$$;

-- Set or change YOUR OWN PIN. Errors come back as {error} (a wrong current PIN must be counted,
-- so it may not raise): NO_PERSON (an old owner key: no person to give a PIN), BAD_PIN, WEAK_PIN,
-- NEED_CURRENT, WRONG_PIN (+triesLeft), TOO_MANY_TRIES (+lockedUntil). BAD_KEY is raised.
create or replace function public.staff_set_pin(p_key text, p_pin text, p_current text default null)
  returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key); bad text; p public.gym_staff_pins;
  cur text := regexp_replace(coalesce(p_current, ''), '[^0-9]', '', 'g'); h text; left_tries int; at_ timestamptz := now();
begin
  if st.staff_id is null or st.gym_id is distinct from g then return jsonb_build_object('error', 'NO_PERSON'); end if;
  perform pg_advisory_xact_lock(hashtext('signin:' || st.phone));
  bad := public._pin_problem(p_pin, st.phone);
  if bad is not null then return jsonb_build_object('error', bad); end if;

  select * into p from public.gym_staff_pins where staff_id = st.staff_id for update;
  if p.staff_id is not null and not public._fresh_code_session(p_key) then
    if p.locked_until > now() then
      return jsonb_build_object('error', 'TOO_MANY_TRIES', 'lockedUntil', p.locked_until);
    end if;
    if cur = '' then return jsonb_build_object('error', 'NEED_CURRENT'); end if;
    if p.pin_hash <> crypt(cur, p.pin_hash) then
      update public.gym_staff_pins x
         set wrong_tries  = case when x.wrong_tries + 1 >= 5 then 0 else x.wrong_tries + 1 end,
             locked_until = case when x.wrong_tries + 1 >= 5 then now() + interval '15 minutes' else null end
       where x.staff_id = st.staff_id
      returning case when x.locked_until is not null then 0 else 5 - x.wrong_tries end into left_tries;
      return jsonb_build_object('error', 'WRONG_PIN', 'triesLeft', left_tries);
    end if;
  end if;

  h := crypt(p_pin, gen_salt('bf', 10));
  insert into public.gym_staff_pins(staff_id, pin_hash, set_at)
    select distinct u, h, at_ from unnest(public._pin_people(st)) u
  on conflict (staff_id) do update
    set pin_hash = excluded.pin_hash, set_at = excluded.set_at, wrong_tries = 0, locked_until = null;
  return jsonb_build_object('ok', true, 'hasPin', true, 'setAt', at_);
end $$;

-- Does this device's person have a PIN, and does changing it need the current one? Never the PIN.
create or replace function public.staff_pin_status(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key); p public.gym_staff_pins;
begin
  if st.staff_id is null or st.gym_id is distinct from g then
    return jsonb_build_object('canSet', false, 'hasPin', false, 'setAt', null, 'needsCurrent', false, 'lockedUntil', null);
  end if;
  select * into p from public.gym_staff_pins where staff_id = st.staff_id;
  return jsonb_build_object(
    'canSet', true,
    'hasPin', p.staff_id is not null,
    'setAt', p.set_at,
    'needsCurrent', p.staff_id is not null and not public._fresh_code_session(p_key),
    'lockedUntil', case when p.locked_until > now() then p.locked_until end);
end $$;

-- ------------------------------------------------------------------ people (0018, plus the PIN)
create or replace function public.owner_people(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key); me uuid := (public._staff(p_key)).staff_id;
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'staffId', s.staff_id, 'name', s.name, 'phone', s.phone, 'role', s.role,
             'createdAt', s.created_at, 'me', s.staff_id = me,
             'devices', (select count(*) from public.gym_sessions x where x.staff_id = s.staff_id and x.ended_at is null),
             'lastSeenAt', (select max(x.last_seen_at) from public.gym_sessions x where x.staff_id = s.staff_id),
             'codeUntil', (select max(c.expires_at) from public.gym_signin_codes c
                            where c.staff_id = s.staff_id and c.used_at is null and c.expires_at > now()
                              and c.wrong_tries < 10),
             'hasPin', exists (select 1 from public.gym_staff_pins p where p.staff_id = s.staff_id),
             'pinLockedUntil', (select p.locked_until from public.gym_staff_pins p
                                 where p.staff_id = s.staff_id and p.locked_until > now()))
           order by (s.role = 'owner') desc, s.created_at)
      from public.gym_staff s where s.gym_id = g and s.removed_at is null), '[]'::jsonb);
end $$;

-- 0031's owner_sign_out_person, plus: the PIN of the person signed out is cleared (an owner's in
-- every branch), so whoever knew it is locked out too. They come back with a new code.
create or replace function public.owner_sign_out_person(p_key text, p_staff uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key); st public.gym_staff;
begin
  perform public._branch_lock(g);
  select * into st from public.gym_staff where staff_id = p_staff and gym_id = g and removed_at is null;
  if st.staff_id is null then raise exception 'GONE'; end if;
  update public.gym_sessions x set ended_at = now()
    from public.gym_staff s
   where x.staff_id = s.staff_id and x.ended_at is null and x.key_hash <> public._hash_key(p_key)
     and (s.staff_id = st.staff_id
          or (st.role = 'owner' and s.role = 'owner' and s.phone = st.phone and s.removed_at is null
              and s.gym_id = any(public._branch_ids(g))));
  delete from public.gym_staff_pins where staff_id = any(public._pin_people(st));
end $$;

-- ------------------------------------------------------------------ HQ (0027, plus the PIN)
-- A new sign-in code for the gym's owner, only after HQ ticks "I called the gym's own number and the
-- owner confirmed". 0034: the owner's PIN is cleared first (in every branch), so whoever knew it is
-- locked out; the owner signs in with this code and sets a new PIN. Errors: CONFIRM_CALL, GONE,
-- PICK_OWNER, TOO_MANY (5 an hour).
create or replace function public.hq_reset_owner_signin(p_actor text, p_gym uuid, p_staff uuid default null, p_called boolean default false)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare st public.gym_staff; n int; code jsonb;
begin
  perform public._hq_guard();
  if p_called is not true then raise exception 'CONFIRM_CALL'; end if;
  perform 1 from public.gyms where gym_id = p_gym for update;
  if not found then raise exception 'GONE'; end if;
  select count(*) into n from public.gym_staff
   where gym_id = p_gym and role = 'owner' and removed_at is null and (p_staff is null or staff_id = p_staff);
  if n = 0 then raise exception 'GONE'; end if;
  if n > 1 then raise exception 'PICK_OWNER'; end if;
  select count(*) into n from public.hq_audit
   where gym_id = p_gym and action = 'reset_owner_signin' and at > now() - interval '1 hour';
  if n >= 5 then raise exception 'TOO_MANY'; end if;
  select * into st from public.gym_staff
   where gym_id = p_gym and role = 'owner' and removed_at is null and (p_staff is null or staff_id = p_staff);
  delete from public.gym_staff_pins where staff_id = any(public._pin_people(st));
  code := public._make_code(st.staff_id);
  perform public._hq_log(p_actor, 'reset_owner_signin', p_gym, 'called the gym and the owner confirmed',
    jsonb_build_object('ownerPhoneEnds', right(st.phone, 4)));
  return jsonb_build_object('name', st.name, 'phone', st.phone, 'code', code->>'code', 'expiresAt', code->'expiresAt');
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._pin_problem(text, text)                    from public, anon, authenticated;
revoke all on function public._staff_pin_forget()                         from public, anon, authenticated;
revoke all on function public._pin_people(public.gym_staff)               from public, anon, authenticated;
revoke all on function public._fresh_code_session(text)                   from public, anon, authenticated;
revoke all on function public.hq_reset_owner_signin(text, uuid, uuid, boolean) from public, anon, authenticated;

revoke all on function public.gym_create_online(text, text, text, text, text, text) from public;
revoke all on function public.staff_sign_in(text, text, text)             from public;
revoke all on function public.staff_set_pin(text, text, text)             from public;
revoke all on function public.staff_pin_status(text)                      from public;
revoke all on function public.owner_people(text)                          from public;
revoke all on function public.owner_sign_out_person(text, uuid)           from public;

grant execute on function public.gym_create_online(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.staff_sign_in(text, text, text)          to anon, authenticated;
grant execute on function public.staff_set_pin(text, text, text)          to anon, authenticated;
grant execute on function public.staff_pin_status(text)                   to anon, authenticated;
grant execute on function public.owner_people(text)                       to anon, authenticated;
grant execute on function public.owner_sign_out_person(text, uuid)        to anon, authenticated;
grant execute on function public.hq_reset_owner_signin(text, uuid, uuid, boolean) to service_role;

notify pgrst, 'reload schema';
