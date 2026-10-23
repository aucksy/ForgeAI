-- APPLIED LIVE 23 Oct 2026 (owner said yes, #49; live test PASS 71).
--
-- 0025: the workout offer, in-app messages to a group, and messages at a chosen time
-- (OWNER-INBOX #49 step 2, option A, 23 Oct 2026; R-82: the owner picks per offer whether the days
-- are given by themselves or by the desk). Design: docs/overhaul/research/R-offers-notices.md §4, §9.
-- Re-runnable (if not exists / create or replace / drop ... if exists). Apply after 0024.
-- Test: supabase/tests/0025_workout_offer.sql (CI runs it after every migration, on a throw-away
-- local database; it can also be pasted into the SQL Editor, where it always ends in an error and so
-- changes nothing).
--
-- THE OFFER. The owner starts "Log 10 workouts within 30 days, get 3 extra days" in the admin app
-- (Messages & offers -> Offers). Numbers: workouts 4-30 (10), window 7-60 days (30), reward 1-7 days
-- (3). A workout counts only on a day the gym's own register shows a check-in for the member (desk,
-- QR poster or import; QR only when the offer counts app check-ins, the default), and the phone
-- only offers days on which the member logged a live workout of 20+ minutes with 6+ working sets
-- (min_minutes / min_sets are told to the phone). Once per member per offer. One running workout
-- offer per gym. Any member with a gym plan covering today may join.
--
-- WHAT LEAVES THE PHONE. Only after "Join the offer" (consent, logged with the words' version), and
-- only the DATES the phone counted. The server keeps a date only when the register shows a check-in
-- that day for that member, inside the member's window, and not in the future; it drops the rest.
-- The count is the server's own (rows in offer_days); a count sent by the phone is never read.
-- "Leave the offer" (or leaving the gym) deletes the member's dates and stops the count.
--
-- GIVING THE DAYS. Per offer, auto_give:
--   false ("I give them"): the admin app lists the member as "Ready for reward"; the owner or the
--     front desk taps Give (staff_give_reward). This is the ONLY way the front desk can move a plan's
--     last day, and only by exactly the offer's days, once.
--   true ("Give the days by themselves"): member_offer_days gives them in the same transaction that
--     counted the 10th matched date.
-- Either way _offer_give runs under the gym's row lock (the lock crm_push and check-in take) and
-- the member's offer row lock: it adds reward_days to the gym plan that ends last (not a PT pack,
-- not cancelled, ending today or later), appends "+3 days (Reward - Workout offer): old -> new" to
-- the plan's notes (the admin app shows it as "Extended free by 3 days (reward)"; no receipt, no
-- GST, it is not a sale), moves the records version on by one, and stamps who gave it (or
-- "Automatic"). Given once: a second call finds given_at set and changes nothing. The owner can take
-- a reward back (owner_undo_reward) while the plan's last day is still the one the reward set; only
-- the owner can give a taken-back reward again (the desk and the automatic rule get TAKEN_BACK).
-- An automatic give that found no running plan is tried again when the member next opens the card
-- (member_offers), so a renewal later still gets the days. A date already counted stays counted if
-- the desk later takes that check-in back (accepted; see supabase/README.md).
--
-- MESSAGES. owner_send_message gains p_to (app member ids: a group the admin app worked out from its
-- own records; null = everyone) and p_send_at (null = now; up to 30 days ahead). Who it went to is
-- kept in gym_message_to so "Seen by x of y" stays right. member_messages shows a message only once
-- its time has come and only to its group. No scheduler is needed: the inbox read filters by time.
--
-- WHO CAN READ WHAT. Every table has row security on and no grants: everything goes through the
-- functions below (SECURITY DEFINER, fixed search_path). A member sees only their own offer row; the
-- owner and the desk see their own gym's offer rows; nobody sees another gym's. No exercise, weight,
-- set, workout length or body weight is ever sent or stored.
--
-- KEPT FOR: offer_days until the member leaves the offer or the gym, or 90 days after the offer
-- ended (cleared by _offer_tidy whenever the panel reads offers); offer_members and offer_log 1 year
-- after the offer ended (proof of consent and of the reward); gym_offers while the gym uses ForgeAI.

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_offers (
  offer_id           uuid primary key default gen_random_uuid(),
  gym_id             uuid not null references public.gyms(gym_id) on delete cascade,
  kind               text not null default 'workout' check (kind = 'workout'),
  title              text not null check (length(btrim(title)) between 1 and 60),
  workouts           int  not null default 10 check (workouts between 4 and 30),
  window_days        int  not null default 30 check (window_days between 7 and 60),
  reward_days        int  not null default 3  check (reward_days between 1 and 7),
  min_minutes        int  not null default 20 check (min_minutes between 10 and 120),
  min_sets           int  not null default 6  check (min_sets between 1 and 30),
  starts_on          date not null,
  join_until         date not null,
  count_app_checkins boolean not null default true,
  auto_give          boolean not null default false,
  created_at         timestamptz not null default now(),
  created_by         uuid,
  created_by_name    text,
  stopped_at         timestamptz,
  check (join_until >= starts_on)
);
create index if not exists gym_offers_gym on public.gym_offers(gym_id, created_at desc);
-- One running workout offer per gym (an ended one is stopped by _offer_tidy before a new one starts).
create unique index if not exists gym_offers_one_running on public.gym_offers(gym_id) where stopped_at is null;

create table if not exists public.offer_members (
  offer_id            uuid not null references public.gym_offers(offer_id) on delete cascade,
  roster_id           text not null,
  gym_id              uuid not null references public.gyms(gym_id) on delete cascade,
  member_id           uuid references public.gym_members(member_id) on delete set null,
  joined_at           timestamptz not null default now(),
  joined_on           date not null,
  window_ends_on      date not null,
  notice_version      text not null,
  left_at             timestamptz,
  sends_on            date,
  sends               int not null default 0,
  earned_at           timestamptz,
  given_at            timestamptz,
  given_by            uuid,
  given_by_name       text,
  given_auto          boolean,
  given_membership_id text,
  given_days          int,
  old_end             date,
  new_end             date,
  undone_at           timestamptz,
  undone_by_name      text,
  primary key (offer_id, roster_id)
);
create index if not exists offer_members_member on public.offer_members(member_id);
create index if not exists offer_members_gym on public.offer_members(gym_id);

