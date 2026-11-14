-- APPLIED LIVE 14 Nov 2026 (owner: "yes to the Feedback database change"); live tests 0087 PASS 30, 0069 PASS 56, 0075 PASS 28.
-- SQL Editor after CI is green.
--
-- 0087: R-552. Owner, 14 Nov 2026 (verbatim): "A (my pick): Feedback goes to you and the front desk only".
-- Also (14 Nov 2026): "the feedback someone is sending from the gym section is a feedback for the gym, not for the
-- MettleUp ... just want to make sure that the person sending the feedback is very clear that they're sending the
-- feedback for the gym and only the gym owners read that".
--
-- WHAT CHANGES. "Message your gym" feedback (0069) was read by everyone signed in at the gym except for complaints.
-- From now on:
--   - Question:  the owner, the front desk and trainers (as before);
--   - Feedback:  the owner and the front desk only. A trainer (a person the owner ticked as "Trainer", 0050
--                gym_trainers, whose role is not 'owner') can no longer list, read, reply to, mark done, count or
--                be alerted about feedback (owner_talk_list / owner_talk_count / owner_talk_reply / owner_talk_done,
--                and the gym's alerts: owner_alerts, and the browser pushes of 0076, which ask _alert_visible);
--   - Complaint: the owner only (as before).
-- "The owner" stays what 0069 says: an owner key, or a person whose role is 'owner' (even if also ticked as Trainer).
-- "The front desk": everyone else signed in at the gym who is NOT ticked as Trainer.
-- Feedback alerts written before this change are hidden from trainers too (the rule is read on every look, by kind).
--
-- Re-runnable: CREATE OR REPLACE of four functions with the same names and arguments; no table, no new function,
-- nothing members or anon can newly call (grants restated exactly as 0069 / 0075 left them).
--   _talk_viewer   also says whether the person is ticked as Trainer ('trainer');
--   _talk_visible  feedback: the owner, or a person who is not a trainer;
--   owner_talk_list  also answers 'feedback' (true: this person sees feedback), so the admin app hides the Feedback
--                    button for a trainer; 'role' stays 'owner' / 'staff' (older admin apps read it unchanged);
--   _alert_visible a feedback alert ('member_feedback') is hidden from a trainer who is not the owner (0075's
--                  _alert_viewer already says who is a trainer; unchanged).
-- Apply after 0069, 0075 and 0086. Test: supabase/tests/0087_feedback_owner_desk.sql (CI runs it after every
-- migration; pasted into the SQL Editor it always ends in an error and so changes nothing).
-- Undo: run 0069's _talk_viewer, _talk_visible and owner_talk_list, and 0075's _alert_visible again.

set lock_timeout = '3s';

-- Who is asking at the gym: {gym, staff (null for an owner key), owner, trainer, name}. BAD_KEY for no live key.
create or replace function public._talk_viewer(p_key text) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key);
begin
  return jsonb_build_object('gym', g, 'staff', st.staff_id,
    'owner', st.staff_id is null or st.role = 'owner',
    -- Ticked as "Trainer" by the owner (0050). An owner key is never a trainer.
    'trainer', st.staff_id is not null
               and exists (select 1 from public.gym_trainers x where x.staff_id = st.staff_id and x.gym_id = g),
    -- An owner key has no person: the gym's first owner signs for it.
    'name', left(coalesce(nullif(btrim(st.name), ''),
                (select s.name from public.gym_staff s where s.gym_id = g and s.role = 'owner' and s.removed_at is null
                  order by s.created_at limit 1),
                'Your gym'), 80));
end $$;

-- May this viewer see this thread? The owner: all. Anyone else: questions; feedback only when not a trainer
-- (R-552); never complaints.
create or replace function public._talk_visible(v jsonb, t public.gym_talk_threads) returns boolean
  language sql stable set search_path = public as $$
  select coalesce(t.gym_id = (v->>'gym')::uuid and (
           coalesce((v->>'owner')::boolean, false)
           or t.kind = 'question'
           or (t.kind = 'feedback' and not coalesce((v->>'trainer')::boolean, false))), false)
$$;

create or replace function public.owner_talk_list(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb := public._talk_viewer(p_key); g uuid := (v->>'gym')::uuid; ids uuid[]; list jsonb; n int;
begin
  delete from public.gym_talk_threads where gym_id = g and last_at < now() - interval '180 days';
  select array_agg(q.thread_id) into ids from (
    select t.thread_id from public.gym_talk_threads t
      join public.gym_members m on m.member_id = t.member_id and m.left_at is null
     where t.gym_id = g and t.last_at > now() - interval '90 days' and public._talk_visible(v, t)
     order by t.last_at desc, t.thread_id limit 200) q;
  -- "Seen by your gym" on the member's side (a paused gym still reads; this is not a new line).
  update public.gym_talk_threads set gym_seen_at = now()
   where thread_id = any(coalesce(ids, '{}')) and last_from = 'member';
  select coalesce(jsonb_agg(public._talk_gym_row(t) order by t.last_at desc, t.thread_id), '[]'::jsonb) into list
    from public.gym_talk_threads t where t.thread_id = any(coalesce(ids, '{}'));
  select count(*) into n from public.gym_talk_threads t
   where t.thread_id = any(coalesce(ids, '{}')) and t.done_at is null and t.last_from = 'member';
  return jsonb_build_object('ok', true, 'role', case when (v->>'owner')::boolean then 'owner' else 'staff' end,
    -- R-552: does this person see feedback? (false: a trainer who is not the owner.)
    'feedback', (v->>'owner')::boolean or not coalesce((v->>'trainer')::boolean, false),
    'waiting', n, 'threads', list);
end $$;

-- May this viewer see this alert? R-552: feedback (a new one, or a member's reply in one) never reaches a trainer
-- who is not the owner.
create or replace function public._alert_visible(v jsonb, a public.gym_alerts) returns boolean
  language plpgsql stable security definer set search_path = public as $$
declare q public.trainer_questions;
begin
  if v is null or a.gym_id is distinct from (v->>'gym')::uuid then return false; end if;
  if a.kind = 'member_feedback' and not coalesce((v->>'owner')::boolean, false)
     and coalesce((v->>'trainer')::boolean, false) then
    return false;
  end if;
  if a.audience = 'all' then return true; end if;
  if a.audience = 'owner' then return coalesce((v->>'owner')::boolean, false); end if;
  if a.audience = 'question' then
    if not (coalesce((v->>'owner')::boolean, false) or coalesce((v->>'trainer')::boolean, false)) then return false; end if;
    select * into q from public.trainer_questions where question_id = a.ref_id::uuid;
    return q.question_id is not null and public._tq_visible(v, q);
  end if;
  return false;
exception when others then
  return false;
end $$;

-- ------------------------------------------------------------------ who may call (as 0069 and 0075 left it)
revoke all on function public._talk_viewer(text) from public, anon, authenticated;
revoke all on function public._talk_visible(jsonb, public.gym_talk_threads) from public, anon, authenticated;
revoke all on function public._alert_visible(jsonb, public.gym_alerts) from public, anon, authenticated;
revoke all on function public.owner_talk_list(text) from public;
grant execute on function public.owner_talk_list(text) to anon, authenticated;

notify pgrst, 'reload schema';
