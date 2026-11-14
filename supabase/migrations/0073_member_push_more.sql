-- APPLIED LIVE 14 Nov 2026 (R-510: owner said "yes to A ... with the live database change"; SQL Editor, live test 0073 PASS 25). Also re-ran 0054 PASS 23, 0069 PASS 56.
--
-- 0073: the gym's news pops up on the member's phone (R-507, R-509 direction B). Owner, 14 Nov 2026: he sent a new
-- diet plan and a new workout plan from the admin app and the member got no notification. "If there's a
-- communication coming from the gym to the user, there has to be a notification around it."
-- New pop-ups, each for the member(s) it is about only:
--   - a new workout plan sent to them, or a change to the routines of one they already have (0024, crm_records
--     kind 'workout_plan'); tap opens the Workout tab;
--   - a new diet plan sent to them, or a change to one they already have (0035 gym_diet_plans); tap opens it;
--   - body measurements the gym saved for them (0035 gym_body_measurements); tap opens Measurements;
--   - a new challenge at their gym (0037 gym_challenges): every member with pop-ups on; tap opens the Gym tab;
--   - a fee the desk asked them to pay online (deploy/panel/pay.js keeps those requests in Cloudflare D1, not here:
--     the HQ Worker reads the new ones every minute and hands them to hq_fee_request_notes below).
--
-- Additive and re-runnable: five more allowed kinds on 0054's member_push_notes, two private helpers, four triggers
-- (they never stand in the way of the gym's own save: any failure inside is only a warning) and one HQ-key function.
-- The sender is unchanged: the HQ Worker's hq_push_direct_next (0054) sends every kind the same way
-- (deploy/hq/push.js fcmNoteMessage), and the member app opens the note's route on a tap (no app change).
-- Apply after 0054 (member_push_notes, _push_note, _note_day), 0069 ('gym_reply'), 0035, 0037, 0024.
-- Test: supabase/tests/0073_member_push_more.sql (CI runs it after every migration; pasted into the SQL Editor it
-- always ends in an error and so changes nothing).
-- Undo: drop the four triggers below and their functions, _roster_app_members, _assigned_rosters,
-- _push_note_rosters and hq_fee_request_notes; put the kind check back to 0069's list once no note of a new kind is left.
--
-- WHO GETS A NOTE. A plan names the gym's own list entries (memberIds) or membership plans (planIds: every member
-- whose membership of that plan covers today, India time, as member_gym_plans reads it). A list entry reaches the
-- app member(s) the app itself would link to it (0054's report-request rule): the same check-in number, the same
-- first name, and that number on only one entry of the gym's list. Only members who keep a push address (0038:
-- "Messages from my gym" on) get a row at all. At most 2000 members a plan, 3000 a challenge.
-- WHAT A NOTE SAYS. Never a money amount, a body number or anyone else's name: the plan's or challenge's own title,
-- a day, and where to tap.

set lock_timeout = '3s';

alter table public.member_push_notes drop constraint if exists member_push_notes_kind_check;
alter table public.member_push_notes add constraint member_push_notes_kind_check
  check (kind in ('plan_request', 'report_request', 'order', 'gym_reply',
                  'workout_plan', 'diet_plan', 'measurement', 'challenge', 'fee_request'));

-- ------------------------------------------------------------------ helpers (no grants)
-- The app members one list entry reaches, with a push address. 0054's report-request rule, as a set.
create or replace function public._roster_app_members(p_gym uuid, p_roster text) returns setof uuid
  language plpgsql stable security definer set search_path = public as $$
declare roster public.crm_records; ph text; sharing int;
begin
  if p_roster is null then return; end if;
  select * into roster from public.crm_records r
   where r.gym_id = p_gym and r.kind = 'member' and r.id = p_roster and not r.deleted;
  if roster.id is null then return; end if;
  ph := public._norm_phone(roster.data->>'phone');
  if ph is null or public._first_name_key(roster.data->>'fullName') is null then return; end if;
  select count(*) into sharing from public.crm_records r
   where r.gym_id = p_gym and r.kind = 'member' and not r.deleted
     and coalesce(r.data->>'archived', 'false') <> 'true'
     and public._norm_phone(r.data->>'phone') = ph;
  if sharing > 1 then return; end if;
  return query
    select gm.member_id from public.gym_members gm
     where gm.gym_id = p_gym and gm.left_at is null
       and public._norm_phone(gm.checkin_phone) = ph
       and public._first_name_key(gm.name) = public._first_name_key(roster.data->>'fullName')
       and exists (select 1 from public.member_push_tokens t where t.member_id = gm.member_id and t.gym_id = p_gym);
end $$;

