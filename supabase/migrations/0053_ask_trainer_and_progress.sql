-- APPLIED LIVE 9 Nov 2026 (owner: "yes, apply 0053 and 0054"; live test PASS 68).
--
-- 0053: "Ask a trainer" (R-319 item 1) and the gym's live "Progress" on a member's page (R-319 item 11).
-- Additive and re-runnable: one new table (trainer_questions), one new column (gym_progress_summaries.recent),
-- new functions, one trigger on the new table, one new trigger on gym_members (leaving); push_jobs' kind check
-- gains 'trainer_reply' and hq_push_next (0038) is replaced by the same function plus a trainer_reply branch
-- (message and offer jobs work exactly as before). Apply after 0052 (needs 0050's _trainer_viewer, _trainer_of,
-- _trainer_clean, gym_progress_summaries; 0038's push_jobs and hq_push_next; 0035's _member_roster_link;
-- 0027's _gym_not_suspended). Test: supabase/tests/0053_ask_trainer_and_progress.sql (CI runs it after every
-- migration; pasted into the SQL Editor it always ends in an error and so changes nothing).
-- The member app and the admin app both work without it (they ask once, get "no such function", and hide
-- the new parts), so nothing breaks before it is applied.
-- Undo: drop the eleven public functions below, the trigger gym_members_questions_left, the table
-- trainer_questions and the column gym_progress_summaries.recent; re-run 0038's hq_push_next and put the
-- push_jobs kind check back to ('message', 'offer') once no trainer_reply job is left.
--
-- 1. ASK A TRAINER (not a live chat). A member types one question (at most 500 characters) to one person who
--    answers questions (an "answerer": a ticked trainer, gym_trainers 0050, or the gym's owner; their own
--    trainer is preselected in the app) or to "Any trainer".
--    One open question at a time (open = no reply, not taken back, asked in the last 14 days); at most 3 asked
--    in any 24 hours. Who sees it (OWNER DECISION 4 Nov 2026: the picked person only): the person picked; a
--    question to "Any trainer", or to someone who is no longer an answerer (unticked or removed: the question is
--    not lost), is seen by the owner (and an owner key) and every ticked trainer. The owner does NOT see questions
--    asked to another trainer. The front desk without the tick: TRAINER_ONLY. One
--    reply (at most 1000 characters) from anyone who sees it; the reply adds a push_jobs row (kind
--    'trainer_reply') and the HQ Worker (deploy/hq/push.js) pops it up on that member's phones only (the ones
--    with "Messages from my gym" on, 0038). Kept: 180 days, then deleted on the next read; deleted at once
--    when the member leaves the gym. The member sees their last 20, with the reply and who wrote it (first name).
--
-- 2. PROGRESS (what the gym sees widens; the privacy page change is drafted in docs/plans/R-319-privacy-draft.md
--    and waits for the owner). While "Share my workouts with my trainers" is on, the phone now also sends its
--    recent workouts with member_trainer_share2 (0050's member_trainer_share still works for older phones):
--      recent: [{"d":"YYYY-MM-DD", "n": workout name, "x":[{"n": exercise name, "w": best kg, "r": reps of that
--               set, "s": working sets}]}]   at most 30 workouts, last 92 days, at most 20 exercises each
--    Never notes, photos, body weight, food, or a list of every set. Checked and rebuilt here (_trainer_recent_clean),
--    at most 40000 characters, kept in gym_progress_summaries.recent (deleted with the row: off, leaving, 90 days
--    with nothing new, exactly as 0050). owner_member_progress(key, list member id) gives one member's summary
--    and recent workouts to the owner, or to the ticked trainer that member is assigned to ({allowed:false} for
--    another trainer); the desk without the tick: TRAINER_ONLY.
--
-- WHO MAY CALL (the table has RLS on, no policies and no grants; everything goes through these):
--   member_ask_choices(key)                     {ok, mine: staff id or null, trainers:[{id, name, owner}], open: bool}
--   member_ask_trainer(key, staff|null, text)   {ok, question}; INVALID, NOT_TRAINER, OPEN_QUESTION, TOO_MANY,
--                                               SUSPENDED, BAD_KEY
--   member_questions(key)                       {ok, questions:[...]} newest first, last 20; marks replies seen
--   member_withdraw_question(key, id)           {ok}; NOT_FOUND (not theirs, or already answered)
--   owner_questions(key)                        {ok, role, open, questions:[...]} last 60 days, at most 200
--   owner_question_count(key)                   {ok, open}  (the menu badge)
--   owner_answer_question(key, id, text)        {ok, question}; NOT_FOUND, ALREADY_ANSWERED, WITHDRAWN, INVALID
--   member_trainer_share2(key, summary, recent) {ok, on: true}; INVALID, SUSPENDED, BAD_KEY
--   owner_member_progress(key, member)          {ok, allowed, shared, summary?, recent?, updatedAt?}

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables
create table if not exists public.trainer_questions (
  question_id      uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms(gym_id) on delete cascade,
  member_id        uuid not null references public.gym_members(member_id) on delete cascade,
  roster_id        text check (roster_id is null or length(roster_id) between 1 and 64),
  staff_id         uuid references public.gym_staff(staff_id) on delete set null,
  question         text not null check (length(question) between 1 and 500),
  asked_at         timestamptz not null default now(),
  answer           text check (answer is null or length(answer) between 1 and 1000),
  answered_by      uuid references public.gym_staff(staff_id) on delete set null,
  answered_by_name text,
  answered_at      timestamptz,
  seen_at          timestamptz,
  withdrawn_at     timestamptz
);
create index if not exists trainer_questions_by_gym on public.trainer_questions(gym_id, asked_at desc);
create index if not exists trainer_questions_by_member on public.trainer_questions(member_id, asked_at desc);
alter table public.trainer_questions enable row level security;
revoke all on public.trainer_questions from public, anon, authenticated;

drop trigger if exists trainer_questions_not_suspended on public.trainer_questions;
create trigger trainer_questions_not_suspended before insert or update on public.trainer_questions
  for each row execute function public._gym_not_suspended();

alter table public.gym_progress_summaries add column if not exists recent jsonb;

-- The reply's pop-up rides the same queue as the gym's messages (0038).
alter table public.push_jobs drop constraint if exists push_jobs_kind_check;
alter table public.push_jobs add constraint push_jobs_kind_check check (kind in ('message', 'offer', 'trainer_reply'));

-- ------------------------------------------------------------------ helpers (no grants)
-- Typed text: control characters out (new lines kept, at most 2 in a row), trimmed, 1..max characters, or INVALID.
create or replace function public._tq_text(p text, p_max int) returns text
  language plpgsql immutable set search_path = public as $$
declare s text;
begin
  s := replace(coalesce(p, ''), E'\r', '');
  s := regexp_replace(s, E'[\\x01-\\x09\\x0B-\\x1F\\x7F]', ' ', 'g');
  s := regexp_replace(s, E'\n{3,}', E'\n\n', 'g');
  s := btrim(s, E' \n\t');
  if length(s) < 1 or length(s) > p_max then raise exception 'INVALID'; end if;
  return s;
end $$;

-- "Rohit S." from "Rohit Sharma" (what a member sees of a person on the staff).
create or replace function public._tq_short(p_name text) returns text
  language sql immutable set search_path = public as $$
  select case
    when coalesce(btrim(p_name), '') = '' then null
    when split_part(regexp_replace(btrim(p_name), '\s+', ' ', 'g'), ' ', 2) = '' then btrim(p_name)
    else split_part(regexp_replace(btrim(p_name), '\s+', ' ', 'g'), ' ', 1) || ' '
         || left(split_part(regexp_replace(btrim(p_name), '\s+', ' ', 'g'), ' ', 2), 1) || '.'
  end
$$;

-- Is this person someone a member may ask (an "answerer"): a live, ticked trainer of the gym, or its owner?
create or replace function public._tq_live_trainer(p_gym uuid, p_staff uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select p_staff is not null and exists (
    select 1 from public.gym_staff s
     where s.staff_id = p_staff and s.gym_id = p_gym and s.removed_at is null
       and (s.role = 'owner' or exists (select 1 from public.gym_trainers t where t.staff_id = s.staff_id and t.gym_id = p_gym)))
$$;

-- Is this person (still) one of the gym's owners?
create or replace function public._tq_is_owner(p_gym uuid, p_staff uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select p_staff is not null and exists (
    select 1 from public.gym_staff s where s.staff_id = p_staff and s.gym_id = p_gym and s.removed_at is null and s.role = 'owner')
$$;

-- May this viewer (0050's _trainer_viewer) see this question?
-- OWNER DECISION (4 Nov 2026): a thread goes to the PICKED person only; the owner does not see questions asked to
-- another trainer (owner transparency is a later idea). "Any trainer" and orphaned questions: owner + every trainer.
create or replace function public._tq_visible(v jsonb, q public.trainer_questions) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(q.gym_id = (v->>'gym')::uuid and (
    q.staff_id = nullif(v->>'staff', '')::uuid
    or not public._tq_live_trainer(q.gym_id, q.staff_id)
    or ((v->>'owner')::boolean and public._tq_is_owner(q.gym_id, q.staff_id))), false)
$$;

-- Open: no reply, not taken back, asked in the last 14 days.
create or replace function public._tq_open(q public.trainer_questions) returns boolean
  language sql stable set search_path = public as $$
  select q.answer is null and q.withdrawn_at is null and q.asked_at > now() - interval '14 days'
$$;

create or replace function public._tq_ms(t timestamptz) returns bigint
  language sql immutable set search_path = public as $$
  select case when t is null then null else floor(extract(epoch from t) * 1000)::bigint end
$$;

-- What the member sees of one question.
create or replace function public._tq_member_row(q public.trainer_questions) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.question_id,
    'question', q.question,
    'trainer', case when q.staff_id is null then null
                    else (select public._tq_short(s.name) from public.gym_staff s where s.staff_id = q.staff_id) end,
    'askedAt', public._tq_ms(q.asked_at),
    'answer', q.answer,
    'answeredBy', case when q.answer is null then null else split_part(btrim(coalesce(q.answered_by_name, '')), ' ', 1) end,
    'answeredAt', public._tq_ms(q.answered_at),
    'withdrawn', q.withdrawn_at is not null,
    'open', public._tq_open(q))
$$;

-- What the gym sees of one question.
create or replace function public._tq_gym_row(q public.trainer_questions) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.question_id,
    'appId', q.member_id,
    'memberId', case when r.id is not null then q.roster_id end,
    'name', coalesce(nullif(btrim(r.data->>'fullName'), ''), m.name, 'A member'),
    'phone', case when r.id is not null then r.data->>'phone' end,
    'trainerId', q.staff_id,
    'trainerName', (select s.name from public.gym_staff s where s.staff_id = q.staff_id),
    'trainerLive', public._tq_live_trainer(q.gym_id, q.staff_id),
    'question', q.question,
    'askedAt', public._tq_ms(q.asked_at),
    'answer', q.answer,
    'answeredBy', q.answered_by_name,
    'answeredAt', public._tq_ms(q.answered_at),
    'seenAt', public._tq_ms(q.seen_at),
    'withdrawn', q.withdrawn_at is not null,
    'open', public._tq_open(q))
  from public.gym_members m
  left join public.crm_records r on r.gym_id = q.gym_id and r.kind = 'member' and r.id = q.roster_id and not r.deleted
  where m.member_id = q.member_id
$$;

-- A workout name: up to 60 characters once tidied; empty or missing is "Workout"; not a string is INVALID.
create or replace function public._tv_wname(v jsonb) returns text
  language plpgsql immutable set search_path = public as $$
declare s text;
begin
  if v is null or jsonb_typeof(v) = 'null' then return 'Workout'; end if;
  if jsonb_typeof(v) is distinct from 'string' then raise exception 'INVALID'; end if;
  s := left(regexp_replace(btrim(v #>> '{}'), '\s+', ' ', 'g'), 60);
  return coalesce(nullif(btrim(s), ''), 'Workout');
end $$;

-- The phone's recent workouts, checked and rebuilt with only the known fields; raises INVALID.
-- Workouts older than 92 days (India) or more than a day ahead are dropped, not refused (a phone's clock).
create or replace function public._trainer_recent_clean(p jsonb) returns jsonb
  language plpgsql stable set search_path = public as $$
declare
  e jsonb; x jsonb; ex jsonb; res jsonb := '[]'::jsonb; d date;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if p is null or jsonb_typeof(p) = 'null' then return '[]'::jsonb; end if;
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) > 30 or length(p::text) > 40000 then
    raise exception 'INVALID';
  end if;
  for e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'x') is distinct from 'array'
       or jsonb_array_length(e->'x') > 20 then
      raise exception 'INVALID';
    end if;
    d := public._tv_day(e->'d');
    ex := '[]'::jsonb;
    for x in select value from jsonb_array_elements(e->'x') loop
      if jsonb_typeof(x) is distinct from 'object' then raise exception 'INVALID'; end if;
      ex := ex || jsonb_build_array(jsonb_build_object('n', public._tv_name(x->'n'), 'w', public._tv_kg(x->'w'),
              'r', public._tv_int(x->'r', 0, 1000), 's', public._tv_int(x->'s', 0, 100)));
    end loop;
    if d >= today - 92 and d <= today + 1 then
      res := res || jsonb_build_array(jsonb_build_object('d', to_char(d, 'YYYY-MM-DD'), 'n', public._tv_wname(e->'n'), 'x', ex));
    end if;
  end loop;
  -- Newest first.
  return coalesce((select jsonb_agg(w.value order by w.value->>'d' desc) from jsonb_array_elements(res) w), '[]'::jsonb);
end $$;

-- Leaving the gym takes the member's questions with it at once.
create or replace function public._tq_member_left() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.trainer_questions where member_id = new.member_id;
  return new;
end $$;
drop trigger if exists gym_members_questions_left on public.gym_members;
create trigger gym_members_questions_left after update of left_at on public.gym_members
  for each row when (old.left_at is null and new.left_at is not null)
  execute function public._tq_member_left();

-- ------------------------------------------------------------------ the member's side
create or replace function public.member_ask_choices(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); link jsonb; mine public.gym_staff;
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  link := public._member_roster_link(p_key);
  if link ? 'rosterId' then mine := public._trainer_of(m.gym_id, link->>'rosterId'); end if;
  return jsonb_build_object('ok', true,
    'mine', mine.staff_id,
    -- The people a member may ask: every ticked trainer and the gym's owner (who then sees only that thread).
    'trainers', coalesce((select jsonb_agg(jsonb_build_object('id', s.staff_id, 'name', public._tq_short(s.name),
                                   'owner', s.role = 'owner') order by s.name, s.staff_id)
                            from public.gym_staff s
                           where s.gym_id = m.gym_id and public._tq_live_trainer(m.gym_id, s.staff_id)), '[]'::jsonb),
    'open', exists (select 1 from public.trainer_questions q where q.member_id = m.member_id and public._tq_open(q)));
end $$;

create or replace function public.member_ask_trainer(p_key text, p_staff uuid, p_question text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); txt text; link jsonb; q public.trainer_questions;
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  txt := public._tq_text(p_question, 500);
  if p_staff is not null and not public._tq_live_trainer(m.gym_id, p_staff) then raise exception 'NOT_TRAINER'; end if;
  if exists (select 1 from public.gyms where gym_id = m.gym_id and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  -- One at a time per member, even with two taps at once.
  perform 1 from public.gym_members where member_id = m.member_id for update;
  if exists (select 1 from public.trainer_questions x where x.member_id = m.member_id and public._tq_open(x)) then
    raise exception 'OPEN_QUESTION';
  end if;
  if (select count(*) from public.trainer_questions x where x.member_id = m.member_id and x.asked_at > now() - interval '24 hours') >= 3 then
    raise exception 'TOO_MANY';
  end if;
  link := public._member_roster_link(p_key);
  insert into public.trainer_questions(gym_id, member_id, roster_id, staff_id, question)
    values (m.gym_id, m.member_id, link->>'rosterId', p_staff, txt)
  returning * into q;
  return jsonb_build_object('ok', true, 'question', public._tq_member_row(q));
end $$;

create or replace function public.member_questions(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); list jsonb;
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  delete from public.trainer_questions where member_id = m.member_id and asked_at < now() - interval '180 days';
  select coalesce(jsonb_agg(public._tq_member_row(q) order by q.asked_at desc), '[]'::jsonb) into list
    from public.trainer_questions q
   where q.question_id in (select x.question_id from public.trainer_questions x
                            where x.member_id = m.member_id order by x.asked_at desc limit 20);
  -- The replies are seen now (a paused gym refuses the update: then they stay unseen, quietly).
  begin
    update public.trainer_questions set seen_at = now()
     where member_id = m.member_id and answer is not null and seen_at is null;
  exception when others then
    null;
  end;
  return jsonb_build_object('ok', true, 'questions', list);
end $$;

create or replace function public.member_withdraw_question(p_key text, p_id uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); n int;
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  update public.trainer_questions set withdrawn_at = now()
   where question_id = p_id and member_id = m.member_id and answer is null and withdrawn_at is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ the gym's side
create or replace function public.owner_questions(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb := public._trainer_viewer(p_key); g uuid := (v->>'gym')::uuid; list jsonb; open_n int;
begin
  delete from public.trainer_questions where gym_id = g and asked_at < now() - interval '180 days';
  select coalesce(jsonb_agg(public._tq_gym_row(y) order by y.asked_at desc), '[]'::jsonb) into list
    from public.trainer_questions y
   where y.question_id in (
    select q.question_id from public.trainer_questions q
      join public.gym_members m on m.member_id = q.member_id and m.left_at is null
     where q.gym_id = g and q.asked_at > now() - interval '60 days' and public._tq_visible(v, q)
     order by q.asked_at desc limit 200);
  select count(*) into open_n from public.trainer_questions q
    join public.gym_members m on m.member_id = q.member_id and m.left_at is null
   where q.gym_id = g and public._tq_open(q) and public._tq_visible(v, q);
  return jsonb_build_object('ok', true, 'role', case when (v->>'owner')::boolean then 'owner' else 'trainer' end,
    'open', open_n, 'questions', list);
end $$;

create or replace function public.owner_question_count(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb := public._trainer_viewer(p_key); g uuid := (v->>'gym')::uuid; open_n int;
begin
  select count(*) into open_n from public.trainer_questions q
    join public.gym_members m on m.member_id = q.member_id and m.left_at is null
   where q.gym_id = g and public._tq_open(q) and public._tq_visible(v, q);
  return jsonb_build_object('ok', true, 'open', open_n);
end $$;

create or replace function public.owner_answer_question(p_key text, p_id uuid, p_answer text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb := public._trainer_viewer(p_key);
  g uuid := (v->>'gym')::uuid;
  st public.gym_staff := public._staff(p_key);
  txt text;
  q public.trainer_questions;
  who text;
begin
  txt := public._tq_text(p_answer, 1000);
  select * into q from public.trainer_questions where question_id = p_id and gym_id = g for update;
  if q.question_id is null or not public._tq_visible(v, q)
     or not exists (select 1 from public.gym_members m where m.member_id = q.member_id and m.left_at is null) then
    raise exception 'NOT_FOUND';
  end if;
  if q.withdrawn_at is not null then raise exception 'WITHDRAWN'; end if;
  if q.answer is not null then raise exception 'ALREADY_ANSWERED'; end if;
  if exists (select 1 from public.gyms where gym_id = g and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  -- An owner key has no person: the gym's owner signs it.
  who := coalesce(nullif(btrim(st.name), ''),
                  (select s.name from public.gym_staff s where s.gym_id = g and s.role = 'owner' and s.removed_at is null
                    order by s.created_at limit 1),
                  'Your gym');
  update public.trainer_questions
     set answer = txt, answered_by = st.staff_id, answered_by_name = left(who, 80), answered_at = now()
   where question_id = q.question_id
  returning * into q;
  -- The pop-up on the member's phone. Never in the way of the reply itself: a failure here is only logged.
  begin
    insert into public.push_jobs(gym_id, kind, ref_id, due_at) values (g, 'trainer_reply', q.question_id, now())
      on conflict do nothing;
  exception when others then
    raise warning 'push job for reply % not made: %', q.question_id, sqlerrm;
  end;
  return jsonb_build_object('ok', true, 'question', public._tq_gym_row(q));
end $$;

-- ------------------------------------------------------------------ progress
create or replace function public.member_trainer_share2(p_key text, p_summary jsonb, p_recent jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); c jsonb; rc jsonb; link jsonb;
begin
  c := public._trainer_clean(p_summary);
  rc := public._trainer_recent_clean(p_recent);
  if exists (select 1 from public.gyms where gym_id = m.gym_id and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  link := public._member_roster_link(p_key);
  insert into public.gym_progress_summaries(member_id, gym_id, roster_id, summary, recent, updated_at)
    values (m.member_id, m.gym_id, link->>'rosterId', c, rc, now())
  on conflict (member_id) do update
    set gym_id = excluded.gym_id, roster_id = excluded.roster_id, summary = excluded.summary,
        recent = excluded.recent, updated_at = now();
  return jsonb_build_object('ok', true, 'on', true);
end $$;

-- One list member's progress, for the owner or their own ticked trainer.
create or replace function public.owner_member_progress(p_key text, p_member text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb := public._trainer_viewer(p_key);
  g uuid := (v->>'gym')::uuid;
  me uuid := nullif(v->>'staff', '')::uuid;
  tr public.gym_staff;
  p public.gym_progress_summaries;
begin
  if p_member is null or length(p_member) not between 1 and 64 then raise exception 'NO_MEMBER'; end if;
  if not (v->>'owner')::boolean then
    tr := public._trainer_of(g, p_member);
    if tr.staff_id is distinct from me then return jsonb_build_object('ok', true, 'allowed', false); end if;
  end if;
  delete from public.gym_progress_summaries where gym_id = g and roster_id = p_member and updated_at < now() - interval '90 days';
  select s.* into p from public.gym_progress_summaries s
    join public.gym_members m on m.member_id = s.member_id and m.left_at is null
   where s.gym_id = g and s.roster_id = p_member
   order by s.updated_at desc limit 1;
  if p.member_id is null then return jsonb_build_object('ok', true, 'allowed', true, 'shared', false); end if;
  return jsonb_build_object('ok', true, 'allowed', true, 'shared', true,
    'summary', p.summary, 'recent', coalesce(p.recent, '[]'::jsonb), 'hasRecent', p.recent is not null,
    'updatedAt', public._tq_ms(p.updated_at), 'helpAt', public._tq_ms(p.help_at));
end $$;

-- ------------------------------------------------------------------ the sender (0038, plus trainer_reply)
-- The next due job's next addresses (at most p_max, 1-500), with the words; null = nothing to send.
-- -> {jobId, kind ('message'|'offer'|'trainer_reply'), refId, gymId, gymName, title, body, msgKind, tokens, last}
-- trainer_reply: title = the first name of who replied, body = the reply; only the asking member's phones.
create or replace function public.hq_push_next(p_max int default 40)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  j public.push_jobs;
  msg public.gym_messages;
  ofr public.gym_offers;
  tq public.trainer_questions;
  gname text;
  lim int := least(greatest(coalesce(p_max, 40), 1), 500);
  toks text[];
  tries int := 0;
begin
  perform public._hq_guard();
  -- Tidy now and then (cheap): finished jobs after 30 days, addresses not refreshed for 60 days.
  if random() < 0.02 then
    delete from public.push_jobs where done_at < now() - interval '30 days';
    delete from public.member_push_tokens where updated_at < now() - interval '60 days';
  end if;
  loop
    tries := tries + 1;
    if tries > 25 then return null; end if;
    select * into j from public.push_jobs
     where done_at is null and due_at <= now()
     order by due_at, job_id
     limit 1
     for update skip locked;
    if j.job_id is null then return null; end if;

    if j.due_at < now() - interval '6 hours' then
      update public.push_jobs set done_at = now(), why_done = 'late' where job_id = j.job_id;
      continue;
    end if;
    select name into gname from public.gyms where gym_id = j.gym_id;

    if j.kind = 'message' then
      select * into msg from public.gym_messages where message_id = j.ref_id;
      if msg.message_id is null or msg.withdrawn_at is not null then
        update public.push_jobs set done_at = now(), why_done = 'withdrawn' where job_id = j.job_id;
        continue;
      end if;
      select array_agg(x.token order by x.token) into toks from (
        select t.token from public.member_push_tokens t
          join public.gym_members gm on gm.member_id = t.member_id
         where t.gym_id = j.gym_id and gm.gym_id = j.gym_id and gm.left_at is null
           and t.token > coalesce(j.after_token, '')
           and (not msg.to_group or exists (select 1 from public.gym_message_to mt
                                             where mt.message_id = msg.message_id and mt.member_id = gm.member_id))
         order by t.token
         limit lim) x;
    elsif j.kind = 'offer' then
      select * into ofr from public.gym_offers where offer_id = j.ref_id;
      if ofr.offer_id is null or ofr.stopped_at is not null then
        update public.push_jobs set done_at = now(), why_done = 'withdrawn' where job_id = j.job_id;
        continue;
      end if;
      select array_agg(x.token order by x.token) into toks from (
        select t.token from public.member_push_tokens t
          join public.gym_members gm on gm.member_id = t.member_id
         where t.gym_id = j.gym_id and gm.gym_id = j.gym_id and gm.left_at is null
           and t.token > coalesce(j.after_token, '')
         order by t.token
         limit lim) x;
    elsif j.kind = 'trainer_reply' then
      select * into tq from public.trainer_questions where question_id = j.ref_id;
      if tq.question_id is null or tq.answer is null or tq.withdrawn_at is not null then
        update public.push_jobs set done_at = now(), why_done = 'withdrawn' where job_id = j.job_id;
        continue;
      end if;
      select array_agg(x.token order by x.token) into toks from (
        select t.token from public.member_push_tokens t
          join public.gym_members gm on gm.member_id = t.member_id
         where t.member_id = tq.member_id and t.gym_id = j.gym_id and gm.gym_id = j.gym_id and gm.left_at is null
           and t.token > coalesce(j.after_token, '')
         order by t.token
         limit lim) x;
    else
      update public.push_jobs set done_at = now(), why_done = 'unknown' where job_id = j.job_id;
      continue;
    end if;

    toks := coalesce(toks, array[]::text[]);
    if array_length(toks, 1) is null then
      update public.push_jobs set done_at = now(), why_done = 'sent' where job_id = j.job_id;
      continue;
    end if;
    -- Moved past these addresses before they are sent: never twice.
    update public.push_jobs
       set after_token = toks[array_length(toks, 1)], sent = sent + array_length(toks, 1),
           done_at = case when array_length(toks, 1) < lim then now() end,
           why_done = case when array_length(toks, 1) < lim then 'sent' end
     where job_id = j.job_id;
    return jsonb_build_object(
      'jobId', j.job_id, 'kind', j.kind, 'refId', j.ref_id, 'gymId', j.gym_id, 'gymName', coalesce(gname, ''),
      'title', case when j.kind = 'message' then msg.title
                    when j.kind = 'offer' then ofr.title
                    else coalesce(nullif(split_part(btrim(coalesce(tq.answered_by_name, '')), ' ', 1), ''), 'Your trainer') end,
      'body', case when j.kind = 'message' then msg.body when j.kind = 'trainer_reply' then tq.answer else '' end,
      'msgKind', case when j.kind = 'message' then msg.kind when j.kind = 'offer' then 'offer' else 'trainer_reply' end,
      'tokens', to_jsonb(toks),
      'last', array_length(toks, 1) < lim);
  end loop;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._tq_text(text, int) from public, anon, authenticated;
revoke all on function public._tq_short(text) from public, anon, authenticated;
revoke all on function public._tq_live_trainer(uuid, uuid) from public, anon, authenticated;
revoke all on function public._tq_is_owner(uuid, uuid) from public, anon, authenticated;
revoke all on function public._tq_visible(jsonb, public.trainer_questions) from public, anon, authenticated;
revoke all on function public._tq_open(public.trainer_questions) from public, anon, authenticated;
revoke all on function public._tq_ms(timestamptz) from public, anon, authenticated;
revoke all on function public._tq_member_row(public.trainer_questions) from public, anon, authenticated;
revoke all on function public._tq_gym_row(public.trainer_questions) from public, anon, authenticated;
revoke all on function public._tv_wname(jsonb) from public, anon, authenticated;
revoke all on function public._trainer_recent_clean(jsonb) from public, anon, authenticated;
revoke all on function public._tq_member_left() from public, anon, authenticated;

revoke all on function public.member_ask_choices(text) from public;
revoke all on function public.member_ask_trainer(text, uuid, text) from public;
revoke all on function public.member_questions(text) from public;
revoke all on function public.member_withdraw_question(text, uuid) from public;
revoke all on function public.owner_questions(text) from public;
revoke all on function public.owner_question_count(text) from public;
revoke all on function public.owner_answer_question(text, uuid, text) from public;
revoke all on function public.member_trainer_share2(text, jsonb, jsonb) from public;
revoke all on function public.owner_member_progress(text, text) from public;
grant execute on function public.member_ask_choices(text) to anon, authenticated;
grant execute on function public.member_ask_trainer(text, uuid, text) to anon, authenticated;
grant execute on function public.member_questions(text) to anon, authenticated;
grant execute on function public.member_withdraw_question(text, uuid) to anon, authenticated;
grant execute on function public.owner_questions(text) to anon, authenticated;
grant execute on function public.owner_question_count(text) to anon, authenticated;
grant execute on function public.owner_answer_question(text, uuid, text) to anon, authenticated;
grant execute on function public.member_trainer_share2(text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.owner_member_progress(text, text) to anon, authenticated;

revoke all on function public.hq_push_next(int) from public, anon, authenticated;
grant execute on function public.hq_push_next(int) to service_role;

-- PostgREST learns the new functions at once (instead of on its next schema reload).
notify pgrst, 'reload schema';
