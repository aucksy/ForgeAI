-- APPLIED LIVE 12 Nov 2026 (owner, 12 Nov: "Both yes"), in the SQL Editor, this exact text from 5c6af806 (sha256
-- 0defdb75...), run by the owner himself (the session's safety check stops Claude pressing Run on the live server).
-- Answer: "Success. No rows returned". Read-only check after: table gym_plus_settings and the functions owner_plus_lock,
-- owner_save_plus_lock and member_plus_lock exist. The live test file was not run (CI runs it). Only these header lines
-- changed since, so this file's hash differs from the applied text.
-- Re-runnable. Apply after 0036 (it uses _owner_gym,
-- _owner_only_gym, _staff and _member as 0036 left them).
-- Test: supabase/tests/0070_member_plus_lock.sql (CI runs it after every migration; pasted into the SQL Editor it
-- always ends in an error and so changes nothing).
--
-- 0070: F56 MettleUp Plus, the gym owner's switch (owner R-461, 12 Nov 2026; default decided "A" = ON). A member
-- of a MettleUp gym gets every paid feature of the member app free (watch, older charts, suggested weights, the
-- calculators, more own exercises). When their plan ends, the app keeps them free for 7 more days; after that
-- THIS switch decides: ON (the default for every gym) = the paid extras lock until they renew; OFF = they stay free.
-- The member's own data (workouts, history, routines, records) is NEVER locked by this, whatever it says.
-- The 7 days and the default live in the app's shared rules (packages/theme/src/memberPlan.ts:
-- GYM_UNLOCK_GRACE_DAYS, GYM_LOCK_AFTER_END_DEFAULT = true); the default here MUST match it (the app's test checks).
--
-- NEW
--   gym_plus_settings                  one row per gym that changed the switch (no row = the default, ON).
--   owner_plus_lock(key)               {ok, lockAfterEnd, canEdit, updatedAt, updatedByName}. Owner or desk.
--   owner_save_plus_lock(key, on)      the owner only (OWNER_ONLY for the desk), stamped with who saved.
--   member_plus_lock(key)              {ok, lockAfterEnd} for the member key of the app's Join (BAD_KEY after Leave).
-- CHANGED: nothing that exists. RLS on, no policies, no grants on the table; only these functions touch it.
-- Undo: drop function public.owner_plus_lock(text); drop function public.owner_save_plus_lock(text, boolean);
--   drop function public.member_plus_lock(text); drop table public.gym_plus_settings;

set lock_timeout = '3s';

create table if not exists public.gym_plus_settings (
  gym_id          uuid primary key references public.gyms(gym_id) on delete cascade,
  lock_after_end  boolean not null default true,
  updated_by      uuid,
  updated_by_name text,
  updated_at      timestamptz not null default now()
);
alter table public.gym_plus_settings enable row level security;
revoke all on public.gym_plus_settings from public, anon, authenticated;

create or replace function public.owner_plus_lock(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key); r public.gym_plus_settings;
begin
  select * into r from public.gym_plus_settings where gym_id = g;
  return jsonb_build_object('ok', true, 'lockAfterEnd', coalesce(r.lock_after_end, true),
    'canEdit', st.staff_id is null or st.role = 'owner',
    'updatedAt', case when r.updated_at is null then null else floor(extract(epoch from r.updated_at) * 1000)::bigint end,
    'updatedByName', r.updated_by_name);
end $$;

create or replace function public.owner_save_plus_lock(p_key text, p_on boolean)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key); st public.gym_staff := public._staff(p_key);
begin
  if p_on is null then raise exception 'INVALID'; end if;
  insert into public.gym_plus_settings(gym_id, lock_after_end, updated_by, updated_by_name, updated_at)
    values (g, p_on, st.staff_id, case when st.staff_id is null then null else st.name end, now())
  on conflict (gym_id) do update
    set lock_after_end = excluded.lock_after_end, updated_by = excluded.updated_by,
        updated_by_name = excluded.updated_by_name, updated_at = excluded.updated_at;
  return public.owner_plus_lock(p_key);
end $$;

create or replace function public.member_plus_lock(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); r public.gym_plus_settings;
begin
  select * into r from public.gym_plus_settings where gym_id = m.gym_id;
  return jsonb_build_object('ok', true, 'lockAfterEnd', coalesce(r.lock_after_end, true));
end $$;

revoke all on function public.owner_plus_lock(text) from public;
revoke all on function public.owner_save_plus_lock(text, boolean) from public;
revoke all on function public.member_plus_lock(text) from public;
grant execute on function public.owner_plus_lock(text) to anon, authenticated;
grant execute on function public.owner_save_plus_lock(text, boolean) to anon, authenticated;
grant execute on function public.member_plus_lock(text) to anon, authenticated;
