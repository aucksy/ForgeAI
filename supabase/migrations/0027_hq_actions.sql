-- NOT APPLIED - main session applies after review (owner said yes, #51).
--
-- 0027: ForgeAI HQ, step 2 ("Act"): a status on each gym, "suspended = read-only", and the HQ
-- actions (plan docs/overhaul/research/R-owner-panel.md section 5). Re-runnable. Apply after 0026.
-- Changes no existing function. Adds: gyms.status (+ when it changed), triggers on five gym tables,
-- the delete-request list, and service_role-only hq_* functions (each writes hq_audit, 0026).
--
-- GYM STATUS. 'trial' (new, not checked by ForgeAI yet), 'active' (checked), 'suspended'. Every gym
-- that exists when this runs becomes 'active'; a gym created after it starts as 'trial' (the
-- column's default), so self-serve sign-up keeps working unchanged and lands in HQ's "New this week"
-- with its creator's call-back number. Only HQ changes a status (any other change: HQ_ONLY).
--
-- SUSPENDED = READ-ONLY. Done with triggers, so no gym function is edited: while a gym is suspended,
-- any write to its records (crm_records: members, plans, receipts, check-ins, ...), shop products,
-- shop orders, member messages, staff list, or its name and branding raises SUSPENDED. Everything
-- that only reads keeps working: staff can sign in (sessions and codes are not blocked), pull their
-- records and download their data; members can still open the app and leave the gym. A gym that is
-- not suspended pays one primary-key lookup per written row and nothing else changes for it
-- (tests/0027_hq_actions.sql proves an active gym's push, order, product and message still work).
-- HQ's own actions set forgeai.hq = on for their transaction and pass.
--
-- THE ACTIONS (service_role only, i.e. the HQ Worker's "hq" key; a gym key is refused):
--   hq_set_gym_status   approve (trial -> active), suspend (reason required), restore.
--   hq_create_gym       a gym for a lead: the gym, its owner, and the owner's first 6-digit code.
--   hq_reset_owner_signin  a new code for the gym's owner, only after "I called the gym's own number".
--   hq_sign_out_gym     ends every live device of the gym (breach plan, first hour).
--   hq_delete_requests / hq_delete_request_add / hq_delete_request_step / hq_delete_gym
--                       the delete-request workflow with its 30-day count (docs/launch/GYM-DELETE.md).
-- A sign-in code is returned to HQ once and never written to the audit log.

-- Apply 0026, 0027 and 0028 together, in this order (each is re-runnable; re-run all three after a
-- change). A lock wait gives up after 3 seconds rather than stalling the live apps behind it.
set lock_timeout = '3s';

-- ------------------------------------------------------------------ gym status
alter table public.gyms add column if not exists status text not null default 'active';
alter table public.gyms add column if not exists status_at timestamptz;
alter table public.gyms drop constraint if exists gyms_status_check;
alter table public.gyms add constraint gyms_status_check check (status in ('trial', 'active', 'suspended'));
-- Existing gyms were filled with 'active' above; from now on a new gym starts as 'trial'.
alter table public.gyms alter column status set default 'trial';

-- ------------------------------------------------------------------ suspended = read-only
-- A row of a suspended gym may not be written, except by an HQ action.
create or replace function public._gym_not_suspended() returns trigger
  language plpgsql security definer set search_path = public as $$
declare g uuid; st text;
begin
  if current_setting('forgeai.hq', true) = 'on' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then g := old.gym_id; else g := new.gym_id; end if;
  select status into st from public.gyms where gym_id = g;
  if st = 'suspended' then raise exception 'SUSPENDED'; end if;
  return coalesce(new, old);
end $$;

-- The gyms row itself: name and branding are frozen while suspended; the status is HQ's alone.
create or replace function public._gym_row_not_suspended() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if current_setting('forgeai.hq', true) = 'on' then return new; end if;
  if new.status is distinct from old.status then raise exception 'HQ_ONLY'; end if;
  if old.status = 'suspended' then raise exception 'SUSPENDED'; end if;
  return new;
end $$;

drop trigger if exists crm_records_not_suspended on public.crm_records;
create trigger crm_records_not_suspended before insert or update or delete on public.crm_records
  for each row execute function public._gym_not_suspended();
drop trigger if exists shop_products_not_suspended on public.shop_products;
create trigger shop_products_not_suspended before insert or update or delete on public.shop_products
  for each row execute function public._gym_not_suspended();
drop trigger if exists shop_orders_not_suspended on public.shop_orders;
create trigger shop_orders_not_suspended before insert or update or delete on public.shop_orders
  for each row execute function public._gym_not_suspended();
drop trigger if exists gym_messages_not_suspended on public.gym_messages;
create trigger gym_messages_not_suspended before insert or update or delete on public.gym_messages
  for each row execute function public._gym_not_suspended();
drop trigger if exists gym_staff_not_suspended on public.gym_staff;
create trigger gym_staff_not_suspended before insert or update or delete on public.gym_staff
  for each row execute function public._gym_not_suspended();
-- 0025's workout offer and group messages. Starting an offer, joining it, counting a member's dates
-- and sending to a group are refused while paused. Still allowed: a member leaving the offer or the
-- gym (their consent can always be withdrawn), the automatic stop of an offer whose time is over and
-- the retention clean-up (both only stop or delete).
create or replace function public._gym_offer_not_suspended() returns trigger
  language plpgsql security definer set search_path = public as $$
declare g uuid; st text;
begin
  if current_setting('forgeai.hq', true) = 'on' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_table_name = 'gym_offers' then
    -- Only stopping (stopped_at) passes; anything else is a change to the offer.
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'stopped_at') = (to_jsonb(old) - 'stopped_at') then return new; end if;
    g := new.gym_id;
  elsif tg_table_name = 'offer_members' then
    if tg_op = 'UPDATE' then return new; end if;  -- leaving, and the server's own bookkeeping
    g := new.gym_id;
  elsif tg_table_name = 'offer_days' then
    select o.gym_id into g from public.gym_offers o where o.offer_id = new.offer_id;
  elsif tg_table_name = 'gym_message_to' then
    select m.gym_id into g from public.gym_messages m where m.message_id = new.message_id;
  end if;
  select status into st from public.gyms where gym_id = g;
  if st = 'suspended' then raise exception 'SUSPENDED'; end if;
  return new;
end $$;

drop trigger if exists gym_offers_not_suspended on public.gym_offers;
create trigger gym_offers_not_suspended before insert or update or delete on public.gym_offers
  for each row execute function public._gym_offer_not_suspended();
drop trigger if exists offer_members_not_suspended on public.offer_members;
create trigger offer_members_not_suspended before insert or update or delete on public.offer_members
  for each row execute function public._gym_offer_not_suspended();
drop trigger if exists offer_days_not_suspended on public.offer_days;
create trigger offer_days_not_suspended before insert or update or delete on public.offer_days
  for each row execute function public._gym_offer_not_suspended();
drop trigger if exists gym_message_to_not_suspended on public.gym_message_to;
create trigger gym_message_to_not_suspended before insert or update or delete on public.gym_message_to
  for each row execute function public._gym_offer_not_suspended();

drop trigger if exists gyms_not_suspended on public.gyms;
create trigger gyms_not_suspended
  before update of name, brand_accent, brand_bg, brand_logo_url, brand_heading, status on public.gyms
  for each row execute function public._gym_row_not_suspended();

-- ------------------------------------------------------------------ delete requests
create table if not exists public.hq_delete_requests (
  request_id   uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('gym', 'member')),
  gym_id       uuid not null,                 -- no foreign key: the request outlives the gym
  gym_name     text not null,
  join_code    text not null,
  member_ref   text check (member_ref is null or length(member_ref) <= 80), -- e.g. "mobile ending 1234"
  requested_at timestamptz not null,
  source       text not null check (source in ('admin_app', 'email', 'phone', 'other')),
  source_ref   text check (source_ref is null or length(source_ref) <= 40), -- feedback row id
  note         text check (note is null or length(note) <= 500),
  called_at    timestamptz, called_by    text,
  reminded_at  timestamptz, reminded_by  text,
  done_at      timestamptz, done_by      text,
  cancelled_at timestamptz, cancelled_by text,
  created_at   timestamptz not null default now()
);
create unique index if not exists hq_delete_requests_source on public.hq_delete_requests(source, source_ref) where source_ref is not null;
create index if not exists hq_delete_requests_open on public.hq_delete_requests(requested_at) where done_at is null and cancelled_at is null;
alter table public.hq_delete_requests enable row level security;
revoke all on public.hq_delete_requests from public, anon, authenticated;

create or replace function public._hq_request_json(r public.hq_delete_requests) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object(
    'requestId', r.request_id, 'kind', r.kind, 'gymId', r.gym_id, 'gymName', r.gym_name, 'joinCode', r.join_code,
    'memberRef', r.member_ref, 'requestedAt', r.requested_at, 'source', r.source, 'sourceRef', r.source_ref,
    'note', r.note, 'calledAt', r.called_at, 'remindedAt', r.reminded_at, 'doneAt', r.done_at,
    'cancelledAt', r.cancelled_at,
    -- Day 1 is the day it was asked; the privacy notice promises the delete by day 30.
    'day', ((now() at time zone 'Asia/Kolkata')::date - (r.requested_at at time zone 'Asia/Kolkata')::date) + 1,
    'dueOn', ((r.requested_at at time zone 'Asia/Kolkata')::date + 29),
    'gymExists', exists (select 1 from public.gyms g where g.gym_id = r.gym_id))
$$;

-- A reason of at least 3 letters, or NEED_REASON.
create or replace function public._hq_reason(p text) returns text
  language plpgsql immutable set search_path = public as $$
begin
  if length(btrim(coalesce(p, ''))) < 3 then raise exception 'NEED_REASON'; end if;
  return left(btrim(p), 500);
end $$;

-- A gym's status and its open delete request, on its HQ row (0026's _hq_gym_counts).
create or replace function public._hq_gym_extra(p_gym uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', g.status, 'statusAt', g.status_at,
    'deleteRequest', (select public._hq_request_json(r) from public.hq_delete_requests r
                       where r.gym_id = p_gym and r.done_at is null and r.cancelled_at is null
                       order by r.requested_at limit 1))
  from public.gyms g where g.gym_id = p_gym
$$;

-- ------------------------------------------------------------------ actions (service_role only)
-- Approve (trial -> active), suspend (reason), restore (suspended -> active).
create or replace function public.hq_set_gym_status(p_actor text, p_gym uuid, p_status text, p_reason text default null)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare cur text; why text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public._hq_guard();
  if p_status not in ('active', 'suspended') then raise exception 'INVALID'; end if;
  select status into cur from public.gyms where gym_id = p_gym for update;
  if cur is null then raise exception 'GONE'; end if;
  if p_status = 'suspended' then why := public._hq_reason(p_reason); end if;
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = p_status, status_at = now() where gym_id = p_gym;
  perform set_config('forgeai.hq', 'off', true);  -- only for this one write, not the rest of the transaction
  perform public._hq_log(p_actor,
    case when p_status = 'suspended' then 'suspend_gym' when cur = 'suspended' then 'restore_gym' else 'approve_gym' end,
    p_gym, why, jsonb_build_object('from', cur, 'to', p_status));
  return public._hq_gym_counts(p_gym);
end $$;

-- A gym for a lead: the gym (checked by ForgeAI, so 'active'), its owner, and the owner's first
-- sign-in code (30 minutes, one use), shown once to HQ to send on WhatsApp. Errors: BAD_PHONE, EMPTY.
create or replace function public.hq_create_gym(p_actor text, p_gym_name text, p_owner_name text, p_phone text, p_lead text default null)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g public.gyms; st public.gym_staff; ph text := public._norm_phone(p_phone); code jsonb;
begin
  perform public._hq_guard();
  if ph is null then raise exception 'BAD_PHONE'; end if;
  if length(btrim(coalesce(p_owner_name, ''))) = 0 or length(btrim(coalesce(p_gym_name, ''))) = 0 then raise exception 'EMPTY'; end if;
  perform set_config('forgeai.hq', 'on', true);
  insert into public.gyms(name, join_code, status, status_at)
    values (left(btrim(p_gym_name), 60), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), 'active', now())
    returning * into g;
  insert into public.gym_staff(gym_id, name, phone, role)
    values (g.gym_id, left(btrim(p_owner_name), 60), ph, 'owner') returning * into st;
  code := public._make_code(st.staff_id);
  perform set_config('forgeai.hq', 'off', true);
  perform public._hq_log(p_actor, 'create_gym', g.gym_id, null,
    jsonb_build_object('lead', left(coalesce(p_lead, ''), 40), 'ownerPhoneEnds', right(ph, 4)));
  return jsonb_build_object('gymId', g.gym_id, 'name', g.name, 'joinCode', g.join_code,
    'ownerName', st.name, 'ownerPhone', st.phone, 'code', code->>'code', 'expiresAt', code->'expiresAt');
