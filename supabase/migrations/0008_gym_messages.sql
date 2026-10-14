-- 0008: gym messages, Phase 1 (14 Oct 2026) — the gym's news in the member app.
--
-- The owner writes a message on the panel (Shop → Messages): a type (announcement, gym closed,
-- timing change, offer, event, reminder), a title and a short text, sent to every app member of
-- the gym. Each member's app shows it in an inbox (the bell on the Shop tab, with an unread count)
-- and tells the server when the member has seen it, so the panel's Sent list shows "seen by 12 of
-- 40". Push to the phone's notification shade comes with Firebase (Phase 1b); the inbox is the
-- record, push only rings the bell, so nothing here changes when push arrives.
--
-- Guardrails (owner-approved plan, 13 Oct): at most 1 offer or event a day and 3 a week per gym
-- (every member of a gym gets every message, so per gym = per member); at most 20 messages a day
-- as a runaway stop. Closed / timing / reminder / announcement messages are never capped by the
-- offer rule. Days are India days (Asia/Kolkata).
--
-- Members who left: member_leave (0002) only changed the key, so the gym could not tell a member
-- who left from one who did not. It now also stamps left_at; a left member gets no messages and
-- is not counted.

alter table public.gym_members add column if not exists left_at timestamptz;

create table if not exists public.gym_messages (
  message_id   uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(gym_id) on delete cascade,
  kind         text not null check (kind in ('announcement','closed','timing','offer','event','reminder')),
  title        text not null check (length(btrim(title)) between 1 and 60),
  body         text not null default '' check (length(body) <= 300),
  created_at   timestamptz not null default now(),
  recipients   integer not null default 0,
  withdrawn_at timestamptz
);
create index if not exists idx_gym_messages_gym on public.gym_messages(gym_id, created_at desc);

create table if not exists public.gym_message_seen (
  message_id uuid not null references public.gym_messages(message_id) on delete cascade,
  member_id  uuid not null references public.gym_members(member_id) on delete cascade,
  seen_at    timestamptz not null default now(),
  primary key (message_id, member_id)
);

alter table public.gym_messages     enable row level security;
alter table public.gym_message_seen enable row level security;
revoke all on public.gym_messages, public.gym_message_seen from anon, authenticated;

-- ------------------------------------------------------------------ helpers
create or replace function public._message_json(m public.gym_messages) returns jsonb
  language sql stable as $$
  select jsonb_build_object('id', m.message_id, 'kind', m.kind, 'title', m.title, 'body', m.body,
                            'createdAt', m.created_at)
$$;

-- ------------------------------------------------------------------ owner (panel)
create or replace function public.owner_send_message(p_key text, p_kind text, p_title text, p_body text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_body, ''));
  today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  n int;
  m public.gym_messages;
begin
  if p_kind not in ('announcement','closed','timing','offer','event','reminder') then raise exception 'BAD_KIND'; end if;
  if length(t) = 0 then raise exception 'EMPTY'; end if;
  if length(t) > 60 or length(b) > 300 then raise exception 'TOO_LONG'; end if;
  select count(*) into n from public.gym_messages where gym_id = g and created_at >= today_start;
  if n >= 20 then raise exception 'TOO_MANY'; end if;
  if p_kind in ('offer','event') then
    select count(*) into n from public.gym_messages
      where gym_id = g and kind in ('offer','event') and withdrawn_at is null and created_at >= today_start;
    if n >= 1 then raise exception 'OFFER_TODAY'; end if;
    select count(*) into n from public.gym_messages
      where gym_id = g and kind in ('offer','event') and withdrawn_at is null
        and created_at >= today_start - interval '6 days';
    if n >= 3 then raise exception 'OFFER_WEEK'; end if;
  end if;
  select count(*) into n from public.gym_members where gym_id = g and left_at is null;
  insert into public.gym_messages(gym_id, kind, title, body, recipients)
    values (g, p_kind, t, b, n) returning * into m;
  return public._message_json(m) || jsonb_build_object('recipients', m.recipients, 'seen', 0, 'withdrawn', false);
end $$;

