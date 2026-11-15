-- APPLIED LIVE 15 Nov 2026 (owner: "yes to 0089 and 0090"); live test 0089 PASS 57. Re-runnable. Apply after 0088 (it replaces 0088's self_join_send).
-- Test: supabase/tests/0089_trial_alert_words.sql (CI runs it after every migration; pasted into the SQL Editor it always
-- ends in an error and so changes nothing). 0077's, 0081's and 0088's own tests still run against this function.
--
-- 0089: F210 free trial, the gym's alert in the words the owner approved (15 Nov 2026, "yes to the trial words"):
--   "{name} started a free {n}-day trial online, from {from} to {to}. Please let them in until {to}. If they join, make
--    them a member from Today."
-- The live server (0088) still writes the old line "{name} started a free {n}-day trial online ({from} to {to}). Let them
-- in until {to}, and make them a member on Today when they join." The admin app (apps/dashboard/src/crm/logic/
-- gymAlerts.ts trialAlertWords) and HQ's push (deploy/hq/panelPush.js trialAlertWords) already show the old line in the
-- new words, so nothing waits for this file: it only lets those rewrites be removed one day.
--
-- CHANGED
--   self_join_send(...)  exactly 0088's; only the trial alert line's words. Nothing else (answers, errors, records).
-- Undo: re-run 0088's self_join_send.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ the request (exactly 0088's, the trial alert line in the new words)
create or replace function public.self_join_send(p_code text, p_name text, p_proof text, p_gender text, p_plan text,
                                                 p_start text, p_adult boolean, p_health boolean, p_lang text,
                                                 p_website text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.gyms; nm text; ph text; pl jsonb; d date; today date := public._ist_today();
  gender text; lang text; now_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
  prior public.crm_records; eid text; v bigint; block jsonb; linked boolean := false; interest text;
  is_trial boolean := coalesce(p_plan = '_trial', false); days int; d_end date; alert_line text;
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
  if is_trial then
    if public._self_join_trial_days(g.gym_id) is null then return jsonb_build_object('error', 'TRIAL_OFF'); end if;
  else
    select x into pl from jsonb_array_elements(public._self_join_plans(g.gym_id)) x where x->>'id' = p_plan limit 1;
    if pl is null then return jsonb_build_object('error', 'BAD_PLAN'); end if;
  end if;
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
  if is_trial then
    -- Read again under the lock: the owner may have switched it off a moment ago.
    days := public._self_join_trial_days(g.gym_id);
    if days is null then return jsonb_build_object('error', 'TRIAL_OFF'); end if;
    if exists (select 1 from public.gym_self_joins where gym_id = g.gym_id and phone = ph and trial) then
      return jsonb_build_object('error', 'TRIAL_USED');
    end if;
    d_end := d + days - 1;
  end if;
  if public._phone_proof(p_proof, 'join', true) is null then return jsonb_build_object('error', 'BAD_PROOF'); end if;

  if is_trial then
    -- No plan and no money: the desk picks the plan when they join. planId '' keeps it off an older admin app's Today.
    block := jsonb_build_object(
      'v', 1, 'name', nm, 'gender', gender,
      'planId', '', 'planName', '', 'durationUnit', 'day', 'durationCount', days,
      'priceP', 0, 'joiningFeeP', 0, 'totalP', 0,
      'startsOn', to_char(d, 'YYYY-MM-DD'), 'pay', 'desk', 'paid', false, 'phoneChecked', true, 'lang', lang,
      'consents', jsonb_build_object('adultAt', now_ms, 'healthAt', now_ms, 'wording', '2026-11-14'),
      'at', now_ms,
      'trial', jsonb_build_object('days', days, 'endsOn', to_char(d_end, 'YYYY-MM-DD'), 'feeP', 0));
  else
    block := jsonb_build_object(
      'v', 1, 'name', nm, 'gender', gender,
      'planId', pl->>'id', 'planName', pl->>'name', 'durationUnit', pl->>'durationUnit',
      'durationCount', (pl->>'durationCount')::int, 'priceP', (pl->>'priceP')::bigint,
      'joiningFeeP', (pl->>'joiningFeeP')::bigint, 'totalP', (pl->>'totalP')::bigint,
      'startsOn', to_char(d, 'YYYY-MM-DD'), 'pay', 'desk', 'paid', false, 'phoneChecked', true, 'lang', lang,
      'consents', jsonb_build_object('adultAt', now_ms, 'healthAt', now_ms, 'wording', '2026-11-14'),
      'at', now_ms);
  end if;
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
    interest := case when is_trial
      then format('Free trial online: %s %s, %s to %s. Not a member yet.', days, case when days = 1 then 'day' else 'days' end,
                  public._note_day(d), public._note_day(d_end))
      else format('Joined online: %s, starts %s. Pays at the desk.', pl->>'name', public._note_day(d)) end;
    insert into public.crm_records(gym_id, kind, id, data, version)
      values (g.gym_id, 'enquiry', eid, jsonb_build_object(
                'id', eid, 'gymId', g.gym_id::text, 'name', nm, 'phone', '+91' || ph,
                'interest', left(interest, 200), 'followUpOn', to_char(today, 'YYYY-MM-DD'),
                'status', 'open', 'memberId', null, 'source', null, 'selfJoin', block,
                'createdAt', now_ms, 'updatedAt', now_ms), v);
  end if;
  update public.gyms set crm_version = v where gym_id = g.gym_id;
  insert into public.gym_self_joins(gym_id, enquiry_id, phone, trial) values (g.gym_id, eid, ph, is_trial);

  -- 0075: an instant alert for everyone at the gym (never the number or an amount).
  alert_line := case when is_trial
    then format('%s started a free %s-day trial online, from %s to %s. Please let them in until %s. If they join, make them a member from Today.',
                public._alert_first_name(nm), days, public._note_day(d), public._note_day(d_end), public._note_day(d_end))
    else format('%s asked to join your gym online (%s, from %s). Make them a member on Today.',
                public._alert_first_name(nm), left(pl->>'name', 60), public._note_day(d)) end;
  perform public._alert(g.gym_id, 'online_join', eid, 'online_join:' || eid || ':' || now_ms, 'all', true, alert_line, '/');

  if is_trial then
    return jsonb_build_object('ok', true, 'gymName', g.name, 'startsOn', to_char(d, 'YYYY-MM-DD'), 'totalP', 0,
                              'linked', linked, 'enquiryId', eid,
                              'trial', jsonb_build_object('days', days, 'endsOn', to_char(d_end, 'YYYY-MM-DD')));
  end if;
  -- 0081: + enquiryId, so the panel Worker can attach an online payment to THIS request (joinPay.js).
  return jsonb_build_object('ok', true, 'gymName', g.name, 'planName', pl->>'name', 'startsOn', to_char(d, 'YYYY-MM-DD'),
                            'totalP', (pl->>'totalP')::bigint, 'linked', linked, 'enquiryId', eid);
end $$;

-- ------------------------------------------------------------------ grants (as 0077 and 0081)
revoke all on function public.self_join_send(text, text, text, text, text, text, boolean, boolean, text, text) from public;
grant execute on function public.self_join_send(text, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
