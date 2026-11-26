-- NOT YET APPLIED LIVE: waits for the owner's yes. Re-runnable. Apply after 0099 (phone accounts), 0093
-- (phone_sign_in_find), 0068 (member_find_tries, member_claim_phone, the phone index), 0061 (phone_code_settings),
-- 0055 (_pass_company), 0050 (gym_trainers) and 0005 (_brand_json).
-- Test: supabase/tests/0100_gym_added_you.sql (CI runs it after every migration; pasted into the SQL Editor it always
-- ends in an error and so changes nothing).
-- Undo: drop function public.phone_account_gyms(text); drop function public.phone_account_claim(text);
--       drop function public._phone_account_code(); drop function public._phone_for_code(text, text, uuid);
--       drop function public._phone_gym_find(text, text); drop table public.phone_gym_checks;
--       drop table public.phone_gym_check_settings; then re-run 0093 (puts back its own member rule).
--
-- 0100: F239 "A gym added you" (owner, 26 Nov 2026, R-629): "if the user installed the app first and then their name
-- was added to a gym as a member, as a trainer, as a staff, will the app detect it and let the user know".
-- Until now the gym is looked for once, on the first screen (0093). A person a gym adds later is never told.
--
-- Since 0.80.0 (0099) a phone sign-in IS a MettleUp account: its e-mail is m-<code>[-n]@phone.mettleup.fit, where
-- <code> = HMAC of the number with the server's secret. The phone does NOT keep the number (0.80.0's promise), so it
-- sends only the first name. The server finds the number among the numbers the gyms already hold (gym people, and
-- list members of that first name) by computing each one's code and comparing it with the caller's. No number is
-- sent, stored or returned. Only the NEWEST account of a number counts (a recycled number's old holder, still signed
-- in on an old phone, learns nothing).
--
--   phone_account_gyms(first name) -> {ok, matches: [...as 0093, plus lapsed...]} | {ok, off: true}
--                                     | {error: NOT_PHONE_ACCOUNT | NOT_YOUR_NUMBER | TOO_MANY | NO_SECRET}
--   phone_account_claim(member key) -> as 0068 member_claim_phone, the account in place of the proof
--
-- MEMBER RULE (owner, 26 Nov 2026: "a lapsed member should be found because gym owner could use the app to kind of
-- encourage user to renew"; 15 days is Claude's pick, his words "you can decide the best"): a member is found while a
-- plan runs today, OR a plan ended in the last 15 days (India date), OR they hold a pass. The first-screen sign-in
-- (0093 phone_sign_in_find) gets the SAME rule here, so both ways in agree. 'lapsed' = true when no plan runs today.
--
-- SWITCH: phone_gym_check_settings.on = false makes phone_account_gyms answer {ok, off: true} (the app shows nothing),
-- with no app release.
-- LIMIT: 6 checks per account per rolling 24 h (the app asks at most once a day, plus the Gym tab).
-- LOG: each check keeps one row (account, time, found count): no number, no gym. Read weekly to see if it works.

set lock_timeout = '3s';

create table if not exists public.phone_gym_check_settings (
  id boolean primary key default true check (id),
  "on" boolean not null default true
);
insert into public.phone_gym_check_settings(id, "on") values (true, true) on conflict (id) do nothing;
alter table public.phone_gym_check_settings enable row level security;
revoke all on public.phone_gym_check_settings from public, anon, authenticated;

create table if not exists public.phone_gym_checks (
  user_id uuid not null,
  at      timestamptz not null default now(),
  gyms_found int not null default 0,
  claimed boolean not null default false
);
create index if not exists phone_gym_checks_user on public.phone_gym_checks(user_id, at);
alter table public.phone_gym_checks enable row level security;
revoke all on public.phone_gym_checks from public, anon, authenticated;

-- ------------------------------------------------------------------ the shared lookup (0093's, new member rule)
create or replace function public._phone_gym_find(p_phone text, p_name text) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  ph text := public._norm_phone(p_phone);
  fk text := public._first_name_key(p_name);
  today date := (now() at time zone 'Asia/Kolkata')::date;
  day text := to_char(today, 'YYYY-MM-DD');
  grace text := to_char(today - 15, 'YYYY-MM-DD');
  found_rows jsonb;
begin
  if ph is null then return '[]'::jsonb; end if;
  with people as (
    select s.gym_id,
           case when s.role = 'owner' then 'owner'
                when exists (select 1 from public.gym_trainers t where t.staff_id = s.staff_id and t.gym_id = s.gym_id) then 'trainer'
                else 'desk' end as role,
           null::text as ends_on, false as pass, false as lapsed
      from public.gym_staff s
     where s.phone = ph and s.removed_at is null
  ), roster as (
    select r.gym_id, r.id, public._pass_company(r.data) is not null as pass,
           (select max(m.data->>'endsOn') from public.crm_records m
             where m.gym_id = r.gym_id and m.kind = 'membership' and not m.deleted
               and m.data->>'memberId' = r.id and coalesce(m.data->>'cancelled', 'false') <> 'true'
               and m.data->>'startsOn' <= day and m.data->>'endsOn' >= grace) as ends_on
      from public.crm_records r
     where fk is not null and r.kind = 'member' and not r.deleted
       and public._norm_phone(r.data->>'phone') = ph
       and coalesce(r.data->>'archived', 'false') <> 'true'
       and public._first_name_key(r.data->>'fullName') = fk
  ), members as (
    select x.gym_id, 'member'::text as role, x.ends_on, x.pass,
           (not x.pass and x.ends_on < day) as lapsed
      from roster x
     where x.pass or x.ends_on is not null
  ), every_role as (
    select y.*, case y.role when 'owner' then 1 when 'trainer' then 2 when 'desk' then 3 else 4 end as rank
      from (select * from people union all select * from members) y
  ), best as (
    select distinct on (e.gym_id) e.gym_id, e.role, e.rank, e.ends_on, e.pass, e.lapsed
      from every_role e
     order by e.gym_id, e.rank, e.ends_on desc nulls last
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'gymId', z.gym_id::text, 'gymName', z.gym_name, 'joinCode', z.join_code, 'role', z.role,
           'endsOn', z.ends_on, 'pass', z.pass, 'lapsed', z.lapsed, 'brand', z.brand)
         order by z.rank, z.gym_name), '[]'::jsonb)
    into found_rows
    from (
      select b.gym_id, g.name as gym_name, g.join_code, b.role, b.rank, b.ends_on, b.pass, b.lapsed,
             public._brand_json(g) as brand
        from best b
        join public.gyms g on g.gym_id = b.gym_id
       where coalesce(g.status, 'trial') <> 'suspended'
       order by b.rank, g.name
       limit 5
    ) z;
  return found_rows;
