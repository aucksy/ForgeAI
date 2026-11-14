-- APPLIED LIVE 14 Nov 2026 (owner: "yes to Member questions database change"); tests 0086 PASS 7, 0075 PASS 28. Re-runnable. Apply after 0075 (gym
-- alerts). Changes words only: no table, no new function, nothing members or anon can call.
-- Test: supabase/tests/0086_member_questions_words.sql (CI runs it after every migration; pasted into the SQL Editor it
-- always ends in an error and so changes nothing). 0075's test was updated for the new line.
--
-- 0086: R-533 (owner, 14 Nov 2026): "ask a trainer may not be accurate because you do let the user ask the gym owner or
-- the trainer". The member app's row is now "Ask about your workout" and the admin app's page is "Member questions".
-- The gym's alert for a new question (0075, also the owner's and staff's phone alert through the HQ Worker) said
-- "Asha asked a trainer a question. Open Questions to reply." It now says
-- "Asha asked a workout question. Open Member questions to reply."
-- Also: a reply signed by the gym itself (an owner key with no owner on the staff list: owner_answer_question writes
-- "Your gym") reached the member as "Your replied" (the first word of the name). The member now reads "Your gym
-- replied"; the HQ Worker's pop-up says the same (deploy/hq/push.js).
-- Until this is applied nothing breaks: the admin app (gymAlerts.ts questionAlertWords) and the HQ Worker
-- (deploy/hq/panelPush.js) rewrite the old line to the new words, so old alerts read the same too.

create or replace function public._alert_trainer_question() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public._alert(new.gym_id, 'trainer_question', new.question_id::text, 'question:' || new.question_id, 'question', false,
    format('%s asked a workout question. Open Member questions to reply.', public._alert_member_name(new.gym_id, new.roster_id, new.member_id)),
    '/questions');
  return new;
exception when others then
  raise warning 'alert for question % not made: %', new.question_id, sqlerrm;
  return new;
end $$;
revoke all on function public._alert_trainer_question() from public, anon, authenticated;

-- What the member sees of one question (0053), with "Your gym" kept whole.
create or replace function public._tq_member_row(q public.trainer_questions) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.question_id,
    'question', q.question,
    'trainer', case when q.staff_id is null then null
                    else (select public._tq_short(s.name) from public.gym_staff s where s.staff_id = q.staff_id) end,
    'askedAt', public._tq_ms(q.asked_at),
    'answer', q.answer,
    'answeredBy', case when q.answer is null then null
                       when btrim(coalesce(q.answered_by_name, '')) = 'Your gym' then 'Your gym'
                       else split_part(btrim(coalesce(q.answered_by_name, '')), ' ', 1) end,
    'answeredAt', public._tq_ms(q.answered_at),
    'withdrawn', q.withdrawn_at is not null,
    'open', public._tq_open(q))
$$;
revoke all on function public._tq_member_row(public.trainer_questions) from public, anon, authenticated;
