-- NOT APPLIED — needs the owner's yes ("No LIVE database change without my yes"). Paste into the Supabase SQL Editor
-- after 0070. Re-runnable. Test: supabase/tests/0071_ai_assistant.sql (CI runs it after every migration; pasted into
-- the SQL Editor it always ends in an error and so changes nothing).
-- The admin app works without it: it asks owner_ai_wallet once, gets "no such function", and hides the AI Assistant.
--
-- 0071: F201, the MettleUp AI assistant for gym owners, paid with AI credits (docs/f201-ai-assistant/03-design.md
-- sections 3, 4, 7; owner 12 Nov 2026: "let people recharge their credits... even the BasicPlan users or the ProPlan
-- users can also use the agentic functionality"; prices decided by Claude under his "You're the boss").
--
-- CREDITS. Asking, voice, rewrites and drafts are free. A credit is spent only when a task is DONE (a message sent, a
-- member / payment / enquiry / expense saved = 1 credit; a workout or diet plan saved = 3). The balance is ONE number.
-- Free credits (owner 12 Nov 2026, R-470, 03-design.md section 3):
--   welcome   20 starter credits once per gym (the first time the owner opens the assistant), trial or not.
--   monthly   100 every India month ONLY for a paid yearly plan or a founding lifetime gym (_ai_monthly_free:
--             billing 'yearly' with paid_until > now(), or billing 'lifetime', whose paid_until is null = for ever).
--             The trial and monthly plans get none (packs only). Added the first time the wallet is read that month.
--             NOT carried over: when a new month starts, what is left of the last month's free ones goes ('expire'
--             row), whether or not the gym still gets free credits. Free credits are counted as used first, so
--             "left" = that month's free credits minus that month's spends (never below 0, never above the balance).
--   purchase  a pack (Rs 149 = 50, Rs 399 = 150, Rs 999 = 500; never expire), added by HQ after the payment shows.
--   grant     HQ adds (or takes back) credits by hand, with a note.
--   spend     a task done (-1 or -3). One spend per task, ever.
--   refund    the task failed after the spend: the same credits back, once, within 10 minutes.
--
-- NEW (tables: RLS on, no policies, no grants; only these functions touch them)
--   gym_ai_tasks                      every request the owner made: text (<= 600), spoken?, the actions the AI picked,
--                                     status drafted | done | cancelled | failed, credits, result. Kept 400 days.
--   gym_ai_credit_ledger              every credit in and out (kept: it is money). A spend's note holds the
--                                     request's first words, so it is cleared after 400 days, like the request.
--   owner_ai_wallet(key)              {ok, balance, free_left, monthly_free (100 or 0), plan, billing, trial, month,
--                                     low_at, packs[], recent[]}. Adds the welcome and this month's free credits first
--                                     (idempotent).
--   owner_ai_status(key)              {ok, paid, trial}: for the panel worker's fair use (a trial or unpaid gym gets 20
--                                     AI requests a day, a paid one 50). Reads only.
--   owner_ai_task_save(key, id, request, spoken, actions)
--                                     {ok, id, status}. Saves (or re-saves) a drafted task. No charge.
--                                     INVALID, NOT_FOUND (the id is another gym's), ALREADY_DONE, TOO_MANY (300 a day).
--   owner_ai_spend(key, task, credits, result)
--                                     {ok, task_id, credits, balance, free_left}. Atomic: checks the balance, writes
--                                     the spend, marks the task done. credits 1..9 (the sum of its actions: 1 a
--                                     message or change, 3 a plan; assistCatalogue.js creditsFor). NO_CREDITS, NOT_FOUND,
--                                     ALREADY_SPENT, INVALID, SUSPENDED.
--   owner_ai_refund(key, task)        {ok, task_id, refunded, balance, free_left}. Only that task's spend, once, within
--                                     10 minutes of it; the task becomes 'failed'. NOT_FOUND, ALREADY_REFUNDED, TOO_LATE.
--   owner_ai_tasks(key, limit)        {ok, tasks[]} newest first (1..100, default 30).
--   hq_ai_grant(actor, gym, credits, note, kind)
--                                     HQ only (service key). kind 'grant' (default; may be negative, never below 0)
--                                     or 'purchase' (positive). Audit row 'ai_credits_added'. Returns hq_ai_wallet.
--                                     NEED_REASON, INVALID, GONE, NOT_ENOUGH.
--   hq_ai_wallet(actor, gym)          HQ only: {balance, monthly_free, plan, month, this_month{spent, tasks_done,
--                                     tasks_drafted, added, free_given}, recent[]}. Read only (adds nothing).
-- Every owner_ai_* function is the gym OWNER's only (_owner_only_gym): a front-desk or trainer key gets OWNER_ONLY.
-- CHANGED: nothing that exists.
-- Undo: drop function public.owner_ai_wallet(text); drop function public.owner_ai_task_save(text, uuid, text, boolean,
--   jsonb); drop function public.owner_ai_spend(text, uuid, int, jsonb); drop function public.owner_ai_refund(text, uuid);
--   drop function public.owner_ai_tasks(text, int); drop function public.owner_ai_status(text);
--   drop function public.hq_ai_grant(text, uuid, int, text, text);
--   drop function public.hq_ai_wallet(text, uuid); drop function public._ai_add_free(uuid);
--   drop function public._ai_wallet_json(uuid); drop function public._ai_balance(uuid);
--   drop function public._ai_month_spent(uuid, text); drop function public._ai_monthly_free(uuid);
--   drop function public._ai_paid(uuid); drop function public._ai_trial(uuid);
--   drop function public._ai_month(); drop function public._ai_plan(uuid);
--   drop table public.gym_ai_credit_ledger; drop table public.gym_ai_tasks;

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_ai_tasks (
  task_id    uuid primary key,                       -- made by the browser, so a retried save is the same task
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  created_at timestamptz not null default now(),
  request    text not null check (char_length(request) between 1 and 600),
  spoken     boolean not null default false,
  actions    jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  status     text not null default 'drafted' check (status in ('drafted', 'done', 'cancelled', 'failed')),
  done_at    timestamptz,
  credits    int not null default 0 check (credits between 0 and 10),
  result     jsonb
);
create index if not exists gym_ai_tasks_gym on public.gym_ai_tasks(gym_id, created_at desc);
alter table public.gym_ai_tasks enable row level security;
revoke all on public.gym_ai_tasks from public, anon, authenticated;

create table if not exists public.gym_ai_credit_ledger (
  entry_id   bigint generated always as identity primary key,
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  delta      int not null,
  reason     text not null check (reason in ('welcome', 'monthly', 'expire', 'purchase', 'grant', 'spend', 'refund')),
  task_id    uuid,
  note       text check (note is null or char_length(note) <= 500),
  month      text check (month is null or month ~ '^\d{4}-\d{2}$'),  -- India month YYYY-MM
  created_at timestamptz not null default now(),
  constraint gym_ai_credit_ledger_sign check (
    (reason in ('spend', 'expire') and delta < 0)
    or (reason in ('welcome', 'monthly', 'purchase', 'refund') and delta > 0)
    or (reason = 'grant' and delta <> 0)),
  constraint gym_ai_credit_ledger_task check ((reason in ('spend', 'refund')) = (task_id is not null))
);
create index if not exists gym_ai_credit_ledger_gym on public.gym_ai_credit_ledger(gym_id, created_at desc);
create unique index if not exists gym_ai_credit_welcome_once on public.gym_ai_credit_ledger(gym_id) where reason = 'welcome';
create unique index if not exists gym_ai_credit_monthly_once on public.gym_ai_credit_ledger(gym_id, month) where reason = 'monthly';
create unique index if not exists gym_ai_credit_expire_once on public.gym_ai_credit_ledger(gym_id, month) where reason = 'expire';
create unique index if not exists gym_ai_credit_spend_once on public.gym_ai_credit_ledger(task_id) where reason = 'spend';
create unique index if not exists gym_ai_credit_refund_once on public.gym_ai_credit_ledger(task_id) where reason = 'refund';
alter table public.gym_ai_credit_ledger enable row level security;
revoke all on public.gym_ai_credit_ledger from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (nobody may call these)
create or replace function public._ai_month() returns text
  language sql stable set search_path = public as $$
  select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM')
$$;

-- The plan word the wallet shows: starter | pro | ai | trial (no plan yet = the free trial).
create or replace function public._ai_plan(p_gym uuid) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((select g.plan from public.gyms g where g.gym_id = p_gym), 'trial')
$$;

-- Paid now: a lifetime gym (founding), or paid_until still ahead (a monthly or yearly plan).
create or replace function public._ai_paid(p_gym uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select g.billing = 'lifetime' or coalesce(g.paid_until > now(), false)
                     from public.gyms g where g.gym_id = p_gym), false)
