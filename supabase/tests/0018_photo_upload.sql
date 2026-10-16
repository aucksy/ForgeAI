-- Logo and product-photo upload test (C8-7, 16 Oct 2026). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed.
--
-- The panel uploads a logo or a product photo straight to Supabase Storage AS ANON, into a folder
-- named after a one-time upload ticket. Storage writes the file row into storage.objects under the
-- caller's role, and the upload policy (0004 / 0005) calls public._photo_ticket_ok(name) to check
-- the ticket. This does exactly that insert as anon (with the claims the API sets), so a missing
-- EXECUTE grant on the policy's function shows up here as "permission denied for function".
do $$
declare
  gid uuid; ko text := 'upload-test-owner'; t text;
  fails text := ''; checks int := 0; b text;
begin
  insert into public.gyms(name, join_code) values ('Upload Test Gym', 'UPLDT1') returning gym_id into gid;
  insert into public.gym_owner_keys(gym_id, key_hash) values (gid, public._hash_key(ko));
  t := public.owner_photo_ticket(ko);

  -- 1. A file under a fresh ticket goes in, for both buckets.
  foreach b in array array['gym-logos', 'product-photos'] loop
    begin
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      execute 'set local role anon';
      insert into storage.objects(bucket_id, name) values (b, t || '/test-' || b || '.png');
      reset role;
    exception when others then
      reset role;
      fails := fails || ' 1:' || b || ':' || sqlerrm;
    end;
    checks := checks + 1;
  end loop;

  -- 2. A made-up ticket is still refused (the policy still checks).
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    insert into storage.objects(bucket_id, name)
      values ('gym-logos', repeat('ab', 24) || '/nope.png');
    reset role;
    fails := fails || ' 2:a made-up ticket uploaded';
  exception when others then
    reset role;
    if sqlerrm not like '%row-level security%' then fails := fails || ' 2:' || sqlerrm; end if;
  end;
  checks := checks + 1;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
