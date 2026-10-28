-- Database safety check (15 Oct 2026, audit toolkit pick 6). Runs in CI on a throw-away local
-- Supabase after every migration is applied (scripts/ci/db_checks.sh). It can also be pasted into
-- the live SQL Editor: it ALWAYS ends in an error, so it changes nothing.
--   "RESULT PASS (n checks)" — everything is as it must be;
--   "RESULT FAIL: ..."        — what is wrong.
--
-- What it guards (the Supabase security advisor's lints, made into a gate that fails the build):
--   1. Row-level security is on for every table in public.
--   2. Every function in public has a fixed search_path (lint 0011).
--   3. The functions anyone can call WITHOUT signing in (anon) are exactly the list below. A new
--      one fails here until it is added on purpose (lint 0028). Each of them must check a key,
--      a code or a session itself.
--   4. The functions only a signed-in user can call are exactly the list below (lint 0029).
--   5. As anon and as a signed-in user with no gym, every table reads as empty (or is refused).
--   6. Gym A's owner key never reads or writes gym B's records; a member key is not an owner key.
do $$
declare
  -- _photo_ticket_ok (0018, C8-7): the storage upload policies call it AS the uploader (anon), so
  -- revoking it (0012) broke every logo and product-photo upload. It only answers yes/no for a
  -- 48-hex ticket folder.
  anon_ok text[] := array[
    '_photo_ticket_ok','auth_gym_id','auth_role','crm_pull','crm_push','demo_start_gym','gym_create_online','gym_preview',
    'member_cancel_order','member_check_in','member_gym_plans','member_join','member_leave','member_me','member_membership','member_messages',
    'member_orders','member_place_order','member_products','member_saw_messages','member_set_name',
    -- 0025: the workout offer (each checks a member key or a gym key itself).
    'member_join_offer','member_leave_offer','member_offer_days','member_offers',
    -- 0028: the gym owner's "ForgeAI access" list and "Let ForgeAI support look" (each checks an owner key).
    'owner_hq_access','owner_hq_end','owner_hq_grant',
    -- 0029: automatic reminders (owner/desk key, or a member key, checked by each).
    'member_auto_reminders','owner_auto_reminders','owner_save_auto_reminders',
    -- 0031: branches (each checks an owner or desk key itself; opening and adding: owners only).
    'owner_branches','owner_add_branch','owner_open_branch','owner_rename_group',
    'branch_find_visitor','branch_check_in_visitor','branch_visitors','branch_undo_visitor',
    -- 0033: the terms the gym accepted (each checks an owner or desk key; accepting: owners only).
    'owner_terms','owner_accept_terms',
    -- 0034: your own sign-in PIN (each checks a session key and acts only on that key's person).
    'staff_set_pin','staff_pin_status',
    -- 0035: measurements taken by the trainer and diet plans (owner/desk key, or a member key, checked by each).
    'owner_member_measurements','owner_save_measurement','owner_delete_measurement','member_measurements',
    'owner_diet_plans','owner_save_diet_plan','owner_withdraw_diet_plan','member_diet_plans',
    -- 0036: the gym's opening hours (owner/desk key, or a member key, checked by each; saving: owners only).
    'owner_gym_timings','owner_save_gym_timings','member_gym_timings',
    -- 0037: the leaderboard and the monthly challenge (a member key, or an owner/desk key, checked by each; changing: owners only).
    'member_board_push','member_board','owner_challenges','owner_save_challenge','owner_cancel_challenge','owner_board','owner_hide_on_board',
    -- 0038: this phone's push address for the gym's pop-ups (each checks a member key and acts on that member only).
    'member_save_push_token','member_clear_push_token',
    -- 0039: how busy the gym is now (checks a member key; answers only gym-level levels, no names).
    'member_gym_busy',
    -- 0040: a gym mate's profile (each checks a member key; sharing acts on that member only, reading only a same-gym mate who shares).
    'member_mate_share','member_mate_stop','member_mate_board','member_mate_profile',
    -- 0032: the free plan's switch (answers one config row, nothing else).
    'app_limits',
    'owner_add_person','owner_add_stock','owner_app_members','owner_delete_product','owner_go_online',
    'owner_gym','owner_make_signin_code','owner_messages','owner_offers','owner_orders','owner_people','owner_photo_ticket',
    'owner_products','owner_receipt_history','owner_remove_person','owner_rename_gym','owner_retire_key','owner_save_offer','owner_save_product',
    'owner_send_message','owner_set_brand','owner_set_order_status','owner_set_product_active',
    'owner_set_product_photo','owner_sign_out_person','owner_stop_offer','owner_undo_reward','owner_withdraw_message',
    'staff_give_reward','staff_key_status','staff_me','staff_sign_in',
    'staff_sign_out'];
  -- 0032: the member's own cloud copy and "Delete my account" (each acts on auth.uid() only).
  auth_only_ok text[] := array['create_gym','delete_my_cloud_data','join_gym_by_code',
    'member_account_delete','member_copy_count','member_copy_get','member_copy_put'];
  fails text := ''; checks int := 0; x text; n bigint; t record;
  ga uuid; gb uuid; ka text := 'sec-test-owner-a'; kb text := 'sec-test-owner-b'; km text := 'sec-test-member-a';
  r jsonb; v bigint;
begin
  -- 1. RLS on every table.
  for x in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
            where s.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity order by 1 loop
    fails := fails || ' 1:no RLS on ' || x;
  end loop;
  checks := checks + 1;

  -- 2. A fixed search_path on every function.
  for x in select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.prokind = 'f'
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
            order by 1 loop
    fails := fails || ' 2:no search_path on ' || x;
  end loop;
  checks := checks + 1;

  -- 3. Callable without signing in: exactly the list.
  for x in select distinct p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
              and not (p.proname = any(anon_ok)) order by 1 loop
    fails := fails || ' 3:anon can call ' || x || ' (add it to anon_ok only if it checks a key itself)';
  end loop;
  for x in select a from unnest(anon_ok) a where not exists (
             select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
              where s.nspname = 'public' and p.proname = a and has_function_privilege('anon', p.oid, 'execute')) loop
    fails := fails || ' 3:' || x || ' is no longer callable (remove it from anon_ok)';
  end loop;
  checks := checks + 1;

  -- 4. Callable only when signed in: exactly the list.
  for x in select distinct p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.prokind = 'f'
              and has_function_privilege('authenticated', p.oid, 'execute')
              and not has_function_privilege('anon', p.oid, 'execute')
              and not (p.proname = any(auth_only_ok)) order by 1 loop
    fails := fails || ' 4:signed-in users can call ' || x;
  end loop;
  checks := checks + 1;

  -- Two gyms with records, owner keys and a member, so the reads below have something to hide.
  insert into public.gyms(name, join_code) values ('Sec Gym A', 'SECTA1') returning gym_id into ga;
  insert into public.gyms(name, join_code) values ('Sec Gym B', 'SECTB1') returning gym_id into gb;
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(ka)), (gb, public._hash_key(kb));
  insert into public.gym_members(gym_id, name, phone, key_hash) values (ga, 'Member A', '9800000001', public._hash_key(km));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 'sec-a-1', '{"fullName":"Only A"}', 1),
    (gb, 'member', 'sec-b-1', '{"fullName":"Only B"}', 1);
  update public.gyms set crm_version = 1 where gym_id in (ga, gb);

  -- 5. Every table, read as anon and as a signed-in user who belongs to no gym.
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
            where s.nspname = 'public' and c.relkind in ('r','p') order by 1 loop
    foreach x in array array['anon','authenticated'] loop
      begin
        perform set_config('request.jwt.claims',
          case when x = 'anon' then '{"role":"anon"}' else '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000abcd"}' end, true);
        execute format('set local role %I', x);
        execute format('select count(*) from public.%I', t.relname) into n;
        reset role;
        if n > 0 then fails := fails || ' 5:' || x || ' reads ' || n || ' rows of ' || t.relname; end if;
      exception when insufficient_privilege then
        reset role;  -- refused outright: fine
      end;
    end loop;
  end loop;
  checks := checks + 1;

  -- 6a. Owner A pulls only gym A.
  r := public.crm_pull(ka, 0);
  checks := checks + 1;
  if r::text not like '%sec-a-1%' or r::text like '%sec-b-1%' then fails := fails || ' 6a:' || left(r::text, 200); end if;

  -- 6b. Owner A's write lands in gym A only.
  v := public.crm_push(ka, 1, '[{"k":"member","id":"sec-a-2","d":{"fullName":"Second A"}}]'::jsonb);
  select count(*) into n from public.crm_records where id = 'sec-a-2' and gym_id = gb;
  checks := checks + 1;
  if n <> 0 or v <> 2 or (select crm_version from public.gyms where gym_id = gb) <> 1 then fails := fails || ' 6b:v=' || v; end if;

  -- 6c. Owner B cannot overwrite gym A's row by naming its id: the row is written in gym B.
  perform public.crm_push(kb, 1, '[{"k":"member","id":"sec-a-1","d":{"fullName":"Hijack"}}]'::jsonb);
  checks := checks + 1;
  if (select data->>'fullName' from public.crm_records where gym_id = ga and id = 'sec-a-1') <> 'Only A' then
    fails := fails || ' 6c:gym A row changed'; end if;

  -- 6d. A member's key is not an owner key; a made-up key neither.
  foreach x in array array[km, 'no-such-key', ''] loop
    begin
      r := public.crm_pull(x, 0);
      fails := fails || ' 6d:key "' || x || '" pulled records';
    exception when others then null;  -- refused: fine
    end;
  end loop;
  checks := checks + 1;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
