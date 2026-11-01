-- NOT APPLIED LIVE: the owner must say yes before this goes to the gym server.
--
-- 0047: challenge rewards given out by themselves (F143, 1 Nov 2026; owner's backlog: "When the month's
-- challenge ends, the gym server marks each winner. The admin app lists them under Challenges with the
-- reward to hand over, and each winner gets a gym notice saying what they won and where to collect it.").
-- Additive and re-runnable: new columns on gym_challenge_hits, one new helper, and 0037's
-- _challenge_results and owner_challenges replaced (each is 0037's, copied, with only the marked changes).
-- Nothing else that exists is changed. Apply after 0046 (needs 0025, 0037, 0042).
-- Test: supabase/tests/0047_challenge_rewards.sql (CI runs it after every migration; pasted into the SQL
-- Editor it always ends in an error and so changes nothing).
-- Undo: re-run 0037's _challenge_results and owner_challenges; drop function public._challenge_rewards(uuid)
-- (the new columns can stay; the admin app then shows its old "give them by hand" line).
--
-- WHEN. The moment 0037 copies a finished challenge's winners (the first owner_challenges or member_board
-- read after its last day), each winner's line is marked 'pending' when the challenge has free days
-- (prize_days > 0), else 'none'. Straight after, in the same transaction, _challenge_rewards hands them
-- out. A challenge whose winners were copied BEFORE this file has reward_state null on every line and is
-- never touched: the owner may already have given those days by hand. (One that ended before this file
-- but was not read yet is copied after it, so it is given out.) Rewards come when the challenge is over,
-- never while it runs: a phone can still lower a member's number until the last day.
--
-- GIVING THE DAYS: the same write as the workout offer's automatic reward (0025 _offer_give), so the
-- member's page, the plan's history and the member's plan card all agree:
--   * who: the app member is matched to the gym's own list with 0025's _offer_identity (0023's checks:
--     the number matched at a check-in, the first name, never a shared number);
--   * which plan: 0025's _offer_plan (the gym plan that ends last, today or later; not a PT pack, not
--     cancelled, not deleted);
--   * the write: its last day moves on by prize_days, its notes get "+7 days (Reward - Gym challenge):
--     2026-12-01 -> 2026-12-08" (the admin app shows "Extended free by 7 days (reward): 1 Dec -> 8 Dec";
--     no receipt, no GST: it is not a sale), and the gym's records version moves on by one so every
--     admin app picks it up.
-- No plan today or later: nothing is invented. The line says 'by_hand' with reason 'no_plan'. Not matched
-- to the gym's list: 'by_hand', 'no_match'. A winner who left the gym: 'by_hand', 'left' (no message).
--
-- ONCE ONLY. Every line moves from 'pending' exactly once, under the gym's row lock (the lock crm_push,
-- check-in and 0025's reward take) and the line's own row lock; a second read finds nothing pending and
-- does nothing. given_at, the plan changed and its old and new last day are kept on the line.
--
-- A PAUSED (suspended) GYM: nothing is given and no message goes; the lines stay 'pending' and are given
-- on the first read after HQ switches the gym back on (owner_challenges tries every pending one).
--
-- THE MESSAGE. Each winner gets one in-app gym message (0025's group message: gym_messages + gym_message_to,
-- so it shows in the member's inbox and rings the phone like any gym message, 0038 / 0042's quiet rule):
--   added:   "You reached the goal in the gym challenge "<title>". 7 free days were added to your membership."
--   by hand: "You reached the goal in the gym challenge "<title>". You won 7 free days. Ask at the front desk
--             to add them to your membership."
-- At most two messages per challenge (one per group). They show in the admin app's Sent list and count
-- towards the day's 10 like any other message (owner_send_message's own check is not changed).
--
-- WHAT THE ADMIN APP READS (owner_challenges): the answer gains autoRewards: true (this file is applied),
-- and each kept winner gains reward: {state: pending|added|by_hand|none, reason: no_plan|no_match|left|null,
-- days, newEnd 'YYYY-MM-DD' | null} (null for a challenge still running, and for lines kept before this file).

