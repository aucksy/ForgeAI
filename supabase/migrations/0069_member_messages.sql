-- APPLIED LIVE 12 Nov 2026 (owner, 12 Nov: "All yes"), in the SQL Editor, this exact text from 1ce95b12 (sha256 a246392e...).
-- Answer: "Success. No rows returned". Read-only check after: the tables gym_talk_threads and gym_talk_messages and the
-- trigger gym_members_talk_left exist; member_push_notes' kind check includes 'gym_reply'. The live run of
-- supabase/tests/0069 was not done; CI runs it. Only these header lines changed since 1ce95b12, so this file's hash is
-- no longer a246392e (the SQL below is the same, byte for byte).
-- Was: NOT APPLIED LIVE. Waits for the owner's yes ("No LIVE database changes without my yes").
--
-- 0069: "Message your gym" (member app, Gym tab) and "Member messages" (admin app). Owner, 12 Nov 2026: "Do we have
-- an option in the app for user to send queries or feedback for the gym from inside the gym section? And does the
-- admin app has a place for them to know these questions and respond? If not, we gotta build it."
-- Plan: docs/plans/gym-member-messages.md.
--
-- Additive and re-runnable: two new tables, new functions, one new trigger on gym_members (leaving), and one more
-- allowed kind ('gym_reply') on 0054's member_push_notes (the HQ Worker's hq_push_direct_next sends any kind the
-- same way, deploy/hq/push.js fcmNoteMessage; no Worker change). Nothing that exists changes behaviour.
-- Apply after 0054 (needs 0053's _tq_text / _tq_ms; 0054's _push_note and member_push_notes; 0035's
-- _member_roster_link; 0027's _gym_not_suspended; 0010's _owner_gym / _staff).
-- Test: supabase/tests/0069_member_messages.sql (CI runs it after every migration; pasted into the SQL Editor it
-- always ends in an error and so changes nothing).
-- The member app and the admin app both work without it: they ask once, get "no such function", and hide
-- "Message your gym" and "Member messages" with no error.
-- Undo: drop the functions below, the trigger gym_members_talk_left, the tables gym_talk_messages and
-- gym_talk_threads; put member_push_notes' kind check back to ('plan_request', 'report_request', 'order') once no
-- 'gym_reply' note is left.
--
-- WHAT IT IS. A member who is in a gym starts a message: a kind (question, feedback, complaint) and a text (at most
-- 1000 characters). Feedback may be sent without the member's name ("anonymous"; feedback only). The gym replies in
-- the same thread; the member may write back; the gym marks it done (a new line from the member opens it again).
-- Not a live chat: at most 5 new messages and 20 lines from a member in any 24 hours, at most 50 lines a thread.
--
-- WHO SEES WHAT (my pick, told to the owner):
--   - the owner (an owner key, or a person whose role is 'owner'): every thread of the gym;
--   - everyone else signed in at the gym (front desk, trainers): questions and feedback, NOT complaints (a complaint
--     is often about a staff member, so the owner reads it first);
--   - an anonymous thread NEVER carries the member's name, phone, app id or list id to anyone at the gym, the owner
--     included (the member id is kept only so the member sees their own thread and gets the reply);
--   - the member sees only their own threads, and only the first name of whoever replied.
-- Kept 180 days after the last line, then deleted on the next read; deleted at once when the member leaves the gym.
-- A paused (suspended) gym refuses new lines (_gym_not_suspended).
--
-- WHO MAY CALL (the tables have RLS on, no policies and no grants; everything goes through these):
--   member_talk_unread(key)                         {ok, unread}  threads with a gym reply the member has not read
--   member_talk_list(key)                           {ok, unread: 0, threads:[...]} last 20, newest first; marks read
--   member_talk_send(key, kind, anonymous, text)    {ok, thread}; INVALID, ANON_FEEDBACK_ONLY, TOO_MANY, SUSPENDED,
--                                                   BAD_KEY
--   member_talk_reply(key, thread, text)            {ok, thread}; NOT_FOUND, THREAD_FULL, TOO_MANY, INVALID, SUSPENDED
--   owner_talk_count(key)                           {ok, waiting}  open threads whose last line is the member's
--   owner_talk_list(key)                            {ok, role, waiting, threads:[...]} last 90 days, at most 200;
--                                                   marks the member's newest line seen by the gym
--   owner_talk_reply(key, thread, text)             {ok, thread}; NOT_FOUND, THREAD_FULL, INVALID, SUSPENDED
--   owner_talk_done(key, thread, done)              {ok, thread}; NOT_FOUND, SUSPENDED

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_talk_threads (
  thread_id      uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gyms(gym_id) on delete cascade,
  member_id      uuid not null references public.gym_members(member_id) on delete cascade,
  -- The gym's list id (0035 link); always null for a thread sent without the name.
  roster_id      text check (roster_id is null or length(roster_id) between 1 and 64),
  kind           text not null check (kind in ('question', 'feedback', 'complaint')),
  anonymous      boolean not null default false,
  created_at     timestamptz not null default now(),
  last_at        timestamptz not null default now(),
  last_from      text not null default 'member' check (last_from in ('member', 'gym')),
  member_seen_at timestamptz,
  gym_seen_at    timestamptz,
  done_at        timestamptz,
  done_by_name   text check (done_by_name is null or length(done_by_name) <= 80),
  constraint gym_talk_anonymous_feedback_only check (not anonymous or kind = 'feedback'),
  constraint gym_talk_anonymous_no_roster check (not anonymous or roster_id is null)
);
create index if not exists gym_talk_threads_by_gym on public.gym_talk_threads(gym_id, last_at desc);
create index if not exists gym_talk_threads_by_member on public.gym_talk_threads(member_id, last_at desc);
alter table public.gym_talk_threads enable row level security;
revoke all on public.gym_talk_threads from public, anon, authenticated;

