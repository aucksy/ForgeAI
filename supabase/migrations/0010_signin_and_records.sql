-- 0010: the gym's records online, and sign-in by mobile number + a code the OWNER makes
-- (14 Oct 2026; Gym Panel for Jaipur owners, step 1).
--
-- WHO CAN OPEN A GYM'S PANEL
--   Before: one OWNER KEY per gym (0002), held by one browser. Lose the browser, lose the gym.
--   Now: PEOPLE (gym_staff: name, Indian mobile, role) sign in with their mobile number and a
--   6-digit code. Until a real SMS/WhatsApp OTP service is wired in, the code is MADE BY THE GYM'S
--   OWNER in the panel (Settings -> Staff & sign-in) and handed over in person or on WhatsApp.
--   A sign-in returns a SESSION KEY (random; only its hash is stored). _owner_gym() now accepts a
--   session key as well as an old owner key, so every owner_* function before this one works
--   unchanged for a signed-in person.
--   Only role 'owner' (or an old owner key) may add or remove people and make codes (OWNER_ONLY).
--   Codes: 6 digits, one use, 30 minutes, 5 wrong tries burn it; 5 wrong tries for one mobile in
--   15 minutes stop that mobile for the rest of the window (TOO_MANY_TRIES). A failed sign-in
--   RETURNS {error} rather than raising, so the count of wrong tries is kept (a raise would roll
--   it back).
--   Lost every device: support makes a code in the SQL editor (support_make_signin_code — no grant
--   to anon or authenticated).
--
-- THE GYM'S RECORDS
--   crm_records keeps every member, plan, membership, payment and visit (and the gym's own details)
--   as one JSON row each, keyed (gym, kind, id). The panel keeps the whole gym in memory (it always
--   did) and pushes only the rows an action changed. Every push names the version it was built on;
--   gyms.crm_version moves by one per push under the gym's row lock, and a push built on an older
--   version is refused (STALE): the panel pulls what changed and does the action again. That keeps
--   receipt numbers unique and stops two desks adding the same mobile twice.
--   crm_pull returns only rows newer than the version the panel already has.
--
-- Apply: Supabase SQL editor, after 0009. Re-runnable.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_staff (
  staff_id   uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  phone      text not null check (phone ~ '^[6-9][0-9]{9}$'),
  role       text not null default 'staff' check (role in ('owner','staff')),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create unique index if not exists gym_staff_phone_live on public.gym_staff(gym_id, phone) where removed_at is null;
create index if not exists gym_staff_by_phone on public.gym_staff(phone) where removed_at is null;

create table if not exists public.gym_signin_codes (
  code_id     uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.gym_staff(staff_id) on delete cascade,
  code_hash   bytea not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  wrong_tries int not null default 0
);
create index if not exists gym_signin_codes_staff on public.gym_signin_codes(staff_id);

create table if not exists public.gym_sessions (
  session_id   uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references public.gym_staff(staff_id) on delete cascade,
  key_hash     bytea not null unique,
  device       text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at     timestamptz
);
create index if not exists gym_sessions_staff on public.gym_sessions(staff_id);

create table if not exists public.gym_signin_fails (
  phone text not null,
  at    timestamptz not null default now()
);
create index if not exists gym_signin_fails_phone on public.gym_signin_fails(phone, at);

alter table public.gyms add column if not exists crm_version bigint not null default 0;

create table if not exists public.crm_records (
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  kind       text not null check (kind in ('gym','member','plan','membership','payment','visit')),
  id         text not null check (length(id) between 1 and 64),
  data       jsonb not null,
  version    bigint not null,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (gym_id, kind, id)
);
create index if not exists crm_records_version on public.crm_records(gym_id, version);

alter table public.gym_staff        enable row level security;
alter table public.gym_signin_codes enable row level security;
alter table public.gym_sessions     enable row level security;
alter table public.gym_signin_fails enable row level security;
alter table public.crm_records      enable row level security;
revoke all on public.gym_staff, public.gym_signin_codes, public.gym_sessions, public.gym_signin_fails,
  public.crm_records from anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
-- An Indian mobile as 10 digits, or null. Takes "+91 98290 12345", "098290-12345", "9829012345".
create or replace function public._norm_phone(p text) returns text
  language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if length(d) = 12 and left(d, 2) = '91' then d := right(d, 10); end if;
  if length(d) = 11 and left(d, 1) = '0' then d := right(d, 10); end if;
  if d ~ '^[6-9][0-9]{9}$' then return d; end if;
  return null;
end $$;

-- The person a session key belongs to (all fields null when it is not a live session).
create or replace function public._staff(p_key text) returns public.gym_staff
  language plpgsql stable security definer set search_path = public as $$
declare st public.gym_staff;
begin
  select s.* into st
    from public.gym_sessions x join public.gym_staff s on s.staff_id = x.staff_id
   where x.key_hash = public._hash_key(p_key) and x.ended_at is null and s.removed_at is null;
  return st;
end $$;

-- The gym an OWNER KEY or a live SESSION KEY opens; BAD_KEY otherwise. Every owner_* function
-- goes through this, so a signed-in person can do what the old owner key could.
create or replace function public._owner_gym(p_key text) returns uuid
  language plpgsql stable security definer set search_path = public as $$
declare g uuid;
begin
  select gym_id into g from public.gym_owner_keys where key_hash = public._hash_key(p_key);
  if g is null then
    select s.gym_id into g
      from public.gym_sessions x join public.gym_staff s on s.staff_id = x.staff_id
     where x.key_hash = public._hash_key(p_key) and x.ended_at is null and s.removed_at is null;
  end if;
  if g is null then raise exception 'BAD_KEY'; end if;
  return g;
end $$;

-- People management: an old owner key, or a session of a person whose role is 'owner'.
create or replace function public._people_admin(p_key text) returns uuid
  language plpgsql stable security definer set search_path = public as $$
declare g uuid; st public.gym_staff;
begin
  select gym_id into g from public.gym_owner_keys where key_hash = public._hash_key(p_key);
  if g is not null then return g; end if;
  st := public._staff(p_key);
  if st.staff_id is null then raise exception 'BAD_KEY'; end if;
  if st.role <> 'owner' then raise exception 'OWNER_ONLY'; end if;
  return st.gym_id;
end $$;

-- A new session for a person; keeps at most 10 live devices each (the oldest are signed out).
create or replace function public._new_session(p_staff uuid, p_device text) returns text
  language plpgsql volatile security definer set search_path = public, extensions as $$
declare k text := public._new_key();
begin
  insert into public.gym_sessions(staff_id, key_hash, device)
    values (p_staff, public._hash_key(k), left(nullif(btrim(coalesce(p_device, '')), ''), 80));
  update public.gym_sessions set ended_at = now()
   where session_id in (select session_id from public.gym_sessions
                         where staff_id = p_staff and ended_at is null
                         order by created_at desc offset 10);
  return k;
end $$;

create or replace function public._person_json(st public.gym_staff) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object('staffId', st.staff_id, 'name', st.name, 'phone', st.phone, 'role', st.role)
$$;

create or replace function public._signed_in_json(st public.gym_staff, k text) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object('gymId', g.gym_id, 'name', g.name, 'joinCode', g.join_code,
                            'sessionKey', k, 'person', public._person_json(st))
    from public.gyms g where g.gym_id = st.gym_id
$$;

-- A 6-digit code from the secure random source, as text with leading zeros.
create or replace function public._six_digits() returns text
  language sql volatile set search_path = public, extensions as $$
  select lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0')
$$;

create or replace function public._code_hash(p_code_id uuid, p_code text) returns bytea
  language sql immutable set search_path = public as $$
  select public._hash_key(p_code_id::text || ':' || regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g'))
$$;

-- Make (or remake) a person's sign-in code. Any older unused code for them stops working.
create or replace function public._make_code(p_staff uuid) returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare c text := public._six_digits(); id uuid := gen_random_uuid(); until timestamptz := now() + interval '30 minutes';
begin
  delete from public.gym_signin_codes where staff_id = p_staff and used_at is null;
  insert into public.gym_signin_codes(code_id, staff_id, code_hash, expires_at)
    values (id, p_staff, public._code_hash(id, c), until);
  return jsonb_build_object('staffId', p_staff, 'code', c, 'expiresAt', until);
end $$;

-- ------------------------------------------------------------------ starting a gym online
-- A brand new gym, online from the first minute, with the person creating it as its owner (and
-- signed in on this device). No sample shop: a real gym's members must never see made-up products.
create or replace function public.gym_create_online(p_gym_name text, p_name text, p_phone text, p_device text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gyms; st public.gym_staff; ph text := public._norm_phone(p_phone); n int;
begin
  if ph is null then raise exception 'BAD_PHONE'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 or length(btrim(coalesce(p_gym_name, ''))) = 0 then raise exception 'EMPTY'; end if;
  select count(*) into n from public.gyms where created_at > now() - interval '1 hour';
  if n >= 300 then raise exception 'BUSY'; end if;
  insert into public.gyms(name, join_code)
    values (left(btrim(p_gym_name), 60), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)))
    returning * into g;
  insert into public.gym_staff(gym_id, name, phone, role)
    values (g.gym_id, left(btrim(p_name), 60), ph, 'owner') returning * into st;
  return public._signed_in_json(st, public._new_session(st.staff_id, p_device));
end $$;

-- An existing cloud gym (made by "Start demo" or "Turn on the member app", held by an OWNER KEY)
-- gets its owner as a person, signed in on this device. Safe to repeat: the same mobile as an
-- owner of this gym just gets a new session. The old owner key keeps working (this browser
-- forgets it), so a reply lost on the way can never lock the gym.
create or replace function public.owner_go_online(p_key text, p_name text, p_phone text, p_device text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid; st public.gym_staff; ph text := public._norm_phone(p_phone);
begin
  select gym_id into g from public.gym_owner_keys where key_hash = public._hash_key(p_key);
  if g is null then raise exception 'BAD_KEY'; end if;
  if ph is null then raise exception 'BAD_PHONE'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'EMPTY'; end if;
  perform 1 from public.gyms where gym_id = g for update;
  select * into st from public.gym_staff where gym_id = g and phone = ph and removed_at is null;
  if st.staff_id is null then
    insert into public.gym_staff(gym_id, name, phone, role)
      values (g, left(btrim(p_name), 60), ph, 'owner') returning * into st;
  elsif st.role <> 'owner' then
    raise exception 'PHONE_TAKEN';
  end if;
  return public._signed_in_json(st, public._new_session(st.staff_id, p_device));
end $$;

-- ------------------------------------------------------------------ signing in and out
-- Mobile + code -> a session. Never raises for a wrong code: returns {error} so the wrong-try
-- counts are kept. Errors: BAD_PHONE, TOO_MANY_TRIES, NO_CODE (none waiting for this mobile),
-- WRONG_CODE (with triesLeft).
create or replace function public.staff_sign_in(p_phone text, p_code text, p_device text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare ph text := public._norm_phone(p_phone); n int; cid uuid; st public.gym_staff; live int;
begin
  if ph is null then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  delete from public.gym_signin_fails where at < now() - interval '1 day';
  select count(*) into n from public.gym_signin_fails where phone = ph and at > now() - interval '15 minutes';
  if n >= 5 then return jsonb_build_object('error', 'TOO_MANY_TRIES'); end if;

  select x.code_id into cid
    from public.gym_signin_codes x join public.gym_staff s on s.staff_id = x.staff_id
   where s.phone = ph and s.removed_at is null and x.used_at is null and x.expires_at > now()
     and x.wrong_tries < 5 and x.code_hash = public._code_hash(x.code_id, p_code)
   limit 1 for update of x;

  if cid is null then
    select count(*) into live
      from public.gym_signin_codes x join public.gym_staff s on s.staff_id = x.staff_id
     where s.phone = ph and s.removed_at is null and x.used_at is null and x.expires_at > now() and x.wrong_tries < 5;
    if live = 0 then return jsonb_build_object('error', 'NO_CODE'); end if;
    insert into public.gym_signin_fails(phone) values (ph);
    update public.gym_signin_codes x set wrong_tries = x.wrong_tries + 1
      from public.gym_staff s
     where s.staff_id = x.staff_id and s.phone = ph and x.used_at is null and x.expires_at > now();
    return jsonb_build_object('error', 'WRONG_CODE', 'triesLeft', greatest(0, 4 - n));
  end if;

  update public.gym_signin_codes set used_at = now() where code_id = cid;
  select s.* into st from public.gym_signin_codes x join public.gym_staff s on s.staff_id = x.staff_id where x.code_id = cid;
  return public._signed_in_json(st, public._new_session(st.staff_id, p_device));
end $$;

-- Who this key is: the person (null for an old owner key) and the gym. Also marks the device seen.
create or replace function public.staff_me(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key); gr public.gyms;
begin
  update public.gym_sessions set last_seen_at = now()
   where key_hash = public._hash_key(p_key) and ended_at is null and last_seen_at < now() - interval '5 minutes';
  select * into gr from public.gyms where gym_id = g;
  return jsonb_build_object('gymId', gr.gym_id, 'name', gr.name, 'joinCode', gr.join_code,
    'person', case when st.staff_id is null then null else public._person_json(st) end);
end $$;

-- Sign this device out. Quiet when the key is already dead.
create or replace function public.staff_sign_out(p_key text)
  returns void language sql security definer set search_path = public as $$
  update public.gym_sessions set ended_at = now() where key_hash = public._hash_key(p_key) and ended_at is null
$$;

-- ------------------------------------------------------------------ people (owner only)
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
                            where c.staff_id = s.staff_id and c.used_at is null and c.expires_at > now() and c.wrong_tries < 5))
           order by (s.role = 'owner') desc, s.created_at)
      from public.gym_staff s where s.gym_id = g and s.removed_at is null), '[]'::jsonb);
