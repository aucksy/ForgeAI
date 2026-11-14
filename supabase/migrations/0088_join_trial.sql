-- NOT LIVE — needs the owner's yes
-- Re-runnable. Apply after 0081 (it replaces 0081's self_join_send, which replaced 0077's) and 0077 (it replaces 0077's
-- self_join_preview and adds a column to 0077's gym_self_joins). 0075 (_alert) and 0054 (_note_day) are used as before.
-- Test: supabase/tests/0088_join_trial.sql (CI runs it after every migration; pasted into the SQL Editor it always ends
-- in an error and so changes nothing). 0077's and 0081's own tests still run against the functions replaced here.
--
-- 0088: F210 a free trial when joining online (R-521, owner 14 Nov 2026: "let them also enable or disable a trial for
-- the registration. So the users may be able to just sign up for a 3 day, 7 day trial, the admin user can change that
-- value"). The owner switches it on in the admin app (Settings -> Member app -> "Free trial for new people": Off, 1,
-- 3 or 7 days). The setting is kept on the gym's details record (crm_records kind 'gym', key joinTrialDays), the way
-- 0056 keeps friendRewardDays: no new table for it, and it travels with the gym's records like every other detail.
-- A visitor on the gym's join link (app.mettleup.fit/m/<CODE>, public/join-online.html) then sees "Try free for 3 days"
-- above the plans. The request is the SAME request as a plan (one path: self_join_send, the same number proof, the
-- same limits, the same Enquiries record and the same alert), with plan '_trial' instead of a plan id. Today's
-- "Joined online" shows "Free trial: can visit until <day>", and "Make member" opens the usual Add member and Sell
-- membership (the desk picks the plan then). The trial person is NOT a member: the desk lets them in until that day.
-- The trial FEE (R-524, the owner's pick B) is not built here: it needs online payments, which are held (JOIN_PAY).
--
-- CHANGED
--   gym_self_joins           + column trial (one free trial per number per gym, ever).
--   self_join_preview(code)  exactly 0077's, and an open gym's answer always carries `trial`: {days, feeP: 0} when the
--                            owner switched it on, else null. The key itself tells the admin app this file is applied.
--   self_join_send(...)      exactly 0081's for a plan. With p_plan = '_trial':
--     -> {ok, gymName, startsOn, totalP: 0, linked, enquiryId, trial: {days, endsOn}}
--      | the same errors as before, and 'TRIAL_OFF' (the owner switched trials off) | 'TRIAL_USED' (this number already
--        had a free trial at this gym).
--     The selfJoin block on the enquiry gets trial: {days, endsOn: 'YYYY-MM-DD', feeP: 0}, planId '' and planName ''
--     (so an older admin app, which needs a plan id, keeps it in Enquiries only, with its "Free trial online" line).
--     endsOn = start day + days - 1: a 3-day trial from 20 Nov is 20, 21 and 22 Nov.
-- NEW
--   _self_join_trial_days(gym)  the owner's days (1, 3 or 7), or null when off. Private (no grants).
--
-- Before this is applied: the preview has no `trial` key, so the admin app shows no trial setting and the join page
-- shows no trial; '_trial' is not a plan, so a send with it gets BAD_PLAN. Nothing else changes.
-- Undo: re-run 0077's self_join_preview and 0081's self_join_send; drop function public._self_join_trial_days(uuid);
--   alter table public.gym_self_joins drop column trial. Trial requests already made stay (ordinary enquiry records).

set lock_timeout = '3s';

-- ------------------------------------------------------------------ one free trial per number per gym
alter table public.gym_self_joins add column if not exists trial boolean not null default false;
create index if not exists gym_self_joins_trial on public.gym_self_joins(gym_id, phone) where trial;

-- ------------------------------------------------------------------ the owner's setting (private)
-- The days the owner set on the gym's details record (1, 3 or 7), or null when it is off or anything else.
create or replace function public._self_join_trial_days(p_gym uuid) returns int
  language sql stable security definer set search_path = public as $$
  select case when x in ('1', '3', '7') then x::int end
    from (select btrim(coalesce(data->>'joinTrialDays', '')) as x
            from public.crm_records
           where gym_id = p_gym and kind = 'gym' and not deleted
           order by updated_at desc
           limit 1) d
$$;
revoke all on function public._self_join_trial_days(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ the page's first look (0077's, + trial)
create or replace function public.self_join_preview(p_code text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g public.gyms; today date := public._ist_today(); days int;
begin
  select * into g from public.gyms where join_code = upper(btrim(coalesce(p_code, '')));
  if g.gym_id is null then return null; end if;
  if public._self_join_closed(g) then
    return jsonb_build_object('gymName', g.name, 'joinCode', g.join_code, 'brand', public._brand_json(g), 'closed', true);
  end if;
  days := public._self_join_trial_days(g.gym_id);
  return jsonb_build_object('gymName', g.name, 'joinCode', g.join_code, 'brand', public._brand_json(g), 'closed', false,
                            'today', to_char(today, 'YYYY-MM-DD'), 'lastDay', to_char(today + 30, 'YYYY-MM-DD'),
                            'plans', public._self_join_plans(g.gym_id),
                            -- 0088: always the key for an open gym (null = off), so the admin app can tell 0088 is in.
                            'trial', case when days is null then null else jsonb_build_object('days', days, 'feeP', 0) end);
end $$;

-- ------------------------------------------------------------------ the request (0081's, + the free trial)
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
    then format('%s started a free %s-day trial online (%s to %s). Let them in until %s, and make them a member on Today when they join.',
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
revoke all on function public.self_join_preview(text) from public;
revoke all on function public.self_join_send(text, text, text, text, text, text, boolean, boolean, text, text) from public;
grant execute on function public.self_join_preview(text) to anon, authenticated;
grant execute on function public.self_join_send(text, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
