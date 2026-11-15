-- F208 the AI helper on the gym web page (0094). Runs in CI after every migration (scripts/ci/db_checks.sh); can also be
-- pasted into the live SQL Editor. It ALWAYS ends in an error, so it changes nothing:
--   "RESULT PASS (n checks)"  - everything worked; the error only undoes the test rows;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).
-- Fake numbers only (90000 93xxx); the secret here is a test value.

create or replace function pg_temp.t94_is(p_label text, p_got text, p_want text) returns text
  language sql as $$
  select case when p_got is not distinct from p_want then '' else ' ' || p_label || ':' || coalesce(p_got, 'null') end
$$;

create or replace function pg_temp.t94_err(p_sql text) returns text
  language plpgsql as $$
begin
  execute p_sql;
  return 'no error';
exception when others then
  return sqlerrm;
end $$;

-- The Worker's signature: HMAC of the message with the test secret.
create or replace function pg_temp.t94_sig(p_msg text) returns text
  language sql as $$
  select encode(extensions.hmac(p_msg, 'test-secret-0123456789abcdef0123456789abcdef', 'sha256'), 'hex')
$$;

create or replace function pg_temp.t94_ask(p_slug text, p_visitor text, p_q text) returns jsonb
  language plpgsql as $$
declare at bigint := extract(epoch from now())::bigint;
begin
  return public.page_chat_ask(p_slug, p_visitor, p_q, at, pg_temp.t94_sig('pchat.ask.' || p_slug || '.' || p_visitor || '.' || at));
end $$;

create or replace function pg_temp.t94_reply(p_slug text, p_visitor text, p_msg text, p_answer text, p_outcome text) returns jsonb
  language plpgsql as $$
declare at bigint := extract(epoch from now())::bigint;
begin
  return public.page_chat_reply(p_slug, p_visitor, p_msg, p_answer, p_outcome, at,
    pg_temp.t94_sig('pchat.reply.' || p_slug || '.' || p_visitor || '.' || at));
end $$;

create or replace function pg_temp.t94_contact(p_slug text, p_visitor text, p_name text, p_phone text, p_consent boolean, p_wants text) returns jsonb
  language plpgsql as $$
declare at bigint := extract(epoch from now())::bigint;
begin
  return public.page_chat_contact(p_slug, p_visitor, p_name, p_phone, p_consent, p_wants, at,
    pg_temp.t94_sig('pchat.contact.' || p_slug || '.' || p_visitor || '.' || at));
end $$;

do $$
declare
  ga uuid; gb uuid; ka text := 't93-owner-key-a-000001'; kb text := 't93-owner-key-b-000001';
  sla text := 't93-fitness-sector-93'; slb text := 't93-empty-gym';
  page jsonb := '{"about":"Big gym near the market.","area":"Sector 93","city":"Testpur","highlights":["ac"],"photos":[],
                  "mapsUrl":"","showPhone":false,"whatsapp":false,"indexable":false,"published":true,"termsAgreed":true}';
  v1 text := 'visitor-hash-t93-0001'; v2 text := 'visitor-hash-t93-0002'; v3 text := 'visitor-hash-t93-0003';
  r jsonb; e jsonb; eid text; eid2 text; m1 text; at bigint := extract(epoch from now())::bigint;
  fails text := ''; checks int := 0; i int;
