-- APPLIED LIVE 15 Nov 2026 (owner: "yes 0093"); live test 0093 PASS 35, nothing left behind.
-- Re-runnable. Apply after 0068 (member_find_tries, the member search rules), 0061 (_phone_proof), 0050 (gym_trainers),
-- 0055 (_checkin_plan_ok) and 0005 (_brand_json). Additive: one new function the member app calls. No new table or
-- column, no change to any existing function.
-- Test: supabase/tests/0093_phone_sign_in.sql (CI runs it after every migration; pasted into the SQL Editor it always
-- ends in an error and so changes nothing).
-- Undo: drop function public.phone_sign_in_find(text, text);
--
-- 0093: F203 "Sign in with your phone number; the app finds your gym and role" (owner, 14 Nov 2026, R-493, pick A:
-- the proof is one free WhatsApp message). The member app's first screen offers "Continue with your phone number".
-- The person proves the number with the live "Verify with WhatsApp" check (the panel Worker's purpose 'member': they
-- SEND us one message, we send nothing), and the app asks which MettleUp gyms know that number, and as whom:
--
--   phone_sign_in_find(proof, first name) -> {ok, matches: [{gymId, gymName, joinCode, role, endsOn, pass, brand}]}
--                                             | {error: BAD_PROOF | TOO_MANY}
--     role: 'owner'   - a live owner row of the gym's people (gym_staff role 'owner');
--           'trainer' - a live front-desk row with the gym's Trainer tick (0050 gym_trainers);
--           'desk'    - any other live front-desk row (the gym's desk staff);
--           'member'  - a live (not deleted, not archived) member on the gym's list with this number AND the same
--                       first name, with a plan running today or a pass: exactly 0068's member_find_gyms rule
--                       (a recycled number never shows the old holder's gym). Skipped when no first name is given.
--     One line per gym, its strongest role (owner, trainer, desk, member); at most 5 lines (a number on more gyms
--     than that is not one person's own); a suspended gym is never listed. endsOn (members only, the running plan's
--     last day) and pass are the only facts about a membership; nothing about price, dues, visits, other members or
--     other people of the gym is returned. brand = the gym's colours and logo as gym_preview shows them already.
--     The proof is only LOOKED at here (not used up), so after the join the same proof can still link a member's
--     number to the gym's list (0068 member_claim_phone). Searches share 0068's limit: at most 5 per proof.
--
-- WHY A PROOF AND NEVER A TYPED NUMBER: before the proof nothing tells whether a number is known anywhere (the
-- Worker's start answers the same for every number). Only the holder of the number learns which gyms know it.
-- A server without this file: the app falls back to 0068's member search (members only) and logs it.

set lock_timeout = '3s';

create or replace function public.phone_sign_in_find(p_proof text, p_name text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  ph text;
  fk text := public._first_name_key(p_name);
  v_nonce text := split_part(coalesce(p_proof, ''), '.', 5);
  day text := to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  n int;
  found_rows jsonb;
begin
  ph := public._phone_proof(p_proof, 'member', false);
  if ph is null then return jsonb_build_object('error', 'BAD_PROOF'); end if;
  -- The same counter as 0068's search: one proof, at most 5 searches of either kind.
  perform pg_advisory_xact_lock(hashtext('member-find:' || v_nonce));
  delete from public.member_find_tries t where t.at < now() - interval '1 day';
  select count(*) into n from public.member_find_tries t where t.nonce = v_nonce;
  if n >= 5 then return jsonb_build_object('error', 'TOO_MANY'); end if;
  insert into public.member_find_tries(nonce) values (v_nonce);

  with people as (
    -- The gym's own people with this number (the number they sign in to the admin app with).
    select s.gym_id,
           case when s.role = 'owner' then 'owner'
                when exists (select 1 from public.gym_trainers t where t.staff_id = s.staff_id and t.gym_id = s.gym_id) then 'trainer'
                else 'desk' end as role,
           null::text as ends_on, false as pass
      from public.gym_staff s
     where s.phone = ph and s.removed_at is null
  ), members as (
    -- 0068's member rule, word for word: number + first name + a plan running today or a pass.
    select r.gym_id, 'member'::text as role,
           (select max(m.data->>'endsOn') from public.crm_records m
             where m.gym_id = r.gym_id and m.kind = 'membership' and not m.deleted
               and m.data->>'memberId' = r.id and coalesce(m.data->>'cancelled', 'false') <> 'true'
               and m.data->>'startsOn' <= day and m.data->>'endsOn' >= day) as ends_on,
           public._pass_company(r.data) is not null as pass
      from public.crm_records r
     where fk is not null and r.kind = 'member' and not r.deleted
       and public._norm_phone(r.data->>'phone') = ph
       and coalesce(r.data->>'archived', 'false') <> 'true'
       and public._first_name_key(r.data->>'fullName') = fk
       and public._checkin_plan_ok(r.gym_id, r.id, day)
  ), every_role as (
    select x.*, case x.role when 'owner' then 1 when 'trainer' then 2 when 'desk' then 3 else 4 end as rank
      from (select * from people union all select * from members) x
  ), best as (
    -- One line per gym: its strongest role (a member's plan end goes with a member line only).
    select distinct on (e.gym_id) e.gym_id, e.role, e.rank, e.ends_on, e.pass
      from every_role e
     order by e.gym_id, e.rank, e.ends_on desc nulls last
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'gymId', y.gym_id::text, 'gymName', y.gym_name, 'joinCode', y.join_code, 'role', y.role,
           'endsOn', y.ends_on, 'pass', y.pass, 'brand', y.brand)
         order by y.rank, y.gym_name), '[]'::jsonb)
    into found_rows
    from (
      select b.gym_id, g.name as gym_name, g.join_code, b.role, b.rank, b.ends_on, b.pass, public._brand_json(g) as brand
        from best b
        join public.gyms g on g.gym_id = b.gym_id
       where coalesce(g.status, 'trial') <> 'suspended'
       order by b.rank, g.name
       limit 5
    ) y;
  return jsonb_build_object('ok', true, 'matches', found_rows);
end $$;

revoke all on function public.phone_sign_in_find(text, text) from public;
grant execute on function public.phone_sign_in_find(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
