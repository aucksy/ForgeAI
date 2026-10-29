-- APPLIED LIVE 30 Oct 2026 (owner: "Yes, switch on 0042 so from the 3rd message of the day members get no phone pop-up, and the daily maximum is 10."; live tests 0042 PASS 22, 0038 PASS 44, 0025 PASS 71).
--
-- 0042: calmer gym messages (R-195, 30 Oct 2026: "too many messages make members ignore them or switch
-- off notifications"). Two changes, nothing else:
--
--  1. QUIET AFTER 2 A DAY. From the 3rd in-app message of a gym's India day, members still get the
--     message in the app's message list, but their phone shows no pop-up for it. A message is "quiet"
--     when, as it is sent, the gym already has 2 or more messages that appear on the same India day
--     (a timed message counts on the day it appears; a message taken back does not count). That is
--     the same count the admin app's nudge shows the owner before sending ("This is your 3rd message
--     today ..."). It is decided once, when the message is saved, and never changes after.
--     How a pop-up reaches a phone (0038): every new message adds a row to push_jobs (trigger), and
--     the HQ Worker (deploy/hq/push.js) sends Firebase pushes from it. A quiet message now gets its
--     job already finished (why_done = 'quiet'), so no push goes. Its row says "quiet": true
--     (_message_json), so the member app's own 15-minute check (apps/mobile src/shop/noticeAlerts.ts,
--     from the first release after 0.60.0) shows no pop-up either. Member apps older than that still pop it up from
--     that 15-minute check (up to ~15 minutes late), since they do not know the flag.
--  2. THE DAY'S MAXIMUM 20 -> 10 in-app messages per gym per India day (owner_send_message's
--     TOO_MANY). The function is 0025's, copied exactly, with only the number changed. Offers and
--     events stay at 1 a day and 3 a week.
--
-- Additive and re-runnable (add column if not exists / create or replace / drop trigger if exists).
-- Apply after 0041. Undo: drop trigger gym_messages_quiet; re-run 0038's _push_job_message and
-- 0025's owner_send_message (the column can stay; false everywhere then).
-- Test: supabase/tests/0042_message_calm.sql (CI runs it after every migration; pasted into the SQL
-- Editor it always ends in an error and so changes nothing).

set lock_timeout = '3s';

-- ------------------------------------------------------------------ 1. quiet after 2 a day
alter table public.gym_messages add column if not exists quiet boolean not null default false;

-- Set as the message is saved: 2 or more of the gym's messages (not taken back) already appear on its
-- India day. owner_send_message holds the gym's row lock here, so two sends never count each other out.
create or replace function public._message_quiet() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  day_start timestamptz := date_trunc('day', coalesce(new.send_at, new.created_at, now()) at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  n int;
begin
  select count(*) into n from public.gym_messages
   where gym_id = new.gym_id and withdrawn_at is null
     and coalesce(send_at, created_at) >= day_start and coalesce(send_at, created_at) < day_start + interval '1 day';
  new.quiet := n >= 2;
  return new;
end $$;
drop trigger if exists gym_messages_quiet on public.gym_messages;
create trigger gym_messages_quiet before insert on public.gym_messages
  for each row execute function public._message_quiet();

-- 0038's job trigger: a quiet message's job is finished at once ('quiet'), so the sender never pushes it.
create or replace function public._push_job_message() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.push_jobs(gym_id, kind, ref_id, due_at, done_at, why_done)
      values (new.gym_id, 'message', new.message_id, coalesce(new.send_at, new.created_at),
              case when new.quiet then now() end, case when new.quiet then 'quiet' end)
      on conflict do nothing;
  exception when others then
    raise warning 'push job for message % not made: %', new.message_id, sqlerrm;
  end;
  return new;
end $$;

-- 0008's row words, plus "quiet" (the member app's inbox, the admin app's Sent list). The fixed
-- search_path is 0012's (create or replace would otherwise drop it).
create or replace function public._message_json(m public.gym_messages) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object('id', m.message_id, 'kind', m.kind, 'title', m.title, 'body', m.body,
                            'createdAt', m.created_at, 'quiet', m.quiet)
$$;

-- ------------------------------------------------------------------ 2. the day's maximum: 10
-- 0025's owner_send_message, unchanged except "if n >= 20" -> "if n >= 10".
create or replace function public.owner_send_message(p_key text, p_kind text, p_title text, p_body text,
                                                     p_to uuid[] default null, p_send_at timestamptz default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_body, ''));
  today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  at_time timestamptz := case when p_send_at is null or p_send_at <= now() + interval '1 minute' then null else p_send_at end;
  day_start timestamptz;
  n int;
  m public.gym_messages;
