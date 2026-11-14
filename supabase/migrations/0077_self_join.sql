-- NOT APPLIED LIVE. Needs the owner's yes (a live database change, R-513). Re-runnable. Apply after 0075 (it adds a
-- kind to 0075's gym_alerts and writes an alert there) and after 0061 (it checks 0061's signed number proofs).
-- Test: supabase/tests/0077_self_join.sql (CI runs it after every migration; pasted into the SQL Editor it always ends
-- in an error and so changes nothing).
--
-- 0077: Join online, phase 1 (R-513, owner 14 Nov 2026: "a system wherein the potential lead or the user can actually
-- fill out their own form on their own phone ... and all of the data automatically gets uploaded to the gym owner['s]
-- admin panel. So there is no need for a receptionist to do it all manually.").
-- A new member opens the gym's link on any phone browser (app.mettleup.fit/m/<GYM CODE>, the panel Worker and
-- public/join-online.html; also "Become a member" on the /j/<CODE> page), proves their mobile number with "Verify with
-- WhatsApp" (the panel Worker's 'join' proof, deploy/panel/phoneInbound.js, checked HERE as 0061 does), picks one of the
-- gym's own plans and a start day, ticks two boxes, and taps "Send to the gym". Phase 1 takes no money: they pay at the
-- desk. The request lands in the gym's own Enquiries as an ordinary enquiry carrying a `selfJoin` block, so no record
-- kind changes and an older admin app still shows it as an enquiry (its `interest` line says what they picked). The
-- admin app lists these as "Joined online"; "Make member" opens the usual Add member form filled in, then the usual
-- Sell membership with the plan picked (nothing collected), and the enquiry is marked joined as for any enquiry.
--
-- NEW
--   gym_self_joins           one row per request sent (the limits below). RLS on, no grants.
--   self_join_preview(code)  what the page shows before anyone types: the gym's name and look, whether it takes online
--                            sign-ups now, today and the last start day (India), and the gym's active non-PT plans with
--                            their prices AS THE GYM SET THEM. Null for an unknown code. Never a member, a number or an
--                            owner.
--   self_join_send(...)      the request. EVERY price is read here from the gym's own plan; the page sends none.
--   gym_alerts kind 'online_join' (0075's list): one INSTANT alert per request, for the owner, the desk and trainers.
-- CHANGED: 0075's gym_alerts kind check gets 'online_join' added (the check is rebuilt from what it is now, so kinds
--   another file added stay).
--
-- THE REQUEST. self_join_send(code, name, proof, gender, plan, start, adult, health, lang, website)
--   -> {ok, gymName, planName, startsOn, totalP, linked}
--    | {error: 'NO_GYM' | 'CLOSED' | 'BAD_NAME' | 'BAD_PROOF' | 'BAD_PLAN' | 'BAD_DATE' | 'NO_CONSENT' | 'MEMBER' |
--               'TOO_MANY'}
--   - website: the page's hidden box. Filled = a bot: answered as sent, nothing kept.
--   - CLOSED: the gym is paused by MettleUp (status 'suspended') or cannot add members now (0062: basic or read-only).
--   - proof: a fresh 'join' proof for the number (one use; used up only when the request is kept). The number is the
--     proof's, never a typed one: only the holder of the number can ask, so the answers below tell nobody else anything.
--   - MEMBER: the number is on the gym's member list (not archived): the page says "already a member here" and points to
--     renewing. An ARCHIVED member is a returning member: the request is kept, and the admin app's convert step offers
--     "Bring back and mark joined" as for any enquiry.
--   - An OPEN enquiry with this number (the desk typed it, or a member's friend left it, 0056) is LINKED: the selfJoin
--     block goes on that enquiry (its name, interest, source and referral stay), so "Referred by" and the friend's
--     free days (0056) keep working when it is marked joined. Sending again replaces the block on the same enquiry.
--   - start: today .. today + 30 (India). adult and health: both boxes ticked (the page cannot send without them).
--   - LIMITS: 30 requests a day per gym, 3 a day per number (TOO_MANY); the panel Worker adds 10 a day per network
--     address (deploy/panel/selfJoin.js); "Verify with WhatsApp" has its own per number and address limits.
--
-- THE selfJoin BLOCK on the enquiry (apps/dashboard/src/crm/types.ts EnquirySelfJoin):
--   {v: 1, name, gender: 'male'|'female'|'other'|null, planId, planName, durationUnit, durationCount,
--    priceP, joiningFeeP, totalP (paise, from the plan), startsOn: 'YYYY-MM-DD', pay: 'desk', paid: false,
--    phoneChecked: true, lang: 'en'|'hi', consents: {adultAt, healthAt (ms), wording: '2026-11-14'}, at (ms)}
--
-- PRIVACY. The name and number go only into that gym's records, as the desk's own "+ Add enquiry" does. The consent
-- times are kept so the gym can show what was agreed and when. The page's wording is the owner's to approve (R-513).
-- Undo: drop function public.self_join_send(text, text, text, text, text, text, boolean, boolean, text, text);
--   drop function public.self_join_preview(text); drop function public._self_join_plans(uuid);
--   drop function public._self_join_closed(public.gyms); drop table public.gym_self_joins. Enquiries made stay
--   (ordinary enquiry records). 'online_join' may stay in the gym_alerts check.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ table (RLS on, no grants)
create table if not exists public.gym_self_joins (
  join_id    uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  enquiry_id text not null check (length(enquiry_id) between 1 and 64),
  phone      text not null check (phone ~ '^[6-9][0-9]{9}$'),
  created_at timestamptz not null default now()
);
create index if not exists gym_self_joins_gym on public.gym_self_joins(gym_id, created_at desc);
create index if not exists gym_self_joins_phone on public.gym_self_joins(phone, created_at desc);
alter table public.gym_self_joins enable row level security;
revoke all on public.gym_self_joins from public, anon, authenticated;

-- ------------------------------------------------------------------ 0075's alert kinds + 'online_join'
-- Rebuilt from the check as it stands (pg_get_constraintdef), so a kind another migration added is kept.
do $$
declare c record; done boolean := false;
begin
  if to_regclass('public.gym_alerts') is null then raise exception '0077 needs 0075 (gym_alerts) first'; end if;
  for c in select conname, pg_get_constraintdef(oid) as def from pg_constraint
            where conrelid = 'public.gym_alerts'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%trainer_question%' loop
    if position('''online_join''' in c.def) = 0 then
      execute format('alter table public.gym_alerts drop constraint %I', c.conname);
      execute format('alter table public.gym_alerts add constraint %I %s', c.conname,
                     regexp_replace(c.def, '\](\)+)\s*$', ', ''online_join''::text]\1'));
    end if;
    done := true;
  end loop;
  if not done then raise exception '0077: the gym_alerts kind check was not found'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.gym_alerts'::regclass and contype = 'c'
                  and pg_get_constraintdef(oid) like '%''online_join''%') then
    raise exception '0077: online_join could not be added to the gym_alerts kind check';
  end if;
end $$;

-- ------------------------------------------------------------------ private helpers
-- The gym cannot take online sign-ups now: paused by MettleUp, or no new members allowed (0062: basic, read-only).
create or replace function public._self_join_closed(g public.gyms) returns boolean
  language sql stable security definer set search_path = public as $$
  select g.gym_id is null or g.status = 'suspended' or not public.gym_has_feature(g.gym_id, 'addMember')
$$;

-- The plans a person may pick online: active, named, not a personal-training pack, a real length and price. Prices in
-- paise as the gym set them; totalP = price + joining fee (a new member's first plan carries the joining fee).
create or replace function public._self_join_plans(p_gym uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'durationUnit', p.unit, 'durationCount', p.cnt,
           'priceP', p.price, 'joiningFeeP', p.fee, 'totalP', p.price + p.fee)
         order by p.sort, p.name, p.id), '[]'::jsonb)
    from (select r.id, left(btrim(r.data->>'name'), 80) as name, r.data->>'durationUnit' as unit,
                 (r.data->>'durationCount')::int as cnt, (r.data->>'priceP')::bigint as price,
                 case when coalesce(r.data->>'joiningFeeP', '') ~ '^[0-9]{1,9}$' then (r.data->>'joiningFeeP')::bigint else 0 end as fee,
                 case when r.data->>'sortOrder' ~ '^-?[0-9]{1,6}$' then (r.data->>'sortOrder')::int else 0 end as sort
            from public.crm_records r
           where r.gym_id = p_gym and r.kind = 'plan' and not r.deleted
             and coalesce(r.data->>'active', 'true') <> 'false'
             and coalesce(btrim(r.data->>'name'), '') <> ''
             and coalesce(nullif(r.data->>'ptSessions', ''), '0') in ('0', 'null')
             and r.data->>'durationUnit' in ('day', 'month')
             and coalesce(r.data->>'durationCount', '') ~ '^[1-9][0-9]{0,3}$'
             and coalesce(r.data->>'priceP', '') ~ '^[0-9]{1,9}$'
           order by 7, 2
           limit 40) p
