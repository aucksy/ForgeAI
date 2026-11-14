-- NOT LIVE - needs the owner's yes ("No LIVE database changes without my yes"). He said yes on 14 Nov 2026 (R-541);
-- the main chat applies it after CI is green (SQL Editor, then the test below on live). Re-runnable. Apply after 0075
-- (gym alerts) and 0056 (Bring a friend), both live. Works with or without 0077 / 0080 / 0083.
-- Test: supabase/tests/0085_friend_known_number.sql (CI runs it after every migration; pasted into the SQL Editor it
-- always ends in an error and so changes nothing). 0056's own test still passes against the function replaced here.
-- Undo: run friend_invite_send from 0056 again (the whole "create or replace function public.friend_invite_send"
-- block). The notes already written stay on their enquiries (harmless: older admin apps do not show them).
--
-- 0085 (R-539, owner 14 Nov 2026): he sent a friend form from a member's invite and NOTHING reached the admin panel.
-- 0056 answers "sent" and makes nothing when the friend's number is already known to the gym (privacy: the page never
-- tells a stranger who is a member). The page still always says "sent"; what changes is the gym's side:
--   * an OPEN ENQUIRY has this number: that enquiry gets a note (data.invitedAgain = {v, by, time, at}: "Invited again
--     by Asha Rao, best time to train: Evening" on its row), its follow-up moves to today (an overdue one stays
--     overdue), and the gym gets the same instant friend_referred alert as a new friend (0075), opening Enquiries;
--   * a MEMBER on the gym's list has this number: nothing is added to the member, and the gym gets a friend_referred
--     alert in plain words ("Asha invited Ravi, who is already your member."), opening that member's page;
--   * the SHARING MEMBER'S OWN number: nothing at all (as before).
-- At most one such note and alert a day for each link and each enquiry or member (the alert's tag), and they count
-- toward the link's 5 a day, so a link cannot ring the gym without limit.
-- A new number works exactly as in 0056 (a new enquiry; the gym_friend_referrals trigger rings the gym).
-- Nothing else changes: no table, no grant, no new function (anon still calls the same friend_invite_send).

set lock_timeout = '3s';

create or replace function public.friend_invite_send(p_code text, p_name text, p_phone text, p_time text,
                                                     p_website text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inv public.gym_friend_invites; m public.gym_members; g public.gyms; who record;
  prior public.crm_records; roster public.crm_records;
  nm text; ph text; t text; label text; by_name text; eid text; v bigint; now_ms bigint; today_d date; a_tag text;
  follow text;
begin
  -- A bot filled the hidden box: answered as sent, nothing kept.
  if btrim(coalesce(p_website, '')) <> '' then return jsonb_build_object('ok', true); end if;
  select * into inv from public.gym_friend_invites where code = upper(btrim(coalesce(p_code, '')));
  if inv.code is null then return jsonb_build_object('error', 'NO_INVITE'); end if;
  select * into m from public.gym_members where member_id = inv.member_id;
  if m.member_id is null or m.left_at is not null then return jsonb_build_object('error', 'NO_INVITE'); end if;
  nm := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
  if length(nm) < 2 or nm !~ '[[:alpha:]]' then return jsonb_build_object('error', 'BAD_NAME'); end if;
  ph := public._norm_phone(p_phone);
  if ph is null then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  t := case when p_time in ('morning', 'afternoon', 'evening', 'any') then p_time else 'any' end;

  -- The gym's row lock first (the order crm_push, check-in and 0047 use).
  select * into g from public.gyms where gym_id = inv.gym_id for update;
  if g.gym_id is null or g.status = 'suspended' then return jsonb_build_object('error', 'NO_INVITE'); end if;
  -- 5 a day from one link (new friends, and notes on numbers the gym already knows), 30 new friends a day per gym.
  if (select count(*) from public.gym_friend_referrals
       where code = inv.code and created_at > now() - interval '1 day')
     + (select count(*) from public.gym_alerts
         where gym_id = g.gym_id and kind = 'friend_referred' and tag like 'friend-again:' || inv.code || ':%'
           and created_at > now() - interval '1 day') >= 5
     or (select count(*) from public.gym_friend_referrals
          where gym_id = g.gym_id and created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;
  -- The member's own number: answered as sent, nothing made.
  if ph = public._norm_phone(m.checkin_phone) then return jsonb_build_object('ok', true); end if;

  -- Who shared it, as the gym knows them (0025's matching: same check-in number and first name).
  select * into who from public._offer_identity(m);
  if who.roster_id is not null then
    select left(regexp_replace(btrim(data->>'fullName'), '\s+', ' ', 'g'), 80) into by_name
      from public.crm_records where gym_id = g.gym_id and kind = 'member' and id = who.roster_id;
  end if;
  by_name := coalesce(nullif(by_name, ''), left(btrim(m.name), 60));
  label := case t when 'morning' then 'Morning' when 'afternoon' then 'Afternoon'
                  when 'evening' then 'Evening' else 'Any time' end;
  today_d := public._ist_today();
  now_ms := floor(extract(epoch from now()) * 1000)::bigint;

  -- Already an open enquiry: a note on it, its follow-up today, and the alert. Still "sent" on the page.
  select * into prior from public.crm_records
   where gym_id = g.gym_id and kind = 'enquiry' and not deleted
     and coalesce(data->>'status', 'open') = 'open'
     and public._norm_phone(data->>'phone') = ph
   order by updated_at desc limit 1;
  if prior.id is not null then
    a_tag := 'friend-again:' || inv.code || ':' || to_char(today_d, 'YYYYMMDD') || ':' || prior.id;
    if exists (select 1 from public.gym_alerts a where a.tag = a_tag) then return jsonb_build_object('ok', true); end if;
    follow := prior.data->>'followUpOn';
    -- An overdue follow-up stays overdue (it already shows first); none, or a later day, becomes today.
    if follow is null or follow !~ '^\d{4}-\d{2}-\d{2}$' or follow > to_char(today_d, 'YYYY-MM-DD') then
      follow := to_char(today_d, 'YYYY-MM-DD');
    end if;
    v := coalesce(g.crm_version, 0) + 1;
    update public.crm_records
       set data = prior.data || jsonb_build_object(
                    'invitedAgain', jsonb_build_object('v', 1, 'by', by_name, 'time', t, 'at', now_ms),
                    'followUpOn', follow, 'updatedAt', now_ms),
           version = v, updated_at = now()
     where gym_id = g.gym_id and kind = 'enquiry' and id = prior.id;
    update public.gyms set crm_version = v where gym_id = g.gym_id;
    perform public._alert(g.gym_id, 'friend_referred', prior.id, a_tag, 'all', true,
      format('%s invited %s to your gym. %s already asked about joining: call them from Enquiries today.',
             public._alert_first_name(by_name), public._alert_first_name(prior.data->>'name'),
             public._alert_first_name(prior.data->>'name')),
      '/enquiries');
    return jsonb_build_object('ok', true);
  end if;

  -- Already a member on the gym's list: nothing added to them; the gym hears it once. Still "sent" on the page.
  select * into roster from public.crm_records
   where gym_id = g.gym_id and kind = 'member' and not deleted
     and public._norm_phone(data->>'phone') = ph
   order by updated_at desc limit 1;
  if roster.id is not null then
    a_tag := 'friend-again:' || inv.code || ':' || to_char(today_d, 'YYYYMMDD') || ':' || roster.id;
    perform public._alert(g.gym_id, 'friend_referred', roster.id, a_tag, 'all', true,
      format('%s invited %s, who is already your member.',
             public._alert_first_name(by_name), public._alert_first_name(coalesce(nullif(btrim(roster.data->>'fullName'), ''), nm))),
      case when roster.id ~ '^[A-Za-z0-9_-]{1,64}$' then '/members/' || roster.id else '/members' end);
    return jsonb_build_object('ok', true);
  end if;

  -- A new friend: exactly as 0056.
  v := coalesce(g.crm_version, 0) + 1;
  eid := 'friend-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.crm_records(gym_id, kind, id, data, version)
    values (g.gym_id, 'enquiry', eid, jsonb_build_object(
              'id', eid, 'gymId', g.gym_id::text, 'name', nm, 'phone', '+91' || ph,
              'interest', 'Best time to train: ' || label,
              'followUpOn', to_char(today_d, 'YYYY-MM-DD'),
              'status', 'open', 'memberId', null, 'source', 'friend',
              'referral', jsonb_build_object('by', by_name, 'memberId', who.roster_id, 'time', t),
              'createdAt', now_ms, 'updatedAt', now_ms), v);
  update public.gyms set crm_version = v where gym_id = g.gym_id;
  insert into public.gym_friend_referrals(enquiry_id, gym_id, member_id, code)
    values (eid, g.gym_id, m.member_id, inv.code);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.friend_invite_send(text, text, text, text, text) from public;
grant execute on function public.friend_invite_send(text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