$$;

-- In the free trial: the trial has not ended and the gym has not paid.
create or replace function public._ai_trial(p_gym uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(g.trial_ends_at > now(), false) from public.gyms g where g.gym_id = p_gym), false)
     and not public._ai_paid(p_gym)
$$;

-- Free credits this month (R-470): 100 for a paid yearly plan or a founding lifetime gym, else 0.
create or replace function public._ai_monthly_free(p_gym uuid) returns int
  language sql stable security definer set search_path = public as $$
  select coalesce((select case when g.billing = 'lifetime' and (g.paid_until is null or g.paid_until > now()) then 100
                               when g.billing = 'yearly' and g.paid_until > now() then 100
                               else 0 end
                     from public.gyms g where g.gym_id = p_gym), 0)
$$;

create or replace function public._ai_balance(p_gym uuid) returns int
  language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int from public.gym_ai_credit_ledger where gym_id = p_gym
$$;

-- Credits spent in one India month (spends minus their refunds).
create or replace function public._ai_month_spent(p_gym uuid, p_month text) returns int
  language sql stable security definer set search_path = public as $$
  select greatest(0, -coalesce(sum(delta), 0))::int from public.gym_ai_credit_ledger
   where gym_id = p_gym and month = p_month and reason in ('spend', 'refund')
