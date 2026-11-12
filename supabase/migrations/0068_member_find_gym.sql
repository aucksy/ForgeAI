-- APPLIED LIVE 12 Nov 2026 (owner, 12 Nov: "Yes to GYM server change"), in the SQL Editor, this exact text from
-- 0d5ab334 (sha256 197543435807cbbf, checked in the browser). Read-only check after: 2 functions, the column, the table
-- and the index exist. The live run of supabase/tests/0068 was not done (stopped by a safety check); CI runs it.
-- Was: NOT APPLIED. Needs the owner's yes (a live server change). Re-runnable. Apply after 0061 (it uses 0061's
-- _phone_proof and phone_proofs_used) and after 0055 (it uses _checkin_plan_ok as 0055 left it).
-- Test: supabase/tests/0068_member_find_gym.sql (CI runs it after every migration; pasted into the SQL Editor it
-- always ends in an error and so changes nothing).
-- Plan: docs/plans/phone-membership-detect.md (owner request R-458, 12 Nov 2026).
--
-- 0068: "Find my gym by my number". A member PROVES their mobile number (a 'member' proof from the panel Worker:
-- today "Verify with WhatsApp", the person sends US the code, free; later an SMS or a WhatsApp code we send makes
-- the same proof), and the app asks which MettleUp gyms have that number on their member list with a plan (or a
-- pass) running today. The member picks one and joins it the usual way (member_join, the gym's code), then hands
-- the same proof in once more so the gym's list and the app are linked at once (no desk check needed: the number
-- is proven, which a typed number never was, 0048).
--
-- WHY A PROOF AND NEVER A TYPED NUMBER: a search by a typed number would tell anybody which gym a person uses
-- (stalking risk). Only the holder of the number gets an answer, and only for their own first name.
--
-- NEW
--   member_find_tries                one row per search, by the proof's one-use nonce (at most 5 searches per proof).
--   gym_members.phone_checked_at     when this app member's number was proven (null = typed / desk-confirmed).
--   crm_records index on the member's 10-digit mobile (members only), so the search does not read every gym.
--   member_find_gyms(proof, name) -> {ok, gyms: [{gymId, gymName, joinCode, endsOn, pass}]} (at most 5, newest end
--       first) | {error: BAD_PROOF | NAME_NEEDED | TOO_MANY}
--       The proof is only LOOKED at here (not used up), so the same proof can still link the member after the join.
--       A gym is listed only when: not suspended; a live (not deleted, not archived) member on its list has this
--       number AND the same first name as typed in the app (a recycled number never shows the old holder's gym);
--       and that member has a plan running today or comes on a pass (_checkin_plan_ok, 0055). Nothing about a
--       plan's price, dues or visits is ever returned.
--   member_claim_phone(key, proof) -> {ok, gymName} | {error: BAD_PROOF | NOT_ON_ROSTER | NAME_MISMATCH}
--       With this phone's member key (it joined the gym): the proof is USED UP and the gym's list member with
--       this number and first name is linked (checkin_phone, phone, phone_checked_at). A desk request for this
--       app member that is still waiting (0048 gym_phone_links) is closed as approved ("Number checked").
-- CHANGED: nothing that exists.
-- Undo: drop function public.member_find_gyms(text, text); drop function public.member_claim_phone(text, text);
--   drop table public.member_find_tries; drop index public.crm_records_member_phone;
--   alter table public.gym_members drop column phone_checked_at.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables (RLS on, no grants)
create table if not exists public.member_find_tries (
  nonce text not null,
  at    timestamptz not null default now()
);
create index if not exists member_find_tries_nonce on public.member_find_tries(nonce);
alter table public.member_find_tries enable row level security;
revoke all on public.member_find_tries from public, anon, authenticated;

alter table public.gym_members add column if not exists phone_checked_at timestamptz;

create index if not exists crm_records_member_phone on public.crm_records ((public._norm_phone(data->>'phone')))
  where kind = 'member' and not deleted;

-- ------------------------------------------------------------------ the search
create or replace function public.member_find_gyms(p_proof text, p_name text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  ph text;
  fk text := public._first_name_key(p_name);
  v_nonce text := split_part(coalesce(p_proof, ''), '.', 5);
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  n int;
  found_gyms jsonb;
begin
  ph := public._phone_proof(p_proof, 'member', false);
  if ph is null then return jsonb_build_object('error', 'BAD_PROOF'); end if;
  if fk is null then return jsonb_build_object('error', 'NAME_NEEDED'); end if;
  perform pg_advisory_xact_lock(hashtext('member-find:' || v_nonce));
  delete from public.member_find_tries t where t.at < now() - interval '1 day';
  select count(*) into n from public.member_find_tries t where t.nonce = v_nonce;
  if n >= 5 then return jsonb_build_object('error', 'TOO_MANY'); end if;
  insert into public.member_find_tries(nonce) values (v_nonce);

  -- One line per gym (the earliest-made list member with this number and first name), at most 5 gyms
  -- (a number on more lists than that is not one person's own), the plan ending last first; pass members last.
  select coalesce(jsonb_agg(jsonb_build_object('gymId', y.gym_id::text, 'gymName', y.gym_name, 'joinCode', y.join_code,
                                               'endsOn', y.ends_on, 'pass', y.pass)
                            order by y.ends_on desc nulls last, y.gym_name), '[]'::jsonb)
    into found_gyms
    from (
      select x.* from (
        select distinct on (g.gym_id) g.gym_id, g.name as gym_name, g.join_code,
               (select max(m.data->>'endsOn') from public.crm_records m
                 where m.gym_id = g.gym_id and m.kind = 'membership' and not m.deleted
                   and m.data->>'memberId' = r.id and coalesce(m.data->>'cancelled', 'false') <> 'true'
                   and m.data->>'startsOn' <= day and m.data->>'endsOn' >= day) as ends_on,
               public._pass_company(r.data) is not null as pass
          from public.crm_records r
          join public.gyms g on g.gym_id = r.gym_id
         where r.kind = 'member' and not r.deleted
           and public._norm_phone(r.data->>'phone') = ph
           and coalesce(r.data->>'archived', 'false') <> 'true'
           and coalesce(g.status, 'trial') <> 'suspended'
           and public._first_name_key(r.data->>'fullName') = fk
           and public._checkin_plan_ok(g.gym_id, r.id, day)
         order by g.gym_id,
                  case when r.data->>'createdAt' ~ '^[0-9]{1,15}$' then (r.data->>'createdAt')::bigint end nulls last, r.id
      ) x
      order by x.ends_on desc nulls last, x.gym_name
      limit 5
    ) y;
  return jsonb_build_object('ok', true, 'gyms', found_gyms);
end $$;

-- ------------------------------------------------------------------ the link, after joining
create or replace function public.member_claim_phone(p_key text, p_proof text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  g public.gyms;
  ph text;
  roster public.crm_records;
begin
  select * into g from public.gyms where gym_id = m.gym_id;
  ph := public._phone_proof(p_proof, 'member', false);
  if ph is null then return jsonb_build_object('error', 'BAD_PROOF', 'gymName', g.name); end if;
  -- The same live list member member_find_gyms showed (number + first name); the proof is kept for another try.
  select r.* into roster from public.crm_records r
   where r.gym_id = g.gym_id and r.kind = 'member' and not r.deleted
     and coalesce(r.data->>'archived', 'false') <> 'true'
     and public._norm_phone(r.data->>'phone') = ph
     and public._first_name_key(r.data->>'fullName') = public._first_name_key(m.name)
   order by case when r.data->>'createdAt' ~ '^[0-9]{1,15}$' then (r.data->>'createdAt')::bigint end nulls last, r.id
   limit 1;
  if roster.id is null then
    if exists (select 1 from public.crm_records r
                where r.gym_id = g.gym_id and r.kind = 'member' and not r.deleted
                  and coalesce(r.data->>'archived', 'false') <> 'true'
                  and public._norm_phone(r.data->>'phone') = ph) then
      return jsonb_build_object('error', 'NAME_MISMATCH', 'gymName', g.name);
    end if;
    return jsonb_build_object('error', 'NOT_ON_ROSTER', 'gymName', g.name);
  end if;
  if public._phone_proof(p_proof, 'member', true) is null then
    return jsonb_build_object('error', 'BAD_PROOF', 'gymName', g.name);
  end if;
  update public.gym_members
     set checkin_phone = '+91' || ph, phone = '+91' || ph, phone_checked_at = now()
   where member_id = m.member_id;
  update public.gym_phone_links
     set status = 'approved', decided_at = now(), decided_by = null, decided_by_name = 'Number checked'
   where app_member = m.member_id and status = 'pending';
  return jsonb_build_object('ok', true, 'gymName', g.name);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public.member_find_gyms(text, text)  from public;
revoke all on function public.member_claim_phone(text, text) from public;
grant execute on function public.member_find_gyms(text, text)  to anon, authenticated;
grant execute on function public.member_claim_phone(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
