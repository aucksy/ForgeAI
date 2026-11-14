-- APPLIED LIVE 14 Nov 2026 (R-536: owner said "Yes to both Ready-made plans and job title database change"; SQL
-- Editor from a5e365dd; live test 0079 PASS 20). Re-runnable.
--
-- 0079: a job name for a person on Settings -> Staff & sign-in (R-522). Owner, 14 Nov 2026: the add-person pop-up
-- "only has two options really the gym owner or the staff there is no option for trainer so please add that and
-- maybe also add an option ... other and they can just type it." The pop-up now offers Owner, Staff (front desk),
-- Trainer and Other (type the job). ACCESS STAYS TWO LEVELS (owner or staff): a typed job ("Manager", "Cleaner") is
-- only a name on the person's row and never changes what they can do. Trainer is 0050's Trainer tick (no change here).
--
-- ADDED:   gym_staff.job_title (null = none; 1-40 characters, spaces tidied)
--          owner_set_person_job(key, staff, job) owner only (0010 _people_admin: BAD_KEY / OWNER_ONLY); a person of
--          this gym only (GONE); front-desk people only, an owner row is always "Owner" (NOT_STAFF); empty = clear;
--          TOO_LONG over 40; INVALID with control characters; SUSPENDED for a paused gym (0031's staff trigger).
-- CHANGED: owner_people (0034) also answers 'job' (null when none). Nothing else in its answer changes.
-- Additive and re-runnable. Test: supabase/tests/0079_staff_job_title.sql (CI runs it after every migration; pasted
-- into the SQL Editor it always ends in an error and so changes nothing).
-- Undo: drop function owner_set_person_job(text, uuid, text); re-run 0034's owner_people; then
--       alter table public.gym_staff drop column job_title.
-- Until this is applied, the admin app keeps a typed job on that browser only, and sends it once this is live.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ the column
alter table public.gym_staff add column if not exists job_title text;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.gym_staff'::regclass and conname = 'gym_staff_job_title_ok') then
    alter table public.gym_staff add constraint gym_staff_job_title_ok
      check (job_title is null or (length(btrim(job_title)) between 1 and 40 and job_title !~ '[[:cntrl:]]'));
  end if;
end $$;

-- ------------------------------------------------------------------ set or clear a person's job name
create or replace function public.owner_set_person_job(p_key text, p_staff uuid, p_job text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key); st public.gym_staff;
  j text := nullif(regexp_replace(btrim(coalesce(p_job, '')), '\s+', ' ', 'g'), '');
begin
  if j is not null and j ~ '[[:cntrl:]]' then raise exception 'INVALID'; end if;
  if j is not null and length(j) > 40 then raise exception 'TOO_LONG'; end if;
  select * into st from public.gym_staff where staff_id = p_staff and gym_id = g and removed_at is null for update;
  if st.staff_id is null then raise exception 'GONE'; end if;
  if st.role <> 'staff' then raise exception 'NOT_STAFF'; end if;
  update public.gym_staff set job_title = j where staff_id = st.staff_id;
  return jsonb_build_object('staffId', st.staff_id, 'job', j);
end $$;

-- ------------------------------------------------------------------ people (0034, plus the job name)
create or replace function public.owner_people(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key); me uuid := (public._staff(p_key)).staff_id;
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'staffId', s.staff_id, 'name', s.name, 'phone', s.phone, 'role', s.role,
             'createdAt', s.created_at, 'me', s.staff_id = me,
             'devices', (select count(*) from public.gym_sessions x where x.staff_id = s.staff_id and x.ended_at is null),
             'lastSeenAt', (select max(x.last_seen_at) from public.gym_sessions x where x.staff_id = s.staff_id),
             'codeUntil', (select max(c.expires_at) from public.gym_signin_codes c
                            where c.staff_id = s.staff_id and c.used_at is null and c.expires_at > now()
                              and c.wrong_tries < 10),
             'hasPin', exists (select 1 from public.gym_staff_pins p where p.staff_id = s.staff_id),
             'pinLockedUntil', (select p.locked_until from public.gym_staff_pins p
                                 where p.staff_id = s.staff_id and p.locked_until > now()),
             'job', case when s.role = 'staff' then s.job_title end)
           order by (s.role = 'owner') desc, s.created_at)
      from public.gym_staff s where s.gym_id = g and s.removed_at is null), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public.owner_set_person_job(text, uuid, text) from public;
revoke all on function public.owner_people(text)                     from public;
grant execute on function public.owner_set_person_job(text, uuid, text) to anon, authenticated;
grant execute on function public.owner_people(text)                     to anon, authenticated;
