-- NOT APPLIED LIVE. Needs the owner's yes (a live database change). Re-runnable. Apply after 0071 (AI credits), 0075
-- (gym alerts) and 0061 (the Worker's signing secret). Works with or without 0077 (both add a kind to gym_alerts; each keeps the other's).
-- Test: supabase/tests/0078_ai_questions.sql (CI runs it after every migration; pasted into the SQL Editor it always ends
-- in an error and so changes nothing).
-- Until this is applied, nothing changes for anyone: the panel Worker asks ai_question_take, gets "no such function"
-- (PGRST202) and answers every question as today (paid by MettleUp, under the help box's monthly cap); the admin app
-- asks owner_ai_questions, gets nothing, and keeps "Questions stay free" with no counts.
--
-- 0078: F209 (owner 14 Nov 2026, R-519 point 4): every AI question is paid from the gym's own AI credits: "something
-- like 20 queries is equal to 1 credit ... we are not giving them unlimited queries and we are also not stopping them".
--
-- WHO COUNTS. Questions answered by the AI for one gym: its owner (the AI Assistant's asks, rewrites and plan drafts,
-- and the admin app's Help and feedback box), its staff (the help box), its members (the member app's help box, sent
-- with the member's own key) and, later, visitors of the gym's web page (ai_visitor_question_take; the page AI is on
-- hold, R-519). A member with no gym and an app that sends no key: as today (not counted here).
-- THE PRICE. 20 questions = 1 credit, one number in _ai_q_rules(). The first question of each block of 20 takes the
-- credit (a 'questions' row in 0071's ledger, -1); the next 19 use the block. So a gym never gets an AI answer it has
-- no credit for, and the owner sees one row per 20 questions, not 20 tiny ones. The month's free credits (0071) are
-- used for questions too, first, as for tasks.
-- THE LIMITS (one number each in _ai_q_rules()): a member 10 questions a day, a page visitor 3, the owner and each
-- staff person 60 (the AI Assistant keeps its own 50 / 20 a day on top, deploy/panel/assist.js); all members of a gym
-- together 200 a day and all visitors together 30, so new member keys or a bot cannot empty the credits. Past a limit,
-- or with no credit left, the answer is {ok: false, reason} and the Worker answers from the help pages (no AI call).
-- A FAILED AI answer gives the question back (ai_question_back, once, within 10 minutes): it does not count.
-- LOW CREDITS. When any spend (a task or a block of questions) takes the balance to 10 or below from above 10, ONE
-- alert for the owner (gym_alerts kind 'ai_credits_low'; the Today "Needs you" list and 0076's browser alerts). One per
-- top-up: the next one comes only after credits are added again and fall again.
--
-- NEW
--   gym_ai_questions        one row per question taken: gym, who (owner | staff | member | visitor), the person (a staff
--                           or member id, 'owner-key', or a visitor's hash), India day and month, given back or not.
--                           RLS on, no grants. Kept 400 days, like the AI tasks (0071).
--   gym_ai_question_slots   per gym: questions left in the block already paid for (0..20; a give-back can add one).
--   _ai_q_rules()           the numbers above, in one place.
--   ai_question_take(key, app, at, sig)   app 'admin' (an owner key or a staff session) | 'member' (a member key);
--                           signed by the panel Worker with 0061's secret (nobody else can spend a gym's credits) ->
--                           {ok: true, id, who, balance, left_today} | {ok: false, reason: 'no_credits' | 'day_limit' |
--                           'gym_limit' | 'paused', who, per_day}. Raises BAD_KEY / BAD_SIG / INVALID.
--   ai_question_back(id)    the Worker's give-back after a failed AI answer -> {ok}.
--   ai_visitor_question_take(code, visitor, at, sig)   the same take for a gym-page visitor, signed the same way.
--   owner_ai_questions(key) the owner's counts this India month: {ok, month, per_credit, member_day, visitor_day,
--                           owner, staff, members, visitors, credits (credits used by questions), slots}.
-- CHANGED
--   0071's ledger takes reason 'questions' (negative), and _ai_month_spent counts it (so this month's free credits are
--   used first, and are not counted as "unused" at the month's end when questions used them).
--   0075's gym_alerts takes kind 'ai_credits_low' (the check is rebuilt from what it is now, so kinds another file added
--   stay); a trigger on 0071's ledger writes it.
-- Undo: drop trigger ai_credits_low on public.gym_ai_credit_ledger; drop function public._ai_low_alert();
--   drop function public.ai_question_take(text, text, bigint, text); drop function public.ai_question_back(uuid);
--   drop function public.ai_visitor_question_take(text, text, bigint, text); drop function public.owner_ai_questions(text);
--   drop function public._ai_q_take(uuid, text, text); drop function public._ai_q_rules();
--   drop table public.gym_ai_question_slots; drop table public.gym_ai_questions;
--   _ai_month_spent back to ('spend', 'refund'). The 'questions' ledger rows are money records: keep them (and the
--   reason in the check). 'ai_credits_low' may stay in the gym_alerts check.

set lock_timeout = '3s';

do $$
begin
  if to_regclass('public.gym_ai_credit_ledger') is null then raise exception '0078 needs 0071 (AI credits) first'; end if;
  if to_regclass('public.gym_alerts') is null then raise exception '0078 needs 0075 (gym alerts) first'; end if;
  if to_regprocedure('public._phone_sig_ok(text, text)') is null then raise exception '0078 needs 0061 (signing secret) first'; end if;
end $$;

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_ai_questions (
  question_id  uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(gym_id) on delete cascade,
  who          text not null check (who in ('owner', 'staff', 'member', 'visitor')),
  person       text not null check (char_length(person) between 1 and 80),
  day          date not null,                                   -- India day
  month        text not null check (month ~ '^\d{4}-\d{2}$'),   -- India month
  at           timestamptz not null default now(),
  opened_block boolean not null default false,                  -- this question took the block's credit
  given_back   boolean not null default false
);
create index if not exists gym_ai_questions_day on public.gym_ai_questions(gym_id, day, who, person);
create index if not exists gym_ai_questions_month on public.gym_ai_questions(gym_id, month);
alter table public.gym_ai_questions enable row level security;
revoke all on public.gym_ai_questions from public, anon, authenticated;

create table if not exists public.gym_ai_question_slots (
  gym_id     uuid primary key references public.gyms(gym_id) on delete cascade,
  slots      int not null default 0 check (slots >= 0),
  updated_at timestamptz not null default now()
);
alter table public.gym_ai_question_slots enable row level security;
revoke all on public.gym_ai_question_slots from public, anon, authenticated;

-- ------------------------------------------------------------------ 0071's ledger takes 'questions'
-- The reason check is rebuilt from what it is now (so a reason another file added stays); the sign check is rewritten.
do $$
declare c record; done boolean := false;
begin
  for c in select conname, pg_get_constraintdef(oid) as def from pg_constraint
            where conrelid = 'public.gym_ai_credit_ledger'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%''welcome''%' and pg_get_constraintdef(oid) not like '%delta%' loop
    if position('''questions''' in c.def) = 0 then
      execute format('alter table public.gym_ai_credit_ledger drop constraint %I', c.conname);
      execute format('alter table public.gym_ai_credit_ledger add constraint %I %s', c.conname,
                     regexp_replace(c.def, '\](\)+)\s*$', ', ''questions''::text]\1'));
    end if;
    done := true;
  end loop;
  if not done then raise exception '0078: the ledger reason check was not found'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.gym_ai_credit_ledger'::regclass and contype = 'c'
                  and pg_get_constraintdef(oid) like '%''questions''%' and pg_get_constraintdef(oid) not like '%delta%') then
    raise exception '0078: questions could not be added to the ledger reason check';
  end if;
end $$;
alter table public.gym_ai_credit_ledger drop constraint if exists gym_ai_credit_ledger_sign;
alter table public.gym_ai_credit_ledger add constraint gym_ai_credit_ledger_sign check (
  (reason in ('spend', 'expire', 'questions') and delta < 0)
  or (reason in ('welcome', 'monthly', 'purchase', 'refund') and delta > 0)
  or (reason = 'grant' and delta <> 0));

-- Credits spent in one India month: tasks (spends minus their refunds) and blocks of questions.
create or replace function public._ai_month_spent(p_gym uuid, p_month text) returns int
  language sql stable security definer set search_path = public as $$
  select greatest(0, -coalesce(sum(delta), 0))::int from public.gym_ai_credit_ledger
   where gym_id = p_gym and month = p_month and reason in ('spend', 'refund', 'questions')
$$;

-- ------------------------------------------------------------------ 0075's alert kinds + 'ai_credits_low'
do $$
declare c record; done boolean := false;
begin
  for c in select conname, pg_get_constraintdef(oid) as def from pg_constraint
            where conrelid = 'public.gym_alerts'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%trainer_question%' loop
    if position('''ai_credits_low''' in c.def) = 0 then
      execute format('alter table public.gym_alerts drop constraint %I', c.conname);
      execute format('alter table public.gym_alerts add constraint %I %s', c.conname,
                     regexp_replace(c.def, '\](\)+)\s*$', ', ''ai_credits_low''::text]\1'));
    end if;
    done := true;
  end loop;
  if not done then raise exception '0078: the gym_alerts kind check was not found'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.gym_alerts'::regclass and contype = 'c'
                  and pg_get_constraintdef(oid) like '%''ai_credits_low''%') then
    raise exception '0078: ai_credits_low could not be added to the gym_alerts kind check';
  end if;