set lock_timeout = '3s';

-- ------------------------------------------------------------------ columns
alter table public.gym_challenge_hits add column if not exists reward_state text;
alter table public.gym_challenge_hits add column if not exists reward_reason text;
alter table public.gym_challenge_hits add column if not exists reward_days int;
alter table public.gym_challenge_hits add column if not exists given_at timestamptz;
alter table public.gym_challenge_hits add column if not exists given_membership_id text;
alter table public.gym_challenge_hits add column if not exists old_end date;
alter table public.gym_challenge_hits add column if not exists new_end date;
alter table public.gym_challenge_hits drop constraint if exists gym_challenge_hits_reward_state_check;
alter table public.gym_challenge_hits add constraint gym_challenge_hits_reward_state_check
  check (reward_state is null or reward_state in ('pending', 'added', 'by_hand', 'none'));
alter table public.gym_challenge_hits drop constraint if exists gym_challenge_hits_reward_reason_check;
alter table public.gym_challenge_hits add constraint gym_challenge_hits_reward_reason_check
  check (reward_reason is null or reward_reason in ('no_plan', 'no_match', 'left'));
create index if not exists gym_challenge_hits_pending on public.gym_challenge_hits(challenge_id) where reward_state = 'pending';
-- The table keeps 0037's row security (on, no policies) and its revokes.