-- The list entries an assignment {memberIds: [...], planIds: [...]} reaches today (India time). A part that is not
-- an array counts as empty.
create or replace function public._assigned_rosters(p_gym uuid, p_assign jsonb) returns setof text
  language sql stable security definer set search_path = public as $$
  with a as (
    select case when jsonb_typeof(p_assign->'memberIds') = 'array' then p_assign->'memberIds' else '[]'::jsonb end as mids,
           case when jsonb_typeof(p_assign->'planIds') = 'array' then p_assign->'planIds' else '[]'::jsonb end as pids,
           to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day
  )
  select e from a, jsonb_array_elements_text(a.mids) e where length(e) between 1 and 64
  union
  select r.data->>'memberId' from a, public.crm_records r
   where r.gym_id = p_gym and r.kind = 'membership' and not r.deleted
     and coalesce(r.data->>'cancelled', 'false') <> 'true'
     and r.data->>'planId' in (select jsonb_array_elements_text(a.pids))
     and r.data->>'startsOn' <= a.day and r.data->>'endsOn' >= a.day
     and r.data->>'memberId' is not null
$$;

-- One note per app member for an assignment. `p_before`: the list entries that already had it (they get
-- p_line_changed, and only when p_changed); everyone else gets p_line_new. Tags make each note once only:
-- '<kind>:<ref>:new:<member>' and '<kind>:<ref>:<p_version>:<member>'. -> notes written (or already there).
create or replace function public._push_note_rosters(p_gym uuid, p_assign jsonb, p_before text[], p_changed boolean,
                                                     p_kind text, p_ref uuid, p_version text,
                                                     p_line_new text, p_line_changed text, p_route text) returns int
  language plpgsql security definer set search_path = public as $$
declare r text; m uuid; n int := 0;
begin
  for r in select x from public._assigned_rosters(p_gym, p_assign) x limit 2000 loop
    if r = any(coalesce(p_before, '{}')) then
      if not p_changed then continue; end if;
      for m in select * from public._roster_app_members(p_gym, r) loop
        perform public._push_note(p_gym, m, p_kind, p_ref, format('%s:%s:%s:%s', p_kind, p_ref, p_version, m), p_line_changed, p_route);
        n := n + 1;
      end loop;
    else
      for m in select * from public._roster_app_members(p_gym, r) loop
        perform public._push_note(p_gym, m, p_kind, p_ref, format('%s:%s:new:%s', p_kind, p_ref, m), p_line_new, p_route);
        n := n + 1;
      end loop;
    end if;
  end loop;
  return n;
end $$;

-- ------------------------------------------------------------------ triggers
-- A workout plan (crm_records kind 'workout_plan'): new to a member, or its routines changed.
create or replace function public._push_note_workout_plan() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  live_before boolean;
  nm text;
  h text;
  before_set text[] := '{}';
begin
  begin
    if new.kind = 'workout_plan' and not new.deleted and coalesce(new.data->>'withdrawn', 'false') <> 'true' then
      live_before := tg_op = 'UPDATE' and not old.deleted and coalesce(old.data->>'withdrawn', 'false') <> 'true';
      nm := left(regexp_replace(btrim(coalesce(new.data->>'name', '')), '\s+', ' ', 'g'), 60);
      if nm = '' then nm := 'Workout plan'; end if;
      h := left(md5(coalesce(new.data->'routines', '[]'::jsonb)::text), 12);
      if live_before then
        before_set := array(select public._assigned_rosters(new.gym_id, old.data->'assign'));
      end if;
      perform public._push_note_rosters(new.gym_id, new.data->'assign', before_set,
        live_before and h <> left(md5(coalesce(old.data->'routines', '[]'::jsonb)::text), 12),
        'workout_plan', md5(new.gym_id::text || ':workout_plan:' || new.id)::uuid, h,
        format('New workout plan from your gym: %s. Tap to see it on the Workout tab.', nm),
        format('Your gym changed your workout plan: %s. Tap to see it on the Workout tab.', nm),
        '/workout');
    end if;
  exception when others then
    raise warning 'push notes for workout plan % not made: %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists crm_records_workout_plan_push_note on public.crm_records;
create trigger crm_records_workout_plan_push_note after insert or update on public.crm_records
  for each row when (new.kind = 'workout_plan')
  execute function public._push_note_workout_plan();

-- A diet plan: new to a member, or what it says changed.
create or replace function public._push_note_diet_plan() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  live_before boolean;
  nm text;
  h text;
  before_set text[] := '{}';
begin
  begin
    if not new.withdrawn then
      live_before := tg_op = 'UPDATE' and not old.withdrawn;
      nm := left(regexp_replace(btrim(coalesce(new.title, '')), '\s+', ' ', 'g'), 60);
      if nm = '' then nm := 'Diet plan'; end if;
      h := left(md5(concat_ws('|', new.title, new.goal, new.kcal, new.protein_g, new.meals::text, new.notes)), 12);
      if live_before then
        before_set := array(select public._assigned_rosters(new.gym_id, old.assign));
      end if;
      perform public._push_note_rosters(new.gym_id, new.assign, before_set,
        live_before and h <> left(md5(concat_ws('|', old.title, old.goal, old.kcal, old.protein_g, old.meals::text, old.notes)), 12),
        'diet_plan', new.plan_id, h,
        format('New diet plan from your gym: %s. Tap to see your meals.', nm),
        format('Your gym changed your diet plan: %s. Tap to see your meals.', nm),
        '/shop/diet');
    end if;
  exception when others then
    raise warning 'push notes for diet plan % not made: %', new.plan_id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists gym_diet_plans_push_note on public.gym_diet_plans;
