-- APPLIED LIVE 3 Nov 2026 (owner pressed Run in the SQL Editor on one query with 0049 + 0050 + 0051, text = git; functions answer live).
--
-- 0049: busy machines by day and hour (F137; owner's words in OWNER-INBOX #68, 28-29 Oct 2026: "predict which
-- machines get busy on each day and hour ... show it only when it is proven accurate"; "make it a feature the
-- owner switches on in the admin app; on switching it on, they enter how many of each machine they have, from a
-- ready list; they can add a missing machine with its count"; "suggest members move routines to quieter days").
-- Additive and re-runnable: three new tables, new functions, a trigger on each new table and one new trigger on
-- gym_members (leaving); nothing that exists is changed. Apply after 0047 (needs 0027's _gym_not_suspended,
-- 0018's _owner_only_gym, 0010's _staff). Test: supabase/tests/0049_busy_by_exercise.sql (CI runs it after
-- every migration; pasted into the SQL Editor it always ends in an error and so changes nothing).
-- Undo: drop the six public functions below, the trigger gym_members_mbusy_left, and the three tables.
--
-- OFF BY DEFAULT. Nothing is kept for a gym until its owner switches it on (owner_save_machine_setup). While
-- it is off a member's phone is told {on:false} and whatever it sends is thrown away. Switching it off deletes
-- every member-linked row of that gym at once (the kept guesses hold no member ids and stay).
--
-- THE MACHINES (gym_machine_setup.machines, set by the owner): [{id, name, units, ex, own}]
--   id     'leg_press' (the ready list, packages/theme/src/busyMachines.ts) or 'own_xxx' (one the owner added)
--   units  how many the gym has, 1 to 50. ONLY machines with 1 or 2 units are guessed about (owner, #68: "Only
--          machines with 1 or 2 units count as 'can get busy'"); the rest are kept, never guessed.
--   ex     the exercises done on it: the app's exercise library keys ('leg_press', 'hack_squat'), 1 to 40.
--          A machine with none is kept, never guessed.
--
-- WHAT LEAVES THE PHONE (member_machine_push; only a phone that joined this gym, and only while it is on):
--   per workout of the last 35 days {"d":"YYYY-MM-DD","h":hour it started 0..23,"x":[library keys]}. Only keys
--   of this gym's machines are sent (the phone learns them from member_machine_busy) and only those are kept.
--   No name, no sets, no weights, no workout title, no exact time. The member's own exercises (no library
--   key) never leave. Kept per member (gym_exercise_starts) so a push can replace it and leaving can delete it.
--   A push REPLACES that member's rows from 35 days ago on. Rows older than 63 days are deleted on the next
--   refresh. Leaving the gym deletes them at once (trigger).
--
-- THE GUESS AND ITS WEEKLY SELF-CHECK (results on read, no nightly job; 0047's way). The first refresh in each
-- India week (Monday to Sunday) makes, for every machine with 1 or 2 units and at least one exercise, a guess
-- for that week from the weeks before it only (never from the week itself):
--   n(slot)  for one weekday + hour: how many (member, day) pairs started one of the machine's exercises then;
--   P(slot)  the average n over the last up-to-4 whole weeks; a guess needs 3 weeks of data at least;
--   level    2 "busy" when P >= units (on average at least one app member per machine starts on it then) AND
--            at least 3 different members did over those weeks (no single person's habit shows as "busy");
--            1 when P >= units / 2; else 0 "quiet". The guess keeps its units and exercises as they were.
-- The first refresh after that week has ended checks it: actually busy = n(slot) >= units in that week, and
--          at least 2 (one person alone is not a queue).
--   right  when the busy slots guessed and the busy slots seen overlap by half or more (shared / either: the
--          Jaccard index >= 0.5). A week where neither side had a busy slot says nothing (ok null).
--   PROVEN a machine whose last 6 checked weeks (ok not null) hold at least 4, and at least 4 of them right
--          ("right most weeks", #68). Only proven machines reach members, with this week's guess.
-- Refreshing runs at most once a minute per gym (gym_machine_setup.refreshed_at), by whoever reads first:
-- member_machine_busy or owner_machine_setup. A suspended gym (0027) is not refreshed and refuses pushes and
-- saves; reading and deleting stay allowed.
--
-- WHO MAY READ AND WRITE (the tables have RLS on, no policies and no grants):
--   owner_machine_setup(key)                       owner or front desk: the switch, the machines, canEdit, and
--                                                  per machine the self-check: weeksChecked, weeksRight, proven.
--   owner_save_machine_setup(key, enabled, list)   owner only (OWNER_ONLY for the desk). INVALID for a bad list.
--   member_machine_busy(key)                       {ok, on, keys, machines}: when on, the library keys this gym's
--                                                  machines use (what the phone may send) and the PROVEN machines
--                                                  only: {id, name, units, ex, week: {"mon":[24 levels 0..2], ...}}.
--   member_machine_push(key, workouts)             {ok, on}; INVALID / SUSPENDED / BAD_KEY.
-- Errors: BAD_KEY (no such key; a member who left), OWNER_ONLY, INVALID, SUSPENDED.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_machine_setup (
  gym_id          uuid primary key references public.gyms(gym_id) on delete cascade,
  enabled         boolean not null default false,
  machines        jsonb not null default '[]'::jsonb,
  updated_by      uuid,
  updated_by_name text,
  updated_at      timestamptz not null default now(),
  refreshed_at    timestamptz
);
alter table public.gym_machine_setup enable row level security;
revoke all on public.gym_machine_setup from public, anon, authenticated;

create table if not exists public.gym_exercise_starts (
  gym_id    uuid not null references public.gyms(gym_id) on delete cascade,
  member_id uuid not null references public.gym_members(member_id) on delete cascade,
  day       date not null,
  hour      smallint not null check (hour between 0 and 23),
  ex        text not null check (ex ~ '^[a-z0-9_]{1,60}$'),
  primary key (gym_id, member_id, day, hour, ex)
);
create index if not exists gym_exercise_starts_by_day on public.gym_exercise_starts(gym_id, day);
alter table public.gym_exercise_starts enable row level security;
revoke all on public.gym_exercise_starts from public, anon, authenticated;

-- One guess per gym, week (its Monday) and machine; checked once the week is over. No member ids.
create table if not exists public.gym_machine_guesses (
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  week_start  date not null,
  machine_id  text not null,
  units       int not null,
  ex          text[] not null,
  levels      jsonb not null,
  busy        text[] not null,
  made_at     timestamptz not null default now(),
  checked_at  timestamptz,
  seen_busy   text[],
  ok          boolean,
  primary key (gym_id, week_start, machine_id)
);
alter table public.gym_machine_guesses enable row level security;
revoke all on public.gym_machine_guesses from public, anon, authenticated;

-- Suspended gym: inserts and updates are refused (0027); deletes pass, so leaving and clean-ups still work.
drop trigger if exists gym_machine_setup_not_suspended on public.gym_machine_setup;
create trigger gym_machine_setup_not_suspended before insert or update on public.gym_machine_setup
  for each row execute function public._gym_not_suspended();
drop trigger if exists gym_exercise_starts_not_suspended on public.gym_exercise_starts;
create trigger gym_exercise_starts_not_suspended before insert or update on public.gym_exercise_starts
  for each row execute function public._gym_not_suspended();
drop trigger if exists gym_machine_guesses_not_suspended on public.gym_machine_guesses;
create trigger gym_machine_guesses_not_suspended before insert or update on public.gym_machine_guesses
  for each row execute function public._gym_not_suspended();

-- ------------------------------------------------------------------ helpers (no grants)
-- The weekday key of a date: 'mon'..'sun'.
create or replace function public._mbusy_dk(p_day date) returns text
  language sql immutable set search_path = public as $$
  select (array['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow from p_day)::int]
$$;

-- The owner's list, checked and tidied; raises INVALID. Ids unique; names trimmed; keys unique per machine.
create or replace function public._mbusy_clean(p_list jsonb) returns jsonb
  language plpgsql immutable set search_path = public as $$
declare
  e jsonb; x jsonb; out jsonb := '[]'::jsonb; ids text[] := '{}'; keys text[]; nm text; u numeric;
begin
  if p_list is null or jsonb_typeof(p_list) is distinct from 'array' or jsonb_array_length(p_list) > 80 then
    raise exception 'INVALID';
  end if;
  for e in select value from jsonb_array_elements(p_list) loop
    if jsonb_typeof(e) is distinct from 'object'
       or jsonb_typeof(e->'id') is distinct from 'string' or (e->>'id') !~ '^[a-z0-9_]{1,40}$'
       or jsonb_typeof(e->'name') is distinct from 'string'
       or jsonb_typeof(e->'units') is distinct from 'number'
       or jsonb_typeof(e->'ex') is distinct from 'array' or jsonb_array_length(e->'ex') > 40 then
      raise exception 'INVALID';
    end if;
    nm := regexp_replace(btrim(e->>'name'), '\s+', ' ', 'g');
    u := (e->>'units')::numeric;
    if length(nm) < 1 or length(nm) > 40 or u <> trunc(u) or u < 1 or u > 50 or (e->>'id') = any(ids) then
      raise exception 'INVALID';
    end if;
    keys := '{}';
    for x in select value from jsonb_array_elements(e->'ex') loop
      if jsonb_typeof(x) is distinct from 'string' or (x #>> '{}') !~ '^[a-z0-9_]{1,60}$' then raise exception 'INVALID'; end if;
      if not ((x #>> '{}') = any(keys)) then keys := keys || (x #>> '{}'); end if;
    end loop;
    ids := ids || (e->>'id');
    out := out || jsonb_build_array(jsonb_build_object('id', e->>'id', 'name', nm, 'units', u::int,
             'ex', to_jsonb(keys), 'own', coalesce((e->>'own')::boolean, false)));
  end loop;
  return out;
end $$;

-- Every library key this gym's machines use (what a phone may send).
create or replace function public._mbusy_keys(p_machines jsonb) returns text[]
  language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct k order by k), '{}')
    from jsonb_array_elements(coalesce(p_machines, '[]'::jsonb)) m, jsonb_array_elements_text(m->'ex') k
$$;

-- Starts per weekday + hour for some exercises between two days: n = (member, day) pairs, people = members.
create or replace function public._mbusy_counts(p_gym uuid, p_from date, p_to date, p_ex text[])
  returns table(slot text, n int, people int)
  language sql stable set search_path = public as $$
  select public._mbusy_dk(s.day) || ':' || s.hour, count(distinct (s.member_id, s.day))::int, count(distinct s.member_id)::int
    from public.gym_exercise_starts s
   where s.gym_id = p_gym and s.day between p_from and p_to and s.ex = any(p_ex)
   group by 1
$$;

-- The guess for one machine and week from the weeks before it: {levels, busy} or null (under 3 weeks of data).
create or replace function public._mbusy_guess(p_gym uuid, p_week date, p_units int, p_ex text[], p_first date)
  returns jsonb language plpgsql stable set search_path = public as $$
declare
  k int; c record; lv int; dks text[] := array['mon','tue','wed','thu','fri','sat','sun'];
  levels jsonb := '{}'::jsonb; busy text[] := '{}'; i int; arr jsonb; p numeric; lvls jsonb := '{}'::jsonb; h int;
begin
  if p_first is null then return null; end if;
  k := least(4, (p_week - p_first) / 7);
  if k < 3 then return null; end if;
  for c in select * from public._mbusy_counts(p_gym, p_week - 7 * k, p_week - 1, p_ex) loop
    p := c.n::numeric / k;
    lv := case when p >= p_units and c.people >= 3 then 2 when p >= p_units / 2.0 then 1 else 0 end;
    if lv > 0 then lvls := lvls || jsonb_build_object(c.slot, lv); end if;
    if lv = 2 then busy := busy || c.slot; end if;
  end loop;
  for i in 1 .. 7 loop
    arr := '[]'::jsonb;
    for h in 0 .. 23 loop arr := arr || to_jsonb(coalesce((lvls->>(dks[i] || ':' || h))::int, 0)); end loop;
    levels := levels || jsonb_build_object(dks[i], arr);
  end loop;
  return jsonb_build_object('levels', levels, 'busy', to_jsonb(array(select x from unnest(busy) x order by 1)));
end $$;

-- Guess this week, check finished weeks, clean old rows: for one gym, as of an India day (tests pass the day).
create or replace function public._mbusy_refresh(p_gym uuid, p_today date) returns void
  language plpgsql security definer set search_path = public as $$
declare
  s public.gym_machine_setup; wk date := p_today - (extract(isodow from p_today)::int - 1); first_day date; m jsonb; g jsonb;
  q public.gym_machine_guesses; seen text[]; shared int; either int; ex text[];
begin
  select * into s from public.gym_machine_setup where gym_id = p_gym;
  if s.gym_id is null or not s.enabled then return; end if;
  if exists (select 1 from public.gyms where gym_id = p_gym and status = 'suspended') then return; end if;
  delete from public.gym_exercise_starts where gym_id = p_gym and day < p_today - 63;
  select min(day) into first_day from public.gym_exercise_starts where gym_id = p_gym;

  for m in select value from jsonb_array_elements(s.machines) loop
    if (m->>'units')::int not between 1 and 2 or jsonb_array_length(m->'ex') = 0 then continue; end if;
    if exists (select 1 from public.gym_machine_guesses where gym_id = p_gym and week_start = wk and machine_id = m->>'id') then continue; end if;
    ex := array(select jsonb_array_elements_text(m->'ex'));
    g := public._mbusy_guess(p_gym, wk, (m->>'units')::int, ex, first_day);
    if g is null then continue; end if;
    insert into public.gym_machine_guesses(gym_id, week_start, machine_id, units, ex, levels, busy)
      values (p_gym, wk, m->>'id', (m->>'units')::int, ex, g->'levels', array(select jsonb_array_elements_text(g->'busy')))
    on conflict do nothing;
  end loop;

  for q in select * from public.gym_machine_guesses
            where gym_id = p_gym and checked_at is null and week_start + 7 <= p_today for update loop
    seen := array(select c.slot from public._mbusy_counts(p_gym, q.week_start, q.week_start + 6, q.ex) c
                   where c.n >= q.units and c.n >= 2 order by 1);
    select count(*) into shared from unnest(q.busy) b where b = any(seen);
    either := (select count(*) from (select unnest(q.busy) union select unnest(seen)) u);
    update public.gym_machine_guesses
       set checked_at = now(), seen_busy = seen,
           ok = case when either = 0 then null else shared::numeric / either >= 0.5 end
     where gym_id = q.gym_id and week_start = q.week_start and machine_id = q.machine_id;
  end loop;
  -- Guesses older than a year say nothing more about now.
  delete from public.gym_machine_guesses where gym_id = p_gym and week_start < p_today - 371;
end $$;

-- At most once a minute per gym (the first reader of the minute refreshes).
create or replace function public._mbusy_maybe_refresh(p_gym uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare ran uuid;
begin
  if exists (select 1 from public.gyms where gym_id = p_gym and status = 'suspended') then return; end if;
  update public.gym_machine_setup set refreshed_at = now()
   where gym_id = p_gym and enabled and (refreshed_at is null or refreshed_at < now() - interval '1 minute')
  returning gym_id into ran;
  if ran is not null then perform public._mbusy_refresh(p_gym, (now() at time zone 'Asia/Kolkata')::date); end if;
end $$;

-- A machine's self-check over its last 6 checked weeks: {weeksChecked, weeksRight, proven}.
create or replace function public._mbusy_score(p_gym uuid, p_machine text) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object('weeksChecked', count(*), 'weeksRight', count(*) filter (where q.ok),
                            'proven', count(*) >= 4 and count(*) filter (where q.ok) >= 4)
    from (select ok from public.gym_machine_guesses
           where gym_id = p_gym and machine_id = p_machine and ok is not null
           order by week_start desc limit 6) q
$$;

-- What a member sees, as of an India day (tests pass the day).
create or replace function public._mbusy_member_view(p_gym uuid, p_today date) returns jsonb
  language plpgsql stable set search_path = public as $$
declare s public.gym_machine_setup; m jsonb; q public.gym_machine_guesses; out jsonb := '[]'::jsonb;
begin
  select * into s from public.gym_machine_setup where gym_id = p_gym;
  if s.gym_id is null or not s.enabled then
    return jsonb_build_object('ok', true, 'on', false, 'keys', '[]'::jsonb, 'machines', '[]'::jsonb);
  end if;
  for m in select value from jsonb_array_elements(s.machines) loop
    if not coalesce((public._mbusy_score(p_gym, m->>'id')->>'proven')::boolean, false) then continue; end if;
    select * into q from public.gym_machine_guesses
     where gym_id = p_gym and machine_id = m->>'id' and week_start = p_today - (extract(isodow from p_today)::int - 1);
    if q.gym_id is null then continue; end if;
    out := out || jsonb_build_array(jsonb_build_object('id', m->>'id', 'name', m->>'name', 'units', q.units,
             'ex', to_jsonb(q.ex), 'week', q.levels));
  end loop;
  return jsonb_build_object('ok', true, 'on', true, 'keys', to_jsonb(public._mbusy_keys(s.machines)), 'machines', out);
end $$;

-- What the admin app reads, as of an India day.
create or replace function public._mbusy_owner_view(p_gym uuid, p_can_edit boolean, p_today date) returns jsonb
  language plpgsql stable set search_path = public as $$
declare s public.gym_machine_setup; m jsonb; list jsonb := '[]'::jsonb; senders int; counted boolean;
begin
  select * into s from public.gym_machine_setup where gym_id = p_gym;
  for m in select value from jsonb_array_elements(coalesce(s.machines, '[]'::jsonb)) loop
    counted := (m->>'units')::int between 1 and 2 and jsonb_array_length(m->'ex') > 0;
    list := list || jsonb_build_array(m || jsonb_build_object('counted', counted,
              'check', case when counted then public._mbusy_score(p_gym, m->>'id') else null end));
  end loop;
  select count(distinct member_id) into senders from public.gym_exercise_starts where gym_id = p_gym and day >= p_today - 35;
  return jsonb_build_object('enabled', coalesce(s.enabled, false), 'machines', list, 'canEdit', p_can_edit,
    -- Fewer than 5: no number (never a count that points at one or two people).
    'membersSending', case when senders >= 5 then senders else null end,
    'updatedByName', s.updated_by_name,
    'updatedAt', case when s.gym_id is null then null else floor(extract(epoch from s.updated_at) * 1000)::bigint end);
end $$;

-- Leaving the gym takes the member's rows with it at once.
create or replace function public._mbusy_member_left() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.gym_exercise_starts where member_id = new.member_id;
  return new;
end $$;
drop trigger if exists gym_members_mbusy_left on public.gym_members;
create trigger gym_members_mbusy_left after update of left_at on public.gym_members
  for each row when (old.left_at is null and new.left_at is not null)
  execute function public._mbusy_member_left();

-- ------------------------------------------------------------------ the gym's side
create or replace function public.owner_machine_setup(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key);
begin
  perform public._mbusy_maybe_refresh(g);
  return public._mbusy_owner_view(g, st.staff_id is null or st.role = 'owner', (now() at time zone 'Asia/Kolkata')::date);
end $$;

create or replace function public.owner_save_machine_setup(p_key text, p_enabled boolean, p_machines jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  c jsonb;
begin
  if p_enabled is null then raise exception 'INVALID'; end if;
  c := public._mbusy_clean(p_machines);
  if exists (select 1 from public.gyms where gym_id = g and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  insert into public.gym_machine_setup(gym_id, enabled, machines, updated_by, updated_by_name, updated_at)
    values (g, p_enabled, c, st.staff_id, case when st.staff_id is null then null else st.name end, now())
  on conflict (gym_id) do update
    set enabled = excluded.enabled, machines = excluded.machines, updated_by = excluded.updated_by,
        updated_by_name = excluded.updated_by_name, updated_at = now();
  -- Off: every member-linked row goes now. On: rows for exercises no machine uses any more go too.
  if not p_enabled then
    delete from public.gym_exercise_starts where gym_id = g;
  else
    delete from public.gym_exercise_starts where gym_id = g and not (ex = any(public._mbusy_keys(c)));
  end if;
  return public._mbusy_owner_view(g, true, (now() at time zone 'Asia/Kolkata')::date);
end $$;

-- ------------------------------------------------------------------ the member's side
create or replace function public.member_machine_busy(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key);
begin
  perform public._mbusy_maybe_refresh(m.gym_id);
  return public._mbusy_member_view(m.gym_id, (now() at time zone 'Asia/Kolkata')::date);
end $$;

create or replace function public.member_machine_push(p_key text, p_workouts jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  s public.gym_machine_setup; keys text[]; e jsonb; x jsonb; dt date; hr numeric;
begin
  if p_workouts is null or jsonb_typeof(p_workouts) is distinct from 'array' or jsonb_array_length(p_workouts) > 80 then
    raise exception 'INVALID';
  end if;
  select * into s from public.gym_machine_setup where gym_id = m.gym_id;
  if s.gym_id is null or not s.enabled then return jsonb_build_object('ok', true, 'on', false); end if;
  if exists (select 1 from public.gyms where gym_id = m.gym_id and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  keys := public._mbusy_keys(s.machines);

  -- Check everything before changing anything.
  for e in select value from jsonb_array_elements(p_workouts) loop
    if jsonb_typeof(e) is distinct from 'object'
       or jsonb_typeof(e->'d') is distinct from 'string' or (e->>'d') !~ '^\d{4}-\d{2}-\d{2}$'
       or jsonb_typeof(e->'h') is distinct from 'number'
       or jsonb_typeof(e->'x') is distinct from 'array' or jsonb_array_length(e->'x') > 40 then
      raise exception 'INVALID';
    end if;
    hr := (e->>'h')::numeric;
    if hr <> trunc(hr) or hr < 0 or hr > 23 then raise exception 'INVALID'; end if;
    begin
      dt := (e->>'d')::date;
    exception when others then
      raise exception 'INVALID';
    end;
    if to_char(dt, 'YYYY-MM-DD') <> e->>'d' then raise exception 'INVALID'; end if;
    for x in select value from jsonb_array_elements(e->'x') loop
      if jsonb_typeof(x) is distinct from 'string' or (x #>> '{}') !~ '^[a-z0-9_]{1,60}$' then raise exception 'INVALID'; end if;
    end loop;
  end loop;

  delete from public.gym_exercise_starts where gym_id = m.gym_id and member_id = m.member_id and day >= today - 35;
  insert into public.gym_exercise_starts(gym_id, member_id, day, hour, ex)
    select m.gym_id, m.member_id, (w->>'d')::date, (w->>'h')::int, k
      from jsonb_array_elements(p_workouts) w, jsonb_array_elements_text(w->'x') k
     where (w->>'d')::date between today - 35 and today
       and k = any(keys)
  on conflict do nothing;
  return jsonb_build_object('ok', true, 'on', true);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._mbusy_dk(date) from public, anon, authenticated;
revoke all on function public._mbusy_clean(jsonb) from public, anon, authenticated;
revoke all on function public._mbusy_keys(jsonb) from public, anon, authenticated;
revoke all on function public._mbusy_counts(uuid, date, date, text[]) from public, anon, authenticated;
revoke all on function public._mbusy_guess(uuid, date, int, text[], date) from public, anon, authenticated;
revoke all on function public._mbusy_refresh(uuid, date) from public, anon, authenticated;
revoke all on function public._mbusy_maybe_refresh(uuid) from public, anon, authenticated;
revoke all on function public._mbusy_score(uuid, text) from public, anon, authenticated;
revoke all on function public._mbusy_member_view(uuid, date) from public, anon, authenticated;
revoke all on function public._mbusy_owner_view(uuid, boolean, date) from public, anon, authenticated;
revoke all on function public._mbusy_member_left() from public, anon, authenticated;

revoke all on function public.owner_machine_setup(text) from public;
revoke all on function public.owner_save_machine_setup(text, boolean, jsonb) from public;
revoke all on function public.member_machine_busy(text) from public;
revoke all on function public.member_machine_push(text, jsonb) from public;
grant execute on function public.owner_machine_setup(text) to anon, authenticated;
grant execute on function public.owner_save_machine_setup(text, boolean, jsonb) to anon, authenticated;
grant execute on function public.member_machine_busy(text) to anon, authenticated;
grant execute on function public.member_machine_push(text, jsonb) to anon, authenticated;