end $$;

-- ------------------------------------------------------------------ the numbers (one place)
create or replace function public._ai_q_rules() returns jsonb
  language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'per_credit', 20,        -- questions for 1 credit (owner R-519: "20 queries is equal to 1 credit")
    'member_day', 10,        -- one member, one India day
    'visitor_day', 3,        -- one gym-page visitor, one India day
    'staff_day', 60,         -- the owner, or one staff person, one India day
    'members_gym_day', 200,  -- all members of one gym together, one India day
    'visitors_gym_day', 30,  -- all visitors of one gym's page together, one India day
    'low_at', 10)            -- the "credits low" alert, once, when a spend takes the balance to this or below
$$;

-- ------------------------------------------------------------------ the take (nobody may call it)
create or replace function public._ai_q_take(p_gym uuid, p_who text, p_person text) returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare
  rules jsonb := public._ai_q_rules();
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_month text := public._ai_month();
  v_status text; v_mine int; v_all int; v_per int; v_cap int; v_slots int; v_id uuid; v_opened boolean := false;
begin
  if p_who not in ('owner', 'staff', 'member', 'visitor') or coalesce(char_length(p_person), 0) not between 1 and 80 then
    raise exception 'INVALID';
  end if;
  -- The gym row lock first (as 0071 does), so two questions at once cannot both open a block or pass a limit.
  select status into v_status from public.gyms where gym_id = p_gym for update;
  if not found then raise exception 'BAD_KEY'; end if;
  v_per := case p_who when 'member' then (rules->>'member_day')::int when 'visitor' then (rules->>'visitor_day')::int
                      else (rules->>'staff_day')::int end;
  if v_status = 'suspended' then
    return jsonb_build_object('ok', false, 'reason', 'paused', 'who', p_who, 'per_day', v_per);
  end if;
  select count(*) into v_mine from public.gym_ai_questions
   where gym_id = p_gym and day = v_day and who = p_who and person = p_person and not given_back;
  if v_mine >= v_per then
    return jsonb_build_object('ok', false, 'reason', 'day_limit', 'who', p_who, 'per_day', v_per);
  end if;
  if p_who in ('member', 'visitor') then
    v_cap := case p_who when 'member' then (rules->>'members_gym_day')::int else (rules->>'visitors_gym_day')::int end;
    select count(*) into v_all from public.gym_ai_questions
     where gym_id = p_gym and day = v_day and who = p_who and not given_back;
    if v_all >= v_cap then
      return jsonb_build_object('ok', false, 'reason', 'gym_limit', 'who', p_who, 'per_day', v_per);
    end if;
  end if;
  -- The welcome and this month's free credits count for questions too (0071).
  perform public._ai_add_free(p_gym);
  insert into public.gym_ai_question_slots(gym_id, slots) values (p_gym, 0) on conflict (gym_id) do nothing;
  select slots into v_slots from public.gym_ai_question_slots where gym_id = p_gym for update;
  if v_slots <= 0 then
    if public._ai_balance(p_gym) < 1 then
      return jsonb_build_object('ok', false, 'reason', 'no_credits', 'who', p_who, 'per_day', v_per);
    end if;
    insert into public.gym_ai_credit_ledger(gym_id, delta, reason, note, month)
      values (p_gym, -1, 'questions', format('%s AI questions', (rules->>'per_credit')::int), v_month);
    v_slots := (rules->>'per_credit')::int;
    v_opened := true;
  end if;
  update public.gym_ai_question_slots set slots = v_slots - 1, updated_at = now() where gym_id = p_gym;
  insert into public.gym_ai_questions(gym_id, who, person, day, month, opened_block)
    values (p_gym, p_who, p_person, v_day, v_month, v_opened) returning question_id into v_id;
  if random() < 0.01 then
    delete from public.gym_ai_questions where at < now() - interval '400 days';
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'who', p_who, 'balance', public._ai_balance(p_gym),
    'left_today', greatest(0, v_per - v_mine - 1));
