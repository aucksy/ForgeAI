-- "Send a test alert" (0095, R-578). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be pasted
-- into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).
-- One transaction, so now() stands still: times are set by hand (created_at).

create or replace function pg_temp.t95_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t95_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- "endpoint-tail title / tag" of each push, sorted, for comparing.
create or replace function pg_temp.t95_sends(r jsonb) returns text
  language sql as $$
  select coalesce(string_agg(right(x->>'endpoint', 6) || ' ' || (x->>'title') || ' / ' || (x->>'tag'), ' | '
                             order by right(x->>'endpoint', 6) collate "C", x->>'tag' collate "C"), '')
    from jsonb_array_elements(r->'sends') x
$$;

do $$
declare
  gid uuid; gb uuid; sdesk uuid;
  ko text := 't95-owner-key'; kdesk text := 't95-desk-key'; kb text := 't95-other-key';
  e_own text := 'https://fcm.googleapis.com/fcm/send/t95-browser-own001';
  e_desk text := 'https://updates.push.services.mozilla.com/wpush/v2/t95-browser-dsk002';
  e_b text := 'https://fcm.googleapis.com/fcm/send/t95-browser-oth003';
  pk text := repeat('B', 87); au text := repeat('A', 22);
  sub_own uuid; sub_desk uuid;
  t1 uuid; t2 uuid; o1 uuid; j1 uuid;
  fails text := ''; checks int := 0; r jsonb; i int;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T95 Gym', 'T95GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T95 Other', 'T95GYB', 1) returning gym_id into gb;
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(ko)), (gb, public._hash_key(kb));
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Desk Dinesh', '9876509511', 'staff') returning staff_id into sdesk;
  insert into public.gym_sessions(staff_id, key_hash) values (sdesk, public._hash_key(kdesk));
  perform public.owner_save_web_push(ko, e_own, pk, au);
  perform public.owner_save_web_push(kdesk, e_desk, pk, au);
  perform public.owner_save_web_push(kb, e_b, pk, au);
  select sub_id into sub_own from public.gym_web_push where endpoint = e_own;
  select sub_id into sub_desk from public.gym_web_push where endpoint = e_desk;

  -- 1. Only for a browser saved with THIS key: another person's browser, another gym's, or none is NOT_ON.
  checks := checks + 1; fails := fails || pg_temp.t95_is('1notmine', public.owner_send_test_alert(kdesk, e_own)::text, '{"ok": false, "error": "NOT_ON"}');
  checks := checks + 1; fails := fails || pg_temp.t95_is('1othergym', public.owner_send_test_alert(kb, e_own)->>'error', 'NOT_ON');
  checks := checks + 1; fails := fails || pg_temp.t95_is('1none', public.owner_send_test_alert(ko, 'https://fcm.googleapis.com/fcm/send/nobody')->>'error', 'NOT_ON');
  checks := checks + 1; fails := fails || pg_temp.t95_is('1badkey',
    pg_temp.t95_run(format('select public.owner_send_test_alert(%L, %L)', 't95-nobody', e_own)), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t95_is('1status',
    public.owner_test_alert(ko, 'https://fcm.googleapis.com/fcm/send/nobody')::text, '{"ok": true, "on": false, "test": null, "wait": 0}');
  checks := checks + 1; fails := fails || pg_temp.t95_is('1nothing', public.owner_test_alert(ko, e_own)::text, '{"ok": true, "on": true, "test": null, "wait": 0}');

  -- 2. The owner sends one: urgent, for this browser only; a second tap within the minute waits.
  r := public.owner_send_test_alert(ko, e_own);
  t1 := (r->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t95_is('2sent', (r->>'ok') || ' ' || ((r->>'at')::bigint = floor(extract(epoch from now()) * 1000)::bigint)::text, 'true true');
  checks := checks + 1; fails := fails || pg_temp.t95_is('2row',
    (select kind || ' ' || urgent || ' ' || (sub_id = sub_own) || ' ' || route || ' ' || line from public.gym_alerts where alert_id = t1),
    'test_alert true true /settings Alerts work on this device. Alerts from your members will look like this.');
  checks := checks + 1; fails := fails || pg_temp.t95_is('2toosoon', public.owner_send_test_alert(ko, e_own)::text, '{"ok": false, "wait": 60, "error": "TOO_SOON"}');
  -- The desk's own browser is not held up by the owner's test.
  checks := checks + 1; fails := fails || pg_temp.t95_is('2deskwait', (public.owner_test_alert(kdesk, e_desk)->>'wait'), '0');

  -- 3. Never in the owner's list (a real alert next to it still is).
  perform public._alert(gid, 'shop_order', 'o1', 't95:o1', 'all', true, 'New shop order 7 from Neha. Get it ready on Shop.', '/shop');
  select alert_id into o1 from public.gym_alerts where tag = 't95:o1';
  checks := checks + 1; fails := fails || pg_temp.t95_is('3list',
    (select string_agg(x->>'kind', ',') from jsonb_array_elements(public.owner_alerts(ko)->'alerts') x), 'shop_order');
  checks := checks + 1; fails := fails || pg_temp.t95_is('3desklist',
    (select string_agg(x->>'kind', ',') from jsonb_array_elements(public.owner_alerts(kdesk)->'alerts') x), 'shop_order');

  -- 4. The HQ run: the test to the owner's browser only, with its own title and tag; the order to both browsers.
  r := public.hq_panel_push_instant(40);
  checks := checks + 1; fails := fails || pg_temp.t95_is('4sends', pg_temp.t95_sends(r),
    'dsk002 MettleUp: news from your members / mettleup-alert-' || o1
    || ' | own001 MettleUp: news from your members / mettleup-alert-' || o1
    || ' | own001 MettleUp: test alert / mettleup-test-' || t1);
  checks := checks + 1; fails := fails || pg_temp.t95_is('4body',
    (select x->>'body' || ' ' || (x->>'route') from jsonb_array_elements(r->'sends') x where x->>'tag' like 'mettleup-test-%'),
    'Alerts work on this device. Alerts from your members will look like this. /settings');
  checks := checks + 1; fails := fails || pg_temp.t95_is('4again', jsonb_array_length(public.hq_panel_push_instant(40)->'sends')::text, '0');
  r := public.owner_test_alert(ko, e_own);
  checks := checks + 1; fails := fails || pg_temp.t95_is('4status',
    (r->'test'->>'id') || ' ' || (r->'test'->>'sentHow') || ' ' || ((r->'test'->>'sentAt') is not null)::text || ' ' || coalesce(r->'test'->>'shownAt', 'not-shown') || ' ' || (r->>'wait'),
    t1 || ' instant true not-shown 60');

  -- 5. The service worker says it showed it: once; never for another alert; an unknown id changes nothing.
  checks := checks + 1; fails := fails || pg_temp.t95_is('5shown', public.panel_test_alert_shown(t1)::text, '{"ok": true}');
  checks := checks + 1; fails := fails || pg_temp.t95_is('5status',
    ((public.owner_test_alert(ko, e_own)->'test'->>'shownAt')::bigint = floor(extract(epoch from now()) * 1000)::bigint)::text, 'true');
  update public.gym_alerts set shown_at = now() - interval '5 seconds' where alert_id = t1;
  perform public.panel_test_alert_shown(t1);
  checks := checks + 1; fails := fails || pg_temp.t95_is('5once', ((select shown_at from public.gym_alerts where alert_id = t1) < now())::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t95_is('5notatest', (public.panel_test_alert_shown(o1)->>'ok') || ' '
    || coalesce((select shown_at::text from public.gym_alerts where alert_id = o1), 'null'), 'true null');
  checks := checks + 1; fails := fails || pg_temp.t95_is('5unknown', public.panel_test_alert_shown(gen_random_uuid())::text, '{"ok": true}');
  checks := checks + 1; fails := fails || pg_temp.t95_is('5null', public.panel_test_alert_shown(null)::text, '{"ok": true}');

  -- 6. Never in a summary: a waiting test alone makes no summary due; with a real alert waiting, the summary counts
  --    only the real one, and the test still goes at once, to its own browser.
  r := public.owner_send_test_alert(kdesk, e_desk);
  t2 := (r->>'id')::uuid;
  update public.gym_alerts set created_at = now() - interval '30 minutes' where alert_id = t2;
  checks := checks + 1; fails := fails || pg_temp.t95_is('6gymsTestOnly',
    (select count(*) from jsonb_array_elements(public.hq_panel_digest_gyms()->'gyms') x where (x->>'gymId')::uuid = gid)::text, '0');
  perform public._alert(gid, 'member_joined', 'j1', 't95:j1', 'all', false, 'Vikram joined your gym in the MettleUp app. See them in Members using the app.', '/members/app');
  update public.gym_alerts set created_at = now() - interval '20 minutes' where tag = 't95:j1';
  select alert_id into j1 from public.gym_alerts where tag = 't95:j1';
  checks := checks + 1; fails := fails || pg_temp.t95_is('6gymsOldest',
    (select ((x->>'oldestAt')::bigint = floor(extract(epoch from now() - interval '20 minutes') * 1000)::bigint)::text
       from jsonb_array_elements(public.hq_panel_digest_gyms()->'gyms') x where (x->>'gymId')::uuid = gid), 'true');
  r := public.hq_panel_digest_claim(gid, floor(extract(epoch from now() - interval '10 minutes') * 1000)::bigint, 40);
  checks := checks + 1; fails := fails || pg_temp.t95_is('6claim', (r->>'claimed') || ' ' || pg_temp.t95_sends(r),
    'true dsk002 MettleUp: news from your members / mettleup-alert-' || j1
    || ' | own001 MettleUp: news from your members / mettleup-alert-' || j1);
  checks := checks + 1; fails := fails || pg_temp.t95_is('6testWaits', coalesce((select sent_how from public.gym_alerts where alert_id = t2), 'waiting'), 'waiting');
  r := public.hq_panel_push_instant(40);
  checks := checks + 1; fails := fails || pg_temp.t95_is('6deskTest', pg_temp.t95_sends(r), 'dsk002 MettleUp: test alert / mettleup-test-' || t2);

  -- 7. At most 20 an hour a gym (every browser together); a day-old test is cleared on the next send.
  delete from public.gym_alerts where kind = 'test_alert' and gym_id = gid;
  for i in 1..20 loop
    insert into public.gym_alerts(gym_id, kind, ref_id, tag, audience, urgent, line, route, sub_id, created_at, sent_at, sent_how)
      values (gid, 'test_alert', sub_own::text, 't95:many' || i, 'all', true, 'Alerts work on this device.', '/settings', sub_own,
              now() - make_interval(mins => 2 + i), now(), 'instant');
  end loop;
  r := public.owner_send_test_alert(kdesk, e_desk);
  checks := checks + 1; fails := fails || pg_temp.t95_is('7gymcap', (r->>'error') || ' ' || (r->>'wait'), 'TOO_SOON ' || (60 * 60 - 22 * 60)::text);
  delete from public.gym_alerts where tag like 't95:many%' and tag <> 't95:many1';
  update public.gym_alerts set created_at = now() - interval '2 days' where tag = 't95:many1';
  r := public.owner_send_test_alert(kdesk, e_desk);
  checks := checks + 1; fails := fails || pg_temp.t95_is('7again', (r->>'ok') || ' ' || (select count(*) from public.gym_alerts where tag = 't95:many1'), 'true 0');
  -- An hour later, the card forgets it.
  update public.gym_alerts set created_at = now() - interval '61 minutes' where alert_id = (r->>'id')::uuid;
  checks := checks + 1; fails := fails || pg_temp.t95_is('7forgot', public.owner_test_alert(kdesk, e_desk)::text, '{"ok": true, "on": true, "test": null, "wait": 0}');

  -- 8. The browser turned off: its test alerts go with it.
  perform public.owner_clear_web_push(kdesk, e_desk);
  checks := checks + 1; fails := fails || pg_temp.t95_is('8gone', (select count(*) from public.gym_alerts where sub_id = sub_desk)::text, '0');

  -- 9. Every other kind still checked; a kind nobody knows is refused.
  checks := checks + 1; fails := fails || pg_temp.t95_is('9kind',
    pg_temp.t95_run(format('insert into public.gym_alerts(gym_id, kind, ref_id, tag, line, route) values (%L, %L, %L, %L, %L, %L)',
      gid, 'nope', 'x', 't95:nope', 'A line.', '/')) like '%gym_alerts_kind_check%', 'true');
  checks := checks + 1; fails := fails || pg_temp.t95_is('9oldkinds',
    pg_temp.t95_run(format('insert into public.gym_alerts(gym_id, kind, ref_id, tag, line, route) values (%L, %L, %L, %L, %L, %L)',
      gid, 'ai_members_limit', 'x', 't95:ai', 'A line.', '/')), 'ok');

  -- 10. Who may call what.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.owner_send_test_alert(text, text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_test_alert(text, text)', 'execute')
     or not has_function_privilege('anon', 'public.panel_test_alert_shown(uuid)', 'execute')
     or has_function_privilege('anon', 'public._test_alert_sub(text, text)', 'execute')
     or has_function_privilege('anon', 'public._test_alert_wait(public.gym_web_push)', 'execute')
     or has_function_privilege('anon', 'public.hq_panel_push_instant(int)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_panel_digest_claim(uuid, bigint, int)', 'execute')
     or not has_function_privilege('service_role', 'public.hq_panel_digest_gyms()', 'execute')
     or not has_function_privilege('anon', 'public.owner_alerts(text, bigint)', 'execute') then fails := fails || ' 10'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