end $$;

-- Add a person who may sign in. Errors: BAD_PHONE, EMPTY, BAD_ROLE, PHONE_TAKEN, TOO_MANY (30).
create or replace function public.owner_add_person(p_key text, p_name text, p_phone text, p_role text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key); ph text := public._norm_phone(p_phone); st public.gym_staff; n int;
begin
  if ph is null then raise exception 'BAD_PHONE'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'EMPTY'; end if;
  if p_role not in ('owner', 'staff') then raise exception 'BAD_ROLE'; end if;
  perform 1 from public.gyms where gym_id = g for update;
  if exists (select 1 from public.gym_staff where gym_id = g and phone = ph and removed_at is null) then
    raise exception 'PHONE_TAKEN';
  end if;
  select count(*) into n from public.gym_staff where gym_id = g and removed_at is null;
  if n >= 30 then raise exception 'TOO_MANY'; end if;
  insert into public.gym_staff(gym_id, name, phone, role)
    values (g, left(btrim(p_name), 60), ph, p_role) returning * into st;
  return public._person_json(st);
end $$;

-- Take a person's access away: their devices are signed out and any code dies.
-- Errors: GONE, SELF (sign out instead), LAST_OWNER.
create or replace function public.owner_remove_person(p_key text, p_staff uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key); me uuid := (public._staff(p_key)).staff_id; st public.gym_staff; owners int;
begin
  perform 1 from public.gyms where gym_id = g for update;
  select * into st from public.gym_staff where staff_id = p_staff and gym_id = g and removed_at is null;
  if st.staff_id is null then raise exception 'GONE'; end if;
  if st.staff_id = me then raise exception 'SELF'; end if;
  if st.role = 'owner' then
    select count(*) into owners from public.gym_staff where gym_id = g and role = 'owner' and removed_at is null;
    if owners <= 1 then raise exception 'LAST_OWNER'; end if;
  end if;
  update public.gym_staff set removed_at = now() where staff_id = st.staff_id;
  update public.gym_sessions set ended_at = now() where staff_id = st.staff_id and ended_at is null;
  delete from public.gym_signin_codes where staff_id = st.staff_id and used_at is null;