end $$;
revoke all on function public._phone_gym_find(text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ 0093's sign-in, same answer, new member rule
-- Changed from 0093: the lookup moved into _phone_gym_find (members: plan today OR ended in the last 15 days OR a
-- pass; each line also says 'lapsed'). Proof, limit and answer shape are unchanged.
create or replace function public.phone_sign_in_find(p_proof text, p_name text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  ph text;
  v_nonce text := split_part(coalesce(p_proof, ''), '.', 5);
  n int;
begin
  ph := public._phone_proof(p_proof, 'member', false);
  if ph is null then return jsonb_build_object('error', 'BAD_PROOF'); end if;
  perform pg_advisory_xact_lock(hashtext('member-find:' || v_nonce));
  delete from public.member_find_tries t where t.at < now() - interval '1 day';
  select count(*) into n from public.member_find_tries t where t.nonce = v_nonce;
  if n >= 5 then return jsonb_build_object('error', 'TOO_MANY'); end if;
  insert into public.member_find_tries(nonce) values (v_nonce);
  return jsonb_build_object('ok', true, 'matches', public._phone_gym_find(ph, p_name));
end $$;
revoke all on function public.phone_sign_in_find(text, text) from public;
grant execute on function public.phone_sign_in_find(text, text) to anon, authenticated;

-- ------------------------------------------------------------------ the caller's own phone account code
-- An earlier draft of this file took the number from the phone; those signatures never went live.
drop function if exists public.phone_account_gyms(text, text);
drop function if exists public.phone_account_claim(text, text);
drop function if exists public._phone_account_number(text);

-- The 40-hex code of the caller's phone account (0099), or an error word. Only the NEWEST account of a number
-- (0099 makes a new one when the number passed to a new person): an old holder's account gets NOT_YOUR_NUMBER.
create or replace function public._phone_account_code() returns text
  language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_email text; code text; newest text;
begin
  if me is null then return 'NOT_PHONE_ACCOUNT'; end if;
  select au.email into my_email from auth.users au where au.id = me;
  if my_email is null or my_email !~ '^m-[0-9a-f]{40}(-[0-9]+)?@phone\.mettleup\.fit$' then return 'NOT_PHONE_ACCOUNT'; end if;
  code := substr(my_email, 3, 40);
  select au.email into newest from auth.users au
   where au.email = 'm-' || code || '@phone.mettleup.fit'
      or au.email ~ ('^m-' || code || '-[0-9]+@phone\.mettleup\.fit$')
   order by au.created_at desc
   limit 1;
  if newest is distinct from my_email then return 'NOT_YOUR_NUMBER'; end if;
  return code;
end $$;
revoke all on function public._phone_account_code() from public, anon, authenticated;

-- The number behind an account code, found among the numbers the gyms ALREADY hold: live gym people, and live list
-- members whose first name is p_name's (or only one gym's list: p_gym). The phone never sends the number (the phone
-- sign-in does not keep it on the phone). One HMAC per candidate: gym people, plus list members of that first name.
-- null = no gym holds this number (or no secret).
create or replace function public._phone_for_code(p_code text, p_name text, p_gym uuid default null) returns text
  language plpgsql stable security definer set search_path = public, extensions as $$
declare
  k text; fk text := public._first_name_key(p_name); ph text;
begin
  select secret into k from public.phone_code_settings where id;
  if k is null or coalesce(p_code, '') !~ '^[0-9a-f]{40}$' then return null; end if;
  select c.ph into ph
    from (select s.phone as ph from public.gym_staff s
           where s.removed_at is null and p_gym is null
          union
          select public._norm_phone(r.data->>'phone') from public.crm_records r
           where fk is not null and r.kind = 'member' and not r.deleted
             and (p_gym is null or r.gym_id = p_gym)
             and coalesce(r.data->>'archived', 'false') <> 'true'
             and public._first_name_key(r.data->>'fullName') = fk) c
   where c.ph ~ '^[0-9]{10}$'
     and substr(encode(hmac('account:' || c.ph, k, 'sha256'), 'hex'), 1, 40) = p_code
   limit 1;
  return ph;
end $$;
revoke all on function public._phone_for_code(text, text, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ "A gym added you": the check
create or replace function public.phone_account_gyms(p_name text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  code text; ph text;
  n int;
  found_rows jsonb := '[]'::jsonb;
begin
  code := public._phone_account_code();
  if code !~ '^[0-9a-f]{40}$' then return jsonb_build_object('error', code); end if;
  if not coalesce((select s."on" from public.phone_gym_check_settings s where s.id), false) then
    return jsonb_build_object('ok', true, 'off', true, 'matches', '[]'::jsonb);
  end if;
  if not exists (select 1 from public.phone_code_settings where id and secret is not null) then
    return jsonb_build_object('error', 'NO_SECRET');
  end if;
  perform pg_advisory_xact_lock(hashtext('gym-added:' || me::text));
  delete from public.phone_gym_checks c where c.at < now() - interval '30 days';
  select count(*) into n from public.phone_gym_checks c where c.user_id = me and not c.claimed
     and c.at > now() - interval '24 hours';
  if n >= 6 then return jsonb_build_object('error', 'TOO_MANY'); end if;
  ph := public._phone_for_code(code, p_name);
  if ph is not null then found_rows := public._phone_gym_find(ph, p_name); end if;
  insert into public.phone_gym_checks(user_id, gyms_found) values (me, jsonb_array_length(found_rows));
  return jsonb_build_object('ok', true, 'matches', found_rows);
end $$;
revoke all on function public.phone_account_gyms(text) from public, anon;
grant execute on function public.phone_account_gyms(text) to authenticated;

-- ------------------------------------------------------------------ after the join: link the gym's list row
-- 0068's member_claim_phone, with the signed-in phone account in place of the WhatsApp proof. The list member must
-- have this account's number AND the app member's first name (as 0068).
create or replace function public.phone_account_claim(p_key text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  g public.gyms;
  code text; ph text;
  roster public.crm_records;
begin
  select * into g from public.gyms where gym_id = m.gym_id;
  code := public._phone_account_code();
  if code !~ '^[0-9a-f]{40}$' then return jsonb_build_object('error', code, 'gymName', g.name); end if;
  ph := public._phone_for_code(code, m.name, g.gym_id);
  if ph is null then return jsonb_build_object('error', 'NOT_ON_ROSTER', 'gymName', g.name); end if;
  select r.* into roster from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'member' and not r.deleted
     and coalesce(r.data->>'archived', 'false') <> 'true'
     and public._norm_phone(r.data->>'phone') = ph
     and public._first_name_key(r.data->>'fullName') = public._first_name_key(m.name)
   order by case when r.data->>'createdAt' ~ '^[0-9]{1,15}$' then (r.data->>'createdAt')::bigint end nulls last, r.id
   limit 1;
  if roster.id is null then return jsonb_build_object('error', 'NOT_ON_ROSTER', 'gymName', g.name); end if;
  update public.gym_members
     set checkin_phone = '+91' || ph, phone = '+91' || ph, phone_checked_at = now()
   where member_id = m.member_id;
  update public.gym_phone_links
     set status = 'approved', decided_at = now(), decided_by = null, decided_by_name = 'Number checked'
   where app_member = m.member_id and status = 'pending';
  insert into public.phone_gym_checks(user_id, gyms_found, claimed) values (auth.uid(), 1, true);
  return jsonb_build_object('ok', true, 'gymName', g.name);
end $$;
revoke all on function public.phone_account_claim(text) from public, anon;
grant execute on function public.phone_account_claim(text) to authenticated;

notify pgrst, 'reload schema';
