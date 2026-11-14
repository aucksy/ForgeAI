-- "Ask a trainer" only for members on a running paid gym plan (0074, R-505). Runs in CI after every migration
-- (scripts/ci/db_checks.sh); can also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

-- Run one statement: 'ok', or the error it raised (nothing kept on an error).
create or replace function pg_temp.t73_run(q text) returns text
  language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- '' when got = want, else ' label:got'.
create or replace function pg_temp.t73_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

do $$
declare
  ga uuid; s_owner uuid; me uuid; qe uuid; qo uuid; kop text := 't73-owner-session';
  fails text := ''; checks int := 0; r jsonb;
  td date := (now() at time zone 'Asia/Kolkata')::date;
  today text := to_char(td, 'YYYY-MM-DD');
  yday text := to_char(td - 1, 'YYYY-MM-DD');
  tmrw text := to_char(td + 1, 'YYYY-MM-DD');
  ago text := to_char(td - 30, 'YYYY-MM-DD');
  later text := to_char(td + 30, 'YYYY-MM-DD');
  k_paid text := 't73-member-asha'; k_today text := 't73-member-tara'; k_pass text := 't73-member-pia';
  k_ended text := 't73-member-esha'; k_none text := 't73-member-nina'; k_later text := 't73-member-fay';
  k_cancel text := 't73-member-cara'; k_stranger text := 't73-member-ravi';
