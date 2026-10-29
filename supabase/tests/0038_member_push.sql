-- Push to the phone test (0038). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

create or replace function pg_temp.t38_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t38_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid; s_owner uuid;
  kop text := 't38-owner-session';
  ka text := 't38-member-a'; kb text := 't38-member-b'; kc text := 't38-member-c'; kz text := 't38-member-z';
  ma uuid; mb uuid; mc uuid; mz uuid;
  ta text := 't38-token-aaaaaaaaaaaaaaaaaaaa'; tb text := 't38-token-bbbbbbbbbbbbbbbbbbbb';
  tc text := 't38-token-cccccccccccccccccccc'; tz text := 't38-token-zzzzzzzzzzzzzzzzzzzz';
  fails text := ''; checks int := 0; r jsonb; msg jsonb; n int; i int; seen text[] := '{}';
begin
  -- Real jobs (live SQL Editor) never get in the way: finished for this test only (undone at the end).
  update public.push_jobs set done_at = now() where done_at is null;

  insert into public.gyms(name, join_code, crm_version) values ('T38 Gym', 'T38GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T38 Other', 'T38GYB', 1) returning gym_id into gb;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner', '9876500381', 'owner') returning staff_id into s_owner;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop));
  insert into public.gym_members(gym_id, name, key_hash) values (gid, 'Asha', public._hash_key(ka)) returning member_id into ma;
  insert into public.gym_members(gym_id, name, key_hash) values (gid, 'Bina', public._hash_key(kb)) returning member_id into mb;
  insert into public.gym_members(gym_id, name, key_hash) values (gid, 'Chetan', public._hash_key(kc)) returning member_id into mc;
  insert into public.gym_members(gym_id, name, key_hash) values (gb, 'Zoya', public._hash_key(kz)) returning member_id into mz;

  -- 1. A member saves this phone's address; the same again only refreshes it. Bad ones are refused.
  checks := checks + 1; fails := fails || pg_temp.t38_is('1save', public.member_save_push_token(ka, ta)->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t38_is('1again', public.member_save_push_token(ka, ta, 'android')->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t38_is('1one', (select count(*) from public.member_push_tokens where token = ta)::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t38_is('1short', pg_temp.t38_run(format('select public.member_save_push_token(%L, %L)', ka, 'short')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t38_is('1chars', pg_temp.t38_run(format('select public.member_save_push_token(%L, %L)', ka, 'bad token with spaces 1234567890')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t38_is('1platform', pg_temp.t38_run(format('select public.member_save_push_token(%L, %L, %L)', ka, tb, 'web')), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t38_is('1key', pg_temp.t38_run(format('select public.member_save_push_token(%L, %L)', 'no-such-key', tb)), 'BAD_KEY');

  -- 2. One row per address: a phone that moves to another member moves its row.
  perform public.member_save_push_token(ka, tb);
  perform public.member_save_push_token(kb, tb);
  checks := checks + 1; fails := fails || pg_temp.t38_is('2moved', (select member_id::text from public.member_push_tokens where token = tb), mb::text);
  perform public.member_save_push_token(kc, tc);
  perform public.member_save_push_token(kz, tz);
  checks := checks + 1; fails := fails || pg_temp.t38_is('2gym', (select gym_id::text from public.member_push_tokens where token = tz), gb::text);

  -- 3. At most 5 phones per member: the oldest goes.
  for i in 1..6 loop
    perform public.member_save_push_token(kc, 't38-extra-' || i || '-xxxxxxxxxxxxxxxx');
    update public.member_push_tokens set updated_at = now() - (10 - i) * interval '1 minute'
     where token = 't38-extra-' || i || '-xxxxxxxxxxxxxxxx';
  end loop;
  update public.member_push_tokens set updated_at = now() - interval '1 hour' where token = tc;
  perform public.member_save_push_token(kc, 't38-extra-7-xxxxxxxxxxxxxxxx');
  checks := checks + 1; fails := fails || pg_temp.t38_is('3five', (select count(*) from public.member_push_tokens where member_id = mc)::text, '5');
  checks := checks + 1; fails := fails || pg_temp.t38_is('3oldest', (select count(*) from public.member_push_tokens where token = tc)::text, '0');
  -- Clear them again; Chetan keeps one phone.
  checks := checks + 1; fails := fails || pg_temp.t38_is('3clear', public.member_clear_push_token(kc)->>'removed', '5');
  perform public.member_save_push_token(kc, tc);

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- 4. Nothing due: nothing to send.
  checks := checks + 1; fails := fails || pg_temp.t38_is('4none', public.hq_push_next(40)::text, null);

  -- 5. A message to everyone: every phone of THIS gym's members, with the words; once.
  msg := public.owner_send_message(kop, 'announcement', 'Closed on Sunday', 'Diwali');
  checks := checks + 1; fails := fails || pg_temp.t38_is('5job', (select count(*) from public.push_jobs where ref_id = (msg->>'id')::uuid and done_at is null)::text, '1');
  r := public.hq_push_next(40);
  checks := checks + 1; fails := fails || pg_temp.t38_is('5kind', r->>'kind', 'message');
  checks := checks + 1; fails := fails || pg_temp.t38_is('5ref', r->>'refId', msg->>'id');
  checks := checks + 1; fails := fails || pg_temp.t38_is('5gym', r->>'gymName', 'T38 Gym');
  checks := checks + 1; fails := fails || pg_temp.t38_is('5title', (r->>'title') || '/' || (r->>'body') || '/' || (r->>'msgKind'), 'Closed on Sunday/Diwali/announcement');
  checks := checks + 1; fails := fails || pg_temp.t38_is('5tokens', (select string_agg(x, ',' order by x) from jsonb_array_elements_text(r->'tokens') x),
    concat_ws(',', ta, tb, tc));
  checks := checks + 1; fails := fails || pg_temp.t38_is('5last', r->>'last', 'true');
  checks := checks + 1; fails := fails || pg_temp.t38_is('5once', public.hq_push_next(40)::text, null);

  -- 6. A group message: only its group's phones.
  msg := public.owner_send_message(kop, 'reminder', 'Batch moved', '', array[mb]);
  r := public.hq_push_next(40);
  checks := checks + 1; fails := fails || pg_temp.t38_is('6group', (r->'tokens')::text, jsonb_build_array(tb)::text);

  -- 7. Large gyms: page by page, never the same phone twice, the last page says so.
  -- (0042: the 3rd message of a day gets no push, so the two above are moved to yesterday first.)
  update public.gym_messages set created_at = created_at - interval '1 day' where gym_id = gid;
  msg := public.owner_send_message(kop, 'timing', 'New timings', '5 am to 11 pm');
  for i in 1..4 loop
    r := public.hq_push_next(1);
    exit when r is null;
    checks := checks + 1;
    if (r->'tokens'->>0) = any(seen) then fails := fails || ' 7twice:' || (r->'tokens'->>0); end if;
    seen := seen || (r->'tokens'->>0);
  end loop;
  checks := checks + 1; fails := fails || pg_temp.t38_is('7all', coalesce(array_length(seen, 1), 0)::text, '3');
  checks := checks + 1; fails := fails || pg_temp.t38_is('7done', (select (done_at is not null)::text from public.push_jobs where ref_id = (msg->>'id')::uuid), 'true');

  -- 8. A timed message waits for its time; one taken back is never sent.
  msg := public.owner_send_message(kop, 'event', 'Yoga day', '', null, now() + interval '2 hours');
  checks := checks + 1; fails := fails || pg_temp.t38_is('8timed', public.hq_push_next(40)::text, null);
  update public.push_jobs set due_at = now() - interval '1 minute' where ref_id = (msg->>'id')::uuid;
  perform public.owner_withdraw_message(kop, (msg->>'id')::uuid);
  checks := checks + 1; fails := fails || pg_temp.t38_is('8withdrawn', public.hq_push_next(40)::text, null);
  checks := checks + 1; fails := fails || pg_temp.t38_is('8why', (select why_done from public.push_jobs where ref_id = (msg->>'id')::uuid), 'withdrawn');

  -- 9. A job more than 6 hours late is skipped.
  msg := public.owner_send_message(kop, 'announcement', 'Old news', '');
  update public.push_jobs set due_at = now() - interval '7 hours' where ref_id = (msg->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t38_is('9late', public.hq_push_next(40)::text, null);
  checks := checks + 1; fails := fails || pg_temp.t38_is('9why', (select why_done from public.push_jobs where ref_id = (msg->>'id')::uuid), 'late');

  -- 10. A new workout offer goes to every phone of the gym.
  insert into public.gym_offers(gym_id, title, starts_on, join_until)
    values (gid, 'Log 10 workouts, get 3 days', current_date, current_date + 10);
  r := public.hq_push_next(40);
  checks := checks + 1; fails := fails || pg_temp.t38_is('10offer', (r->>'kind') || '/' || (r->>'msgKind') || '/' || (r->>'title'), 'offer/offer/Log 10 workouts, get 3 days');
  checks := checks + 1; fails := fails || pg_temp.t38_is('10count', jsonb_array_length(r->'tokens')::text, '3');

  -- 11. Dead addresses (Firebase said so) are deleted.
  checks := checks + 1; fails := fails || pg_temp.t38_is('11drop', public.hq_push_drop(array[tb, 'not-there'])::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t38_is('11gone', (select count(*) from public.member_push_tokens where token = tb)::text, '0');

  perform set_config('request.jwt.claims', '', true);

  -- 12. The member turns messages off: this phone's address goes; another member's stays.
  checks := checks + 1; fails := fails || pg_temp.t38_is('12clear', public.member_clear_push_token(kc, tc)->>'removed', '1');
  checks := checks + 1; fails := fails || pg_temp.t38_is('12other', public.member_clear_push_token(kc, ta)->>'removed', '0');
  checks := checks + 1; fails := fails || pg_temp.t38_is('12kept', (select count(*) from public.member_push_tokens where token = ta)::text, '1');

  -- 13. Leaving the gym deletes the member's addresses, and the left member cannot save one.
  perform public.member_leave(ka);
  checks := checks + 1; fails := fails || pg_temp.t38_is('13left', (select count(*) from public.member_push_tokens where member_id = ma)::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t38_is('13save', pg_temp.t38_run(format('select public.member_save_push_token(%L, %L)', ka, ta)), 'BAD_KEY');
  -- A member deleted for good takes the address with them.
  delete from public.gym_members where member_id = mz;
  checks := checks + 1; fails := fails || pg_temp.t38_is('13deleted', (select count(*) from public.member_push_tokens where token = tz)::text, '0');

  -- 14. Who may call what: members the member_* functions, only the HQ key the sender's, nobody the tables.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_save_push_token(text, text, text)', 'execute')
     or not has_function_privilege('anon', 'public.member_clear_push_token(text, text)', 'execute')
     or has_function_privilege('anon', 'public.hq_push_next(int)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_push_drop(text[])', 'execute')
     or not has_function_privilege('service_role', 'public.hq_push_next(int)', 'execute')
     or not has_function_privilege('service_role', 'public.hq_push_drop(text[])', 'execute')
     or has_function_privilege('anon', 'public._push_job_message()', 'execute')
     or has_table_privilege('anon', 'public.member_push_tokens', 'select')
     or has_table_privilege('authenticated', 'public.push_jobs', 'select') then fails := fails || ' 14'; end if;
  -- The second lock: a request that says "anon" is refused inside the sender's functions.
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  checks := checks + 1; fails := fails || pg_temp.t38_is('14guard', pg_temp.t38_run('select public.hq_push_next(1)'), 'HQ_ONLY');
  perform set_config('request.jwt.claims', '', true);

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