end $$;

-- Make a sign-in code for one person (yourself too, for a new phone). Shown once; only its hash
-- is kept. At most 20 codes an hour per gym. Errors: GONE, TOO_MANY.
create or replace function public.owner_make_signin_code(p_key text, p_staff uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key); st public.gym_staff; n int;
begin
  perform 1 from public.gyms where gym_id = g for update;
  select * into st from public.gym_staff where staff_id = p_staff and gym_id = g and removed_at is null;
  if st.staff_id is null then raise exception 'GONE'; end if;
  select count(*) into n from public.gym_signin_codes c join public.gym_staff s on s.staff_id = c.staff_id
   where s.gym_id = g and c.created_at > now() - interval '1 hour';
  if n >= 20 then raise exception 'TOO_MANY'; end if;
  return public._make_code(st.staff_id) || jsonb_build_object('name', st.name, 'phone', st.phone);
end $$;

-- Sign a person out of every device (for yourself: every device but this one). Errors: GONE.
create or replace function public.owner_sign_out_person(p_key text, p_staff uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key);
begin
  if not exists (select 1 from public.gym_staff where staff_id = p_staff and gym_id = g and removed_at is null) then
    raise exception 'GONE';
  end if;
  update public.gym_sessions set ended_at = now()
   where staff_id = p_staff and ended_at is null and key_hash <> public._hash_key(p_key);
