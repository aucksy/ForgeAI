-- APPLIED LIVE 14 Nov 2026 (R-544: owner said "yes to AI credits database change"; SQL Editor from 3db4fee9;
-- live tests 0083 PASS 40, 0078 PASS 47). Charging still held: AI_CREDITS_CHARGE unset until the panel deploy.
-- WAS: NOT LIVE - needs the owner's yes ("No LIVE database changes without my yes"). Re-runnable. Apply after 0078 (AI
-- questions on the credits) and 0075 (gym alerts). Works with or without 0077 / 0080 (each adds a gym_alerts kind; the
-- kind check is rebuilt from what it is, so theirs stay).
-- Test: supabase/tests/0083_ai_members.sql (CI runs it after every migration; pasted into the SQL Editor it always ends
-- in an error and so changes nothing). 0078's test runs against the functions replaced here (it was updated for them).
-- Until this is applied, nothing changes: the panel Worker still holds charging (AI_CREDITS_CHARGE unset, R-530), and
-- the admin app shows no "AI answers for members" controls (owner_ai_questions answers without the new numbers).
--
-- 0083: decision #98 = B (R-531, owner 14 Nov 2026: "I pick B").
--   * The owner's and staff's own AI questions are FREE. They still count against the fair daily limit (60 each) and
--     are still recorded (who asked), but take no credit and never open a block.
--   * Members' AI answers (and later the gym page's visitors') use the gym's credits: 10 answers = 1 credit
--     (per_credit 20 -> 10 in _ai_q_rules()). Members and visitors never see credit words (deploy/panel/helpPages.js).
--   * The owner's switch "Members can get AI answers" (default ON) and a monthly limit for members' and visitors' AI
--     answers in credits (default 20, the owner can set 0 to 500), so no surprise bill. Switch off: reason 'off' (members);
--     past the limit: reason 'month_limit' (members and visitors). The Worker then answers from the help pages.
--   * ONE owner alert (gym_alerts kind 'ai_members_limit') when members reach the monthly limit, once per India month.
--     None when the owner set the limit to 0 (that was the owner's own choice).
--
-- NEW
--   gym_ai_member_rules     per gym: members_on (default true), month_credits (default 20, 0..500). RLS on, no grants.
--                           No row = the defaults.
--   owner_ai_member_rules(key)                              -> {ok, members_on, month_credits, month_max, per_credit,
--                                                              month_answers, month_used}. The OWNER only.
--   owner_save_ai_member_rules(key, members_on, month_credits) -> the same. The OWNER only; INVALID outside 0..500.
--   _ai_members_limit_alert(gym, month)   the once-a-month alert (no grants).
-- CHANGED
--   _ai_q_rules()           per_credit 10; month_credits 20 (the default) and month_max 500 added.
--   _ai_q_take              owner / staff free (day limit only); member: 'off' when the switch is off; member and
--                           visitor: 'month_limit' past the month's limit; the block's note "10 AI answers for members".
--   ai_question_back        gives a slot back only for a member's or visitor's question (an owner's took none).
--   owner_ai_questions      adds members_on, month_credits, month_max, month_answers (members' and visitors' answers
--                           this India month) and month_used (credits those answers used).
--   0075's gym_alerts kinds + 'ai_members_limit'.
-- Undo: drop function public.owner_ai_member_rules(text); drop function public.owner_save_ai_member_rules(text, boolean, int);
--   drop function public._ai_members_limit_alert(uuid, text); drop function public._ai_member_rules(uuid);
--   drop table public.gym_ai_member_rules; then re-run 0078 (its _ai_q_rules, _ai_q_take, ai_question_back and
--   owner_ai_questions). 'ai_members_limit' may stay in the gym_alerts check.

set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('public._ai_q_take(uuid, text, text)') is null then raise exception '0083 needs 0078 (AI questions) first'; end if;
  if to_regclass('public.gym_alerts') is null then raise exception '0083 needs 0075 (gym alerts) first'; end if;
end $$;

-- ------------------------------------------------------------------ the owner's switch and monthly limit
create table if not exists public.gym_ai_member_rules (
  gym_id        uuid primary key references public.gyms(gym_id) on delete cascade,
  members_on    boolean not null default true,
  month_credits int not null default 20 check (month_credits between 0 and 500),
  updated_at    timestamptz not null default now()
);
alter table public.gym_ai_member_rules enable row level security;
revoke all on public.gym_ai_member_rules from public, anon, authenticated;

-- ------------------------------------------------------------------ 0075's alert kinds + 'ai_members_limit'
do $$
declare c record; done boolean := false;
begin
  for c in select conname, pg_get_constraintdef(oid) as def from pg_constraint
            where conrelid = 'public.gym_alerts'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%trainer_question%' loop
    if position('''ai_members_limit''' in c.def) = 0 then
      execute format('alter table public.gym_alerts drop constraint %I', c.conname);
      execute format('alter table public.gym_alerts add constraint %I %s', c.conname,
                     regexp_replace(c.def, '\](\)+)\s*$', ', ''ai_members_limit''::text]\1'));
    end if;
    done := true;
  end loop;
  if not done then raise exception '0083: the gym_alerts kind check was not found'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.gym_alerts'::regclass and contype = 'c'
                  and pg_get_constraintdef(oid) like '%''ai_members_limit''%') then
    raise exception '0083: ai_members_limit could not be added to the gym_alerts kind check';
  end if;
end $$;

-- ------------------------------------------------------------------ the numbers (one place)
create or replace function public._ai_q_rules() returns jsonb
  language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'per_credit', 10,        -- members' and visitors' answers for 1 credit (decision #98 = B, R-531)
    'member_day', 10,        -- one member, one India day
    'visitor_day', 3,        -- one gym-page visitor, one India day
    'staff_day', 60,         -- the owner, or one staff person, one India day (free, R-531)
    'members_gym_day', 200,  -- all members of one gym together, one India day
    'visitors_gym_day', 30,  -- all visitors of one gym's page together, one India day
    'month_credits', 20,     -- members' and visitors' answers a month, in credits, until the owner changes it
    'month_max', 500,        -- the most the owner can set
    'low_at', 10)            -- the "credits low" alert, once, when a spend takes the balance to this or below
$$;

-- The gym's switch and limit (the defaults when the owner never saved them).
create or replace function public._ai_member_rules(p_gym uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('members_on', members_on, 'month_credits', month_credits)
       from public.gym_ai_member_rules where gym_id = p_gym),
    jsonb_build_object('members_on', true, 'month_credits', (public._ai_q_rules()->>'month_credits')::int))
