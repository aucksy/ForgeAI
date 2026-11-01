-- Challenge rewards test (0047, F143). Runs in CI after every migration (scripts/ci/db_checks.sh: a
-- throw-away local Supabase applies every migration, then each test must end with "RESULT PASS"). It can
-- also be pasted into the SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

-- A statement's result as text: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t47_try(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t47_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- One challenge's winners as the admin app reads them: "name state/reason/days/newEnd, ..." (reward null: "name -").
create or replace function pg_temp.t47_winners(p_key text, p_id uuid) returns text
  language sql as $$
  select coalesce(string_agg((h->>'name') || ' ' ||
           case when h->'reward' = 'null'::jsonb or h->'reward' is null then '-'
                else (h->'reward'->>'state') || '/' || coalesce(h->'reward'->>'reason', '-') || '/' || (h->'reward'->>'days')
                     || '/' || coalesce(h->'reward'->>'newEnd', '-') end, ', ' order by h->>'name'), '')
    from jsonb_array_elements(public.owner_challenges(p_key)->'challenges') c, jsonb_array_elements(c->'hitters') h
   where c->>'id' = p_id::text
$$;

do $$
declare
  ga uuid; gb uuid;
  kok text := 't47-owner-a'; kob text := 't47-owner-b';
  ka text := 't47-m-asha'; kb text := 't47-m-bilal'; kc text := 't47-m-chand'; kd text := 't47-m-dev';
  ke text := 't47-m-esha'; kf text := 't47-m-farah';
  ma uuid; mb uuid; mc uuid; md uuid; me uuid; mf uuid;
  td date := (now() at time zone 'Asia/Kolkata')::date;
  fails text := ''; checks int := 0; r jsonb; cid uuid; c0 uuid; cold uuid; cb uuid; v0 bigint; n int;
  end_a text := to_char(td + 10, 'YYYY-MM-DD'); end_a7 text := to_char(td + 17, 'YYYY-MM-DD');
