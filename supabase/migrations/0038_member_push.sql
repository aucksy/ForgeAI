-- APPLIED LIVE 28 Oct 2026 (owner: "yes, apply 0038 live in Supabase"; live tests 0038 PASS 44, 0026 PASS 59).
--
-- 0038: the gym's messages and offers pop up on members' phones at once (R-151, R-153 step 2, R-158:
-- "I just want the offers and messages from admin panel to send push notifications to member app").
-- Additive and re-runnable: three new tables, new functions, two triggers on new rows of gym_messages and
-- gym_offers, one trigger on gym_members (leaving); no function that exists is changed. Apply after 0037.
-- Test: supabase/tests/0038_member_push.sql (CI runs it after every migration; pasted into the SQL
-- Editor it always ends in an error and so changes nothing).
--
-- THE PUSH ADDRESS. A phone that joined a gym, with "Messages from my gym" on and the phone's
-- notifications allowed, saves its Firebase (FCM) push address with member_save_push_token. One row
-- per address (a phone that moves to another gym or member moves its row). At most 5 per member (the
-- oldest goes). Deleted: by the phone (member_clear_push_token: the switch went off or notifications
-- were turned off), when the member leaves the gym or the gym lets the phone go (trigger below), when
-- Firebase says the address is dead (hq_push_drop), and when a phone has not refreshed it for 60 days.
-- The address is the only new thing kept; nothing about the member's workouts goes with it.
--
-- WHAT IS SENT. Every new gym message (owner_send_message) and every new workout offer
-- (owner_save_offer) adds one row to push_jobs (triggers below). The sender (the HQ Worker,
-- deploy/hq/push.js, every minute and at once when the admin app sends) calls hq_push_next: it takes
-- the next job that is due (a timed message: once its time has come), and hands back up to p_max
-- addresses of that job with the words. The addresses are those of the members the message is for:
-- a group message only its group, everyone else every member who has not left; an offer every member
-- who has not left. A job is moved past those addresses BEFORE they are sent, so a phone never gets a
-- message twice (a sender that dies mid-way loses a few pop-ups; the phone's own 15-minute check still
-- finds the message). A message taken back before it went, or a job more than 6 hours late, is
-- skipped. Jobs are deleted 30 days after they finished.
--
-- WHO CAN READ WHAT. Row security on and no grants: everything goes through the functions. Members:
-- only their own address, with their member key. The hq_push_* functions: the HQ key (service_role)
-- only, like every hq_* function (tests/0026_hq_access.sql checks them all).

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables
create table if not exists public.member_push_tokens (
  token      text primary key check (length(token) between 20 and 4096),
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  member_id  uuid not null references public.gym_members(member_id) on delete cascade,
  platform   text not null default 'android' check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);
create index if not exists member_push_tokens_member on public.member_push_tokens(member_id);
create index if not exists member_push_tokens_gym on public.member_push_tokens(gym_id, token);

create table if not exists public.push_jobs (
  job_id     uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  kind       text not null check (kind in ('message', 'offer')),
  ref_id     uuid not null,
  due_at     timestamptz not null,
  created_at timestamptz not null default now(),
  after_token text,
  sent       int not null default 0,
  done_at    timestamptz,
  why_done   text
);
create index if not exists push_jobs_due on public.push_jobs(due_at) where done_at is null;
create unique index if not exists push_jobs_one_per_ref on public.push_jobs(kind, ref_id);

alter table public.member_push_tokens enable row level security;
alter table public.push_jobs          enable row level security;
revoke all on public.member_push_tokens, public.push_jobs from anon, authenticated;

-- ------------------------------------------------------------------ triggers
-- A new message or offer: one job. Never in the way of the send itself: a failure here is only logged.
create or replace function public._push_job_message() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.push_jobs(gym_id, kind, ref_id, due_at)
      values (new.gym_id, 'message', new.message_id, coalesce(new.send_at, new.created_at))
      on conflict do nothing;
  exception when others then
    raise warning 'push job for message % not made: %', new.message_id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists gym_messages_push on public.gym_messages;
create trigger gym_messages_push after insert on public.gym_messages
  for each row execute function public._push_job_message();

