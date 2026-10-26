-- APPLIED LIVE 26 Oct 2026 (owner: "Yes, apply 0037 live", R-133); live tests 0037 PASS 221, security PASS 9.
--
-- 0037: the gym leaderboard and the monthly challenge (R-133, 26 Oct 2026: "monthly gym challenge with a
-- ranking"; owner's picks: counts = workouts logged AND kg lifted over the last 30 days, the prize goes
-- to everyone who hits the goal, names = first name and initial and only when the member switches it on).
-- Additive and re-runnable: five new tables, new functions, a trigger on each new table and one new trigger on
-- gym_members (leaving); nothing that exists is changed. Apply after 0036. Test: supabase/tests/0037_leaderboard.sql (CI runs it after every
-- migration; pasted into the SQL Editor it always ends in an error and so changes nothing).
-- Research and spec: docs/research/R-leaderboard.md (rankings put off the people at the bottom, so the
-- list shows the top 10 and YOUR place only, and everyone who hits the goal wins).
--
-- WHAT LEAVES THE PHONE (only a phone that joined this gym, with its member key from the app's Join):
--   per day of the last 31 days {"d":"YYYY-MM-DD","w":workouts that day,"kg":kg lifted that day}, and the
--   member's "show my name" switch. No exercise, set, weight per lift, body weight, photo or note.
--
-- THE DAYS (gym_member_days, one row per member per day with a workout):
--   A push REPLACES that member's rows from 31 days ago to tomorrow. A day with more than 3 workouts or
--   more than 60000 kg is not believed and is left out; a negative kg counts 0; days outside
--   [today - 31, today + 1] are left out; a day with 0 workouts and 0 kg is not kept; at most 40 days per
--   push (more: INVALID). A push that changes nothing but comes less than 15 seconds after the member's
--   last one is answered {ok:true} and ignored (unless the name switch changed).
--   WHEN ROWS GO (there is no nightly job):
--   * a member leaves the gym (left_at set, by any path): their days and board row are deleted in that
--     same statement, by a trigger on gym_members;
--   * rows older than 62 days, and any rows of a member who left, are deleted by the first push or read
--     (member_board, owner_challenges, owner_board) of that gym in each minute: at most once a minute
--     per gym (gym_board_meta.cleaned_at), by whoever comes first.
--   Deleting is allowed in a suspended gym (0027's rule: only inserts and updates are refused), so a member
--   can always leave and take their numbers with them.
-- THE WINDOW: the last 30 days ending today, today being the gym's date (Asia/Kolkata).
-- THE LISTS: top 10 by value (workouts, or kg), highest first; ties share a rank (1, 2, 2, 4); a member
--   with 0 is left out; a member who left is left out. Members see "Rahul S." (first word of the name
--   after a title such as Dr or Mrs, and the first letter of the last word) when the member switched the
--   name on; a one-word name stays as it is; else, or when the first word has a digit, "A member";
--   `me` marks your own row. A member the gym hid (owner only) is never in anyone's top 10; they still
--   see their own number and place, and still win a challenge.
-- THE CHALLENGE (gym_challenges): title <= 60, measure 'workouts' or 'kg', goal > 0, 7 to 31 days, free
--   days 0 to 60. It may start today or later (not in the past) and at most 60 days ahead. Two that are
--   not cancelled may not share a day (OVERLAP). One that has not started can be changed; one that
--   has can only be cancelled. Members see the one running today, else the one that ended in the last
--   7 days, else none. Everyone whose total inside its dates reaches the goal "hit" it.
--   THE RESULTS ARE KEPT (gym_challenge_hits): the first read (owner_challenges or member_board) that sees a
--   challenge whose last day has passed copies who hit it (name, phone, value, and how many took part)
--   and marks it (gym_challenges.results_at). From then on its winners are read from that copy only, so
--   a late push of an old date cannot make a late winner, and the 62-day clean-up cannot lose them. A
--   member who leaves keeps their line (it is the gym's record of who earned free days) but their phone
--   number is blanked at once (the privacy notice: the number is erased on leaving). A cancelled
--   challenge has no winners. owner_cancel_challenge refuses one that is over, so it never needs the copy.
--
-- WHO MAY READ AND WRITE:
--   member_board_push(key, days, show_name)  {ok:true}; BAD_KEY (also after leaving) or INVALID.
--   member_board(key)                        what the member sees (see the test for the shape).
--   owner_challenges(key)                    the challenges of the last 12 months, newest first, with who
--                                            hit the goal (name, phone, value) and canEdit. Owner or
--                                            front desk (the desk hands out the free days).
--   owner_save_challenge(key, challenge)     {id}; add, or change one that has not started (id given).
--                                            Owner only (OWNER_ONLY for the desk). INVALID / OVERLAP.
--   owner_cancel_challenge(key, id)          {ok:true}; owner only. INVALID for one that is over.
--   owner_board(key)                         both top 10 lists with full names, a hidden flag and the
--                                            hidden members. Everyone is ranked (hidden ones too, marked)
--                                            so the owner can see and undo it. Owner or front desk.
--   owner_hide_on_board(key, member, hidden) {ok:true}; owner only.
--   The tables have RLS on, no policies and no grants; every read and write goes through these.
--   A suspended gym (0027) is read-only here too: inserts and updates are refused (the same trigger as
--   its other tables); the server's own bookkeeping (the copy of results, blanking a phone number on
--   leaving) passes through the 0027 HQ bypass for just that statement. Reading and deleting stay allowed.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_member_days (
  gym_id    uuid not null references public.gyms(gym_id) on delete cascade,
  member_id uuid not null references public.gym_members(member_id) on delete cascade,
  day       date not null,
  workouts  int not null check (workouts between 0 and 3),
  kg        numeric not null check (kg >= 0 and kg <= 60000),
  primary key (gym_id, member_id, day)
);
create index if not exists gym_member_days_by_day on public.gym_member_days(gym_id, day);
alter table public.gym_member_days enable row level security;
revoke all on public.gym_member_days from public, anon, authenticated;

create table if not exists public.gym_member_board (
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  member_id  uuid not null references public.gym_members(member_id) on delete cascade,
  show_name  boolean not null default false,
  hidden     boolean not null default false,
  hidden_by  uuid,
  updated_at timestamptz not null default now(),
  primary key (gym_id, member_id)
);
alter table public.gym_member_board enable row level security;
revoke all on public.gym_member_board from public, anon, authenticated;

create table if not exists public.gym_challenges (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(gym_id) on delete cascade,
  title           text not null check (length(btrim(title)) between 1 and 60),
  measure         text not null check (measure in ('workouts', 'kg')),
  goal            numeric not null check (goal > 0),
  starts_on       date not null,
  ends_on         date not null,
  prize_days      int not null check (prize_days between 0 and 60),
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now(),
  cancelled_at    timestamptz,
  results_at      timestamptz,
  entrants        int,
  check (ends_on - starts_on between 6 and 30)
);
alter table public.gym_challenges add column if not exists results_at timestamptz;
alter table public.gym_challenges add column if not exists entrants int;
create index if not exists gym_challenges_by_gym on public.gym_challenges(gym_id, starts_on desc);
alter table public.gym_challenges enable row level security;
revoke all on public.gym_challenges from public, anon, authenticated;

-- Who hit a challenge, kept when it is over. The member's id is not a foreign key: the line outlives the
-- member's row. The phone number is blanked when the member leaves (trigger below).
create table if not exists public.gym_challenge_hits (
  challenge_id uuid not null references public.gym_challenges(id) on delete cascade,
  member_id    uuid not null,
  name         text not null,
  phone        text,
  value        numeric not null,
  primary key (challenge_id, member_id)
);
alter table public.gym_challenge_hits enable row level security;
revoke all on public.gym_challenge_hits from public, anon, authenticated;

-- When each gym's clean-up last ran (at most once a minute per gym).
create table if not exists public.gym_board_meta (
  gym_id     uuid primary key references public.gyms(gym_id) on delete cascade,
  cleaned_at timestamptz not null default now()
);
alter table public.gym_board_meta enable row level security;
revoke all on public.gym_board_meta from public, anon, authenticated;

-- Suspended gym: inserts and updates are refused, deletes are not (0027's rule for its own clean-ups:
-- if tg_op = 'DELETE' then return old), so leaving the gym and the 62-day clean-up work while suspended.
drop trigger if exists gym_member_days_not_suspended on public.gym_member_days;
create trigger gym_member_days_not_suspended before insert or update on public.gym_member_days
  for each row execute function public._gym_not_suspended();
drop trigger if exists gym_member_board_not_suspended on public.gym_member_board;
create trigger gym_member_board_not_suspended before insert or update on public.gym_member_board
  for each row execute function public._gym_not_suspended();
drop trigger if exists gym_challenges_not_suspended on public.gym_challenges;
create trigger gym_challenges_not_suspended before insert or update or delete on public.gym_challenges
  for each row execute function public._gym_not_suspended();
-- gym_challenge_hits has no gym_id column, so it has its own check (through the challenge).
create or replace function public._challenge_hits_not_suspended() returns trigger
  language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if current_setting('forgeai.hq', true) = 'on' then return new; end if;
  select g.status into st from public.gym_challenges c join public.gyms g on g.gym_id = c.gym_id where c.id = new.challenge_id;
  if st = 'suspended' then raise exception 'SUSPENDED'; end if;
  return new;
end $$;
drop trigger if exists gym_challenge_hits_not_suspended on public.gym_challenge_hits;
create trigger gym_challenge_hits_not_suspended before insert or update on public.gym_challenge_hits
  for each row execute function public._challenge_hits_not_suspended();

-- ------------------------------------------------------------------ helpers (no grants)
-- "Rahul S." for "Rahul Sharma" (first word, first letter of the last word); one word stays as it is.
-- A leading title (Dr, Mr, Mrs, Ms, Shri, Smt, with or without a full stop) is skipped. 'A member' when
-- the member did not switch the name on, the name is empty, or its first word has a digit in it.
create or replace function public._board_name(p_name text, p_show boolean) returns text
  language plpgsql immutable set search_path = public as $$
declare w text[]; n int; i int := 1; last_ text;
begin
  if not coalesce(p_show, false) then return 'A member'; end if;
  w := regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+');
  n := coalesce(array_length(w, 1), 0);
  while i <= n and lower(w[i]) ~ '^(dr|mr|mrs|ms|shri|smt)\.?$' loop i := i + 1; end loop;
  if i > n or w[i] = '' or w[i] ~ '[0-9]' then return 'A member'; end if;
  if i = n then return w[i]; end if;
  last_ := w[n];
  if left(last_, 1) ~ '[0-9[:punct:]]' then return w[i]; end if;
  return w[i] || ' ' || upper(left(last_, 1)) || '.';
end $$;

-- The 62-day clean-up and the backstop for members who left, for one gym, at most once a minute (the
-- first caller of the minute does it). Deleting is allowed in a suspended gym.
create or replace function public._board_cleanup(p_gym uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare ran uuid; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  insert into public.gym_board_meta(gym_id, cleaned_at) values (p_gym, now())
  on conflict (gym_id) do update set cleaned_at = now() where public.gym_board_meta.cleaned_at < now() - interval '1 minute'
  returning gym_id into ran;
  if ran is null then return; end if;
  delete from public.gym_member_days where gym_id = p_gym and day < today - 62;
  delete from public.gym_member_days d using public.gym_members x
   where d.gym_id = p_gym and x.member_id = d.member_id and x.left_at is not null;
  delete from public.gym_member_board b using public.gym_members x
   where b.gym_id = p_gym and x.member_id = b.member_id and x.left_at is not null;
end $$;

-- Leaving the gym takes the member's numbers with it at once: their days and board row are deleted, and the
-- phone number on their kept challenge results is blanked (the results themselves stay: they are the
-- gym's record of who earned free days). Runs for every way left_at gets set (member_leave, HQ).
create or replace function public._board_member_left() returns trigger
  language plpgsql security definer set search_path = public as $$
declare prev text := coalesce(current_setting('forgeai.hq', true), 'off');
begin
  delete from public.gym_member_days where member_id = new.member_id;
  delete from public.gym_member_board where member_id = new.member_id;
  perform set_config('forgeai.hq', 'on', true);  -- the suspended-gym check passes for this statement only
  update public.gym_challenge_hits set phone = null where member_id = new.member_id and phone is not null;
  perform set_config('forgeai.hq', prev, true);
  return new;
end $$;
drop trigger if exists gym_members_board_left on public.gym_members;
create trigger gym_members_board_left after update of left_at on public.gym_members
  for each row when (old.left_at is null and new.left_at is not null)
  execute function public._board_member_left();

-- The kept result of a challenge whose last day has passed: copies who hit it, once (see the header).
-- Cancelled ones have none. Passes the suspended-gym check for its own two statements only.
create or replace function public._challenge_results(p_challenge uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c public.gym_challenges; today date := (now() at time zone 'Asia/Kolkata')::date;
  prev text := coalesce(current_setting('forgeai.hq', true), 'off');
begin
  select * into c from public.gym_challenges where id = p_challenge for update;
  if c.id is null or c.results_at is not null or c.cancelled_at is not null or c.ends_on >= today then return; end if;
  perform set_config('forgeai.hq', 'on', true);
  insert into public.gym_challenge_hits(challenge_id, member_id, name, phone, value)
    select c.id, h.m_id, regexp_replace(btrim(h.m_name), '\s+', ' ', 'g'), h.m_phone, h.total
      from public._challenge_hitters(c) h
  on conflict do nothing;
  update public.gym_challenges set results_at = now(),
         entrants = (select count(distinct d.member_id) from public.gym_member_days d
                       join public.gym_members x on x.member_id = d.member_id
                      where d.gym_id = c.gym_id and x.left_at is null and d.day between c.starts_on and c.ends_on)
   where id = c.id;
  perform set_config('forgeai.hq', prev, true);
end $$;
-- Everyone in the gym with a total above 0 in the window (the last 30 days ending today).
create or replace function public._board_rows(p_gym uuid, p_measure text)
  returns table(m_id uuid, m_name text, m_phone text, joined_at timestamptz, show_name boolean, hidden boolean, total numeric)
  language sql stable set search_path = public as $$
  select m.member_id, m.name, m.phone, m.joined_at, coalesce(b.show_name, false), coalesce(b.hidden, false),
         sum(case when p_measure = 'kg' then d.kg else d.workouts end)
    from public.gym_member_days d
    join public.gym_members m on m.member_id = d.member_id and m.gym_id = d.gym_id
    left join public.gym_member_board b on b.gym_id = d.gym_id and b.member_id = d.member_id
   where d.gym_id = p_gym and m.left_at is null
     and d.day between (now() at time zone 'Asia/Kolkata')::date - 29 and (now() at time zone 'Asia/Kolkata')::date
   group by m.member_id, m.name, m.phone, m.joined_at, b.show_name, b.hidden
  having sum(case when p_measure = 'kg' then d.kg else d.workouts end) > 0
$$;

-- One list: {top: [10 rows], me: {rank, value} | null}.
--   as a member: rows are {rank, name, value, me}, hidden members left out (they keep their own place);
--   for the gym (p_owner): rows are {rank, memberId, name (full), phone, value, hidden}, everyone ranked.
create or replace function public._board_top(p_gym uuid, p_measure text, p_me uuid, p_owner boolean)
  returns jsonb language plpgsql stable set search_path = public as $$
declare top jsonb; mine jsonb := null; mv numeric;
begin
  select coalesce(jsonb_agg(
      case when p_owner
        then jsonb_build_object('rank', q.rk, 'memberId', q.m_id::text, 'name', regexp_replace(btrim(q.m_name), '\s+', ' ', 'g'), 'phone', q.m_phone,
               'value', q.total, 'hidden', q.hidden)
        else jsonb_build_object('rank', q.rk, 'name', public._board_name(q.m_name, q.show_name),
               'value', q.total, 'me', q.m_id = p_me) end
      order by q.rk, q.joined_at, q.m_id), '[]'::jsonb)
    into top
    from (select * from (select x.*, rank() over (order by x.total desc) as rk
                           from public._board_rows(p_gym, p_measure) x
                          where p_owner or not x.hidden) w
           order by w.rk, w.joined_at, w.m_id limit 10) q;
  if p_me is not null then
    select x.total into mv from public._board_rows(p_gym, p_measure) x where x.m_id = p_me;
    if mv is not null then
      mine := jsonb_build_object(
        'rank', 1 + (select count(*) from public._board_rows(p_gym, p_measure) y where not y.hidden and y.total > mv),
        'value', mv);
    end if;
  end if;
  return jsonb_build_object('top', top, 'me', mine);
end $$;

-- Who reached a challenge's goal (inside its dates): everyone, hidden or not; not those who left.
create or replace function public._challenge_hitters(c public.gym_challenges)
  returns table(m_id uuid, m_name text, m_phone text, total numeric)
  language sql stable set search_path = public as $$
  select m.member_id, m.name, m.phone, sum(case when c.measure = 'kg' then d.kg else d.workouts end)
    from public.gym_member_days d
    join public.gym_members m on m.member_id = d.member_id and m.gym_id = d.gym_id
   where d.gym_id = c.gym_id and m.left_at is null and d.day between c.starts_on and c.ends_on
   group by m.member_id, m.name, m.phone
  having sum(case when c.measure = 'kg' then d.kg else d.workouts end) >= c.goal
$$;

-- ------------------------------------------------------------------ the member's side
create or replace function public.member_board_push(p_key text, p_days jsonb, p_show_name boolean)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  b public.gym_member_board;
  e jsonb; dt date; w numeric; k numeric;
begin
  if p_show_name is null or p_days is null then raise exception 'INVALID'; end if;
  if jsonb_typeof(p_days) is distinct from 'array' then raise exception 'INVALID'; end if;
  if jsonb_array_length(p_days) > 40 then raise exception 'INVALID'; end if;
  if exists (select 1 from public.gyms where gym_id = m.gym_id and status = 'suspended') then raise exception 'SUSPENDED'; end if;

  -- Throttle: the same name switch again within 15 seconds changes nothing.
  select * into b from public.gym_member_board where gym_id = m.gym_id and member_id = m.member_id;
  if b.member_id is not null and b.show_name = p_show_name and b.updated_at > now() - interval '15 seconds' then
    return jsonb_build_object('ok', true);
  end if;

  delete from public.gym_member_days where gym_id = m.gym_id and member_id = m.member_id and day >= today - 31;
  for e in select value from jsonb_array_elements(p_days) loop
    if jsonb_typeof(e) is distinct from 'object'
       or jsonb_typeof(e->'d') is distinct from 'string' or (e->>'d') !~ '^\d{4}-\d{2}-\d{2}$'
       or jsonb_typeof(e->'w') is distinct from 'number' or jsonb_typeof(e->'kg') is distinct from 'number' then
      raise exception 'INVALID';
    end if;
    begin
      dt := (e->>'d')::date;
    exception when others then
      raise exception 'INVALID';
    end;
    if to_char(dt, 'YYYY-MM-DD') <> e->>'d' then raise exception 'INVALID'; end if;
    continue when dt < today - 31 or dt > today + 1;
    w := (e->>'w')::numeric;
    k := (e->>'kg')::numeric;
    continue when w > 3 or k > 60000;
    w := trunc(greatest(w, 0));
    k := round(greatest(k, 0), 1);
    continue when w = 0 and k = 0;
    insert into public.gym_member_days(gym_id, member_id, day, workouts, kg)
      values (m.gym_id, m.member_id, dt, w::int, k)
    on conflict (gym_id, member_id, day) do update set workouts = excluded.workouts, kg = excluded.kg;
  end loop;

  insert into public.gym_member_board(gym_id, member_id, show_name, updated_at)
    values (m.gym_id, m.member_id, p_show_name, now())
  on conflict (gym_id, member_id) do update set show_name = excluded.show_name, updated_at = now();

  perform public._board_cleanup(m.gym_id);
  return jsonb_build_object('ok', true);
end $$;

-- Volatile on purpose: a read may run the clean-up and keep the result of a challenge that is over.
create or replace function public.member_board(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  g public.gyms; c public.gym_challenges; cj jsonb := null; mine numeric; n int; hits int; hit boolean;
begin
  perform public._board_cleanup(m.gym_id);
  select * into g from public.gyms where gym_id = m.gym_id;
  select count(distinct d.member_id) into n
    from public.gym_member_days d join public.gym_members x on x.member_id = d.member_id
   where d.gym_id = m.gym_id and x.left_at is null and d.day between today - 29 and today;

  select * into c from public.gym_challenges
   where gym_id = m.gym_id and cancelled_at is null and starts_on <= today and ends_on >= today;
  if c.id is null then
    select * into c from public.gym_challenges
     where gym_id = m.gym_id and cancelled_at is null and ends_on < today and ends_on >= today - 7
     order by ends_on desc limit 1;
  end if;
  if c.id is not null then
    select coalesce(sum(case when c.measure = 'kg' then d.kg else d.workouts end), 0) into mine
      from public.gym_member_days d
     where d.gym_id = m.gym_id and d.member_id = m.member_id and d.day between c.starts_on and c.ends_on;
    if c.ends_on < today then
      -- Over: the kept result decides, never a number pushed late.
      perform public._challenge_results(c.id);
      select count(*) into hits from public.gym_challenge_hits where challenge_id = c.id;
      select value into mine from public.gym_challenge_hits where challenge_id = c.id and member_id = m.member_id;
      hit := mine is not null;
      if not hit then
        select coalesce(sum(case when c.measure = 'kg' then d.kg else d.workouts end), 0) into mine
          from public.gym_member_days d
         where d.gym_id = m.gym_id and d.member_id = m.member_id and d.day between c.starts_on and c.ends_on;
        -- A late push cannot show a number at or above the goal without the prize.
        if mine >= c.goal then mine := greatest(c.goal - case when c.measure = 'kg' then 0.1 else 1 end, 0); end if;
      end if;
    else
      select count(*) into hits from public._challenge_hitters(c);
      hit := mine >= c.goal;
    end if;
    cj := jsonb_build_object('id', c.id::text, 'title', c.title, 'measure', c.measure, 'goal', c.goal,
      'startsOn', to_char(c.starts_on, 'YYYY-MM-DD'), 'endsOn', to_char(c.ends_on, 'YYYY-MM-DD'),
      'prizeDays', c.prize_days, 'myValue', mine, 'hit', hit, 'hitters', hits);
  end if;

  return jsonb_build_object('ok', true, 'gymName', g.name, 'members', n,
    'workouts', public._board_top(m.gym_id, 'workouts', m.member_id, false),
    'kg', public._board_top(m.gym_id, 'kg', m.member_id, false),
    'challenge', cj);
end $$;
-- ------------------------------------------------------------------ the gym's side
-- Volatile on purpose: a read may run the clean-up and keep the result of a challenge that is over.
create or replace function public.owner_challenges(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  out jsonb; cx uuid;
begin
  perform public._board_cleanup(g);
  for cx in select id from public.gym_challenges
            where gym_id = g and cancelled_at is null and results_at is null and ends_on < today and ends_on >= today - 365 loop
    perform public._challenge_results(cx);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id::text, 'title', c.title, 'measure', c.measure, 'goal', c.goal,
      'startsOn', to_char(c.starts_on, 'YYYY-MM-DD'), 'endsOn', to_char(c.ends_on, 'YYYY-MM-DD'),
      'prizeDays', c.prize_days, 'createdByName', c.created_by_name,
      'createdAt', floor(extract(epoch from c.created_at) * 1000)::bigint,
      'cancelledAt', case when c.cancelled_at is null then null else floor(extract(epoch from c.cancelled_at) * 1000)::bigint end,
      'status', case when c.cancelled_at is not null then 'cancelled' when today < c.starts_on then 'upcoming'
                     when today <= c.ends_on then 'running' else 'ended' end,
      'entrants', case when c.ends_on < today and c.results_at is not null then coalesce(c.entrants, 0) else (
                   select count(distinct d.member_id) from public.gym_member_days d
                     join public.gym_members x on x.member_id = d.member_id
                    where d.gym_id = g and x.left_at is null and d.day between c.starts_on and c.ends_on) end,
      'hitters', case
        when c.cancelled_at is not null then '[]'::jsonb
        when c.ends_on < today then coalesce((
          select jsonb_agg(jsonb_build_object('memberId', h.member_id::text, 'name', h.name, 'phone', h.phone, 'value', h.value)
                           order by h.value desc, h.name, h.member_id)
            from public.gym_challenge_hits h where h.challenge_id = c.id), '[]'::jsonb)
        else coalesce((
          select jsonb_agg(jsonb_build_object('memberId', h.m_id::text, 'name', regexp_replace(btrim(h.m_name), '\s+', ' ', 'g'), 'phone', h.m_phone, 'value', h.total)
                           order by h.total desc, h.m_name, h.m_id)
            from public._challenge_hitters(c) h), '[]'::jsonb) end
    ) order by c.starts_on desc, c.created_at desc), '[]'::jsonb)
    into out
    from public.gym_challenges c
   where c.gym_id = g and c.ends_on >= today - 365;
  return jsonb_build_object('canEdit', st.staff_id is null or st.role = 'owner', 'challenges', out);
end $$;
create or replace function public.owner_save_challenge(p_key text, p_challenge jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  p jsonb := p_challenge; prev public.gym_challenges; cid uuid;
  ttl text; ms text; gl numeric; s date; en date; pz numeric;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 2000 then raise exception 'INVALID'; end if;
  if exists (select 1 from jsonb_object_keys(p) x where x not in ('id', 'title', 'measure', 'goal', 'startsOn', 'endsOn', 'prizeDays')) then
    raise exception 'INVALID';
  end if;
  if jsonb_typeof(p->'title') is distinct from 'string' or jsonb_typeof(p->'measure') is distinct from 'string'
     or jsonb_typeof(p->'goal') is distinct from 'number' or jsonb_typeof(p->'prizeDays') is distinct from 'number'
     or jsonb_typeof(p->'startsOn') is distinct from 'string' or jsonb_typeof(p->'endsOn') is distinct from 'string' then
    raise exception 'INVALID';
  end if;
  ttl := btrim(p->>'title');
  if length(ttl) not between 1 and 60 then raise exception 'INVALID'; end if;
  ms := p->>'measure';
  if ms not in ('workouts', 'kg') then raise exception 'INVALID'; end if;
  gl := (p->>'goal')::numeric;
  -- A goal nobody can reach is a typing slip: at most 3 workouts and 60000 kg a day, 31 days.
  if gl <= 0 or (ms = 'workouts' and (gl <> trunc(gl) or gl > 93)) or (ms = 'kg' and gl > 1860000) then
    raise exception 'INVALID';
  end if;
  gl := trim_scale(round(gl, 1));
  pz := (p->>'prizeDays')::numeric;
  if pz <> trunc(pz) or pz not between 0 and 60 then raise exception 'INVALID'; end if;
  if (p->>'startsOn') !~ '^\d{4}-\d{2}-\d{2}$' or (p->>'endsOn') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID'; end if;
  begin
    s := (p->>'startsOn')::date;
    en := (p->>'endsOn')::date;
  exception when others then
    raise exception 'INVALID';
  end;
  if to_char(s, 'YYYY-MM-DD') <> p->>'startsOn' or to_char(en, 'YYYY-MM-DD') <> p->>'endsOn' then raise exception 'INVALID'; end if;
  if s < today or s > today + 60 or en - s not between 6 and 30 then raise exception 'INVALID'; end if;

  -- One at a time per gym while the overlap is checked.
  perform pg_advisory_xact_lock(hashtext('gym_challenges:' || g::text));

  if p ? 'id' and jsonb_typeof(p->'id') <> 'null' then
    if jsonb_typeof(p->'id') <> 'string' or (p->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'INVALID'; end if;
    cid := (p->>'id')::uuid;
    select * into prev from public.gym_challenges where id = cid and gym_id = g;
    if prev.id is null or prev.cancelled_at is not null or prev.starts_on <= today then raise exception 'INVALID'; end if;
  end if;

  if exists (select 1 from public.gym_challenges o
              where o.gym_id = g and o.cancelled_at is null and o.id is distinct from cid
                and o.starts_on <= en and o.ends_on >= s) then
    raise exception 'OVERLAP';
  end if;

  if cid is not null then
    update public.gym_challenges
       set title = ttl, measure = ms, goal = gl, starts_on = s, ends_on = en, prize_days = pz::int
     where id = cid;
    return jsonb_build_object('id', cid::text);
  end if;
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days, created_by, created_by_name)
    values (g, ttl, ms, gl, s, en, pz::int, st.staff_id, case when st.staff_id is null then null else st.name end)
  returning id into cid;
  return jsonb_build_object('id', cid::text);
end $$;

create or replace function public.owner_cancel_challenge(p_key text, p_id uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  c public.gym_challenges;
begin
  select * into c from public.gym_challenges where id = p_id and gym_id = g;
  if c.id is null or c.ends_on < today then raise exception 'INVALID'; end if;
  if c.cancelled_at is null then
    update public.gym_challenges set cancelled_at = now() where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Volatile on purpose: a read may run the clean-up.
create or replace function public.owner_board(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  n int; hid jsonb;
begin
  perform public._board_cleanup(g);
  select count(distinct d.member_id) into n
    from public.gym_member_days d join public.gym_members x on x.member_id = d.member_id
   where d.gym_id = g and x.left_at is null and d.day between today - 29 and today;
  select coalesce(jsonb_agg(jsonb_build_object('memberId', x.member_id::text, 'name', regexp_replace(btrim(x.name), '\s+', ' ', 'g')) order by x.name, x.member_id), '[]'::jsonb)
    into hid
    from public.gym_member_board b join public.gym_members x on x.member_id = b.member_id
   where b.gym_id = g and b.hidden and x.left_at is null;
  return jsonb_build_object('ok', true, 'canEdit', st.staff_id is null or st.role = 'owner', 'members', n,
    'workouts', public._board_top(g, 'workouts', null, true),
    'kg', public._board_top(g, 'kg', null, true),
    'hiddenMembers', hid);
end $$;

create or replace function public.owner_hide_on_board(p_key text, p_member uuid, p_hidden boolean)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  st public.gym_staff := public._staff(p_key);
begin
  if p_hidden is null or p_member is null
     or not exists (select 1 from public.gym_members where member_id = p_member and gym_id = g and left_at is null) then
    raise exception 'INVALID';
  end if;
  insert into public.gym_member_board(gym_id, member_id, hidden, hidden_by, updated_at)
    values (g, p_member, p_hidden, case when p_hidden then st.staff_id else null end, now())
  on conflict (gym_id, member_id) do update
    set hidden = excluded.hidden, hidden_by = excluded.hidden_by, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._board_name(text, boolean) from public, anon, authenticated;
revoke all on function public._board_rows(uuid, text) from public, anon, authenticated;
revoke all on function public._board_top(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public._challenge_hitters(public.gym_challenges) from public, anon, authenticated;
revoke all on function public._board_cleanup(uuid) from public, anon, authenticated;
revoke all on function public._board_member_left() from public, anon, authenticated;
revoke all on function public._challenge_results(uuid) from public, anon, authenticated;
revoke all on function public._challenge_hits_not_suspended() from public, anon, authenticated;

revoke all on function public.member_board_push(text, jsonb, boolean) from public;
revoke all on function public.member_board(text) from public;
revoke all on function public.owner_challenges(text) from public;
revoke all on function public.owner_save_challenge(text, jsonb) from public;
revoke all on function public.owner_cancel_challenge(text, uuid) from public;
revoke all on function public.owner_board(text) from public;
revoke all on function public.owner_hide_on_board(text, uuid, boolean) from public;
grant execute on function public.member_board_push(text, jsonb, boolean) to anon, authenticated;
grant execute on function public.member_board(text) to anon, authenticated;
grant execute on function public.owner_challenges(text) to anon, authenticated;
grant execute on function public.owner_save_challenge(text, jsonb) to anon, authenticated;
grant execute on function public.owner_cancel_challenge(text, uuid) to anon, authenticated;
grant execute on function public.owner_board(text) to anon, authenticated;
grant execute on function public.owner_hide_on_board(text, uuid, boolean) to anon, authenticated;
