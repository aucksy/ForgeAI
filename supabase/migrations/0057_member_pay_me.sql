-- APPLIED LIVE 5 Nov 2026 (owner's yes, R-331; SQL Editor, sha256 checked; its test PASSED on live).
-- (was not applied) - needs the owner's yes (paste into the Supabase SQL Editor after 0056).
-- 0057: F79 online payments (R-328, 4 Nov 2026). Additive and re-runnable: ONE new read-only function.
--
-- member_pay_me(p_key) tells MettleUp's web server (deploy/panel/pay.js) which of the gym's own members
-- an app member is, so the app can show "Your gym asked you to pay ₹1,500 for Monthly plan" to THAT
-- member only. The payment requests themselves are not in this database (they are in Cloudflare D1,
-- deploy/panel/migrations/0011_payments.sql); this function hands out no money, no plan and no name of
-- anyone else.
--
-- The same checks as "My membership" (0023): only the check-in number the desk has confirmed (0048),
-- that number on exactly one member of the gym's list, and the same first name. Anything else answers
-- rosterId null: the app then shows only the member's own shop-order payments.
--
-- ANSWER: {gymId, memberId (the app member), rosterId (the gym's member id) | null, name (first name)}
-- A dead key raises BAD_KEY (like every member_* function).
-- Test: supabase/tests/0057_member_pay_me.sql.
-- Undo: drop function public.member_pay_me(text);

create or replace function public.member_pay_me(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  m public.gym_members := public._member(p_key);
  ph text;
  roster public.crm_records;
  sharing int;
  rid text := null;
begin
  ph := public._norm_phone(m.checkin_phone);
  if ph is not null then
    roster := public._checkin_roster_member(m.gym_id, ph);
    if roster.id is not null then
      select count(*) into sharing from public.crm_records r
       where r.gym_id = m.gym_id and r.kind = 'member' and not r.deleted
         and coalesce(r.data->>'archived', 'false') <> 'true'
         and public._norm_phone(r.data->>'phone') = ph;
      if sharing = 1 and public._first_name_key(roster.data->>'fullName') is not null
         and public._first_name_key(roster.data->>'fullName') = public._first_name_key(m.name) then
        rid := roster.id;
      end if;
    end if;
  end if;
  return jsonb_build_object('gymId', m.gym_id, 'memberId', m.member_id, 'rosterId', rid,
    'name', split_part(btrim(coalesce(m.name, '')), ' ', 1));
end $$;

revoke all on function public.member_pay_me(text) from public;
grant execute on function public.member_pay_me(text) to anon, authenticated;

notify pgrst, 'reload schema';
