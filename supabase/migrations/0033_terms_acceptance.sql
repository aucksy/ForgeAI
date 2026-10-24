-- NOT APPLIED. Needs the owner's yes (#38).
--
-- 0033: online acceptance of the ForgeAI terms and the data agreement (tracker #38, owner R-99,
-- 24 Oct 2026: "no physical signing; a scalable digital acceptance of the terms online for gyms
-- anywhere"). Additive and re-runnable. Apply after 0031 (it reads 0031's branch groups).
-- Test: supabase/tests/0033_terms_acceptance.sql (it always ends in an error, so it changes nothing).
--
-- WHAT IS KEPT (gym_terms_acceptance, one row per acceptance, never edited or deleted by the apps):
--   the gym, the person who ticked the box (staff id and name as signed in), WHEN, WHICH version of
--   the terms (a date like '2026-10-24', the version printed on /terms.html), HOW (at "Create my
--   gym", or when an existing gym's owner was asked at sign-in), and a HASH of the address the
--   request came from when the gateway passed one (sha256 of '<gym id>:<address>').
--   The hash is NOT anonymous: an IPv4 address can be found again by trying every address with the
--   gym id. It only keeps the raw address out of this table. The raw addresses live elsewhere:
--   gym_creator_ips (0021, the address a gym was created from, for abuse limits) and the access log
--   (0028). Treat this column as personal data like those.
-- THE VERSIONS: _terms_versions() is the one list of terms versions there are. A version that is not
--   in it, or is later than today in India, is refused (INVALID). A new version of the terms = a new
--   line in that list (a new migration) + the admin app's TERMS_VERSION (auth/terms.ts; a test
--   checks the two agree) + the "Last updated" line on both pages.
-- THE BUSINESS ACCEPTS: an acceptance in any branch of a group counts for every branch (0031).
--
-- NEW (each checks the key itself):
--   owner_terms(key)                 {acceptedVersion, acceptedAt, acceptedByName, how, canAccept}
--                                    for this gym (any branch of its group). Owner or desk.
--   owner_accept_terms(key, version) the owner ticks the box (an existing gym, asked once at
--                                    sign-in). Owner only (OWNER_ONLY for the desk). INVALID for a
--                                    version that is not a date.
-- CHANGES ONE FUNCTION: gym_create_online (0021) takes p_terms_version (default null) and records the
--   acceptance with the new gym, in the same transaction. Without it (an older admin app) the gym is
--   made exactly as before and its owner is asked at the next sign-in. The old 4-argument version is
--   dropped so PostgREST has one function to pick. RE-RUNNING 0021 puts the 4-argument one back next
--   to this one: always re-run 0033 after 0021.

set lock_timeout = '3s';

create table if not exists public.gym_terms_acceptance (
  acceptance_id bigint generated always as identity primary key,
  gym_id        uuid not null references public.gyms(gym_id) on delete cascade,
  staff_id      uuid references public.gym_staff(staff_id) on delete set null,
  staff_name    text,
  terms_version text not null check (terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  accepted_at   timestamptz not null default now(),
  how           text not null check (how in ('create', 'sign_in')),
  ip_hash       text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists gym_terms_acceptance_gym on public.gym_terms_acceptance(gym_id, accepted_at desc);
alter table public.gym_terms_acceptance enable row level security;
revoke all on public.gym_terms_acceptance from public, anon, authenticated;

-- Kept as it was written: no app may change or remove an acceptance.
create or replace function public._terms_append_only() returns trigger
  language plpgsql set search_path = public as $$
begin
  -- A gym deleted by HQ takes its rows with it (the foreign key's cascade runs as a DELETE).
  if tg_op = 'DELETE' and not exists (select 1 from public.gyms where gym_id = old.gym_id) then return old; end if;
  -- ...and so does a person's row going with it (the staff foreign key sets staff_id to null).
  if tg_op = 'UPDATE' and new.staff_id is null and (to_jsonb(new) - 'staff_id') = (to_jsonb(old) - 'staff_id') then
    return new;
  end if;
  raise exception 'APPEND_ONLY';
end $$;
drop trigger if exists gym_terms_acceptance_append_only on public.gym_terms_acceptance;
create trigger gym_terms_acceptance_append_only before update or delete on public.gym_terms_acceptance
  for each row execute function public._terms_append_only();

-- ------------------------------------------------------------------ helpers (no grants)
-- Every version of the terms there has been, oldest first. The ONE list (see the header).
create or replace function public._terms_versions() returns text[]
  language sql immutable set search_path = public as $$
  select array['2026-10-24']
$$;

-- A terms version: a real date in the list, not later than today in India; INVALID otherwise.
create or replace function public._terms_version(p text) returns text
  language plpgsql stable set search_path = public as $$
declare v text := btrim(coalesce(p, '')); d date := public._iso_day(v);
begin
  if d is null or d > (now() at time zone 'Asia/Kolkata')::date or not (v = any(public._terms_versions())) then
    raise exception 'INVALID';
  end if;
  return v;
end $$;

create or replace function public._record_terms(p_gym uuid, st public.gym_staff, p_version text, p_how text) returns void
  language plpgsql volatile security definer set search_path = public, extensions as $$
declare ip text := public._caller_ip();
begin
  insert into public.gym_terms_acceptance(gym_id, staff_id, staff_name, terms_version, how, ip_hash)
    values (p_gym, st.staff_id, coalesce(st.name, 'Owner (old owner key)'), public._terms_version(p_version), p_how,
            case when ip <> '' then encode(digest(p_gym::text || ':' || ip, 'sha256'), 'hex') end);
end $$;

-- The latest acceptance of this gym's business (any branch), as the apps read it.
create or replace function public._terms_json(p_gym uuid, p_can boolean) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'acceptedVersion', a.terms_version, 'acceptedAt', a.accepted_at, 'acceptedByName', a.staff_name,
    'how', a.how, 'canAccept', p_can)
  from (select null) one
  left join lateral (select * from public.gym_terms_acceptance t
                      where t.gym_id = any(public._branch_ids(p_gym))
                      order by t.terms_version desc, t.accepted_at desc limit 1) a on true
$$;

-- ------------------------------------------------------------------ reading and accepting
create or replace function public.owner_terms(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key);
begin
  return public._terms_json(g, st.staff_id is null or st.role = 'owner');
end $$;

create or replace function public.owner_accept_terms(p_key text, p_version text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key); st public.gym_staff := public._staff(p_key); v text := public._terms_version(p_version);
begin
  -- The same version twice (a double tap, a second device) is kept once.
  if not exists (select 1 from public.gym_terms_acceptance
                  where gym_id = any(public._branch_ids(g)) and terms_version = v) then
    perform public._record_terms(g, st, v, 'sign_in');
  end if;
  return public._terms_json(g, true);
end $$;

-- ------------------------------------------------------------------ Create my gym (0021, plus the terms)
drop function if exists public.gym_create_online(text, text, text, text);
create or replace function public.gym_create_online(p_gym_name text, p_name text, p_phone text, p_device text default null,
                                                    p_terms_version text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gyms; st public.gym_staff; ph text := public._norm_phone(p_phone); n int; v_ip text := public._caller_ip();
  tv text := case when nullif(btrim(coalesce(p_terms_version, '')), '') is null then null else public._terms_version(p_terms_version) end;
begin
  if ph is null then raise exception 'BAD_PHONE'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 or length(btrim(coalesce(p_gym_name, ''))) = 0 then raise exception 'EMPTY'; end if;
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
  return public._signed_in_json(st, public._new_session(st.staff_id, p_device))
         || jsonb_build_object('termsVersion', tv);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._terms_append_only()                        from public, anon, authenticated;
revoke all on function public._terms_version(text)                        from public, anon, authenticated;
revoke all on function public._terms_versions()                           from public, anon, authenticated;
revoke all on function public._record_terms(uuid, public.gym_staff, text, text) from public, anon, authenticated;
revoke all on function public._terms_json(uuid, boolean)                  from public, anon, authenticated;
revoke all on function public.owner_terms(text)                           from public;
revoke all on function public.owner_accept_terms(text, text)              from public;
revoke all on function public.gym_create_online(text, text, text, text, text) from public;
grant execute on function public.owner_terms(text)                        to anon, authenticated;
grant execute on function public.owner_accept_terms(text, text)           to anon, authenticated;
grant execute on function public.gym_create_online(text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
