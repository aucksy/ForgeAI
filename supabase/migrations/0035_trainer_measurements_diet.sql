-- 0035: body measurements taken by the trainer, and diet plans from the trainer (R-120, 24 Oct 2026).
-- APPLIED LIVE 25 Oct 2026 (owner: tracker #64 A); live tests 0035 PASS 54, security PASS 9. Additive and re-runnable: two new tables,
-- new functions; nothing existing is changed.
--
-- 1. MEASUREMENTS. At the desk a trainer or the owner records a member's body measurements for a day:
--    body weight (kg), body fat (%), and the member app's nine tape measurements in cm (neck,
--    shoulders, chest, arm, forearm, waist, hips, thigh, calf: apps/mobile/src/tracker/engine/
--    measurements.ts). One entry per member per day (a second one on the same day: DAY_TAKEN, edit
--    that one instead). They show in that member's own MettleUp app (Progress -> Body) as
--    "From <gym>"; the member's own entries stay on the phone and are never sent here.
--    `member_id` is the gym's own member record (crm_records kind 'member'), so the desk can measure
--    a member before they have the app. Who measured is stamped from the session, never what the
--    device wrote. A mistyped entry may be deleted by the gym (the phone drops it on its next read).
--
-- 2. DIET PLANS. A trainer writes a plan (title, goal, daily calories / protein optional, meals with a
--    time and free-text lines, notes) and sends it to members by name and/or to everyone on a
--    membership plan covering today: exactly the workout plans' rule (0024). Never deleted:
--    "withdrawn" stops it going out. No food logging here.
--
-- Who may read and write:
--  - The gym's people: an owner key or a live session of the gym's staff (_owner_gym; a removed person's
--    session stops at once: BAD_KEY). Owner and front desk / trainers alike, like workout plans.
--  - The member: only their own measurements and the diet plans sent to them, through the member key
--    of the app's "Join" and 0023's identity checks (the number matched at a check-in, nothing typed;
--    the first name matches the gym's list; never for a shared number). A member who leaves the gym
--    gets a new random key (member_leave), so the old one reads nothing from then on.
--  - Nobody else: the tables have RLS on, no policies and no grants; every read and write goes through
--    the functions below, each scoped to the key's gym.
--
-- Apply: Supabase SQL editor, after 0034. Test: supabase/tests/0035_trainer_measurements_diet.sql.

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_body_measurements (
  measure_id  uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  member_id   text not null check (length(member_id) between 1 and 64),
  measured_on date not null,
  weight_kg   numeric(5,1) check (weight_kg is null or weight_kg between 20 and 350),
  body_fat    numeric(4,1) check (body_fat is null or body_fat between 2 and 75),
  -- {"waist": 82.5, ...} centimetres, only the keys measured.
  tape        jsonb not null default '{}'::jsonb check (jsonb_typeof(tape) = 'object'),
  note        text check (note is null or length(note) <= 200),
  by_staff    uuid,
  by_name     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (gym_id, member_id, measured_on)
);
create index if not exists idx_body_measurements_member on public.gym_body_measurements(gym_id, member_id, measured_on desc);

create table if not exists public.gym_diet_plans (
  plan_id     uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 80),
  goal        text check (goal is null or length(goal) <= 120),
  kcal        integer check (kcal is null or kcal between 800 and 6000),
  protein_g   integer check (protein_g is null or protein_g between 20 and 400),
  -- [{name, time, items: [text]}]
  meals       jsonb not null check (jsonb_typeof(meals) = 'array'),
  notes       text check (notes is null or length(notes) <= 1000),
  -- {memberIds: [roster ids], planIds: [membership plan ids]}
  assign      jsonb not null default '{"memberIds":[],"planIds":[]}'::jsonb check (jsonb_typeof(assign) = 'object'),
  withdrawn   boolean not null default false,
  created_by  uuid,
  created_by_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_diet_plans_gym on public.gym_diet_plans(gym_id, updated_at desc);

alter table public.gym_body_measurements enable row level security;
alter table public.gym_diet_plans        enable row level security;
revoke all on public.gym_body_measurements, public.gym_diet_plans from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
-- The nine tape measurements the member app knows (cm).
create or replace function public._tape_kinds() returns text[]
  language sql immutable set search_path = public as $$
  select array['neck','shoulders','chest','arm','forearm','waist','hips','thigh','calf']
$$;

-- A number from a jsonb value rounded to 0.1, null for null / missing; raises INVALID otherwise or
-- when it is outside [lo, hi].
create or replace function public._num01(v jsonb, lo numeric, hi numeric) returns numeric
  language plpgsql immutable set search_path = public as $$
declare n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then return null; end if;
  if jsonb_typeof(v) <> 'number' then raise exception 'INVALID'; end if;
  n := round((v #>> '{}')::numeric, 1);
  if n < lo or n > hi then raise exception 'INVALID'; end if;
  return n;
end $$;

-- An entry as typed -> its clean parts, or INVALID / EMPTY / BAD_DATE.
--   in:  {date:'YYYY-MM-DD', weightKg?, bodyFat?, tape?: {kind: cm}, note?}
--   out: {date, weightKg, bodyFat, tape, note}
create or replace function public._measure_clean(p jsonb) returns jsonb
  language plpgsql stable set search_path = public as $$
declare
  d date; w numeric; bf numeric; tape jsonb := '{}'::jsonb; k text; v jsonb; nt text;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 4000 then raise exception 'INVALID'; end if;
  if jsonb_typeof(p->'date') is distinct from 'string' or (p->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'BAD_DATE'; end if;
  begin
    d := (p->>'date')::date;
  exception when others then
    raise exception 'BAD_DATE';
  end;
  if d > today or d < date '2000-01-01' then raise exception 'BAD_DATE'; end if;
  w := public._num01(p->'weightKg', 20, 350);
  bf := public._num01(p->'bodyFat', 2, 75);
  if p ? 'tape' and jsonb_typeof(p->'tape') <> 'null' then
    if jsonb_typeof(p->'tape') <> 'object' then raise exception 'INVALID'; end if;
    for k, v in select key, value from jsonb_each(p->'tape') loop
      if not (k = any(public._tape_kinds())) then raise exception 'INVALID'; end if;
      if jsonb_typeof(v) = 'null' then continue; end if;
      tape := tape || jsonb_build_object(k, public._num01(v, 5, 300));
    end loop;
  end if;
  if p ? 'note' and jsonb_typeof(p->'note') not in ('string', 'null') then raise exception 'INVALID'; end if;
  nt := nullif(btrim(coalesce(p->>'note', '')), '');
  if length(nt) > 200 then raise exception 'INVALID'; end if;
  if w is null and bf is null and tape = '{}'::jsonb then raise exception 'EMPTY'; end if;
  return jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'), 'weightKg', w, 'bodyFat', bf, 'tape', tape, 'note', nt);
end $$;

-- One measurement row as the admin app and the member app read it.
create or replace function public._measure_json(r public.gym_body_measurements) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object('id', r.measure_id::text, 'memberId', r.member_id, 'date', to_char(r.measured_on, 'YYYY-MM-DD'),
    'weightKg', r.weight_kg, 'bodyFat', r.body_fat, 'tape', r.tape, 'note', r.note, 'byName', r.by_name,
    'createdAt', floor(extract(epoch from r.created_at) * 1000)::bigint, 'updatedAt', floor(extract(epoch from r.updated_at) * 1000)::bigint)
$$;

-- A diet plan as typed -> its clean parts, or INVALID.
--   {title, goal?, kcal?, proteinG?, meals: [{name, time?, items: [text]}], notes?, assign: {memberIds, planIds}}
create or replace function public._diet_clean(p jsonb) returns jsonb
  language plpgsql immutable set search_path = public as $$
declare
  t text; g text; n text; kc int; pr int; ml jsonb; meals jsonb := '[]'::jsonb; it jsonb; items jsonb; a jsonb;
  mname text; mtime text; line text;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 20000 then raise exception 'INVALID'; end if;
  if jsonb_typeof(p->'title') is distinct from 'string' then raise exception 'INVALID'; end if;
  t := btrim(p->>'title');
  if length(t) not between 1 and 80 then raise exception 'INVALID'; end if;
  if p ? 'goal' and jsonb_typeof(p->'goal') not in ('string', 'null') then raise exception 'INVALID'; end if;
  g := nullif(btrim(coalesce(p->>'goal', '')), '');
  if length(g) > 120 then raise exception 'INVALID'; end if;
  if p ? 'notes' and jsonb_typeof(p->'notes') not in ('string', 'null') then raise exception 'INVALID'; end if;
  n := nullif(btrim(coalesce(p->>'notes', '')), '');
  if length(n) > 1000 then raise exception 'INVALID'; end if;
  if p ? 'kcal' and jsonb_typeof(p->'kcal') <> 'null' then
    if jsonb_typeof(p->'kcal') <> 'number' then raise exception 'INVALID'; end if;
    kc := round((p->>'kcal')::numeric);
    if kc not between 800 and 6000 then raise exception 'INVALID'; end if;
  end if;
  if p ? 'proteinG' and jsonb_typeof(p->'proteinG') <> 'null' then
    if jsonb_typeof(p->'proteinG') <> 'number' then raise exception 'INVALID'; end if;
    pr := round((p->>'proteinG')::numeric);
    if pr not between 20 and 400 then raise exception 'INVALID'; end if;
  end if;
  if jsonb_typeof(p->'meals') is distinct from 'array' or jsonb_array_length(p->'meals') not between 1 and 10 then raise exception 'INVALID'; end if;
  for ml in select value from jsonb_array_elements(p->'meals') loop
    if jsonb_typeof(ml) is distinct from 'object' or jsonb_typeof(ml->'name') is distinct from 'string' then raise exception 'INVALID'; end if;
    mname := btrim(ml->>'name');
    if length(mname) not between 1 and 40 then raise exception 'INVALID'; end if;
    if ml ? 'time' and jsonb_typeof(ml->'time') not in ('string', 'null') then raise exception 'INVALID'; end if;
    mtime := nullif(btrim(coalesce(ml->>'time', '')), '');
    if length(mtime) > 20 then raise exception 'INVALID'; end if;
    if jsonb_typeof(ml->'items') is distinct from 'array' or jsonb_array_length(ml->'items') > 20 then raise exception 'INVALID'; end if;
    items := '[]'::jsonb;
    for it in select value from jsonb_array_elements(ml->'items') loop
      if jsonb_typeof(it) <> 'string' then raise exception 'INVALID'; end if;
      line := btrim(it #>> '{}');
      if length(line) > 120 then raise exception 'INVALID'; end if;
      if length(line) > 0 then items := items || to_jsonb(line); end if;
    end loop;
    if jsonb_array_length(items) = 0 then raise exception 'INVALID'; end if;
    meals := meals || jsonb_build_array(jsonb_build_object('name', mname, 'time', mtime, 'items', items));
  end loop;
  a := p->'assign';
  if jsonb_typeof(a) is distinct from 'object' then raise exception 'INVALID'; end if;
  if jsonb_typeof(a->'memberIds') is distinct from 'array' or jsonb_array_length(a->'memberIds') > 2000
     or jsonb_typeof(a->'planIds') is distinct from 'array' or jsonb_array_length(a->'planIds') > 100 then raise exception 'INVALID'; end if;
  if exists (select 1 from jsonb_array_elements(a->'memberIds') e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 64)
     or exists (select 1 from jsonb_array_elements(a->'planIds') e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 64) then
    raise exception 'INVALID';
  end if;
  return jsonb_build_object('title', t, 'goal', g, 'kcal', kc, 'proteinG', pr, 'meals', meals, 'notes', n,
    'assign', jsonb_build_object('memberIds', (select coalesce(jsonb_agg(distinct e), '[]'::jsonb) from jsonb_array_elements(a->'memberIds') e),
                                 'planIds', (select coalesce(jsonb_agg(distinct e), '[]'::jsonb) from jsonb_array_elements(a->'planIds') e)));
end $$;

-- One diet plan as the admin app reads it (the member app gets fewer fields).
create or replace function public._diet_json(r public.gym_diet_plans) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object('id', r.plan_id::text, 'title', r.title, 'goal', r.goal, 'kcal', r.kcal, 'proteinG', r.protein_g,
    'meals', r.meals, 'notes', r.notes, 'assign', r.assign, 'withdrawn', r.withdrawn, 'byName', r.created_by_name,
    'createdAt', floor(extract(epoch from r.created_at) * 1000)::bigint, 'updatedAt', floor(extract(epoch from r.updated_at) * 1000)::bigint)
$$;

-- The member behind a member key, checked exactly as member_gym_plans (0024) does, in its order:
--   {rosterId, gymId, gymName}  or  {error: NO_PHONE | GYM_NOT_ONLINE | NOT_ON_ROSTER | SHARED_NUMBER | NAME_MISMATCH, gymName}
-- Raises BAD_KEY for a key that opens nobody (a member who left has a new random key).
create or replace function public._member_roster_link(p_key text) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  g public.gyms;
  ph text;
  roster public.crm_records;
  sharing int;
begin
  select * into g from public.gyms where gym_id = m.gym_id;
  ph := public._norm_phone(m.checkin_phone);
  if ph is null then return jsonb_build_object('error', 'NO_PHONE', 'gymName', g.name); end if;
  if coalesce(g.crm_version, 0) = 0
     and not exists (select 1 from public.crm_records where gym_id = g.gym_id and kind = 'member') then
    return jsonb_build_object('error', 'GYM_NOT_ONLINE', 'gymName', g.name);
  end if;
  roster := public._checkin_roster_member(g.gym_id, ph);
  if roster.id is null then return jsonb_build_object('error', 'NOT_ON_ROSTER', 'gymName', g.name); end if;
  select count(*) into sharing from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'member' and not r.deleted
     and coalesce(r.data->>'archived', 'false') <> 'true'
     and public._norm_phone(r.data->>'phone') = ph;
  if sharing > 1 then return jsonb_build_object('error', 'SHARED_NUMBER', 'gymName', g.name); end if;
  if public._first_name_key(roster.data->>'fullName') is null
     or public._first_name_key(roster.data->>'fullName') is distinct from public._first_name_key(m.name) then
    return jsonb_build_object('error', 'NAME_MISMATCH', 'gymName', g.name);
  end if;
  return jsonb_build_object('rosterId', roster.id, 'gymId', g.gym_id::text, 'gymName', g.name);
end $$;

-- A live member of this gym (on the gym's list, not deleted); NO_MEMBER otherwise.
create or replace function public._roster_member_ok(p_gym uuid, p_member text) returns void
  language plpgsql stable security definer set search_path = public as $$
begin
  if p_member is null or not exists (select 1 from public.crm_records r
      where r.gym_id = p_gym and r.kind = 'member' and r.id = p_member and not r.deleted) then
    raise exception 'NO_MEMBER';
  end if;
end $$;

-- ------------------------------------------------------------------ measurements: the gym's side
-- A member's measurements, newest day first (owner and front desk / trainers).
create or replace function public.owner_member_measurements(p_key text, p_member text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key);
begin
  return coalesce((select jsonb_agg(public._measure_json(r) order by r.measured_on desc)
                     from public.gym_body_measurements r
                    where r.gym_id = g and r.member_id = p_member), '[]'::jsonb);
end $$;

-- Save one day's measurements. No id: a new entry (DAY_TAKEN when that day already has one).
-- With an id: change that entry (its day may move; NOT_FOUND when it is not this gym's member's).
-- Returns the saved row. Who measured: the signed-in person, on a new entry only.
create or replace function public.owner_save_measurement(p_key text, p_member text, p_entry jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  c jsonb;
  rid uuid;
  r public.gym_body_measurements;
begin
  perform public._roster_member_ok(g, p_member);
  c := public._measure_clean(p_entry);
  if p_entry ? 'id' and jsonb_typeof(p_entry->'id') = 'string' then
    begin
      rid := (p_entry->>'id')::uuid;
    exception when others then
      raise exception 'NOT_FOUND';
    end;
  end if;
  begin
    if rid is null then
      insert into public.gym_body_measurements(gym_id, member_id, measured_on, weight_kg, body_fat, tape, note, by_staff, by_name)
        values (g, p_member, (c->>'date')::date, (c->>'weightKg')::numeric, (c->>'bodyFat')::numeric, c->'tape', c->>'note',
                st.staff_id, case when st.staff_id is null then null else st.name end)
        returning * into r;
    else
      update public.gym_body_measurements
         set measured_on = (c->>'date')::date, weight_kg = (c->>'weightKg')::numeric, body_fat = (c->>'bodyFat')::numeric,
             tape = c->'tape', note = c->>'note', updated_at = now()
       where measure_id = rid and gym_id = g and member_id = p_member
       returning * into r;
      if r.measure_id is null then raise exception 'NOT_FOUND'; end if;
    end if;
  exception when unique_violation then
    raise exception 'DAY_TAKEN';
  end;
  return public._measure_json(r);
end $$;

-- Delete a mistyped entry (NOT_FOUND when it is not this gym's). The member's phone drops it on its next read.
create or replace function public.owner_delete_measurement(p_key text, p_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); n int;
begin
  delete from public.gym_body_measurements where measure_id = p_id and gym_id = g;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'NOT_FOUND'; end if;
end $$;

-- ------------------------------------------------------------------ measurements: the member's side
-- {ok:true, gymId, gymName, entries: [{id, date, weightKg, bodyFat, tape, byName, updatedAt}]} (newest day first,
-- at most 500), or {error, gymName} (see _member_roster_link). The note is the gym's own and stays at the desk.
create or replace function public.member_measurements(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l jsonb := public._member_roster_link(p_key); g uuid; out jsonb;
begin
  if l ? 'error' then return l; end if;
  g := (l->>'gymId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.measure_id::text, 'date', to_char(x.measured_on, 'YYYY-MM-DD'),
           'weightKg', x.weight_kg, 'bodyFat', x.body_fat, 'tape', x.tape, 'byName', x.by_name,
           'updatedAt', floor(extract(epoch from x.updated_at) * 1000)::bigint) order by x.measured_on desc), '[]'::jsonb)
    into out
    from (select * from public.gym_body_measurements r
           where r.gym_id = g and r.member_id = l->>'rosterId'
           order by r.measured_on desc limit 500) x;
  return jsonb_build_object('ok', true, 'gymId', l->>'gymId', 'gymName', l->>'gymName', 'entries', out);
end $$;

-- ------------------------------------------------------------------ diet plans: the gym's side
-- Every diet plan of the gym, withdrawn ones too (newest change first).
create or replace function public.owner_diet_plans(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key);
begin
  return coalesce((select jsonb_agg(public._diet_json(r) order by r.updated_at desc)
                     from public.gym_diet_plans r where r.gym_id = g), '[]'::jsonb);
end $$;

-- Make a plan (no id) or change one (with id; NOT_FOUND when it is not this gym's; WITHDRAWN when it
-- was withdrawn: make a copy instead). Returns the saved plan. Who made it: the signed-in person, kept
-- on every later save.
create or replace function public.owner_save_diet_plan(p_key text, p_plan jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  c jsonb := public._diet_clean(p_plan);
  rid uuid;
  r public.gym_diet_plans;
begin
  if p_plan ? 'id' and jsonb_typeof(p_plan->'id') = 'string' then
    begin
      rid := (p_plan->>'id')::uuid;
    exception when others then
      raise exception 'NOT_FOUND';
    end;
  end if;
  if rid is null then
    insert into public.gym_diet_plans(gym_id, title, goal, kcal, protein_g, meals, notes, assign, created_by, created_by_name)
      values (g, c->>'title', c->>'goal', (c->>'kcal')::int, (c->>'proteinG')::int, c->'meals', c->>'notes', c->'assign',
              st.staff_id, case when st.staff_id is null then null else st.name end)
      returning * into r;
  else
    select * into r from public.gym_diet_plans where plan_id = rid and gym_id = g for update;
    if r.plan_id is null then raise exception 'NOT_FOUND'; end if;
    if r.withdrawn then raise exception 'WITHDRAWN'; end if;
    update public.gym_diet_plans
       set title = c->>'title', goal = c->>'goal', kcal = (c->>'kcal')::int, protein_g = (c->>'proteinG')::int,
           meals = c->'meals', notes = c->>'notes', assign = c->'assign', updated_at = now()
     where plan_id = rid
     returning * into r;
  end if;
  return public._diet_json(r);
end $$;

-- Withdraw: members stop getting it (their phones drop it on the next read). Never deleted.
create or replace function public.owner_withdraw_diet_plan(p_key text, p_id uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); r public.gym_diet_plans;
begin
  update public.gym_diet_plans set withdrawn = true, updated_at = now()
   where plan_id = p_id and gym_id = g
   returning * into r;
  if r.plan_id is null then raise exception 'NOT_FOUND'; end if;
  return public._diet_json(r);
end $$;

-- ------------------------------------------------------------------ diet plans: the member's side
-- {ok:true, gymId, gymName, plans: [{id, title, goal, kcal, proteinG, meals, notes, byName, updatedAt}]}, or
-- {error, gymName}. A plan is sent to the member when its memberIds hold their id on the gym's list, or
-- its planIds hold the plan of a membership covering today (0024's rule). Withdrawn plans never.
create or replace function public.member_diet_plans(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  l jsonb := public._member_roster_link(p_key);
  g uuid;
  rid text;
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  my_plans text[];
  out jsonb;
begin
  if l ? 'error' then return l; end if;
  g := (l->>'gymId')::uuid;
  rid := l->>'rosterId';
  select coalesce(array_agg(distinct r.data->>'planId'), '{}') into my_plans
    from public.crm_records r
   where r.gym_id = g and r.kind = 'membership' and not r.deleted
     and r.data->>'memberId' = rid
     and coalesce(r.data->>'cancelled', 'false') <> 'true'
     and r.data->>'startsOn' <= day and r.data->>'endsOn' >= day;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.plan_id::text, 'title', d.title, 'goal', d.goal, 'kcal', d.kcal,
           'proteinG', d.protein_g, 'meals', d.meals, 'notes', d.notes, 'byName', d.created_by_name,
           'updatedAt', floor(extract(epoch from d.updated_at) * 1000)::bigint) order by d.updated_at desc), '[]'::jsonb)
    into out
    from public.gym_diet_plans d
   where d.gym_id = g and not d.withdrawn
     and (d.assign->'memberIds' ? rid
          or exists (select 1 from jsonb_array_elements_text(d.assign->'planIds') p where p = any(my_plans)));
  return jsonb_build_object('ok', true, 'gymId', l->>'gymId', 'gymName', l->>'gymName', 'plans', out);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._tape_kinds() from public, anon, authenticated;
revoke all on function public._num01(jsonb, numeric, numeric) from public, anon, authenticated;
revoke all on function public._measure_clean(jsonb) from public, anon, authenticated;
revoke all on function public._measure_json(public.gym_body_measurements) from public, anon, authenticated;
revoke all on function public._diet_clean(jsonb) from public, anon, authenticated;
revoke all on function public._diet_json(public.gym_diet_plans) from public, anon, authenticated;
revoke all on function public._member_roster_link(text) from public, anon, authenticated;
revoke all on function public._roster_member_ok(uuid, text) from public, anon, authenticated;

revoke all on function public.owner_member_measurements(text, text) from public;
revoke all on function public.owner_save_measurement(text, text, jsonb) from public;
revoke all on function public.owner_delete_measurement(text, uuid) from public;
revoke all on function public.member_measurements(text) from public;
revoke all on function public.owner_diet_plans(text) from public;
revoke all on function public.owner_save_diet_plan(text, jsonb) from public;
revoke all on function public.owner_withdraw_diet_plan(text, uuid) from public;
revoke all on function public.member_diet_plans(text) from public;
grant execute on function public.owner_member_measurements(text, text) to anon, authenticated;
grant execute on function public.owner_save_measurement(text, text, jsonb) to anon, authenticated;
grant execute on function public.owner_delete_measurement(text, uuid) to anon, authenticated;
grant execute on function public.member_measurements(text) to anon, authenticated;
grant execute on function public.owner_diet_plans(text) to anon, authenticated;
grant execute on function public.owner_save_diet_plan(text, jsonb) to anon, authenticated;
grant execute on function public.owner_withdraw_diet_plan(text, uuid) to anon, authenticated;
grant execute on function public.member_diet_plans(text) to anon, authenticated;