$$;

-- "Members have used this month's AI answers": once per India month (the tag carries the month).
create or replace function public._ai_members_limit_alert(p_gym uuid, p_month text) returns void
  language plpgsql security definer set search_path = public as $$
declare next_month date := (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month')::date;
begin
  perform public._alert(p_gym, 'ai_members_limit', p_gym::text, 'ai_month:' || p_gym || ':' || p_month, 'owner', false,
    format('Members have used this month''s AI answers. Until %s, they get help pages instead. To give them more, open AI Assistant and tap your credits at the top.',
           to_char(next_month, 'FMDD Mon')),
    '/assistant');
exception when others then
  raise warning 'members limit alert not made: %', sqlerrm;
end $$;

-- ------------------------------------------------------------------ the take (nobody may call it)
create or replace function public._ai_q_take(p_gym uuid, p_who text, p_person text) returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare
  rules jsonb := public._ai_q_rules();
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_month text := public._ai_month();
  v_status text; v_mine int; v_all int; v_per int; v_cap int; v_slots int; v_id uuid; v_opened boolean := false;
  v_rules jsonb; v_limit int; v_used int; v_block int := (rules->>'per_credit')::int;
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
  v_rules := public._ai_member_rules(p_gym);
  -- The owner's switch is for members (the page's visitors only have the monthly limit).
  if p_who = 'member' and not (v_rules->>'members_on')::boolean then
    return jsonb_build_object('ok', false, 'reason', 'off', 'who', p_who, 'per_day', v_per);
  end if;
  select count(*) into v_mine from public.gym_ai_questions
   where gym_id = p_gym and day = v_day and who = p_who and person = p_person and not given_back;
  if v_mine >= v_per then
    return jsonb_build_object('ok', false, 'reason', 'day_limit', 'who', p_who, 'per_day', v_per);
  end if;

  -- The owner and staff: free (R-531). Recorded, so the owner sees who asked; no credit, no block.
  if p_who in ('owner', 'staff') then
    insert into public.gym_ai_questions(gym_id, who, person, day, month, opened_block)
      values (p_gym, p_who, p_person, v_day, v_month, false) returning question_id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'who', p_who, 'balance', public._ai_balance(p_gym),
      'left_today', greatest(0, v_per - v_mine - 1));
  end if;

  v_cap := case p_who when 'member' then (rules->>'members_gym_day')::int else (rules->>'visitors_gym_day')::int end;
  select count(*) into v_all from public.gym_ai_questions
   where gym_id = p_gym and day = v_day and who = p_who and not given_back;
  if v_all >= v_cap then
    return jsonb_build_object('ok', false, 'reason', 'gym_limit', 'who', p_who, 'per_day', v_per);
  end if;
  -- The owner's monthly limit: members' and visitors' answers together, in credits.
  v_limit := (v_rules->>'month_credits')::int * v_block;
  select count(*) into v_used from public.gym_ai_questions
   where gym_id = p_gym and month = v_month and who in ('member', 'visitor') and not given_back;
  if v_used >= v_limit then
    if v_limit > 0 then perform public._ai_members_limit_alert(p_gym, v_month); end if;
    return jsonb_build_object('ok', false, 'reason', 'month_limit', 'who', p_who, 'per_day', v_per);
  end if;
  -- The welcome and this month's free credits count for these answers too (0071).
  perform public._ai_add_free(p_gym);
  insert into public.gym_ai_question_slots(gym_id, slots) values (p_gym, 0) on conflict (gym_id) do nothing;
  select slots into v_slots from public.gym_ai_question_slots where gym_id = p_gym for update;
  if v_slots <= 0 then
    if public._ai_balance(p_gym) < 1 then
      return jsonb_build_object('ok', false, 'reason', 'no_credits', 'who', p_who, 'per_day', v_per);
    end if;
    insert into public.gym_ai_credit_ledger(gym_id, delta, reason, note, month)
      values (p_gym, -1, 'questions', format('%s AI answers for members', v_block), v_month);
    v_slots := v_block;
    v_opened := true;
  end if;
  update public.gym_ai_question_slots set slots = v_slots - 1, updated_at = now() where gym_id = p_gym;
  insert into public.gym_ai_questions(gym_id, who, person, day, month, opened_block)
    values (p_gym, p_who, p_person, v_day, v_month, v_opened) returning question_id into v_id;
  -- This answer was the month's last one: the owner hears it now, not only when the next member is refused.
  if v_used + 1 >= v_limit then perform public._ai_members_limit_alert(p_gym, v_month); end if;
  if random() < 0.01 then
    delete from public.gym_ai_questions where at < now() - interval '400 days';
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'who', p_who, 'balance', public._ai_balance(p_gym),
    'left_today', greatest(0, v_per - v_mine - 1));
