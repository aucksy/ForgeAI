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
    'member_cancel_order','member_check_in','member_gym_plans','member_join','member_leave','member_me','member_membership','member_pay_me','member_messages',
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
    -- 0043: a member's photo taken at the desk (each checks an owner or desk key; only that gym's own members).
    'owner_member_photos','owner_save_member_photo','owner_remove_member_photo',
    -- 0044: pause / renew requests from the app (members check their member key; the desk its owner or desk key).
    'member_plan_requests','member_ask_plan_change','member_cancel_plan_request','member_saw_plan_requests',
    'owner_plan_requests','owner_decide_plan_request',
    -- 0045: workout reports the gym asks for (members check their member key; the desk its owner or desk key).
    'member_report_requests','member_answer_report_request','member_attach_report',
    'owner_report_requests','owner_request_report','owner_report_file',
    -- 0046: which pack the gym is on (an owner/desk key or a member key, checked by each; read only, no money fields).
    'owner_gym_pack','member_gym_pack',
    -- 0062: the gym's plan state for the owner's banner (an owner/desk key, checked by _owner_gym; read only).
    'owner_gym_state',
    -- 0048: typed check-in numbers the desk confirms (owner/desk key), and challenge winners the owner confirms (owners only).
    'owner_phone_links','owner_decide_phone_link','owner_confirm_challenge_reward',
    -- 0049: busy machines by day and hour (members check their member key and get only proven gym-level levels; the gym its owner or desk key, saving: owners only).
    'member_machine_busy','member_machine_push','owner_machine_setup','owner_save_machine_setup',
    -- 0050: trainer view (members check their member key and send or delete only their own summary; the gym: owner or a ticked trainer reads; ticking and assigning: owners only).
    'member_trainer_status','member_trainer_share','member_trainer_stop','member_trainer_help',
    'owner_trainer_members','owner_trainer_setup','owner_set_trainer','owner_assign_trainer',
    -- 0051: the gym's workout of the day (members check their member key; the gym its owner or desk key).
    'member_gym_wod','owner_gym_wods','owner_save_gym_wod','owner_clear_gym_wod',
    -- 0053: "Ask a trainer" and the gym's Progress (members check their member key and act on their own questions and summary only; the gym: owner or a ticked trainer, each seeing only what is theirs).
    'member_ask_choices','member_ask_trainer','member_questions','member_withdraw_question',
    'owner_questions','owner_question_count','owner_answer_question','member_trainer_share2','owner_member_progress',
    -- 0056: Bring a friend (a member key; the public invite page checks an invite code and writes only into that gym's enquiries; the gym its owner or desk key).
    'member_friend_invite','friend_invite_preview','friend_invite_send','owner_friend_summary',
    -- 0059: entry machines (each checks the owner or desk key first; adding and removing a machine: the owner only).
    'owner_entry_machines','owner_add_entry_machine','owner_remove_entry_machine','owner_set_machine_numbers','owner_queue_machine_commands',
    -- 0065: trainer pages and personal-training bookings (each checks the owner, desk or trainer key first; a trainer edits only their own page).
    'owner_trainer_schedule','owner_save_trainer_profile','owner_book_pt','owner_cancel_pt',
    -- 0069: Message your gym (members check their member key and act on their own threads only; the gym: owner or desk key, complaints for the owner only).
    'member_talk_unread','member_talk_list','member_talk_send','member_talk_reply','owner_talk_count','owner_talk_list','owner_talk_reply','owner_talk_done',
    -- 0075: the gym's alerts list (checks the key first: owner, desk or trainer; each sees only what they may, complaints for the owner only).
    'owner_alerts',
    -- 0076: alerts with the admin app closed (each checks the key first; a browser is saved for that sign-in only; the OWNER changes when the rest come).
    'owner_save_web_push','owner_clear_web_push','owner_web_push_on','owner_alert_settings','owner_save_alert_settings',
    -- 0077: Join online (the public page: a gym code for the preview; the request also needs a one-use signed 'join' proof, and writes only into that gym's enquiries).
    'self_join_preview','self_join_send',
    -- 0081: pay online on the join page (which gym a code is: the panel Worker's HMAC signature with 0061's secret only).
    'self_join_pay_gym',
    -- 0078: AI questions on the gym's credits (take: the Worker's HMAC signature over the key, then the member, owner or staff key; give back: a question id only the Worker holds, once, within 10 minutes; the counts: the OWNER key only).
    'ai_question_take','ai_visitor_question_take','ai_question_back','owner_ai_questions',
    -- 0080: the gym's web page. The editor: owner_gym_page checks an owner or desk key, owner_save_gym_page the OWNER
    -- key only (a desk key gets OWNER_ONLY). The public page: each checks the slug itself and answers only for a published
    -- page (terms ticked, not hidden by HQ, gym not paused); the question form has daily limits (40 per gym, 3 per
    -- number), the report form 50 per page; nothing returns a member, staff, money or the phone unless show_phone.
    'owner_gym_page','owner_save_gym_page','gym_page_public','gym_page_ask_send','gym_page_report_send',
    -- 0082: the page's photos. A slot: the OWNER key only (12 open, 60 a day). The two storage checks are called by the
    -- storage rules AS the uploader or reader (anon), like _photo_ticket_ok; each answers only yes or no for one file name.
    'owner_gym_page_photo_slot','_gym_page_photo_upload_ok','_gym_page_photo_read_ok',
    -- 0079: a person's job name on Staff & sign-in (checks the key first: the gym OWNER only; a desk key gets OWNER_ONLY).
    'owner_set_person_job',
    -- 0060: Pay MettleUp (each checks the key first: the gym OWNER only; a desk key gets OWNER_ONLY).
    'owner_pay_mettleup','owner_report_mettleup_payment',
    -- 0063: online buying (each checks the key first: the gym OWNER only; read only, the owner's own gym and receipts).
    'owner_billing','owner_receipt',
    -- 0061: sign-in codes by WhatsApp (the account check needs the Worker's HMAC signature; the PIN reset a one-use signed proof).
    'phone_code_has_account','staff_reset_pin_with_proof',
    -- 0068: find my gym by my proven number (a one-use signed 'member' proof; the link also needs the member key).
    'member_find_gyms','member_claim_phone',
    -- 0070: MettleUp Plus, the gym owner's switch (owner or desk key to read, the OWNER to change; members read their own gym's only).
    'owner_plus_lock','owner_save_plus_lock','member_plus_lock',
    -- 0071: the AI assistant's credits and task history (each checks the key first: the gym OWNER only).
    'owner_ai_wallet','owner_ai_task_save','owner_ai_spend','owner_ai_refund','owner_ai_tasks','owner_ai_status',
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