create table if not exists public.gym_talk_messages (
  msg_id     uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.gym_talk_threads(thread_id) on delete cascade,
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  from_gym   boolean not null,
  staff_id   uuid references public.gym_staff(staff_id) on delete set null,
  staff_name text check (staff_name is null or length(staff_name) <= 80),
  body       text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  -- Written order, for lines with the same time (two lines in one transaction share now()).
  seq        bigint generated always as identity
);
create index if not exists gym_talk_messages_by_thread on public.gym_talk_messages(thread_id, created_at, seq);
alter table public.gym_talk_messages enable row level security;
revoke all on public.gym_talk_messages from public, anon, authenticated;

drop trigger if exists gym_talk_threads_not_suspended on public.gym_talk_threads;
create trigger gym_talk_threads_not_suspended before insert on public.gym_talk_threads
  for each row execute function public._gym_not_suspended();
drop trigger if exists gym_talk_messages_not_suspended on public.gym_talk_messages;
create trigger gym_talk_messages_not_suspended before insert on public.gym_talk_messages
  for each row execute function public._gym_not_suspended();

-- The reply's pop-up rides 0054's member notes (one note per reply, sent by the HQ Worker every minute).
alter table public.member_push_notes drop constraint if exists member_push_notes_kind_check;
alter table public.member_push_notes add constraint member_push_notes_kind_check
  check (kind in ('plan_request', 'report_request', 'order', 'gym_reply'));

-- ------------------------------------------------------------------ helpers (no grants)
-- Who is asking at the gym: {gym, staff (null for an owner key), owner, name}. BAD_KEY for no live key.
create or replace function public._talk_viewer(p_key text) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key);
begin
  return jsonb_build_object('gym', g, 'staff', st.staff_id,
    'owner', st.staff_id is null or st.role = 'owner',
    -- An owner key has no person: the gym's first owner signs for it.
    'name', left(coalesce(nullif(btrim(st.name), ''),
                (select s.name from public.gym_staff s where s.gym_id = g and s.role = 'owner' and s.removed_at is null
                  order by s.created_at limit 1),
                'Your gym'), 80));
end $$;

-- May this viewer see this thread? The owner: all; anyone else: not complaints.
create or replace function public._talk_visible(v jsonb, t public.gym_talk_threads) returns boolean
  language sql stable set search_path = public as $$
  select coalesce(t.gym_id = (v->>'gym')::uuid and ((v->>'owner')::boolean or t.kind <> 'complaint'), false)
$$;

-- The last 50 lines of a thread, oldest first. `gym_view`: the gym sees the full staff name, the member the first.
create or replace function public._talk_lines(p_thread uuid, gym_view boolean) returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.msg_id,
      'fromGym', x.from_gym,
      'who', case when not x.from_gym then null
                  when gym_view then nullif(btrim(coalesce(x.staff_name, '')), '')
                  else nullif(split_part(btrim(coalesce(x.staff_name, '')), ' ', 1), '') end,
      'text', x.body,
      'at', public._tq_ms(x.created_at)) order by x.created_at, x.seq), '[]'::jsonb)
  from (select * from public.gym_talk_messages m where m.thread_id = p_thread order by m.created_at desc, m.seq desc limit 50) x
