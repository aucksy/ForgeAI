-- NOT APPLIED LIVE. Waits for the owner's "yes 0098" (R-604, 16 Nov 2026).
-- (No live database change without his named yes. Apply in the SQL Editor only after CI is green.)
--
-- 0098: the bell knows what is DONE and what each person has READ, on the server (R-604).
-- Owner, 16 Nov 2026: at 11:00 his phone said "4 new updates from your members", but he had handled everything the day
-- before. The 11:00 summary (0076 / 0095 hq_panel_digest_claim) counted every alert not sent yet; "done" was only worked
-- out inside the browser (apps/dashboard/src/crm/logic/alertHandled.ts, R-593: matched by kind and time). He said "yes
-- alerts fix" and, in his words: "opening the notification panel is considered it read but it probably should not go
-- away until the user has acted on it ... the notifications panel may become the main place from where the user can keep
-- track of things they have not done yet and anything that they have done should go away".
--
-- WHAT CHANGES
--   gym_alerts.handled_at / handled_how / handled_by   when the thing an alert is about was handled, how, and by whom
--                       (a name, when the step knows one). Set by the SAME database step that handles the thing, matched
--                       by the alert's ref_id (exact, never by time):
--     member_question / member_feedback / member_complaint (ref: the conversation)
--         'reply'    the gym replied in that conversation (every line of the member's before the reply)
--         'done'     the conversation was marked done; taking "done" back makes them wait again (unless a reply
--                    handled them); a new line from the member is a new alert
--         'gone'     the conversation was removed (the member left the gym, or 180 days)
--     trainer_question (ref: the question)   'answered' | 'withdrawn' (the member took it back) | 'gone'
--     plan_request (ref: the request)        'decided' (approved or said no to) | 'taken_back' (the member cancelled)
--     phone_link (ref: the check-in number)  'decided' (confirmed or refused, also "Number checked" by the member)
--                                            | 'gone'
--     shop_order (ref: the order)            'moved_on' (ready, collected or cancelled) | 'gone'
--     friend_referred to Enquiries, online_join, page_question (ref: the enquiry, crm_records kind 'enquiry')
--         'joined' | 'not_interested'        the enquiry was made a member, or marked not interested
--         'called'   its next call was moved to a later day (it was called)
--         'chat_done' (page_question only)   "Mark as done" on the web page chat
--         'gone'     the enquiry was deleted
--     The 'info' kinds (paid_online, report_sent, member_joined, ai_credits_low, ai_members_limit, and friend_referred
--     about someone who is already a member) have nothing to do: handled_at stays empty; each person's bell treats them
--     by what that person did (below).
--   gym_alerts.read_by_all   true for every alert already sent before this change (nobody should hear of them again).
--   gym_alert_reads          one row per alert per person who saw it: 'owner' (the gym's owner key) or the person's
--                            staff id (the owner as a person, each desk person and each trainer separately), with
--                            read_at (the bell panel showed it), opened_at (they tapped it and its page opened) and
--                            removed_at (they cleared it from THEIR list with the X; it never makes a thing done).
--
-- THE BELL, PER PERSON (owner_alert_list):
--   an action item (something to do) is in the main list until it is done; X takes it off THIS person's list (into
--     History) without making it done: the member's page still shows it waiting, and so does Today.
--   an info item (nothing to do) is in the main list until THIS person opens it (taps it), clears it with X, or it is
--     7 days old.
--   History: the last 7 days of what left the main list (done, opened, removed, 7 days old), each still tappable.
--   The bell's number: action items not done (and not removed) + info items not read yet. Opening the panel reads
--     everything shown; an info item then stays in the list without a number until it is opened.
-- THE SUMMARY PUSH (hq_panel_push_instant, hq_panel_digest_claim): each browser counts only alerts that are not done
--   and that its person has not read (or opened, or removed); nothing is sent when that is 0. An alert already done
--   when its turn comes is marked sent_how 'none' and sent to nobody. Nothing is ever sent twice (sent_at, as before).
--
-- Additive and re-runnable: three columns and one flag on gym_alerts, one new table, eight new triggers (each never
-- stands in the way of the step it watches: any failure inside is only a warning), four new owner/desk-key calls, and
-- CREATE OR REPLACE of 0095's hq_panel_push_instant and hq_panel_digest_claim (same names, arguments and grants).
-- owner_alerts (0075 / 0095) is NOT changed: admin apps released before this change keep working exactly as today.
-- Apply after 0075, 0076, 0095 and 0096. Test: supabase/tests/0098_alerts_done_and_read.sql (CI runs it after every
-- migration; pasted into the SQL Editor it always ends in an error and so changes nothing).
-- Undo: drop the eight triggers below and their functions; drop owner_alert_list, owner_alerts_read,
-- owner_alert_opened, owner_alert_remove, _alert_needs, _alert_reader, _alert_handle, _alert_pending_for; re-run 0095's
-- hq_panel_push_instant and hq_panel_digest_claim; drop the table gym_alert_reads; drop the columns handled_at,
-- handled_how, handled_by and read_by_all. The admin app goes back to its own guesses by itself without them.

set lock_timeout = '3s';

do $$
begin
  if to_regclass('public.gym_alerts') is null or to_regclass('public.gym_web_push') is null then
    raise exception '0098 needs 0075 and 0076 (gym alerts) first';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gym_alerts' and column_name = 'sub_id') then
    raise exception '0098 needs 0095 (test alerts) first';
  end if;
end $$;

-- ------------------------------------------------------------------ columns and the reads table
alter table public.gym_alerts add column if not exists handled_at timestamptz;
alter table public.gym_alerts add column if not exists handled_how text;
alter table public.gym_alerts add column if not exists handled_by text;
alter table public.gym_alerts add column if not exists read_by_all boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.gym_alerts'::regclass and conname = 'gym_alerts_handled_how') then
    alter table public.gym_alerts add constraint gym_alerts_handled_how check (handled_how is null or handled_how in
      ('reply', 'done', 'answered', 'withdrawn', 'decided', 'taken_back', 'moved_on', 'joined', 'not_interested',
       'called', 'chat_done', 'gone'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.gym_alerts'::regclass and conname = 'gym_alerts_handled_by') then
    alter table public.gym_alerts add constraint gym_alerts_handled_by check (handled_by is null or length(handled_by) <= 80);
  end if;
end $$;
create index if not exists gym_alerts_by_ref on public.gym_alerts(gym_id, ref_id) where handled_at is null;

create table if not exists public.gym_alert_reads (
  alert_id   uuid not null references public.gym_alerts(alert_id) on delete cascade,
  -- 'owner': the gym's owner key (no person); else the person's staff id (0010 gym_staff), as 0075 _alert_viewer.
  reader     text not null check (reader = 'owner' or reader ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  read_at    timestamptz not null default now(),
  opened_at  timestamptz,
  removed_at timestamptz,
  primary key (alert_id, reader)
);
alter table public.gym_alert_reads enable row level security;
revoke all on public.gym_alert_reads from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
-- 'info': nothing to do (done for a person once they open it); 'action': something to do (done when it is done).
-- Keep in step with apps/dashboard/src/crm/logic/alertHandled.ts handledHow.
create or replace function public._alert_needs(p_kind text, p_route text) returns text
  language sql immutable set search_path = public as $$
  select case when p_kind in ('paid_online', 'report_sent', 'member_joined', 'ai_credits_low', 'ai_members_limit', 'test_alert')
                or (p_kind = 'friend_referred' and coalesce(p_route, '') <> '/enquiries')
              then 'info' else 'action' end
$$;

-- Who reads: 'owner' for the owner key (no person), else the person.
create or replace function public._alert_reader(p_staff uuid) returns text
  language sql immutable set search_path = public as $$
  select coalesce(p_staff::text, 'owner')
$$;

-- The alerts of these kinds about this thing, written up to p_through (null: any time), are handled now. Only action
-- items; never undoes an earlier handling. Never raises.
create or replace function public._alert_handle(p_gym uuid, p_kinds text[], p_ref text, p_through timestamptz,
                                                p_how text, p_by text default null) returns int
  language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_gym is null or p_ref is null then return 0; end if;
  update public.gym_alerts a
     set handled_at = now(), handled_how = p_how, handled_by = left(nullif(btrim(coalesce(p_by, '')), ''), 80)
   where a.gym_id = p_gym and a.ref_id = p_ref and a.kind = any(p_kinds) and a.handled_at is null
     and a.created_at <= coalesce(p_through, 'infinity'::timestamptz)
     and public._alert_needs(a.kind, a.route) = 'action';
  get diagnostics n = row_count;
  return n;
exception when others then
  raise warning 'alerts about % not marked handled: %', p_ref, sqlerrm;
  return 0;
end $$;

-- Does this alert still wait for this person (the summary push)? Not done, not read, not opened, not removed.
create or replace function public._alert_pending_for(a public.gym_alerts, p_staff uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select a.handled_at is null and not a.read_by_all
     and (public._alert_needs(a.kind, a.route) = 'action' or a.created_at > now() - interval '7 days')
     and not exists (select 1 from public.gym_alert_reads r
                      where r.alert_id = a.alert_id and r.reader = public._alert_reader(p_staff))
$$;

-- ------------------------------------------------------------------ the triggers that mark alerts done
-- Member messages (0069): a gym reply handles every member line before it in that conversation.
create or replace function public._alert_done_talk_line() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public._alert_handle(new.gym_id, array['member_question', 'member_feedback', 'member_complaint'],
    new.thread_id::text, new.created_at, 'reply', new.staff_name);
  return new;
exception when others then
  raise warning 'alerts for the reply % not marked handled: %', new.msg_id, sqlerrm;
  return new;
end $$;
drop trigger if exists gym_talk_messages_alert_done on public.gym_talk_messages;
create trigger gym_talk_messages_alert_done after insert on public.gym_talk_messages
  for each row when (new.from_gym) execute function public._alert_done_talk_line();

-- Member messages: "Mark as done", taking it back, and a conversation removed.
create or replace function public._alert_done_talk_thread() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  kinds constant text[] := array['member_question', 'member_feedback', 'member_complaint'];
  last_reply timestamptz;
begin
  if tg_op = 'DELETE' then
    perform public._alert_handle(old.gym_id, kinds, old.thread_id::text, null, 'gone');
    return old;
  end if;
  if new.done_at is not null and old.done_at is null then
    perform public._alert_handle(new.gym_id, kinds, new.thread_id::text, new.done_at, 'done', new.done_by_name);
  elsif new.done_at is null and old.done_at is not null
        -- A new line from the member opens it again too (0069): that line has its own new alert, the old ones stay done.
        and not exists (select 1 from public.gym_talk_messages x
                         where x.thread_id = new.thread_id and not x.from_gym and x.created_at >= old.done_at) then
    -- The gym took "done" back: what only "done" handled waits again (a reply still handles what came before it).
    select max(x.created_at) into last_reply from public.gym_talk_messages x where x.thread_id = new.thread_id and x.from_gym;
    update public.gym_alerts set handled_at = null, handled_how = null, handled_by = null
     where gym_id = new.gym_id and ref_id = new.thread_id::text and kind = any(kinds) and handled_how = 'done'
       and (last_reply is null or created_at > last_reply);
  end if;
  return new;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists gym_talk_threads_alert_done on public.gym_talk_threads;
create trigger gym_talk_threads_alert_done after update of done_at or delete on public.gym_talk_threads
  for each row execute function public._alert_done_talk_thread();

-- Member questions (0053): answered, withdrawn by the member, or removed.
create or replace function public._alert_done_question() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public._alert_handle(old.gym_id, array['trainer_question'], old.question_id::text, null, 'gone');
    return old;
  end if;
  if new.answered_at is not null and old.answered_at is null then
    perform public._alert_handle(new.gym_id, array['trainer_question'], new.question_id::text, null, 'answered', new.answered_by_name);
  elsif new.withdrawn_at is not null and old.withdrawn_at is null then
    perform public._alert_handle(new.gym_id, array['trainer_question'], new.question_id::text, null, 'withdrawn');
  end if;
  return new;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists trainer_questions_alert_done on public.trainer_questions;
create trigger trainer_questions_alert_done after update of answered_at, withdrawn_at or delete on public.trainer_questions
  for each row execute function public._alert_done_question();

-- A pause or renew request (0044): approved or said no to; taken back by the member (deleted while pending).
create or replace function public._alert_done_plan_request() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public._alert_handle(old.gym_id, array['plan_request'], old.request_id::text, null, 'taken_back');
    return old;
  end if;
  if old.status = 'pending' and new.status <> 'pending' then
    perform public._alert_handle(new.gym_id, array['plan_request'], new.request_id::text, null, 'decided', new.decided_by_name);
  end if;
  return new;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists gym_plan_requests_alert_done on public.gym_plan_requests;
create trigger gym_plan_requests_alert_done after update of status or delete on public.gym_plan_requests
  for each row execute function public._alert_done_plan_request();

-- A check-in number (0048): confirmed or refused (or checked by the member's own phone, 0068); removed.
create or replace function public._alert_done_phone_link() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public._alert_handle(old.gym_id, array['phone_link'], old.link_id::text, null, 'gone');
    return old;
  end if;
  if old.status = 'pending' and new.status <> 'pending' then
    perform public._alert_handle(new.gym_id, array['phone_link'], new.link_id::text, null, 'decided', new.decided_by_name);
  end if;
  return new;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists gym_phone_links_alert_done on public.gym_phone_links;
create trigger gym_phone_links_alert_done after update of status or delete on public.gym_phone_links
  for each row execute function public._alert_done_phone_link();

-- A shop order (0002): moved on from 'ordered' (ready, collected, cancelled by the gym or the member); removed.
create or replace function public._alert_done_shop_order() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public._alert_handle(old.gym_id, array['shop_order'], old.order_id::text, null, 'gone');
    return old;
  end if;
  if old.status = 'ordered' and new.status <> 'ordered' then
    perform public._alert_handle(new.gym_id, array['shop_order'], new.order_id::text, null, 'moved_on');
  end if;
  return new;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists shop_orders_alert_done on public.shop_orders;
create trigger shop_orders_alert_done after update of status or delete on public.shop_orders
  for each row execute function public._alert_done_shop_order();

-- An enquiry (crm_records kind 'enquiry', written by the admin app's sync and by 0056 / 0077 / 0080 / 0081 / 0094):
-- made a member, not interested, its next call moved to a later day, its web page chat marked done, or deleted.
create or replace function public._alert_done_enquiry() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  kinds constant text[] := array['friend_referred', 'online_join', 'page_question'];
  st text;
  fu text;
begin
  if tg_op = 'DELETE' then
    perform public._alert_handle(old.gym_id, kinds, old.id, null, 'gone');
    return old;
  end if;
  if new.deleted and not old.deleted then
    perform public._alert_handle(new.gym_id, kinds, new.id, null, 'gone');
    return new;
  end if;
  st := new.data->>'status';
  if st in ('joined', 'lost') and st is distinct from old.data->>'status' then
    perform public._alert_handle(new.gym_id, kinds, new.id, null, case st when 'joined' then 'joined' else 'not_interested' end);
    return new;
  end if;
  fu := new.data->>'followUpOn';
  if fu ~ '^\d{4}-\d{2}-\d{2}$' and fu is distinct from old.data->>'followUpOn'
     and fu > to_char(public._ist_today(), 'YYYY-MM-DD') then
    perform public._alert_handle(new.gym_id, kinds, new.id, null, 'called');
  end if;
  if new.data->'pageChat'->>'doneAt' is not null
     and (new.data->'pageChat'->>'doneAt') is distinct from (old.data->'pageChat'->>'doneAt') then
    perform public._alert_handle(new.gym_id, array['page_question'], new.id, null, 'chat_done');
  end if;
  return new;
exception when others then
  raise warning '%: %', tg_name, sqlerrm;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists crm_records_alert_done on public.crm_records;
create trigger crm_records_alert_done after update or delete on public.crm_records
  for each row when (old.kind = 'enquiry') execute function public._alert_done_enquiry();

-- ------------------------------------------------------------------ the alerts already there
-- Exact only: where the server can tell for certain that the thing was handled. Anything it cannot tell stays waiting
-- (a line that still needs someone is never hidden by a guess).
do $$
begin
  -- Member messages: a reply after the line, "done" after it, or the conversation removed.
  update public.gym_alerts a set handled_at = now(), handled_how = 'reply'
   where a.handled_at is null and a.kind in ('member_question', 'member_feedback', 'member_complaint')
     and exists (select 1 from public.gym_talk_threads t join public.gym_talk_messages x on x.thread_id = t.thread_id
                  where t.thread_id::text = a.ref_id and t.gym_id = a.gym_id and x.from_gym and x.created_at >= a.created_at);
  update public.gym_alerts a set handled_at = now(), handled_how = 'done'
   where a.handled_at is null and a.kind in ('member_question', 'member_feedback', 'member_complaint')
     and exists (select 1 from public.gym_talk_threads t
                  where t.thread_id::text = a.ref_id and t.gym_id = a.gym_id and t.done_at is not null and t.done_at >= a.created_at);
  update public.gym_alerts a set handled_at = now(), handled_how = 'gone'
   where a.handled_at is null and a.kind in ('member_question', 'member_feedback', 'member_complaint')
     and not exists (select 1 from public.gym_talk_threads t where t.thread_id::text = a.ref_id and t.gym_id = a.gym_id);
  -- Member questions.
  update public.gym_alerts a
     set handled_at = now(), handled_how = case when q.question_id is null then 'gone' when q.answered_at is not null then 'answered' else 'withdrawn' end
    from (select x.alert_id, q2.question_id, q2.answered_at, q2.withdrawn_at
            from public.gym_alerts x left join public.trainer_questions q2 on q2.question_id::text = x.ref_id and q2.gym_id = x.gym_id
           where x.kind = 'trainer_question' and x.handled_at is null) q
   where a.alert_id = q.alert_id and (q.question_id is null or q.answered_at is not null or q.withdrawn_at is not null);
  -- Plan requests, check-in numbers, shop orders.
  update public.gym_alerts a set handled_at = now(), handled_how = 'decided'
   where a.handled_at is null and a.kind = 'plan_request'
     and exists (select 1 from public.gym_plan_requests r where r.request_id::text = a.ref_id and r.gym_id = a.gym_id and r.status <> 'pending');
  update public.gym_alerts a set handled_at = now(), handled_how = 'taken_back'
   where a.handled_at is null and a.kind = 'plan_request'
     and not exists (select 1 from public.gym_plan_requests r where r.request_id::text = a.ref_id and r.gym_id = a.gym_id);
  update public.gym_alerts a set handled_at = now(), handled_how = 'decided'
   where a.handled_at is null and a.kind = 'phone_link'
     and exists (select 1 from public.gym_phone_links l where l.link_id::text = a.ref_id and l.gym_id = a.gym_id and l.status <> 'pending');
  update public.gym_alerts a set handled_at = now(), handled_how = 'gone'
   where a.handled_at is null and a.kind = 'phone_link'
     and not exists (select 1 from public.gym_phone_links l where l.link_id::text = a.ref_id and l.gym_id = a.gym_id);
  update public.gym_alerts a set handled_at = now(), handled_how = 'moved_on'
   where a.handled_at is null and a.kind = 'shop_order'
     and exists (select 1 from public.shop_orders o where o.order_id::text = a.ref_id and o.gym_id = a.gym_id and o.status <> 'ordered');
  update public.gym_alerts a set handled_at = now(), handled_how = 'gone'
   where a.handled_at is null and a.kind = 'shop_order'
     and not exists (select 1 from public.shop_orders o where o.order_id::text = a.ref_id and o.gym_id = a.gym_id);
  -- Enquiries (only the ones that go to Enquiries; a friend who is already a member is news).
  update public.gym_alerts a
     set handled_at = now(), handled_how = case when e.id is null or e.deleted then 'gone'
                                                when e.data->>'status' = 'joined' then 'joined' else 'not_interested' end
    from (select x.alert_id, r.id, r.deleted, r.data
            from public.gym_alerts x
            left join public.crm_records r on r.gym_id = x.gym_id and r.kind = 'enquiry' and r.id = x.ref_id
           where x.kind in ('friend_referred', 'online_join', 'page_question') and x.handled_at is null
             and public._alert_needs(x.kind, x.route) = 'action') e
   where a.alert_id = e.alert_id and (e.id is null or e.deleted or e.data->>'status' in ('joined', 'lost'));
  -- A web page chat marked done after the alert came (its time is the panel's: doneAt, ms).
  update public.gym_alerts a set handled_at = now(), handled_how = 'chat_done'
   where a.handled_at is null and a.kind = 'page_question'
     and exists (select 1 from public.crm_records r
                  where r.gym_id = a.gym_id and r.kind = 'enquiry' and r.id = a.ref_id
                    and coalesce(r.data->'pageChat'->>'doneAt', '') ~ '^\d{1,16}$'
                    and (r.data->'pageChat'->>'doneAt')::bigint >= floor(extract(epoch from a.created_at) * 1000)::bigint);
  -- Everything already sent before this change: nobody hears of it again (it stays in the lists as it is).
  update public.gym_alerts set read_by_all = true where sent_at is not null and not read_by_all;
end $$;

-- ------------------------------------------------------------------ the admin app's calls (owner, desk, trainer keys)
-- This person's bell: the main list (open), History (the last 7 days of what left it), the number and how many are
-- new. -> {ok, now, count, newCount, open: [alert], history: [alert]}; each alert is 0075's {id, kind, line, route,
-- urgent, at} with needs ('action' | 'info'), read (true | false), and, in History, left ('done' | 'opened' | 'removed'
-- | 'old'), leftAt (ms), doneHow and doneBy (when done), done (true | false: an action item removed but not done says
-- false).
create or replace function public.owner_alert_list(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  v jsonb := public._alert_viewer(g, st.staff_id);
  rd text := public._alert_reader(st.staff_id);
  res jsonb;
begin
  with mine as (
    select a, r.read_at, r.opened_at, r.removed_at, public._alert_needs(a.kind, a.route) as needs
      from public.gym_alerts a
      left join public.gym_alert_reads r on r.alert_id = a.alert_id and r.reader = rd
     where a.gym_id = g and a.kind <> 'test_alert' and a.created_at > now() - interval '30 days'
       and public._alert_visible(v, a)
  ), placed as (
    select m.*,
      case when m.needs = 'action' then
             case when (m.a).handled_at is not null then 'done' when m.removed_at is not null then 'removed' end
           else
             case when m.opened_at is not null then 'opened' when m.removed_at is not null then 'removed'
                  when (m.a).created_at <= now() - interval '7 days' then 'old' end
      end as left_how,
      (m.a).read_by_all or m.read_at is not null as is_read
      from mine m
  ), timed as (
    select p.*,
      case p.left_how when 'done' then (p.a).handled_at when 'opened' then p.opened_at when 'removed' then p.removed_at
                      when 'old' then (p.a).created_at + interval '7 days' end as left_at
      from placed p
  )
  select jsonb_build_object('ok', true, 'now', floor(extract(epoch from now()) * 1000)::bigint,
    'count', (select count(*) from timed t where t.left_how is null and (t.needs = 'action' or not t.is_read)),
    'newCount', (select count(*) from timed t where t.left_how is null and not t.is_read),
    'open', coalesce((select jsonb_agg(x.j order by x.at desc, x.id) from (
        select public._alert_json(t.a) || jsonb_build_object('needs', t.needs, 'read', t.is_read) as j,
               (t.a).created_at as at, (t.a).alert_id as id
          from timed t where t.left_how is null order by (t.a).created_at desc, (t.a).alert_id limit 100) x), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(x.j order by x.at desc, x.id) from (
        select public._alert_json(t.a) || jsonb_build_object('needs', t.needs, 'read', true, 'left', t.left_how,
                 'leftAt', floor(extract(epoch from t.left_at) * 1000)::bigint,
                 'done', t.needs = 'info' or (t.a).handled_at is not null,
                 'doneHow', (t.a).handled_how, 'doneBy', (t.a).handled_by) as j,
               t.left_at as at, (t.a).alert_id as id
          from timed t where t.left_how is not null and t.left_at > now() - interval '7 days'
         order by t.left_at desc, (t.a).alert_id limit 60) x), '[]'::jsonb))
    into res;
  return res;
end $$;

-- The bell panel opened: every alert it showed is read by THIS person (at most 200 ids; ones this person may not see,
-- or test alerts, are left out). Read never makes anything done. -> {ok, read: how many were new}
create or replace function public.owner_alerts_read(p_key text, p_ids uuid[])
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  v jsonb := public._alert_viewer(g, st.staff_id);
  rd text := public._alert_reader(st.staff_id);
  n int;
begin
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('ok', true, 'read', 0); end if;
  if cardinality(p_ids) > 200 then raise exception 'INVALID'; end if;
  insert into public.gym_alert_reads(alert_id, reader)
    select a.alert_id, rd from public.gym_alerts a
     where a.alert_id = any(p_ids) and a.gym_id = g and a.kind <> 'test_alert' and public._alert_visible(v, a)
  on conflict (alert_id, reader) do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'read', n);
end $$;

-- One alert's own page was opened from the bell or Today: read and opened for THIS person. An info item then leaves
-- the main list (into History); an action item stays until it is done. -> {ok, opened} | {ok: false, error: 'NOT_FOUND'}
create or replace function public.owner_alert_opened(p_key text, p_alert uuid)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  v jsonb := public._alert_viewer(g, st.staff_id);
  rd text := public._alert_reader(st.staff_id);
  a public.gym_alerts;
begin
  select x.* into a from public.gym_alerts x where x.alert_id = p_alert and x.gym_id = g and x.kind <> 'test_alert';
  if a.alert_id is null or not public._alert_visible(v, a) then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  insert into public.gym_alert_reads(alert_id, reader, opened_at) values (a.alert_id, rd, now())
  on conflict (alert_id, reader) do update set opened_at = coalesce(gym_alert_reads.opened_at, now());
  return jsonb_build_object('ok', true, 'opened', true);
end $$;

-- The X on a card (p_remove true) and its Undo (false), for THIS person only. Removing reads it too. It never makes
-- the thing done: the member's page still shows it waiting, and so does Today.
-- -> {ok, removed} | {ok: false, error: 'NOT_FOUND'}
create or replace function public.owner_alert_remove(p_key text, p_alert uuid, p_remove boolean default true)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  v jsonb := public._alert_viewer(g, st.staff_id);
  rd text := public._alert_reader(st.staff_id);
  a public.gym_alerts;
begin
  select x.* into a from public.gym_alerts x where x.alert_id = p_alert and x.gym_id = g and x.kind <> 'test_alert';
  if a.alert_id is null or not public._alert_visible(v, a) then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  if coalesce(p_remove, true) then
    insert into public.gym_alert_reads(alert_id, reader, removed_at) values (a.alert_id, rd, now())
    on conflict (alert_id, reader) do update set removed_at = coalesce(gym_alert_reads.removed_at, now());
  else
    update public.gym_alert_reads set removed_at = null where alert_id = a.alert_id and reader = rd;
  end if;
  return jsonb_build_object('ok', true, 'removed', coalesce(p_remove, true));
end $$;

-- ------------------------------------------------------------------ 0095's HQ calls: only what still waits for a person
create or replace function public.hq_panel_push_instant(p_max int default 40)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  cap int := least(greatest(coalesce(p_max, 40), 1), 200);
  a public.gym_alerts;
  s public.gym_web_push;
  res jsonb := '[]'::jsonb;
  mine jsonb;
  n int := 0;
  k int;
begin
  perform public._hq_guard();
  delete from public.gym_web_push w where not public._web_push_live(w);
  update public.gym_alerts x set sent_at = now(), sent_how = 'late'
   where x.sent_at is null and x.created_at < now() - interval '6 hours'
     and (x.urgent or exists (select 1 from public.gym_alert_settings z where z.gym_id = x.gym_id and z.mode = 'instant'));
  for a in
    select x.* from public.gym_alerts x
     where x.sent_at is null and x.created_at >= now() - interval '6 hours'
       and (x.urgent or exists (select 1 from public.gym_alert_settings z where z.gym_id = x.gym_id and z.mode = 'instant'))
     order by x.created_at, x.alert_id
     limit 200
     for update of x skip locked
  loop
    -- 0098: already done before its turn came: nobody needs to hear of it.
    if a.kind <> 'test_alert' and a.handled_at is not null then
      update public.gym_alerts set sent_at = now(), sent_how = 'none' where alert_id = a.alert_id;
      continue;
    end if;
    mine := '[]'::jsonb;
    k := 0;
    for s in select w.* from public.gym_web_push w
              where w.gym_id = a.gym_id and (a.sub_id is null or w.sub_id = a.sub_id) order by w.created_at loop
      if a.kind = 'test_alert' then
        mine := mine || jsonb_build_array(public._web_push_item(s, 'MettleUp: test alert', a.line, a.route,
                                                               'mettleup-test-' || a.alert_id));
        k := k + 1;
      elsif public._alert_visible(public._alert_viewer(a.gym_id, s.staff_id), a) and public._alert_pending_for(a, s.staff_id) then
        mine := mine || jsonb_build_array(public._web_push_item(s, 'MettleUp: news from your members', a.line, a.route,
                                                               'mettleup-alert-' || a.alert_id));
        k := k + 1;
      end if;
    end loop;
    exit when k > 0 and n > 0 and n + k > cap;
    update public.gym_alerts set sent_at = now(), sent_how = case when k > 0 then 'instant' else 'none' end
     where alert_id = a.alert_id;
    res := res || mine;
    n := n + k;
    exit when n >= cap;
  end loop;
  return jsonb_build_object('ok', true, 'sends', res);
end $$;

create or replace function public.hq_panel_digest_claim(p_gym uuid, p_slot bigint, p_max int default 40)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  cap int := least(greatest(coalesce(p_max, 40), 1), 200);
  slot timestamptz;
  ids uuid[];
  s public.gym_web_push;
  v jsonb;
  one public.gym_alerts;
  n int;
  res jsonb := '[]'::jsonb;
begin
  perform public._hq_guard();
  if p_gym is null or p_slot is null or p_slot < 0 or p_slot > 32503680000000 then raise exception 'INVALID'; end if;
  slot := to_timestamp(p_slot::double precision / 1000);
  if slot > now() + interval '1 minute' then raise exception 'INVALID'; end if;
  if not exists (select 1 from public.gyms where gym_id = p_gym) then raise exception 'INVALID'; end if;
  insert into public.gym_alert_settings(gym_id) values (p_gym) on conflict (gym_id) do nothing;
  update public.gym_alert_settings set last_digest_at = now()
   where gym_id = p_gym and mode <> 'instant' and (last_digest_at is null or last_digest_at < slot);
  if not found then return jsonb_build_object('ok', true, 'claimed', false, 'sends', '[]'::jsonb); end if;
  update public.gym_alerts set sent_at = now(), sent_how = 'late'
   where gym_id = p_gym and sent_at is null and created_at <= now() - interval '8 days';
  -- 0098: what was done before the summary went is sent to nobody.
  update public.gym_alerts set sent_at = now(), sent_how = 'none'
   where gym_id = p_gym and sent_at is null and created_at < slot and kind <> 'test_alert' and handled_at is not null;
  -- A test alert is never part of a summary (it goes at once, to its own browser).
  select array_agg(alert_id) into ids from public.gym_alerts
   where gym_id = p_gym and sent_at is null and created_at < slot and kind <> 'test_alert';
  if ids is null then return jsonb_build_object('ok', true, 'claimed', true, 'sends', '[]'::jsonb); end if;
  update public.gym_alerts set sent_at = now(), sent_how = 'digest' where alert_id = any(ids);
  for s in select w.* from public.gym_web_push w where w.gym_id = p_gym order by w.created_at loop
    exit when jsonb_array_length(res) >= cap;
    continue when not public._web_push_live(s);
    v := public._alert_viewer(p_gym, s.staff_id);
    -- 0098: only what this browser's person has not read, opened or removed (and nobody has done).
    select count(*) into n from public.gym_alerts a
     where a.alert_id = any(ids) and public._alert_visible(v, a) and public._alert_pending_for(a, s.staff_id);
    continue when n = 0;
    if n = 1 then
      select a.* into one from public.gym_alerts a
       where a.alert_id = any(ids) and public._alert_visible(v, a) and public._alert_pending_for(a, s.staff_id) limit 1;
      res := res || jsonb_build_array(public._web_push_item(s, 'MettleUp: news from your members', one.line, one.route,
                                                           'mettleup-alert-' || one.alert_id));
    else
      res := res || jsonb_build_array(public._web_push_item(s, 'MettleUp: news from your members',
        format('%s new updates from your members. Open the admin app to see them.', n), '/', 'mettleup-digest'));
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'claimed', true, 'sends', res);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._alert_needs(text, text) from public, anon, authenticated;
revoke all on function public._alert_reader(uuid) from public, anon, authenticated;
revoke all on function public._alert_handle(uuid, text[], text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public._alert_pending_for(public.gym_alerts, uuid) from public, anon, authenticated;
revoke all on function public._alert_done_talk_line() from public, anon, authenticated;
revoke all on function public._alert_done_talk_thread() from public, anon, authenticated;
revoke all on function public._alert_done_question() from public, anon, authenticated;
revoke all on function public._alert_done_plan_request() from public, anon, authenticated;
revoke all on function public._alert_done_phone_link() from public, anon, authenticated;
revoke all on function public._alert_done_shop_order() from public, anon, authenticated;
revoke all on function public._alert_done_enquiry() from public, anon, authenticated;
revoke all on function public.owner_alert_list(text) from public;
revoke all on function public.owner_alerts_read(text, uuid[]) from public;
revoke all on function public.owner_alert_opened(text, uuid) from public;
revoke all on function public.owner_alert_remove(text, uuid, boolean) from public;
grant execute on function public.owner_alert_list(text) to anon, authenticated;
grant execute on function public.owner_alerts_read(text, uuid[]) to anon, authenticated;
grant execute on function public.owner_alert_opened(text, uuid) to anon, authenticated;
grant execute on function public.owner_alert_remove(text, uuid, boolean) to anon, authenticated;
-- Restated as 0095 left them.
revoke all on function public.hq_panel_push_instant(int) from public, anon, authenticated;
revoke all on function public.hq_panel_digest_claim(uuid, bigint, int) from public, anon, authenticated;
grant execute on function public.hq_panel_push_instant(int) to service_role;
grant execute on function public.hq_panel_digest_claim(uuid, bigint, int) to service_role;

notify pgrst, 'reload schema';
