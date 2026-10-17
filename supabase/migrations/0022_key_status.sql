-- 0022: why a device's key stopped working (UAT U-A14, 17 Oct 2026). Re-runnable.
--
-- Every function answers a dead key with the same BAD_KEY, so the panel told a person the owner had
-- REMOVED to "ask your gym owner for a new sign-in code", which can never work for them. With the
-- dead key in hand (only that device has it), the panel asks once which it was and words it:
--   'removed'    the person was removed from the gym;
--   'signed_out' the device was signed out (by itself, by "Sign out everywhere", or a newer sign-in);
--   'live'       the key still works;
--   'unknown'    no such key (or an old owner key).
-- It reads nothing else, changes nothing, and says nothing about any other key.
create or replace function public.staff_key_status(p_key text)
  returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when s.removed_at is not null then 'removed'
                when x.ended_at is not null then 'signed_out'
                else 'live' end
      from public.gym_sessions x join public.gym_staff s on s.staff_id = x.staff_id
     where x.key_hash = public._hash_key(p_key)
     limit 1), 'unknown')
$$;

revoke all on function public.staff_key_status(text) from public;
grant execute on function public.staff_key_status(text) to anon, authenticated;
