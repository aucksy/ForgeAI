-- 0021: the receipt rules on the server, a history of every change to a receipt, and two access
-- fixes (UAT work package 3, 17 Oct 2026; findings in Audit/uat/MONEY-ACCESS.md). Apply after 0020.
-- Re-runnable (create or replace / if not exists / drop ... if exists). Additive: nothing is
-- dropped but one dead policy (F-14), and no saved row is changed except the creator IP (F-10).
-- Tests: supabase/tests/0021_receipt_rules.sql, uat_money.sql, uat_access_matrix.sql (CI runs them
-- after every migration).
--
-- The panel checks the same rules first, with fuller words (apps/dashboard/src/crm/logic/
-- receiptRules.ts, data/local.ts). The server is the last word: a bug, an old panel or a tampered
-- session cannot get past it. Each refusal is a code the panel turns into plain words
-- (auth/signin.ts authErrorWords) and never sends again (data/cloud.ts).
--
-- 1. A NEW RECEIPT (everyone; the front desk's 0018/0019 limits still come first):
--    BAD_AMOUNT     the amount is not a whole number of paise above zero (F-04).
--    BAD_DATE       no date, not a real day, or a day after today in India (F-02).
--    TOO_OLD        the front desk dated it more than 31 days back, the same as a desk sale (F-02).
--    BAD_RECEIPT_NO no number, or more than 16 characters (GST Rule 46, F-11).
--    DUP_RECEIPT    the gym already has a live receipt with this number (F-05).
--    WRONG_PLAN     its membership does not exist in this gym, or is another member's (F-08).
--    OVER_DUE       more than the membership still owes: price + joining fee - live receipts
--                   (F-01). Not checked for a cancelled receipt, or for an owner's IMPORTED receipt
--                   (an old register is history: it may say more was paid than the price).
-- 2. A SAVED RECEIPT is never edited, by anyone, owner included (F-03): the one change it takes
--    is a cancel, with a reason of at least 3 letters (NEED_REASON, F-06). Anything else -
--    amount, member, membership, number, date, method, undoing a cancel - is RECEIPT_LOCKED. The
--    professional rule: cancel it and issue a new one. No panel screen edits a saved receipt or
--    undoes a cancel, so nothing the panel does is refused. Sending the same receipt again is fine.
-- 3. RECEIPT HISTORY (F-03): every change to a saved receipt row (a cancel, an import undone, or
--    anything done straight in the database) leaves a row in receipt_history: when, who (the
--    signed-in person crm_push saw, or "Database (<role>)"), what, and the old and new values.
--    Readable by the gym's owner only, through owner_receipt_history(key).
-- 4. PRICES (F-07): a plan's or a sold membership's price and joining fee, when given or changed,
--    are whole paise, zero or more (BAD_PRICE).
-- 5. F-10: the IP address a gym was created from is no longer on the gyms row (a signed-in member
--    of the gym could read it through 0001's gyms_read, and join_gym_by_code returned it). It
--    moves to gym_creator_ips, which only the database owner reads; gym_create_online counts there.
-- 6. F-14: 0001's gyms_owner_update policy is dropped. It could never work (the logo check calls a
--    function signed-in users may not run), nothing uses it (the mobile app and the old dashboard
--    only READ gyms), and if that function were ever granted it would let a profile rewrite its
--    gym's join code and record version directly.

-- ------------------------------------------------------------------ receipt history (F-03)
create table if not exists public.receipt_history (
  history_id      bigint generated always as identity primary key,
  gym_id          uuid not null references public.gyms(gym_id) on delete cascade,
  receipt_id      text not null,
  changed_at      timestamptz not null default now(),
  changed_by      uuid,
  changed_by_name text,
  what            text not null,
  old_data        jsonb not null,
  new_data        jsonb not null,
  old_deleted     boolean not null,
  new_deleted     boolean not null
);
create index if not exists receipt_history_gym on public.receipt_history(gym_id, changed_at desc);
alter table public.receipt_history enable row level security;
revoke all on public.receipt_history from public, anon, authenticated;

-- Who is saving: crm_push names the signed-in person for this transaction. Anything else that
-- changes a receipt row (the SQL Editor, a future function) is "Database (<role>)".
create or replace function public._receipt_history_log() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  who text := nullif(current_setting('forgeai.actor_id', true), '');
  who_name text := nullif(current_setting('forgeai.actor_name', true), '');
begin
  insert into public.receipt_history(gym_id, receipt_id, changed_by, changed_by_name, what,
                                     old_data, new_data, old_deleted, new_deleted)
  values (new.gym_id, new.id,
          case when who ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then who::uuid end,
          coalesce(who_name, 'Database (' || session_user || ')'),
          case when not old.deleted and new.deleted then 'removed'
               when old.deleted and not new.deleted then 'brought back'
               when coalesce(old.data->>'voided', 'false') <> 'true' and new.data->>'voided' = 'true' then 'cancelled'
               when old.data->>'voided' = 'true' and coalesce(new.data->>'voided', 'false') <> 'true' then 'cancel undone'
               else 'changed' end,
          old.data, new.data, old.deleted, new.deleted);
  return null;
end $$;

drop trigger if exists crm_records_receipt_history on public.crm_records;
create trigger crm_records_receipt_history
  after update on public.crm_records
  for each row
  when (old.kind = 'payment' and (old.data is distinct from new.data or old.deleted is distinct from new.deleted))
  execute function public._receipt_history_log();

-- The gym's receipt history, newest first (at most 500 rows; one receipt's when p_receipt_id is
-- given). The gym's owner only: an old owner key or an owner's session. The desk: OWNER_ONLY.
create or replace function public.owner_receipt_history(p_key text, p_receipt_id text default null)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'receiptId', h.receipt_id, 'at', h.changed_at, 'byId', h.changed_by, 'byName', h.changed_by_name,
             'what', h.what, 'before', h.old_data, 'after', h.new_data,
             'removedBefore', h.old_deleted, 'removedAfter', h.new_deleted)
           order by h.changed_at desc, h.history_id desc)
      from (select * from public.receipt_history
             where gym_id = g and (p_receipt_id is null or receipt_id = p_receipt_id)
             order by changed_at desc, history_id desc limit 500) h), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------ the receipt rules (F-01..F-08, F-11)
