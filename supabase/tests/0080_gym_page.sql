-- Gym page test (0080, F207, R-519/R-529). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90000 80xxx); the gyms are made here and undone with the rest.

create or replace function pg_temp.t80_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- The error a statement raises ('no error' when it runs).
create or replace function pg_temp.t80_err(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'no error';
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.t80_save(p_key text, p_page jsonb) returns jsonb
  language sql as $$ select public.owner_save_gym_page(p_key, p_page) $$;

do $$
declare
  ga uuid; gb uuid; gs uuid; s_owner uuid; s_staff uuid; v0 bigint; v1 bigint;
  ka text := 't80-owner-key-a'; kb text := 't80-owner-key-b'; kss text := 't80-owner-key-s';
  kop text := 't80-owner-session'; kst text := 't80-staff-session';
  d_today text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  ravi text := '9000080011'; neha text := '9000080012';
  sl text := 't80-fitness-sector-80';
  hq text := 'hq-test@example.com';
  page jsonb; ph text; r jsonb; e jsonb; fails text := ''; checks int := 0; i int;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T80 Gym', 'T80AAA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T80 Other', 'T80BBB', 1) returning gym_id into gb;
  insert into public.gyms(name, join_code, crm_version) values ('T80 Paused', 'T80SSS', 1) returning gym_id into gs;
  insert into public.gym_owner_keys(gym_id, key_hash) values
    (ga, public._hash_key(ka)), (gb, public._hash_key(kb)), (gs, public._hash_key(kss));
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner', '9000080002', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Desk', '9000080003', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(kst));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'plan', 't80-month', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":150000,"joiningFeeP":50000,"active":true,"sortOrder":2}', 1),
    (ga, 'plan', 't80-quarter', '{"name":"3 months","durationUnit":"month","durationCount":3,"priceP":400000,"joiningFeeP":0,"active":true,"sortOrder":1}', 1),
    (ga, 'plan', 't80-pt', '{"name":"PT 12","durationUnit":"month","durationCount":1,"priceP":600000,"joiningFeeP":0,"active":true,"ptSessions":12,"sortOrder":3}', 1),
    (ga, 'plan', 't80-old', '{"name":"Old plan","durationUnit":"month","durationCount":1,"priceP":100000,"joiningFeeP":0,"active":false,"sortOrder":0}', 1),
    (ga, 'gym', 'gym', '{"name":"T80 Gym","phone":"+91 90000 80001","address":"12 Test Road, Sector 80","gstin":"GSTSECRET80","upiId":"secret80@upi"}', 1),
    (ga, 'member', 't80-secret', '{"fullName":"Secret Member","phone":"+919000080009","archived":false}', 1),
    (ga, 'enquiry', 't80-enq', jsonb_build_object('id', 't80-enq', 'name', 'Neha', 'phone', '+91' || neha, 'interest', 'Evening batch',
       'status', 'open', 'memberId', null, 'source', null), 1),
    (gs, 'gym', 'gym', '{"name":"T80 Paused","phone":"9000080021"}', 1);
  insert into public.gym_timings(gym_id, hours) values
    (ga, '{"week":{"mon":{"kind":"hours","ranges":[{"open":"05:00","close":"22:00"}]},"sun":{"kind":"closed","ranges":[]}},"note":"Ladies batch 11 am"}');

  page := jsonb_build_object('slug', sl, 'about', 'Big gym near the market. Ladies batch at 11.', 'area', '  Sector   80 ',
    'city', 'Testpur', 'highlights', '["ac","women","ac"]'::jsonb,
    'photos', jsonb_build_array(jsonb_build_object('url', 'https://join.mettleup.fit/p/' || ga || '/abcdEFGH12.webp',
                                                   'alt', ' The weights floor ', 'extra', 'dropped')),
    'mapsUrl', 'https://maps.app.goo.gl/abc123', 'lat', 28.5, 'lng', 77.1, 'showPhone', false, 'whatsapp', true);
  ph := 'https://join.mettleup.fit/p/' || ga || '/abcdEFGH12.webp';

  -- 1. Saving: only the owner; every bad field refused before anything is kept.
  checks := checks + 1; fails := fails || pg_temp.t80_is('1staff', pg_temp.t80_err(format('select public.owner_save_gym_page(%L, %L::jsonb)', kst, page::text)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1badkey', pg_temp.t80_err(format('select public.owner_save_gym_page(%L, %L::jsonb)', 'no-such-key', page::text)), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1slug', pg_temp.t80_save(kop, page || '{"slug":"t80 fitness"}')->>'error', 'BAD_SLUG');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1short', pg_temp.t80_save(kop, page || '{"slug":"ab"}')->>'error', 'BAD_SLUG');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1dash', pg_temp.t80_save(kop, page || '{"slug":"-t80-"}')->>'error', 'BAD_SLUG');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1reserved', pg_temp.t80_save(kop, page || '{"slug":"admin"}')->>'error', 'BAD_SLUG');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1noslug', pg_temp.t80_save(kop, page - 'slug')->>'error', 'BAD_SLUG');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1photohost', pg_temp.t80_save(kop, page || jsonb_build_object('photos',
    jsonb_build_array(jsonb_build_object('url', 'https://evil.example/p/' || ga || '/abcdEFGH12.webp'))))->>'error', 'BAD_PHOTOS');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1photogym', pg_temp.t80_save(kop, page || jsonb_build_object('photos',
    jsonb_build_array(jsonb_build_object('url', 'https://join.mettleup.fit/p/' || gb || '/abcdEFGH12.webp'))))->>'error', 'BAD_PHOTOS');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1phototype', pg_temp.t80_save(kop, page || jsonb_build_object('photos',
    jsonb_build_array(jsonb_build_object('url', replace(ph, '.webp', '.svg')))))->>'error', 'BAD_PHOTOS');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1photomany', pg_temp.t80_save(kop, page || jsonb_build_object('photos',
    (select jsonb_agg(jsonb_build_object('url', ph)) from generate_series(1, 7))))->>'error', 'BAD_PHOTOS');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1photoobj', pg_temp.t80_save(kop, page || jsonb_build_object('photos', jsonb_build_object('url', ph)))->>'error', 'BAD_PHOTOS');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1photoalt', pg_temp.t80_save(kop, page || jsonb_build_object('photos',
    jsonb_build_array(jsonb_build_object('url', ph, 'alt', 'More at www.t80.example'))))->>'error', 'BAD_PHOTOS');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1hl', pg_temp.t80_save(kop, page || '{"highlights":["ac","best-gym-in-town"]}')->>'error', 'BAD_HIGHLIGHTS');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1hlobj', pg_temp.t80_save(kop, page || '{"highlights":[{"ac":true}]}')->>'error', 'BAD_HIGHLIGHTS');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1maps', pg_temp.t80_save(kop, page || '{"mapsUrl":"https://evil.example/maps?q=x"}')->>'error', 'BAD_MAPS');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1mapsquote', pg_temp.t80_save(kop, page || '{"mapsUrl":"https://maps.app.goo.gl/a\"onload=x"}')->>'error', 'BAD_MAPS');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1aboutlink', pg_temp.t80_save(kop, page || '{"about":"Offers at https://t80.example/deal"}')->>'error', 'BAD_TEXT');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1aboutwww', pg_temp.t80_save(kop, page || '{"about":"Visit www.t80gym.example"}')->>'error', 'BAD_TEXT');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1aboutbare', pg_temp.t80_save(kop, page || '{"about":"See t80fitness.in for offers"}')->>'error', 'BAD_TEXT');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1aboutlong', pg_temp.t80_save(kop, page || jsonb_build_object('about', repeat('a', 501)))->>'error', 'BAD_TEXT');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1arealink', pg_temp.t80_save(kop, page || '{"area":"bit.ly/t80"}')->>'error', 'BAD_TEXT');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1place', pg_temp.t80_save(kop, page || '{"lat":50}')->>'error', 'BAD_PLACE');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1halfplace', pg_temp.t80_save(kop, page - 'lng')->>'error', 'BAD_PLACE');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1terms', pg_temp.t80_save(kop, page || '{"published":true}')->>'error', 'NEEDS_TERMS');
  checks := checks + 1; fails := fails || pg_temp.t80_is('1nothing', (select count(*) from public.gym_pages where gym_id = ga)::text, '0');

  -- 2. The owner's session saves a draft: kept, cleaned (facilities once each, only url+alt on a photo), not public.
  r := pg_temp.t80_save(kop, page);
  checks := checks + 1; fails := fails || pg_temp.t80_is('2ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('2hl', r->'page'->>'highlights', '["ac", "women"]');
  checks := checks + 1; fails := fails || pg_temp.t80_is('2photo', r->'page'->'photos'->>0, jsonb_build_object('url', ph, 'alt', 'The weights floor')::text);
  checks := checks + 1; fails := fails || pg_temp.t80_is('2area', r->'page'->>'area', 'Sector 80');
  checks := checks + 1; fails := fails || pg_temp.t80_is('2place', (r->'page'->>'lat') || ',' || (r->'page'->>'lng'), '28.5,77.1');
  checks := checks + 1; fails := fails || pg_temp.t80_is('2terms', r->'page'->>'termsAt', null);
  checks := checks + 1; fails := fails || pg_temp.t80_is('2ai', r->'page'->>'aiHelper', 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('2by', (select updated_by::text from public.gym_pages where gym_id = ga), s_owner::text);
  checks := checks + 1; fails := fails || pg_temp.t80_is('2unpublished', public.gym_page_public(sl)::text, null);
  -- The desk sees the page (and its link) but may not save; an old owner key and the owner's session may.
  r := public.owner_gym_page(kst);
  checks := checks + 1; fails := fails || pg_temp.t80_is('2desk', (r->'page'->>'slug') || '/' || (r->>'canEdit'), sl || '/false');
  checks := checks + 1; fails := fails || pg_temp.t80_is('2ownerkey', public.owner_gym_page(ka)->>'canEdit', 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('2ownersession', public.owner_gym_page(kop)->>'canEdit', 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('2nopage', public.owner_gym_page(kb)->>'page', null);
  checks := checks + 1; fails := fails || pg_temp.t80_is('2readkey', pg_temp.t80_err('select public.owner_gym_page(''no-such-key'')'), 'BAD_KEY');

  -- 3. Published with the terms tick: the public data. Plans active only, the gym's order and prices; timings; brand;
  --    no phone (show_phone off) and so no WhatsApp; never a member, the GST number or the UPI ID.
  r := pg_temp.t80_save(kop, page || '{"published":true,"termsAgreed":true}');
  checks := checks + 1; fails := fails || pg_temp.t80_is('3ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('3terms', ((r->'page'->>'termsAt')::bigint > 0)::text, 'true');
  r := public.gym_page_public(sl);
  checks := checks + 1; fails := fails || pg_temp.t80_is('3name', r->>'gymName', 'T80 Gym');
  checks := checks + 1; fails := fails || pg_temp.t80_is('3plans', (select string_agg(x->>'id', ',') from jsonb_array_elements(r->'plans') x), 't80-quarter,t80-month,t80-pt');
  checks := checks + 1; fails := fails || pg_temp.t80_is('3price', (select (x->>'priceP') || '+' || (x->>'joiningFeeP') from jsonb_array_elements(r->'plans') x where x->>'id' = 't80-month'), '150000+50000');
  checks := checks + 1; fails := fails || pg_temp.t80_is('3hours', r->'hours'->'week'->'mon'->'ranges'->0->>'open', '05:00');
  checks := checks + 1; fails := fails || pg_temp.t80_is('3brand', (jsonb_typeof(r->'brand') = 'object' and r->'brand' ? 'accent')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('3address', r->>'address', '12 Test Road, Sector 80');
  checks := checks + 1; fails := fails || pg_temp.t80_is('3nophone', r->'contact'->>'phone', null);
  checks := checks + 1; fails := fails || pg_temp.t80_is('3nowa', r->'contact'->>'whatsapp', 'false');
  checks := checks + 1; fails := fails || pg_temp.t80_is('3join', (r->>'joinOnline') || '/' || (r->>'joinCode'), 'true/T80AAA');
  checks := checks + 1; fails := fails || pg_temp.t80_is('3photos', r->'photos'->0->>'url', ph);
  checks := checks + 1; fails := fails || pg_temp.t80_is('3leak', (r::text like '%9000080%' or r::text like '%Secret%' or r::text like '%GSTSECRET%'
    or r::text like '%secret80%' or r::text like '%t80-old%' or r::text like '%Evening batch%' or r::text like '%Desk%')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t80_is('3case', public.gym_page_public('  ' || upper(sl) || ' ')->>'slug', sl);
  checks := checks + 1; fails := fails || pg_temp.t80_is('3none', public.gym_page_public('t80-no-such-page')::text, null);

  -- 4. "Show my phone number" on: the gym's number (10 digits), and WhatsApp. Saving again keeps the terms tick.
  r := pg_temp.t80_save(kop, page || '{"published":true,"showPhone":true}');
  checks := checks + 1; fails := fails || pg_temp.t80_is('4ok', r->>'ok', 'true');
  r := public.gym_page_public(sl);
  checks := checks + 1; fails := fails || pg_temp.t80_is('4phone', (r->'contact'->>'phone') || '/' || (r->'contact'->>'whatsapp'), '9000080001/true');

  -- 5. Another gym cannot take the slug; it gets its own.
  checks := checks + 1; fails := fails || pg_temp.t80_is('5taken', pg_temp.t80_save(kb, jsonb_build_object('slug', sl))->>'error', 'SLUG_TAKEN');
  checks := checks + 1; fails := fails || pg_temp.t80_is('5own', pg_temp.t80_save(kb, '{"slug":"t80-other","published":true,"termsAgreed":true}')->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('5ownpage', public.gym_page_public('t80-other')->>'gymName', 'T80 Other');

  -- 6. A gym paused by MettleUp: its page shows nothing, questions are refused, the owner cannot change it.
  checks := checks + 1; fails := fails || pg_temp.t80_is('6before', pg_temp.t80_save(kss, '{"slug":"t80-paused","published":true,"termsAgreed":true}')->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('6shown', public.gym_page_public('t80-paused')->>'gymName', 'T80 Paused');
  perform set_config('forgeai.hq', 'on', true);
  update public.gyms set status = 'suspended' where gym_id = gs;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1; fails := fails || pg_temp.t80_is('6public', public.gym_page_public('t80-paused')::text, null);
  checks := checks + 1; fails := fails || pg_temp.t80_is('6ask', public.gym_page_ask_send('t80-paused', 'Ravi Kumar', ravi, 'Are you open on Sunday?', true)->>'error', 'CLOSED');
  checks := checks + 1; fails := fails || pg_temp.t80_is('6report', public.gym_page_report_send('t80-paused', 'closed', null)->>'error', 'NO_GYM');
  checks := checks + 1; fails := fails || pg_temp.t80_is('6save', pg_temp.t80_err(format('select public.owner_save_gym_page(%L, %L::jsonb)', kss, '{"slug":"t80-paused"}')), 'SUSPENDED');

  -- 7. "Ask the gym": refusals first, nothing kept.
  checks := checks + 1; fails := fails || pg_temp.t80_is('7noslug', public.gym_page_ask_send('t80-no-such-page', 'Ravi Kumar', ravi, 'Is there a ladies batch?', true)->>'error', 'NO_GYM');
  checks := checks + 1; fails := fails || pg_temp.t80_is('7consent', public.gym_page_ask_send(sl, 'Ravi Kumar', ravi, 'Is there a ladies batch?', false)->>'error', 'NO_CONSENT');
  checks := checks + 1; fails := fails || pg_temp.t80_is('7consentnull', public.gym_page_ask_send(sl, 'Ravi Kumar', ravi, 'Is there a ladies batch?', null)->>'error', 'NO_CONSENT');
  checks := checks + 1; fails := fails || pg_temp.t80_is('7url', public.gym_page_ask_send(sl, 'Ravi Kumar', ravi, 'Cheap protein at https://x.example', true)->>'error', 'BAD_QUESTION');
  checks := checks + 1; fails := fails || pg_temp.t80_is('7bare', public.gym_page_ask_send(sl, 'Ravi Kumar', ravi, 'Best deals on t80deals.com', true)->>'error', 'BAD_QUESTION');
  checks := checks + 1; fails := fails || pg_temp.t80_is('7short', public.gym_page_ask_send(sl, 'Ravi Kumar', ravi, 'hi', true)->>'error', 'BAD_QUESTION');
  checks := checks + 1; fails := fails || pg_temp.t80_is('7long', public.gym_page_ask_send(sl, 'Ravi Kumar', ravi, repeat('q', 501), true)->>'error', 'BAD_QUESTION');
  checks := checks + 1; fails := fails || pg_temp.t80_is('7phone', public.gym_page_ask_send(sl, 'Ravi Kumar', '12345', 'Is there a ladies batch?', true)->>'error', 'BAD_PHONE');
  checks := checks + 1; fails := fails || pg_temp.t80_is('7name', public.gym_page_ask_send(sl, ' 1 ', ravi, 'Is there a ladies batch?', true)->>'error', 'BAD_NAME');
  checks := checks + 1; fails := fails || pg_temp.t80_is('7nothing', (select count(*) from public.crm_records where kind = 'enquiry' and gym_id in (ga, gb, gs))::text, '1');

  -- 8. Ravi asks: a new Enquiry "Asked on your web page", the version moved, one instant alert (no number, no question).
  select crm_version into v0 from public.gyms where gym_id = ga;
  r := public.gym_page_ask_send(sl, '  Ravi   Kumar ', '+91 90000 80011', 'Is there a ladies batch?', true);
  checks := checks + 1; fails := fails || pg_temp.t80_is('8ok', r::text, '{"ok": true}');
  select data into e from public.crm_records where gym_id = ga and kind = 'enquiry' and data->>'phone' = '+91' || ravi;
  checks := checks + 1; fails := fails || pg_temp.t80_is('8name', e->>'name', 'Ravi Kumar');
  checks := checks + 1; fails := fails || pg_temp.t80_is('8id', (e->>'id' ~ '^page-[0-9a-f]{32}$')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('8interest', e->>'interest', 'Asked on your web page: Is there a ladies batch?');
  checks := checks + 1; fails := fails || pg_temp.t80_is('8question', e->'pageAsk'->>'question', 'Is there a ladies batch?');
  checks := checks + 1; fails := fails || pg_temp.t80_is('8consent', ((e->'pageAsk'->>'consentAt')::bigint > 0)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('8status', (e->>'status') || '/' || (e->>'followUpOn'), 'open/' || d_today);
  select crm_version into v1 from public.gyms where gym_id = ga;
  checks := checks + 1; fails := fails || pg_temp.t80_is('8version', (v1 = v0 + 1)::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('8recver', (select version from public.crm_records where gym_id = ga and kind = 'enquiry' and id = e->>'id')::text, v1::text);
  checks := checks + 1; fails := fails || pg_temp.t80_is('8alert', (select count(*) from public.gym_alerts where gym_id = ga and kind = 'page_question' and ref_id = e->>'id' and urgent and audience = 'all' and route = '/enquiries')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t80_is('8line', (select line from public.gym_alerts where gym_id = ga and kind = 'page_question' and ref_id = e->>'id'),
    'Ravi asked a question on your web page. Reply from Enquiries.');
  checks := checks + 1; fails := fails || pg_temp.t80_is('8othergym', (select count(*) from public.crm_records where gym_id = gb and kind = 'enquiry')::text, '0');

  -- 9. Neha has an open enquiry: the question goes on THAT enquiry (her name and interest kept), still one row for her.
  r := public.gym_page_ask_send(sl, 'Neha Sharma', neha, 'What are the fees for students?', true);
  checks := checks + 1; fails := fails || pg_temp.t80_is('9ok', r->>'ok', 'true');
  select data into e from public.crm_records where gym_id = ga and kind = 'enquiry' and id = 't80-enq';
  checks := checks + 1; fails := fails || pg_temp.t80_is('9name', e->>'name', 'Neha');
  checks := checks + 1; fails := fails || pg_temp.t80_is('9interest', e->>'interest', 'Evening batch');
  checks := checks + 1; fails := fails || pg_temp.t80_is('9question', e->'pageAsk'->>'question', 'What are the fees for students?');
  checks := checks + 1; fails := fails || pg_temp.t80_is('9follow', e->>'followUpOn', d_today);
  checks := checks + 1; fails := fails || pg_temp.t80_is('9one', (select count(*) from public.crm_records where gym_id = ga and kind = 'enquiry' and public._norm_phone(data->>'phone') = neha)::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t80_is('9alert', (select count(*) from public.gym_alerts where gym_id = ga and kind = 'page_question' and ref_id = 't80-enq')::text, '1');

  -- 10. Limits: 3 a day per number, 40 a day per gym.
  for i in 2..3 loop
    r := public.gym_page_ask_send(sl, 'Ravi Kumar', ravi, 'Question number ' || i, true);
  end loop;
  checks := checks + 1; fails := fails || pg_temp.t80_is('10third', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('10number', public.gym_page_ask_send(sl, 'Ravi Kumar', ravi, 'One more question', true)->>'error', 'TOO_MANY');
  checks := checks + 1; fails := fails || pg_temp.t80_is('10oneenq', (select count(*) from public.crm_records where gym_id = ga and kind = 'enquiry' and data->>'phone' = '+91' || ravi)::text, '1');
  insert into public.gym_page_asks(gym_id, phone) select ga, '9000080099' from generate_series(1, 40);
  checks := checks + 1; fails := fails || pg_temp.t80_is('10gym', public.gym_page_ask_send(sl, 'Late Comer', '9000080013', 'Is there parking?', true)->>'error', 'TOO_MANY');

  -- 11. "Report this page".
  checks := checks + 1; fails := fails || pg_temp.t80_is('11ok', public.gym_page_report_send(sl, 'wrong', '  Fees are old  ')->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('11row', (select reason || '/' || details from public.gym_page_reports where gym_id = ga), 'wrong/Fees are old');
  checks := checks + 1; fails := fails || pg_temp.t80_is('11reason', public.gym_page_report_send(sl, 'spam', null)->>'error', 'BAD_REASON');
  checks := checks + 1; fails := fails || pg_temp.t80_is('11nullreason', public.gym_page_report_send(sl, null, null)->>'error', 'BAD_REASON');
  checks := checks + 1; fails := fails || pg_temp.t80_is('11noslug', public.gym_page_report_send('t80-no-such-page', 'scam', null)->>'error', 'NO_GYM');
  checks := checks + 1; fails := fails || pg_temp.t80_is('11one', (select count(*) from public.gym_page_reports where gym_id = ga)::text, '1');

  -- 12. MettleUp HQ takes the page down (a note needed, written to the HQ log); the owner sees it and cannot undo it.
  checks := checks + 1; fails := fails || pg_temp.t80_is('12noreason', pg_temp.t80_err(format('select public.hq_hide_gym_page(%L, %L, true, null)', hq, sl)), 'NEED_REASON');
  checks := checks + 1; fails := fails || pg_temp.t80_is('12noactor', pg_temp.t80_err(format('select public.hq_hide_gym_page(%L, %L, true, %L)', 'nobody', sl, 'Photos are copied')), 'NO_ACTOR');
  checks := checks + 1; fails := fails || pg_temp.t80_is('12stillshown', public.gym_page_public(sl)->>'slug', sl);
  checks := checks + 1; fails := fails || pg_temp.t80_is('12hide', public.hq_hide_gym_page(hq, sl, true, 'Photos are copied')->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('12public', public.gym_page_public(sl)::text, null);
  checks := checks + 1; fails := fails || pg_temp.t80_is('12ask', public.gym_page_ask_send(sl, 'Asha Rao', '9000080014', 'Is there parking?', true)->>'error', 'NO_GYM');
  checks := checks + 1; fails := fails || pg_temp.t80_is('12report', public.gym_page_report_send(sl, 'scam', null)->>'error', 'NO_GYM');
  r := public.owner_gym_page(kop);
  checks := checks + 1; fails := fails || pg_temp.t80_is('12owner', (r->'page'->>'hiddenByHq') || '/' || (r->'page'->>'hqNote'), 'true/Photos are copied');
  checks := checks + 1; fails := fails || pg_temp.t80_is('12log', (select count(*) from public.hq_audit where gym_id = ga and action = 'hide_gym_page' and actor = hq)::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t80_is('12resave', pg_temp.t80_save(kop, page || '{"published":true}')->'page'->>'hiddenByHq', 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('12stillhidden', public.gym_page_public(sl)::text, null);
  checks := checks + 1; fails := fails || pg_temp.t80_is('12unknown', public.hq_hide_gym_page(hq, 't80-no-such-page', true, 'Spam page')->>'ok', 'false');
  -- HQ can hide a paused gym's page too (its own write passes the pause).
  checks := checks + 1; fails := fails || pg_temp.t80_is('12paused', public.hq_hide_gym_page(hq, 't80-paused', true, 'Gym has closed')->>'ok', 'true');
  -- And puts it back: shown again, the note cleared.
  checks := checks + 1; fails := fails || pg_temp.t80_is('12show', public.hq_hide_gym_page(hq, sl, false, null)->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('12back', public.gym_page_public(sl)->>'slug', sl);
  checks := checks + 1; fails := fails || pg_temp.t80_is('12note', public.owner_gym_page(kop)->'page'->>'hqNote', null);

  -- 13. Who may call what: the five page functions without signing in (each checks a key or the slug itself); HQ's only
  --     with the service key; the helpers and the tables never.
  checks := checks + 1; fails := fails || pg_temp.t80_is('13anon',
    (has_function_privilege('anon', 'public.owner_gym_page(text)', 'execute')
     and has_function_privilege('anon', 'public.owner_save_gym_page(text, jsonb)', 'execute')
     and has_function_privilege('anon', 'public.gym_page_public(text)', 'execute')
     and has_function_privilege('anon', 'public.gym_page_ask_send(text, text, text, text, boolean)', 'execute')
     and has_function_privilege('anon', 'public.gym_page_report_send(text, text, text)', 'execute'))::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('13hq',
    (has_function_privilege('anon', 'public.hq_hide_gym_page(text, text, boolean, text)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_hide_gym_page(text, text, boolean, text)', 'execute'))::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t80_is('13service', has_function_privilege('service_role', 'public.hq_hide_gym_page(text, text, boolean, text)', 'execute')::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t80_is('13helpers',
    (has_function_privilege('anon', 'public._gym_page_plans(uuid)', 'execute')
     or has_function_privilege('anon', 'public._gym_details(uuid)', 'execute')
     or has_function_privilege('anon', 'public._gym_page_has_link(text)', 'execute')
     or has_function_privilege('anon', 'public._gym_page_json(public.gym_pages)', 'execute'))::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t80_is('13tables',
    (has_table_privilege('anon', 'public.gym_pages', 'select') or has_table_privilege('anon', 'public.gym_page_asks', 'select')
     or has_table_privilege('anon', 'public.gym_page_reports', 'select') or has_table_privilege('authenticated', 'public.gym_pages', 'select'))::text, 'false');

  -- 14. 0075's older kinds, and 0077's, still work alongside the new one.
  perform public._alert(ga, 'shop_order', 't80-order', 'order:t80-order', 'all', true, 'New shop order T80 from Ravi. Get it ready on Shop.', '/shop');
  perform public._alert(ga, 'online_join', 't80-join', 'online_join:t80-join', 'all', true, 'Ravi asked to join your gym online. Make them a member on Today.', '/');
  checks := checks + 1; fails := fails || pg_temp.t80_is('14oldkinds', (select count(*) from public.gym_alerts where tag in ('order:t80-order', 'online_join:t80-join'))::text, '2');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
