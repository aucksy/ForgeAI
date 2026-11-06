-- Entry machines test (0058, F103 / T77 step 1). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  — everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         — the checks that failed.
-- The same rules as the TypeScript reference (apps/dashboard/test/crm/machines/*.test.ts).
do $$
declare
  gid uuid; gid2 uuid; mid uuid; mid2 uuid;
  r jsonb; n bigint; c1 bigint; c2 bigint; c3 bigint;
  t0 bigint := 1793928600000;  -- 2026-11-06 07:00:00 IST
  fails text := ''; checks int := 0; raised boolean;
begin
  insert into public.gyms(name, join_code) values ('EM Test Gym', 'EMTST1') returning gym_id into gid;
  insert into public.gyms(name, join_code) values ('EM Other Gym', 'EMTST2') returning gym_id into gid2;
  insert into public.entry_machines(gym_id, serial, name) values (gid, 'EMTESTSERIAL1', 'Front door') returning machine_id into mid;
  insert into public.entry_machines(gym_id, serial, name) values (gid2, 'EMTESTSERIAL2', 'Other') returning machine_id into mid2;
  insert into public.entry_machine_members(gym_id, member_no, member_id) values (gid, '1001', 'em-ravi'), (gid, '1002', 'em-priya');

  -- The machine by serial; an unknown serial is null.
  r := public.gate_machine('EMTESTSERIAL1');
  checks := checks + 1;
  if r->>'id' <> mid::text or (r->>'tzMinutes')::int <> 330 or (r->>'paused')::boolean then fails := fails || ' machine:' || r::text; end if;
  checks := checks + 1;
  if public.gate_machine('NOBODY') is not null then fails := fails || ' unknown-serial'; end if;

  -- Member numbers: only this gym's.
  r := public.gate_member_nos(gid, array['1001', '9999']);
  checks := checks + 1;
  if r <> '{"1001": "em-ravi"}'::jsonb then fails := fails || ' nos:' || r::text; end if;
  checks := checks + 1;
  if public.gate_member_nos(gid2, array['1001']) <> '{}'::jsonb then fails := fails || ' nos-other-gym'; end if;

  -- Punches: a visit, an unknown member, a refusal; the same punch twice is kept once.
  r := public.gate_save_punches(mid,
    jsonb_build_array(
      jsonb_build_object('memberNo', '1001', 'memberId', 'em-ravi', 'at', t0, 'localTime', '2026-11-06 07:00:00', 'kind', 'visit', 'verify', 'finger'),
      jsonb_build_object('memberNo', '5555', 'memberId', null, 'at', t0, 'localTime', '2026-11-06 07:00:00', 'kind', 'unknown-member', 'verify', 'finger'),
      jsonb_build_object('memberNo', '1002', 'memberId', 'em-priya', 'at', t0, 'localTime', '2026-11-06 07:00:00', 'kind', 'refused', 'verify', 'face', 'reason', 'event 27'),
      jsonb_build_object('memberNo', 'bad', 'at', t0, 'kind', 'visit')),
    jsonb_build_array(jsonb_build_object('memberId', 'em-ravi', 'visitedOn', '2026-11-06', 'checkedInAt', t0),
                      jsonb_build_object('memberId', 'not-ours', 'visitedOn', '2026-11-06', 'checkedInAt', t0)));
  checks := checks + 1;
  if r <> '{"punches": 3, "visits": 1}'::jsonb then fails := fails || ' save:' || r::text; end if;
  r := public.gate_save_punches(mid,
    jsonb_build_array(jsonb_build_object('memberNo', '1001', 'memberId', 'em-ravi', 'at', t0, 'localTime', '2026-11-06 07:00:00', 'kind', 'visit')),
    jsonb_build_array(jsonb_build_object('memberId', 'em-ravi', 'visitedOn', '2026-11-06', 'checkedInAt', t0 + 3600000)));
  checks := checks + 1;
  if r <> '{"punches": 0, "visits": 0}'::jsonb then fails := fails || ' resend:' || r::text; end if;
  select data into r from public.crm_records where gym_id = gid and kind = 'visit' and id = 'em-ravi:2026-11-06';
  checks := checks + 1;
  if r->>'source' <> 'machine' or (r->>'checkedInAt')::bigint <> t0 or r->>'machineId' <> mid::text then fails := fails || ' visit:' || coalesce(r::text, 'none'); end if;
  checks := checks + 1;
  if (select count(*) from public.crm_records where gym_id = gid and kind = 'visit') <> 1 then fails := fails || ' visit-count'; end if;

  -- Recent punches: let-in ones only, newest per number.
  r := public.gate_recent_punches(mid, array['1001', '1002', '5555'], t0 - 120000);
  checks := checks + 1;
  if r <> jsonb_build_object('1001', t0, '5555', t0) then fails := fails || ' recent:' || r::text; end if;

  -- The queue: a newer command for the same member replaces a pending one; poll; answers.
  c1 := public.gate_enqueue(mid, '{"type": "upsert_member", "memberNo": "1001", "name": "Ravi", "active": true}');
  c2 := public.gate_enqueue(mid, '{"type": "remove_member", "memberNo": "1001"}');
  c3 := public.gate_enqueue(mid, '{"type": "set_time", "at": 1}');
  checks := checks + 1;
  if exists (select 1 from public.entry_machine_commands where command_id = c1) then fails := fails || ' supersede'; end if;
  r := public.gate_take_commands(mid);
  checks := checks + 1;
  if jsonb_array_length(r) <> 2 or (r->0->>'id')::bigint <> c2 or (r->0->>'tries')::int <> 1 then fails := fails || ' take:' || r::text; end if;
  checks := checks + 1;
  if jsonb_array_length(public.gate_take_commands(mid)) <> 0 then fails := fails || ' take-twice'; end if;
  checks := checks + 1;
  if jsonb_array_length(public.gate_take_commands(mid2)) <> 0 then fails := fails || ' take-other-machine'; end if;
  n := public.gate_command_results(mid, jsonb_build_array(jsonb_build_object('id', c2, 'code', '0'), jsonb_build_object('id', c3, 'code', '-1004')));
  checks := checks + 1;
  if n <> 2 then fails := fails || ' results:' || n; end if;
  n := public.gate_command_results(mid2, jsonb_build_array(jsonb_build_object('id', c2, 'code', '-1')));
  checks := checks + 1;
  if n <> 0 or (select status from public.entry_machine_commands where command_id = c2) <> 'done'
     or (select result from public.entry_machine_commands where command_id = c3) <> '-1004' then fails := fails || ' results-guard'; end if;

  -- No answer for 10 minutes: sent again; after 5 sends: error.
  c1 := public.gate_enqueue(mid, '{"type": "open_door", "seconds": 5}');
  update public.entry_machine_commands set status = 'sent', tries = 5, sent_at = now() - interval '11 minutes' where command_id = c1;
  perform public.gate_take_commands(mid);
  checks := checks + 1;
  if (select status || '/' || result from public.entry_machine_commands where command_id = c1) <> 'error/NO_ANSWER' then fails := fails || ' no-answer'; end if;

  -- Seen, strangers.
  perform public.gate_seen(mid, '{"firmware": "Ver 8.0.4", "users": "12", "ip": "192.168.1.9", "attlogStamp": "9999"}');
  checks := checks + 1;
  if (select attlog_stamp || '/' || user_count || '/' || last_ip from public.entry_machines where machine_id = mid) <> '9999/12/192.168.1.9' then fails := fails || ' seen'; end if;
  perform public.gate_stranger('EMSTRANGER', 'GET /iclock/cdata');
  perform public.gate_stranger('EMSTRANGER', 'POST /iclock/cdata');
  perform public.gate_stranger('bad serial!', 'x');
  checks := checks + 1;
  if (select calls from public.entry_machine_strangers where serial = 'EMSTRANGER') <> 2
     or exists (select 1 from public.entry_machine_strangers where serial = 'bad serial!') then fails := fails || ' stranger'; end if;

  -- A suspended gym's machine reads as paused.
  perform set_config('forgeai.hq', 'on', true);  -- as HQ does it (0027)
  update public.gyms set status = 'suspended' where gym_id = gid2;
  perform set_config('forgeai.hq', 'off', true);
  checks := checks + 1;
  if not (public.gate_machine('EMTESTSERIAL2')->>'paused')::boolean then fails := fails || ' suspended'; end if;

  -- Nobody but the Worker: anon and signed-in users cannot call a gate_* function.
  raised := false;
  begin
    set local role anon;
    perform public.gate_machine('EMTESTSERIAL1');
  exception when insufficient_privilege then raised := true;
  end;
  reset role;
  checks := checks + 1;
  if not raised then fails := fails || ' anon-can-call'; end if;
  raised := false;
  begin
    set local role authenticated;
    perform public.gate_save_punches(mid, '[]', '[]');
  exception when insufficient_privilege then raised := true;
  end;
  reset role;
  checks := checks + 1;
  if not raised then fails := fails || ' authenticated-can-call'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks; end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