-- ------------------------------------------------------------------ giving the rewards (no grants)
-- Hand out every 'pending' line of one finished challenge (see the top). Cheap when nothing is pending.
create or replace function public._challenge_rewards(p_challenge uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c public.gym_challenges; g public.gyms; h public.gym_challenge_hits; m public.gym_members;
  who record; ms public.crm_records; today date := public._ist_today();
  v_old date; v_new date; v bigint; line text; prize text; head text; msg public.gym_messages;
  added uuid[] := '{}'; by_hand uuid[] := '{}';
begin
  if not exists (select 1 from public.gym_challenge_hits where challenge_id = p_challenge and reward_state = 'pending') then return; end if;
  select * into c from public.gym_challenges where id = p_challenge;
  if c.id is null then return; end if;
  -- The gym's row lock first (the order crm_push and 0025's _offer_give use), then the lines.
  select * into g from public.gyms where gym_id = c.gym_id for update;
  if g.status = 'suspended' then return; end if;
  v := coalesce(g.crm_version, 0) + 1;

  for h in select * from public.gym_challenge_hits where challenge_id = c.id and reward_state = 'pending' order by member_id for update loop
    if c.prize_days <= 0 or c.cancelled_at is not null then
      update public.gym_challenge_hits set reward_state = 'none' where challenge_id = c.id and member_id = h.member_id;
      continue;
    end if;
    select * into m from public.gym_members where member_id = h.member_id and gym_id = c.gym_id;
    if m.member_id is null or m.left_at is not null then
      update public.gym_challenge_hits set reward_state = 'by_hand', reward_reason = 'left', reward_days = c.prize_days
       where challenge_id = c.id and member_id = h.member_id;
      continue;
    end if;
    select * into who from public._offer_identity(m);
    if who.roster_id is null then
      update public.gym_challenge_hits set reward_state = 'by_hand', reward_reason = 'no_match', reward_days = c.prize_days
       where challenge_id = c.id and member_id = h.member_id;
      by_hand := by_hand || m.member_id;
      continue;
    end if;
    ms := public._offer_plan(c.gym_id, who.roster_id, today, false);
    if ms.id is null then
      update public.gym_challenge_hits set reward_state = 'by_hand', reward_reason = 'no_plan', reward_days = c.prize_days
       where challenge_id = c.id and member_id = h.member_id;
      by_hand := by_hand || m.member_id;
      continue;
    end if;
    -- 0025 _offer_give's write, with this reason.
    v_old := public._iso_day(ms.data->>'endsOn');
    v_new := v_old + c.prize_days;
    line := '+' || c.prize_days || ' days (Reward - Gym challenge): ' || to_char(v_old, 'YYYY-MM-DD') || ' -> ' || to_char(v_new, 'YYYY-MM-DD');
    update public.crm_records
       set data = data || jsonb_build_object(
                    'endsOn', to_char(v_new, 'YYYY-MM-DD'),
                    'notes', case when coalesce(btrim(data->>'notes'), '') = '' then line else (data->>'notes') || E'\n' || line end,
                    'updatedAt', floor(extract(epoch from now()) * 1000)::bigint),
           version = v, updated_at = now()
     where gym_id = c.gym_id and kind = 'membership' and id = ms.id;
    update public.gym_challenge_hits
       set reward_state = 'added', reward_reason = null, reward_days = c.prize_days, given_at = now(),
           given_membership_id = ms.id, old_end = v_old, new_end = v_new
     where challenge_id = c.id and member_id = h.member_id;
    added := added || m.member_id;
  end loop;

  if coalesce(array_length(added, 1), 0) > 0 then
    update public.gyms set crm_version = v where gym_id = c.gym_id;
  end if;

  -- The messages: one to those whose days were added, one to those who collect them at the desk.
  prize := case when c.prize_days = 1 then '1 free day' else c.prize_days || ' free days' end;
  head := 'You reached the goal in the gym challenge "' || c.title || '". ';
  if coalesce(array_length(added, 1), 0) > 0 then
    insert into public.gym_messages(gym_id, kind, title, body, recipients, to_group)
      values (c.gym_id, 'announcement', 'You won the gym challenge',
              head || prize || case when c.prize_days = 1 then ' was' else ' were' end || ' added to your membership.',
              array_length(added, 1), true)
      returning * into msg;
    insert into public.gym_message_to(message_id, member_id) select msg.message_id, x from unnest(added) x on conflict do nothing;
  end if;
  if coalesce(array_length(by_hand, 1), 0) > 0 then
    insert into public.gym_messages(gym_id, kind, title, body, recipients, to_group)
      values (c.gym_id, 'announcement', 'You won the gym challenge',
              head || 'You won ' || prize || '. Ask at the front desk to add '
                || case when c.prize_days = 1 then 'it' else 'them' end || ' to your membership.',
              array_length(by_hand, 1), true)
      returning * into msg;
    insert into public.gym_message_to(message_id, member_id) select msg.message_id, x from unnest(by_hand) x on conflict do nothing;
  end if;
end $$;