$$;

-- The welcome credits (once) and this month's free credits (once a month), after taking away what is left of the
-- last free month. The caller holds the gym row lock (select ... for update), so two tabs cannot both add.
create or replace function public._ai_add_free(p_gym uuid) returns void
  language plpgsql volatile security definer set search_path = public as $$
declare cur text := public._ai_month(); lm text; lfree int; unused int; mfree int;
begin
  if not exists (select 1 from public.gym_ai_credit_ledger where gym_id = p_gym and reason = 'welcome') then
    insert into public.gym_ai_credit_ledger(gym_id, delta, reason, note, month)
      values (p_gym, 20, 'welcome', 'Starter credits', cur);
  end if;
  if exists (select 1 from public.gym_ai_credit_ledger where gym_id = p_gym and reason = 'monthly' and month = cur) then
    return;
  end if;
  -- The last free month's leftovers go, even when this month brings none (a yearly plan that ran out).
  select month, delta into lm, lfree from public.gym_ai_credit_ledger
   where gym_id = p_gym and reason = 'monthly' order by month desc limit 1;
  if lm is not null and lm < cur
     and not exists (select 1 from public.gym_ai_credit_ledger where gym_id = p_gym and reason = 'expire' and month = lm) then
    unused := least(greatest(0, lfree - public._ai_month_spent(p_gym, lm)), public._ai_balance(p_gym));
    if unused > 0 then
      insert into public.gym_ai_credit_ledger(gym_id, delta, reason, note, month)
        values (p_gym, -unused, 'expire', 'Free credits of ' || lm || ' not used', lm);
    end if;
  end if;
  mfree := public._ai_monthly_free(p_gym);
  if mfree > 0 then
    insert into public.gym_ai_credit_ledger(gym_id, delta, reason, note, month)
      values (p_gym, mfree, 'monthly', 'Free credits for ' || cur, cur);
  end if;
end $$;