$$;

-- A gym reply the member has not read yet?
create or replace function public._talk_unread(t public.gym_talk_threads) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.gym_talk_messages x
                  where x.thread_id = t.thread_id and x.from_gym
                    and x.created_at > coalesce(t.member_seen_at, '-infinity'::timestamptz))
$$;

-- What the member sees of one thread.
create or replace function public._talk_member_row(t public.gym_talk_threads) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.thread_id,
    'kind', t.kind,
    'anonymous', t.anonymous,
    'createdAt', public._tq_ms(t.created_at),
    'lastAt', public._tq_ms(t.last_at),
    'done', t.done_at is not null,
    -- "Seen by your gym": someone at the gym opened the list after the member's newest line.
    'seenByGym', t.last_from = 'member' and t.gym_seen_at is not null and t.gym_seen_at >= t.last_at,
    'unread', public._talk_unread(t),
    'messages', public._talk_lines(t.thread_id, false))
$$;

-- What the gym sees of one thread. Sent without the name: no name, phone, app id or list id.
create or replace function public._talk_gym_row(t public.gym_talk_threads) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.thread_id,
    'kind', t.kind,
    'anonymous', t.anonymous,
    'appId', case when t.anonymous then null else t.member_id end,
    'memberId', case when t.anonymous or r.id is null then null else t.roster_id end,
    'name', case when t.anonymous then null else coalesce(nullif(btrim(r.data->>'fullName'), ''), m.name, 'A member') end,
    'phone', case when t.anonymous or r.id is null then null else r.data->>'phone' end,
    'createdAt', public._tq_ms(t.created_at),
    'lastAt', public._tq_ms(t.last_at),
    'lastFrom', t.last_from,
    'waiting', t.done_at is null and t.last_from = 'member',
    'done', t.done_at is not null,
    'doneAt', public._tq_ms(t.done_at),
    'doneBy', t.done_by_name,
    -- The member opened the reply (their app read the list after the gym's newest line).
    'readByMember', t.last_from = 'gym' and t.member_seen_at is not null and t.member_seen_at >= t.last_at,
    'messages', public._talk_lines(t.thread_id, true))
  from public.gym_members m
  left join public.crm_records r on r.gym_id = t.gym_id and r.kind = 'member' and r.id = t.roster_id and not r.deleted
  where m.member_id = t.member_id
$$;

-- A member's lines in the last 24 hours, and new threads in the last 24 hours: TOO_MANY past 20 / 5.
create or replace function public._talk_member_limits(p_member uuid, p_new_thread boolean) returns void
  language plpgsql stable security definer set search_path = public as $$
