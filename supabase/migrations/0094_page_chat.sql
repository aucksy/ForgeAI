-- NOT LIVE: needs the owner's yes
-- Re-runnable. Apply after 0080 (gym pages), 0078 + 0083 (AI questions and credits), 0075 (gym alerts) and 0061 (the
-- Worker's signing secret). Works with or without 0090 (it asks gym_page_public, which 0090 replaces).
-- Test: supabase/tests/0094_page_chat.sql (CI runs it after every migration; pasted into the SQL Editor it always ends in
-- an error and so changes nothing).
--
-- 0094: F208 the AI helper on the gym web page (R-538, docs/gym-page/PLAN.md section 10). Every chat a visitor has with
-- the page's AI helper lands in the gym's Enquiries, answered or not:
--   * ONE enquiry per visitor chat (the page keeps a random visitor id in the browser; the panel Worker turns it into a
--     hash with its secret, so the id itself never reaches the gym server). The questions and the AI's answers are kept
--     on that enquiry (data.pageChat), so the owner reads the whole chat in Enquiries, newest last.
--   * A status the owner can scan (data.pageChat.status): 'answered' (AI answered), 'needs_you' (the AI could not
--     answer, or was not asked: a limit or no credits), 'wants_call' (the visitor left a number), 'join' (asked to join).
--   * Alerts only when the owner must act: the AI could not answer, a number was left, or they asked to join (gym_alerts
--     kind 'page_question', the kind 0080 added and the admin app already shows; one a day per chat per reason). A chat
--     the AI answered fully, with no number, sends no alert.
--   * Cost: each AI answer is one visitor question on the gym's AI credits through 0078/0083's _ai_q_take: 10 answers =
--     1 credit, 3 a visitor a day, 30 a gym a day, the owner's monthly limit. Past any of them, or with no credit, the
--     question is still saved as 'needs_you' and the AI is not asked.
--   * Kept 90 days after the chat's last message, then deleted (_page_chat_sweep): a chat with no number left goes with
--     its enquiry; a chat with a number keeps the enquiry (like any enquiry) without the messages.
-- Everything here waits behind two switches in the panel Worker (GYM_PAGES and PAGE_AI both "live") and the owner's own
-- switch (gym_pages.ai_helper, ON by default, 0080).
--
-- NEW
--   table gym_page_chats      one row per visitor chat: gym, visitor hash, its enquiry, today's message count. RLS on.
--   page_chat_ask(slug, visitor, question, at, sig)   a visitor's question: saved on the chat's enquiry (made on the first
--                             one), then one AI question taken from the gym's credits ->
--                             {ok, msg, take: 'ok' | 'no_credits' | 'day_limit' | 'gym_limit' | 'month_limit' | 'paused',
--                              questionId, recent} | {error: 'NO_GYM' | 'OFF' | 'CLOSED' | 'BAD_QUESTION' | 'TOO_MANY'}
--   page_chat_reply(slug, visitor, msg, answer, outcome, at, sig)  the AI's answer ('answered'), "I will ask the gym"
--                             ('unknown') or nothing ('failed') -> {ok, status} | {error: 'NO_CHAT' | 'BAD_REPLY'}
--   page_chat_contact(slug, visitor, name, phone, consent, wants, at, sig)  the visitor's name and number ('call' or
--                             'join') -> {ok, status} | {error: 'NO_GYM' | 'OFF' | 'NO_CHAT' | 'BAD_NAME' | 'BAD_PHONE' |
--                             'NO_CONSENT' | 'TOO_MANY'}
--   page_chat_sweep()         the 90-day clean-up, for a daily job (service role only); also run now and then by asks.
-- All three page_chat_* calls are signed by the panel Worker ('pchat.<what>.<slug>.<visitor>.<at>', 0061's secret, 5
-- minutes), so nobody can spend a gym's credits or write into its Enquiries by calling the gym server directly.
-- Undo: drop function public.page_chat_sweep(); drop function public.page_chat_contact(text, text, text, text, boolean,
--   text, bigint, text); drop function public.page_chat_reply(text, text, text, text, text, bigint, text); drop function
--   public.page_chat_ask(text, text, text, bigint, text); drop function public._page_chat_alert(uuid, text, jsonb, text);
--   drop function public._page_chat_status(jsonb); drop function public._page_chat_keep(jsonb);
--   drop function public._page_chat_gym(text); drop table public.gym_page_chats. Enquiries made stay (ordinary records).