begin
  insert into public.gyms(name, join_code, crm_version) values ('T73 Gym', 'T73GYA', 1) returning gym_id into ga;
  insert into public.gym_staff(gym_id, name, phone, role) values (ga, 'Owner Singh', '9876507301', 'owner') returning staff_id into s_owner;
  insert into public.gym_sessions(staff_id, key_hash) values (s_owner, public._hash_key(kop));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'member', 'm-asha', '{"fullName":"Asha Verma","phone":"+919829073001"}', 1),
    (ga, 'member', 'm-tara', '{"fullName":"Tara Iyer","phone":"+919829073002"}', 1),
    (ga, 'member', 'm-pia', '{"fullName":"Pia Das","phone":"+919829073003","passCompany":"FITPASS"}', 1),
    (ga, 'member', 'm-esha', '{"fullName":"Esha Rao","phone":"+919829073004"}', 1),
    (ga, 'member', 'm-nina', '{"fullName":"Nina Shah","phone":"+919829073005"}', 1),
    (ga, 'member', 'm-fay', '{"fullName":"Fay Khan","phone":"+919829073006"}', 1),
    (ga, 'member', 'm-cara', '{"fullName":"Cara Jain","phone":"+919829073007"}', 1),
    -- Asha: a paid plan running. Tara: hers ends today (India). Pia: a pass, with an old plan still running.
    -- Esha: ended yesterday. Fay: starts tomorrow. Cara: running but cancelled. Nina: none. Ravi: not on the list.
    (ga, 'membership', 'p-asha', jsonb_build_object('memberId', 'm-asha', 'planName', 'Monthly', 'startsOn', ago, 'endsOn', later), 1),
    (ga, 'membership', 'p-tara', jsonb_build_object('memberId', 'm-tara', 'planName', 'Monthly', 'startsOn', ago, 'endsOn', today), 1),
    (ga, 'membership', 'p-pia', jsonb_build_object('memberId', 'm-pia', 'planName', 'Monthly', 'startsOn', ago, 'endsOn', later), 1),
    (ga, 'membership', 'p-esha', jsonb_build_object('memberId', 'm-esha', 'planName', 'Monthly', 'startsOn', ago, 'endsOn', yday), 1),
    (ga, 'membership', 'p-fay', jsonb_build_object('memberId', 'm-fay', 'planName', 'Monthly', 'startsOn', tmrw, 'endsOn', later), 1),
    (ga, 'membership', 'p-cara', jsonb_build_object('memberId', 'm-cara', 'planName', 'Monthly', 'startsOn', ago, 'endsOn', later, 'cancelled', true), 1);
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values
    (ga, 'Asha', '+919829073001', public._hash_key(k_paid)),
    (ga, 'Tara', '+919829073002', public._hash_key(k_today)),
    (ga, 'Pia', '+919829073003', public._hash_key(k_pass)),
    (ga, 'Nina', '+919829073005', public._hash_key(k_none)),
    (ga, 'Fay', '+919829073006', public._hash_key(k_later)),
    (ga, 'Cara', '+919829073007', public._hash_key(k_cancel)),
    (ga, 'Ravi', '+919829073099', public._hash_key(k_stranger));
  insert into public.gym_members(gym_id, name, checkin_phone, key_hash) values (ga, 'Esha', '+919829073004', public._hash_key(k_ended))
    returning member_id into me;

  -- 1. A running paid plan may ask; a plan ending today (India) still counts.
  r := public.member_ask_trainer(k_paid, null, 'How do I fix my squat?');
  checks := checks + 1; fails := fails || pg_temp.t73_is('1paid', (r->>'ok') || '/' || (r->'question'->>'question'), 'true/How do I fix my squat?');
  r := public.member_ask_trainer(k_today, s_owner, 'Can I train twice a day?');
  checks := checks + 1; fails := fails || pg_temp.t73_is('1endstoday', r->>'ok', 'true');

  -- 2. Everyone else: NO_PLAN, and nothing is kept.
  checks := checks + 1; fails := fails || pg_temp.t73_is('2pass', pg_temp.t73_run(format('select public.member_ask_trainer(%L, null, %L)', k_pass, 'Hi')), 'NO_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t73_is('2ended', pg_temp.t73_run(format('select public.member_ask_trainer(%L, null, %L)', k_ended, 'Hi')), 'NO_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t73_is('2none', pg_temp.t73_run(format('select public.member_ask_trainer(%L, null, %L)', k_none, 'Hi')), 'NO_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t73_is('2later', pg_temp.t73_run(format('select public.member_ask_trainer(%L, null, %L)', k_later, 'Hi')), 'NO_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t73_is('2cancelled', pg_temp.t73_run(format('select public.member_ask_trainer(%L, null, %L)', k_cancel, 'Hi')), 'NO_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t73_is('2notonlist', pg_temp.t73_run(format('select public.member_ask_trainer(%L, null, %L)', k_stranger, 'Hi')), 'NO_PLAN');
  -- Before the words are checked: an old app hears NO_PLAN first, whatever it typed.
  checks := checks + 1; fails := fails || pg_temp.t73_is('2first', pg_temp.t73_run(format('select public.member_ask_trainer(%L, null, %L)', k_none, ' ')), 'NO_PLAN');
  checks := checks + 1; fails := fails || pg_temp.t73_is('2badkey', pg_temp.t73_run(format('select public.member_ask_trainer(%L, null, %L)', 'nope', 'Hi')), 'BAD_KEY');
  checks := checks + 1; fails := fails || pg_temp.t73_is('2kept', (select count(*)::text from public.trainer_questions where gym_id = ga), '2');
  -- The paid member's own checks still come after the plan (one open question at a time).
  checks := checks + 1; fails := fails || pg_temp.t73_is('2open', pg_temp.t73_run(format('select public.member_ask_trainer(%L, null, %L)', k_paid, 'Another')), 'OPEN_QUESTION');

  -- 3. A plan that ended: the old questions and replies stay readable, an open one can still be taken back.
  insert into public.trainer_questions(gym_id, member_id, question, asked_at, answer, answered_by_name, answered_at)
    values (ga, me, 'Old question', now() - interval '3 days', 'Old reply', 'Owner Singh', now() - interval '2 days')
    returning question_id into qe;
  insert into public.trainer_questions(gym_id, member_id, question, asked_at)
    values (ga, me, 'Still waiting', now() - interval '1 day')
    returning question_id into qo;
  r := public.member_questions(k_ended);
  checks := checks + 1; fails := fails || pg_temp.t73_is('3read', (select q->>'answer' from jsonb_array_elements(r->'questions') q where q->>'id' = qe::text), 'Old reply');
  checks := checks + 1; fails := fails || pg_temp.t73_is('3count', jsonb_array_length(r->'questions')::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t73_is('3takeback', public.member_withdraw_question(k_ended, qo)->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t73_is('3passreads', public.member_questions(k_pass)->>'ok', 'true');
  -- The gym still answers what was asked while the plan ran.
  checks := checks + 1; fails := fails || pg_temp.t73_is('3answer',
    public.owner_answer_question(kop, (select question_id from public.trainer_questions where gym_id = ga and question = 'Can I train twice a day?'), 'Yes, keep one light.')->>'ok', 'true');

  -- The refused tries left nothing behind: Asha's one question is all she has.
  checks := checks + 1; fails := fails || pg_temp.t73_is('3asha', (select count(*)::text from public.trainer_questions q join public.gym_members m using (member_id) where m.gym_id = ga and m.name = 'Asha'), '1');

  -- 4. The rule is the gym's own "My membership" answer.
  checks := checks + 1; fails := fails || pg_temp.t73_is('4same',
    (public._tq_plan_ok(k_paid))::text || '/' || (public._tq_plan_ok(k_today))::text || '/' || (public._tq_plan_ok(k_pass))::text || '/'
      || (public._tq_plan_ok(k_ended))::text || '/' || (public._tq_plan_ok(k_none))::text,
    'true/true/false/false/false');
  checks := checks + 1; fails := fails || pg_temp.t73_is('4passanswer', public.member_membership(k_pass)->>'pass', 'FITPASS');

  -- 5. Who may call: members may still call the ask function; nobody may call the helper.
  checks := checks + 1;
  if not has_function_privilege('anon', 'public.member_ask_trainer(text, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public._tq_plan_ok(text)', 'execute')
     or has_function_privilege('authenticated', 'public._tq_plan_ok(text)', 'execute') then fails := fails || ' 5fn'; end if;

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
