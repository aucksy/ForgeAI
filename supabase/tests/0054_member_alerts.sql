-- Member pop-ups for the gym's answers (0054). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

create or replace function pg_temp.t54_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t54_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  gid uuid; gb uuid;
  ma uuid; mb uuid; mc uuid; mz uuid;
  ta text := 't54-token-aaaaaaaaaaaaaaaaaaaa'; tb text := 't54-token-bbbbbbbbbbbbbbbbbbbb';
  ka text := 't54-member-a'; kb text := 't54-member-b'; kc text := 't54-member-c';
  rq uuid; rq2 uuid; rr uuid; o1 uuid; o2 uuid; o3 uuid;
  fails text := ''; checks int := 0; r jsonb; n int;
begin
  -- Real notes (live SQL Editor) never get in the way: closed for this test only (undone at the end).
  update public.member_push_notes set done_at = now() where done_at is null;

  insert into public.gyms(name, join_code, crm_version) values ('T54 Gym', 'T54GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T54 Other', 'T54GYB', 1) returning gym_id into gb;
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Asha Rao', public._hash_key(ka), '9876505401') returning member_id into ma;
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Bina', public._hash_key(kb), '9876505402') returning member_id into mb;
  -- Chetan has the app but never saved a push address.
  insert into public.gym_members(gym_id, name, key_hash, checkin_phone) values (gid, 'Chetan', public._hash_key(kc), '9876505403') returning member_id into mc;
  insert into public.gym_members(gym_id, name, key_hash) values (gb, 'Zoya', public._hash_key('t54-member-z')) returning member_id into mz;
  perform public.member_save_push_token(ka, ta);
  perform public.member_save_push_token(kb, tb);
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (gid, 'member', 't54-r-asha', '{"fullName":"Asha Rao","phone":"9876505401"}', 1),
    (gid, 'member', 't54-r-bina', '{"fullName":"Bina Shah","phone":"9876505402"}', 1),
    (gid, 'member', 't54-r-bina2', '{"fullName":"Bina Two","phone":"9876505402"}', 1),
    (gid, 'member', 't54-r-ravi', '{"fullName":"Ravi","phone":"9876505401"}', 1);

  -- 1. A pause request approved: one note for that member, with the dates, opening the gym tab.
  insert into public.gym_plan_requests(gym_id, app_member, roster_id, kind, freeze_from, freeze_to)
    values (gid, ma, 't54-r-asha', 'freeze', date '2026-11-05', date '2026-11-12') returning request_id into rq;
  checks := checks + 1; fails := fails || pg_temp.t54_is('1none', (select count(*) from public.member_push_notes where ref_id = rq)::text, '0');
  update public.gym_plan_requests set status = 'approved', decided_at = now() where request_id = rq;
  checks := checks + 1; fails := fails || pg_temp.t54_is('1one', (select count(*) from public.member_push_notes where ref_id = rq)::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t54_is('1line', (select line from public.member_push_notes where ref_id = rq), 'Approved: your plan is paused from 5 Nov to 12 Nov.');
  checks := checks + 1; fails := fails || pg_temp.t54_is('1route', (select route || ':' || member_id::text from public.member_push_notes where ref_id = rq), '/shop:' || ma::text);
  -- The same answer written again makes no second note.
  update public.gym_plan_requests set status = 'approved' where request_id = rq;
  checks := checks + 1; fails := fails || pg_temp.t54_is('1once', (select count(*) from public.member_push_notes where ref_id = rq)::text, '1');

  -- 2. A renew request declined.
  insert into public.gym_plan_requests(gym_id, app_member, roster_id, kind, plan_id, plan_name)
    values (gid, mb, 't54-r-bina', 'renew', 'p1', 'Monthly') returning request_id into rq2;
  update public.gym_plan_requests set status = 'declined', decided_at = now() where request_id = rq2;
  checks := checks + 1; fails := fails || pg_temp.t54_is('2line', (select line from public.member_push_notes where ref_id = rq2), 'Your gym said no to your renewal request. Ask at the desk to know why.');

  -- 3. A report request: Asha matches (number + first name, number not shared on the list... but Ravi
  --    shares it, so nobody); Bina's number is shared by two list entries: nobody either.
  insert into public.gym_report_requests(gym_id, roster_id, from_day) values (gid, 't54-r-asha', date '2026-01-01') returning request_id into rr;
  checks := checks + 1; fails := fails || pg_temp.t54_is('3shared', (select count(*) from public.member_push_notes where ref_id = rr)::text, '0');
  update public.gym_report_requests set status = 'declined', answered_at = now() where request_id = rr;
  -- Ravi's entry goes (deleted): Asha's number is hers alone now, and she gets the note.
  update public.crm_records set deleted = true where gym_id = gid and id = 't54-r-ravi';
  insert into public.gym_report_requests(gym_id, roster_id, from_day) values (gid, 't54-r-asha', date '2026-01-01') returning request_id into rr;
  checks := checks + 1; fails := fails || pg_temp.t54_is('3asha', (select member_id::text from public.member_push_notes where ref_id = rr), ma::text);
  insert into public.gym_report_requests(gym_id, roster_id, from_day) values (gid, 't54-r-bina', date '2026-01-01') returning request_id into rr;
  checks := checks + 1; fails := fails || pg_temp.t54_is('3bina', (select count(*) from public.member_push_notes where ref_id = rr)::text, '0');

  -- 4. Orders: ready -> a note; back to ordered and ready again -> still one; collected -> none;
  --    cancelled by the gym -> a note; cancelled by the member -> none; no member -> none.
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p) values (gid, ma, 'Asha', 5401, '[]', 0) returning order_id into o1;
  update public.shop_orders set status = 'ready' where order_id = o1;
  checks := checks + 1; fails := fails || pg_temp.t54_is('4ready', (select line from public.member_push_notes where ref_id = o1), 'Your order 5401 is ready. Collect it at the desk.');
  update public.shop_orders set status = 'ordered' where order_id = o1;
  update public.shop_orders set status = 'ready' where order_id = o1;
  update public.shop_orders set status = 'collected' where order_id = o1;
  checks := checks + 1; fails := fails || pg_temp.t54_is('4once', (select count(*) from public.member_push_notes where ref_id = o1)::text, '1');
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p) values (gid, mb, 'Bina', 5402, '[]', 0) returning order_id into o2;
  update public.shop_orders set status = 'cancelled', cancelled_by = 'gym' where order_id = o2;
  checks := checks + 1; fails := fails || pg_temp.t54_is('4gym', (select route from public.member_push_notes where ref_id = o2), '/shop/orders');
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p) values (gid, mb, 'Bina', 5403, '[]', 0) returning order_id into o3;
  update public.shop_orders set status = 'cancelled', cancelled_by = 'member' where order_id = o3;
  checks := checks + 1; fails := fails || pg_temp.t54_is('4member', (select count(*) from public.member_push_notes where ref_id = o3)::text, '0');

  -- 5. A member who left gets nothing.
  insert into public.shop_orders(gym_id, member_id, member_name, order_no, lines, total_p) values (gid, mc, 'Chetan', 5404, '[]', 0) returning order_id into o3;
  update public.gym_members set left_at = now() where member_id = mc;
  update public.shop_orders set status = 'ready' where order_id = o3;
  checks := checks + 1; fails := fails || pg_temp.t54_is('5left', (select count(*) from public.member_push_notes where ref_id = o3)::text, '0');
  update public.gym_members set left_at = null where member_id = mc;

  -- 6. A note for a member with no push address: closed as no-phone by the sender, never sent.
  insert into public.member_push_notes(gym_id, member_id, kind, ref_id, tag, line, route)
    values (gid, mc, 'order', gen_random_uuid(), 't54-nophone', 'Test line', '/shop/orders');
  -- 7. A note 7 hours old: closed as late.
  insert into public.member_push_notes(gym_id, member_id, kind, ref_id, tag, line, route, created_at)
    values (gid, ma, 'order', gen_random_uuid(), 't54-late', 'Late line', '/shop/orders', now() - interval '7 hours');

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- 8. The sender: every waiting note once, with only that member's addresses, and the gym's name.
  r := public.hq_push_direct_next(40);
  n := jsonb_array_length(r->'notes');
  checks := checks + 1; fails := fails || pg_temp.t54_is('8count', n::text, '5');
  checks := checks + 1; fails := fails || pg_temp.t54_is('8tokens',
    (select string_agg(x->'tokens'->>0, ',' order by (x->>'line') collate "C") from jsonb_array_elements(r->'notes') x), ta || ',' || ta || ',' || tb || ',' || tb || ',' || ta);
  checks := checks + 1; fails := fails || pg_temp.t54_is('8gym', (r->'notes'->0->>'gymName'), 'T54 Gym');
  checks := checks + 1; fails := fails || pg_temp.t54_is('8nophone', (select why_done from public.member_push_notes where tag = 't54-nophone'), 'no-phone');
  checks := checks + 1; fails := fails || pg_temp.t54_is('8late', (select why_done from public.member_push_notes where tag = 't54-late'), 'late');
  checks := checks + 1; fails := fails || pg_temp.t54_is('8again', jsonb_array_length(public.hq_push_direct_next(40)->'notes')::text, '0');

  -- 9. p_max: one address per call hands back one note at a time.
  update public.member_push_notes set done_at = null, why_done = null where gym_id = gid and why_done = 'sent';
  checks := checks + 1; fails := fails || pg_temp.t54_is('9one', jsonb_array_length(public.hq_push_direct_next(1)->'notes')::text, '1');

  -- 10. Who may call what: only the HQ key the sender; nobody the table or the helpers.
  checks := checks + 1;
  if has_function_privilege('anon', 'public.hq_push_direct_next(int)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_push_direct_next(int)', 'execute')
     or not has_function_privilege('service_role', 'public.hq_push_direct_next(int)', 'execute')
     or has_function_privilege('anon', 'public._push_note(uuid, uuid, text, uuid, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public._push_note_order()', 'execute')
     or has_table_privilege('anon', 'public.member_push_notes', 'select')
     or has_table_privilege('authenticated', 'public.member_push_notes', 'insert') then fails := fails || ' 10'; end if;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  checks := checks + 1; fails := fails || pg_temp.t54_is('10guard', pg_temp.t54_run('select public.hq_push_direct_next(1)'), 'HQ_ONLY');
  perform set_config('request.jwt.claims', '', true);

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