create table if not exists public.offer_days (
  offer_id  uuid not null,
  roster_id text not null,
  day       date not null,
  source    text not null check (source in ('desk','app','import')),
  primary key (offer_id, roster_id, day),
  foreign key (offer_id, roster_id) references public.offer_members(offer_id, roster_id) on delete cascade
);

create table if not exists public.offer_log (
  log_id         bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  gym_id         uuid not null references public.gyms(gym_id) on delete cascade,
  offer_id       uuid not null references public.gym_offers(offer_id) on delete cascade,
  roster_id      text,
  event          text not null check (event in ('started','stopped','changed','joined','joined again','left','earned','given','taken back')),
  by_staff       uuid,
  by_name        text,
  notice_version text,
  detail         jsonb
);
create index if not exists offer_log_offer on public.offer_log(offer_id, at);

alter table public.gym_messages add column if not exists send_at timestamptz;
alter table public.gym_messages add column if not exists to_group boolean not null default false;

create table if not exists public.gym_message_to (
  message_id uuid not null references public.gym_messages(message_id) on delete cascade,
  member_id  uuid not null references public.gym_members(member_id) on delete cascade,
  primary key (message_id, member_id)
);
create index if not exists gym_message_to_member on public.gym_message_to(member_id);

alter table public.gym_offers     enable row level security;
alter table public.offer_members  enable row level security;
alter table public.offer_days     enable row level security;
alter table public.offer_log      enable row level security;
alter table public.gym_message_to enable row level security;
revoke all on public.gym_offers, public.offer_members, public.offer_days, public.offer_log, public.gym_message_to
  from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
create or replace function public._ist_today() returns date
  language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- An offer as the admin app reads it.
create or replace function public._offer_json(o public.gym_offers) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', o.offer_id, 'kind', o.kind, 'title', o.title, 'workouts', o.workouts, 'windowDays', o.window_days,
    'rewardDays', o.reward_days, 'minMinutes', o.min_minutes, 'minSets', o.min_sets,
    'startsOn', to_char(o.starts_on, 'YYYY-MM-DD'), 'joinUntil', to_char(o.join_until, 'YYYY-MM-DD'),
    'countAppCheckins', o.count_app_checkins, 'autoGive', o.auto_give,
    'createdAt', o.created_at, 'createdByName', o.created_by_name, 'stoppedAt', o.stopped_at,
    'open', o.stopped_at is null and o.starts_on <= public._ist_today() and o.join_until >= public._ist_today())
$$;

-- The member's gym plan for the reward: not a PT pack, not cancelled, not deleted, ending on p_day
-- or later, the one that ends last. With p_covering, it must also have started by p_day (joining
-- needs a plan running today). Null when there is none.
create or replace function public._offer_plan(p_gym uuid, p_roster text, p_day date, p_covering boolean)
  returns public.crm_records language sql stable security definer set search_path = public as $$
  select r.* from public.crm_records r
   where r.gym_id = p_gym and r.kind = 'membership' and not r.deleted
     and r.data->>'memberId' = p_roster
     and coalesce(r.data->>'cancelled', 'false') <> 'true'
     and coalesce(case when r.data->>'ptSessions' ~ '^[0-9]{1,4}$' then (r.data->>'ptSessions')::int end, 0) = 0
     and public._iso_day(r.data->>'endsOn') >= p_day
     and (not p_covering or public._iso_day(r.data->>'startsOn') <= p_day)
   order by r.data->>'endsOn' desc, r.id
   limit 1
$$;

-- Who an app member is on the gym's list, with exactly 0023's checks (the number matched at a
-- check-in, nothing typed; the first name must match; never a number two members share).
-- err: NO_PHONE | GYM_NOT_ONLINE | NOT_ON_ROSTER | SHARED_NUMBER | NAME_MISMATCH, or null.
create or replace function public._offer_identity(p_m public.gym_members, out roster_id text, out err text)
  language plpgsql stable security definer set search_path = public as $$
declare g public.gyms; ph text; roster public.crm_records; sharing int;
begin
  select * into g from public.gyms where gym_id = p_m.gym_id;
  ph := public._norm_phone(p_m.checkin_phone);
  if ph is null then err := 'NO_PHONE'; return; end if;
  if coalesce(g.crm_version, 0) = 0
     and not exists (select 1 from public.crm_records where gym_id = g.gym_id and kind = 'member') then
    err := 'GYM_NOT_ONLINE'; return;
  end if;
  roster := public._checkin_roster_member(g.gym_id, ph);
  if roster.id is null then err := 'NOT_ON_ROSTER'; return; end if;
  select count(*) into sharing from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'member' and not r.deleted
     and coalesce(r.data->>'archived', 'false') <> 'true'
     and public._norm_phone(r.data->>'phone') = ph;
  if sharing > 1 then err := 'SHARED_NUMBER'; return; end if;
  if public._first_name_key(roster.data->>'fullName') is null
     or public._first_name_key(roster.data->>'fullName') is distinct from public._first_name_key(p_m.name) then
    err := 'NAME_MISMATCH'; return;
  end if;
  roster_id := roster.id;
end $$;

-- A member's own row as the member app reads it (never anyone else's).
create or replace function public._offer_me_json(om public.offer_members) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'joinedOn', to_char(om.joined_on, 'YYYY-MM-DD'), 'windowEndsOn', to_char(om.window_ends_on, 'YYYY-MM-DD'),
    'counted', (select count(*) from public.offer_days d where d.offer_id = om.offer_id and d.roster_id = om.roster_id),
    'days', coalesce((select jsonb_agg(to_char(d.day, 'YYYY-MM-DD') order by d.day)
                        from public.offer_days d where d.offer_id = om.offer_id and d.roster_id = om.roster_id), '[]'::jsonb),
    'left', om.left_at is not null, 'earned', om.earned_at is not null,
    'given', om.given_at is not null, 'givenDays', om.given_days, 'givenAuto', om.given_auto,
    'newEnd', to_char(om.new_end, 'YYYY-MM-DD'), 'undone', om.undone_at is not null)
$$;

