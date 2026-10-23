-- NOT APPLIED - main session applies after review
--
-- 0029: automatic reminders to members (R-86, 23 Oct 2026). Design and the list of cases:
-- docs/overhaul/research/R-auto-reminders.md. Additive only and re-runnable (if not exists / create
-- or replace). Apply after 0023 (it reuses member_membership's checks). Does not need 0024-0028.
-- Test: supabase/tests/0029_auto_reminders.sql (CI runs it after every migration; pasted into the
-- SQL Editor it always ends in an error and so changes nothing).
--
-- NO SERVER SENDING. The member's phone schedules each reminder itself as a phone notification from
-- what it already knows (plan end date, offer progress, and the three dates below). This migration
-- only keeps the owner's on/off switches and hands the phone what it needs.
--
-- THE OWNER'S SWITCHES (gym_auto_reminders, one row per gym). settings is a jsonb object, one entry
-- per case the owner changed: {"plan_ends_soon": {"on": true, "days": [7, 3]}, "birthday": {"on":
-- false}, ...}. A case left out (or no row at all) means the app's built-in default for it. Known
-- cases and their numbers ("days"; for pt_low it is "sessions left"):
--   plan_ends_soon  1-30, up to 3 values     plan_ends_today  -          plan_ended  1-60, up to 3
--   birthday        -                        welcome          -          offer_reward  -
--   offer_ending    1-14, one value          offer_near       -          pt_low  1-5, one value
--   miss_you        5-60, one value          anniversary      -
-- Anything else is refused with INVALID (an unknown case, days on a case without days, a number out
-- of range, more values than allowed, "on" missing or not true/false).
--
-- WHO CAN DO WHAT.
--   owner_auto_reminders(key)            any live key of the gym (owner, front desk, old owner key):
--                                        {settings | null, updatedAt, updatedByName, canEdit}.
--   owner_save_auto_reminders(key, s)    the owner only (front desk: OWNER_ONLY). Replaces the whole
--                                        object; answers like owner_auto_reminders.
--   member_auto_reminders(member key)    {ok:true, day, settings | null, birthday, joinedOn,
--                                        lastVisitOn}. The settings always; the three dates only
--                                        when member_membership (0023) answers ok for this key (the
--                                        number matched at a QR check-in, the first name matches,
--                                        not a shared number), else null. birthday is 'MM-DD' only,
--                                        never the year. lastVisitOn: the latest check-in in the
--                                        register (any source), not after today, and only while the
--                                        owner has "we haven't seen you" (miss_you) on. No money.
-- The table has row security on and no grants: everything goes through the functions (SECURITY
-- DEFINER, fixed search_path). Nobody reads another gym's row.

set lock_timeout = '3s';

create table if not exists public.gym_auto_reminders (
  gym_id          uuid primary key references public.gyms(gym_id) on delete cascade,
  settings        jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  updated_by_name text
);
alter table public.gym_auto_reminders enable row level security;
revoke all on public.gym_auto_reminders from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
-- The owner's switches checked and tidied (days distinct, largest first). Raises INVALID.
create or replace function public._auto_reminders_clean(p jsonb) returns jsonb
  language plpgsql immutable set search_path = public as $$
declare
  e record; lo int; hi int; most int; has_days boolean; d jsonb; n int; days int[]; one jsonb;
  out jsonb := '{}'::jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'INVALID'; end if;
  for e in select key, value from jsonb_each(p) loop
    select c.lo, c.hi, c.most, c.lo is not null into lo, hi, most, has_days
      from (values ('plan_ends_soon', 1, 30, 3), ('plan_ends_today', null, null, null), ('plan_ended', 1, 60, 3),
                   ('birthday', null, null, null), ('welcome', null, null, null), ('offer_reward', null, null, null),
                   ('offer_ending', 1, 14, 1), ('offer_near', null, null, null), ('pt_low', 1, 5, 1),
                   ('miss_you', 5, 60, 1), ('anniversary', null, null, null)) as c(k, lo, hi, most)
     where c.k = e.key;
    if not found then raise exception 'INVALID'; end if;
    if jsonb_typeof(e.value) <> 'object' or jsonb_typeof(e.value->'on') is distinct from 'boolean' then
      raise exception 'INVALID';
    end if;
    one := jsonb_build_object('on', (e.value->>'on')::boolean);
    if e.value ? 'days' and jsonb_typeof(e.value->'days') <> 'null' then
      if not has_days or jsonb_typeof(e.value->'days') <> 'array' then raise exception 'INVALID'; end if;
      days := '{}';
      for d in select value from jsonb_array_elements(e.value->'days') loop
        if jsonb_typeof(d) <> 'number' or d::text !~ '^[0-9]{1,3}$' then raise exception 'INVALID'; end if;
        n := d::text::int;
        if n < lo or n > hi then raise exception 'INVALID'; end if;
        if not (n = any(days)) then days := days || n; end if;
      end loop;
      if coalesce(array_length(days, 1), 0) not between 1 and most then raise exception 'INVALID'; end if;
      one := one || jsonb_build_object('days', (select jsonb_agg(x order by x desc) from unnest(days) x));
    end if;
    out := out || jsonb_build_object(e.key, one);
  end loop;
  return out;
end $$;

-- What the admin app reads (and what a save answers).
create or replace function public._auto_reminders_json(p_gym uuid, p_can_edit boolean) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object('settings', r.settings, 'updatedAt', r.updated_at, 'updatedByName', r.updated_by_name,
                            'canEdit', p_can_edit)
    from (select 1) one
    left join public.gym_auto_reminders r on r.gym_id = p_gym
$$;

-- ------------------------------------------------------------------ owner and front desk
create or replace function public.owner_auto_reminders(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key);
begin
  -- An old owner key (no person) or an owner's session may change them; the front desk only looks.
  return public._auto_reminders_json(g, st.staff_id is null or st.role = 'owner');
end $$;

create or replace function public.owner_save_auto_reminders(p_key text, p_settings jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  clean jsonb := public._auto_reminders_clean(p_settings);
begin
  insert into public.gym_auto_reminders(gym_id, settings, updated_at, updated_by, updated_by_name)
  values (g, clean, now(), st.staff_id, coalesce(st.name, 'Owner (old owner key)'))
  on conflict (gym_id) do update
    set settings = excluded.settings, updated_at = excluded.updated_at,
        updated_by = excluded.updated_by, updated_by_name = excluded.updated_by_name;
  return public._auto_reminders_json(g, true);
end $$;

-- ------------------------------------------------------------------ the member's phone
-- Never a raise after the key check.
create or replace function public.member_auto_reminders(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  s jsonb;
  mm jsonb;
  roster public.crm_records;
  dob date;
  joined date;
  last_visit text;
begin
  select settings into s from public.gym_auto_reminders where gym_id = m.gym_id;
  begin
    mm := public.member_membership(p_key);
  exception when others then
    -- quiet: member_membership never raises after the key check; if it ever did, the switches
    -- still go to the phone and only the three dates stay null.
    mm := null;
  end;
  if mm is not null and mm->>'ok' = 'true' then
    roster := public._checkin_roster_member(m.gym_id, public._norm_phone(m.checkin_phone));
    if roster.id is not null then
      dob := public._iso_day(roster.data->>'dateOfBirth');
      joined := public._iso_day(roster.data->>'joinedOn');
      -- Only "we haven't seen you" reads the last check-in (off unless the owner turned it on).
      if coalesce(s->'miss_you'->>'on', 'false') = 'true' then
      select max(r.data->>'visitedOn') into last_visit
        from public.crm_records r
       where r.gym_id = m.gym_id and r.kind = 'visit' and not r.deleted
         and r.data->>'memberId' = roster.id
         and r.data->>'visitedOn' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         and r.data->>'visitedOn' <= to_char(today, 'YYYY-MM-DD');
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'day', to_char(today, 'YYYY-MM-DD'), 'settings', s,
    'birthday', case when dob is not null then to_char(dob, 'MM-DD') end,
    'joinedOn', case when joined is not null and joined <= today then to_char(joined, 'YYYY-MM-DD') end,
    'lastVisitOn', last_visit);
end $$;

revoke all on function public._auto_reminders_clean(jsonb)            from public, anon, authenticated;
revoke all on function public._auto_reminders_json(uuid, boolean)     from public, anon, authenticated;
revoke all on function public.owner_auto_reminders(text)              from public;
revoke all on function public.owner_save_auto_reminders(text, jsonb)  from public;
revoke all on function public.member_auto_reminders(text)             from public;
grant execute on function public.owner_auto_reminders(text)             to anon, authenticated;
grant execute on function public.owner_save_auto_reminders(text, jsonb) to anon, authenticated;
grant execute on function public.member_auto_reminders(text)            to anon, authenticated;

-- PostgREST learns the new functions at once (instead of on its next schema reload).
notify pgrst, 'reload schema';