end $$;

-- A new sign-in code for the gym's owner (wraps 0010's _make_code, like support_make_signin_code),
-- only after HQ ticks "I called the gym's own number and the owner confirmed". Errors: CONFIRM_CALL,
-- GONE (no such gym or owner), PICK_OWNER (more than one owner: pass p_staff), TOO_MANY (5 an hour).
create or replace function public.hq_reset_owner_signin(p_actor text, p_gym uuid, p_staff uuid default null, p_called boolean default false)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare st public.gym_staff; n int; code jsonb;
begin
  perform public._hq_guard();
  if p_called is not true then raise exception 'CONFIRM_CALL'; end if;
  perform 1 from public.gyms where gym_id = p_gym for update;
  if not found then raise exception 'GONE'; end if;
  select count(*) into n from public.gym_staff
   where gym_id = p_gym and role = 'owner' and removed_at is null and (p_staff is null or staff_id = p_staff);
  if n = 0 then raise exception 'GONE'; end if;
  if n > 1 then raise exception 'PICK_OWNER'; end if;
  select count(*) into n from public.hq_audit
   where gym_id = p_gym and action = 'reset_owner_signin' and at > now() - interval '1 hour';
  if n >= 5 then raise exception 'TOO_MANY'; end if;
  select * into st from public.gym_staff
   where gym_id = p_gym and role = 'owner' and removed_at is null and (p_staff is null or staff_id = p_staff);
  code := public._make_code(st.staff_id);
  perform public._hq_log(p_actor, 'reset_owner_signin', p_gym, 'called the gym and the owner confirmed',
    jsonb_build_object('ownerPhoneEnds', right(st.phone, 4)));
  return jsonb_build_object('name', st.name, 'phone', st.phone, 'code', code->>'code', 'expiresAt', code->'expiresAt');