-- ------------------------------------------------------------------ 0037's copy of results, plus the rewards
-- 0037's _challenge_results. Changes: each copied line gets reward_state ('pending' with free days, else
-- 'none'); an already-kept result hands out anything still pending; the rewards follow the copy.
create or replace function public._challenge_results(p_challenge uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c public.gym_challenges; today date := (now() at time zone 'Asia/Kolkata')::date;
  prev text := coalesce(current_setting('forgeai.hq', true), 'off');
begin
  select * into c from public.gym_challenges where id = p_challenge for update;
  if c.id is null or c.cancelled_at is not null or c.ends_on >= today then return; end if;
  if c.results_at is not null then
    perform public._challenge_rewards(c.id);  -- 0047: a paused gym's rewards, given once it is back on
    return;
  end if;
  perform set_config('forgeai.hq', 'on', true);
  insert into public.gym_challenge_hits(challenge_id, member_id, name, phone, value, reward_state)
    select c.id, h.m_id, regexp_replace(btrim(h.m_name), '\s+', ' ', 'g'), h.m_phone, h.total,
           case when c.prize_days > 0 then 'pending' else 'none' end
      from public._challenge_hitters(c) h
  on conflict do nothing;
  update public.gym_challenges set results_at = now(),
         entrants = (select count(distinct d.member_id) from public.gym_member_days d
                       join public.gym_members x on x.member_id = d.member_id
                      where d.gym_id = c.gym_id and x.left_at is null and d.day between c.starts_on and c.ends_on)
   where id = c.id;
  perform set_config('forgeai.hq', prev, true);
  perform public._challenge_rewards(c.id);  -- 0047
end $$;

-- ------------------------------------------------------------------ the gym's side
-- 0037's owner_challenges. Changes: kept results with pending rewards are tried again; the answer says
-- autoRewards: true; each kept winner carries reward {state, reason, days, newEnd}.
create or replace function public.owner_challenges(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  out jsonb; cx uuid;
begin
  perform public._board_cleanup(g);
  for cx in select id from public.gym_challenges c
            where c.gym_id = g and c.cancelled_at is null and c.ends_on < today and c.ends_on >= today - 365
              and (c.results_at is null
                   or exists (select 1 from public.gym_challenge_hits h where h.challenge_id = c.id and h.reward_state = 'pending')) loop
    perform public._challenge_results(cx);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id::text, 'title', c.title, 'measure', c.measure, 'goal', c.goal,
      'startsOn', to_char(c.starts_on, 'YYYY-MM-DD'), 'endsOn', to_char(c.ends_on, 'YYYY-MM-DD'),
      'prizeDays', c.prize_days, 'createdByName', c.created_by_name,
      'createdAt', floor(extract(epoch from c.created_at) * 1000)::bigint,
      'cancelledAt', case when c.cancelled_at is null then null else floor(extract(epoch from c.cancelled_at) * 1000)::bigint end,
      'status', case when c.cancelled_at is not null then 'cancelled' when today < c.starts_on then 'upcoming'
                     when today <= c.ends_on then 'running' else 'ended' end,
      'entrants', case when c.ends_on < today and c.results_at is not null then coalesce(c.entrants, 0) else (
                   select count(distinct d.member_id) from public.gym_member_days d
                     join public.gym_members x on x.member_id = d.member_id
                    where d.gym_id = g and x.left_at is null and d.day between c.starts_on and c.ends_on) end,
      'hitters', case
        when c.cancelled_at is not null then '[]'::jsonb
        when c.ends_on < today then coalesce((
          select jsonb_agg(jsonb_build_object('memberId', h.member_id::text, 'name', h.name, 'phone', h.phone, 'value', h.value,
                             'reward', case when h.reward_state is null then null else jsonb_build_object(
                               'state', h.reward_state, 'reason', h.reward_reason, 'days', coalesce(h.reward_days, c.prize_days),
                               'newEnd', to_char(h.new_end, 'YYYY-MM-DD')) end)
                           order by h.value desc, h.name, h.member_id)
            from public.gym_challenge_hits h where h.challenge_id = c.id), '[]'::jsonb)
        else coalesce((
          select jsonb_agg(jsonb_build_object('memberId', h.m_id::text, 'name', regexp_replace(btrim(h.m_name), '\s+', ' ', 'g'), 'phone', h.m_phone, 'value', h.total)
                           order by h.total desc, h.m_name, h.m_id)
            from public._challenge_hitters(c) h), '[]'::jsonb) end
    ) order by c.starts_on desc, c.created_at desc), '[]'::jsonb)
    into out
    from public.gym_challenges c
   where c.gym_id = g and c.ends_on >= today - 365;
  return jsonb_build_object('canEdit', st.staff_id is null or st.role = 'owner', 'autoRewards', true, 'challenges', out);
end $$;

-- ------------------------------------------------------------------ grants
-- create or replace keeps the grants 0037 gave; only the new helper is closed.
revoke all on function public._challenge_rewards(uuid) from public, anon, authenticated;

-- PostgREST learns the changed functions at once (instead of on its next schema reload).
notify pgrst, 'reload schema';
