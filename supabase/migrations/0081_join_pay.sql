-- NOT APPLIED - needs the owner's yes ("No LIVE database changes without my yes"). Re-runnable. Apply after 0077 (it
-- replaces 0077's self_join_send) and 0061 (it checks the panel Worker's signature with 0061's secret).
-- Test: supabase/tests/0081_join_pay.sql (CI runs it after every migration; pasted into the SQL Editor it always ends
-- in an error and so changes nothing). 0077's own test still runs against the function replaced here.
--
-- 0081: pay online on the join page and the gym's web page (R-528, owner 14 Nov 2026: "The gym owners will be able to
-- accept payments on the member app, so similarly they can accept it on the registration page, right? It's just that
-- the admin user can enable or disable the payments on both the app or the web page.").
-- The payment itself is F79's (deploy/panel/pay.js, the gym's OWN payment-company account or its UPI ID; test mode
-- until "payments live"); nothing about money is kept on the gym server. This file only lets the panel Worker tie a
-- payment to the right gym and the right request:
--
-- CHANGED
--   self_join_send(...)  exactly 0077's, and its answer also carries enquiryId (the request's own enquiry, new or
--                        linked), so the payment request (D1 pay_requests kind 'join', ref = that id) belongs to it.
--                        The caller is the holder of the one-use number proof: it learns only its own request's id.
-- NEW
--   self_join_pay_gym(code, at, sig) -> {ok, gymId} | {error: 'BAD_SIG' | 'NO_GYM' | 'CLOSED'}
--                        Which gym a join code is, for the panel Worker ONLY: signed with 0061's secret
--                        ('sjpay.<CODE>.<at>', within 5 minutes), so nobody else can turn a gym code into a gym id.
--                        The Worker needs it to find the gym's payment account and the owner's switch (D1).
--
-- Before this is applied: the Worker gets "no such function" (PGRST202) or no enquiryId, and the page says
-- "Pay at the desk" exactly as today. Nothing else changes.
-- Undo: drop function public.self_join_pay_gym(text, bigint, text); re-run 0077's self_join_send (its answer then
--   has no enquiryId and online pay on the join page stops; requests already made stay).

set lock_timeout = '3s';

-- ------------------------------------------------------------------ the request (0077's, + enquiryId)
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

  -- 0081: + enquiryId, so the panel Worker can attach an online payment to THIS request (joinPay.js).
  return jsonb_build_object('ok', true, 'gymName', g.name, 'planName', pl->>'name', 'startsOn', to_char(d, 'YYYY-MM-DD'),
                            'totalP', (pl->>'totalP')::bigint, 'linked', linked, 'enquiryId', eid);
end $$;

-- ------------------------------------------------------------------ which gym a code is (the panel Worker only)
create or replace function public.self_join_pay_gym(p_code text, p_at bigint, p_sig text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g public.gyms; code text := upper(btrim(coalesce(p_code, ''))); now_s bigint := extract(epoch from now())::bigint;
begin
  if code !~ '^[A-Z0-9]{6}$' then return jsonb_build_object('error', 'NO_GYM'); end if;
  if p_at is null or abs(now_s - p_at) > 300
     or not public._phone_sig_ok('sjpay.' || code || '.' || p_at, p_sig) then
    return jsonb_build_object('error', 'BAD_SIG');
  end if;
  select * into g from public.gyms where join_code = code;
  if g.gym_id is null then return jsonb_build_object('error', 'NO_GYM'); end if;
  if public._self_join_closed(g) then return jsonb_build_object('error', 'CLOSED'); end if;
  return jsonb_build_object('ok', true, 'gymId', g.gym_id::text);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public.self_join_send(text, text, text, text, text, text, boolean, boolean, text, text) from public;
grant execute on function public.self_join_send(text, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;
revoke all on function public.self_join_pay_gym(text, bigint, text) from public;
grant execute on function public.self_join_pay_gym(text, bigint, text) to anon, authenticated;

notify pgrst, 'reload schema';
