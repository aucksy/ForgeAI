-- NOT APPLIED LIVE - needs the owner's yes (a live database change).
--
-- 0054: the gym's answers pop up on the member's phone (R-319 item 8: "whenever there is a new action
-- required by the owner or by the member in the app, there has to be a notification"). Until now a
-- member saw these only by opening the app:
--   - their pause or renew request was approved or declined (0044, owner_decide_plan_request),
--   - the gym asked for their workout report (0045, owner_request_report),
--   - their shop order is ready, or the gym cancelled it (0002, owner_set_order_status).
--
-- Additive and re-runnable: one new table, three triggers on rows that change in those tables, one new
-- HQ-key function for the sender. No function that exists is changed; the 0038 sender (hq_push_next,
-- push_jobs) is untouched, so this applies after 0038/0044/0045 and the Worker keeps working before it
-- (deploy/hq/push.js treats a missing hq_push_direct_next as "not yet").
-- Test: supabase/tests/0054_member_alerts.sql (CI runs it after every migration; pasted into the SQL
-- Editor it always ends in an error and so changes nothing).
--
-- HOW. Each trigger writes ONE note for ONE member (member_push_notes): the words of the pop-up, where a
-- tap opens the app, and a tag so the same event is never written twice. The trigger never stands in the
-- way of the gym's own action: any failure inside it is only a warning. The HQ Worker (every minute)
-- calls hq_push_direct_next, which hands back the waiting notes with that member's push addresses
-- (0038's member_push_tokens: saved only while the member is in the gym with "Messages from my gym" on)
-- and marks them done BEFORE they are sent (never twice; a sender that dies loses a pop-up, and the app
-- still shows the answer when opened). A note more than 6 hours late, or for a member with no push
-- address, is closed without a pop-up. Done notes are deleted after 30 days.
--
-- WHAT A NOTE HOLDS. The member, the gym, a short line (no money amounts, no other member's data), and
-- the app route. Row security on and no grants: only the functions below touch it.
--
-- REPORT REQUESTS. A report request names the gym's own list entry (roster id), not an app member. The
-- note goes to the app member(s) of that gym the app would link to that entry (0035 _member_roster_link
-- rules, read the other way): same check-in number, same first name, and that number not shared by two
-- people on the gym's list. When nobody matches, no note.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ table
create table if not exists public.member_push_notes (
  note_id    uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  member_id  uuid not null references public.gym_members(member_id) on delete cascade,
  kind       text not null check (kind in ('plan_request', 'report_request', 'order')),
  ref_id     uuid not null,
  -- One note per event: 'plan_request:<id>:approved', 'order:<id>:ready', ...
  tag        text not null unique check (length(tag) between 5 and 200),
  line       text not null check (length(line) between 3 and 200),
  route      text not null check (route ~ '^/[a-z0-9/_-]{0,60}$'),
  created_at timestamptz not null default now(),
  done_at    timestamptz,
  why_done   text
);
create index if not exists member_push_notes_due on public.member_push_notes(created_at) where done_at is null;
create index if not exists member_push_notes_member on public.member_push_notes(member_id);

alter table public.member_push_notes enable row level security;
revoke all on public.member_push_notes from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers
-- "5 Nov". PURE.
create or replace function public._note_day(d date) returns text
  language sql immutable set search_path = public as $$
  select case when d is null then null else to_char(d, 'FMDD Mon') end
$$;

-- Write one note (once per tag). Never raises: a failure is a warning only.
create or replace function public._push_note(p_gym uuid, p_member uuid, p_kind text, p_ref uuid, p_tag text,
                                             p_line text, p_route text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if p_member is null then return; end if;
  -- A member who left gets nothing (and keeps no push address: 0038).
  if not exists (select 1 from public.gym_members where member_id = p_member and gym_id = p_gym and left_at is null) then
    return;
  end if;
  insert into public.member_push_notes(gym_id, member_id, kind, ref_id, tag, line, route)
    values (p_gym, p_member, p_kind, p_ref, p_tag, left(p_line, 200), p_route)
    on conflict (tag) do nothing;
exception when others then
  raise warning 'member push note % not made: %', p_tag, sqlerrm;
end $$;

-- ------------------------------------------------------------------ triggers
-- A pause or renew request answered (pending -> approved | declined).
create or replace function public._push_note_plan_request() returns trigger
  language plpgsql security definer set search_path = public as $$
declare words text;
begin
  begin
    if old.status = 'pending' and new.status in ('approved', 'declined') then
      words := case
        when new.status = 'approved' and new.kind = 'freeze' then
          format('Approved: your plan is paused from %s to %s.', public._note_day(new.freeze_from), public._note_day(new.freeze_to))
        when new.status = 'approved' and new.new_ends_on is not null then
          format('Approved: your plan is renewed till %s.', public._note_day(new.new_ends_on))
        when new.status = 'approved' then 'Approved: your plan is renewed. Open the app to see the new dates.'
        when new.kind = 'freeze' then 'Your gym said no to pausing your plan. Ask at the desk to know why.'
        else 'Your gym said no to your renewal request. Ask at the desk to know why.'
      end;
      perform public._push_note(new.gym_id, new.app_member, 'plan_request', new.request_id,
        format('plan_request:%s:%s', new.request_id, new.status), words, '/shop');
    end if;
  exception when others then
    raise warning 'push note for plan request % not made: %', new.request_id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists gym_plan_requests_push_note on public.gym_plan_requests;
create trigger gym_plan_requests_push_note after update of status on public.gym_plan_requests
  for each row execute function public._push_note_plan_request();

-- The gym asked for a member's workout report (a new pending request).
create or replace function public._push_note_report_request() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  roster public.crm_records;
  ph text;
  sharing int;
  m record;
begin
  begin
    if new.status = 'pending' then
      select * into roster from public.crm_records r
       where r.gym_id = new.gym_id and r.kind = 'member' and r.id = new.roster_id and not r.deleted;
      ph := public._norm_phone(roster.data->>'phone');
      if roster.id is not null and ph is not null and public._first_name_key(roster.data->>'fullName') is not null then
        select count(*) into sharing from public.crm_records r
         where r.gym_id = new.gym_id and r.kind = 'member' and not r.deleted
           and coalesce(r.data->>'archived', 'false') <> 'true'
           and public._norm_phone(r.data->>'phone') = ph;
        if sharing <= 1 then
          for m in select gm.member_id from public.gym_members gm
                    where gm.gym_id = new.gym_id and gm.left_at is null
                      and public._norm_phone(gm.checkin_phone) = ph
                      and public._first_name_key(gm.name) = public._first_name_key(roster.data->>'fullName') loop
            perform public._push_note(new.gym_id, m.member_id, 'report_request', new.request_id,
              format('report_request:%s:%s', new.request_id, m.member_id),
              'Your gym asked to see your workout report. Open the app to say yes or no.', '/shop');
          end loop;
        end if;
      end if;
    end if;
  exception when others then
    raise warning 'push note for report request % not made: %', new.request_id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists gym_report_requests_push_note on public.gym_report_requests;
create trigger gym_report_requests_push_note after insert on public.gym_report_requests
  for each row execute function public._push_note_report_request();

-- A shop order the gym marked ready, or cancelled. (Collected: the member is at the desk; a member's
-- own cancel: they know.)
create or replace function public._push_note_order() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status is distinct from old.status and new.member_id is not null then
      if new.status = 'ready' then
        perform public._push_note(new.gym_id, new.member_id, 'order', new.order_id,
          format('order:%s:ready', new.order_id),
          format('Your order %s is ready. Collect it at the desk.', new.order_no), '/shop/orders');
      elsif new.status = 'cancelled' and new.cancelled_by = 'gym' then
        perform public._push_note(new.gym_id, new.member_id, 'order', new.order_id,
          format('order:%s:cancelled', new.order_id),
          format('Your gym cancelled your order %s. Ask at the desk to know why.', new.order_no), '/shop/orders');
      end if;
    end if;
  exception when others then
    raise warning 'push note for order % not made: %', new.order_id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists shop_orders_push_note on public.shop_orders;
create trigger shop_orders_push_note after update of status on public.shop_orders
  for each row execute function public._push_note_order();

-- ------------------------------------------------------------------ the sender (HQ key only)
-- The waiting notes with their members' push addresses, at most p_max addresses in all (1-500).
-- Each note handed back is done already. -> {notes: [{noteId, kind, refId, gymId, gymName, line, route,
-- tokens: [..]}]} (an empty list when nothing waits).
create or replace function public.hq_push_direct_next(p_max int default 40)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lim int := least(greatest(coalesce(p_max, 40), 1), 500);
  used int := 0;
  n public.member_push_notes;
  toks text[];
  gname text;
  res jsonb := '[]'::jsonb;
begin
  perform public._hq_guard();
  if random() < 0.02 then
    delete from public.member_push_notes where done_at < now() - interval '30 days';
  end if;
  for n in select * from public.member_push_notes
            where done_at is null
            order by created_at, note_id
            limit 200
            for update skip locked loop
    if n.created_at < now() - interval '6 hours' then
      update public.member_push_notes set done_at = now(), why_done = 'late' where note_id = n.note_id;
      continue;
    end if;
    select array_agg(t.token order by t.token) into toks
      from public.member_push_tokens t
      join public.gym_members gm on gm.member_id = t.member_id
     where t.member_id = n.member_id and t.gym_id = n.gym_id and gm.left_at is null;
    if toks is null or array_length(toks, 1) is null then
      update public.member_push_notes set done_at = now(), why_done = 'no-phone' where note_id = n.note_id;
      continue;
    end if;
    -- The first note always goes (at most 5 addresses per member); later ones only while they fit.
    if used > 0 and used + array_length(toks, 1) > lim then exit; end if;
    used := used + array_length(toks, 1);
    update public.member_push_notes set done_at = now(), why_done = 'sent' where note_id = n.note_id;
    select name into gname from public.gyms where gym_id = n.gym_id;
    res := res || jsonb_build_array(jsonb_build_object(
      'noteId', n.note_id, 'kind', n.kind, 'refId', n.ref_id, 'gymId', n.gym_id, 'gymName', coalesce(gname, ''),
      'line', n.line, 'route', n.route, 'tokens', to_jsonb(toks)));
    if used >= lim then exit; end if;
  end loop;
  return jsonb_build_object('notes', res);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._note_day(date)                                         from public, anon, authenticated;
revoke all on function public._push_note(uuid, uuid, text, uuid, text, text, text)    from public, anon, authenticated;
revoke all on function public._push_note_plan_request()                               from public, anon, authenticated;
revoke all on function public._push_note_report_request()                             from public, anon, authenticated;
revoke all on function public._push_note_order()                                      from public, anon, authenticated;
revoke all on function public.hq_push_direct_next(int)                                from public, anon, authenticated;
grant execute on function public.hq_push_direct_next(int)                             to service_role;
