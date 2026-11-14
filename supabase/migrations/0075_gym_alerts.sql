-- NOT APPLIED LIVE. The owner's yes for the LIVE change is R-510 (14 Nov 2026: "yes to A (my pick): Build both
-- directions together, with the live database change"); he applies it himself in the SQL Editor, after 0073 and 0074.
--
-- 0075: one list of everything a member does that the gym should hear about (R-506, R-509 direction A). Owner,
-- 14 Nov 2026: he sent a question to a trainer and the admin panel showed no notification. "Wherever there is this
-- cross-app messages going on the notification should be involved."
-- gym_alerts gets one row per event, written by triggers (and, for online payments, by the HQ Worker):
--   trainer_question   a member asked a trainer (0053)                      Questions        digest
--   member_question    "Message your gym": a question, or a reply in one   Member messages  digest
--   member_feedback    feedback (sent with or without the name)            Member messages  digest
--   member_complaint   a complaint, or a reply in one (THE OWNER ONLY)     Member messages  INSTANT
--   plan_request       a pause or renew request (0044)                     Today            digest; INSTANT when the
--                                                                                           plan ends in 3 days or less
--   phone_link         a number typed at the check-in poster (0048)        Today            INSTANT
--   shop_order         a new shop order (0002)                             Shop             INSTANT
--   paid_online        a member paid a fee or an order online (D1, HQ)     Money            digest
--   report_sent        the workout report the gym asked for came (0045)    the member page  digest
--   member_joined      a member joined with the gym code (0002)            Members in app   digest
--   friend_referred    a member's friend asked about joining (0056)        Enquiries        INSTANT
-- The admin app reads the list (owner_alerts) to ring while it is open and to show the latest on Today; 0076 sends
-- them to the staff's browsers with the tab closed (instant ones at once, the rest in the gym's digest).
--
-- Additive and re-runnable: one new table, nine triggers on existing tables (each never stands in the way of the
-- member's own action: any failure inside is only a warning), one HQ-key function, one owner/desk-key read.
-- Apply after 0073 (and 0053, 0056, 0069 whose tables get a trigger).
-- Test: supabase/tests/0075_gym_alerts.sql (CI runs it after every migration; pasted into the SQL Editor it always
-- ends in an error and so changes nothing).
-- Undo: drop the nine triggers below and their functions, _alert, _alert_viewer, _alert_visible, _alert_first_name,
-- _alert_json, owner_alerts, hq_paid_alerts and the table gym_alerts. The admin app hides what needs it.
--
-- WHO SEES WHAT. 'all': the owner, the front desk and trainers (as each list already shows them). 'owner': the
-- owner (an owner key, or a person whose role is 'owner') only: complaints, as 0069 keeps them. 'question': exactly
-- who sees that question in Questions (0053's _tq_visible: the trainer it was asked to; "any trainer" = the owner and
-- every ticked trainer), and never the desk without the trainer tick.
-- WHAT A LINE SAYS. The member's first name (never for feedback sent without the name), what happened, and where to
-- go. Never a phone number, an amount, a body number or the message itself. Kept 30 days.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ table
create table if not exists public.gym_alerts (
  alert_id   uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  kind       text not null check (kind in ('trainer_question', 'member_question', 'member_feedback', 'member_complaint',
                                           'plan_request', 'phone_link', 'shop_order', 'paid_online', 'report_sent',
                                           'member_joined', 'friend_referred')),
  ref_id     text not null check (length(ref_id) between 1 and 80),
  -- One alert per event: 'question:<id>', 'talk:<message id>', 'paid:<request id>', ...
  tag        text not null unique check (length(tag) between 5 and 200),
  audience   text not null default 'all' check (audience in ('all', 'owner', 'question')),
  -- Sent at once, whatever the gym's digest setting (0076).
  urgent     boolean not null default false,
  line       text not null check (length(line) between 3 and 220),
  -- An admin app page: '/questions', '/members/<list id>', ...
  route      text not null check (route ~ '^/[A-Za-z0-9/_-]{0,100}$'),
  created_at timestamptz not null default now(),
  -- When the sender took it (0076): 'instant', 'digest', 'late' (too old to send), 'none' (nobody to send it to).
  sent_at    timestamptz,
  sent_how   text check (sent_how is null or sent_how in ('instant', 'digest', 'late', 'none'))
);
create index if not exists gym_alerts_by_gym on public.gym_alerts(gym_id, created_at desc);
create index if not exists gym_alerts_waiting on public.gym_alerts(created_at) where sent_at is null;
alter table public.gym_alerts enable row level security;
revoke all on public.gym_alerts from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
-- Write one alert (once per tag). Never raises: a failure is a warning only.
create or replace function public._alert(p_gym uuid, p_kind text, p_ref text, p_tag text, p_audience text,
                                         p_urgent boolean, p_line text, p_route text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if p_gym is null then return; end if;
  insert into public.gym_alerts(gym_id, kind, ref_id, tag, audience, urgent, line, route)
    values (p_gym, p_kind, left(p_ref, 80), left(p_tag, 200), p_audience, coalesce(p_urgent, false), left(p_line, 220), p_route)
    on conflict (tag) do nothing;
  if random() < 0.01 then
    delete from public.gym_alerts where created_at < now() - interval '30 days';
  end if;
exception when others then
  raise warning 'gym alert % not made: %', p_tag, sqlerrm;
end $$;

-- "Asha" from "Asha Rao"; 'A member' when there is no name. PURE.
create or replace function public._alert_first_name(p_name text) returns text
  language sql immutable set search_path = public as $$
  select coalesce(nullif(left(split_part(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), ' ', 1), 40), ''), 'A member')
$$;

-- The first name the gym knows a list entry by, else the app member's own name.
create or replace function public._alert_member_name(p_gym uuid, p_roster text, p_app uuid) returns text
  language sql stable security definer set search_path = public as $$
  select public._alert_first_name(coalesce(
    (select nullif(btrim(r.data->>'fullName'), '') from public.crm_records r
      where r.gym_id = p_gym and r.kind = 'member' and r.id = p_roster and not r.deleted),
    (select m.name from public.gym_members m where m.member_id = p_app)))
$$;

-- Who is looking, from an owner key (staff null) or a person: {gym, staff, owner, trainer}.
create or replace function public._alert_viewer(p_gym uuid, p_staff uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select case when p_staff is null then jsonb_build_object('gym', p_gym, 'staff', null, 'owner', true, 'trainer', false)
    else (select jsonb_build_object('gym', p_gym, 'staff', s.staff_id, 'owner', s.role = 'owner',
                   'trainer', exists (select 1 from public.gym_trainers t where t.staff_id = s.staff_id and t.gym_id = p_gym))
            from public.gym_staff s where s.staff_id = p_staff and s.gym_id = p_gym and s.removed_at is null) end
$$;

-- May this viewer see this alert?
create or replace function public._alert_visible(v jsonb, a public.gym_alerts) returns boolean
  language plpgsql stable security definer set search_path = public as $$
declare q public.trainer_questions;
begin
  if v is null or a.gym_id is distinct from (v->>'gym')::uuid then return false; end if;
  if a.audience = 'all' then return true; end if;
  if a.audience = 'owner' then return coalesce((v->>'owner')::boolean, false); end if;
  if a.audience = 'question' then
    if not (coalesce((v->>'owner')::boolean, false) or coalesce((v->>'trainer')::boolean, false)) then return false; end if;
    select * into q from public.trainer_questions where question_id = a.ref_id::uuid;
    return q.question_id is not null and public._tq_visible(v, q);
  end if;
  return false;
exception when others then
  return false;
end $$;

create or replace function public._alert_json(a public.gym_alerts) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object('id', a.alert_id, 'kind', a.kind, 'line', a.line, 'route', a.route, 'urgent', a.urgent,
    'at', floor(extract(epoch from a.created_at) * 1000)::bigint)
$$;

-- ------------------------------------------------------------------ triggers
-- A member asked a trainer (0053).
create or replace function public._alert_trainer_question() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public._alert(new.gym_id, 'trainer_question', new.question_id::text, 'question:' || new.question_id, 'question', false,
    format('%s asked a trainer a question. Open Questions to reply.', public._alert_member_name(new.gym_id, new.roster_id, new.member_id)),
    '/questions');
  return new;
exception when others then
  raise warning 'alert for question % not made: %', new.question_id, sqlerrm;
  return new;
end $$;
drop trigger if exists trainer_questions_alert on public.trainer_questions;
create trigger trainer_questions_alert after insert on public.trainer_questions
  for each row execute function public._alert_trainer_question();

-- A member's line in "Message your gym" (0069): a new message, or a reply in one.
create or replace function public._alert_talk_line() returns trigger
  language plpgsql security definer set search_path = public as $$
declare t public.gym_talk_threads; who text; first boolean; k text;
begin
  if new.from_gym then return new; end if;
  select * into t from public.gym_talk_threads where thread_id = new.thread_id;
  if t.thread_id is null then return new; end if;
  first := not exists (select 1 from public.gym_talk_messages x where x.thread_id = new.thread_id and x.msg_id <> new.msg_id);
  who := case when t.anonymous then null else public._alert_member_name(t.gym_id, t.roster_id, t.member_id) end;
  k := case t.kind when 'complaint' then 'member_complaint' when 'feedback' then 'member_feedback' else 'member_question' end;
  perform public._alert(t.gym_id, k, t.thread_id::text, 'talk:' || new.msg_id, case when t.kind = 'complaint' then 'owner' else 'all' end,
    t.kind = 'complaint',
    case
      when not first then format('%s replied in Member messages. Open it to read the reply.', coalesce(who, 'A member'))
      when t.kind = 'complaint' then format('%s sent your gym a complaint. Open Member messages to read it.', who)
      when t.kind = 'feedback' and t.anonymous then 'A member sent your gym feedback without their name. Open Member messages to read it.'
      when t.kind = 'feedback' then format('%s sent your gym feedback. Open Member messages to read it.', who)
      else format('%s sent your gym a question. Open Member messages to reply.', who)
    end,
    '/member-messages');
  return new;
exception when others then
  raise warning 'alert for member message % not made: %', new.msg_id, sqlerrm;
  return new;
end $$;
drop trigger if exists gym_talk_messages_alert on public.gym_talk_messages;
create trigger gym_talk_messages_alert after insert on public.gym_talk_messages
  for each row execute function public._alert_talk_line();

-- A pause or renew request (0044). Instant when the member's plan ends in 3 days or less (India time).
create or replace function public._alert_plan_request() returns trigger
  language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date; ends text; who text;
begin
  if new.status <> 'pending' then return new; end if;
  select max(r.data->>'endsOn') into ends from public.crm_records r
   where r.gym_id = new.gym_id and r.kind = 'membership' and not r.deleted
     and r.data->>'memberId' = new.roster_id and coalesce(r.data->>'cancelled', 'false') <> 'true'
     and r.data->>'startsOn' <= to_char(today, 'YYYY-MM-DD')
     and r.data->>'endsOn' ~ '^\d{4}-\d{2}-\d{2}$';
  who := public._alert_member_name(new.gym_id, new.roster_id, new.app_member);
  perform public._alert(new.gym_id, 'plan_request', new.request_id::text, 'plan_request:' || new.request_id, 'all',
    ends is not null and ends::date <= today + 3,
    case when new.kind = 'freeze'
      then format('%s asked to pause their plan from %s to %s. Approve or say no on Today.', who,
                  public._note_day(new.freeze_from), public._note_day(new.freeze_to))
      else format('%s asked to renew their plan%s. Approve or say no on Today.', who,
                  case when nullif(btrim(coalesce(new.plan_name, '')), '') is null then ''
                       else format(' (%s)', left(btrim(new.plan_name), 60)) end)
    end,
    '/');
  return new;
exception when others then
  raise warning 'alert for plan request % not made: %', new.request_id, sqlerrm;
  return new;
end $$;
drop trigger if exists gym_plan_requests_alert on public.gym_plan_requests;
create trigger gym_plan_requests_alert after insert on public.gym_plan_requests
  for each row execute function public._alert_plan_request();

-- A number typed at the check-in poster, waiting for the desk (0048). Instant: the member is at the door.
create or replace function public._alert_phone_link() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'pending' then return new; end if;
  perform public._alert(new.gym_id, 'phone_link', new.link_id::text, 'phone_link:' || new.link_id, 'all', true,
    format('%s typed their number at the check-in poster. Confirm it on Today.',
           public._alert_member_name(new.gym_id, new.roster_id, new.app_member)),
    '/');
  return new;
exception when others then
  raise warning 'alert for check-in number % not made: %', new.link_id, sqlerrm;
  return new;
end $$;
drop trigger if exists gym_phone_links_alert on public.gym_phone_links;
create trigger gym_phone_links_alert after insert on public.gym_phone_links
  for each row execute function public._alert_phone_link();

-- A new shop order (0002). Instant.
create or replace function public._alert_shop_order() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'ordered' then return new; end if;
  perform public._alert(new.gym_id, 'shop_order', new.order_id::text, 'order:' || new.order_id, 'all', true,
    format('New shop order %s from %s. Get it ready on Shop.', new.order_no,
           public._alert_first_name(coalesce(new.member_name, (select m.name from public.gym_members m where m.member_id = new.member_id)))),
    '/shop');
  return new;
exception when others then
  raise warning 'alert for order % not made: %', new.order_id, sqlerrm;
  return new;
end $$;
drop trigger if exists shop_orders_alert on public.shop_orders;
create trigger shop_orders_alert after insert on public.shop_orders
  for each row execute function public._alert_shop_order();

-- The workout report the gym asked for has come (0045: status becomes 'sent').
create or replace function public._alert_report_sent() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sent' and old.status is distinct from 'sent' then
    perform public._alert(new.gym_id, 'report_sent', new.request_id::text, 'report:' || new.request_id, 'all', false,
      format('%s sent the workout report you asked for. Open their page to read it.',
             public._alert_member_name(new.gym_id, new.roster_id, new.app_member)),
      case when new.roster_id ~ '^[A-Za-z0-9_-]{1,64}$' then '/members/' || new.roster_id else '/members' end);
  end if;
  return new;
exception when others then
  raise warning 'alert for report % not made: %', new.request_id, sqlerrm;
  return new;
end $$;
drop trigger if exists gym_report_requests_alert on public.gym_report_requests;
create trigger gym_report_requests_alert after update of status on public.gym_report_requests
  for each row execute function public._alert_report_sent();

-- A member joined the gym in the app with its code.
create or replace function public._alert_member_joined() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.left_at is not null then return new; end if;
  perform public._alert(new.gym_id, 'member_joined', new.member_id::text, 'joined:' || new.member_id, 'all', false,
    format('%s joined your gym in the MettleUp app. See them in Members using the app.', public._alert_first_name(new.name)),
    '/members/app');
  return new;
exception when others then
  raise warning 'alert for member % joining not made: %', new.member_id, sqlerrm;
  return new;
end $$;
drop trigger if exists gym_members_alert on public.gym_members;
create trigger gym_members_alert after insert on public.gym_members
  for each row execute function public._alert_member_joined();

-- A member's friend asked about joining through their invite (0056). Instant: call while they are keen.
create or replace function public._alert_friend_referred() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public._alert(new.gym_id, 'friend_referred', new.enquiry_id, 'friend:' || new.enquiry_id, 'all', true,
    case when new.member_id is null then 'A member''s friend asked about joining your gym. Call them from Enquiries.'
         else format('%s''s friend asked about joining your gym. Call them from Enquiries.',
                     public._alert_first_name((select m.name from public.gym_members m where m.member_id = new.member_id))) end,
    '/enquiries');
  return new;
exception when others then
  raise warning 'alert for referral % not made: %', new.enquiry_id, sqlerrm;
  return new;
end $$;
drop trigger if exists gym_friend_referrals_alert on public.gym_friend_referrals;
create trigger gym_friend_referrals_alert after insert on public.gym_friend_referrals
  for each row execute function public._alert_friend_referred();

-- ------------------------------------------------------------------ paid online (HQ key only)
-- The HQ Worker hands what members paid online in the last few minutes (Cloudflare D1 pay_requests, status 'paid'
-- by the payment company, receipt not made yet): [{id, gymId, kind: 'fee'|'shop', rosterId, appMember, label}],
-- at most 100. One alert per request (the tag), so handing it again changes nothing. -> {ok, alerts}
create or replace function public.hq_paid_alerts(p_items jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; g uuid; app uuid; lbl text; who text; n int := 0;
begin
  perform public._hq_guard();
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'INVALID'; end if;
  for it in select value from jsonb_array_elements(p_items) limit 100 loop
    begin
      if jsonb_typeof(it) is distinct from 'object' or coalesce(it->>'id', '') !~ '^pr_[A-Za-z0-9_-]{4,60}$' then continue; end if;
      g := (it->>'gymId')::uuid;
      if not exists (select 1 from public.gyms where gym_id = g) then continue; end if;
      app := case when coalesce(it->>'appMember', '') ~ '^[0-9a-f-]{36}$' then (it->>'appMember')::uuid end;
      lbl := left(regexp_replace(btrim(coalesce(it->>'label', '')), '\s+', ' ', 'g'), 60);
      who := public._alert_member_name(g, nullif(it->>'rosterId', ''), app);
      perform public._alert(g, 'paid_online', it->>'id', 'paid:' || (it->>'id'), 'all', false,
        case when lbl = '' then format('%s paid online. See it on Money.', who)
             else format('%s paid online for %s. See it on Money.', who, lbl) end,
        '/money');
      n := n + 1;
    exception when others then
      raise warning 'paid alert % not made: %', it->>'id', sqlerrm;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'alerts', n);
end $$;

-- ------------------------------------------------------------------ the admin app's read
-- The alerts this key may see from the last 3 days, newest first, at most 50; p_after (ms since 1970, or null):
-- only newer ones. -> {ok, alerts: [{id, kind, line, route, urgent, at}]}
create or replace function public.owner_alerts(p_key text, p_after bigint default null)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  v jsonb := public._alert_viewer(g, st.staff_id);
  since timestamptz := greatest(now() - interval '3 days',
                                to_timestamp(least(greatest(coalesce(p_after, 0), 0), 32503680000000)::double precision / 1000));
begin
  return jsonb_build_object('ok', true, 'alerts', coalesce((
    select jsonb_agg(public._alert_json(x) order by x.created_at desc, x.alert_id)
      from (select a.* from public.gym_alerts a
             where a.gym_id = g and a.created_at > since and public._alert_visible(v, a)
             order by a.created_at desc, a.alert_id limit 50) x), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._alert(uuid, text, text, text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public._alert_first_name(text) from public, anon, authenticated;
revoke all on function public._alert_member_name(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public._alert_viewer(uuid, uuid) from public, anon, authenticated;
revoke all on function public._alert_visible(jsonb, public.gym_alerts) from public, anon, authenticated;
revoke all on function public._alert_json(public.gym_alerts) from public, anon, authenticated;
revoke all on function public._alert_trainer_question() from public, anon, authenticated;
revoke all on function public._alert_talk_line() from public, anon, authenticated;
revoke all on function public._alert_plan_request() from public, anon, authenticated;
revoke all on function public._alert_phone_link() from public, anon, authenticated;
revoke all on function public._alert_shop_order() from public, anon, authenticated;
revoke all on function public._alert_report_sent() from public, anon, authenticated;
revoke all on function public._alert_member_joined() from public, anon, authenticated;
revoke all on function public._alert_friend_referred() from public, anon, authenticated;
revoke all on function public.hq_paid_alerts(jsonb) from public, anon, authenticated;
grant execute on function public.hq_paid_alerts(jsonb) to service_role;
revoke all on function public.owner_alerts(text, bigint) from public;
grant execute on function public.owner_alerts(text, bigint) to anon, authenticated;

notify pgrst, 'reload schema';
