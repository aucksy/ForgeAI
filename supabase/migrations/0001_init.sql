-- ForgeAI B2B2C — Phase 1 cloud foundation (BETA / free tier).
-- Multi-tenant: gyms are tenants; owners/trainers/members are auth users linked
-- via `profiles`. The phone pushes ONE rollup row per member into `member_summary`
-- (one-way, idempotent). RLS: a gym sees only its own rows; a member owns only
-- their own summary. Beta uses Supabase Auth for everyone (free 50k MAU); the
-- scale path swaps members to a signed per-member JWT without touching this schema.
--
-- Apply: Supabase Dashboard → SQL Editor → paste & run (or `supabase db push`).

-- ------------------------------------------------------------------ extensions
create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ------------------------------------------------------------------ tenant + membership
create table if not exists public.gyms (
  gym_id     uuid primary key default gen_random_uuid(),
  name       text not null,
  join_code  text not null unique,
  branding   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- One row per auth user: which gym they belong to and their role.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  gym_id       uuid references public.gyms(gym_id) on delete set null,
  role         text not null default 'member' check (role in ('owner','trainer','member')),
  display_name text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_profiles_gym on public.profiles(gym_id, role);

-- The ONE-ROW-PER-MEMBER rollup the phone upserts. This IS the pre-aggregation,
-- so the owner dashboard never scans workout history.
create table if not exists public.member_summary (
  member_id      uuid primary key references auth.users(id) on delete cascade,
  gym_id         uuid not null references public.gyms(gym_id) on delete cascade,
  display_name   text,
  last_active_at timestamptz,
  last_workout_at timestamptz,
  last_meal_at   timestamptz,
  workouts_7d    int not null default 0,
  workouts_30d   int not null default 0,
  total_workouts int not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  weight_kg      numeric,
  calories_today int,
  protein_today_g int,
  client_version bigint not null default 0,   -- monotonic phone clock; stale retries can't regress
  consent_version text,
  updated_at     timestamptz not null default now()
) with (fillfactor = 90);                     -- HOT updates for the in-place rollup
create index if not exists idx_summary_gym_active on public.member_summary(gym_id, last_active_at desc);
create index if not exists idx_summary_gym_streak on public.member_summary(gym_id, current_streak desc);

-- Monotonic guard: a stale phone retry (older client_version) can never regress
-- newer cloud state. BEFORE UPDATE returning NULL skips the stale write.
create or replace function public.guard_summary_version() returns trigger
  language plpgsql as $$
begin
  if new.client_version < old.client_version then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists trg_summary_version on public.member_summary;
create trigger trg_summary_version before update on public.member_summary
  for each row execute function public.guard_summary_version();

-- ------------------------------------------------------------------ auth helpers
-- SECURITY DEFINER so reading `profiles` inside a policy can't recurse into RLS.
create or replace function public.auth_gym_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select gym_id from public.profiles where id = auth.uid()
$$;

create or replace function public.auth_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ------------------------------------------------------------------ RLS
alter table public.gyms           enable row level security;
alter table public.profiles       enable row level security;
alter table public.member_summary enable row level security;

-- gyms: a member/staff can read their own gym; owners can update it.
drop policy if exists gyms_read on public.gyms;
create policy gyms_read on public.gyms for select
  using (gym_id = (select public.auth_gym_id()));
drop policy if exists gyms_owner_update on public.gyms;
create policy gyms_owner_update on public.gyms for update
  using (gym_id = (select public.auth_gym_id()) and (select public.auth_role()) = 'owner');

-- profiles: SELECT-only for self + staff. ALL writes go through the SECURITY
-- DEFINER RPCs below (which bypass RLS/grants), so a member can NEVER self-UPDATE
-- their role to 'owner' or forge gym_id — the direct-DML privilege-escalation hole.
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select
  using (id = (select auth.uid()));
drop policy if exists profiles_staff_read on public.profiles;
create policy profiles_staff_read on public.profiles for select
  using (gym_id = (select public.auth_gym_id()) and (select public.auth_role()) in ('owner','trainer'));
revoke insert, update, delete on public.profiles from authenticated;

-- member_summary: a member owns only their own row AND may only write it into
-- THEIR OWN gym (gym_id pinned to their profile via auth_gym_id — a no-profile
-- user has NULL gym_id, so the NOT NULL column blocks phantom-member injection).
-- Staff read their gym's rows.
drop policy if exists summary_self on public.member_summary;
create policy summary_self on public.member_summary for all
  using (member_id = (select auth.uid()))
  with check (member_id = (select auth.uid()) and gym_id = (select public.auth_gym_id()));
drop policy if exists summary_staff_read on public.member_summary;
create policy summary_staff_read on public.member_summary for select
  using (gym_id = (select public.auth_gym_id()) and (select public.auth_role()) in ('owner','trainer'));

-- ------------------------------------------------------------------ RPCs
-- Owner onboarding: create a gym + become its owner. Returns the gym row.
create or replace function public.create_gym(gym_name text)
  returns public.gyms language plpgsql security definer set search_path = public as $$
declare g public.gyms;
begin
  insert into public.gyms(name, join_code)
    values (gym_name, upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)))
    returning * into g;
  insert into public.profiles(id, gym_id, role, display_name)
    values (auth.uid(), g.gym_id, 'owner', null)
    on conflict (id) do update set gym_id = excluded.gym_id, role = 'owner';
  return g;
end $$;

-- Member joins a gym by its code. Idempotent; returns the gym.
create or replace function public.join_gym_by_code(code text)
  returns public.gyms language plpgsql security definer set search_path = public as $$
declare g public.gyms; my_gym uuid;
begin
  select * into g from public.gyms where join_code = upper(trim(code));
  if g.gym_id is null then raise exception 'INVALID_CODE'; end if;
  insert into public.profiles(id, gym_id, role)
    values (auth.uid(), g.gym_id, 'member')
    on conflict (id) do update set gym_id = excluded.gym_id
    where public.profiles.role = 'member';  -- never demote an owner/trainer
  -- Confirm the join actually took (an owner/trainer's row is skipped above) so
  -- the client never persists a false identity for a gym it isn't a member of.
  select gym_id into my_gym from public.profiles where id = auth.uid();
  if my_gym is distinct from g.gym_id then raise exception 'ALREADY_STAFF'; end if;
  return g;
end $$;

-- DPDP: erase the caller's cloud data (the phone erases its own SQLite separately;
-- one-way sync means a deleted local row would NOT propagate — this is the path).
create or replace function public.delete_my_cloud_data()
  returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.member_summary where member_id = auth.uid();
  delete from public.profiles where id = auth.uid();
end $$;

grant execute on function public.create_gym(text)        to authenticated;
grant execute on function public.join_gym_by_code(text)  to authenticated;
grant execute on function public.delete_my_cloud_data()  to authenticated;
