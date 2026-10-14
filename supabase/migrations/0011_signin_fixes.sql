-- 0011: review fixes for 0010 (sign-in + records online), 14 Oct 2026.
--  1. PUSH IDS: every crm_push carries an id the server remembers for a day. Sending the same
--     push again (after a lost reply or a timeout) returns the version it already got instead of
--     redoing it — so a payment whose reply was lost is never saved twice. A push that is still on
--     its way when the panel resends waits on the gym's row lock and is then recognised.
--  2. SIGN-IN GUESSING: every attempt counts (also "no code waiting"), per mobile AND per caller
--     (the caller's IP from the request headers): 5 tries per mobile per caller in 15 minutes,
--     50 per mobile from everyone in 30 minutes. Wrong guesses no longer kill a code (a stranger
--     who knows the owner's mobile could otherwise burn every code the owner makes). One reply
--     for "no code" and "wrong code", so nobody learns when a code is waiting. Attempts for one
--     mobile are queued (advisory lock), so a burst of guesses cannot slip past the count.
--     Making a new code clears that mobile's tries.
--  3. DELETES: only a check-in can be deleted (undo); every other record is voided or archived
--     by the panel, never deleted. A deleted row keeps its data.
--  4. NEW GYMS: at most 5 an hour from one caller, 1,000 an hour overall.
--  5. OLD OWNER KEY: retired once the gym is online (owner_retire_key), so the only way in is a
--     person on the Staff & sign-in list.
-- Apply after 0010. Re-runnable.

create table if not exists public.crm_push_log (
  gym_id  uuid not null references public.gyms(gym_id) on delete cascade,
  push_id uuid not null,
  version bigint not null,
  at      timestamptz not null default now(),
  primary key (gym_id, push_id)
);
alter table public.crm_push_log enable row level security;
revoke all on public.crm_push_log from anon, authenticated;

alter table public.gym_signin_fails add column if not exists ip text;
alter table public.gyms add column if not exists creator_ip text;
create index if not exists gyms_creator_ip on public.gyms(creator_ip, created_at);

-- The caller's address as Cloudflare / the gateway saw it ('' when unknown).
create or replace function public._caller_ip() returns text
  language plpgsql stable set search_path = public as $$
declare h json;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  return coalesce(nullif(btrim(split_part(coalesce(h->>'cf-connecting-ip', h->>'x-forwarded-for', ''), ',', 1)), ''), '');
end $$;

-- ------------------------------------------------------------------ records: push ids, deletes
drop function if exists public.crm_push(text, bigint, jsonb);
create or replace function public.crm_push(p_key text, p_base bigint, p_records jsonb, p_push_id uuid default null)
  returns bigint language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); cur bigint; v bigint; r jsonb; k text; rid text; n int; done bigint;
begin
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'INVALID'; end if;
  n := jsonb_array_length(p_records);
  if n = 0 or n > 1000 then raise exception 'INVALID'; end if;
  select crm_version into cur from public.gyms where gym_id = g for update;
  if p_push_id is not null then
    select version into done from public.crm_push_log where gym_id = g and push_id = p_push_id;
    if done is not null then return done; end if;
  end if;
  if cur is distinct from p_base then raise exception 'STALE'; end if;
  v := cur + 1;
  for r in select value from jsonb_array_elements(p_records) loop
    k := r->>'k';
    rid := r->>'id';
    if k is null or k not in ('gym','member','plan','membership','payment','visit') then raise exception 'INVALID'; end if;
    if rid is null or length(rid) not between 1 and 64 then raise exception 'INVALID'; end if;
    if coalesce(r->>'x', 'false') = 'true' then
      -- Only a check-in is ever taken back. The row keeps its data.
      if k <> 'visit' then raise exception 'INVALID'; end if;
      update public.crm_records set deleted = true, version = v, updated_at = now()
       where gym_id = g and kind = k and id = rid;
    else
      if jsonb_typeof(r->'d') is distinct from 'object' or octet_length((r->'d')::text) > 20000 then
        raise exception 'INVALID';
      end if;
      insert into public.crm_records(gym_id, kind, id, data, version)
        values (g, k, rid, r->'d', v)
        on conflict (gym_id, kind, id) do update
          set data = excluded.data, version = v, deleted = false, updated_at = now();
      if k = 'gym' and length(btrim(coalesce(r->'d'->>'name', ''))) > 0 then
        update public.gyms set name = left(btrim(r->'d'->>'name'), 60) where gym_id = g;
      end if;
    end if;
  end loop;
  update public.gyms set crm_version = v where gym_id = g;
  if p_push_id is not null then
    insert into public.crm_push_log(gym_id, push_id, version) values (g, p_push_id, v);
    delete from public.crm_push_log where gym_id = g and at < now() - interval '1 day';
  end if;
  return v;
end $$;

-- ------------------------------------------------------------------ sign-in
create or replace function public.staff_sign_in(p_phone text, p_code text, p_device text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare ph text := public._norm_phone(p_phone); v_ip text := public._caller_ip(); mine int; everyone int; cid uuid; st public.gym_staff;
begin
  if ph is null then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  perform pg_advisory_xact_lock(hashtext('signin:' || ph));
  delete from public.gym_signin_fails where at < now() - interval '1 day';
  select count(*) into mine from public.gym_signin_fails
   where phone = ph and coalesce(gym_signin_fails.ip, '') = v_ip and at > now() - interval '15 minutes';
  select count(*) into everyone from public.gym_signin_fails
   where phone = ph and at > now() - interval '30 minutes';
  if mine >= 5 or everyone >= 50 then return jsonb_build_object('error', 'TOO_MANY_TRIES'); end if;

  select x.code_id into cid
    from public.gym_signin_codes x join public.gym_staff s on s.staff_id = x.staff_id
   where s.phone = ph and s.removed_at is null and x.used_at is null and x.expires_at > now()
     and x.code_hash = public._code_hash(x.code_id, p_code)
   limit 1 for update of x;

  if cid is null then
    insert into public.gym_signin_fails(phone, ip) values (ph, v_ip);
    return jsonb_build_object('error', 'WRONG_CODE', 'triesLeft', greatest(0, 4 - mine));
  end if;

  update public.gym_signin_codes set used_at = now() where code_id = cid;
  delete from public.gym_signin_fails where phone = ph;
  select s.* into st from public.gym_signin_codes x join public.gym_staff s on s.staff_id = x.staff_id where x.code_id = cid;
  return public._signed_in_json(st, public._new_session(st.staff_id, p_device));
end $$;

-- A new code also clears the mobile's wrong tries, so the right code is never refused for old ones.
create or replace function public._make_code(p_staff uuid) returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare c text := public._six_digits(); id uuid := gen_random_uuid(); until timestamptz := now() + interval '30 minutes';
begin
  delete from public.gym_signin_codes where staff_id = p_staff and used_at is null;
  delete from public.gym_signin_fails where phone = (select phone from public.gym_staff where staff_id = p_staff);
  insert into public.gym_signin_codes(code_id, staff_id, code_hash, expires_at)
    values (id, p_staff, public._code_hash(id, c), until);
  return jsonb_build_object('staffId', p_staff, 'code', c, 'expiresAt', until);
end $$;

-- People list: a waiting code no longer depends on wrong tries.
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
                            where c.staff_id = s.staff_id and c.used_at is null and c.expires_at > now()))
           order by (s.role = 'owner') desc, s.created_at)
      from public.gym_staff s where s.gym_id = g and s.removed_at is null), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------ new gyms: per caller