end $$;

-- End every live device session of the gym (reason required). Old owner keys (a gym never put
-- online with people) are counted, not removed: removing one could lock that gym out for good.
create or replace function public.hq_sign_out_gym(p_actor text, p_gym uuid, p_reason text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare why text := public._hq_reason(p_reason); n int; k int;
begin
  perform public._hq_guard();
  if not exists (select 1 from public.gyms where gym_id = p_gym) then raise exception 'GONE'; end if;
  update public.gym_sessions x set ended_at = now()
    from public.gym_staff s
   where s.staff_id = x.staff_id and s.gym_id = p_gym and x.ended_at is null;
  get diagnostics n = row_count;
  select count(*) into k from public.gym_owner_keys where gym_id = p_gym;
  perform public._hq_log(p_actor, 'sign_out_gym', p_gym, why, jsonb_build_object('devices', n, 'oldOwnerKeys', k));
  return jsonb_build_object('devices', n, 'oldOwnerKeys', k);
end $$;

-- Every open delete request, and the last 50 closed ones.
create or replace function public.hq_delete_requests(p_actor text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare out jsonb;
begin
  perform public._hq_guard();
  select coalesce(jsonb_agg(public._hq_request_json(r) order by (r.done_at is null and r.cancelled_at is null) desc, r.requested_at), '[]'::jsonb)
    into out
    from (select * from public.hq_delete_requests where done_at is null and cancelled_at is null
          union all
          (select * from public.hq_delete_requests where done_at is not null or cancelled_at is not null
            order by coalesce(done_at, cancelled_at) desc limit 50)) r;
  perform public._hq_log(p_actor, 'view_delete_requests', null, null, '{}'::jsonb);
  return out;
end $$;

-- Write a request down (from the admin app's feedback box, an email or a call). The same feedback
-- row twice gives back the first request. Errors: GONE (no such gym), INVALID.
create or replace function public.hq_delete_request_add(p_actor text, p_gym uuid, p_kind text, p_requested_at timestamptz,
    p_source text, p_source_ref text default null, p_member_ref text default null, p_note text default null)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g public.gyms; r public.hq_delete_requests;
begin
  perform public._hq_guard();
  if p_kind not in ('gym', 'member') or p_source not in ('admin_app', 'email', 'phone', 'other') then raise exception 'INVALID'; end if;
  if p_requested_at is null or p_requested_at > now() + interval '1 hour' then raise exception 'INVALID'; end if;
  if p_kind = 'member' and length(btrim(coalesce(p_member_ref, ''))) = 0 then raise exception 'EMPTY'; end if;
  select * into g from public.gyms where gym_id = p_gym;
  if g.gym_id is null then raise exception 'GONE'; end if;
  if nullif(btrim(coalesce(p_source_ref, '')), '') is not null then
    select * into r from public.hq_delete_requests where source = p_source and source_ref = btrim(p_source_ref);
    if r.request_id is not null then return public._hq_request_json(r); end if;
  end if;
  insert into public.hq_delete_requests(kind, gym_id, gym_name, join_code, member_ref, requested_at, source, source_ref, note)
    values (p_kind, g.gym_id, g.name, g.join_code, nullif(left(btrim(coalesce(p_member_ref, '')), 80), ''),
            p_requested_at, p_source, nullif(left(btrim(coalesce(p_source_ref, '')), 40), ''),
            nullif(left(btrim(coalesce(p_note, '')), 500), ''))
    returning * into r;
  perform public._hq_log(p_actor, 'delete_request_added', g.gym_id, null,
    jsonb_build_object('requestId', r.request_id, 'kind', p_kind, 'source', p_source));
  return public._hq_request_json(r);
end $$;

-- A step on a request: 'called' (the gym's own number, the owner confirmed), 'reminded' (to
-- download first), 'cancel' (reason in p_note), 'member_done' (a member's details were erased by
-- hand). Errors: GONE, CLOSED, INVALID, NEED_REASON.
create or replace function public.hq_delete_request_step(p_actor text, p_request uuid, p_step text, p_note text default null)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r public.hq_delete_requests; a text := public._hq_actor(p_actor); why text;
begin
  perform public._hq_guard();
  select * into r from public.hq_delete_requests where request_id = p_request for update;
  if r.request_id is null then raise exception 'GONE'; end if;
  if r.done_at is not null or r.cancelled_at is not null then raise exception 'CLOSED'; end if;
  if p_step = 'called' then
    update public.hq_delete_requests set called_at = now(), called_by = a where request_id = p_request returning * into r;
  elsif p_step = 'reminded' then
    update public.hq_delete_requests set reminded_at = now(), reminded_by = a where request_id = p_request returning * into r;
  elsif p_step = 'cancel' then
    why := public._hq_reason(p_note);
    update public.hq_delete_requests set cancelled_at = now(), cancelled_by = a,
           note = left(coalesce(note || ' | ', '') || 'Cancelled: ' || why, 500)
     where request_id = p_request returning * into r;
  elsif p_step = 'member_done' and r.kind = 'member' then
    if r.called_at is null then raise exception 'NOT_CALLED'; end if;
    update public.hq_delete_requests set done_at = now(), done_by = a where request_id = p_request returning * into r;
  else
    raise exception 'INVALID';
  end if;
  perform public._hq_log(a, 'delete_request_' || p_step, r.gym_id, why, jsonb_build_object('requestId', r.request_id));
  return public._hq_request_json(r);
end $$;

-- Delete the gym of a request: only after "called" and "reminded", and only when HQ typed the
-- gym's 6-letter code. Every gym table follows by itself (on delete cascade). Then it proves no
-- gym table still holds a row for that gym (else everything is undone: STILL_ROWS). Returns the
-- gym's stored pictures (bucket + path) for the HQ Worker to remove from Storage.
-- Errors: GONE, CLOSED, NOT_CALLED, NOT_REMINDED, WRONG_CODE, INVALID.
create or replace function public.hq_delete_gym(p_actor text, p_request uuid, p_typed_code text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r public.hq_delete_requests; g public.gyms; a text := public._hq_actor(p_actor); files jsonb; t record; n bigint; tables int := 0;
begin
  perform public._hq_guard();
  select * into r from public.hq_delete_requests where request_id = p_request for update;
  if r.request_id is null then raise exception 'GONE'; end if;
  if r.kind <> 'gym' then raise exception 'INVALID'; end if;
  if r.done_at is not null or r.cancelled_at is not null then raise exception 'CLOSED'; end if;
  if r.called_at is null then raise exception 'NOT_CALLED'; end if;
  if r.reminded_at is null then raise exception 'NOT_REMINDED'; end if;
  select * into g from public.gyms where gym_id = r.gym_id for update;
  if g.gym_id is null then raise exception 'GONE'; end if;
  if upper(btrim(coalesce(p_typed_code, ''))) <> upper(g.join_code) then raise exception 'WRONG_CODE'; end if;

  select coalesce(jsonb_agg(distinct jsonb_build_object('bucket', m[1], 'path', m[2])), '[]'::jsonb) into files
    from (select regexp_match(u, '/storage/v1/object/public/(gym-logos|product-photos)/([0-9a-f]{48}/[A-Za-z0-9._-]{1,80})$') m
            from (select g.brand_logo_url u
                  union all select image_url from public.shop_products where gym_id = g.gym_id) x
           where u is not null) y
   where m is not null;
  -- Only exact files (never a folder), and never one another gym still shows: the picture buckets'
  -- folders are upload tickets, not gym ids, so a link copied into another gym keeps its file.
  select coalesce(jsonb_agg(f), '[]'::jsonb) into files
    from jsonb_array_elements(files) f
   where not exists (select 1 from public.shop_products p
                      where p.gym_id <> g.gym_id
                        and right(p.image_url, length('/storage/v1/object/public/' || (f->>'bucket') || '/' || (f->>'path')))
                            = '/storage/v1/object/public/' || (f->>'bucket') || '/' || (f->>'path'))
     and not exists (select 1 from public.gyms o
                      where o.gym_id <> g.gym_id
                        and right(o.brand_logo_url, length('/storage/v1/object/public/' || (f->>'bucket') || '/' || (f->>'path')))
                            = '/storage/v1/object/public/' || (f->>'bucket') || '/' || (f->>'path'));

  perform set_config('forgeai.hq', 'on', true);
  -- 0021's private creator address: its cascade is deferred to the commit, so it goes first.
  delete from public.gym_creator_ips where gym_id = g.gym_id;
  delete from public.gyms where gym_id = g.gym_id;
  -- Proof: no gym table holds a row for that gym id. HQ's own records (the audit log, requests,
  -- support-access list, access log) keep the id on purpose: they are ForgeAI's legal records.
  for t in select c.table_name from information_schema.columns c
            join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'gym_id' and tb.table_type = 'BASE TABLE'
             and c.table_name not like 'hq\_%' and c.table_name <> 'gym_access_log' loop
    execute format('select count(*) from public.%I where gym_id = $1', t.table_name) into n using g.gym_id;
    tables := tables + 1;
    if n > 0 then raise exception 'STILL_ROWS % in %', n, t.table_name; end if;
  end loop;
  perform set_config('forgeai.hq', 'off', true);
  -- 0028's access log keeps the gym's sign-in times (ForgeAI's own security record), but not who or
  -- on which device: those were the gym's staff.
  update public.gym_access_log set person = null, device = null where gym_id = g.gym_id;
  update public.hq_delete_requests set done_at = now(), done_by = a where request_id = p_request;
  -- The gym row is gone, so its name is written in by hand (_hq_log looks it up from gyms).
  insert into public.hq_audit(actor, action, gym_id, gym_name, reason, detail, ip)
    values (a, 'delete_gym', g.gym_id, g.name, 'delete request ' || p_request::text,
            jsonb_build_object('joinCode', g.join_code, 'tablesChecked', tables, 'files', jsonb_array_length(files)),
            public._hq_ip());
  return jsonb_build_object('deleted', true, 'gymName', g.name, 'joinCode', g.join_code, 'tablesChecked', tables, 'files', files);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._gym_not_suspended()                         from public, anon, authenticated;
revoke all on function public._gym_row_not_suspended()                     from public, anon, authenticated;
revoke all on function public._gym_offer_not_suspended()                   from public, anon, authenticated;
revoke all on function public._hq_request_json(public.hq_delete_requests)  from public, anon, authenticated;
revoke all on function public._hq_reason(text)                             from public, anon, authenticated;
revoke all on function public._hq_gym_extra(uuid)                          from public, anon, authenticated;
revoke all on function public.hq_set_gym_status(text, uuid, text, text)    from public, anon, authenticated;
revoke all on function public.hq_create_gym(text, text, text, text, text)  from public, anon, authenticated;
revoke all on function public.hq_reset_owner_signin(text, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.hq_sign_out_gym(text, uuid, text)            from public, anon, authenticated;
revoke all on function public.hq_delete_requests(text)                     from public, anon, authenticated;
revoke all on function public.hq_delete_request_add(text, uuid, text, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke all on function public.hq_delete_request_step(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.hq_delete_gym(text, uuid, text)              from public, anon, authenticated;
grant execute on function public.hq_set_gym_status(text, uuid, text, text)    to service_role;
grant execute on function public.hq_create_gym(text, text, text, text, text)  to service_role;
grant execute on function public.hq_reset_owner_signin(text, uuid, uuid, boolean) to service_role;
grant execute on function public.hq_sign_out_gym(text, uuid, text)            to service_role;
grant execute on function public.hq_delete_requests(text)                     to service_role;
grant execute on function public.hq_delete_request_add(text, uuid, text, timestamptz, text, text, text, text) to service_role;
grant execute on function public.hq_delete_request_step(text, uuid, text, text) to service_role;
grant execute on function public.hq_delete_gym(text, uuid, text)              to service_role;

notify pgrst, 'reload schema';