begin
  if p_kind not in ('announcement','closed','timing','offer','event','reminder') then raise exception 'BAD_KIND'; end if;
  if length(t) = 0 then raise exception 'EMPTY'; end if;
  if length(t) > 60 or length(b) > 300 then raise exception 'TOO_LONG'; end if;
  if at_time is not null and at_time > now() + interval '30 days' then raise exception 'BAD_TIME'; end if;
  if p_to is not null and coalesce(array_length(p_to, 1), 0) > 5000 then raise exception 'TOO_MANY'; end if;
  day_start := date_trunc('day', coalesce(at_time, now()) at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  -- One send at a time per gym: the counts below and the insert see each other.
  perform 1 from public.gyms where gym_id = g for update;
  select count(*) into n from public.gym_messages where gym_id = g and created_at >= today_start;
  if n >= 10 then raise exception 'TOO_MANY'; end if;
  if p_kind in ('offer','event') then
    select count(*) into n from public.gym_messages
      where gym_id = g and kind in ('offer','event')
        and coalesce(send_at, created_at) >= day_start and coalesce(send_at, created_at) < day_start + interval '1 day'
        and (withdrawn_at is null or withdrawn_at > coalesce(send_at, created_at) + interval '10 minutes');
    if n >= 1 then raise exception 'OFFER_TODAY'; end if;
    select count(*) into n from public.gym_messages
      where gym_id = g and kind in ('offer','event')
        and coalesce(send_at, created_at) >= day_start - interval '6 days' and coalesce(send_at, created_at) < day_start + interval '7 days'
        and (withdrawn_at is null or withdrawn_at > coalesce(send_at, created_at) + interval '10 minutes');
    if n >= 3 then raise exception 'OFFER_WEEK'; end if;
  end if;
  if p_to is null then
    select count(*) into n from public.gym_members where gym_id = g and left_at is null;
    insert into public.gym_messages(gym_id, kind, title, body, recipients, send_at, to_group)
      values (g, p_kind, t, b, n, at_time, false) returning * into m;
  else
    select count(distinct gm.member_id) into n from public.gym_members gm
     where gm.gym_id = g and gm.left_at is null and gm.member_id = any(p_to);
    if n = 0 then raise exception 'NO_ONE'; end if;
    insert into public.gym_messages(gym_id, kind, title, body, recipients, send_at, to_group)
      values (g, p_kind, t, b, n, at_time, true) returning * into m;
    insert into public.gym_message_to(message_id, member_id)
      select distinct m.message_id, gm.member_id from public.gym_members gm
       where gm.gym_id = g and gm.left_at is null and gm.member_id = any(p_to);
  end if;
  return public._message_json(m) || jsonb_build_object('recipients', m.recipients, 'seen', 0, 'withdrawn', false,
    'sendAt', m.send_at, 'toGroup', m.to_group);
end $$;

-- ------------------------------------------------------------------ grants
-- create or replace keeps every grant the functions above already had; only the new one is closed.
revoke all on function public._message_quiet() from public, anon, authenticated;

-- PostgREST learns the changed functions at once (instead of on its next schema reload).
notify pgrst, 'reload schema';