create or replace function public.gym_create_online(p_gym_name text, p_name text, p_phone text, p_device text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gyms; st public.gym_staff; ph text := public._norm_phone(p_phone); n int; v_ip text := public._caller_ip();
begin
  if ph is null then raise exception 'BAD_PHONE'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 or length(btrim(coalesce(p_gym_name, ''))) = 0 then raise exception 'EMPTY'; end if;
  if v_ip <> '' then
    select count(*) into n from public.gyms where creator_ip = v_ip and created_at > now() - interval '1 hour';
    if n >= 5 then raise exception 'BUSY'; end if;
  end if;
  select count(*) into n from public.gyms where created_at > now() - interval '1 hour';
  if n >= 1000 then raise exception 'BUSY'; end if;
  insert into public.gyms(name, join_code, creator_ip)
    values (left(btrim(p_gym_name), 60), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), nullif(v_ip, ''))
    returning * into g;
  insert into public.gym_staff(gym_id, name, phone, role)
    values (g.gym_id, left(btrim(p_name), 60), ph, 'owner') returning * into st;
  return public._signed_in_json(st, public._new_session(st.staff_id, p_device));
end $$;

-- ------------------------------------------------------------------ retire the old owner key
-- Called by the panel once a gym's records are online: only an OWNER's session may do it.
create or replace function public.owner_retire_key(p_key text)
  returns void language plpgsql security definer set search_path = public as $$
declare st public.gym_staff := public._staff(p_key);
begin
  if st.staff_id is null then raise exception 'BAD_KEY'; end if;
  if st.role <> 'owner' then raise exception 'OWNER_ONLY'; end if;
  delete from public.gym_owner_keys where gym_id = st.gym_id;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._caller_ip()                                   from public, anon, authenticated;
revoke all on function public._make_code(uuid)                               from public, anon, authenticated;
revoke all on function public.crm_push(text, bigint, jsonb, uuid)            from public;
revoke all on function public.staff_sign_in(text, text, text)                from public;
revoke all on function public.owner_people(text)                             from public;
revoke all on function public.gym_create_online(text, text, text, text)      from public;
revoke all on function public.owner_retire_key(text)                         from public;
grant execute on function public.crm_push(text, bigint, jsonb, uuid)          to anon, authenticated;
grant execute on function public.staff_sign_in(text, text, text)              to anon, authenticated;
grant execute on function public.owner_people(text)                           to anon, authenticated;
grant execute on function public.gym_create_online(text, text, text, text)    to anon, authenticated;
grant execute on function public.owner_retire_key(text)                       to anon, authenticated;
