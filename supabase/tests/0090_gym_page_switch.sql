-- HQ's per-gym web page switch test (0090, F207, R-563). Runs in CI after every migration (scripts/ci/db_checks.sh);
-- can also be pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90000 90xxx); the gyms are made here and undone with the rest.

create or replace function pg_temp.t90_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

create or replace function pg_temp.t90_err(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'no error';
exception when others then
  return sqlerrm;
end $$;

do $$
declare
  ga uuid; gb uuid; s_owner uuid;
  ka text := 't90-owner-key-a'; kb text := 't90-owner-key-b'; kop text := 't90-owner-session';
  sla text := 't90-fitness-sector-90'; slb text := 't90-other-gym';
  hq text := 'hq-test@example.com';
  page jsonb := '{"about":"Big gym near the market.","area":"Sector 90","city":"Testpur","highlights":["ac"],"photos":[],
                  "mapsUrl":"","showPhone":false,"whatsapp":false,"indexable":false,"published":true,"termsAgreed":true}';
  r jsonb; fails text := ''; checks int := 0;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T90 Gym', 'T90AAA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T90 Other', 'T90BBB', 1) returning gym_id into gb;
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(ka)), (gb, public._hash_key(kb));
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner', '9000090002', 'owner') returning staff_id into s_owner;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'plan', 't90-month', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":150000,"joiningFeeP":0,"active":true,"sortOrder":1}', 1),
    (gb, 'plan', 't90-month', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":120000,"joiningFeeP":0,"active":true,"sortOrder":1}', 1);

  -- 1. On by default: no row, both pages published and shown.
  checks := checks + 1; fails := fails || pg_temp.t90_is('1savea', (public.owner_save_gym_page(kop, page || jsonb_build_object('slug', sla))->>'ok'), 'true');
  checks := checks + 1; fails := fails || pg_temp.t90_is('1saveb', (public.owner_save_gym_page(kb, page || jsonb_build_object('slug', slb))->>'ok'), 'true');
  checks := checks + 1; fails := fails || pg_temp.t90_is('1publica', public.gym_page_public(sla)->>'slug', sla);
  r := public.hq_web_page(hq, ga);
  checks := checks + 1; fails := fails || pg_temp.t90_is('1hqread', (r->>'pageOn') || '/' || (r->>'slug') || '/' || (r->>'published') || '/' || (r->>'hiddenByHq'), 'true/' || sla || '/true/false');
  checks := checks + 1; fails := fails || pg_temp.t90_is('1owner', (public.owner_gym_page(kop) ? 'off')::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t90_is('1nopage', (public.hq_web_page(hq, gb)->>'pageOn'), 'true');

  -- 2. Refused: no actor, a gym that is not there.
  checks := checks + 1; fails := fails || pg_temp.t90_is('2noactor', pg_temp.t90_err(format('select public.hq_set_web_page(%L, %L::uuid, false, null)', 'nobody', ga)), 'NO_ACTOR');
  checks := checks + 1; fails := fails || pg_temp.t90_is('2gone', pg_temp.t90_err(format('select public.hq_set_web_page(%L, %L::uuid, false, null)', hq, gen_random_uuid())), 'GONE');
  checks := checks + 1; fails := fails || pg_temp.t90_is('2stillon', public.gym_page_public(sla)->>'slug', sla);

  -- 3. Off for gym A only: its page "not here", its admin app sees off, the page row kept; gym B untouched; logged.
  r := public.hq_set_web_page(hq, ga, false, 'Owner asked to stop the page for now');
  checks := checks + 1; fails := fails || pg_temp.t90_is('3off', (r->>'ok') || '/' || (r->>'pageOn'), 'true/false');
  checks := checks + 1; fails := fails || pg_temp.t90_is('3public', public.gym_page_public(sla)::text, null);
  r := public.owner_gym_page(kop);
  checks := checks + 1; fails := fails || pg_temp.t90_is('3owner', (r->>'off') || '/' || coalesce(r->>'page', 'none') || '/' || (r->>'canEdit'), 'true/none/false');
  checks := checks + 1; fails := fails || pg_temp.t90_is('3hqread', public.hq_web_page(hq, ga)->>'pageOn', 'false');
  checks := checks + 1; fails := fails || pg_temp.t90_is('3kept', (select count(*) from public.gym_pages where gym_id = ga and slug = sla and published)::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t90_is('3other', public.gym_page_public(slb)->>'slug', slb);
  checks := checks + 1; fails := fails || pg_temp.t90_is('3log', (select count(*) from public.hq_audit where gym_id = ga and action = 'gym_page_off' and actor = hq
    and reason = 'Owner asked to stop the page for now')::text, '1');
  -- The join link is not part of this switch: Join online still answers for the gym.
  checks := checks + 1; fails := fails || pg_temp.t90_is('3join', public.self_join_preview('T90AAA')->>'gymName', 'T90 Gym');
  -- Off twice is fine (one row).
  perform public.hq_set_web_page(hq, ga, false, null);
  checks := checks + 1; fails := fails || pg_temp.t90_is('3once', (select count(*) from public.gym_page_off where gym_id = ga)::text, '1');

  -- 4. Back on: shown again exactly as it was; logged.
  checks := checks + 1; fails := fails || pg_temp.t90_is('4on', public.hq_set_web_page(hq, ga, true, null)->>'pageOn', 'true');
  checks := checks + 1; fails := fails || pg_temp.t90_is('4public', public.gym_page_public(sla)->>'about', 'Big gym near the market.');
  checks := checks + 1; fails := fails || pg_temp.t90_is('4owner', public.owner_gym_page(kop)->'page'->>'slug', sla);
  checks := checks + 1; fails := fails || pg_temp.t90_is('4log', (select count(*) from public.hq_audit where gym_id = ga and action = 'gym_page_on')::text, '1');

  -- 5. Who may call what: HQ's two only with the service key; the table never.
  checks := checks + 1; fails := fails || pg_temp.t90_is('5anon',
    (has_function_privilege('anon', 'public.hq_web_page(text, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_web_page(text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.hq_set_web_page(text, uuid, boolean, text)', 'execute')
     or has_function_privilege('authenticated', 'public.hq_set_web_page(text, uuid, boolean, text)', 'execute'))::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t90_is('5service',
    (has_function_privilege('service_role', 'public.hq_web_page(text, uuid)', 'execute')
     and has_function_privilege('service_role', 'public.hq_set_web_page(text, uuid, boolean, text)', 'execute'))::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t90_is('5table',
    (has_table_privilege('anon', 'public.gym_page_off', 'select') or has_table_privilege('authenticated', 'public.gym_page_off', 'select'))::text, 'false');
  checks := checks + 1; fails := fails || pg_temp.t90_is('5ownerstill', has_function_privilege('anon', 'public.owner_gym_page(text)', 'execute')::text, 'true');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
