-- NOT APPLIED YET. Needs the owner's yes before it goes on the live server (a live server change, #18).
--
-- 0036: the gym's opening hours, shown in the member app (R-124, 25 Oct 2026: "add GYM timings for each
-- day of the week for morning and evening or 24 hours, which will be visible in member app").
-- Additive and re-runnable: one new table, new functions, one trigger on the new table; nothing that
-- exists is changed. Apply after 0035. Test: supabase/tests/0036_gym_timings.sql (CI runs it after
-- every migration; pasted into the SQL Editor it always ends in an error and so changes nothing).
-- Research: docs/research/R-gym-timings.md (Google Business Profile's model, made smaller).
--
-- THE HOURS (one row per gym; a branch is a gym (0031), so every branch has its own):
--   {"week": {"mon": DAY, ... "sun": DAY}, "special": [SPECIAL], "note": text|null}
--   DAY     = {"kind": "closed"|"hours"|"allDay", "ranges": [{"open":"HH:MM","close":"HH:MM"}]}
--             'hours' has 1 or 2 ranges (morning + evening), the others none. A close of '00:00' is
--             midnight at the end of the day; a close earlier than the open runs past midnight and
--             must end by 06:00 (later is nearly always an am/pm slip). Two ranges may not overlap.
--   SPECIAL = DAY + {"date": "YYYY-MM-DD", "note": text|null (<= 40)}: a date closed or with its own
--             hours ("Diwali"), replacing that date's weekday. At most 30, at most 400 days ahead;
--             days before yesterday are dropped on save (yesterday stays: its late range may run
--             into today).
--   note    = one line for the whole gym, <= 120 ("Ladies batch 11 am to 12 pm").
--   At least one weekday must be open. The same rules, in plain words, are the apps' own
--   (packages/theme/src/gymHours.ts, hoursProblem); here a breach is INVALID.
--
-- WHO MAY READ AND WRITE:
--   owner_gym_timings(key)            the hours (or null), who last changed them and canEdit. Owner or
--                                     front desk (the desk answers members on the phone).
--   owner_save_gym_timings(key, hours) save them (null: remove them, members then see nothing).
--                                     Owner only (OWNER_ONLY for the desk), like the gym's name and
--                                     branding; who saved is stamped from the session. INVALID.
--   member_gym_timings(key)           {ok, gymId, gymName, hours|null, updatedAt} for the member key of
--                                     the app's Join. Opening hours are public facts (they are on the
--                                     gym's door), so no check-in or name match is asked for; a member
--                                     who left has a new random key and gets BAD_KEY.
--   The table has RLS on, no policies and no grants; every read and write goes through these.
--   A suspended gym (0027) is read-only here too (the same trigger as its other tables).

set lock_timeout = '3s';

-- ------------------------------------------------------------------ table
create table if not exists public.gym_timings (
  gym_id          uuid primary key references public.gyms(gym_id) on delete cascade,
  hours           jsonb not null check (jsonb_typeof(hours) = 'object'),
  updated_by      uuid,
  updated_by_name text,
  updated_at      timestamptz not null default now()
);
alter table public.gym_timings enable row level security;
revoke all on public.gym_timings from public, anon, authenticated;

drop trigger if exists gym_timings_not_suspended on public.gym_timings;
create trigger gym_timings_not_suspended before insert or update or delete on public.gym_timings
  for each row execute function public._gym_not_suspended();

-- ------------------------------------------------------------------ helpers (no grants)
-- 'HH:MM' -> minutes after midnight; INVALID otherwise.
create or replace function public._hhmm_min(v jsonb) returns int
  language plpgsql immutable set search_path = public as $$
declare t text;
begin
  if v is null or jsonb_typeof(v) is distinct from 'string' then raise exception 'INVALID'; end if;
  t := v #>> '{}';
  if t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID'; end if;
  return split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int;
end $$;

-- One day as typed -> {kind, ranges (earliest first)}, or INVALID.
create or replace function public._timings_day(d jsonb) returns jsonb
  language plpgsql immutable set search_path = public as $$
declare
  k text; r jsonb; s int; c int; e int; prev_end int := -1;
  spans jsonb := '[]'::jsonb; out jsonb := '[]'::jsonb; x jsonb;
begin
  if jsonb_typeof(d) is distinct from 'object' or jsonb_typeof(d->'kind') is distinct from 'string' then raise exception 'INVALID'; end if;
  k := d->>'kind';
  if k not in ('closed', 'hours', 'allDay') then raise exception 'INVALID'; end if;
  if k <> 'hours' then
    if d ? 'ranges' and jsonb_typeof(d->'ranges') not in ('array', 'null') then raise exception 'INVALID'; end if;
    return jsonb_build_object('kind', k, 'ranges', '[]'::jsonb);
  end if;
  if jsonb_typeof(d->'ranges') is distinct from 'array' or jsonb_array_length(d->'ranges') not between 1 and 2 then raise exception 'INVALID'; end if;
  for r in select value from jsonb_array_elements(d->'ranges') loop
    if jsonb_typeof(r) is distinct from 'object' then raise exception 'INVALID'; end if;
    s := public._hhmm_min(r->'open');
    c := public._hhmm_min(r->'close');
    e := case when c = 0 then 1440 else c end;
    if e <= s then
      -- Past midnight: ends the next morning, by 06:00, never at the same minute it opened.
      if c = s or c > 360 then raise exception 'INVALID'; end if;
      e := c + 1440;
    end if;
    spans := spans || jsonb_build_array(jsonb_build_object('s', s, 'e', e, 'open', r->>'open', 'close', r->>'close'));
  end loop;
  for x in select value from jsonb_array_elements(spans) order by (value->>'s')::int loop
    if (x->>'s')::int < prev_end then raise exception 'INVALID'; end if;  -- two ranges overlap
    prev_end := (x->>'e')::int;
    out := out || jsonb_build_array(jsonb_build_object('open', x->>'open', 'close', x->>'close'));
  end loop;
  return jsonb_build_object('kind', 'hours', 'ranges', out);
end $$;

-- The whole set as typed -> its clean form (see the header), or INVALID.
create or replace function public._timings_clean(p jsonb) returns jsonb
  language plpgsql stable set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  dk text; week jsonb := '{}'::jsonb; any_open boolean := false; d jsonb;
  sp jsonb; special jsonb := '[]'::jsonb; dt date; seen date[] := '{}'; sn text; nt text; n int := 0;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 12000 then raise exception 'INVALID'; end if;
  if exists (select 1 from jsonb_object_keys(p) x where x not in ('week', 'special', 'note')) then raise exception 'INVALID'; end if;
  if jsonb_typeof(p->'week') is distinct from 'object' then raise exception 'INVALID'; end if;
  if exists (select 1 from jsonb_object_keys(p->'week') x where x not in ('mon','tue','wed','thu','fri','sat','sun')) then raise exception 'INVALID'; end if;
  foreach dk in array array['mon','tue','wed','thu','fri','sat','sun'] loop
    if not (p->'week' ? dk) then raise exception 'INVALID'; end if;
    d := public._timings_day(p->'week'->dk);
    if d->>'kind' <> 'closed' then any_open := true; end if;
    week := week || jsonb_build_object(dk, d);
  end loop;
  if not any_open then raise exception 'INVALID'; end if;

  if p ? 'note' and jsonb_typeof(p->'note') not in ('string', 'null') then raise exception 'INVALID'; end if;
  nt := nullif(btrim(coalesce(p->>'note', '')), '');
  if length(nt) > 120 then raise exception 'INVALID'; end if;

  if p ? 'special' and jsonb_typeof(p->'special') <> 'null' then
    if jsonb_typeof(p->'special') <> 'array' or jsonb_array_length(p->'special') > 60 then raise exception 'INVALID'; end if;
    for sp in select value from jsonb_array_elements(p->'special') loop
      if jsonb_typeof(sp) is distinct from 'object' or jsonb_typeof(sp->'date') is distinct from 'string'
         or (sp->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID'; end if;
      begin
        dt := (sp->>'date')::date;
      exception when others then
        raise exception 'INVALID';
      end;
      if to_char(dt, 'YYYY-MM-DD') <> sp->>'date' or dt > today + 400 or dt = any(seen) then raise exception 'INVALID'; end if;
      seen := seen || dt;
      if sp ? 'note' and jsonb_typeof(sp->'note') not in ('string', 'null') then raise exception 'INVALID'; end if;
      sn := nullif(btrim(coalesce(sp->>'note', '')), '');
      if length(sn) > 40 then raise exception 'INVALID'; end if;
      d := public._timings_day(sp);
      continue when dt < today - 1;  -- over: dropped
      n := n + 1;
      special := special || jsonb_build_array(d || jsonb_build_object('date', sp->>'date', 'note', sn));
    end loop;
    if n > 30 then raise exception 'INVALID'; end if;
    select coalesce(jsonb_agg(x order by x->>'date'), '[]'::jsonb) into special from jsonb_array_elements(special) x;
  end if;
  return jsonb_build_object('week', week, 'special', special, 'note', nt);
end $$;

-- The row as the admin app reads it.
create or replace function public._timings_json(r public.gym_timings, p_can_edit boolean) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object('hours', r.hours, 'updatedByName', r.updated_by_name,
    'updatedAt', case when r.updated_at is null then null else floor(extract(epoch from r.updated_at) * 1000)::bigint end,
    'canEdit', p_can_edit)
$$;

-- ------------------------------------------------------------------ the gym's side
create or replace function public.owner_gym_timings(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key); r public.gym_timings;
begin
  select * into r from public.gym_timings where gym_id = g;
  return public._timings_json(r, st.staff_id is null or st.role = 'owner');
end $$;

create or replace function public.owner_save_gym_timings(p_key text, p_hours jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  c jsonb;
  r public.gym_timings;
begin
  if p_hours is null or jsonb_typeof(p_hours) = 'null' then
    delete from public.gym_timings where gym_id = g;
    return public._timings_json(r, true);
  end if;
  c := public._timings_clean(p_hours);
  insert into public.gym_timings(gym_id, hours, updated_by, updated_by_name, updated_at)
    values (g, c, st.staff_id, case when st.staff_id is null then null else st.name end, now())
  on conflict (gym_id) do update
    set hours = excluded.hours, updated_by = excluded.updated_by, updated_by_name = excluded.updated_by_name, updated_at = now()
  returning * into r;
  return public._timings_json(r, true);
end $$;

-- ------------------------------------------------------------------ the member's side
create or replace function public.member_gym_timings(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); g public.gyms; r public.gym_timings;
begin
  select * into g from public.gyms where gym_id = m.gym_id;
  select * into r from public.gym_timings where gym_id = m.gym_id;
  return jsonb_build_object('ok', true, 'gymId', g.gym_id::text, 'gymName', g.name, 'hours', r.hours,
    'updatedAt', case when r.updated_at is null then null else floor(extract(epoch from r.updated_at) * 1000)::bigint end);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._hhmm_min(jsonb) from public, anon, authenticated;
revoke all on function public._timings_day(jsonb) from public, anon, authenticated;
revoke all on function public._timings_clean(jsonb) from public, anon, authenticated;
revoke all on function public._timings_json(public.gym_timings, boolean) from public, anon, authenticated;

revoke all on function public.owner_gym_timings(text) from public;
revoke all on function public.owner_save_gym_timings(text, jsonb) from public;
revoke all on function public.member_gym_timings(text) from public;
grant execute on function public.owner_gym_timings(text) to anon, authenticated;
grant execute on function public.owner_save_gym_timings(text, jsonb) to anon, authenticated;
grant execute on function public.member_gym_timings(text) to anon, authenticated;