-- The offer as the member app reads it.
create or replace function public._offer_member_offer_json(o public.gym_offers) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', o.offer_id, 'title', o.title, 'workouts', o.workouts, 'windowDays', o.window_days,
    'rewardDays', o.reward_days, 'minMinutes', o.min_minutes, 'minSets', o.min_sets,
    'joinUntil', to_char(o.join_until, 'YYYY-MM-DD'), 'countAppCheckins', o.count_app_checkins,
    'open', o.stopped_at is null and o.starts_on <= public._ist_today() and o.join_until >= public._ist_today())
$$;

-- Offers that ended long ago: stop the running one whose last window is over; delete dates 90 days
-- after an offer ended; delete members and the log 1 year after.
create or replace function public._offer_tidy(p_gym uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare today date := public._ist_today();
begin
  update public.gym_offers set stopped_at = now()
   where gym_id = p_gym and stopped_at is null and join_until + window_days < today;
  -- An offer has ended when the last window that could have started is over.
  delete from public.offer_days d using public.gym_offers o
   where o.offer_id = d.offer_id and o.gym_id = p_gym and o.stopped_at is not null
     and least((o.stopped_at at time zone 'Asia/Kolkata')::date, o.join_until) + o.window_days < today - 90;
  delete from public.offer_members m using public.gym_offers o
   where o.offer_id = m.offer_id and o.gym_id = p_gym and o.stopped_at is not null
     and least((o.stopped_at at time zone 'Asia/Kolkata')::date, o.join_until) + o.window_days < today - 365;
  delete from public.offer_log l using public.gym_offers o
   where o.offer_id = l.offer_id and o.gym_id = p_gym and o.stopped_at is not null
     and least((o.stopped_at at time zone 'Asia/Kolkata')::date, o.join_until) + o.window_days < today - 365;
end $$;

-- Give the reward (see the top). The caller has already decided the member earned it. Takes the
-- gym's row lock, then the member's offer row lock, so two taps, the desk and the automatic rule
-- can never give it twice. Raises NOT_EARNED, NO_PLAN; a reward already given is returned as it is
-- (alreadyGiven true) and nothing changes. A reward the owner took back is given again only when
-- p_owner is true (the owner's own tap); the front desk and the automatic rule get TAKEN_BACK.
create or replace function public._offer_give(p_offer uuid, p_roster text, p_by uuid, p_by_name text, p_auto boolean,
                                              p_owner boolean)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.gym_offers; om public.offer_members; g public.gyms; ms public.crm_records;
  today date := public._ist_today(); v_old date; v_new date; v bigint; line text;
begin
  select * into o from public.gym_offers where offer_id = p_offer;
  if o.offer_id is null then raise exception 'GONE'; end if;
  select * into g from public.gyms where gym_id = o.gym_id for update;
  select * into om from public.offer_members where offer_id = p_offer and roster_id = p_roster for update;
  if om.offer_id is null then raise exception 'GONE'; end if;
  if om.given_at is not null then
    return jsonb_build_object('ok', true, 'alreadyGiven', true, 'days', om.given_days,
      'oldEnd', to_char(om.old_end, 'YYYY-MM-DD'), 'newEnd', to_char(om.new_end, 'YYYY-MM-DD'),
      'membershipId', om.given_membership_id, 'version', g.crm_version);
  end if;
  if om.earned_at is null then raise exception 'NOT_EARNED'; end if;
  if om.undone_at is not null and not coalesce(p_owner, false) then raise exception 'TAKEN_BACK'; end if;
  ms := public._offer_plan(o.gym_id, p_roster, today, false);
  if ms.id is null then raise exception 'NO_PLAN'; end if;
  v_old := public._iso_day(ms.data->>'endsOn');
  v_new := v_old + o.reward_days;
  line := '+' || o.reward_days || ' days (Reward - Workout offer): ' || to_char(v_old, 'YYYY-MM-DD') || ' -> ' || to_char(v_new, 'YYYY-MM-DD');
  v := coalesce(g.crm_version, 0) + 1;
  update public.crm_records
     set data = data || jsonb_build_object(
                  'endsOn', to_char(v_new, 'YYYY-MM-DD'),
                  'notes', case when coalesce(btrim(data->>'notes'), '') = '' then line else (data->>'notes') || E'\n' || line end,
                  'updatedAt', floor(extract(epoch from now()) * 1000)::bigint),
         version = v, updated_at = now()
   where gym_id = o.gym_id and kind = 'membership' and id = ms.id;
  update public.gyms set crm_version = v where gym_id = o.gym_id;
  update public.offer_members
     set given_at = now(), given_by = p_by, given_by_name = p_by_name, given_auto = p_auto,
         given_membership_id = ms.id, given_days = o.reward_days, old_end = v_old, new_end = v_new,
         undone_at = null, undone_by_name = null
   where offer_id = p_offer and roster_id = p_roster;
  insert into public.offer_log(gym_id, offer_id, roster_id, event, by_staff, by_name, detail)
    values (o.gym_id, p_offer, p_roster, 'given', p_by, p_by_name,
            jsonb_build_object('days', o.reward_days, 'membershipId', ms.id, 'oldEnd', v_old, 'newEnd', v_new, 'auto', p_auto));
  return jsonb_build_object('ok', true, 'alreadyGiven', false, 'days', o.reward_days,
    'oldEnd', to_char(v_old, 'YYYY-MM-DD'), 'newEnd', to_char(v_new, 'YYYY-MM-DD'),
    'membershipId', ms.id, 'version', v);
end $$;

-- ------------------------------------------------------------------ owner and front desk (admin app)
-- Start a workout offer (no p_offer.id), or change a running one's giving mode and last day to join
-- (with p_offer.id; the numbers members joined on never change). The gym's owner only.
-- p_offer: {id?, title, workouts, windowDays, rewardDays, joinUntil 'YYYY-MM-DD', countAppCheckins,
--           autoGive}. Raises OWNER_ONLY, BAD_KEY, INVALID, ONE_RUNNING, GONE.
create or replace function public.owner_save_offer(p_key text, p_offer jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  by_name text := coalesce(st.name, 'Owner (old owner key)');
  today date := public._ist_today();
  o public.gym_offers;
  t text; w int; wd int; rd int; ju date; app_ok boolean; auto boolean;
begin
  if jsonb_typeof(p_offer) is distinct from 'object' then raise exception 'INVALID'; end if;
  if p_offer ? 'autoGive' and jsonb_typeof(p_offer->'autoGive') not in ('boolean', 'null') then raise exception 'INVALID'; end if;
  if p_offer ? 'id' and jsonb_typeof(p_offer->'id') not in ('string', 'null') then raise exception 'INVALID'; end if;
  perform 1 from public.gyms where gym_id = g for update;
  perform public._offer_tidy(g);
  auto := (p_offer->>'autoGive')::boolean;
  ju := public._iso_day(p_offer->>'joinUntil');

  if jsonb_typeof(p_offer->'id') = 'string' then
    select * into o from public.gym_offers
     where offer_id::text = p_offer->>'id' and gym_id = g for update;
    if o.offer_id is null or o.stopped_at is not null then raise exception 'GONE'; end if;
    -- Only how the days are given, and the last day to join (never earlier than today).
    auto := coalesce(auto, o.auto_give);
    if p_offer->>'joinUntil' is null then ju := o.join_until;
    elsif ju is null or ju < greatest(o.starts_on, today) or ju > o.starts_on + 90 then raise exception 'INVALID'; end if;
    update public.gym_offers set auto_give = auto, join_until = ju where offer_id = o.offer_id returning * into o;
    insert into public.offer_log(gym_id, offer_id, event, by_staff, by_name, detail)
      values (g, o.offer_id, 'changed', st.staff_id, by_name, jsonb_build_object('autoGive', auto, 'joinUntil', ju));
    return public._offer_json(o);
  end if;

  t := btrim(coalesce(p_offer->>'title', ''));
  if length(t) not between 1 and 60 then raise exception 'INVALID'; end if;
  if coalesce(p_offer->>'workouts', '') !~ '^[0-9]{1,3}$' or coalesce(p_offer->>'windowDays', '') !~ '^[0-9]{1,3}$'
     or coalesce(p_offer->>'rewardDays', '') !~ '^[0-9]{1,3}$' then raise exception 'INVALID'; end if;
  w := (p_offer->>'workouts')::int; wd := (p_offer->>'windowDays')::int; rd := (p_offer->>'rewardDays')::int;
  if w not between 4 and 30 or wd not between 7 and 60 or rd not between 1 and 7 or w > wd then raise exception 'INVALID'; end if;
  if ju is null or ju < today or ju > today + 90 then raise exception 'INVALID'; end if;
  if jsonb_typeof(p_offer->'countAppCheckins') = 'boolean' then app_ok := (p_offer->>'countAppCheckins')::boolean;
  elsif p_offer ? 'countAppCheckins' and jsonb_typeof(p_offer->'countAppCheckins') <> 'null' then raise exception 'INVALID';
  else app_ok := true; end if;
  if exists (select 1 from public.gym_offers where gym_id = g and stopped_at is null) then raise exception 'ONE_RUNNING'; end if;
  insert into public.gym_offers(gym_id, title, workouts, window_days, reward_days, starts_on, join_until,
                                count_app_checkins, auto_give, created_by, created_by_name)
    values (g, t, w, wd, rd, today, ju, app_ok, coalesce(auto, false), st.staff_id, by_name)
    returning * into o;
  insert into public.offer_log(gym_id, offer_id, event, by_staff, by_name, detail)
    values (g, o.offer_id, 'started', st.staff_id, by_name, public._offer_json(o));
  return public._offer_json(o);
end $$;

-- Stop an offer: nobody new can join. Members already in keep their window and their reward.
create or replace function public.owner_stop_offer(p_key text, p_offer uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_only_gym(p_key); st public.gym_staff := public._staff(p_key); o public.gym_offers;
begin
  update public.gym_offers set stopped_at = coalesce(stopped_at, now())
   where offer_id = p_offer and gym_id = g returning * into o;
  if o.offer_id is null then raise exception 'GONE'; end if;
  insert into public.offer_log(gym_id, offer_id, event, by_staff, by_name)
    values (g, o.offer_id, 'stopped', st.staff_id, coalesce(st.name, 'Owner (old owner key)'));
  return public._offer_json(o);
end $$;

-- The gym's offers (newest first, at most 10) with their counts, and every member row of them:
-- the server's own count of matched dates, desk and app check-ins side by side, and the reward.
-- Owner and front desk (any live key of the gym). No phone number, no workout detail.
create or replace function public.owner_offers(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); today date := public._ist_today(); offers jsonb; members jsonb;
begin
  perform public._offer_tidy(g);
  select coalesce(jsonb_agg(public._offer_json(o) || jsonb_build_object(
           'joined', (select count(*) from public.offer_members m where m.offer_id = o.offer_id),
           'inNow', (select count(*) from public.offer_members m where m.offer_id = o.offer_id and m.left_at is null
                       and m.earned_at is null and m.window_ends_on >= today),
           'ready', (select count(*) from public.offer_members m where m.offer_id = o.offer_id and m.earned_at is not null
                       and m.given_at is null and m.undone_at is null),
           'given', (select count(*) from public.offer_members m where m.offer_id = o.offer_id and m.given_at is not null))
           order by o.created_at desc), '[]'::jsonb)
    into offers
    from public.gym_offers o
   where o.offer_id in (select x.offer_id from public.gym_offers x where x.gym_id = g order by x.created_at desc limit 10);

  select coalesce(jsonb_agg(jsonb_build_object(
           'offerId', m.offer_id, 'rosterId', m.roster_id,
           'joinedOn', to_char(m.joined_on, 'YYYY-MM-DD'), 'windowEndsOn', to_char(m.window_ends_on, 'YYYY-MM-DD'),
           'counted', (select count(*) from public.offer_days d where d.offer_id = m.offer_id and d.roster_id = m.roster_id),
           'deskDays', (select count(*) from public.offer_days d where d.offer_id = m.offer_id and d.roster_id = m.roster_id and d.source <> 'app'),
           'appDays', (select count(*) from public.offer_days d where d.offer_id = m.offer_id and d.roster_id = m.roster_id and d.source = 'app'),
           'left', m.left_at is not null, 'earnedAt', m.earned_at,
           'givenAt', m.given_at, 'givenAuto', m.given_auto, 'givenByName', m.given_by_name, 'givenDays', m.given_days,
           'oldEnd', to_char(m.old_end, 'YYYY-MM-DD'), 'newEnd', to_char(m.new_end, 'YYYY-MM-DD'),
           'undoneAt', m.undone_at, 'undoneByName', m.undone_by_name)
           order by m.offer_id, m.joined_at), '[]'::jsonb)
    into members
    from public.offer_members m
   where m.gym_id = g
     and m.offer_id in (select offer_id from public.gym_offers where gym_id = g order by created_at desc limit 10);

  return jsonb_build_object('offers', offers, 'members', members, 'today', to_char(today, 'YYYY-MM-DD'));
end $$;

-- The desk's one tap (and the owner's): give an earned reward. Any live key of the gym; the front
-- desk can move a plan's last day this way only, by exactly the offer's days, once.
-- Raises BAD_KEY, GONE, NOT_EARNED, NO_PLAN, TAKEN_BACK (a reward the owner took back: only the
-- owner gives it again). Already given: returns it (alreadyGiven true).
create or replace function public.staff_give_reward(p_key text, p_offer uuid, p_roster text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key);
  -- An old owner key (no person) or an owner's session.
  is_owner boolean := st.staff_id is null or st.role = 'owner';
begin
  if not exists (select 1 from public.gym_offers where offer_id = p_offer and gym_id = g) then raise exception 'GONE'; end if;
  return public._offer_give(p_offer, p_roster, st.staff_id, coalesce(st.name, 'Owner (old owner key)'), false, is_owner);
end $$;

-- The owner takes a reward back (an automatic one given by mistake, a member who cheated). Only
-- while the plan still ends on the day the reward set: then its last day goes back and a line
-- "Reward taken back: new -> old" is added to its notes. Raises OWNER_ONLY, GONE, NOT_GIVEN, CHANGED.
create or replace function public.owner_undo_reward(p_key text, p_offer uuid, p_roster text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key); st public.gym_staff := public._staff(p_key);
  by_name text := coalesce(st.name, 'Owner (old owner key)');
  gy public.gyms; om public.offer_members; ms public.crm_records; v bigint; line text;
begin
  if not exists (select 1 from public.gym_offers where offer_id = p_offer and gym_id = g) then raise exception 'GONE'; end if;
  select * into gy from public.gyms where gym_id = g for update;
  select * into om from public.offer_members where offer_id = p_offer and roster_id = p_roster for update;
  if om.offer_id is null then raise exception 'GONE'; end if;
  if om.given_at is null then raise exception 'NOT_GIVEN'; end if;
  select * into ms from public.crm_records
   where gym_id = g and kind = 'membership' and id = om.given_membership_id and not deleted;
  if ms.id is null or coalesce(ms.data->>'cancelled', 'false') = 'true'
     or public._iso_day(ms.data->>'endsOn') is distinct from om.new_end then
    raise exception 'CHANGED';
  end if;
  line := 'Reward taken back: ' || to_char(om.new_end, 'YYYY-MM-DD') || ' -> ' || to_char(om.old_end, 'YYYY-MM-DD');
  v := coalesce(gy.crm_version, 0) + 1;
  update public.crm_records
     set data = data || jsonb_build_object(
                  'endsOn', to_char(om.old_end, 'YYYY-MM-DD'),
                  'notes', case when coalesce(btrim(data->>'notes'), '') = '' then line else (data->>'notes') || E'\n' || line end,
                  'updatedAt', floor(extract(epoch from now()) * 1000)::bigint),
         version = v, updated_at = now()
   where gym_id = g and kind = 'membership' and id = ms.id;
  update public.gyms set crm_version = v where gym_id = g;
  update public.offer_members
     set given_at = null, given_by = null, given_by_name = null, given_auto = null, given_membership_id = null,
         given_days = null, undone_at = now(), undone_by_name = by_name
   where offer_id = p_offer and roster_id = p_roster;
  insert into public.offer_log(gym_id, offer_id, roster_id, event, by_staff, by_name, detail)
    values (g, p_offer, p_roster, 'taken back', st.staff_id, by_name,
            jsonb_build_object('membershipId', ms.id, 'from', om.new_end, 'to', om.old_end));
  return jsonb_build_object('ok', true, 'endsOn', to_char(om.old_end, 'YYYY-MM-DD'), 'version', v);
end $$;

-- ------------------------------------------------------------------ member (app)
-- What the member's Offers card shows. Never a raise after the key check.
--   {ok:true, gymName, offer: {...} | null, me: {...} | null, canJoin: 'yes' | <reason>}
-- offer: the offer the member is in (window not over a week ago), else the gym's open offer.
-- canJoin: yes | JOINED | CLOSED | NO_PLAN | NO_PHONE | GYM_NOT_ONLINE | NOT_ON_ROSTER |
--          SHARED_NUMBER | NAME_MISMATCH | NONE (no offer).
create or replace function public.member_offers(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  gname text; today date := public._ist_today();
  o public.gym_offers; om public.offer_members; who record; can text;
begin
  select name into gname from public.gyms where gym_id = m.gym_id;
  -- 1. An offer this app member is in and still counting (window not over, not given yet), or one
  --    they earned whose days are still to come (kept however long that takes).
  select om2.* into om from public.offer_members om2 join public.gym_offers o2 on o2.offer_id = om2.offer_id
   where om2.member_id = m.member_id and o2.gym_id = m.gym_id and om2.left_at is null
     and om2.given_at is null
     and (om2.window_ends_on >= today or (om2.earned_at is not null and om2.undone_at is null))
   order by o2.created_at desc limit 1;
  -- Earned while no gym plan was running, and the offer gives the days by itself: try again now
  -- (a renewal may have come since). Still no plan: it stays "ready" for the desk.
  if om.offer_id is not null and om.earned_at is not null and om.given_at is null and om.undone_at is null
     and exists (select 1 from public.gym_offers x where x.offer_id = om.offer_id and x.auto_give) then
    begin
      perform public._offer_give(om.offer_id, om.roster_id, null, 'Automatic', true, false);
    exception when raise_exception then
      null;  -- quiet: NO_PLAN (or GONE) leaves the earned row as it is; the desk can give it
    end;
    select * into om from public.offer_members where offer_id = om.offer_id and roster_id = om.roster_id;
  end if;
  if om.offer_id is null then
    -- 2. The gym's open offer (to join, or the member's finished row in it).
    select * into o from public.gym_offers
     where gym_id = m.gym_id and stopped_at is null and starts_on <= today and join_until >= today
     order by created_at desc limit 1;
    if o.offer_id is null then
      -- 3. A finished one (given, or the window ended) from the last 7 days, so the result shows.
      select om2.* into om from public.offer_members om2 join public.gym_offers o2 on o2.offer_id = om2.offer_id
       where om2.member_id = m.member_id and o2.gym_id = m.gym_id and om2.left_at is null
         and om2.window_ends_on >= today - 7
       order by o2.created_at desc limit 1;
      if om.offer_id is null then
        return jsonb_build_object('ok', true, 'gymName', gname, 'offer', null, 'me', null, 'canJoin', 'NONE');
      end if;
    end if;
  end if;
  if om.offer_id is not null then
    select * into o from public.gym_offers where offer_id = om.offer_id;
    return jsonb_build_object('ok', true, 'gymName', gname, 'offer', public._offer_member_offer_json(o),
      'me', public._offer_me_json(om), 'canJoin', 'JOINED');
  end if;
  select * into who from public._offer_identity(m);
  if who.err is not null then
    can := who.err;
  else
    -- A member who left this offer (or the app) before: their row, so the card can say so.
    select * into om from public.offer_members where offer_id = o.offer_id and roster_id = who.roster_id;
    if om.offer_id is not null and (om.given_at is not null or (om.left_at is null and om.member_id = m.member_id)) then
      can := 'JOINED';
    elsif (public._offer_plan(m.gym_id, who.roster_id, today, true)).id is null then can := 'NO_PLAN';
    else can := 'yes'; end if;
  end if;
  return jsonb_build_object('ok', true, 'gymName', gname, 'offer', public._offer_member_offer_json(o),
    'me', case when om.offer_id is not null then public._offer_me_json(om) end, 'canJoin', can);
end $$;

-- "Join the offer" (after the consent screen): the consent and the version of the words the member
-- saw are written down. Needs a gym plan running today. Joining again after leaving keeps the
-- window the member first had (leaving and rejoining never starts a fresh 30 days).
-- Answers the same shape as member_offers, or {error: CLOSED | NO_PLAN | BAD_NOTICE | <identity>}.
create or replace function public.member_join_offer(p_key text, p_offer uuid, p_notice text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  today date := public._ist_today(); o public.gym_offers; om public.offer_members; who record;
  nv text := btrim(coalesce(p_notice, ''));
begin
  if length(nv) not between 1 and 20 then return jsonb_build_object('error', 'BAD_NOTICE'); end if;
  select * into o from public.gym_offers where offer_id = p_offer and gym_id = m.gym_id;
  if o.offer_id is null or o.stopped_at is not null or o.starts_on > today or o.join_until < today then
    return jsonb_build_object('error', 'CLOSED');
  end if;
  select * into who from public._offer_identity(m);
  if who.err is not null then return jsonb_build_object('error', who.err); end if;
  if (public._offer_plan(m.gym_id, who.roster_id, today, true)).id is null then
    return jsonb_build_object('error', 'NO_PLAN');
  end if;
  -- A double tap: the second insert finds the first row and changes nothing.
  insert into public.offer_members(offer_id, roster_id, gym_id, member_id, joined_on, window_ends_on, notice_version)
    values (o.offer_id, who.roster_id, m.gym_id, m.member_id, today, today + o.window_days - 1, nv)
    on conflict (offer_id, roster_id) do nothing;
  if found then
    insert into public.offer_log(gym_id, offer_id, roster_id, event, notice_version)
      values (m.gym_id, o.offer_id, who.roster_id, 'joined', nv);
    return public.member_offers(p_key);
  end if;
  select * into om from public.offer_members where offer_id = o.offer_id and roster_id = who.roster_id for update;
  if om.left_at is not null or om.member_id is distinct from m.member_id then
    update public.offer_members set left_at = null, member_id = m.member_id, notice_version = nv
     where offer_id = o.offer_id and roster_id = who.roster_id;
    insert into public.offer_log(gym_id, offer_id, roster_id, event, notice_version)
      values (m.gym_id, o.offer_id, who.roster_id, 'joined again', nv);
  end if;
  return public.member_offers(p_key);
end $$;

-- The phone's counted dates (at most 60 'YYYY-MM-DD'). The server keeps a date only inside the
-- member's window, not in the future, with a check-in in the gym's register that day (an app
-- check-in only when the offer counts them), and drops the rest. At the target it marks the reward
-- earned and, when the offer gives the days by themselves, gives them in this same transaction.
-- 20 sends a day. Answers the member_offers shape, or {error: NOT_JOINED | TOO_MANY | INVALID}.
create or replace function public.member_offer_days(p_key text, p_offer uuid, p_days jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  today date := public._ist_today(); o public.gym_offers; om public.offer_members;
  n int; d date;
begin
  if jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) > 60
     or exists (select 1 from jsonb_array_elements(p_days) e where jsonb_typeof(e) <> 'string') then
    return jsonb_build_object('error', 'INVALID');
  end if;
  select * into o from public.gym_offers where offer_id = p_offer and gym_id = m.gym_id;
  if o.offer_id is null then return jsonb_build_object('error', 'NOT_JOINED'); end if;
  -- The gym's row lock first (as check-in and crm_push take it), so an automatic give here and the
  -- desk's Give never wait on each other in the opposite order.
  perform 1 from public.gyms where gym_id = m.gym_id for update;
  select * into om from public.offer_members
   where offer_id = p_offer and member_id = m.member_id and left_at is null for update;
  if om.offer_id is null then return jsonb_build_object('error', 'NOT_JOINED'); end if;
  if om.sends_on = today and om.sends >= 20 then return jsonb_build_object('error', 'TOO_MANY'); end if;
  update public.offer_members
     set sends = case when sends_on = today then sends + 1 else 1 end, sends_on = today
   where offer_id = om.offer_id and roster_id = om.roster_id;

  if om.earned_at is null then
    for d in
      select distinct public._iso_day(e #>> '{}') from jsonb_array_elements(p_days) e
    loop
      continue when d is null or d < om.joined_on or d > least(om.window_ends_on, today);
      insert into public.offer_days(offer_id, roster_id, day, source)
        select om.offer_id, om.roster_id, d, v.src
          from (select case when r.data->>'source' in ('app', 'import') then r.data->>'source' else 'desk' end as src
                  from public.crm_records r
                 where r.gym_id = m.gym_id and r.kind = 'visit' and not r.deleted
                   and r.data->>'memberId' = om.roster_id and r.data->>'visitedOn' = to_char(d, 'YYYY-MM-DD')
                   and (o.count_app_checkins or coalesce(r.data->>'source', 'desk') <> 'app')
                 order by case when r.data->>'source' = 'app' then 1 else 0 end
                 limit 1) v
        on conflict do nothing;
    end loop;
    select count(*) into n from public.offer_days where offer_id = om.offer_id and roster_id = om.roster_id;
    if n >= o.workouts then
      update public.offer_members set earned_at = now() where offer_id = om.offer_id and roster_id = om.roster_id;
      insert into public.offer_log(gym_id, offer_id, roster_id, event, detail)
        values (m.gym_id, om.offer_id, om.roster_id, 'earned', jsonb_build_object('counted', n));
      if o.auto_give then
        begin
          perform public._offer_give(om.offer_id, om.roster_id, null, 'Automatic', true, false);
        exception when raise_exception then
          -- quiet: NO_PLAN (no gym plan running): the desk sees "Ready for reward"; member_offers
          -- tries again on the member's next look. Only the give is undone; the earned mark stays.
          null;
        end;
      end if;
    end if;
  end if;
  -- member_offers also retries an automatic give that had no plan before.
  return public.member_offers(p_key);
end $$;

-- "Leave the offer": the dates are deleted and nothing more is counted. An earned or given reward
-- stays. Answers {ok:true} (also when the member was not in it).
create or replace function public.member_leave_offer(p_key text, p_offer uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); r public.offer_members;
begin
  for r in select * from public.offer_members where offer_id = p_offer and member_id = m.member_id and left_at is null for update loop
    delete from public.offer_days where offer_id = r.offer_id and roster_id = r.roster_id;
    update public.offer_members set left_at = now(), member_id = null where offer_id = r.offer_id and roster_id = r.roster_id;
    insert into public.offer_log(gym_id, offer_id, roster_id, event) values (r.gym_id, r.offer_id, r.roster_id, 'left');
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- member_leave (0016), now also leaving every offer (dates deleted). The key change is unchanged.
create or replace function public.member_leave(p_key text)
  returns void language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); r public.offer_members;
begin
  for r in select * from public.offer_members where member_id = m.member_id and left_at is null for update loop
    delete from public.offer_days where offer_id = r.offer_id and roster_id = r.roster_id;
    update public.offer_members set left_at = now(), member_id = null where offer_id = r.offer_id and roster_id = r.roster_id;
    insert into public.offer_log(gym_id, offer_id, roster_id, event, detail)
      values (r.gym_id, r.offer_id, r.roster_id, 'left', '{"why":"left the gym"}'::jsonb);
  end loop;
  update public.gym_members
     set key_hash = public._hash_key(public._new_key()), left_at = now(), phone = null, checkin_phone = null
   where member_id = m.member_id;
end $$;

-- ------------------------------------------------------------------ messages: a group, a time
-- 0018's owner_send_message with two more arguments (both optional, so an older admin app's call
-- with four still works):
--   p_to       app member ids (gym_members) the message is for; null = every app member. Ids not of
--              this gym, or of members who left, are dropped; none left: NO_ONE.
--   p_send_at  when it appears in the inbox; null (or within a minute) = now; at most 30 days ahead
--              (BAD_TIME). The offer limits (1 a day, 3 a week) count by the day it appears.
drop function if exists public.owner_send_message(text, text, text, text);
create or replace function public.owner_send_message(p_key text, p_kind text, p_title text, p_body text,
                                                     p_to uuid[] default null, p_send_at timestamptz default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_body, ''));
  today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  at_time timestamptz := case when p_send_at is null or p_send_at <= now() + interval '1 minute' then null else p_send_at end;
  day_start timestamptz;
  n int;
  m public.gym_messages;
begin
  if p_kind not in ('announcement','closed','timing','offer','event','reminder') then raise exception 'BAD_KIND'; end if;
  if length(t) = 0 then raise exception 'EMPTY'; end if;
  if length(t) > 60 or length(b) > 300 then raise exception 'TOO_LONG'; end if;
  if at_time is not null and at_time > now() + interval '30 days' then raise exception 'BAD_TIME'; end if;
  if p_to is not null and coalesce(array_length(p_to, 1), 0) > 5000 then raise exception 'TOO_MANY'; end if;
  day_start := date_trunc('day', coalesce(at_time, now()) at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  -- One send at a time per gym: the counts below and the insert see each other.
  perform 1 from public.gyms where gym_id = g for update;
  select count(*) into n from public.gym_messages where gym_id = g and created_at >= today_start;
  if n >= 20 then raise exception 'TOO_MANY'; end if;
  if p_kind in ('offer','event') then
    select count(*) into n from public.gym_messages
      where gym_id = g and kind in ('offer','event')
        and coalesce(send_at, created_at) >= day_start and coalesce(send_at, created_at) < day_start + interval '1 day'
        and (withdrawn_at is null or withdrawn_at > coalesce(send_at, created_at) + interval '10 minutes');
    if n >= 1 then raise exception 'OFFER_TODAY'; end if;
    select count(*) into n from public.gym_messages
      where gym_id = g and kind in ('offer','event')
        and coalesce(send_at, created_at) >= day_start - interval '6 days' and coalesce(send_at, created_at) < day_start + interval '7 days'
        and (withdrawn_at is null or withdrawn_at > coalesce(send_at, created_at) + interval '10 minutes');
    if n >= 3 then raise exception 'OFFER_WEEK'; end if;
  end if;
  if p_to is null then
    select count(*) into n from public.gym_members where gym_id = g and left_at is null;
    insert into public.gym_messages(gym_id, kind, title, body, recipients, send_at, to_group)
      values (g, p_kind, t, b, n, at_time, false) returning * into m;
  else
    select count(distinct gm.member_id) into n from public.gym_members gm
     where gm.gym_id = g and gm.left_at is null and gm.member_id = any(p_to);
    if n = 0 then raise exception 'NO_ONE'; end if;
    insert into public.gym_messages(gym_id, kind, title, body, recipients, send_at, to_group)
      values (g, p_kind, t, b, n, at_time, true) returning * into m;
    insert into public.gym_message_to(message_id, member_id)
      select distinct m.message_id, gm.member_id from public.gym_members gm
       where gm.gym_id = g and gm.left_at is null and gm.member_id = any(p_to);
  end if;
  return public._message_json(m) || jsonb_build_object('recipients', m.recipients, 'seen', 0, 'withdrawn', false,
    'sendAt', m.send_at, 'toGroup', m.to_group);
end $$;

-- The Sent list (0009), with when a timed message goes and whether it went to a group. "Seen" for a
-- group counts only its members.
create or replace function public.owner_messages(p_key text)
  returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) from (
    select m.created_at,
           public._message_json(m) || jsonb_build_object(
             'recipients', m.recipients,
             'seen', case when m.to_group then
                        (select count(*) from public.gym_message_seen s
                           join public.gym_message_to t on t.message_id = s.message_id and t.member_id = s.member_id
                          where s.message_id = m.message_id)
                      else
                        (select count(*) from public.gym_message_seen s
                           join public.gym_members mem on mem.member_id = s.member_id
                          where s.message_id = m.message_id and mem.joined_at <= coalesce(m.send_at, m.created_at))
                      end,
             'withdrawn', m.withdrawn_at is not null,
             'sendAt', m.send_at, 'toGroup', m.to_group) as j
    from public.gym_messages m
    where m.gym_id = public._owner_gym(p_key)
    order by m.created_at desc
    limit 100) x
$$;

-- The member's inbox (0008): a message shows once its time has come, and a group message only to
-- its group. Its time is the time it appeared.
create or replace function public.member_messages(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare mem public.gym_members := public._member(p_key);
begin
  return (select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
    select coalesce(m.send_at, m.created_at) as at,
           public._message_json(m) || jsonb_build_object(
             'createdAt', coalesce(m.send_at, m.created_at),
             'seen', exists (select 1 from public.gym_message_seen s where s.message_id = m.message_id and s.member_id = mem.member_id)) as j
    from public.gym_messages m
    where m.gym_id = mem.gym_id and m.withdrawn_at is null
      and coalesce(m.send_at, m.created_at) <= now()
      and coalesce(m.send_at, m.created_at) >= mem.joined_at - interval '14 days'
      and (not m.to_group or exists (select 1 from public.gym_message_to t where t.message_id = m.message_id and t.member_id = mem.member_id))
    order by coalesce(m.send_at, m.created_at) desc
    limit 50) x);
end $$;

-- Seen marks (0008): only for messages this member can see.
create or replace function public.member_saw_messages(p_key text, p_ids uuid[])
  returns integer language plpgsql security definer set search_path = public as $$
declare mem public.gym_members := public._member(p_key); n int;
begin
  if coalesce(array_length(p_ids, 1), 0) > 100 then raise exception 'TOO_MANY'; end if;
  insert into public.gym_message_seen(message_id, member_id)
    select m.message_id, mem.member_id from public.gym_messages m
    where m.message_id = any(p_ids) and m.gym_id = mem.gym_id
      and coalesce(m.send_at, m.created_at) <= now()
      and (not m.to_group or exists (select 1 from public.gym_message_to t where t.message_id = m.message_id and t.member_id = mem.member_id))
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._ist_today()                                     from public, anon, authenticated;
revoke all on function public._offer_json(public.gym_offers)                   from public, anon, authenticated;
revoke all on function public._offer_plan(uuid, text, date, boolean)           from public, anon, authenticated;
revoke all on function public._offer_identity(public.gym_members)              from public, anon, authenticated;
revoke all on function public._offer_me_json(public.offer_members)             from public, anon, authenticated;
revoke all on function public._offer_member_offer_json(public.gym_offers)      from public, anon, authenticated;
revoke all on function public._offer_tidy(uuid)                                from public, anon, authenticated;
revoke all on function public._offer_give(uuid, text, uuid, text, boolean, boolean) from public, anon, authenticated;

revoke all on function public.owner_save_offer(text, jsonb)                    from public;
revoke all on function public.owner_stop_offer(text, uuid)                     from public;
revoke all on function public.owner_offers(text)                               from public;
revoke all on function public.staff_give_reward(text, uuid, text)              from public;
revoke all on function public.owner_undo_reward(text, uuid, text)              from public;
revoke all on function public.member_offers(text)                              from public;
revoke all on function public.member_join_offer(text, uuid, text)              from public;
revoke all on function public.member_offer_days(text, uuid, jsonb)             from public;
revoke all on function public.member_leave_offer(text, uuid)                   from public;
revoke all on function public.member_leave(text)                               from public;
revoke all on function public.owner_send_message(text, text, text, text, uuid[], timestamptz) from public;
revoke all on function public.owner_messages(text)                             from public;
revoke all on function public.member_messages(text)                            from public;
revoke all on function public.member_saw_messages(text, uuid[])                from public;

grant execute on function public.owner_save_offer(text, jsonb)                 to anon, authenticated;
grant execute on function public.owner_stop_offer(text, uuid)                  to anon, authenticated;
grant execute on function public.owner_offers(text)                            to anon, authenticated;
grant execute on function public.staff_give_reward(text, uuid, text)           to anon, authenticated;
grant execute on function public.owner_undo_reward(text, uuid, text)           to anon, authenticated;
grant execute on function public.member_offers(text)                           to anon, authenticated;
grant execute on function public.member_join_offer(text, uuid, text)           to anon, authenticated;
grant execute on function public.member_offer_days(text, uuid, jsonb)          to anon, authenticated;
grant execute on function public.member_leave_offer(text, uuid)                to anon, authenticated;
grant execute on function public.member_leave(text)                            to anon, authenticated;
grant execute on function public.owner_send_message(text, text, text, text, uuid[], timestamptz) to anon, authenticated;
grant execute on function public.owner_messages(text)                          to anon, authenticated;
grant execute on function public.member_messages(text)                         to anon, authenticated;
grant execute on function public.member_saw_messages(text, uuid[])             to anon, authenticated;

-- PostgREST learns the new and changed functions at once (instead of on its next schema reload).
notify pgrst, 'reload schema';