end $$;

-- The AI did not answer: the question does not count (once, within 10 minutes). A member's or visitor's answer gives
-- its slot back to the block; an owner's or staff question took none (R-531), so it gives none.
create or replace function public.ai_question_back(p_id uuid)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare q public.gym_ai_questions;
begin
  select * into q from public.gym_ai_questions where question_id = p_id for update;
  if q.question_id is null or q.given_back or q.at < now() - interval '10 minutes' then
    return jsonb_build_object('ok', false);
  end if;
  update public.gym_ai_questions set given_back = true where question_id = p_id;
  if q.who in ('member', 'visitor') then
    update public.gym_ai_question_slots set slots = slots + 1, updated_at = now() where gym_id = q.gym_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ the owner's numbers
-- The switch, the limit and what members used this month (one shape for the read, the save and owner_ai_questions).
create or replace function public._ai_member_json(p_gym uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select public._ai_member_rules(p_gym) || jsonb_build_object(
    'month_max', (public._ai_q_rules()->>'month_max')::int,
    'per_credit', (public._ai_q_rules()->>'per_credit')::int,
    'month_answers', (select count(*) from public.gym_ai_questions
                       where gym_id = p_gym and month = public._ai_month() and who in ('member', 'visitor') and not given_back),
    'month_used', (select coalesce(-sum(delta), 0)::int from public.gym_ai_credit_ledger
                    where gym_id = p_gym and month = public._ai_month() and reason = 'questions'))
$$;

create or replace function public.owner_ai_member_rules(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key);
begin
  return jsonb_build_object('ok', true) || public._ai_member_json(g);
end $$;

create or replace function public.owner_save_ai_member_rules(p_key text, p_members_on boolean, p_month_credits int)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key);
begin
  if p_members_on is null or p_month_credits is null
     or p_month_credits not between 0 and (public._ai_q_rules()->>'month_max')::int then
    raise exception 'INVALID';
  end if;
  insert into public.gym_ai_member_rules(gym_id, members_on, month_credits) values (g, p_members_on, p_month_credits)
    on conflict (gym_id) do update set members_on = excluded.members_on, month_credits = excluded.month_credits, updated_at = now();
  return jsonb_build_object('ok', true) || public._ai_member_json(g);
end $$;

-- Where the credits went this India month (the Credits sheet), now with the members' switch and limit. The owner only.
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
    'slots', coalesce((select slots from public.gym_ai_question_slots where gym_id = g), 0))
    || public._ai_member_json(g);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._ai_q_rules()                          from public, anon, authenticated;
revoke all on function public._ai_q_take(uuid, text, text)           from public, anon, authenticated;
revoke all on function public._ai_member_rules(uuid)                 from public, anon, authenticated;
revoke all on function public._ai_member_json(uuid)                  from public, anon, authenticated;
revoke all on function public._ai_members_limit_alert(uuid, text)    from public, anon, authenticated;
revoke all on function public.ai_question_back(uuid)                 from public;
revoke all on function public.owner_ai_questions(text)               from public;
revoke all on function public.owner_ai_member_rules(text)            from public;
revoke all on function public.owner_save_ai_member_rules(text, boolean, int) from public;
grant execute on function public.ai_question_back(uuid)               to anon, authenticated;
grant execute on function public.owner_ai_questions(text)             to anon, authenticated;
grant execute on function public.owner_ai_member_rules(text)          to anon, authenticated;
grant execute on function public.owner_save_ai_member_rules(text, boolean, int) to anon, authenticated;

notify pgrst, 'reload schema';