begin
  if p_new_thread and (select count(*) from public.gym_talk_threads t
                        where t.member_id = p_member and t.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'TOO_MANY';
  end if;
  if (select count(*) from public.gym_talk_messages x join public.gym_talk_threads t on t.thread_id = x.thread_id
       where t.member_id = p_member and not x.from_gym and x.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'TOO_MANY';
  end if;
end $$;

-- Leaving the gym takes the member's messages with it at once.
create or replace function public._talk_member_left() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.gym_talk_threads where member_id = new.member_id;
  return new;
end $$;
drop trigger if exists gym_members_talk_left on public.gym_members;
create trigger gym_members_talk_left after update of left_at on public.gym_members
  for each row when (old.left_at is null and new.left_at is not null)
  execute function public._talk_member_left();

-- ------------------------------------------------------------------ the member's side
create or replace function public.member_talk_unread(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); n int;
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  select count(*) into n from public.gym_talk_threads t
   where t.member_id = m.member_id and t.last_at > now() - interval '180 days' and public._talk_unread(t);
  return jsonb_build_object('ok', true, 'unread', n);
end $$;

create or replace function public.member_talk_list(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); list jsonb;
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  delete from public.gym_talk_threads where member_id = m.member_id and last_at < now() - interval '180 days';
  select coalesce(jsonb_agg(public._talk_member_row(t) order by t.last_at desc, t.thread_id), '[]'::jsonb) into list
    from public.gym_talk_threads t
   where t.thread_id in (select x.thread_id from public.gym_talk_threads x
                          where x.member_id = m.member_id order by x.last_at desc, x.thread_id limit 20);
  -- The gym's replies are read now.
  update public.gym_talk_threads set member_seen_at = now() where member_id = m.member_id;
  return jsonb_build_object('ok', true, 'unread', 0, 'threads', list);
end $$;

create or replace function public.member_talk_send(p_key text, p_kind text, p_anonymous boolean, p_text text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  k text := lower(btrim(coalesce(p_kind, '')));
  anon boolean := coalesce(p_anonymous, false);
  txt text;
  link jsonb;
  t public.gym_talk_threads;
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  if k not in ('question', 'feedback', 'complaint') then raise exception 'INVALID'; end if;
  if anon and k <> 'feedback' then raise exception 'ANON_FEEDBACK_ONLY'; end if;
  txt := public._tq_text(p_text, 1000);
  if exists (select 1 from public.gyms where gym_id = m.gym_id and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  -- Two taps at once count as two, never past the limits.
  perform 1 from public.gym_members where member_id = m.member_id for update;
  perform public._talk_member_limits(m.member_id, true);
  if not anon then link := public._member_roster_link(p_key); end if;
  insert into public.gym_talk_threads(gym_id, member_id, roster_id, kind, anonymous, member_seen_at)
    values (m.gym_id, m.member_id, case when anon then null else link->>'rosterId' end, k, anon, now())
  returning * into t;
  insert into public.gym_talk_messages(thread_id, gym_id, from_gym, body) values (t.thread_id, m.gym_id, false, txt);
  return jsonb_build_object('ok', true, 'thread', public._talk_member_row(t));
end $$;

create or replace function public.member_talk_reply(p_key text, p_thread uuid, p_text text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); txt text; t public.gym_talk_threads;
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  txt := public._tq_text(p_text, 1000);
  select * into t from public.gym_talk_threads where thread_id = p_thread and member_id = m.member_id for update;
  if t.thread_id is null then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.gyms where gym_id = m.gym_id and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  if (select count(*) from public.gym_talk_messages x where x.thread_id = t.thread_id) >= 50 then raise exception 'THREAD_FULL'; end if;
  perform public._talk_member_limits(m.member_id, false);
  insert into public.gym_talk_messages(thread_id, gym_id, from_gym, body) values (t.thread_id, t.gym_id, false, txt);
  -- A new line opens a done thread again.
  update public.gym_talk_threads
     set last_at = now(), last_from = 'member', done_at = null, done_by_name = null, member_seen_at = now()
   where thread_id = t.thread_id
  returning * into t;
  return jsonb_build_object('ok', true, 'thread', public._talk_member_row(t));
end $$;

-- ------------------------------------------------------------------ the gym's side
create or replace function public.owner_talk_count(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb := public._talk_viewer(p_key); n int;
begin
  select count(*) into n from public.gym_talk_threads t
    join public.gym_members m on m.member_id = t.member_id and m.left_at is null
   where t.gym_id = (v->>'gym')::uuid and t.done_at is null and t.last_from = 'member'
     and t.last_at > now() - interval '90 days' and public._talk_visible(v, t);
  return jsonb_build_object('ok', true, 'waiting', n);
end $$;

create or replace function public.owner_talk_list(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb := public._talk_viewer(p_key); g uuid := (v->>'gym')::uuid; ids uuid[]; list jsonb; n int;
begin
  delete from public.gym_talk_threads where gym_id = g and last_at < now() - interval '180 days';
  select array_agg(q.thread_id) into ids from (
    select t.thread_id from public.gym_talk_threads t
      join public.gym_members m on m.member_id = t.member_id and m.left_at is null
     where t.gym_id = g and t.last_at > now() - interval '90 days' and public._talk_visible(v, t)
     order by t.last_at desc, t.thread_id limit 200) q;
  -- "Seen by your gym" on the member's side (a paused gym still reads; this is not a new line).
  update public.gym_talk_threads set gym_seen_at = now()
   where thread_id = any(coalesce(ids, '{}')) and last_from = 'member';
  select coalesce(jsonb_agg(public._talk_gym_row(t) order by t.last_at desc, t.thread_id), '[]'::jsonb) into list
    from public.gym_talk_threads t where t.thread_id = any(coalesce(ids, '{}'));
  select count(*) into n from public.gym_talk_threads t
   where t.thread_id = any(coalesce(ids, '{}')) and t.done_at is null and t.last_from = 'member';
  return jsonb_build_object('ok', true, 'role', case when (v->>'owner')::boolean then 'owner' else 'staff' end,
    'waiting', n, 'threads', list);
end $$;

create or replace function public.owner_talk_reply(p_key text, p_thread uuid, p_text text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb := public._talk_viewer(p_key);
  g uuid := (v->>'gym')::uuid;
  txt text;
  t public.gym_talk_threads;
  mid uuid;
begin
  txt := public._tq_text(p_text, 1000);
  select * into t from public.gym_talk_threads where thread_id = p_thread and gym_id = g for update;
  if t.thread_id is null or not public._talk_visible(v, t)
     or not exists (select 1 from public.gym_members m where m.member_id = t.member_id and m.left_at is null) then
    raise exception 'NOT_FOUND';
  end if;
  if exists (select 1 from public.gyms where gym_id = g and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  if (select count(*) from public.gym_talk_messages x where x.thread_id = t.thread_id) >= 50 then raise exception 'THREAD_FULL'; end if;
  insert into public.gym_talk_messages(thread_id, gym_id, from_gym, staff_id, staff_name, body)
    values (t.thread_id, g, true, nullif(v->>'staff', '')::uuid, v->>'name', txt)
  returning msg_id into mid;
  update public.gym_talk_threads set last_at = now(), last_from = 'gym', gym_seen_at = now()
   where thread_id = t.thread_id
  returning * into t;
  -- The pop-up on the member's phone (never in the way of the reply: _push_note only warns on a failure).
  perform public._push_note(g, t.member_id, 'gym_reply', mid, 'gym_reply:' || mid::text,
    'Reply to your message: ' || left(regexp_replace(txt, '\s+', ' ', 'g'), 150), '/shop/message');
  return jsonb_build_object('ok', true, 'thread', public._talk_gym_row(t));
end $$;

create or replace function public.owner_talk_done(p_key text, p_thread uuid, p_done boolean)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb := public._talk_viewer(p_key); g uuid := (v->>'gym')::uuid; t public.gym_talk_threads;
begin
  select * into t from public.gym_talk_threads where thread_id = p_thread and gym_id = g for update;
  if t.thread_id is null or not public._talk_visible(v, t)
     or not exists (select 1 from public.gym_members m where m.member_id = t.member_id and m.left_at is null) then
    raise exception 'NOT_FOUND';
  end if;
  if exists (select 1 from public.gyms where gym_id = g and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  if coalesce(p_done, true) then
    update public.gym_talk_threads set done_at = coalesce(done_at, now()), done_by_name = coalesce(done_by_name, v->>'name')
     where thread_id = t.thread_id returning * into t;
  else
    update public.gym_talk_threads set done_at = null, done_by_name = null where thread_id = t.thread_id returning * into t;
  end if;
  return jsonb_build_object('ok', true, 'thread', public._talk_gym_row(t));
end $$;

-- ------------------------------------------------------------------ who may call
revoke all on function public._talk_viewer(text) from public, anon, authenticated;
revoke all on function public._talk_visible(jsonb, public.gym_talk_threads) from public, anon, authenticated;
revoke all on function public._talk_lines(uuid, boolean) from public, anon, authenticated;
revoke all on function public._talk_unread(public.gym_talk_threads) from public, anon, authenticated;
revoke all on function public._talk_member_row(public.gym_talk_threads) from public, anon, authenticated;
revoke all on function public._talk_gym_row(public.gym_talk_threads) from public, anon, authenticated;
revoke all on function public._talk_member_limits(uuid, boolean) from public, anon, authenticated;
revoke all on function public._talk_member_left() from public, anon, authenticated;

revoke all on function public.member_talk_unread(text) from public;
revoke all on function public.member_talk_list(text) from public;
revoke all on function public.member_talk_send(text, text, boolean, text) from public;
revoke all on function public.member_talk_reply(text, uuid, text) from public;
revoke all on function public.owner_talk_count(text) from public;
revoke all on function public.owner_talk_list(text) from public;
revoke all on function public.owner_talk_reply(text, uuid, text) from public;
revoke all on function public.owner_talk_done(text, uuid, boolean) from public;
grant execute on function public.member_talk_unread(text) to anon, authenticated;
grant execute on function public.member_talk_list(text) to anon, authenticated;
grant execute on function public.member_talk_send(text, text, boolean, text) to anon, authenticated;
grant execute on function public.member_talk_reply(text, uuid, text) to anon, authenticated;
grant execute on function public.owner_talk_count(text) to anon, authenticated;
grant execute on function public.owner_talk_list(text) to anon, authenticated;
grant execute on function public.owner_talk_reply(text, uuid, text) to anon, authenticated;
grant execute on function public.owner_talk_done(text, uuid, boolean) to anon, authenticated;

-- PostgREST learns the new functions at once (instead of on its next schema reload).
notify pgrst, 'reload schema';