create trigger gym_diet_plans_push_note after insert or update on public.gym_diet_plans
  for each row execute function public._push_note_diet_plan();

-- Body measurements the gym saved for a member (a new day's entry). Never the numbers themselves.
create or replace function public._push_note_measurement() returns trigger
  language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  begin
    for m in select * from public._roster_app_members(new.gym_id, new.member_id) loop
      perform public._push_note(new.gym_id, m, 'measurement', new.measure_id,
        format('measurement:%s:%s', new.measure_id, m),
        format('Your gym saved your body measurements from %s. Tap to see them.', public._note_day(new.measured_on)),
        '/measures');
    end loop;
  exception when others then
    raise warning 'push note for measurement % not made: %', new.measure_id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists gym_body_measurements_push_note on public.gym_body_measurements;
create trigger gym_body_measurements_push_note after insert on public.gym_body_measurements
  for each row execute function public._push_note_measurement();

-- A new challenge: every live member of the gym who keeps a push address.
create or replace function public._push_note_challenge() returns trigger
  language plpgsql security definer set search_path = public as $$
declare m uuid; nm text;
begin
  begin
    if new.cancelled_at is null and new.ends_on >= (now() at time zone 'Asia/Kolkata')::date then
      nm := left(regexp_replace(btrim(coalesce(new.title, '')), '\s+', ' ', 'g'), 60);
      for m in select gm.member_id from public.gym_members gm
                where gm.gym_id = new.gym_id and gm.left_at is null
                  and exists (select 1 from public.member_push_tokens t where t.member_id = gm.member_id and t.gym_id = new.gym_id)
                limit 3000 loop
        perform public._push_note(new.gym_id, m, 'challenge', new.id, format('challenge:%s:%s', new.id, m),
          format('New challenge at your gym: %s, %s to %s. Tap to see it on the leaderboard.',
                 nm, public._note_day(new.starts_on), public._note_day(new.ends_on)),
          '/shop');
      end loop;
    end if;
  exception when others then
    raise warning 'push notes for challenge % not made: %', new.id, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists gym_challenges_push_note on public.gym_challenges;
create trigger gym_challenges_push_note after insert on public.gym_challenges
  for each row execute function public._push_note_challenge();

-- ------------------------------------------------------------------ fee requests (HQ key only)
-- The HQ Worker hands the fee requests the desk made in the last few minutes (Cloudflare D1 pay_requests, kind
-- 'fee', still open): [{id, gymId, rosterId, label}], at most 100. Each reaches that list entry's app member(s)
-- once (the tag), so handing the same request again changes nothing. -> {ok, notes} (notes written or already there).
create or replace function public.hq_fee_request_notes(p_items jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  g uuid;
  rid text;
  lbl text;
  m uuid;
  n int := 0;
begin
  perform public._hq_guard();
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'INVALID'; end if;
  for it in select value from jsonb_array_elements(p_items) limit 100 loop
    begin
      if jsonb_typeof(it) is distinct from 'object' or coalesce(it->>'id', '') !~ '^pr_[A-Za-z0-9_-]{4,60}$' then continue; end if;
      g := (it->>'gymId')::uuid;
      rid := it->>'rosterId';
      if rid is null or length(rid) not between 1 and 64 then continue; end if;
      lbl := left(regexp_replace(btrim(coalesce(it->>'label', '')), '\s+', ' ', 'g'), 60);
      for m in select * from public._roster_app_members(g, rid) loop
        perform public._push_note(g, m, 'fee_request', md5(it->>'id')::uuid, format('fee_request:%s:%s', it->>'id', m),
          case when lbl = '' then 'Your gym asked you to pay your fee. Tap to pay in the app.'
               else format('Your gym asked you to pay for %s. Tap to pay in the app.', lbl) end,
          '/shop');
        n := n + 1;
      end loop;
    exception when others then
      raise warning 'fee request note % not made: %', it->>'id', sqlerrm;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'notes', n);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._roster_app_members(uuid, text) from public, anon, authenticated;
revoke all on function public._assigned_rosters(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._push_note_rosters(uuid, jsonb, text[], boolean, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public._push_note_workout_plan() from public, anon, authenticated;
revoke all on function public._push_note_diet_plan() from public, anon, authenticated;
revoke all on function public._push_note_measurement() from public, anon, authenticated;
revoke all on function public._push_note_challenge() from public, anon, authenticated;
revoke all on function public.hq_fee_request_notes(jsonb) from public, anon, authenticated;
grant execute on function public.hq_fee_request_notes(jsonb) to service_role;

notify pgrst, 'reload schema';
