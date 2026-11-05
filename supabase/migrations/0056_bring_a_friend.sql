-- APPLIED LIVE 5 Nov 2026 (owner's yes, R-331; SQL Editor, sha256 checked; its test PASSED on live).
-- (was not applied) - needs the owner's yes (a live database change).
--
-- 0056: Bring a friend (F147, from Project Tracker #58 item 4; built 4 Nov 2026). A member shares an invite
-- link from the app's Gym tab. The link opens a small public page (app.mettleup.fit/f/<CODE>, the panel's
-- Worker + public/friend.html) with the gym's name and a short form: name, mobile number, best time to train.
-- The form lands in the gym's own Enquiries list, marked "Referred by <member>". When the owner turns that
-- enquiry into a member, the admin app offers to add the free days the owner set in Settings to the member's
-- plan (one tap, the owner's own; nothing here moves a plan or money). The member sees only a count:
-- "Friends who joined: N".
--
-- Additive and re-runnable: two new tables (row security on, no policies, no grants), four helper-free
-- public functions and two private helpers. Nothing that exists is changed. Needs 0008 (left_at), 0010
-- (_norm_phone), 0013 (enquiry records), 0023 (_first_name_key), 0025 (_offer_identity, _ist_today), 0027
-- (gyms.status). Apply after 0055.
-- Test: supabase/tests/0056_bring_a_friend.sql (CI runs it after every migration; pasted into the SQL Editor
-- it always ends in an error and so changes nothing).
-- Undo: drop the four functions below, the two helpers and the two tables. Enquiries already made stay
-- (they are ordinary enquiry records).
--
-- PRIVACY. The friend's name and number go only into that gym's own records (an 'enquiry' row in
-- crm_records, the same row the desk's "+ Add enquiry" makes), which only that gym's admin app reads. The
-- member who shared the link gets back a number of friends who joined, never who. The public page learns
-- the gym's name and look (as the gym's own /j invite page does) and the sharing member's FIRST name only.
--
-- SPAM. The page's hidden box (a bot fills it: answered as sent, nothing kept); at most 5 enquiries a day
-- from one member's link and 30 a day for one gym (TOO_MANY); the panel Worker also allows 5 sends a day
-- from one network address (deploy/panel/friend.js). A number that is already on the gym's list, already
-- has an open enquiry, or is the sharing member's own is answered as sent and nothing new is made, so the
-- page never tells a stranger who is a member. A member who left the gym, or a paused gym: the link stops.
--
-- THE ENQUIRY ROW (what the admin app reads, apps/dashboard/src/crm/types.ts Enquiry):
--   {id: 'friend-<32 hex>', gymId, name, phone: '+91XXXXXXXXXX', interest: 'Best time to train: Evening',
--    followUpOn: <today in India>, status: 'open', memberId: null, source: 'friend',
--    referral: {by: <the member's name on the gym's list, else their app name>, memberId: <their id on the
--               gym's list, or null when the app member is not matched to it (0025's rules)>,
--               time: 'morning'|'afternoon'|'evening'|'any'},
--    createdAt, updatedAt}
-- written under the gym's row lock with the gym's records version moved on by one, the way 0047 writes a
-- reward, so every admin app picks it up on its next pull.
--
-- THE FREE DAYS SETTING lives on the gym's details record (crm_records kind 'gym', data.friendRewardDays, a
-- whole number 1..60; absent, empty or 0 = off). The admin app saves it like the gym's UPI ID; this file only
-- reads it, so the member's Gym tab can say what the gym gives.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_friend_invites (
  code       text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  member_id  uuid not null unique references public.gym_members(member_id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists gym_friend_invites_gym on public.gym_friend_invites(gym_id);
alter table public.gym_friend_invites enable row level security;
revoke all on public.gym_friend_invites from public, anon, authenticated;

create table if not exists public.gym_friend_referrals (
  enquiry_id text primary key check (length(enquiry_id) between 1 and 64),
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  member_id  uuid references public.gym_members(member_id) on delete set null,
  code       text not null,
  created_at timestamptz not null default now()
);
create index if not exists gym_friend_referrals_gym on public.gym_friend_referrals(gym_id, created_at desc);
create index if not exists gym_friend_referrals_code on public.gym_friend_referrals(code, created_at desc);
create index if not exists gym_friend_referrals_member on public.gym_friend_referrals(member_id);
alter table public.gym_friend_referrals enable row level security;
revoke all on public.gym_friend_referrals from public, anon, authenticated;

-- ------------------------------------------------------------------ private helpers
-- A new 8-letter code (no 0/O, 1/I: read aloud and typed without mistakes), from a random uuid's bytes.
create or replace function public._friend_code() returns text
  language plpgsql volatile set search_path = public as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  res text := '';
begin
  for i in 0..7 loop
    res := res || substr(abc, 1 + (get_byte(b, i) % 32), 1);
  end loop;
  return res;
end $$;

-- The free days the owner set for each friend who joins (1..60), or null when it is off.
create or replace function public._friend_reward_days(p_gym uuid) returns int
  language sql stable security definer set search_path = public as $$
  select case when x ~ '^[0-9]{1,3}$' and x::int between 1 and 60 then x::int end
    from (select btrim(coalesce(data->>'friendRewardDays', '')) as x
            from public.crm_records
           where gym_id = p_gym and kind = 'gym' and not deleted
           order by updated_at desc
           limit 1) d
$$;

revoke all on function public._friend_code() from public, anon, authenticated;
revoke all on function public._friend_reward_days(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ the member's side
-- This member's invite code (made once, kept), the gym's free days (or null) and how many friends joined.
-- {ok: true, code, gymName, rewardDays, joined} | {error: 'LEFT' | 'SUSPENDED'}; a bad key raises BAD_KEY.
create or replace function public.member_friend_invite(p_key text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  g public.gyms;
  inv public.gym_friend_invites;
  tries int := 0;
  joined int;
begin
  if m.left_at is not null then return jsonb_build_object('error', 'LEFT'); end if;
  select * into g from public.gyms where gym_id = m.gym_id;
  if g.status = 'suspended' then return jsonb_build_object('error', 'SUSPENDED'); end if;
  select * into inv from public.gym_friend_invites where member_id = m.member_id;
  while inv.code is null loop
    begin
      insert into public.gym_friend_invites(code, gym_id, member_id)
        values (public._friend_code(), m.gym_id, m.member_id)
        returning * into inv;
    exception when unique_violation then
      -- The code was taken, or this member's own code was made by a second call at the same moment.
      select * into inv from public.gym_friend_invites where member_id = m.member_id;
      tries := tries + 1;
      if inv.code is null and tries >= 5 then raise exception 'NO_CODE'; end if;
    end;
  end loop;
  select count(*) into joined
    from public.gym_friend_referrals r
    join public.crm_records e on e.gym_id = r.gym_id and e.kind = 'enquiry' and e.id = r.enquiry_id and not e.deleted
   where r.member_id = m.member_id and e.data->>'status' = 'joined';
  return jsonb_build_object('ok', true, 'code', inv.code, 'gymName', g.name,
                            'rewardDays', public._friend_reward_days(g.gym_id), 'joined', joined);
end $$;

-- ------------------------------------------------------------------ the public page
-- What the invite page shows before anyone types: the gym's name and look, and the sharing member's first
-- name. Null for an unknown code, a member who left, or a paused gym (the page then says the link stopped).
create or replace function public.friend_invite_preview(p_code text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare inv public.gym_friend_invites; m public.gym_members; g public.gyms; fname text;
begin
  select * into inv from public.gym_friend_invites where code = upper(btrim(coalesce(p_code, '')));
  if inv.code is null then return null; end if;
  select * into m from public.gym_members where member_id = inv.member_id;
  if m.member_id is null or m.left_at is not null then return null; end if;
  select * into g from public.gyms where gym_id = inv.gym_id;
  if g.gym_id is null or g.status = 'suspended' then return null; end if;
  fname := left(split_part(regexp_replace(btrim(m.name), '\s+', ' ', 'g'), ' ', 1), 30);
  return jsonb_build_object('gymName', g.name, 'code', inv.code, 'inviter', nullif(fname, ''),
                            'brand', public._brand_json(g));
end $$;

-- The page's form. p_time: 'morning' | 'afternoon' | 'evening' | 'any'; p_website: the hidden box.
-- {ok: true} | {error: 'NO_INVITE' | 'BAD_NAME' | 'BAD_PHONE' | 'TOO_MANY'}.
create or replace function public.friend_invite_send(p_code text, p_name text, p_phone text, p_time text,
                                                     p_website text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inv public.gym_friend_invites; m public.gym_members; g public.gyms; who record;
  nm text; ph text; t text; label text; by_name text; eid text; v bigint; now_ms bigint;
begin
  -- A bot filled the hidden box: answered as sent, nothing kept.
  if btrim(coalesce(p_website, '')) <> '' then return jsonb_build_object('ok', true); end if;
  select * into inv from public.gym_friend_invites where code = upper(btrim(coalesce(p_code, '')));
  if inv.code is null then return jsonb_build_object('error', 'NO_INVITE'); end if;
  select * into m from public.gym_members where member_id = inv.member_id;
  if m.member_id is null or m.left_at is not null then return jsonb_build_object('error', 'NO_INVITE'); end if;
  nm := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
  if length(nm) < 2 or nm !~ '[[:alpha:]]' then return jsonb_build_object('error', 'BAD_NAME'); end if;
  ph := public._norm_phone(p_phone);
  if ph is null then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  t := case when p_time in ('morning', 'afternoon', 'evening', 'any') then p_time else 'any' end;

  -- The gym's row lock first (the order crm_push, check-in and 0047 use).
  select * into g from public.gyms where gym_id = inv.gym_id for update;
  if g.gym_id is null or g.status = 'suspended' then return jsonb_build_object('error', 'NO_INVITE'); end if;
  if (select count(*) from public.gym_friend_referrals
       where code = inv.code and created_at > now() - interval '1 day') >= 5
     or (select count(*) from public.gym_friend_referrals
          where gym_id = g.gym_id and created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;
  -- Already known to the gym (on its list, an open enquiry) or the member's own number: answered as sent,
  -- so the page never tells a stranger who is a member; nothing new is made.
  if ph = public._norm_phone(m.checkin_phone)
     or exists (select 1 from public.crm_records
                 where gym_id = g.gym_id and kind = 'member' and not deleted
                   and public._norm_phone(data->>'phone') = ph)
     or exists (select 1 from public.crm_records
                 where gym_id = g.gym_id and kind = 'enquiry' and not deleted
                   and coalesce(data->>'status', 'open') = 'open'
                   and public._norm_phone(data->>'phone') = ph) then
    return jsonb_build_object('ok', true);
  end if;

  -- Who shared it, as the gym knows them (0025's matching: same check-in number and first name).
  select * into who from public._offer_identity(m);
  if who.roster_id is not null then
    select left(regexp_replace(btrim(data->>'fullName'), '\s+', ' ', 'g'), 80) into by_name
      from public.crm_records where gym_id = g.gym_id and kind = 'member' and id = who.roster_id;
  end if;
  by_name := coalesce(nullif(by_name, ''), left(btrim(m.name), 60));
  label := case t when 'morning' then 'Morning' when 'afternoon' then 'Afternoon'
                  when 'evening' then 'Evening' else 'Any time' end;

  v := coalesce(g.crm_version, 0) + 1;
  eid := 'friend-' || replace(gen_random_uuid()::text, '-', '');
  now_ms := floor(extract(epoch from now()) * 1000)::bigint;
  insert into public.crm_records(gym_id, kind, id, data, version)
    values (g.gym_id, 'enquiry', eid, jsonb_build_object(
              'id', eid, 'gymId', g.gym_id::text, 'name', nm, 'phone', '+91' || ph,
              'interest', 'Best time to train: ' || label,
              'followUpOn', to_char(public._ist_today(), 'YYYY-MM-DD'),
              'status', 'open', 'memberId', null, 'source', 'friend',
              'referral', jsonb_build_object('by', by_name, 'memberId', who.roster_id, 'time', t),
              'createdAt', now_ms, 'updatedAt', now_ms), v);
  update public.gyms set crm_version = v where gym_id = g.gym_id;
  insert into public.gym_friend_referrals(enquiry_id, gym_id, member_id, code)
    values (eid, g.gym_id, m.member_id, inv.code);
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ the gym's side
-- Settings -> Member app -> Bring a friend: how many members made an invite link, how many friends asked,
-- how many joined. Owner or desk key. Also tells the admin app this file is applied (else the card hides).
create or replace function public.owner_friend_summary(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key);
begin
  return jsonb_build_object(
    'ok', true,
    'links', (select count(*) from public.gym_friend_invites where gym_id = g),
    'asked', (select count(*) from public.gym_friend_referrals where gym_id = g),
    'joined', (select count(*) from public.gym_friend_referrals r
                 join public.crm_records e on e.gym_id = r.gym_id and e.kind = 'enquiry' and e.id = r.enquiry_id
                                          and not e.deleted
                where r.gym_id = g and e.data->>'status' = 'joined'));
end $$;

revoke all on function public.member_friend_invite(text) from public;
revoke all on function public.friend_invite_preview(text) from public;
revoke all on function public.friend_invite_send(text, text, text, text, text) from public;
revoke all on function public.owner_friend_summary(text) from public;
grant execute on function public.member_friend_invite(text) to anon, authenticated;
grant execute on function public.friend_invite_preview(text) to anon, authenticated;
grant execute on function public.friend_invite_send(text, text, text, text, text) to anon, authenticated;
grant execute on function public.owner_friend_summary(text) to anon, authenticated;

notify pgrst, 'reload schema';