-- Live receipt numbers of a gym, for the duplicate check.
create index if not exists crm_records_receipt_no
  on public.crm_records(gym_id, (btrim(data->>'receiptNo')))
  where kind = 'payment' and not deleted;

-- A jsonb number as numeric, else 0.
create or replace function public._num(p jsonb) returns numeric
  language sql immutable set search_path = public as $$
  select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric else 0 end
$$;

-- What any session may save as a receipt. Raises the refusal; returns quietly when it is fine.
create or replace function public._receipt_ok(p_gym uuid, p_id text, p_new jsonb, p_is_staff boolean)
  returns void language plpgsql stable set search_path = public as $$
declare
  prev jsonb; gone boolean; ms jsonb;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  amt numeric; day date; no text; paid numeric;
begin
  select data, deleted into prev, gone from public.crm_records where gym_id = p_gym and kind = 'payment' and id = p_id;

  if prev is not null then
    -- The same receipt again (a resend): fine. Who took it is the server's to keep (0019).
    if (prev - 'collectedBy' - 'collectedByName') = (p_new - 'collectedBy' - 'collectedByName') then return; end if;
    -- The one change a saved receipt takes: a cancel, with a reason. Nothing else, by anyone.
    if not gone
       and coalesce(prev->>'voided', 'false') <> 'true'
       and p_new->>'voided' = 'true'
       and (prev - 'collectedBy' - 'collectedByName' - 'voided' - 'voidReason')
         = (p_new - 'collectedBy' - 'collectedByName' - 'voided' - 'voidReason') then
      if length(btrim(coalesce(p_new->>'voidReason', ''))) < 3 then raise exception 'NEED_REASON'; end if;
      return;
    end if;
    raise exception 'RECEIPT_LOCKED';
  end if;

  -- A new receipt.
  if jsonb_typeof(p_new->'amountP') is distinct from 'number' then raise exception 'BAD_AMOUNT'; end if;
  amt := (p_new->>'amountP')::numeric;
  if amt <= 0 or amt <> trunc(amt) then raise exception 'BAD_AMOUNT'; end if;

  day := public._iso_day(p_new->>'paidOn');
  if day is null or day > today then raise exception 'BAD_DATE'; end if;
  if p_is_staff and day < today - 31 then raise exception 'TOO_OLD'; end if;

  no := btrim(coalesce(p_new->>'receiptNo', ''));
  if no = '' or length(no) > 16 then raise exception 'BAD_RECEIPT_NO'; end if;
  if exists (select 1 from public.crm_records
              where gym_id = p_gym and kind = 'payment' and not deleted and id <> p_id
                and btrim(data->>'receiptNo') = no) then
    raise exception 'DUP_RECEIPT';
  end if;

  select data into ms from public.crm_records
   where gym_id = p_gym and kind = 'membership' and id = p_new->>'membershipId' and not deleted;
  if ms is null or (ms->>'memberId') is distinct from (p_new->>'memberId') then raise exception 'WRONG_PLAN'; end if;

  -- What the membership still owes. Not for a receipt saved already cancelled, nor for an owner's
  -- imported receipt (history from an old register).
  if coalesce(p_new->>'voided', 'false') = 'true' then return; end if;
  if not p_is_staff and coalesce(p_new->>'importId', '') <> '' then return; end if;
  select coalesce(sum(public._num(data->'amountP')), 0) into paid from public.crm_records
   where gym_id = p_gym and kind = 'payment' and not deleted and id <> p_id
     and data->>'membershipId' = p_new->>'membershipId'
     and coalesce(data->>'voided', 'false') <> 'true';
  if amt > public._num(ms->'priceP') + public._num(ms->'joiningFeeP') - paid then
    raise exception 'OVER_DUE';
  end if;