end $$;

-- ------------------------------------------------------------------ the callers
-- The panel Worker, for a question about to go to the AI. 'admin': an old owner key or a live staff session (role
-- owner = 'owner', else 'staff'). 'member': a member key of a member who has not left the gym.
-- Signed by the Worker (p_sig = HMAC of 'aiq.<app>.<at>.<key>' with 0061's secret, PHONE_CODE_SECRET; p_at within 5
-- minutes), so nobody can spend a gym's credits by calling this directly with a key of their own.
create or replace function public.ai_question_take(p_key text, p_app text, p_at bigint, p_sig text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g uuid; st public.gym_staff; m public.gym_members; now_s bigint := extract(epoch from now())::bigint;
begin
  if p_key is null or char_length(p_key) not between 16 and 300 then raise exception 'BAD_KEY'; end if;
  if p_app not in ('admin', 'member') then raise exception 'INVALID'; end if;
  if p_at is null or abs(now_s - p_at) > 300
     or not public._phone_sig_ok('aiq.' || p_app || '.' || p_at || '.' || p_key, p_sig) then
    raise exception 'BAD_SIG';
  end if;
  if p_app = 'member' then
    m := public._member(p_key);
    if m.left_at is not null then raise exception 'BAD_KEY'; end if;
    return public._ai_q_take(m.gym_id, 'member', m.member_id::text);
  end if;
  select gym_id into g from public.gym_owner_keys where key_hash = public._hash_key(p_key);
  if g is not null then return public._ai_q_take(g, 'owner', 'owner-key'); end if;
  st := public._staff(p_key);
  if st.staff_id is null then raise exception 'BAD_KEY'; end if;
  return public._ai_q_take(st.gym_id, case when st.role = 'owner' then 'owner' else 'staff' end, st.staff_id::text);
end $$;

-- The AI did not answer: the question does not count (once, within 10 minutes). Only the Worker holds the id.
create or replace function public.ai_question_back(p_id uuid)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare q public.gym_ai_questions;
begin
  select * into q from public.gym_ai_questions where question_id = p_id for update;
  if q.question_id is null or q.given_back or q.at < now() - interval '10 minutes' then
    return jsonb_build_object('ok', false);
  end if;
  update public.gym_ai_questions set given_back = true where question_id = p_id;
  update public.gym_ai_question_slots set slots = slots + 1, updated_at = now() where gym_id = q.gym_id;
  return jsonb_build_object('ok', true);
end $$;

-- A visitor of the gym's web page (later: the page AI is on hold, R-519). Signed by the Worker like ai_question_take
-- ('aiqv.<code>.<visitor>.<at>'); the visitor is a hash the Worker makes (never a phone number or an address).
create or replace function public.ai_visitor_question_take(p_code text, p_visitor text, p_at bigint, p_sig text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g uuid; code text := upper(btrim(coalesce(p_code, ''))); now_s bigint := extract(epoch from now())::bigint;
begin
  if coalesce(p_visitor, '') !~ '^[A-Za-z0-9_-]{8,80}$' or code !~ '^[A-Z0-9]{6}$' then raise exception 'INVALID'; end if;
  if p_at is null or abs(now_s - p_at) > 300
     or not public._phone_sig_ok('aiqv.' || code || '.' || p_visitor || '.' || p_at, p_sig) then
    raise exception 'BAD_SIG';
  end if;
  select gym_id into g from public.gyms where join_code = code;
  if g is null then raise exception 'NO_GYM'; end if;
  return public._ai_q_take(g, 'visitor', p_visitor);
end $$;

-- Where the credits went this India month (the Credits sheet). The owner only, like the wallet.
create or replace function public.owner_ai_questions(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key); cur text := public._ai_month(); rules jsonb := public._ai_q_rules();
begin
  return jsonb_build_object('ok', true, 'month', cur,
    'per_credit', (rules->>'per_credit')::int,
    'member_day', (rules->>'member_day')::int,
    'visitor_day', (rules->>'visitor_day')::int,
    'low_at', (rules->>'low_at')::int,
    'owner', (select count(*) from public.gym_ai_questions where gym_id = g and month = cur and who = 'owner' and not given_back),
    'staff', (select count(*) from public.gym_ai_questions where gym_id = g and month = cur and who = 'staff' and not given_back),
    'members', (select count(*) from public.gym_ai_questions where gym_id = g and month = cur and who = 'member' and not given_back),
    'visitors', (select count(*) from public.gym_ai_questions where gym_id = g and month = cur and who = 'visitor' and not given_back),
    'credits', (select coalesce(-sum(delta), 0)::int from public.gym_ai_credit_ledger
                 where gym_id = g and month = cur and reason = 'questions'),
    'slots', coalesce((select slots from public.gym_ai_question_slots where gym_id = g), 0));
end $$;

-- ------------------------------------------------------------------ "credits low", once per top-up
create or replace function public._ai_low_alert() returns trigger
  language plpgsql security definer set search_path = public as $$
declare low int := (public._ai_q_rules()->>'low_at')::int; after int; before int; epoch bigint;
begin
  if new.delta >= 0 then return null; end if;
  after := public._ai_balance(new.gym_id);
  before := after - new.delta;
  if before > low and after <= low then
    select max(entry_id) into epoch from public.gym_ai_credit_ledger
     where gym_id = new.gym_id and delta > 0 and reason in ('welcome', 'monthly', 'purchase', 'grant', 'refund');
    perform public._alert(new.gym_id, 'ai_credits_low', new.gym_id::text, 'ai_low:' || new.gym_id || ':' || coalesce(epoch, 0),
      'owner', false,
      case when after <= 0 then 'Your gym has no AI credits left. Members now get help pages instead of AI answers. Get more in AI Assistant, Credits.'
           when after = 1 then 'Your gym has 1 AI credit left. Get more in AI Assistant, Credits, so members keep getting AI answers.'
           else format('Your gym has %s AI credits left. Get more in AI Assistant, Credits, so members keep getting AI answers.', after) end,
      '/assistant');
  end if;
  return null;
exception when others then
  raise warning 'credits low alert not made: %', sqlerrm;
  return null;
end $$;
drop trigger if exists ai_credits_low on public.gym_ai_credit_ledger;
create trigger ai_credits_low after insert on public.gym_ai_credit_ledger
  for each row execute function public._ai_low_alert();

-- ------------------------------------------------------------------ grants
revoke all on function public._ai_q_rules()                  from public, anon, authenticated;
revoke all on function public._ai_q_take(uuid, text, text)   from public, anon, authenticated;
revoke all on function public._ai_low_alert()                from public, anon, authenticated;
revoke all on function public._ai_month_spent(uuid, text)    from public, anon, authenticated;
revoke all on function public.ai_question_take(text, text, bigint, text) from public;
revoke all on function public.ai_question_back(uuid)         from public;
revoke all on function public.owner_ai_questions(text)       from public;
grant execute on function public.ai_question_take(text, text, bigint, text) to anon, authenticated;
grant execute on function public.ai_question_back(uuid)       to anon, authenticated;
grant execute on function public.owner_ai_questions(text)     to anon, authenticated;
revoke all on function public.ai_visitor_question_take(text, text, bigint, text) from public;
grant execute on function public.ai_visitor_question_take(text, text, bigint, text) to anon, authenticated;

notify pgrst, 'reload schema';
