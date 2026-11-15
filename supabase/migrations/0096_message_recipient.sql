-- NOT APPLIED. Needs the owner's yes.
-- (No live database change without his named yes. Apply in the SQL Editor only after CI is green.)
--
-- 0096: R-586 "Member picks who reads the message". Owner, 15 Nov 2026 (verbatim): "It should be GYM Onwer or the name
-- of the trainers added in Admin Panel..user can select any. For feedback / complaint, they can select GYM Owner or GYM
-- Admin (gym admin will send to both owner and staff, any type)". He said "yes messages" to build it.
--
-- WHAT CHANGES. "Message your gym" (0069) gets a recipient the member picks:
--   Question:  "Gym owner"  -> the owner only;
--              one trainer  -> that trainer (every person the owner ticked as "Trainer", 0050 gym_trainers, who is not
--                              the owner) and the owner. Only that trainer is alerted (bell, browser push); the owner
--                              can still read it and reply in Member messages, but gets no alert for it.
--   Feedback / Complaint:
--              "Gym owner"  -> the owner only;
--              "Gym admin"  -> the owner and the front desk. NEVER trainers (a complaint about a trainer must never
--                              reach that trainer): "the front desk" is everyone signed in at the gym who is NOT
--                              ticked as Trainer, exactly as 0087 says.
--   No recipient (every member app released before this change, member_talk_send): EXACTLY as today (0069 + 0087):
--   questions the owner, front desk and trainers; feedback the owner and front desk; complaints the owner only.
-- "The owner" stays what 0069 says: an owner key, or a person whose role is 'owner' (even if also ticked as Trainer).
-- A member sees the trainer's name as the owner typed it (gym_staff.name), nothing else (no phone).
--
-- Additive and re-runnable: three new columns on gym_talk_threads (null = no recipient = today's rule), two new
-- member-key functions (member_talk_choices, member_talk_send_to), and CREATE OR REPLACE of five functions with the
-- same names and arguments:
--   _talk_visible   the recipient rule above (no recipient: 0087's rule, word for word);
--   _talk_member_row, _talk_gym_row   also say who it went to: 'to' ('owner' | 'desk' | 'trainer' | null) and
--                   'toName' (the trainer's name); older apps ignore the new keys;
--   _alert_visible  an alert of a message with a recipient follows the same rule, except a question to a trainer
--                   alerts that trainer only; a complaint never reaches a trainer who is not the owner;
--   _alert_talk_line  the alert's audience from the recipient; a trainer's line says "sent you a question".
-- member_talk_send, member_talk_reply, owner_talk_list/count/reply/done are NOT changed (they ask _talk_visible).
-- Older admin panels keep working: they read the same keys and ignore 'to'.
-- Apply after 0069, 0075, 0087 and 0095. Test: supabase/tests/0096_message_recipient.sql (CI runs it after every
-- migration; pasted into the SQL Editor it always ends in an error and so changes nothing).
-- Undo: run 0087's _talk_visible and _alert_visible, 0069's _talk_member_row and _talk_gym_row, 0075's
-- _alert_talk_line again; drop member_talk_choices and member_talk_send_to; drop the three columns.
--
-- WHO MAY CALL (both check the member key first, like 0069's member_ calls):
--   member_talk_choices(key)    {ok, mine: staff id or null, trainers:[{id, name}]}  the member's own trainer first
--   member_talk_send_to(key, kind, anonymous, text, to, staff)
--                               {ok, thread}; INVALID (a bad kind, recipient or pair), NOT_TRAINER, ANON_FEEDBACK_ONLY,
--                               TOO_MANY, SUSPENDED, BAD_KEY

set lock_timeout = '3s';

-- ------------------------------------------------------------------ the recipient
alter table public.gym_talk_threads add column if not exists to_who text;
alter table public.gym_talk_threads add column if not exists to_staff uuid references public.gym_staff(staff_id) on delete set null;
-- The trainer's name when it was sent (what the member and the gym read on the message).
alter table public.gym_talk_threads add column if not exists to_name text;
alter table public.gym_talk_threads drop constraint if exists gym_talk_to_who;
alter table public.gym_talk_threads add constraint gym_talk_to_who
  check (to_who is null or to_who in ('owner', 'desk', 'trainer'));
-- A trainer gets questions only; "Gym admin" is for feedback and complaints only.
alter table public.gym_talk_threads drop constraint if exists gym_talk_to_kind;
alter table public.gym_talk_threads add constraint gym_talk_to_kind
  check ((to_who is distinct from 'trainer' or kind = 'question') and (to_who is distinct from 'desk' or kind <> 'question'));
alter table public.gym_talk_threads drop constraint if exists gym_talk_to_name;
alter table public.gym_talk_threads add constraint gym_talk_to_name
  check (to_name is null or length(to_name) <= 80);

-- ------------------------------------------------------------------ who sees a message
-- May this viewer (0087's _talk_viewer, or 0075's _alert_viewer: both carry gym, staff, owner, trainer) see this
-- thread? The owner: all. No recipient: 0087 exactly. 'owner': nobody else. 'desk': people who are not trainers.
-- 'trainer': that person only.
create or replace function public._talk_visible(v jsonb, t public.gym_talk_threads) returns boolean
  language sql stable set search_path = public as $$
  select coalesce(t.gym_id = (v->>'gym')::uuid and (
           coalesce((v->>'owner')::boolean, false)
           or case t.to_who
                when 'owner' then false
                when 'desk' then not coalesce((v->>'trainer')::boolean, false)
                when 'trainer' then t.to_staff is not null and t.to_staff = nullif(v->>'staff', '')::uuid
                else t.kind = 'question'
                     or (t.kind = 'feedback' and not coalesce((v->>'trainer')::boolean, false))
              end), false)
$$;

-- What the member sees of one thread (0069, plus who it went to).
create or replace function public._talk_member_row(t public.gym_talk_threads) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.thread_id,
    'kind', t.kind,
    'anonymous', t.anonymous,
    'createdAt', public._tq_ms(t.created_at),
    'lastAt', public._tq_ms(t.last_at),
    'done', t.done_at is not null,
    -- "Seen by your gym": someone at the gym opened the list after the member's newest line.
    'seenByGym', t.last_from = 'member' and t.gym_seen_at is not null and t.gym_seen_at >= t.last_at,
    'unread', public._talk_unread(t),
    'to', t.to_who,
    'toName', case when t.to_who = 'trainer' then t.to_name end,
    'messages', public._talk_lines(t.thread_id, false))
$$;

-- What the gym sees of one thread (0069, plus who it went to). Sent without the name: no name, phone, app id or list id.
create or replace function public._talk_gym_row(t public.gym_talk_threads) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.thread_id,
    'kind', t.kind,
    'anonymous', t.anonymous,
    'appId', case when t.anonymous then null else t.member_id end,
    'memberId', case when t.anonymous or r.id is null then null else t.roster_id end,
    'name', case when t.anonymous then null else coalesce(nullif(btrim(r.data->>'fullName'), ''), m.name, 'A member') end,
    'phone', case when t.anonymous or r.id is null then null else r.data->>'phone' end,
    'createdAt', public._tq_ms(t.created_at),
    'lastAt', public._tq_ms(t.last_at),
    'lastFrom', t.last_from,
    'waiting', t.done_at is null and t.last_from = 'member',
    'done', t.done_at is not null,
    'doneAt', public._tq_ms(t.done_at),
    'doneBy', t.done_by_name,
    -- The member opened the reply (their app read the list after the gym's newest line).
    'readByMember', t.last_from = 'gym' and t.member_seen_at is not null and t.member_seen_at >= t.last_at,
    'to', t.to_who,
    'toName', case when t.to_who = 'trainer' then t.to_name end,
    'toStaff', case when t.to_who = 'trainer' then t.to_staff end,
    'messages', public._talk_lines(t.thread_id, true))
  from public.gym_members m
  left join public.crm_records r on r.gym_id = t.gym_id and r.kind = 'member' and r.id = t.roster_id and not r.deleted
  where m.member_id = t.member_id
$$;

-- ------------------------------------------------------------------ the gym's alerts
-- May this viewer see this alert? A "Message your gym" alert whose message has a recipient: the thread's rule, but a
-- question to a trainer alerts that trainer only (the owner reads it in the list, with no alert). Feedback and
-- complaints never reach a trainer who is not the owner (0087; complaints were owner-only before). Everything else:
-- 0087 word for word.
create or replace function public._alert_visible(v jsonb, a public.gym_alerts) returns boolean
  language plpgsql stable security definer set search_path = public as $$
declare q public.trainer_questions; t public.gym_talk_threads;
begin
  if v is null or a.gym_id is distinct from (v->>'gym')::uuid then return false; end if;
  if a.kind in ('member_question', 'member_feedback', 'member_complaint') then
    if a.kind in ('member_feedback', 'member_complaint') and not coalesce((v->>'owner')::boolean, false)
       and coalesce((v->>'trainer')::boolean, false) then
      return false;
    end if;
    select * into t from public.gym_talk_threads where thread_id = a.ref_id::uuid;
    if t.thread_id is not null and t.to_who is not null then
      if t.to_who = 'trainer' then
        return t.to_staff is not null and t.to_staff = nullif(v->>'staff', '')::uuid;
      end if;
      return public._talk_visible(v, t);
    end if;
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

-- A member's line in "Message your gym" (0075, plus the recipient): a new message, or a reply in one.
-- The audience stays right even if the thread is gone later: 'owner' for anything sent to the owner or to a trainer
-- (the trainer's alert is decided from the thread while it exists), 'all' for "Gym admin" (trainers are kept out by
-- _alert_visible's feedback/complaint rule). No recipient: 0075 exactly.
create or replace function public._alert_talk_line() returns trigger
  language plpgsql security definer set search_path = public as $$
declare t public.gym_talk_threads; who text; first boolean; k text; aud text;
begin
  if new.from_gym then return new; end if;
  select * into t from public.gym_talk_threads where thread_id = new.thread_id;
  if t.thread_id is null then return new; end if;
  first := not exists (select 1 from public.gym_talk_messages x where x.thread_id = new.thread_id and x.msg_id <> new.msg_id);
  who := case when t.anonymous then null else public._alert_member_name(t.gym_id, t.roster_id, t.member_id) end;
  k := case t.kind when 'complaint' then 'member_complaint' when 'feedback' then 'member_feedback' else 'member_question' end;
  aud := case
           when t.to_who in ('owner', 'trainer') then 'owner'
           when t.to_who = 'desk' then 'all'
           when t.kind = 'complaint' then 'owner'
           else 'all'
         end;
  perform public._alert(t.gym_id, k, t.thread_id::text, 'talk:' || new.msg_id, aud,
    t.kind = 'complaint',
    case
      when not first then format('%s replied in Member messages. Open it to read the reply.', coalesce(who, 'A member'))
      when t.to_who = 'trainer' then format('%s sent you a question. Open Member messages to reply.', who)
      when t.kind = 'complaint' then format('%s sent your gym a complaint. Open Member messages to read it.', who)
      when t.kind = 'feedback' and t.anonymous then 'A member sent your gym feedback without their name. Open Member messages to read it.'
      when t.kind = 'feedback' then format('%s sent your gym feedback. Open Member messages to read it.', who)
      else format('%s sent your gym a question. Open Member messages to reply.', who)
    end,
    '/member-messages');
  return new;
exception when others then
  raise warning 'alert for member message % not made: %', new.msg_id, sqlerrm;
  return new;
end $$;

-- ------------------------------------------------------------------ the member's side
-- The trainers a member may write to: every live person ticked as Trainer at the member's gym who is not the owner
-- (the owner is "Gym owner"), with a name. The member's own trainer (0050 assignment) first, then by name.
-- The name is the one the owner typed; nothing else about the person.
create or replace function public.member_talk_choices(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); link jsonb; mine public.gym_staff;
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  link := public._member_roster_link(p_key);
  if link ? 'rosterId' then mine := public._trainer_of(m.gym_id, link->>'rosterId'); end if;
  return jsonb_build_object('ok', true,
    'mine', case when mine.role is distinct from 'owner' and nullif(btrim(coalesce(mine.name, '')), '') is not null
                 then mine.staff_id end,
    'trainers', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.staff_id, 'name', left(regexp_replace(btrim(s.name), '\s+', ' ', 'g'), 80))
                       order by coalesce(s.staff_id = mine.staff_id, false) desc, lower(btrim(s.name)), s.staff_id)
        from public.gym_staff s
        join public.gym_trainers x on x.staff_id = s.staff_id and x.gym_id = m.gym_id
       where s.gym_id = m.gym_id and s.removed_at is null and s.role <> 'owner'
         and nullif(btrim(coalesce(s.name, '')), '') is not null), '[]'::jsonb));