begin
  delete from public.phone_code_settings;
  insert into public.phone_code_settings(secret) values ('test-secret-0123456789abcdef0123456789abcdef');

  -- ga: in its free trial (20 starter credits). gb: no credits left.
  insert into public.gyms(name, join_code, crm_version) values ('T93 Gym', 'T93GYA', 1) returning gym_id into ga;
  insert into public.gyms(name, join_code, crm_version) values ('T93 Empty', 'T93GYB', 1) returning gym_id into gb;
  insert into public.gym_owner_keys(gym_id, key_hash) values (ga, public._hash_key(ka)), (gb, public._hash_key(kb));
  insert into public.crm_records(gym_id, kind, id, data, version) values
    (ga, 'plan', 't93-month', '{"name":"Monthly","durationUnit":"month","durationCount":1,"priceP":150000,"joiningFeeP":0,"active":true,"sortOrder":1}', 1);
  insert into public.gym_ai_credit_ledger(gym_id, delta, reason, note, month) values
    (gb, 20, 'welcome', 'Starter credits', public._ai_month()), (gb, -20, 'grant', 'test: used up', public._ai_month());
  checks := checks + 1; fails := fails || pg_temp.t94_is('0savea', public.owner_save_gym_page(ka, page || jsonb_build_object('slug', sla))->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t94_is('0saveb', public.owner_save_gym_page(kb, page || jsonb_build_object('slug', slb))->>'ok', 'true');

  -- 1. Only the Worker's signature opens it; an old or wrong one is refused.
  checks := checks + 1; fails := fails || pg_temp.t94_is('1nosig', pg_temp.t94_err(format('select public.page_chat_ask(%L, %L, %L, %s, %L)', sla, v1, 'Hi', at, repeat('0', 64))), 'BAD_SIG');
  checks := checks + 1; fails := fails || pg_temp.t94_is('1old', pg_temp.t94_err(format('select public.page_chat_ask(%L, %L, %L, %s, %L)', sla, v1, 'Hi', at - 600,
    pg_temp.t94_sig('pchat.ask.' || sla || '.' || v1 || '.' || (at - 600)))), 'BAD_SIG');
  checks := checks + 1; fails := fails || pg_temp.t94_is('1other', pg_temp.t94_err(format('select public.page_chat_ask(%L, %L, %L, %s, %L)', sla, v2, 'Hi', at,
    pg_temp.t94_sig('pchat.ask.' || sla || '.' || v1 || '.' || at))), 'BAD_SIG');
  checks := checks + 1; fails := fails || pg_temp.t94_is('1badvisitor', pg_temp.t94_err(format('select public.page_chat_ask(%L, %L, %L, %s, %L)', sla, 'x y', 'Hi', at, repeat('0', 64))), 'INVALID');

  -- 2. The first question: one enquiry for this chat, the AI may answer (a credit taken), no alert yet.
  r := pg_temp.t94_ask(sla, v1, 'Is there parking?');
  checks := checks + 1; fails := fails || pg_temp.t94_is('2ok', (r->>'ok') || '/' || (r->>'take') || '/' || ((r->>'questionId') is not null)::text || '/' || jsonb_array_length(r->'recent'), 'true/ok/true/0');
  m1 := r->>'msg';
  select id, data into eid, e from public.crm_records where gym_id = ga and kind = 'enquiry' and id like 'chat-%';
  checks := checks + 1; fails := fails || pg_temp.t94_is('2enquiry', (e->>'name') || '/' || (e->>'phone') || '/' || (e->>'status') || '/' || (e->>'interest'),
    'Web page visitor//open/Chat on your web page: Is there parking?');
  checks := checks + 1; fails := fails || pg_temp.t94_is('2waiting', (e->'pageChat'->>'status') || '/' || (e->'pageChat'->'messages'->0->>'state'), 'needs_you/waiting');
  checks := checks + 1; fails := fails || pg_temp.t94_is('2noalert', (select count(*) from public.gym_alerts where gym_id = ga and kind = 'page_question')::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t94_is('2credit', (select coalesce(-sum(delta), 0) from public.gym_ai_credit_ledger where gym_id = ga and reason = 'questions')::text, '1');
  checks := checks + 1; fails := fails || pg_temp.t94_is('2visitor', (select count(*) from public.gym_ai_questions where gym_id = ga and who = 'visitor' and person = v1)::text, '1');

  -- 3. The AI answered: status "AI answered", the answer kept after the question; still no alert.
  r := pg_temp.t94_reply(sla, v1, m1, 'Yes, the gym has parking.', 'answered');
  checks := checks + 1; fails := fails || pg_temp.t94_is('3ok', (r->>'ok') || '/' || (r->>'status'), 'true/answered');
  select data into e from public.crm_records where gym_id = ga and kind = 'enquiry' and id = eid;
  checks := checks + 1; fails := fails || pg_temp.t94_is('3chat', (e->'pageChat'->'messages'->1->>'from') || '/' || (e->'pageChat'->'messages'->1->>'text') || '/' || (e->'pageChat'->'messages'->0->>'state'),
    'ai/Yes, the gym has parking./answered');
  checks := checks + 1; fails := fails || pg_temp.t94_is('3noalert', (select count(*) from public.gym_alerts where gym_id = ga and kind = 'page_question')::text, '0');
  checks := checks + 1; fails := fails || pg_temp.t94_is('3again', pg_temp.t94_reply(sla, v1, m1, 'Twice', 'answered')->>'error', 'NO_CHAT');
  checks := checks + 1; fails := fails || pg_temp.t94_is('3badreply', pg_temp.t94_reply(sla, v1, m1, '', 'answered')->>'error', 'BAD_REPLY');

  -- 4. The same visitor again: the same enquiry, and the AI sees the earlier lines.
  r := pg_temp.t94_ask(sla, v1, 'And the evening timings?');
  checks := checks + 1; fails := fails || pg_temp.t94_is('4same', (select count(*) from public.crm_records where gym_id = ga and kind = 'enquiry')::text || '/' || jsonb_array_length(r->'recent') || '/' || (r->'recent'->1->>'from'), '1/2/ai');
  -- "I will ask the gym": Needs you, and one alert that names nobody's number or words.
  r := pg_temp.t94_reply(sla, v1, r->>'msg', 'I will ask the gym.', 'unknown');
  checks := checks + 1; fails := fails || pg_temp.t94_is('4needs', r->>'status', 'needs_you');
  checks := checks + 1; fails := fails || pg_temp.t94_is('4alert', (select string_agg(line || '|' || route || '|' || urgent::text, ',') from public.gym_alerts where gym_id = ga and kind = 'page_question'),
    'A visitor asked something on your web page that the AI could not answer. Open Enquiries to read the chat.|/enquiries|true');

  -- 5. The visitor's 4th question today: not sent to the AI (3 a day), saved as Needs you (one alert a day per chat).
  r := pg_temp.t94_ask(sla, v1, 'Is there a steam room?');
  checks := checks + 1; fails := fails || pg_temp.t94_is('5third', r->>'take', 'ok');
  r := pg_temp.t94_ask(sla, v1, 'Do you have lockers?');
  checks := checks + 1; fails := fails || pg_temp.t94_is('5limit', (r->>'take') || '/' || coalesce(r->>'questionId', 'none'), 'day_limit/none');
  select data into e from public.crm_records where gym_id = ga and kind = 'enquiry' and id = eid;
  checks := checks + 1; fails := fails || pg_temp.t94_is('5saved', (e->'pageChat'->'messages'->-1->>'text') || '/' || (e->'pageChat'->'messages'->-1->>'state') || '/' || (e->'pageChat'->>'status'),
    'Do you have lockers?/limit/needs_you');
  checks := checks + 1; fails := fails || pg_temp.t94_is('5onealert', (select count(*) from public.gym_alerts where gym_id = ga and kind = 'page_question')::text, '1');

  -- 6. 10 visitor answers = 1 credit: 3 answers so far opened the first credit; 7 more use it; the 11th opens the next.
  for i in 1..7 loop
    r := pg_temp.t94_ask(sla, 'visitor-hash-t93-1' || lpad(i::text, 3, '0'), 'Question ' || i);
    checks := checks + 1; fails := fails || pg_temp.t94_is('6take' || i, r->>'take', 'ok');
  end loop;
  checks := checks + 1; fails := fails || pg_temp.t94_is('6ten', (select coalesce(-sum(delta), 0) from public.gym_ai_credit_ledger where gym_id = ga and reason = 'questions')::text, '1');
  r := pg_temp.t94_ask(sla, v2, 'The eleventh question');
  checks := checks + 1; fails := fails || pg_temp.t94_is('6eleven', (r->>'take') || '/' || (select coalesce(-sum(delta), 0) from public.gym_ai_credit_ledger where gym_id = ga and reason = 'questions')::text, 'ok/2');
  -- A failed AI answer: the Worker gives the question back (0078) and the chat says Needs you.
  checks := checks + 1; fails := fails || pg_temp.t94_is('6back', public.ai_question_back((r->>'questionId')::uuid)->>'ok', 'true');
  checks := checks + 1; fails := fails || pg_temp.t94_is('6failed', pg_temp.t94_reply(sla, v2, r->>'msg', null, 'failed')->>'status', 'needs_you');
  select id into eid2 from public.crm_records r2 where gym_id = ga and kind = 'enquiry' and id = (select enquiry_id from public.gym_page_chats where gym_id = ga and visitor = v2);
  checks := checks + 1; fails := fails || pg_temp.t94_is('6own', (eid2 is not null and eid2 <> eid)::text, 'true');

  -- 7. No credits left: saved as Needs you, the AI not asked.
  r := pg_temp.t94_ask(slb, v1, 'Is there parking?');
  checks := checks + 1; fails := fails || pg_temp.t94_is('7nocredit', (r->>'ok') || '/' || (r->>'take'), 'true/no_credits');
  checks := checks + 1; fails := fails || pg_temp.t94_is('7alert', (select count(*) from public.gym_alerts where gym_id = gb and kind = 'page_question')::text, '1');

  -- 8. Name and number: checked like "Ask the gym"; then "Wants a call", then "Asked to join"; each one alert.
  checks := checks + 1; fails := fails || pg_temp.t94_is('8name', pg_temp.t94_contact(sla, v1, '1', '9000093001', true, 'call')->>'error', 'BAD_NAME');
  checks := checks + 1; fails := fails || pg_temp.t94_is('8phone', pg_temp.t94_contact(sla, v1, 'Pooja Meena', '12345', true, 'call')->>'error', 'BAD_PHONE');
  checks := checks + 1; fails := fails || pg_temp.t94_is('8consent', pg_temp.t94_contact(sla, v1, 'Pooja Meena', '9000093001', false, 'call')->>'error', 'NO_CONSENT');
  checks := checks + 1; fails := fails || pg_temp.t94_is('8nochat', pg_temp.t94_contact(sla, v3, 'Pooja Meena', '9000093001', true, 'call')->>'error', 'NO_CHAT');
  r := pg_temp.t94_contact(sla, v1, 'Pooja Meena', '+91 90000 93001', true, 'call');
  checks := checks + 1; fails := fails || pg_temp.t94_is('8call', (r->>'ok') || '/' || (r->>'status'), 'true/wants_call');
  select data into e from public.crm_records where gym_id = ga and kind = 'enquiry' and id = eid;
  checks := checks + 1; fails := fails || pg_temp.t94_is('8lead', (e->>'name') || '/' || (e->>'phone') || '/' || (e->'pageChat'->>'wants'), 'Pooja Meena/+919000093001/call');
  checks := checks + 1; fails := fails || pg_temp.t94_is('8alert', (select count(*) from public.gym_alerts where gym_id = ga and kind = 'page_question'
    and line = 'Pooja asked for a call, from the chat on your web page. Open Enquiries to call them.')::text, '1');
  r := pg_temp.t94_contact(sla, v1, 'Pooja Meena', '9000093001', true, 'join');
  checks := checks + 1; fails := fails || pg_temp.t94_is('8join', r->>'status', 'join');
  -- Calling again with "call" never lowers "join"; a 4th number in a day is refused (3 a day, like "Ask the gym").
  checks := checks + 1; fails := fails || pg_temp.t94_is('8keepjoin', pg_temp.t94_contact(sla, v1, 'Pooja Meena', '9000093001', true, 'call')->>'status', 'join');
  checks := checks + 1; fails := fails || pg_temp.t94_is('8toomany', pg_temp.t94_contact(sla, v1, 'Pooja Meena', '9000093001', true, 'call')->>'error', 'TOO_MANY');
  checks := checks + 1; fails := fails || pg_temp.t94_is('8joinalert', (select count(*) from public.gym_alerts where gym_id = ga and kind = 'page_question'
    and line = 'Pooja wants to join, from the chat on your web page. Open Enquiries to call them.')::text, '1');

  -- 9. Refused: a link in a question, no such page, the owner's AI switch off, 10 messages a day per visitor.
  checks := checks + 1; fails := fails || pg_temp.t94_is('9link', pg_temp.t94_ask(sla, v3, 'see www.spam.com')->>'error', 'BAD_QUESTION');
  checks := checks + 1; fails := fails || pg_temp.t94_is('9empty', pg_temp.t94_ask(sla, v3, '   ')->>'error', 'BAD_QUESTION');
  checks := checks + 1; fails := fails || pg_temp.t94_is('9nogym', pg_temp.t94_ask('t93-no-such-page', v3, 'Hi')->>'error', 'NO_GYM');
  -- v1 has sent 4 today; 6 more make 10.
  for i in 1..6 loop r := pg_temp.t94_ask(sla, v1, 'More ' || i); end loop;
  checks := checks + 1; fails := fails || pg_temp.t94_is('9ten', (pg_temp.t94_ask(sla, v1, 'The eleventh today')->>'error') || '/' || (select day_msgs from public.gym_page_chats where gym_id = ga and visitor = v1), 'TOO_MANY/10');
  update public.gym_pages set ai_helper = false where gym_id = ga;
  checks := checks + 1; fails := fails || pg_temp.t94_is('9off', pg_temp.t94_ask(sla, v3, 'Hi')->>'error', 'OFF');
  update public.gym_pages set ai_helper = true where gym_id = ga;
  update public.gym_pages set published = false where gym_id = ga;
  checks := checks + 1; fails := fails || pg_temp.t94_is('9unpublished', pg_temp.t94_ask(sla, v3, 'Hi')->>'error', 'NO_GYM');
  update public.gym_pages set published = true where gym_id = ga;

  -- 10. 90 days after the last message: a chat with no number goes with its enquiry; one with a number keeps the
  -- enquiry without the messages; both chat rows go. A newer chat stays.
  update public.gym_page_chats set last_at = now() - interval '91 days' where gym_id = ga and visitor in (v1, v2);
  checks := checks + 1; fails := fails || pg_temp.t94_is('10swept', public.page_chat_sweep()::text, '2');
  checks := checks + 1; fails := fails || pg_temp.t94_is('10anon', (select deleted::text || '/' || data::text from public.crm_records where gym_id = ga and kind = 'enquiry' and id = eid2), 'true/{}');
  select data into e from public.crm_records where gym_id = ga and kind = 'enquiry' and id = eid;
  checks := checks + 1; fails := fails || pg_temp.t94_is('10lead', (e->>'phone') || '/' || jsonb_array_length(e->'pageChat'->'messages') || '/' || (e->'pageChat'->>'cleared') || '/' || (e->>'interest') || '/' || (e->'pageChat'->>'status'),
    '+919000093001/0/true/Chatted on your web page/join');
  checks := checks + 1; fails := fails || pg_temp.t94_is('10rows', (select count(*) from public.gym_page_chats where gym_id = ga)::text, '7');

  -- 11. Grants: the page's three calls by name (each needs the Worker's signature); the helpers, the sweep and the
  -- table are shut.
  checks := checks + 1; fails := fails || pg_temp.t94_is('11anon',
    (has_function_privilege('anon', 'public.page_chat_ask(text, text, text, bigint, text)', 'execute')
     and has_function_privilege('anon', 'public.page_chat_reply(text, text, text, text, text, bigint, text)', 'execute')
     and has_function_privilege('anon', 'public.page_chat_contact(text, text, text, text, boolean, text, bigint, text)', 'execute'))::text, 'true');
  checks := checks + 1; fails := fails || pg_temp.t94_is('11shut',
    (has_function_privilege('anon', 'public.page_chat_sweep()', 'execute')
     or has_function_privilege('anon', 'public._page_chat_gym(text)', 'execute')
     or has_function_privilege('anon', 'public._page_chat_alert(uuid, text, jsonb, text)', 'execute')
     or has_table_privilege('anon', 'public.gym_page_chats', 'select'))::text, 'false');

  if fails = '' then raise exception 'RESULT PASS (% checks)', checks;
  else raise exception 'RESULT FAIL:%', fails; end if;
end $$;