end $$;

-- ------------------------------------------------------------------ the records
-- Rows newer than p_since (0 = everything live). The version is read FIRST: rows written after it
-- may come along too (harmless; the next pull sends them again), but never fewer rows than the
-- version claims.
create or replace function public.crm_pull(p_key text, p_since bigint)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); gr public.gyms; since bigint := greatest(coalesce(p_since, 0), 0);
begin
  select * into gr from public.gyms where gym_id = g;
  return jsonb_build_object(
    'version', gr.crm_version,
    'gym', jsonb_build_object('gymId', gr.gym_id, 'name', gr.name, 'joinCode', gr.join_code, 'createdAt', gr.created_at),
    'records', coalesce((
      select jsonb_agg(jsonb_build_object('k', r.kind, 'id', r.id, 'd', case when r.deleted then null else r.data end, 'x', r.deleted)
                       order by r.version, r.kind, r.id)
        from public.crm_records r
       where r.gym_id = g and r.version > since and (since > 0 or not r.deleted)), '[]'::jsonb));
end $$;

-- Write the rows one action changed, all or nothing. p_records: [{k, id, d}] or [{k, id, x:true}]
-- to delete. Refused with STALE unless p_base is the gym's current version. Returns the new one.
create or replace function public.crm_push(p_key text, p_base bigint, p_records jsonb)
  returns bigint language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); cur bigint; v bigint; r jsonb; k text; rid text; n int;