begin
  insert into public.gyms(name, join_code, crm_version) values ('T47 Gym', 'T47GYA', 5) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T47 Paused', 'T47GYB', 1) returning gym_id into gb;
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(kok)), (gb, public._hash_key(kob));

  -- Gym A. Asha: on the list with a running plan. Bilal: on the list, his plan ended. Chand: no number
  -- matched at a check-in. Dev: did not reach the goal.
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash, joined_at) values
    (ga, 'Asha Verma', '+919829047101', public._hash_key(ka), now() - interval '30 days') returning member_id into ma;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash, joined_at) values
    (ga, 'Bilal Khan', '+919829047102', public._hash_key(kb), now() - interval '30 days') returning member_id into mb;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash, joined_at) values
    (ga, 'Chand Rao', null, public._hash_key(kc), now() - interval '30 days') returning member_id into mc;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash, joined_at) values
    (ga, 'Dev Singh', '+919829047104', public._hash_key(kd), now() - interval '30 days') returning member_id into md;
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"98290 47101","archived":false,"createdAt":1}', 1),
    (ga, 'member', 'm-bilal', '{"fullName":"Bilal Khan","phone":"9829047102","archived":false,"createdAt":2}', 1),
    (ga, 'member', 'm-dev', '{"fullName":"Dev Singh","phone":"9829047104","archived":false,"createdAt":3}', 1),
    (ga, 'membership', 'ms-a', jsonb_build_object('memberId','m-asha','planName','Monthly','startsOn', to_char(td - 20, 'YYYY-MM-DD'),
       'endsOn', end_a, 'cancelled', false, 'notes', 'Paid cash'), 1),
    (ga, 'membership', 'ms-a-pt', jsonb_build_object('memberId','m-asha','planName','PT 12','startsOn', to_char(td - 5, 'YYYY-MM-DD'),
       'endsOn', to_char(td + 40, 'YYYY-MM-DD'), 'cancelled', false, 'ptSessions', 12), 1),
    (ga, 'membership', 'ms-b', jsonb_build_object('memberId','m-bilal','planName','Monthly','startsOn', to_char(td - 40, 'YYYY-MM-DD'),
       'endsOn', to_char(td - 1, 'YYYY-MM-DD'), 'cancelled', false), 1);

  -- A challenge that ended yesterday: goal 2 workouts, 7 free days. Asha, Bilal and Chand reach it.
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days)
    values (ga, 'October push', 'workouts', 2, td - 14, td - 1, 7) returning id into cid;
  insert into public.gym_member_days(gym_id, member_id, day, workouts, kg) values
    (ga, ma, td - 3, 3, 100), (ga, mb, td - 4, 2, 100), (ga, mc, td - 5, 2, 100), (ga, md, td - 5, 1, 100);

  -- 1. Nothing is given before the challenge's results are kept.
  checks := checks + 1; fails := fails || pg_temp.t47_is('1before',
    (select data->>'endsOn' from public.crm_records where gym_id = ga and id = 'ms-a'), end_a);

  -- 2. The first owner read keeps the results and hands out the rewards.
  r := public.owner_challenges(kok);
  checks := checks + 1; fails := fails || pg_temp.t47_is('2auto', r->>'autoRewards', 'true');
  checks := checks + 1; fails := fails || pg_temp.t47_is('2winners', pg_temp.t47_winners(kok, cid),
    'Asha Verma added/-/7/' || end_a7 || ', Bilal Khan by_hand/no_plan/7/-, Chand Rao by_hand/no_match/7/-');
  checks := checks + 1; fails := fails || pg_temp.t47_is('2plan',
    (select (data->>'endsOn') || ' | ' || (data->>'notes') || ' | ' || version from public.crm_records where gym_id = ga and id = 'ms-a'),
    end_a7 || ' | Paid cash' || E'\n' || '+7 days (Reward - Gym challenge): ' || end_a || ' -> ' || end_a7 || ' | 6');
  checks := checks + 1; fails := fails || pg_temp.t47_is('2version', (select crm_version::text from public.gyms where gym_id = ga), '6');
  checks := checks + 1; fails := fails || pg_temp.t47_is('2ptUntouched',
    (select data->>'endsOn' from public.crm_records where gym_id = ga and id = 'ms-a-pt'), to_char(td + 40, 'YYYY-MM-DD'));
  checks := checks + 1; fails := fails || pg_temp.t47_is('2endedUntouched',
    (select data->>'endsOn' from public.crm_records where gym_id = ga and id = 'ms-b'), to_char(td - 1, 'YYYY-MM-DD'));
  checks := checks + 1; fails := fails || pg_temp.t47_is('2kept',
    (select (given_at is not null)::text || '/' || given_membership_id || '/' || old_end || '/' || new_end
       from public.gym_challenge_hits where challenge_id = cid and member_id = ma),
    'true/ms-a/' || end_a || '/' || end_a7);
  checks := checks + 1; fails := fails || pg_temp.t47_is('2byHandNotGiven',
    (select count(*)::text from public.gym_challenge_hits where challenge_id = cid and reward_state = 'by_hand' and given_at is null), '2');

  -- 3. The messages: one to Asha (days added), one to Bilal and Chand (ask at the desk); none to Dev.
  checks := checks + 1; fails := fails || pg_temp.t47_is('3count', (select count(*)::text from public.gym_messages where gym_id = ga), '2');
  checks := checks + 1; fails := fails || pg_temp.t47_is('3asha',
    (select string_agg((m->>'title') || ': ' || (m->>'body'), ' # ') from jsonb_array_elements(public.member_messages(ka)) m),
    'You won the gym challenge: You reached the goal in the gym challenge "October push". 7 free days were added to your membership.');
  checks := checks + 1; fails := fails || pg_temp.t47_is('3bilal',
    (select string_agg(m->>'body', ' # ') from jsonb_array_elements(public.member_messages(kb)) m),
    'You reached the goal in the gym challenge "October push". You won 7 free days. Ask at the front desk to add them to your membership.');
  checks := checks + 1; fails := fails || pg_temp.t47_is('3chand', (select jsonb_array_length(public.member_messages(kc))::text), '1');
  checks := checks + 1; fails := fails || pg_temp.t47_is('3dev', (select jsonb_array_length(public.member_messages(kd))::text), '0');
  checks := checks + 1; fails := fails || pg_temp.t47_is('3recipients',
    (select string_agg(recipients::text || '/' || to_group::text, ',' order by recipients) from public.gym_messages where gym_id = ga), '1/true,2/true');

  -- 4. Once only: more reads (owner and member) change nothing.
  perform public.owner_challenges(kok);
  perform public.member_board(ka);
  perform public.member_board(kb);
  perform public._challenge_rewards(cid);
  perform public._challenge_results(cid);
  checks := checks + 1; fails := fails || pg_temp.t47_is('4once',
    (select data->>'endsOn' from public.crm_records where gym_id = ga and id = 'ms-a') || '/' ||
    (select crm_version::text from public.gyms where gym_id = ga) || '/' ||
    (select count(*)::text from public.gym_messages where gym_id = ga), end_a7 || '/6/2');
  checks := checks + 1; fails := fails || pg_temp.t47_is('4noPending',
    (select count(*)::text from public.gym_challenge_hits where reward_state = 'pending' and challenge_id = cid), '0');

  -- 5. A challenge with no free days: kept as 'none', nothing given, no message.
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days)
    values (ga, 'Just for fun', 'workouts', 2, td - 30, td - 16, 0) returning id into c0;
  insert into public.gym_member_days(gym_id, member_id, day, workouts, kg) values (ga, ma, td - 20, 3, 100);
  perform public.owner_challenges(kok);
  checks := checks + 1; fails := fails || pg_temp.t47_is('5none', pg_temp.t47_winners(kok, c0), 'Asha Verma none/-/0/-');
  checks := checks + 1; fails := fails || pg_temp.t47_is('5quiet',
    (select count(*)::text from public.gym_messages where gym_id = ga) || '/' || (select data->>'endsOn' from public.crm_records where gym_id = ga and id = 'ms-a'),
    '2/' || end_a7);

  -- 6. Results kept before 0047 (reward_state null) are never touched: the owner may have given them by hand.
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days, results_at, entrants)
    values (ga, 'September', 'workouts', 2, td - 60, td - 50, 5, now() - interval '40 days', 1) returning id into cold;
  insert into public.gym_challenge_hits(challenge_id, member_id, name, phone, value) values (cold, ma, 'Asha Verma', null, 4);
  perform public.owner_challenges(kok);
  checks := checks + 1; fails := fails || pg_temp.t47_is('6old', pg_temp.t47_winners(kok, cold), 'Asha Verma -');
  checks := checks + 1; fails := fails || pg_temp.t47_is('6oldUntouched',
    (select data->>'endsOn' from public.crm_records where gym_id = ga and id = 'ms-a'), end_a7);

  -- 7. A paused (suspended) gym: kept as pending, nothing given, no message; given once it is back on.
  --    Farah left the gym while it was paused: by hand ('left'), no message.
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash, joined_at) values
    (gb, 'Esha Nair', '+919829047105', public._hash_key(ke), now() - interval '30 days') returning member_id into me;
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash, joined_at) values
    (gb, 'Farah Ali', '+919829047106', public._hash_key(kf), now() - interval '30 days') returning member_id into mf;
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gb, 'member', 'm-esha', '{"fullName":"Esha Nair","phone":"9829047105","archived":false,"createdAt":1}', 1),
    (gb, 'member', 'm-farah', '{"fullName":"Farah Ali","phone":"9829047106","archived":false,"createdAt":2}', 1),
    (gb, 'membership', 'ms-e', jsonb_build_object('memberId','m-esha','planName','Monthly','startsOn', to_char(td - 2, 'YYYY-MM-DD'),
       'endsOn', to_char(td + 28, 'YYYY-MM-DD'), 'cancelled', false), 1),
    (gb, 'membership', 'ms-f', jsonb_build_object('memberId','m-farah','planName','Monthly','startsOn', to_char(td - 2, 'YYYY-MM-DD'),
       'endsOn', to_char(td + 28, 'YYYY-MM-DD'), 'cancelled', false), 1);
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days)
    values (gb, 'One day', 'workouts', 2, td - 8, td - 1, 1) returning id into cb;
  insert into public.gym_member_days(gym_id, member_id, day, workouts, kg) values (gb, me, td - 3, 2, 10), (gb, mf, td - 3, 2, 10);
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gb;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1; fails := fails || pg_temp.t47_is('7pausedRead', pg_temp.t47_try(format('select public.owner_challenges(%L)', kob)), 'ok');
  checks := checks + 1; fails := fails || pg_temp.t47_is('7pending', pg_temp.t47_winners(kob, cb), 'Esha Nair pending/-/1/-, Farah Ali pending/-/1/-');
  checks := checks + 1; fails := fails || pg_temp.t47_is('7nothing',
    (select data->>'endsOn' from public.crm_records where gym_id = gb and id = 'ms-e') || '/' ||
    (select count(*)::text from public.gym_messages where gym_id = gb) || '/' || coalesce(current_setting('forgeai.hq', true), 'off'),
    to_char(td + 28, 'YYYY-MM-DD') || '/0/off');
  perform set_config('forgeai.hq', 'on', true);
  update public.gym_members set left_at = now() where member_id = mf;
  update public.gyms set status = 'active' where gym_id = gb;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1; fails := fails || pg_temp.t47_is('7backOn', pg_temp.t47_winners(kob, cb),
    'Esha Nair added/-/1/' || to_char(td + 29, 'YYYY-MM-DD') || ', Farah Ali by_hand/left/1/-');
  checks := checks + 1; fails := fails || pg_temp.t47_is('7oneMessage',
    (select string_agg(body || ' [' || recipients || ']', ' # ') from public.gym_messages where gym_id = gb),
    'You reached the goal in the gym challenge "One day". 1 free day was added to your membership. [1]');
  checks := checks + 1; fails := fails || pg_temp.t47_is('7farahUntouched',
    (select data->>'endsOn' from public.crm_records where gym_id = gb and id = 'ms-f'), to_char(td + 28, 'YYYY-MM-DD'));

  -- 8. Gym A's key never sees gym B's challenge; a running challenge has no reward yet.
  checks := checks + 1; fails := fails || pg_temp.t47_is('8otherGym', pg_temp.t47_winners(kok, cb), '');
  insert into public.gym_challenges(gym_id, title, measure, goal, starts_on, ends_on, prize_days)
    values (ga, 'Running', 'workouts', 2, td - 3, td + 10, 7) returning id into c0;
  checks := checks + 1; fails := fails || pg_temp.t47_is('8running', pg_temp.t47_winners(kok, c0), 'Asha Verma -');

  -- 9. Nobody calls the helper from outside; the table stays closed.
  checks := checks + 1;
  if has_function_privilege('anon', 'public._challenge_rewards(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._challenge_rewards(uuid)', 'execute')
     or has_table_privilege('anon', 'public.gym_challenge_hits', 'select')
     or has_table_privilege('authenticated', 'public.gym_challenge_hits', 'update') then fails := fails || ' 9grants'; end if;
  checks := checks + 1; fails := fails || pg_temp.t47_is('9badKey', pg_temp.t47_try(format('select public.owner_challenges(%L)', 'no-such-key')), 'BAD_KEY');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
