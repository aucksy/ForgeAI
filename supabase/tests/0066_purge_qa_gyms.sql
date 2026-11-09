-- Nightly test-gym purge test (0066). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor once 0066 is applied. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error undoes the test rows (and any purge it did);
--   "RESULT FAIL: ..."         — the checks that failed (label:what came back).

do $$
declare
  fails text := ''; checks int := 0; r jsonb;
  old_qa uuid; new_qa uuid; real_a uuid; real_b uuid; real_c uuid; dab uuid;
begin
  insert into public.gyms(name, join_code) values ('QA Test Gym', 'T66QA1') returning gym_id into old_qa;
  insert into public.gyms(name, join_code) values ('QA Inbox Gym', 'T66QA2') returning gym_id into new_qa;
  insert into public.gyms(name, join_code) values ('Qa Fitness', 'T66RL1') returning gym_id into real_a;
  insert into public.gyms(name, join_code) values ('QAFit Studio', 'T66RL2') returning gym_id into real_b;
  insert into public.gyms(name, join_code) values ('Iron QA Gym', 'T66RL3') returning gym_id into real_c;
  update public.gyms set created_at = now() - interval '3 days' where gym_id in (old_qa, real_a, real_b, real_c);
  select gym_id into dab from public.gyms where join_code = 'DAB8DE';
  if dab is null then
    insert into public.gyms(name, join_code) values ('QA Client', 'DAB8DE') returning gym_id into dab;
  end if;
  update public.gyms set created_at = now() - interval '3 days' where gym_id = dab;

  r := public.hq_purge_qa_gyms();

  -- 1. The old QA gym is gone; the one made today stays (a run may still be using it).
  checks := checks + 1; if exists (select 1 from public.gyms where gym_id = old_qa) then fails := fails || ' 1old'; end if;
  checks := checks + 1; if not exists (select 1 from public.gyms where gym_id = new_qa) then fails := fails || ' 1new'; end if;
  -- 2. Real gyms that only look alike stay: other case, no space, QA in the middle.
  checks := checks + 1; if (select count(*) from public.gyms where gym_id in (real_a, real_b, real_c)) <> 3 then fails := fails || ' 2real'; end if;
  -- 3. DAB8DE stays whatever its name.
  checks := checks + 1; if not exists (select 1 from public.gyms where gym_id = dab) then fails := fails || ' 3dab'; end if;
  -- 4. The answer and the audit row name what went.
  checks := checks + 1; if not (r->'gyms') @> '[{"code":"T66QA1"}]'::jsonb then fails := fails || ' 4answer:' || r::text; end if;
  checks := checks + 1;
  if not exists (select 1 from public.hq_audit where action = 'purge_qa_gyms' and detail->'gyms' @> '[{"code":"T66QA1"}]'::jsonb) then
    fails := fails || ' 4audit';
  end if;
  -- 5. Only HQ's service role may call it.
  checks := checks + 1;
  if has_function_privilege('anon', 'public.hq_purge_qa_gyms()', 'execute')
     or has_function_privilege('authenticated', 'public.hq_purge_qa_gyms()', 'execute')
     or not has_function_privilege('service_role', 'public.hq_purge_qa_gyms()', 'execute') then
    fails := fails || ' 5grants';
  end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