-- What the owner's wallet shows (after _ai_add_free).
create or replace function public._ai_wallet_json(p_gym uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare cur text := public._ai_month(); bal int := public._ai_balance(p_gym); mfree int;
begin
  select coalesce(sum(delta), 0)::int into mfree from public.gym_ai_credit_ledger
   where gym_id = p_gym and reason = 'monthly' and month = cur;
  return jsonb_build_object('ok', true,
    'balance', bal,
    'free_left', least(bal, greatest(0, mfree - public._ai_month_spent(p_gym, cur))),
    'monthly_free', public._ai_monthly_free(p_gym),
    'plan', public._ai_plan(p_gym),
    'billing', (select g.billing from public.gyms g where g.gym_id = p_gym),
    'trial', public._ai_trial(p_gym),
    'month', cur,
    'low_at', 5,
    'packs', jsonb_build_array(
      jsonb_build_object('credits', 50, 'inr', 149),
      jsonb_build_object('credits', 150, 'inr', 399, 'popular', true),
      jsonb_build_object('credits', 500, 'inr', 999)),
    'recent', coalesce((select jsonb_agg(jsonb_build_object(
        'at', floor(extract(epoch from x.created_at) * 1000)::bigint, 'delta', x.delta, 'reason', x.reason,
        'note', x.note, 'task_id', x.task_id) order by x.created_at desc, x.entry_id desc)
      from (select * from public.gym_ai_credit_ledger where gym_id = p_gym
             order by created_at desc, entry_id desc limit 20) x), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------------ the owner's functions
create or replace function public.owner_ai_wallet(p_key text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key);
begin
  perform 1 from public.gyms where gym_id = g for update;
  perform public._ai_add_free(g);
  return public._ai_wallet_json(g);
end $$;

create or replace function public.owner_ai_task_save(p_key text, p_id uuid, p_request text, p_spoken boolean, p_actions jsonb)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key); t public.gym_ai_tasks; req text := btrim(coalesce(p_request, ''));
  acts jsonb := coalesce(p_actions, '[]'::jsonb); today int;
begin
  if p_id is null or req = '' or char_length(req) > 600 or jsonb_typeof(acts) <> 'array'
     or jsonb_array_length(acts) > 5 or length(acts::text) > 20000 then
    raise exception 'INVALID';
  end if;
  select * into t from public.gym_ai_tasks where task_id = p_id for update;
  if t.task_id is not null then
    if t.gym_id <> g then raise exception 'NOT_FOUND'; end if;
    if t.status <> 'drafted' then raise exception 'ALREADY_DONE'; end if;
    update public.gym_ai_tasks set request = req, spoken = coalesce(p_spoken, false), actions = acts where task_id = p_id;
    return jsonb_build_object('ok', true, 'id', p_id, 'status', 'drafted');
  end if;
  select count(*) into today from public.gym_ai_tasks
   where gym_id = g and created_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata');
  if today >= 300 then raise exception 'TOO_MANY'; end if;
  -- Kept 400 days (the owner's history); the credit ledger is kept (money), but a spend's note (the request's
  -- first words, which can name a member) is cleared after the same 400 days.
  delete from public.gym_ai_tasks where gym_id = g and created_at < now() - interval '400 days';
  update public.gym_ai_credit_ledger set note = null
   where gym_id = g and reason = 'spend' and note is not null and created_at < now() - interval '400 days';
  insert into public.gym_ai_tasks(task_id, gym_id, request, spoken, actions)
    values (p_id, g, req, coalesce(p_spoken, false), acts);
  return jsonb_build_object('ok', true, 'id', p_id, 'status', 'drafted');
end $$;

create or replace function public.owner_ai_spend(p_key text, p_task_id uuid, p_credits int, p_result jsonb)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key); t public.gym_ai_tasks; st text; w jsonb;
begin
  -- 1 a message or a change, 3 a plan; a task of several actions costs their sum (assistCatalogue.js creditsFor).
  if p_credits is null or p_credits not between 1 and 9 then raise exception 'INVALID'; end if;
  if p_result is not null and length(p_result::text) > 20000 then raise exception 'INVALID'; end if;
  select status into st from public.gyms where gym_id = g for update;
  if st = 'suspended' then raise exception 'SUSPENDED'; end if;
  select * into t from public.gym_ai_tasks where task_id = p_task_id for update;
  if t.task_id is null or t.gym_id <> g then raise exception 'NOT_FOUND'; end if;
  if t.status <> 'drafted'
     or exists (select 1 from public.gym_ai_credit_ledger where task_id = p_task_id and reason = 'spend') then
    raise exception 'ALREADY_SPENT';
  end if;
  perform public._ai_add_free(g);
  if public._ai_balance(g) < p_credits then raise exception 'NO_CREDITS'; end if;
  insert into public.gym_ai_credit_ledger(gym_id, delta, reason, task_id, note, month)
    values (g, -p_credits, 'spend', p_task_id, left(t.request, 120), public._ai_month());
  update public.gym_ai_tasks set status = 'done', done_at = now(), credits = p_credits, result = p_result
   where task_id = p_task_id;
  w := public._ai_wallet_json(g);
  return jsonb_build_object('ok', true, 'task_id', p_task_id, 'credits', p_credits,
    'balance', w->'balance', 'free_left', w->'free_left');
end $$;

create or replace function public.owner_ai_refund(p_key text, p_task_id uuid)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key); s public.gym_ai_credit_ledger; w jsonb;
begin
  perform 1 from public.gyms where gym_id = g for update;
  select * into s from public.gym_ai_credit_ledger where task_id = p_task_id and reason = 'spend';
  if s.entry_id is null or s.gym_id <> g then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.gym_ai_credit_ledger where task_id = p_task_id and reason = 'refund') then
    raise exception 'ALREADY_REFUNDED';
  end if;
  if s.created_at < now() - interval '10 minutes' then raise exception 'TOO_LATE'; end if;
  -- The refund belongs to the spend's month, so "free left" of that month comes back too.
  insert into public.gym_ai_credit_ledger(gym_id, delta, reason, task_id, note, month)
    values (g, -s.delta, 'refund', p_task_id, 'Task did not finish', s.month);
  update public.gym_ai_tasks set status = 'failed' where task_id = p_task_id;
  w := public._ai_wallet_json(g);
  return jsonb_build_object('ok', true, 'task_id', p_task_id, 'refunded', -s.delta,
    'balance', w->'balance', 'free_left', w->'free_left');