end $$;

-- Start a thread to a recipient: 'owner' (any kind), 'trainer' (a question; p_staff a trainer from
-- member_talk_choices), 'desk' ("Gym admin": feedback or a complaint). Otherwise as 0069's member_talk_send.
create or replace function public.member_talk_send_to(p_key text, p_kind text, p_anonymous boolean, p_text text,
                                                      p_to text, p_staff uuid default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  k text := lower(btrim(coalesce(p_kind, '')));
  dest text := lower(btrim(coalesce(p_to, '')));
  anon boolean := coalesce(p_anonymous, false);
  txt text;
  link jsonb;
  st public.gym_staff;
  t public.gym_talk_threads;
begin
  if m.left_at is not null then raise exception 'BAD_KEY'; end if;
  if k not in ('question', 'feedback', 'complaint') then raise exception 'INVALID'; end if;
  if dest not in ('owner', 'desk', 'trainer') then raise exception 'INVALID'; end if;
  -- A trainer gets questions only (a complaint about a trainer never reaches them); "Gym admin" is not for questions.
  if dest = 'trainer' and k <> 'question' then raise exception 'INVALID'; end if;
  if dest = 'desk' and k = 'question' then raise exception 'INVALID'; end if;
  if anon and k <> 'feedback' then raise exception 'ANON_FEEDBACK_ONLY'; end if;
  txt := public._tq_text(p_text, 1000);
  if dest = 'trainer' then
    select s.* into st from public.gym_staff s
      join public.gym_trainers x on x.staff_id = s.staff_id and x.gym_id = m.gym_id
     where s.staff_id = p_staff and s.gym_id = m.gym_id and s.removed_at is null and s.role <> 'owner';
    if st.staff_id is null then raise exception 'NOT_TRAINER'; end if;
  end if;
  if exists (select 1 from public.gyms where gym_id = m.gym_id and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  -- Two taps at once count as two, never past the limits.
  perform 1 from public.gym_members where member_id = m.member_id for update;
  perform public._talk_member_limits(m.member_id, true);
  if not anon then link := public._member_roster_link(p_key); end if;
  insert into public.gym_talk_threads(gym_id, member_id, roster_id, kind, anonymous, member_seen_at, to_who, to_staff, to_name)
    values (m.gym_id, m.member_id, case when anon then null else link->>'rosterId' end, k, anon, now(), dest,
            st.staff_id, case when dest = 'trainer' then left(regexp_replace(btrim(st.name), '\s+', ' ', 'g'), 80) end)
  returning * into t;
  insert into public.gym_talk_messages(thread_id, gym_id, from_gym, body) values (t.thread_id, m.gym_id, false, txt);
  return jsonb_build_object('ok', true, 'thread', public._talk_member_row(t));
end $$;

-- ------------------------------------------------------------------ who may call
revoke all on function public._talk_visible(jsonb, public.gym_talk_threads) from public, anon, authenticated;
revoke all on function public._talk_member_row(public.gym_talk_threads) from public, anon, authenticated;
revoke all on function public._talk_gym_row(public.gym_talk_threads) from public, anon, authenticated;
revoke all on function public._alert_visible(jsonb, public.gym_alerts) from public, anon, authenticated;
revoke all on function public._alert_talk_line() from public, anon, authenticated;
revoke all on function public.member_talk_choices(text) from public;
revoke all on function public.member_talk_send_to(text, text, boolean, text, text, uuid) from public;
grant execute on function public.member_talk_choices(text) to anon, authenticated;
grant execute on function public.member_talk_send_to(text, text, boolean, text, text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