set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('public.gym_page_public(text)') is null then raise exception '0094 needs 0080 (gym pages) first'; end if;
  if to_regprocedure('public._ai_q_take(uuid, text, text)') is null then raise exception '0094 needs 0078 (AI questions) first'; end if;
  if to_regprocedure('public._phone_sig_ok(text, text)') is null then raise exception '0094 needs 0061 (signing secret) first'; end if;
  if to_regclass('public.gym_alerts') is null then raise exception '0094 needs 0075 (gym alerts) first'; end if;
end $$;

-- ------------------------------------------------------------------ the table (RLS on, no grants)
create table if not exists public.gym_page_chats (
  chat_id     uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  -- The Worker's hash of the browser's random id (never the id itself, a phone number or a network address).
  visitor     text not null check (visitor ~ '^[A-Za-z0-9_-]{8,80}$'),
  enquiry_id  text not null check (length(enquiry_id) between 1 and 64),
  day         date not null default (now() at time zone 'Asia/Kolkata')::date,
  day_msgs    int not null default 0,
  created_at  timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  unique (gym_id, visitor)
);
create index if not exists gym_page_chats_gym on public.gym_page_chats(gym_id, created_at);
create index if not exists gym_page_chats_last on public.gym_page_chats(last_at);
alter table public.gym_page_chats enable row level security;
revoke all on public.gym_page_chats from public, anon, authenticated;

-- ------------------------------------------------------------------ private helpers (no grants)
-- The gym of a page a visitor can see now (published, terms ticked, not hidden, not switched off by HQ, gym not paused),
-- with the owner's AI helper switch; null when there is no such page.
create or replace function public._page_chat_gym(p_slug text) returns public.gym_pages
  language plpgsql stable security definer set search_path = public as $$
declare r public.gym_pages;
begin
  if public.gym_page_public(p_slug) is null then return null; end if;
  select * into r from public.gym_pages where slug = lower(btrim(coalesce(p_slug, '')));
  return r;
end $$;

-- The chat's status from its block. The same rule as deploy/panel/pageChat.js chatStatus and the admin app's
-- logic/pageChat.ts: asked to join > wants a call > a question the AI did not answer > answered. PURE.
create or replace function public._page_chat_status(b jsonb) returns text
  language sql immutable set search_path = public as $$
  select case
    when b->>'wants' = 'join' then 'join'
    when b->>'wants' = 'call' then 'wants_call'
    when exists (select 1 from jsonb_array_elements(coalesce(b->'messages', '[]'::jsonb)) m
                  where m->>'from' = 'visitor' and coalesce(m->>'state', '') <> 'answered') then 'needs_you'
    else 'answered' end
$$;

-- The newest 60 messages of a list (a long chat drops its oldest lines; the enquiry never grows without end). PURE.
create or replace function public._page_chat_keep(p_list jsonb) returns jsonb
  language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(x order by o), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_list, '[]'::jsonb)) with ordinality t(x, o)
   where o > jsonb_array_length(coalesce(p_list, '[]'::jsonb)) - 60
$$;

