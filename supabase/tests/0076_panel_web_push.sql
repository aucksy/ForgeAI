-- The admin app's alerts with the app closed (0076). Runs in CI after every migration (scripts/ci/db_checks.sh); can
-- also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).
-- One transaction, so now() stands still: times are set by hand (created_at, last_digest_at, the slot).

create or replace function pg_temp.t76_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t76_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- "endpoint-tail body tag" of each push, sorted, for comparing.
create or replace function pg_temp.t76_sends(r jsonb) returns text
  language sql as $$
  select coalesce(string_agg(right(x->>'endpoint', 6) || ' ' || (x->>'body') || ' ' || (x->>'tag'), ' | '
                             order by right(x->>'endpoint', 6) collate "C", x->>'body' collate "C"), '')
    from jsonb_array_elements(r->'sends') x
$$;

do $$
declare
  gid uuid; gb uuid; sdesk uuid; sper uuid;
  ko text := 't76-owner-key'; kdesk text := 't76-desk-key'; kpo text := 't76-person-owner-key'; kb text := 't76-other-key';
  e_own text := 'https://fcm.googleapis.com/fcm/send/t76-browser-own001';
  e_desk text := 'https://updates.push.services.mozilla.com/wpush/v2/t76-browser-dsk002';
  e_po text := 'https://web.push.apple.com/t76-browser-per003';
  pk text := repeat('B', 87); au text := repeat('A', 22);
  a1 uuid; a2 uuid; a3 uuid; a4 uuid;
  fails text := ''; checks int := 0; r jsonb; slot bigint;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T76 Gym', 'T76GYA', 1) returning gym_id into gid;
  insert into public.gyms(name, join_code, crm_version) values ('T76 Other', 'T76GYB', 1) returning gym_id into gb;
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(ko)), (gb, public._hash_key(kb));
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Desk Dinesh', '9876507511', 'staff') returning staff_id into sdesk;
  insert into public.gym_staff(gym_id, name, phone, role) values (gid, 'Owner Om', '9876507513', 'owner') returning staff_id into sper;
  insert into public.gym_sessions(staff_id, key_hash) values (sdesk, public._hash_key(kdesk)), (sper, public._hash_key(kpo));

  -- 1. Turning alerts on: the owner key (no person) and the desk; only the big push companies, only real keys.
  r := public.owner_save_web_push(ko, e_own, pk, au);
  checks := checks + 1; fails := fails || pg_temp.t76_is('1own', r::text, '{"ok": true, "on": true}');
  perform public.owner_save_web_push(kdesk, e_desk, pk, au);
  checks := checks + 1; fails := fails || pg_temp.t76_is('1rows',
    (select string_agg(coalesce(s.name, 'owner-key'), ',' order by w.endpoint collate "C") from public.gym_web_push w left join public.gym_staff s on s.staff_id = w.staff_id where w.gym_id = gid),
    'owner-key,Desk Dinesh');
  checks := checks + 1; fails := fails || pg_temp.t76_is('1badhost',
    pg_temp.t76_run(format('select public.owner_save_web_push(%L, %L, %L, %L)', ko, 'https://evil.example.com/push/t76-xxxxxxxx', pk, au)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t76_is('1badkeys',
    pg_temp.t76_run(format('select public.owner_save_web_push(%L, %L, %L, %L)', ko, e_own, 'short', au)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t76_is('1badkey',
    pg_temp.t76_run(format('select public.owner_save_web_push(%L, %L, %L, %L)', 't76-nobody', e_own, pk, au)), 'BAD_KEY');
  -- Saved again: one row, still one.
  perform public.owner_save_web_push(ko, e_own, pk, au);
  checks := checks + 1; fails := fails || pg_temp.t76_is('1once', (select count(*) from public.gym_web_push where gym_id = gid)::text, '2');
  -- "On for this browser" only for the sign-in that saved it.
  checks := checks + 1; fails := fails || pg_temp.t76_is('2on',
    (public.owner_web_push_on(ko, e_own)->>'on') || (public.owner_web_push_on(kdesk, e_own)->>'on') || (public.owner_web_push_on(kb, e_own)->>'on'),
    'truefalsefalse');

  -- 3. The setting: daily at 11:00 am by default; only the owner changes it.
  checks := checks + 1; fails := fails || pg_temp.t76_is('3default', public.owner_alert_settings(ko)::text,
    '{"ok": true, "mode": "daily", "minute": 660, "canEdit": true, "weekday": 1}');
  checks := checks + 1; fails := fails || pg_temp.t76_is('3desk', public.owner_alert_settings(kdesk)->>'canEdit', 'false');
  checks := checks + 1; fails := fails || pg_temp.t76_is('3person', public.owner_alert_settings(kpo)->>'canEdit', 'true');
  checks := checks + 1; fails := fails || pg_temp.t76_is('3deskSave',
    pg_temp.t76_run(format('select public.owner_save_alert_settings(%L, %L, 600, 1)', kdesk, 'instant')), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t76_is('3bad',
    pg_temp.t76_run(format('select public.owner_save_alert_settings(%L, %L, 1440, 1)', ko, 'daily')), 'INVALID');
  r := public.owner_save_alert_settings(kpo, 'weekly', 1200, 5);
  checks := checks + 1; fails := fails || pg_temp.t76_is('3saved', (r->>'mode') || ' ' || (r->>'minute') || ' ' || (r->>'weekday'), 'weekly 1200 5');
  perform public.owner_save_alert_settings(ko, 'daily', 660, 1);

  -- The owner-person's browser too (Safari).
  perform public.owner_save_web_push(kpo, e_po, pk, au);

  -- 4. Urgent alerts go at once, each to who may see it: the complaint to the two owner browsers only, the shop order
  --    to all three. The member who joined waits for the summary.
  perform public._alert(gid, 'member_complaint', 'c1', 't76:c1', 'owner', true, 'Ravi sent your gym a complaint. Open Member messages to read it.', '/member-messages');
  perform public._alert(gid, 'shop_order', 'o1', 't76:o1', 'all', true, 'New shop order 7 from Neha. Get it ready on Shop.', '/shop');
  perform public._alert(gid, 'member_joined', 'j1', 't76:j1', 'all', false, 'Vikram joined your gym in the MettleUp app. See them in Members using the app.', '/members/app');
  select alert_id into a1 from public.gym_alerts where tag = 't76:c1';
  select alert_id into a2 from public.gym_alerts where tag = 't76:o1';
  r := public.hq_panel_push_instant(40);
  checks := checks + 1; fails := fails || pg_temp.t76_is('4sends', pg_temp.t76_sends(r),
    'dsk002 New shop order 7 from Neha. Get it ready on Shop. mettleup-alert-' || a2
    || ' | own001 New shop order 7 from Neha. Get it ready on Shop. mettleup-alert-' || a2
    || ' | own001 Ravi sent your gym a complaint. Open Member messages to read it. mettleup-alert-' || a1
    || ' | per003 New shop order 7 from Neha. Get it ready on Shop. mettleup-alert-' || a2
    || ' | per003 Ravi sent your gym a complaint. Open Member messages to read it. mettleup-alert-' || a1);
  checks := checks + 1; fails := fails || pg_temp.t76_is('4shape',
    (select string_agg(k, ',' order by k) from jsonb_object_keys(r->'sends'->0) k), 'auth,body,endpoint,p256dh,route,subId,tag,title');
  checks := checks + 1; fails := fails || pg_temp.t76_is('4marked',
    (select string_agg(tag || '=' || coalesce(sent_how, 'waiting'), ',' order by tag) from public.gym_alerts where gym_id = gid),
    't76:c1=instant,t76:j1=waiting,t76:o1=instant');
  -- No double send.
  checks := checks + 1; fails := fails || pg_temp.t76_is('4again', jsonb_array_length(public.hq_panel_push_instant(40)->'sends')::text, '0');

  -- 5. The cap: a first alert always fits whole; the next one waits for the next run.
  perform public._alert(gid, 'phone_link', 'p1', 't76:p1', 'all', true, 'Asha typed their number at the check-in poster. Confirm it on Today.', '/');
  perform public._alert(gid, 'friend_referred', 'f1', 't76:f1', 'all', true, 'Asha''s friend asked about joining your gym. Call them from Enquiries.', '/enquiries');
  update public.gym_alerts set created_at = now() - interval '1 minute' where tag = 't76:p1';
  r := public.hq_panel_push_instant(1);
  checks := checks + 1; fails := fails || pg_temp.t76_is('5cap', jsonb_array_length(r->'sends')::text || ' '
    || (select sent_how from public.gym_alerts where tag = 't76:p1') || ' ' || coalesce((select sent_how from public.gym_alerts where tag = 't76:f1'), 'waiting'),
    '3 instant waiting');
  checks := checks + 1; fails := fails || pg_temp.t76_is('5next', jsonb_array_length(public.hq_panel_push_instant(40)->'sends')::text, '3');

  -- 6. Too old: never sent. 7. A gym with no browser: 'none'.
  perform public._alert(gid, 'shop_order', 'o2', 't76:o2', 'all', true, 'New shop order 8 from Neha. Get it ready on Shop.', '/shop');
  update public.gym_alerts set created_at = now() - interval '7 hours' where tag = 't76:o2';
  perform public._alert(gb, 'shop_order', 'o3', 't76:o3', 'all', true, 'New shop order 9 from Zoya. Get it ready on Shop.', '/shop');
  r := public.hq_panel_push_instant(40);
  checks := checks + 1; fails := fails || pg_temp.t76_is('6late', jsonb_array_length(r->'sends')::text || ' '
    || (select sent_how from public.gym_alerts where tag = 't76:o2') || ' ' || (select sent_how from public.gym_alerts where tag = 't76:o3'), '0 late none');

  -- 8. 'instant' gym: everything at once (the feedback, and the joined member who waited).
  update public.gym_alert_settings set mode = 'instant' where gym_id = gid;
  perform public._alert(gid, 'member_feedback', 'fb0', 't76:fb0', 'all', false, 'Bina sent your gym feedback. Open Member messages to read it.', '/member-messages');
  checks := checks + 1; fails := fails || pg_temp.t76_is('8instant', jsonb_array_length(public.hq_panel_push_instant(40)->'sends')::text || ' '
    || (select sent_how from public.gym_alerts where tag = 't76:j1'), '6 instant');
  -- ...and no summary for it.
  checks := checks + 1; fails := fails || pg_temp.t76_is('8nogyms', (select count(*) from jsonb_array_elements(public.hq_panel_digest_gyms()->'gyms') g where g->>'gymId' = gid::text)::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t76_is('8noclaim', public.hq_panel_digest_claim(gid, (extract(epoch from now()) * 1000)::bigint - 60000)->>'claimed', 'false');
  update public.gym_alert_settings set mode = 'daily' where gym_id = gid;

  -- 9. The summary. Waiting from 2 hours ago: a joined member (all), feedback (all), an owner-only line.
  perform public._alert(gid, 'member_joined', 'j2', 't76:j2', 'all', false, 'Kiran joined your gym in the MettleUp app. See them in Members using the app.', '/members/app');
  perform public._alert(gid, 'member_feedback', 'fb1', 't76:fb1', 'all', false, 'Bina sent your gym feedback. Open Member messages to read it.', '/member-messages');
  perform public._alert(gid, 'member_complaint', 'c2', 't76:c2', 'owner', false, 'Ravi replied in Member messages. Open it to read the reply.', '/member-messages');
  update public.gym_alerts set created_at = now() - interval '2 hours' where tag in ('t76:j2', 't76:fb1', 't76:c2');
  r := public.hq_panel_digest_gyms();
  checks := checks + 1; fails := fails || pg_temp.t76_is('9gyms',
    (select (g->>'mode') || ' ' || (g->>'minute') || ' ' || (g->>'weekday') || ' ' || coalesce(g->>'lastAt', 'never') || ' '
            || ((g->>'oldestAt')::bigint = floor(extract(epoch from now() - interval '2 hours') * 1000)::bigint)
       from jsonb_array_elements(r->'gyms') g where g->>'gymId' = gid::text),
    'daily 660 1 never true');
  checks := checks + 1; fails := fails || pg_temp.t76_is('9other', (select count(*) from jsonb_array_elements(r->'gyms') g where g->>'gymId' = gb::text)::text, '0');
  slot := floor(extract(epoch from now() - interval '1 hour') * 1000)::bigint;
  r := public.hq_panel_digest_claim(gid, slot, 40);
  checks := checks + 1; fails := fails || pg_temp.t76_is('9claim', (r->>'claimed') || ' | ' || pg_temp.t76_sends(r),
    'true | dsk002 2 new updates from your members. Open the admin app to see them. mettleup-digest'
    || ' | own001 3 new updates from your members. Open the admin app to see them. mettleup-digest'
    || ' | per003 3 new updates from your members. Open the admin app to see them. mettleup-digest');
  checks := checks + 1; fails := fails || pg_temp.t76_is('9marked',
    (select string_agg(tag || '=' || coalesce(sent_how, 'waiting'), ',' order by tag) from public.gym_alerts where tag in ('t76:j2', 't76:fb1', 't76:c2')),
    't76:c2=digest,t76:fb1=digest,t76:j2=digest');
  -- The same slot again (a second run, a retry): nothing.
  r := public.hq_panel_digest_claim(gid, slot, 40);
  checks := checks + 1; fails := fails || pg_temp.t76_is('9twice', (r->>'claimed') || ' ' || jsonb_array_length(r->'sends'), 'false 0');
  -- A slot in the future, or no gym: refused.
  checks := checks + 1; fails := fails || pg_temp.t76_is('9future',
    pg_temp.t76_run(format('select public.hq_panel_digest_claim(%L::uuid, %s)', gid, floor(extract(epoch from now() + interval '1 hour') * 1000)::bigint)), 'INVALID');
  checks := checks + 1; fails := fails || pg_temp.t76_is('9nogym',
    pg_temp.t76_run(format('select public.hq_panel_digest_claim(%L::uuid, %s)', gen_random_uuid(), slot)), 'INVALID');

  -- 10. The next summary (a day later): one alert, so each browser gets its own line and page.
  update public.gym_alert_settings set last_digest_at = now() - interval '1 day' where gym_id = gid;
  perform public._alert(gid, 'report_sent', 'rp1', 't76:rp1', 'all', false, 'Asha sent the workout report you asked for. Open their page to read it.', '/members/t76-r-asha');
  update public.gym_alerts set created_at = now() - interval '30 minutes' where tag = 't76:rp1';
  select alert_id into a3 from public.gym_alerts where tag = 't76:rp1';
  r := public.hq_panel_digest_claim(gid, floor(extract(epoch from now() - interval '10 minutes') * 1000)::bigint, 40);
  checks := checks + 1; fails := fails || pg_temp.t76_is('10one',
    (select string_agg(distinct (x->>'body') || ' ' || (x->>'route') || ' ' || (x->>'tag'), '|') from jsonb_array_elements(r->'sends') x)
      || ' ' || jsonb_array_length(r->'sends'),
    'Asha sent the workout report you asked for. Open their page to read it. /members/t76-r-asha mettleup-alert-' || a3 || ' 3');

  -- 11. A desk person signs out: their browser gets nothing more and is dropped.
  update public.gym_sessions set ended_at = now() where key_hash = public._hash_key(kdesk);
  perform public._alert(gid, 'shop_order', 'o4', 't76:o4', 'all', true, 'New shop order 10 from Neha. Get it ready on Shop.', '/shop');
  r := public.hq_panel_push_instant(40);
  checks := checks + 1; fails := fails || pg_temp.t76_is('11signedout', jsonb_array_length(r->'sends') || ' '
    || (select count(*) from public.gym_web_push where gym_id = gid), '2 2');

  -- 12. A browser turned off, and an address the push company says is gone.
  checks := checks + 1; fails := fails || pg_temp.t76_is('12off', public.owner_clear_web_push(kpo, e_po)->>'removed', '1');
  checks := checks + 1; fails := fails || pg_temp.t76_is('12drop', public.hq_panel_drop_push(jsonb_build_array(e_own, 'https://fcm.googleapis.com/fcm/send/none'))->>'dropped', '1');
  checks := checks + 1; fails := fails || pg_temp.t76_is('12empty', (select count(*) from public.gym_web_push where gym_id = gid)::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t76_is('12invalid', pg_temp.t76_run('select public.hq_panel_drop_push(''{}''::jsonb)'), 'INVALID');

  -- 13. Who may call what.
  checks := checks + 1;
  if has_function_privilege('anon', 'public.hq_panel_push_instant(int)', 'execute')
     or has_function_privilege('anon', 'public.hq_panel_digest_gyms()', 'execute')
     or has_function_privilege('authenticated', 'public.hq_panel_digest_claim(uuid, bigint, int)', 'execute')
     or has_function_privilege('anon', 'public.hq_panel_drop_push(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.hq_panel_digest_claim(uuid, bigint, int)', 'execute')
     or not has_function_privilege('anon', 'public.owner_save_web_push(text, text, text, text)', 'execute')
     or not has_function_privilege('anon', 'public.owner_save_alert_settings(text, text, int, int)', 'execute')
     or has_function_privilege('anon', 'public._web_push_live(public.gym_web_push)', 'execute')
     or has_table_privilege('anon', 'public.gym_web_push', 'select')
     or has_table_privilege('authenticated', 'public.gym_alert_settings', 'update') then fails := fails || ' 13'; end if;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  checks := checks + 1; fails := fails || pg_temp.t76_is('13guard', pg_temp.t76_run('select public.hq_panel_push_instant(1)'), 'HQ_ONLY');
  perform set_config('request.jwt.claims', '', true);

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
