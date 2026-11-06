-- Plan features + lapse states test (0062, billing step 1). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error, so
-- it changes nothing (the switch it turns on is undone with everything else):
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed.
-- Variable names never match a column name (a clash makes a query ambiguous).
do $$
declare
  g_pro uuid; g_starter uuid; g_trial uuid; g_grace uuid; g_basic uuid; g_ro uuid; g_life uuid;
  k_basic text := 'pf62-basic-owner-key'; k_ro text := 'pf62-ro-owner-key';
  r jsonb; err text; ok boolean;
  fails text := ''; checks int := 0;
begin
  -- Setup as HQ (the plan and dates are HQ's alone).
  perform set_config('forgeai.hq', 'on', true);
  insert into public.gyms(name, join_code) values ('PF62 Pro', 'PF62A1') returning gym_id into g_pro;
  insert into public.gyms(name, join_code) values ('PF62 Starter', 'PF62B1') returning gym_id into g_starter;
  insert into public.gyms(name, join_code) values ('PF62 Trial', 'PF62C1') returning gym_id into g_trial;
  insert into public.gyms(name, join_code) values ('PF62 Grace', 'PF62D1') returning gym_id into g_grace;
  insert into public.gyms(name, join_code) values ('PF62 Basic', 'PF62E1') returning gym_id into g_basic;
  insert into public.gyms(name, join_code) values ('PF62 ReadOnly', 'PF62F1') returning gym_id into g_ro;
  insert into public.gyms(name, join_code) values ('PF62 Life', 'PF62G1') returning gym_id into g_life;
  update public.gyms set trial_starts_at = now() - interval '200 days', trial_ends_at = now() - interval '110 days'
   where gym_id in (g_pro, g_starter, g_grace, g_basic, g_ro, g_life);
  update public.gyms set plan = 'pro', billing = 'monthly', paid_until = now() + interval '10 days' where gym_id = g_pro;
  update public.gyms set plan = 'starter', billing = 'monthly', paid_until = now() + interval '10 days' where gym_id = g_starter;
  update public.gyms set plan = 'pro', billing = 'monthly', paid_until = now() - interval '3 days' where gym_id = g_grace;
  update public.gyms set plan = 'pro', billing = 'monthly', paid_until = now() - interval '20 days' where gym_id = g_basic;
  update public.gyms set plan = 'pro', billing = 'monthly', paid_until = now() - interval '60 days' where gym_id = g_ro;
  update public.gyms set plan = 'pro', billing = 'lifetime', paid_until = null where gym_id = g_life;
  insert into public.gym_owner_keys(gym_id, key_hash) values (g_basic, public._hash_key(k_basic)), (g_ro, public._hash_key(k_ro));
  -- A member the basic gym already has (editing it stays allowed in basic mode).
  insert into public.crm_records(gym_id, kind, id, data, version) values (g_basic, 'member', 'pf62-m1', '{"name": "Old Member"}'::jsonb, 1);
  perform set_config('forgeai.hq', 'off', true);

  -- 1. The switch exists and is OFF.
  checks := checks + 1;
  if public._plan_gate_on() then fails := fails || ' 1:on'; end if;

  -- 2. The states, worked out from the dates.
  checks := checks + 1;
  if public.gym_state(g_pro) <> 'active' or public.gym_state(g_trial) <> 'active' or public.gym_state(g_life) <> 'active'
     or public.gym_state(g_grace) <> 'grace' or public.gym_state(g_basic) <> 'basic' or public.gym_state(g_ro) <> 'read_only' then
    fails := fails || ' 2:' || public.gym_state(g_pro) || public.gym_state(g_trial) || public.gym_state(g_life)
      || public.gym_state(g_grace) || public.gym_state(g_basic) || public.gym_state(g_ro);
  end if;
  -- Before its paid-until date the same gym was active.
  checks := checks + 1;
  if public.gym_state(g_ro, now() - interval '61 days') <> 'active' then fails := fails || ' 2b'; end if;
  -- The edges: 7 days of grace, then 30 days of basic.
  checks := checks + 1;
  if public.gym_state(g_ro, now() - interval '60 days' + interval '6 days') <> 'grace'
     or public.gym_state(g_ro, now() - interval '60 days' + interval '8 days') <> 'basic'
     or public.gym_state(g_ro, now() - interval '60 days' + interval '36 days') <> 'basic'
     or public.gym_state(g_ro, now() - interval '60 days' + interval '38 days') <> 'read_only' then
    fails := fails || ' 2c';
  end if;

  -- 3. Switch OFF: every feature for every gym, and every save works exactly as before.
  checks := checks + 1;
  if not public.gym_has_feature(g_starter, 'shop') or not public.gym_has_feature(g_ro, 'addMember')
     or not public.gym_has_feature(g_basic, 'branding') then
    fails := fails || ' 3a';
  end if;
  begin
    insert into public.shop_products(gym_id, name, price_p) values (g_starter, 'PF62 Shaker', 30000);
    insert into public.crm_records(gym_id, kind, id, data, version) values (g_ro, 'member', 'pf62-ro-new', '{}'::jsonb, 1);
    insert into public.crm_records(gym_id, kind, id, data, version) values (g_basic, 'member', 'pf62-b-new0', '{}'::jsonb, 1);
    update public.gyms set brand_accent = '#112233' where gym_id = g_starter;
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'none' then fails := fails || ' 3b:' || err; end if;
  r := public.owner_gym_state(k_ro);
  checks := checks + 1;
  if (r->>'gateOn')::boolean or r->>'state' <> 'read_only' or r->>'plan' <> 'pro' or r->>'endsAt' is null then
    fails := fails || ' 3c:' || r::text;
  end if;

  -- Switch ON for the rest (undone by the final error).
  update public.app_config set value = '{"on": true}'::jsonb where key = 'plan_gate';

  -- 4. The plan -> features table: Starter has no Pro extras, Pro and the trial have them all.
  checks := checks + 1;
  if public.gym_has_feature(g_starter, 'shop') or public.gym_has_feature(g_starter, 'branding')
     or not public.gym_has_feature(g_starter, 'checkin') or not public.gym_has_feature(g_starter, 'addMember')
     or not public.gym_has_feature(g_pro, 'trainerPlans') or not public.gym_has_feature(g_trial, 'yourNumbers')
     or not public.gym_has_feature(g_life, 'challenge') or not public.gym_has_feature(g_grace, 'shop') then
    fails := fails || ' 4';
  end if;
  -- Basic: desk basics only. Read-only: look and export only.
  checks := checks + 1;
  if not public.gym_has_feature(g_basic, 'checkin') or not public.gym_has_feature(g_basic, 'fees')
     or public.gym_has_feature(g_basic, 'addMember') or public.gym_has_feature(g_basic, 'shop')
     or public.gym_has_feature(g_ro, 'checkin') or not public.gym_has_feature(g_ro, 'export') then
    fails := fails || ' 4b';
  end if;

  -- 5. The server refuses a Pro extra for a Starter gym, and allows it for Pro.
  begin
    insert into public.shop_products(gym_id, name, price_p) values (g_starter, 'PF62 Tub', 30000);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PLAN_PRO_ONLY' then fails := fails || ' 5a:' || err; end if;
  begin
    insert into public.shop_products(gym_id, name, price_p) values (g_pro, 'PF62 Tub', 30000);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'none' then fails := fails || ' 5b:' || err; end if;
  begin
    update public.gyms set brand_accent = '#445566' where gym_id = g_starter;
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PLAN_PRO_ONLY' then fails := fails || ' 5c:' || err; end if;
  -- Clearing the look back to plain is always allowed; so is a gym update that does not touch the look.
  begin
    update public.gyms set brand_accent = null, brand_bg = null, brand_logo_url = null, brand_heading = 'normal' where gym_id = g_starter;
    update public.gyms set name = 'PF62 Starter Two' where gym_id = g_starter;
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'none' then fails := fails || ' 5d:' || err; end if;
  begin
    insert into public.crm_records(gym_id, kind, id, data, version) values (g_starter, 'workout_plan', 'pf62-wp', '{}'::jsonb, 1);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PLAN_PRO_ONLY' then fails := fails || ' 5e:' || err; end if;
  begin
    insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days)
      values (g_starter, 'PF62 Month', 'workouts', 12, current_date, current_date + 10, 0);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PLAN_PRO_ONLY' then fails := fails || ' 5f:' || err; end if;

  -- 6. Basic mode: check-in, fees and editing a member work; a new member and other records do not.
  begin
    insert into public.crm_records(gym_id, kind, id, data, version) values (g_basic, 'visit', 'pf62-v1', '{}'::jsonb, 2);
    insert into public.crm_records(gym_id, kind, id, data, version) values (g_basic, 'payment', 'pf62-p1', '{}'::jsonb, 2);
    insert into public.crm_records(gym_id, kind, id, data, version) values (g_basic, 'member', 'pf62-m1', '{"name": "Old Member 2"}'::jsonb, 2)
      on conflict (gym_id, kind, id) do update set data = excluded.data, version = 2;
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'none' then fails := fails || ' 6a:' || err; end if;
  begin
    insert into public.crm_records(gym_id, kind, id, data, version) values (g_basic, 'member', 'pf62-b-new', '{}'::jsonb, 2);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PLAN_NO_NEW_MEMBERS' then fails := fails || ' 6b:' || err; end if;
  begin
    insert into public.crm_records(gym_id, kind, id, data, version) values (g_basic, 'plan', 'pf62-plan', '{}'::jsonb, 2);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PLAN_BASIC' then fails := fails || ' 6c:' || err; end if;
  begin
    insert into public.shop_products(gym_id, name, price_p) values (g_basic, 'PF62 Tub', 30000);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PLAN_PRO_ONLY' then fails := fails || ' 6d:' || err; end if;

  -- 7. Read-only: nothing is saved, not even a check-in; nothing is deleted.
  begin
    insert into public.crm_records(gym_id, kind, id, data, version) values (g_ro, 'visit', 'pf62-v2', '{}'::jsonb, 2);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PLAN_READ_ONLY' then fails := fails || ' 7a:' || err; end if;
  begin
    insert into public.shop_products(gym_id, name, price_p) values (g_ro, 'PF62 Tub', 30000);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'PLAN_READ_ONLY' then fails := fails || ' 7b:' || err; end if;
  checks := checks + 1;
  if not exists (select 1 from public.crm_records where gym_id = g_ro and id = 'pf62-ro-new' and not deleted) then fails := fails || ' 7c'; end if;

  -- 8. Paying reopens everything at once (HQ moves paid_until, as apply_gym_payment does).
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set paid_until = now() + interval '30 days' where gym_id = g_ro;
  perform set_config('forgeai.hq', 'off', true);
  begin
    insert into public.crm_records(gym_id, kind, id, data, version) values (g_ro, 'visit', 'pf62-v3', '{}'::jsonb, 3);
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'none' or public.gym_state(g_ro) <> 'active' then fails := fails || ' 8:' || err; end if;

  -- 9. HQ's own actions pass whatever the state.
  perform set_config('forgeai.hq', 'on', true);
  begin
    insert into public.crm_records(gym_id, kind, id, data, version) values (g_basic, 'member', 'pf62-hq', '{}'::jsonb, 3);
    err := 'none';
  exception when others then err := sqlerrm; end;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1;
  if err <> 'none' then fails := fails || ' 9:' || err; end if;

  -- 10. The owner's state, for the banner: switch on, the dates; a wrong key is refused.
  r := public.owner_gym_state(k_basic);
  checks := checks + 1;
  if not (r->>'gateOn')::boolean or r->>'state' <> 'basic'
     or (r->>'graceUntil')::timestamptz <> (r->>'endsAt')::timestamptz + interval '7 days'
     or (r->>'basicUntil')::timestamptz <> (r->>'endsAt')::timestamptz + interval '37 days' then
    fails := fails || ' 10a:' || r::text;
  end if;
  begin
    perform public.owner_gym_state('pf62-no-such-key');
    err := 'none';
  exception when others then err := sqlerrm; end;
  checks := checks + 1;
  if err <> 'BAD_KEY' then fails := fails || ' 10b:' || err; end if;

  -- 11. The doors: the owner's read is callable (it checks the key); the helpers and the table are not.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_gym_state(text)', 'execute')
     or has_function_privilege('anon', 'public.gym_has_feature(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.gym_state(uuid, timestamptz)', 'execute')
     or has_table_privilege('anon', 'public.plan_features', 'select') then
    fails := fails || ' 11';
  end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