end $$;

-- A plan's or membership's price and joining fee, when given or changed: whole paise, zero or more.
create or replace function public._prices_ok(p_gym uuid, p_kind text, p_id text, p_new jsonb)
  returns void language plpgsql stable set search_path = public as $$
declare prev jsonb; f text; v jsonb;
begin
  select data into prev from public.crm_records where gym_id = p_gym and kind = p_kind and id = p_id;
  foreach f in array array['priceP', 'joiningFeeP'] loop
    v := p_new->f;
    if v is null or jsonb_typeof(v) = 'null' then continue; end if;
    if prev is not null and (prev->f) is not distinct from v then continue; end if;
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < 0
       or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then
      raise exception 'BAD_PRICE';
    end if;
  end loop;
end $$;

-- 0019's crm_push with: who is saving (for the receipt history), and the receipt and price rules
-- for every session. Everything else is exactly as 0019 left it.
create or replace function public.crm_push(p_key text, p_base bigint, p_records jsonb, p_push_id uuid default null)
  returns bigint language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); cur bigint; v bigint; r jsonb; k text; rid text; n int; done bigint;
  st public.gym_staff := public._staff(p_key); is_staff boolean; prev jsonb; d jsonb; tk text;
begin
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'INVALID'; end if;
  n := jsonb_array_length(p_records);
  if n = 0 or n > 1000 then raise exception 'INVALID'; end if;
  select crm_version into cur from public.gyms where gym_id = g for update;
  if p_push_id is not null then
    select version into done from public.crm_push_log where gym_id = g and push_id = p_push_id;
    if done is not null then return done; end if;
  end if;
  if cur is distinct from p_base then raise exception 'STALE'; end if;
  -- 0014: an old owner key or an owner's session may do anything; a Staff session may not.
  is_staff := st.staff_id is not null and st.role = 'staff';
  -- 0021: who is saving, for the receipt history (this transaction only).
  perform set_config('forgeai.actor_id', coalesce(st.staff_id::text, ''), true);
  perform set_config('forgeai.actor_name', coalesce(st.name, 'Owner (old owner key)'), true);
  v := cur + 1;
  for r in select value from jsonb_array_elements(p_records) loop
    k := r->>'k';
    rid := r->>'id';
    if k is null or k not in ('gym','member','plan','membership','payment','visit','enquiry','expense') then raise exception 'INVALID'; end if;
    if rid is null or length(rid) not between 1 and 64 then raise exception 'INVALID'; end if;
    -- Front desk: no plans, expenses or gym details at all.
    if is_staff and k in ('plan','expense','gym') then raise exception 'OWNER_ONLY'; end if;
    if coalesce(r->>'x', 'false') = 'true' then
      -- A check-in or a mistyped expense may be taken back. 0017: so may a member, plan,
      -- membership or receipt that came from an IMPORT (its data carries importId), by the owner
      -- only ("Undo this import"). Anything typed in by hand still can never be deleted.
      if k in ('member','plan','membership','payment') then
        if is_staff then raise exception 'OWNER_ONLY'; end if;
        select data into prev from public.crm_records where gym_id = g and kind = k and id = rid and not deleted;
        if prev is null or coalesce(prev->>'importId', '') = '' then raise exception 'INVALID'; end if;
      elsif k not in ('visit','expense') then
        raise exception 'INVALID';
      end if;
      update public.crm_records set deleted = true, version = v, updated_at = now()
       where gym_id = g and kind = k and id = rid;
    else
      if jsonb_typeof(r->'d') is distinct from 'object' or octet_length((r->'d')::text) > 20000 then
        raise exception 'INVALID';
      end if;
      -- 0018: the import mark is set when a record is first saved, and never after (C8-3).
      select data into prev from public.crm_records where gym_id = g and kind = k and id = rid;
      if prev is not null and coalesce(prev->>'importId', '') <> coalesce(r->'d'->>'importId', '') then
        raise exception 'INVALID';
      end if;
      -- 0018: what the front desk may save (C8-1).
      if is_staff then perform public._staff_write_ok(g, k, rid, r->'d'); end if;
      -- 0021: the receipt and price rules, for every session (owner included).
      if k = 'payment' then
        perform public._receipt_ok(g, rid, r->'d', is_staff);
      elsif k in ('plan', 'membership') then
        perform public._prices_ok(g, k, rid, r->'d');
      end if;
      -- 0019 (C7-12): a NEW receipt or plan says who took the money / sold it: the signed-in
      -- person, from the session (never what the device wrote).
      --  - A front-desk session: ALWAYS (an import mark or a blank does not skip it).
      --  - An owner's session: only when the panel named a taker (collectedBy / soldBy). Records
      --    without one are history: moving a browser gym online, an import. They stay as they are.
      --  - The old owner key (no person): left as written.
      d := r->'d';
      if st.staff_id is not null and prev is null
         and (is_staff
              or (coalesce(d->>'importId', '') = ''
                  and coalesce(d->>(case when k = 'payment' then 'collectedBy' else 'soldBy' end), '') <> '')) then
        if k = 'payment' then
          d := d || jsonb_build_object('collectedBy', st.staff_id::text, 'collectedByName', st.name);
        elsif k = 'membership' then
          d := d || jsonb_build_object('soldBy', st.staff_id::text, 'soldByName', st.name);
        end if;
      elsif prev is not null and k in ('payment', 'membership') then
        -- Once saved, who took the money / sold the plan never changes (a void or a PT session
        -- keeps it), whoever saves the row and whatever the device's copy says.
        foreach tk in array array['collectedBy', 'collectedByName', 'soldBy', 'soldByName'] loop
          if prev ? tk then d := jsonb_set(d, array[tk], prev->tk); else d := d - tk; end if;
        end loop;
      end if;
      insert into public.crm_records(gym_id, kind, id, data, version)
        values (g, k, rid, d, v)
        on conflict (gym_id, kind, id) do update
          set data = excluded.data, version = v, deleted = false, updated_at = now();
      if k = 'gym' and length(btrim(coalesce(r->'d'->>'name', ''))) > 0 then
        update public.gyms set name = left(btrim(r->'d'->>'name'), 60) where gym_id = g;
      end if;
    end if;
  end loop;
  update public.gyms set crm_version = v where gym_id = g;
  if p_push_id is not null then
    insert into public.crm_push_log(gym_id, push_id, version) values (g, p_push_id, v);
    delete from public.crm_push_log where gym_id = g and at < now() - interval '1 day';
  end if;
  return v;
