-- NOT APPLIED YET. The owner said yes (R-511, 14 Nov 2026: "yes."); the coordinator applies it live after CI is green.
-- Paste into the Supabase SQL Editor. Needs only 0053's member_ask_trainer and 0055's member_membership (both live);
-- it does not depend on 0073. Re-runnable (create or replace only, no table, no row changed). Test:
-- supabase/tests/0074_ask_trainer_paid_plan.sql (CI runs it after every migration; pasted into the SQL Editor it
-- always ends in an error and so changes nothing).
--
-- 0074: "Ask a trainer" only for members on a running paid gym plan (R-505, owner 14 Nov 2026: "Unless someone is on a
-- paid plan with the gym, they shouldn't be able to send questions to a trainer.").
-- member_ask_trainer (0053) now refuses with NO_PLAN unless the gym's own list ("My membership", member_membership,
-- 0023 + 0055) shows a plan that covers today (India; a plan ending today still counts) and the member does not
-- train on a pass (FITPASS, cultpass...: they pay the pass company, not the gym). So NO_PLAN for:
--   a pass member (even with an old plan still running), a member whose plan ended, a member with no plan, a plan
--   that only starts later, a cancelled plan, and a number the gym's list cannot match (NO_PHONE, NOT_ON_ROSTER,
--   SHARED_NUMBER, NAME_MISMATCH, GYM_NOT_ONLINE: no plan can be known, so nobody may ask).
-- The member app (R-505, the release after 0.77.0) hides "Ask a trainer" from these members and locks it after a
-- plan ends, from the same answer; this file makes sure an OLDER app cannot send either (it shows "Could not send").
-- Unchanged: the member still reads every old question and reply (member_questions), can still take back a question
-- with no reply yet (member_withdraw_question), and the gym still answers it (owner_answer_question). The admin panel
-- needs no change: trainers simply get no new questions from these members.
-- Copied from 0053 with only the lines marked 0074 added.
--
-- Undo: re-run 0053's member_ask_trainer; drop function public._tq_plan_ok(text).

set lock_timeout = '3s';

-- True when the gym's list shows this member a plan covering today and no pass. No grants: only the server calls it.
create or replace function public._tq_plan_ok(p_key text)
  returns boolean language plpgsql stable security definer set search_path = public as $$
declare a jsonb := public.member_membership(p_key);
begin
  return coalesce(a->>'ok', '') = 'true'
     and jsonb_typeof(a->'current') = 'object'
     and nullif(btrim(coalesce(a->>'pass', '')), '') is null;
end $$;
revoke all on function public._tq_plan_ok(text) from public, anon, authenticated;

-- 0053's member_ask_trainer. Changed: the line marked 0074 (NO_PLAN).
create or replace function public.member_ask_trainer(p_key text, p_staff uuid, p_question text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); txt text; link jsonb; q public.trainer_questions;
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  -- 0074 (R-505): only a member on a running paid plan at this gym may ask.
  if not public._tq_plan_ok(p_key) then raise exception 'NO_PLAN'; end if;
  txt := public._tq_text(p_question, 500);
  if p_staff is not null and not public._tq_live_trainer(m.gym_id, p_staff) then raise exception 'NOT_TRAINER'; end if;
  if exists (select 1 from public.gyms where gym_id = m.gym_id and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  -- One at a time per member, even with two taps at once.
  perform 1 from public.gym_members where member_id = m.member_id for update;
  if exists (select 1 from public.trainer_questions x where x.member_id = m.member_id and public._tq_open(x)) then
    raise exception 'OPEN_QUESTION';
  end if;
  if (select count(*) from public.trainer_questions x where x.member_id = m.member_id and x.asked_at > now() - interval '24 hours') >= 3 then
    raise exception 'TOO_MANY';
  end if;
  link := public._member_roster_link(p_key);
  insert into public.trainer_questions(gym_id, member_id, roster_id, staff_id, question)
    values (m.gym_id, m.member_id, link->>'rosterId', p_staff, txt)
  returning * into q;
  return jsonb_build_object('ok', true, 'question', public._tq_member_row(q));
end $$;

revoke all on function public.member_ask_trainer(text, uuid, text) from public;
grant execute on function public.member_ask_trainer(text, uuid, text) to anon, authenticated;