$$;

revoke all on function public._self_join_closed(public.gyms) from public, anon, authenticated;
revoke all on function public._self_join_plans(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ the page's first look
create or replace function public.self_join_preview(p_code text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g public.gyms; today date := public._ist_today();
begin
  select * into g from public.gyms where join_code = upper(btrim(coalesce(p_code, '')));
  if g.gym_id is null then return null; end if;
  if public._self_join_closed(g) then
    return jsonb_build_object('gymName', g.name, 'joinCode', g.join_code, 'brand', public._brand_json(g), 'closed', true);
  end if;
  return jsonb_build_object('gymName', g.name, 'joinCode', g.join_code, 'brand', public._brand_json(g), 'closed', false,
                            'today', to_char(today, 'YYYY-MM-DD'), 'lastDay', to_char(today + 30, 'YYYY-MM-DD'),
                            'plans', public._self_join_plans(g.gym_id));
end $$;

-- ------------------------------------------------------------------ the request
create or replace function public.self_join_send(p_code text, p_name text, p_proof text, p_gender text, p_plan text,
                                                 p_start text, p_adult boolean, p_health boolean, p_lang text,
                                                 p_website text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.gyms; nm text; ph text; pl jsonb; d date; today date := public._ist_today();
  gender text; lang text; now_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
  prior public.crm_records; eid text; v bigint; block jsonb; linked boolean := false; interest text;
begin
  -- A bot filled the hidden box: answered as sent, nothing kept.
  if btrim(coalesce(p_website, '')) <> '' then return jsonb_build_object('ok', true); end if;
  select * into g from public.gyms where join_code = upper(btrim(coalesce(p_code, '')));
  if g.gym_id is null then return jsonb_build_object('error', 'NO_GYM'); end if;
  if public._self_join_closed(g) then return jsonb_build_object('error', 'CLOSED'); end if;
  nm := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
  if length(nm) < 2 or nm !~ '[[:alpha:]]' then return jsonb_build_object('error', 'BAD_NAME'); end if;
  -- The number is the proof's: looked at here, used up only when the request is kept.
  ph := public._phone_proof(p_proof, 'join', false);
  if ph is null then return jsonb_build_object('error', 'BAD_PROOF'); end if;
  select x into pl from jsonb_array_elements(public._self_join_plans(g.gym_id)) x where x->>'id' = p_plan limit 1;
  if pl is null then return jsonb_build_object('error', 'BAD_PLAN'); end if;
  d := public._iso_day(p_start);
  if d is null or d < today or d > today + 30 then return jsonb_build_object('error', 'BAD_DATE'); end if;
  if p_adult is not true or p_health is not true then return jsonb_build_object('error', 'NO_CONSENT'); end if;
  gender := case when p_gender in ('male', 'female', 'other') then p_gender end;
  lang := case when p_lang = 'hi' then 'hi' else 'en' end;

  -- The gym's row lock first (the order crm_push, check-in, 0047 and 0056 use).
  select * into g from public.gyms where gym_id = g.gym_id for update;
  if public._self_join_closed(g) then return jsonb_build_object('error', 'CLOSED'); end if;
  if exists (select 1 from public.crm_records
              where gym_id = g.gym_id and kind = 'member' and not deleted
                and coalesce(data->>'archived', 'false') <> 'true'
                and public._norm_phone(data->>'phone') = ph) then
    return jsonb_build_object('error', 'MEMBER');
  end if;
  if (select count(*) from public.gym_self_joins where gym_id = g.gym_id and created_at > now() - interval '1 day') >= 30
     or (select count(*) from public.gym_self_joins where phone = ph and created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;
  if public._phone_proof(p_proof, 'join', true) is null then return jsonb_build_object('error', 'BAD_PROOF'); end if;

  block := jsonb_build_object(
    'v', 1, 'name', nm, 'gender', gender,
    'planId', pl->>'id', 'planName', pl->>'name', 'durationUnit', pl->>'durationUnit',
    'durationCount', (pl->>'durationCount')::int, 'priceP', (pl->>'priceP')::bigint,
    'joiningFeeP', (pl->>'joiningFeeP')::bigint, 'totalP', (pl->>'totalP')::bigint,
    'startsOn', to_char(d, 'YYYY-MM-DD'), 'pay', 'desk', 'paid', false, 'phoneChecked', true, 'lang', lang,
    'consents', jsonb_build_object('adultAt', now_ms, 'healthAt', now_ms, 'wording', '2026-11-14'),
    'at', now_ms);
  v := coalesce(g.crm_version, 0) + 1;

  -- An open enquiry with this number (newest first) gets the block; else a new enquiry.
  select * into prior from public.crm_records
   where gym_id = g.gym_id and kind = 'enquiry' and not deleted
     and coalesce(data->>'status', 'open') = 'open'
     and public._norm_phone(data->>'phone') = ph
   order by updated_at desc limit 1;
  if prior.id is not null then
    eid := prior.id;
    linked := true;
    update public.crm_records
       set data = prior.data || jsonb_build_object('selfJoin', block, 'followUpOn', to_char(today, 'YYYY-MM-DD'), 'updatedAt', now_ms),
           version = v, updated_at = now()
     where gym_id = g.gym_id and kind = 'enquiry' and id = eid;
  else
    eid := 'join-' || replace(gen_random_uuid()::text, '-', '');
    -- What an older admin app shows on the row (it does not read selfJoin).
    interest := format('Joined online: %s, starts %s. Pays at the desk.', pl->>'name', public._note_day(d));
    insert into public.crm_records(gym_id, kind, id, data, version)
      values (g.gym_id, 'enquiry', eid, jsonb_build_object(
                'id', eid, 'gymId', g.gym_id::text, 'name', nm, 'phone', '+91' || ph,
                'interest', left(interest, 200), 'followUpOn', to_char(today, 'YYYY-MM-DD'),
                'status', 'open', 'memberId', null, 'source', null, 'selfJoin', block,
                'createdAt', now_ms, 'updatedAt', now_ms), v);
  end if;
  update public.gyms set crm_version = v where gym_id = g.gym_id;
  insert into public.gym_self_joins(gym_id, enquiry_id, phone) values (g.gym_id, eid, ph);

  -- 0075: an instant alert for everyone at the gym (never the number or an amount).
  perform public._alert(g.gym_id, 'online_join', eid, 'online_join:' || eid || ':' || now_ms, 'all', true,
    format('%s asked to join your gym online (%s, from %s). Make them a member on Today.',
           public._alert_first_name(nm), left(pl->>'name', 60), public._note_day(d)),
    '/');

  return jsonb_build_object('ok', true, 'gymName', g.name, 'planName', pl->>'name', 'startsOn', to_char(d, 'YYYY-MM-DD'),
                            'totalP', (pl->>'totalP')::bigint, 'linked', linked);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public.self_join_preview(text) from public;
revoke all on function public.self_join_send(text, text, text, text, text, text, boolean, boolean, text, text) from public;
grant execute on function public.self_join_preview(text) to anon, authenticated;
grant execute on function public.self_join_send(text, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
