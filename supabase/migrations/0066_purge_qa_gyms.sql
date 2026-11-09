-- 0066: the phone tests' own gyms are deleted every night (owner: "auto-delete QA gyms", 9 Nov 2026, R-423).
-- ADDITIVE and re-runnable: one new hq_* function. Changes nothing that exists.
-- Test: supabase/tests/0066_purge_qa_gyms.sql (CI runs it after every migration; pasted into the SQL Editor it
-- always ends in an error and so changes nothing).
--
-- Each phone-test run (apps/mobile/qa/qa_gyms.py and the journeys/conditions runs) makes 3-5 gyms on the LIVE
-- server through demo_start_gym, all named "QA ..." (capital Q, capital A, a space). Nothing could delete them,
-- so the database filled up again after the 9 Nov clean slate.
--
-- hq_purge_qa_gyms() deletes, at most 100 a night, every gym whose name starts with exactly "QA " and that is
-- more than 1 day old (a run still going is never touched). DAB8DE (RAM Fitness Club, the client gym) is never
-- touched, whatever its name. A real gym called "Qa Fitness" or "QAFit" does not match (case and space matter).
-- The gym's rows go with it through the existing foreign-key cascades (gym_terms_acceptance's append-only
-- trigger already lets a cascade from a deleted gym through). One hq_audit row lists the codes and names.
-- Called by the HQ Worker's nightly Cron Trigger (deploy/hq/worker.js nightly()), after hq_nightly_cleanup.

create or replace function public.hq_purge_qa_gyms()
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare gone jsonb; n int;
begin
  perform public._hq_guard();
  perform set_config('lock_timeout', '3s', true);
  with victims as (
    select gym_id from public.gyms
     where name like 'QA %'
       and join_code <> 'DAB8DE'
       and created_at < now() - interval '1 day'
     order by created_at
     limit 100
  ), del as (
    delete from public.gyms g using victims v where g.gym_id = v.gym_id
    returning g.join_code, g.name
  )
  select coalesce(jsonb_agg(jsonb_build_object('code', join_code, 'name', name)), '[]'::jsonb), count(*)
    into gone, n from del;
  insert into public.hq_audit(actor, action, detail)
    values ('nightly-cleanup', 'purge_qa_gyms', jsonb_build_object('deleted', n, 'gyms', gone));
  return jsonb_build_object('deleted', n, 'gyms', gone);
end $$;

revoke all on function public.hq_purge_qa_gyms() from public, anon, authenticated;
grant execute on function public.hq_purge_qa_gyms() to service_role;