create or replace function public._push_job_offer() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.push_jobs(gym_id, kind, ref_id, due_at)
      values (new.gym_id, 'offer', new.offer_id, now())
      on conflict do nothing;
  exception when others then
    raise warning 'push job for offer % not made: %', new.offer_id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists gym_offers_push on public.gym_offers;
create trigger gym_offers_push after insert on public.gym_offers
  for each row execute function public._push_job_offer();

-- A member who left (or whom the gym let go: the key changes) keeps no push address.
create or replace function public._push_member_left() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.member_push_tokens where member_id = new.member_id;
  return new;
end $$;
drop trigger if exists gym_members_push_left on public.gym_members;
create trigger gym_members_push_left after update of left_at, key_hash on public.gym_members
  for each row when (new.left_at is not null or new.key_hash is distinct from old.key_hash)
  execute function public._push_member_left();

-- ------------------------------------------------------------------ member (app)
-- Save this phone's push address for the member (the same address again only refreshes it).
-- Raises BAD_KEY (also after leaving) or INVALID. -> {ok: true}
create or replace function public.member_save_push_token(p_key text, p_token text, p_platform text default 'android')
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  t text := btrim(coalesce(p_token, ''));
  pf text := coalesce(nullif(btrim(p_platform), ''), 'android');
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  if length(t) not between 20 and 4096 or t !~ '^[A-Za-z0-9_:.\-]+$' or pf not in ('android', 'ios') then
    raise exception 'INVALID';
  end if;
  insert into public.member_push_tokens(token, gym_id, member_id, platform, updated_at)
    values (t, m.gym_id, m.member_id, pf, now())
    on conflict (token) do update set gym_id = excluded.gym_id, member_id = excluded.member_id,
                                      platform = excluded.platform, updated_at = now();
  -- At most 5 phones per member: the oldest go.
  delete from public.member_push_tokens where token in (
    select token from public.member_push_tokens where member_id = m.member_id
     order by updated_at desc offset 5);
  return jsonb_build_object('ok', true);
end $$;

-- Forget this phone's push address (p_token), or every one of the member's (null).
-- Raises BAD_KEY. -> {ok: true, removed: n}
create or replace function public.member_clear_push_token(p_key text, p_token text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); n int;
begin
  delete from public.member_push_tokens
   where member_id = m.member_id and (p_token is null or token = btrim(p_token));
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'removed', n);
end $$;

-- ------------------------------------------------------------------ the sender (HQ key only)
-- The next due job's next addresses (at most p_max, 1-500), with the words; null = nothing to send.
-- -> {jobId, kind ('message'|'offer'), refId, gymId, gymName, title, body, msgKind, tokens: [..], last: bool}
create or replace function public.hq_push_next(p_max int default 40)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  j public.push_jobs;
  msg public.gym_messages;
  ofr public.gym_offers;
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
    else
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
      'title', case when j.kind = 'message' then msg.title else ofr.title end,
      'body', case when j.kind = 'message' then msg.body else '' end,
      'msgKind', case when j.kind = 'message' then msg.kind else 'offer' end,
      'tokens', to_jsonb(toks),
      'last', array_length(toks, 1) < lim);
  end loop;
end $$;

-- Firebase said these addresses are dead (the app was removed, or the address was replaced).
create or replace function public.hq_push_drop(p_tokens text[])
  returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public._hq_guard();
  if coalesce(array_length(p_tokens, 1), 0) > 1000 then raise exception 'TOO_MANY'; end if;
  delete from public.member_push_tokens where token = any(p_tokens);
  get diagnostics n = row_count;
  return n;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._push_job_message()                        from public, anon, authenticated;
revoke all on function public._push_job_offer()                          from public, anon, authenticated;
revoke all on function public._push_member_left()                        from public, anon, authenticated;
revoke all on function public.member_save_push_token(text, text, text)   from public;
revoke all on function public.member_clear_push_token(text, text)        from public;
revoke all on function public.hq_push_next(int)                          from public, anon, authenticated;
revoke all on function public.hq_push_drop(text[])                       from public, anon, authenticated;

grant execute on function public.member_save_push_token(text, text, text) to anon, authenticated;
grant execute on function public.member_clear_push_token(text, text)      to anon, authenticated;
grant execute on function public.hq_push_next(int)                        to service_role;
grant execute on function public.hq_push_drop(text[])                     to service_role;