-- The Sent list: newest first, with how many of the members it went to have seen it.
create or replace function public.owner_messages(p_key text)
  returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) from (
    select m.created_at,
           public._message_json(m) || jsonb_build_object(
             'recipients', m.recipients,
             'seen', (select count(*) from public.gym_message_seen s where s.message_id = m.message_id),
             'withdrawn', m.withdrawn_at is not null) as j
    from public.gym_messages m
    where m.gym_id = public._owner_gym(p_key)
    order by m.created_at desc
    limit 100) x
$$;

-- "Take back": the message leaves every member's inbox; the Sent list keeps it, marked.
create or replace function public.owner_withdraw_message(p_key text, p_message uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  update public.gym_messages set withdrawn_at = coalesce(withdrawn_at, now())
    where message_id = p_message and gym_id = public._owner_gym(p_key);
  if not found then raise exception 'GONE'; end if;
end $$;

-- ------------------------------------------------------------------ member (app)
-- The inbox: the gym's messages from 14 days before the member joined (so a new member still
-- sees "Closed on Sunday" sent last week), newest first, at most 50, with whether they saw each.
create or replace function public.member_messages(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare mem public.gym_members := public._member(p_key);
begin
  return (select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) from (
    select m.created_at,
           public._message_json(m) || jsonb_build_object('seen',
             exists (select 1 from public.gym_message_seen s where s.message_id = m.message_id and s.member_id = mem.member_id)) as j
    from public.gym_messages m
    where m.gym_id = mem.gym_id and m.withdrawn_at is null
      and m.created_at >= mem.joined_at - interval '14 days'
    order by m.created_at desc
    limit 50) x);
end $$;

-- The member's inbox showed these messages. Ids from another gym are ignored.
create or replace function public.member_saw_messages(p_key text, p_ids uuid[])
  returns integer language plpgsql security definer set search_path = public as $$
declare mem public.gym_members := public._member(p_key); n int;
begin
  if coalesce(array_length(p_ids, 1), 0) > 100 then raise exception 'TOO_MANY'; end if;
  insert into public.gym_message_seen(message_id, member_id)
    select m.message_id, mem.member_id from public.gym_messages m
    where m.message_id = any(p_ids) and m.gym_id = mem.gym_id
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- member_leave (0002), now also stamping left_at (the key change is unchanged).
create or replace function public.member_leave(p_key text)
  returns void language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key);
begin
  update public.gym_members set key_hash = public._hash_key(public._new_key()), left_at = now()
    where member_id = m.member_id;
end $$;

-- owner_app_members (0002), now leaving out members who left (the panel counts who a message goes to).
create or replace function public.owner_app_members(p_key text)
  returns table(member_id uuid, name text, phone text, joined_at timestamptz, last_seen timestamptz,
                orders bigint, spent_p bigint)
  language sql security definer set search_path = public as $$
  select m.member_id, m.name, m.phone, m.joined_at, m.last_seen,
         count(o.order_id) filter (where o.status <> 'cancelled'),
         coalesce(sum(o.total_p) filter (where o.status = 'collected'), 0)
  from public.gym_members m
  left join public.shop_orders o on o.member_id = m.member_id
  where m.gym_id = public._owner_gym(p_key) and m.left_at is null
  group by m.member_id
  order by m.joined_at desc
$$;

revoke all on function public._message_json(public.gym_messages)            from public, anon, authenticated;
revoke all on function public.owner_send_message(text, text, text, text)    from public;
revoke all on function public.owner_messages(text)                          from public;
revoke all on function public.owner_withdraw_message(text, uuid)            from public;
revoke all on function public.member_messages(text)                         from public;
revoke all on function public.member_saw_messages(text, uuid[])             from public;
grant execute on function public.owner_send_message(text, text, text, text) to anon, authenticated;
grant execute on function public.owner_messages(text)                       to anon, authenticated;
grant execute on function public.owner_withdraw_message(text, uuid)         to anon, authenticated;
grant execute on function public.member_messages(text)                      to anon, authenticated;
grant execute on function public.member_saw_messages(text, uuid[])          to anon, authenticated;
grant execute on function public.member_leave(text)                         to anon, authenticated;