begin
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'INVALID'; end if;
  n := jsonb_array_length(p_records);
  if n = 0 or n > 1000 then raise exception 'INVALID'; end if;
  select crm_version into cur from public.gyms where gym_id = g for update;
  if cur is distinct from p_base then raise exception 'STALE'; end if;
  v := cur + 1;
  for r in select value from jsonb_array_elements(p_records) loop
    k := r->>'k';
    rid := r->>'id';
    if k is null or k not in ('gym','member','plan','membership','payment','visit') then raise exception 'INVALID'; end if;
    if rid is null or length(rid) not between 1 and 64 then raise exception 'INVALID'; end if;
    if coalesce(r->>'x', 'false') = 'true' then
      update public.crm_records set deleted = true, data = '{}'::jsonb, version = v, updated_at = now()
       where gym_id = g and kind = k and id = rid;
    else
      if jsonb_typeof(r->'d') is distinct from 'object' or octet_length((r->'d')::text) > 20000 then
        raise exception 'INVALID';
      end if;
      insert into public.crm_records(gym_id, kind, id, data, version)
        values (g, k, rid, r->'d', v)
        on conflict (gym_id, kind, id) do update
          set data = excluded.data, version = v, deleted = false, updated_at = now();
      -- The member app shows the gym's name: keep the gyms row in step with the panel's details.
      if k = 'gym' and length(btrim(coalesce(r->'d'->>'name', ''))) > 0 then
        update public.gyms set name = left(btrim(r->'d'->>'name'), 60) where gym_id = g;
      end if;
    end if;
  end loop;
  update public.gyms set crm_version = v where gym_id = g;
  return v;