end $$;

create or replace function public.owner_ai_tasks(p_key text, p_limit int default 30)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key); n int := least(100, greatest(1, coalesce(p_limit, 30)));
begin
  return jsonb_build_object('ok', true, 'tasks', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.task_id, 'at', floor(extract(epoch from t.created_at) * 1000)::bigint, 'request', t.request,
      'spoken', t.spoken, 'actions', t.actions, 'status', t.status,
      'done_at', case when t.done_at is null then null else floor(extract(epoch from t.done_at) * 1000)::bigint end,
      'credits', t.credits, 'result', t.result) order by t.created_at desc, t.task_id)
    from (select * from public.gym_ai_tasks where gym_id = g order by created_at desc, task_id limit n) t), '[]'::jsonb));
end $$;

-- Fair use for the panel worker (deploy/panel/assist.js): a trial or unpaid gym gets fewer AI requests a day.
create or replace function public.owner_ai_status(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key);
begin
  return jsonb_build_object('ok', true, 'paid', public._ai_paid(g), 'trial', public._ai_trial(g));
end $$;

-- ------------------------------------------------------------------ HQ (service key only)
create or replace function public.hq_ai_wallet(p_actor text, p_gym uuid)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cur text := public._ai_month();
begin
  perform public._hq_guard();
  perform public._hq_actor(p_actor);
  if not exists (select 1 from public.gyms where gym_id = p_gym) then raise exception 'GONE'; end if;
  return jsonb_build_object(
    'balance', public._ai_balance(p_gym),
    'monthly_free', public._ai_monthly_free(p_gym),
    'plan', public._ai_plan(p_gym),
    'trial', public._ai_trial(p_gym),
    'month', cur,
    'this_month', jsonb_build_object(
      'spent', public._ai_month_spent(p_gym, cur),
      'tasks_done', (select count(*) from public.gym_ai_tasks where gym_id = p_gym and status = 'done'
                       and to_char(done_at at time zone 'Asia/Kolkata', 'YYYY-MM') = cur),
      'tasks_drafted', (select count(*) from public.gym_ai_tasks where gym_id = p_gym
                          and to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = cur),
      'added', (select coalesce(sum(delta), 0) from public.gym_ai_credit_ledger where gym_id = p_gym
                  and reason in ('purchase', 'grant') and to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = cur),
      'free_given', (select coalesce(sum(delta), 0) from public.gym_ai_credit_ledger where gym_id = p_gym
                       and reason in ('welcome', 'monthly') and month = cur)),
    'recent', coalesce((select jsonb_agg(jsonb_build_object(
        'at', floor(extract(epoch from x.created_at) * 1000)::bigint, 'delta', x.delta, 'reason', x.reason,
        'note', x.note) order by x.created_at desc, x.entry_id desc)
      from (select * from public.gym_ai_credit_ledger where gym_id = p_gym
             order by created_at desc, entry_id desc limit 20) x), '[]'::jsonb));