-- One alert for the gym when the owner must act (kind 'page_question', 0080's): the first name when known, never the
-- number or the words of the chat. One a day per chat per reason.
create or replace function public._page_chat_alert(p_gym uuid, p_eid text, p_data jsonb, p_why text) returns void
  language plpgsql security definer set search_path = public as $$
declare who text := case when coalesce(p_data->>'phone', '') = '' then 'A visitor' else public._alert_first_name(p_data->>'name') end;
begin
  perform public._alert(p_gym, 'page_question', p_eid,
    'page_chat:' || p_eid || ':' || p_why || ':' || public._ist_today(), 'all', true,
    case p_why
      when 'join' then format('%s wants to join, from the chat on your web page. Open Enquiries to call them.', who)
      when 'wants_call' then format('%s asked for a call, from the chat on your web page. Open Enquiries to call them.', who)
      else format('%s asked something on your web page that the AI could not answer. Open Enquiries to read the chat.', who) end,
    '/enquiries');
end $$;

-- ------------------------------------------------------------------ the 90-day clean-up
-- Chats whose last message is older than 90 days: no number left = the enquiry goes; a number left = the enquiry stays
-- (like any enquiry) without the messages. The gym-row trigger of a paused gym is passed (HQ's own setting, this
-- transaction only), so a paused gym's old chats go too.
create or replace function public.page_chat_sweep() returns int
  language plpgsql volatile security definer set search_path = public as $$
declare c record; rec public.crm_records; v bigint; n int := 0;
begin
  perform set_config('forgeai.hq', 'on', true);
  for c in select * from public.gym_page_chats where last_at < now() - interval '90 days' order by last_at limit 500 loop
    begin
      select * into rec from public.crm_records where gym_id = c.gym_id and kind = 'enquiry' and id = c.enquiry_id;
      if rec.id is not null and not rec.deleted and rec.data ? 'pageChat' then
        update public.gyms set crm_version = coalesce(crm_version, 0) + 1 where gym_id = c.gym_id returning crm_version into v;
        if coalesce(rec.data->>'phone', '') = '' then
          update public.crm_records set deleted = true, data = '{}'::jsonb, version = v, updated_at = now()
           where gym_id = c.gym_id and kind = 'enquiry' and id = c.enquiry_id;
        else
          update public.crm_records
             set data = (rec.data - 'pageChat')
                        || jsonb_build_object('pageChat', jsonb_build_object('v', 1, 'status', rec.data->'pageChat'->'status',
                                                'wants', rec.data->'pageChat'->'wants', 'messages', '[]'::jsonb, 'cleared', true))
                        || case when coalesce(rec.data->>'interest', '') like 'Chat on your web page%'
                                then jsonb_build_object('interest', 'Chatted on your web page') else '{}'::jsonb end,
                 version = v, updated_at = now()
           where gym_id = c.gym_id and kind = 'enquiry' and id = c.enquiry_id;
        end if;
      end if;
      delete from public.gym_page_chats where chat_id = c.chat_id;
      n := n + 1;
    exception when others then
      raise warning 'page chat % not cleared: %', c.chat_id, sqlerrm;
    end;
  end loop;
  perform set_config('forgeai.hq', 'off', true);
  return n;
end $$;

-- ------------------------------------------------------------------ the visitor's question
create or replace function public.page_chat_ask(p_slug text, p_visitor text, p_question text, p_at bigint, p_sig text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r public.gym_pages; g public.gyms; c public.gym_page_chats; rec public.crm_records;
  q text := regexp_replace(btrim(coalesce(p_question, '')), '\s+', ' ', 'g');
  now_s bigint := extract(epoch from now())::bigint; now_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
  today date := public._ist_today(); v bigint; eid text; block jsonb; msgs jsonb; mid text; take jsonb; st text;
  recent jsonb; fresh boolean := false; d jsonb;
begin
  if coalesce(p_visitor, '') !~ '^[A-Za-z0-9_-]{8,80}$' then raise exception 'INVALID'; end if;
  if p_at is null or abs(now_s - p_at) > 300
     or not public._phone_sig_ok('pchat.ask.' || coalesce(p_slug, '') || '.' || p_visitor || '.' || p_at, p_sig) then
    raise exception 'BAD_SIG';
  end if;
  r := public._page_chat_gym(p_slug);
  if r.gym_id is null then return jsonb_build_object('error', 'NO_GYM'); end if;
  if not r.ai_helper then return jsonb_build_object('error', 'OFF'); end if;
  if length(q) < 1 or length(q) > 300 or public._gym_page_has_link(q) then return jsonb_build_object('error', 'BAD_QUESTION'); end if;

  -- The gym's row lock first (the order crm_push, 0077 and 0080 use).
  select * into g from public.gyms where gym_id = r.gym_id for update;
  if g.gym_id is null or public._self_join_closed(g) then return jsonb_build_object('error', 'CLOSED'); end if;

  select * into c from public.gym_page_chats where gym_id = g.gym_id and visitor = p_visitor for update;
  if c.chat_id is null then
    -- New chats a day per gym, so a bot cannot fill the gym's Enquiries.
    if (select count(*) from public.gym_page_chats where gym_id = g.gym_id and created_at > now() - interval '1 day') >= 40 then
      return jsonb_build_object('error', 'TOO_MANY');
    end if;
  elsif c.day = today and c.day_msgs >= 10 then
    -- 10 messages a visitor a day are saved (the AI answers 3 of them); more is not taken.
    return jsonb_build_object('error', 'TOO_MANY');
  end if;
  if c.chat_id is not null then
    select * into rec from public.crm_records where gym_id = g.gym_id and kind = 'enquiry' and id = c.enquiry_id;
  end if;
  if rec.id is null or rec.deleted then
    fresh := true;
    eid := 'chat-' || replace(gen_random_uuid()::text, '-', '');
  else
    eid := rec.id;
  end if;

  -- What the AI saw before this question (this visitor's own chat only), for a follow-up like "and the evening?".
  recent := case when fresh then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('from', x->>'from', 'text', x->>'text') order by o)
      from jsonb_array_elements(coalesce(rec.data->'pageChat'->'messages', '[]'::jsonb)) with ordinality t(x, o)
     where o > jsonb_array_length(coalesce(rec.data->'pageChat'->'messages', '[]'::jsonb)) - 6), '[]'::jsonb) end;

  -- One AI answer from the gym's credits (0078/0083): 10 answers = 1 credit, 3 a visitor a day, 30 a gym a day.
  take := public._ai_q_take(g.gym_id, 'visitor', p_visitor);
  mid := 'm' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  block := case when fresh then jsonb_build_object('v', 1, 'messages', '[]'::jsonb, 'startedAt', now_ms, 'wants', null,
                                                    'wording', '2026-11-15')
                else coalesce(rec.data->'pageChat', jsonb_build_object('v', 1, 'messages', '[]'::jsonb, 'startedAt', now_ms)) end;
  msgs := public._page_chat_keep(coalesce(block->'messages', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'id', mid, 'from', 'visitor', 'text', q, 'at', now_ms,
            'state', case when (take->>'ok')::boolean then 'waiting' else 'limit' end)));
  block := block || jsonb_build_object('messages', msgs, 'lastAt', now_ms);
  st := public._page_chat_status(block);
  block := block || jsonb_build_object('status', st)
           || case when not (take->>'ok')::boolean then jsonb_build_object('needAt', now_ms) else '{}'::jsonb end;

  v := coalesce(g.crm_version, 0) + 1;
  if fresh then
    d := jsonb_build_object(
      'id', eid, 'gymId', g.gym_id::text, 'name', 'Web page visitor', 'phone', '',
      -- What an older admin app shows on the row (it does not read pageChat).
      'interest', left('Chat on your web page: ' || q, 200), 'followUpOn', to_char(today, 'YYYY-MM-DD'),
      'status', 'open', 'memberId', null, 'source', null, 'pageChat', block, 'createdAt', now_ms, 'updatedAt', now_ms);
    insert into public.crm_records(gym_id, kind, id, data, version) values (g.gym_id, 'enquiry', eid, d, v)
      on conflict (gym_id, kind, id) do update set data = excluded.data, version = excluded.version, deleted = false, updated_at = now();
  else
    d := rec.data || jsonb_build_object('pageChat', block, 'updatedAt', now_ms);
    update public.crm_records set data = d, version = v, updated_at = now()
     where gym_id = g.gym_id and kind = 'enquiry' and id = eid;
  end if;
  update public.gyms set crm_version = v where gym_id = g.gym_id;

  if c.chat_id is null then
    insert into public.gym_page_chats(gym_id, visitor, enquiry_id, day, day_msgs) values (g.gym_id, p_visitor, eid, today, 1);
  else
    update public.gym_page_chats
       set enquiry_id = eid, last_at = now(), day = today, day_msgs = case when day = today then day_msgs + 1 else 1 end
     where chat_id = c.chat_id;
  end if;

  -- Not answered by the AI (a limit or no credits): the owner must reply.
  if not (take->>'ok')::boolean then perform public._page_chat_alert(g.gym_id, eid, d, 'needs_you'); end if;
  if random() < 0.02 then perform public.page_chat_sweep(); end if;

  return jsonb_build_object('ok', true, 'msg', mid, 'recent', recent,
    'take', case when (take->>'ok')::boolean then 'ok' else coalesce(take->>'reason', 'no_credits') end,
    'questionId', case when (take->>'ok')::boolean then take->>'id' end);
