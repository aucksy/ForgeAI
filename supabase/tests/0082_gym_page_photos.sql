-- Gym page photos test (0082, F207, R-529). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- The admin app uploads AS ANON straight to Supabase Storage, so the inserts and reads below run as anon with the claims
-- the API sets: a missing grant on a policy's check shows up here as "permission denied for function".

create or replace function pg_temp.t82_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

-- An upload as anon: 'ok' or the error.
create or replace function pg_temp.t82_put(p_bucket text, p_name text) returns text
  language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  insert into storage.objects(bucket_id, name) values (p_bucket, p_name);
  reset role;
  return 'ok';
exception when others then
  reset role;
  return case when sqlerrm like '%row-level security%' then 'refused' else sqlerrm end;
end $$;

-- How many files of that name anon can read (0 or 1), or the error.
create or replace function pg_temp.t82_see(p_name text) returns text
  language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  select count(*) into n from storage.objects where bucket_id = 'gym-page-photos' and name = p_name;
  reset role;
  return n::text;
exception when others then
  reset role;
  return sqlerrm;
end $$;

create or replace function pg_temp.t82_err(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'no error';
exception when others then
  return sqlerrm;
end $$;

do $$
declare
  ga uuid; gb uuid; s_owner uuid; s_staff uuid;
  ka text := 't82-owner-key-a'; kb text := 't82-owner-key-b'; kop text := 't82-owner-session'; kst text := 't82-staff-session';
  r jsonb; rb jsonb; path text; url text; other text; fails text := ''; checks int := 0; i int;
begin
  insert into public.gyms(name, join_code, crm_version) values ('T82 Gym', 'T82AAA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T82 Other', 'T82BBB', 1) returning gym_id into gb;
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(ka)), (gb, public._hash_key(kb));
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner', '9000082002', 'owner') returning staff_id into s_owner;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Desk', '9000082003', 'staff') returning staff_id into s_staff;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop)), (s_staff, public._hash_key(kst));

  -- 1. The bucket is private and takes WebP only.
  checks := checks + 1;
  fails := fails || pg_temp.t82_is('1bucket', (select b.public::text || ':' || array_to_string(b.allowed_mime_types, ',') || ':' || b.file_size_limit
                                                 from storage.buckets b where b.id = 'gym-page-photos'), 'false:image/webp:1048576');

  -- 2. A slot: the owner only; a desk key and a made-up key are refused.
  checks := checks + 1; fails := fails || pg_temp.t82_is('2staff', pg_temp.t82_err(format('select public.owner_gym_page_photo_slot(%L)', kst)), 'OWNER_ONLY');
  checks := checks + 1; fails := fails || pg_temp.t82_is('2badkey', pg_temp.t82_err(format('select public.owner_gym_page_photo_slot(%L)', 'no-such-key')), 'BAD_KEY');
  r := public.owner_gym_page_photo_slot(kop);
  path := r->>'path'; url := r->>'url';
  checks := checks + 1; fails := fails || pg_temp.t82_is('2ok', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t82_is('2gym', r->>'gymId', ga::text);
  checks := checks + 1; fails := fails || pg_temp.t82_is('2path', (path ~ ('^' || ga::text || '/[0-9a-f]{32}\.webp$'))::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t82_is('2url', url, 'https://join.mettleup.fit/p/' || path);

  -- 3. Uploading: only at the slot's own name, in this bucket.
  checks := checks + 1; fails := fails || pg_temp.t82_is('3ok', pg_temp.t82_put('gym-page-photos', path), 'ok');
  -- The same name again (an overwrite): never (a duplicate, or the policy).
  checks := checks + 1; fails := fails || pg_temp.t82_is('3again', (pg_temp.t82_put('gym-page-photos', path) <> 'ok')::text, 'true');
  -- Another gym's folder with the same id, a made-up id, another type, another bucket: all refused.
  other := gb::text || '/' || split_part(path, '/', 2);
  checks := checks + 1; fails := fails || pg_temp.t82_is('3othergym', pg_temp.t82_put('gym-page-photos', other), 'refused');
  checks := checks + 1; fails := fails || pg_temp.t82_is('3madeup', pg_temp.t82_put('gym-page-photos', ga::text || '/' || repeat('ab', 16) || '.webp'), 'refused');
  checks := checks + 1; fails := fails || pg_temp.t82_is('3jpg', pg_temp.t82_put('gym-page-photos', replace(path, '.webp', '.jpg')), 'refused');
  rb := public.owner_gym_page_photo_slot(kb);
  checks := checks + 1; fails := fails || pg_temp.t82_is('3logos', pg_temp.t82_put('gym-logos', rb->>'path'), 'refused');
  -- An expired slot.
  update public.gym_page_photo_slots set expires_at = now() - interval '1 minute' where photo_id = left(split_part(rb->>'path', '/', 2), 32);
  checks := checks + 1; fails := fails || pg_temp.t82_is('3expired', pg_temp.t82_put('gym-page-photos', rb->>'path'), 'refused');

  -- 4. Reading: not before the photo is on the page row; then yes; never while HQ has the page down; gone once removed.
  checks := checks + 1; fails := fails || pg_temp.t82_is('4before', pg_temp.t82_see(path), '0');
  r := public.owner_save_gym_page(kop, jsonb_build_object('slug', 't82-fitness', 'photos', jsonb_build_array(jsonb_build_object('url', url, 'alt', 'Floor'))));
  checks := checks + 1; fails := fails || pg_temp.t82_is('4saved', r->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t82_is('4draft', pg_temp.t82_see(path), '1');
  update public.gym_pages set hidden_by_hq = true, hq_note = 'Test' where gym_id = ga;
  checks := checks + 1; fails := fails || pg_temp.t82_is('4hidden', pg_temp.t82_see(path), '0');
  update public.gym_pages set hidden_by_hq = false, hq_note = null where gym_id = ga;
  r := public.owner_save_gym_page(kop, jsonb_build_object('slug', 't82-fitness', 'photos', '[]'::jsonb));
  checks := checks + 1; fails := fails || pg_temp.t82_is('4removed', pg_temp.t82_see(path), '0');
  -- Gym B's owner cannot point his page at gym A's photo (0080's address rule).
  r := public.owner_save_gym_page(kb, jsonb_build_object('slug', 't82-other', 'photos', jsonb_build_array(jsonb_build_object('url', url, 'alt', ''))));
  checks := checks + 1; fails := fails || pg_temp.t82_is('4borrow', r->>'error', 'BAD_PHOTOS');

  -- 5. Limits: at most 12 open slots.
  for i in 1..15 loop r := public.owner_gym_page_photo_slot(kop); end loop;
  checks := checks + 1; fails := fails || pg_temp.t82_is('5busy', r->>'error', 'BUSY');
  checks := checks + 1;
  fails := fails || pg_temp.t82_is('5open', (select count(*) from public.gym_page_photo_slots where gym_id = ga and expires_at > now())::text, '12');

  -- 6. The slot table is not readable by anyone outside.
  checks := checks + 1;
  fails := fails || pg_temp.t82_is('6table', pg_temp.t82_err('set local role anon; select count(*) from public.gym_page_photo_slots'), 'permission denied for table gym_page_photo_slots');
  reset role;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