end $$;

create or replace function public.hq_ai_grant(p_actor text, p_gym uuid, p_credits int, p_note text, p_kind text default 'grant')
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare why text; k text := coalesce(p_kind, 'grant');
begin
  perform public._hq_guard();
  perform 1 from public.gyms where gym_id = p_gym for update;
  if not found then raise exception 'GONE'; end if;
  why := public._hq_reason(p_note);
  if p_credits is null or p_credits = 0 or p_credits not between -5000 and 5000 or k not in ('grant', 'purchase')
     or (k = 'purchase' and p_credits < 0) then
    raise exception 'INVALID';
  end if;
  if p_credits < 0 and public._ai_balance(p_gym) + p_credits < 0 then raise exception 'NOT_ENOUGH'; end if;
  insert into public.gym_ai_credit_ledger(gym_id, delta, reason, note, month)
    values (p_gym, p_credits, k, why, public._ai_month());
  perform public._hq_log(p_actor, 'ai_credits_added', p_gym, why,
    jsonb_build_object('credits', p_credits, 'kind', k, 'balance', public._ai_balance(p_gym)));
  return public.hq_ai_wallet(p_actor, p_gym);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._ai_month()                     from public, anon, authenticated;
revoke all on function public._ai_plan(uuid)                   from public, anon, authenticated;
revoke all on function public._ai_monthly_free(uuid)           from public, anon, authenticated;
revoke all on function public._ai_paid(uuid)                   from public, anon, authenticated;
revoke all on function public._ai_trial(uuid)                  from public, anon, authenticated;
revoke all on function public._ai_balance(uuid)                from public, anon, authenticated;
revoke all on function public._ai_month_spent(uuid, text)      from public, anon, authenticated;
revoke all on function public._ai_add_free(uuid)               from public, anon, authenticated;
revoke all on function public._ai_wallet_json(uuid)            from public, anon, authenticated;
revoke all on function public.owner_ai_wallet(text)                                  from public;
revoke all on function public.owner_ai_task_save(text, uuid, text, boolean, jsonb)  from public;
revoke all on function public.owner_ai_spend(text, uuid, int, jsonb)                from public;
revoke all on function public.owner_ai_refund(text, uuid)                           from public;
revoke all on function public.owner_ai_tasks(text, int)                             from public;
revoke all on function public.owner_ai_status(text)                                 from public;
grant execute on function public.owner_ai_wallet(text)                                 to anon, authenticated;
grant execute on function public.owner_ai_task_save(text, uuid, text, boolean, jsonb) to anon, authenticated;
grant execute on function public.owner_ai_spend(text, uuid, int, jsonb)               to anon, authenticated;
grant execute on function public.owner_ai_refund(text, uuid)                          to anon, authenticated;
grant execute on function public.owner_ai_tasks(text, int)                            to anon, authenticated;
grant execute on function public.owner_ai_status(text)                                to anon, authenticated;
revoke all on function public.hq_ai_wallet(text, uuid)                   from public, anon, authenticated;
revoke all on function public.hq_ai_grant(text, uuid, int, text, text)   from public, anon, authenticated;
grant execute on function public.hq_ai_wallet(text, uuid)                to service_role;
grant execute on function public.hq_ai_grant(text, uuid, int, text, text) to service_role;

notify pgrst, 'reload schema';