end $$;

-- ------------------------------------------------------------------ the AI's answer
create or replace function public.page_chat_reply(p_slug text, p_visitor text, p_msg text, p_answer text, p_outcome text,
                                                  p_at bigint, p_sig text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r public.gym_pages; c public.gym_page_chats; rec public.crm_records; g public.gyms;
  now_s bigint := extract(epoch from now())::bigint; now_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
  a text := left(regexp_replace(btrim(coalesce(p_answer, '')), '\s+', ' ', 'g'), 600);
  block jsonb; msgs jsonb; st text; v bigint; d jsonb; found_it boolean := false;
begin
  if coalesce(p_visitor, '') !~ '^[A-Za-z0-9_-]{8,80}$' or coalesce(p_msg, '') !~ '^m[0-9a-f]{12}$' then raise exception 'INVALID'; end if;
  if p_at is null or abs(now_s - p_at) > 300
     or not public._phone_sig_ok('pchat.reply.' || coalesce(p_slug, '') || '.' || p_visitor || '.' || p_at, p_sig) then
    raise exception 'BAD_SIG';
  end if;
  if p_outcome not in ('answered', 'unknown', 'failed') or (p_outcome <> 'failed' and a = '') then
    return jsonb_build_object('error', 'BAD_REPLY');
  end if;
  select * into r from public.gym_pages where slug = lower(btrim(coalesce(p_slug, '')));
  if r.gym_id is null then return jsonb_build_object('error', 'NO_CHAT'); end if;
  select * into g from public.gyms where gym_id = r.gym_id for update;
  select * into c from public.gym_page_chats where gym_id = r.gym_id and visitor = p_visitor;
  if c.chat_id is null then return jsonb_build_object('error', 'NO_CHAT'); end if;
  select * into rec from public.crm_records where gym_id = r.gym_id and kind = 'enquiry' and id = c.enquiry_id and not deleted;
  if rec.id is null then return jsonb_build_object('error', 'NO_CHAT'); end if;

  block := rec.data->'pageChat';
  -- The waiting question gets its outcome; the AI's words go in after it.
  select coalesce(jsonb_agg(case when x->>'id' = p_msg and x->>'state' = 'waiting'
                                 then x || jsonb_build_object('state', p_outcome) else x end order by o), '[]'::jsonb),
         bool_or(x->>'id' = p_msg and x->>'state' = 'waiting')
    into msgs, found_it
    from jsonb_array_elements(coalesce(block->'messages', '[]'::jsonb)) with ordinality t(x, o);
  if not coalesce(found_it, false) then return jsonb_build_object('error', 'NO_CHAT'); end if;
  if p_outcome <> 'failed' then
    msgs := public._page_chat_keep(msgs || jsonb_build_array(jsonb_build_object('id', 'a' || substr(p_msg, 2), 'from', 'ai', 'text', a, 'at', now_ms)));
  end if;
  block := block || jsonb_build_object('messages', msgs, 'lastAt', now_ms);
  st := public._page_chat_status(block);
  block := block || jsonb_build_object('status', st)
           || case when p_outcome <> 'answered' then jsonb_build_object('needAt', now_ms) else '{}'::jsonb end;
  v := coalesce(g.crm_version, 0) + 1;
  d := rec.data || jsonb_build_object('pageChat', block, 'updatedAt', now_ms);
  update public.crm_records set data = d, version = v, updated_at = now()
   where gym_id = r.gym_id and kind = 'enquiry' and id = rec.id;
  update public.gyms set crm_version = v where gym_id = r.gym_id;
  update public.gym_page_chats set last_at = now() where chat_id = c.chat_id;
  if p_outcome <> 'answered' then perform public._page_chat_alert(r.gym_id, rec.id, d, 'needs_you'); end if;
  return jsonb_build_object('ok', true, 'status', st);
end $$;

-- ------------------------------------------------------------------ the visitor's name and number
create or replace function public.page_chat_contact(p_slug text, p_visitor text, p_name text, p_phone text, p_consent boolean,
                                                    p_wants text, p_at bigint, p_sig text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r public.gym_pages; g public.gyms; c public.gym_page_chats; rec public.crm_records;
  now_s bigint := extract(epoch from now())::bigint; now_ms bigint := floor(extract(epoch from now()) * 1000)::bigint;
  nm text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80); ph text := public._norm_phone(p_phone);
  block jsonb; st text; v bigint; d jsonb; wants text;
begin
  if coalesce(p_visitor, '') !~ '^[A-Za-z0-9_-]{8,80}$' then raise exception 'INVALID'; end if;
  if p_at is null or abs(now_s - p_at) > 300
     or not public._phone_sig_ok('pchat.contact.' || coalesce(p_slug, '') || '.' || p_visitor || '.' || p_at, p_sig) then
    raise exception 'BAD_SIG';
  end if;
  r := public._page_chat_gym(p_slug);
  if r.gym_id is null then return jsonb_build_object('error', 'NO_GYM'); end if;
  if not r.ai_helper then return jsonb_build_object('error', 'OFF'); end if;
  if length(nm) < 2 or nm !~ '[[:alpha:]]' then return jsonb_build_object('error', 'BAD_NAME'); end if;
  if ph is null then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  if p_consent is not true then return jsonb_build_object('error', 'NO_CONSENT'); end if;
  if p_wants not in ('call', 'join') then raise exception 'INVALID'; end if;

  select * into g from public.gyms where gym_id = r.gym_id for update;
  if g.gym_id is null or public._self_join_closed(g) then return jsonb_build_object('error', 'CLOSED'); end if;
  select * into c from public.gym_page_chats where gym_id = g.gym_id and visitor = p_visitor for update;
  if c.chat_id is null then return jsonb_build_object('error', 'NO_CHAT'); end if;
  select * into rec from public.crm_records where gym_id = g.gym_id and kind = 'enquiry' and id = c.enquiry_id and not deleted;
  if rec.id is null then return jsonb_build_object('error', 'NO_CHAT'); end if;
  -- The same daily limits as "Ask the gym" (0080): 3 a day per number.
  if (select count(*) from public.gym_page_asks where phone = ph and created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;

  block := rec.data->'pageChat';
  wants := case when block->>'wants' = 'join' or p_wants = 'join' then 'join' else 'call' end;
  block := block || jsonb_build_object('wants', wants, 'contactAt', now_ms, 'contactWording', '2026-11-15', 'lastAt', now_ms);
  st := public._page_chat_status(block);
  block := block || jsonb_build_object('status', st, 'needAt', now_ms);
  v := coalesce(g.crm_version, 0) + 1;
  d := rec.data || jsonb_build_object('name', nm, 'phone', '+91' || ph, 'pageChat', block,
                                         'followUpOn', to_char(public._ist_today(), 'YYYY-MM-DD'), 'updatedAt', now_ms);
  update public.crm_records set data = d, version = v, updated_at = now()
   where gym_id = g.gym_id and kind = 'enquiry' and id = rec.id;
  update public.gyms set crm_version = v where gym_id = g.gym_id;
  update public.gym_page_chats set last_at = now() where chat_id = c.chat_id;
  insert into public.gym_page_asks(gym_id, phone) values (g.gym_id, ph);
  perform public._page_chat_alert(g.gym_id, rec.id, d, st);
  return jsonb_build_object('ok', true, 'status', st);
end $$;

-- ------------------------------------------------------------------ grants
-- The page's three calls: anon + authenticated by name; each needs the panel Worker's signature. The rest are shut.
revoke all on function public._page_chat_gym(text) from public, anon, authenticated;
revoke all on function public._page_chat_status(jsonb) from public, anon, authenticated;
revoke all on function public._page_chat_keep(jsonb) from public, anon, authenticated;
revoke all on function public._page_chat_alert(uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.page_chat_sweep() from public, anon, authenticated;
revoke all on function public.page_chat_ask(text, text, text, bigint, text) from public;
revoke all on function public.page_chat_reply(text, text, text, text, text, bigint, text) from public;
revoke all on function public.page_chat_contact(text, text, text, text, boolean, text, bigint, text) from public;
grant execute on function public.page_chat_ask(text, text, text, bigint, text) to anon, authenticated;
grant execute on function public.page_chat_reply(text, text, text, text, text, bigint, text) to anon, authenticated;
grant execute on function public.page_chat_contact(text, text, text, text, boolean, text, bigint, text) to anon, authenticated;
grant execute on function public.page_chat_sweep() to service_role;

notify pgrst, 'reload schema';