end $$;

-- ------------------------------------------------------------------ F-10: the creator's IP, private
create table if not exists public.gym_creator_ips (
  gym_id     uuid primary key references public.gyms(gym_id) on delete cascade deferrable initially deferred,
  ip         text not null,
  created_at timestamptz not null default now()
);
create index if not exists gym_creator_ips_ip on public.gym_creator_ips(ip, created_at);
alter table public.gym_creator_ips enable row level security;
revoke all on public.gym_creator_ips from public, anon, authenticated;

insert into public.gym_creator_ips(gym_id, ip, created_at)
  select gym_id, creator_ip, created_at from public.gyms where creator_ip is not null
  on conflict (gym_id) do nothing;
update public.gyms set creator_ip = null where creator_ip is not null;

-- Whatever writes gyms.creator_ip (0011's gym_create_online, an old copy of it, a test), the IP
-- goes to the private table and the gyms row keeps none.
create or replace function public._gym_creator_ip_private() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.creator_ip is not null then
    insert into public.gym_creator_ips(gym_id, ip, created_at)
      values (new.gym_id, new.creator_ip, coalesce(new.created_at, now()))
      on conflict (gym_id) do update set ip = excluded.ip;
    new.creator_ip := null;
  end if;
  return new;
end $$;

drop trigger if exists gyms_creator_ip_private on public.gyms;
create trigger gyms_creator_ip_private
  before insert or update of creator_ip on public.gyms
  for each row execute function public._gym_creator_ip_private();

-- 0011's gym_create_online, counting a caller's new gyms in the private table (the rest unchanged).
create or replace function public.gym_create_online(p_gym_name text, p_name text, p_phone text, p_device text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gyms; st public.gym_staff; ph text := public._norm_phone(p_phone); n int; v_ip text := public._caller_ip();
begin
  if ph is null then raise exception 'BAD_PHONE'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 or length(btrim(coalesce(p_gym_name, ''))) = 0 then raise exception 'EMPTY'; end if;
  if v_ip <> '' then
    select count(*) into n from public.gym_creator_ips where ip = v_ip and created_at > now() - interval '1 hour';
    if n >= 5 then raise exception 'BUSY'; end if;
  end if;
  select count(*) into n from public.gyms where created_at > now() - interval '1 hour';
  if n >= 1000 then raise exception 'BUSY'; end if;
  insert into public.gyms(name, join_code, creator_ip)
    values (left(btrim(p_gym_name), 60), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), nullif(v_ip, ''))
    returning * into g;
  insert into public.gym_staff(gym_id, name, phone, role)
    values (g.gym_id, left(btrim(p_name), 60), ph, 'owner') returning * into st;
  return public._signed_in_json(st, public._new_session(st.staff_id, p_device));
end $$;

-- ------------------------------------------------------------------ F-14: the dead update policy
drop policy if exists gyms_owner_update on public.gyms;

-- ------------------------------------------------------------------ grants
revoke all on function public._receipt_history_log()                       from public, anon, authenticated;
revoke all on function public._gym_creator_ip_private()                    from public, anon, authenticated;
revoke all on function public._num(jsonb)                                  from public, anon, authenticated;
revoke all on function public._receipt_ok(uuid, text, jsonb, boolean)      from public, anon, authenticated;
revoke all on function public._prices_ok(uuid, text, text, jsonb)          from public, anon, authenticated;
revoke all on function public.owner_receipt_history(text, text)            from public;
grant execute on function public.owner_receipt_history(text, text)         to anon, authenticated;
revoke all on function public.crm_push(text, bigint, jsonb, uuid)          from public;
grant execute on function public.crm_push(text, bigint, jsonb, uuid)       to anon, authenticated;
revoke all on function public.gym_create_online(text, text, text, text)    from public;
grant execute on function public.gym_create_online(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