end $$;

-- ------------------------------------------------------------------ support (SQL editor only)
-- An owner lost every device: make a code for their mobile (the gym's owner with that number;
-- pass p_gym when the number owns more than one gym).
create or replace function public.support_make_signin_code(p_phone text, p_gym uuid default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare st public.gym_staff; n int;
begin
  select count(*) into n from public.gym_staff
   where phone = public._norm_phone(p_phone) and role = 'owner' and removed_at is null
     and (p_gym is null or gym_id = p_gym);
  if n = 0 then raise exception 'GONE'; end if;
  if n > 1 then raise exception 'PICK_GYM'; end if;
  select * into st from public.gym_staff
   where phone = public._norm_phone(p_phone) and role = 'owner' and removed_at is null
     and (p_gym is null or gym_id = p_gym);
  return public._make_code(st.staff_id);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._norm_phone(text)                          from public, anon, authenticated;
revoke all on function public._staff(text)                               from public, anon, authenticated;
revoke all on function public._owner_gym(text)                           from public, anon, authenticated;
revoke all on function public._people_admin(text)                        from public, anon, authenticated;
revoke all on function public._new_session(uuid, text)                   from public, anon, authenticated;
revoke all on function public._person_json(public.gym_staff)             from public, anon, authenticated;
revoke all on function public._signed_in_json(public.gym_staff, text)    from public, anon, authenticated;
revoke all on function public._six_digits()                              from public, anon, authenticated;
revoke all on function public._code_hash(uuid, text)                     from public, anon, authenticated;
revoke all on function public._make_code(uuid)                           from public, anon, authenticated;
revoke all on function public.support_make_signin_code(text, uuid)       from public, anon, authenticated;

revoke all on function public.gym_create_online(text, text, text, text)  from public;
revoke all on function public.owner_go_online(text, text, text, text)    from public;
revoke all on function public.staff_sign_in(text, text, text)            from public;
revoke all on function public.staff_me(text)                             from public;
revoke all on function public.staff_sign_out(text)                       from public;
revoke all on function public.owner_people(text)                         from public;
revoke all on function public.owner_add_person(text, text, text, text)   from public;
revoke all on function public.owner_remove_person(text, uuid)            from public;
revoke all on function public.owner_make_signin_code(text, uuid)         from public;
revoke all on function public.owner_sign_out_person(text, uuid)          from public;
revoke all on function public.crm_pull(text, bigint)                     from public;
revoke all on function public.crm_push(text, bigint, jsonb)              from public;

grant execute on function public.gym_create_online(text, text, text, text)  to anon, authenticated;
grant execute on function public.owner_go_online(text, text, text, text)    to anon, authenticated;
grant execute on function public.staff_sign_in(text, text, text)            to anon, authenticated;
grant execute on function public.staff_me(text)                             to anon, authenticated;
grant execute on function public.staff_sign_out(text)                       to anon, authenticated;
grant execute on function public.owner_people(text)                         to anon, authenticated;
grant execute on function public.owner_add_person(text, text, text, text)   to anon, authenticated;
grant execute on function public.owner_remove_person(text, uuid)            to anon, authenticated;
grant execute on function public.owner_make_signin_code(text, uuid)         to anon, authenticated;
grant execute on function public.owner_sign_out_person(text, uuid)          to anon, authenticated;
grant execute on function public.crm_pull(text, bigint)                     to anon, authenticated;
grant execute on function public.crm_push(text, bigint, jsonb)              to anon, authenticated;
