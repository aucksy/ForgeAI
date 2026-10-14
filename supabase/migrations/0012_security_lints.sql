-- 0012: Supabase security advisor clean-up (15 Oct 2026, audit toolkit pick 6).
-- The advisor flagged functions anyone can call without signing in, and functions whose search
-- path a caller could change. Almost all the callable ones are on purpose: every owner_*,
-- member_*, staff_*, crm_* function checks a key first, and demo_start_gym / gym_create_online /
-- gym_preview are the public front doors. These were NOT meant to be callable by anon:
--   _photo_ticket_ok       an internal helper (0004)
--   create_gym, join_gym_by_code, delete_my_cloud_data
--                          the 0001 sign-in-account design, for signed-in users only
--   guard_summary_version  a trigger function
-- None could leak or change data for anon (they need auth.uid(), or only answer yes/no), but the
-- rule is: nothing callable that is not meant to be.
-- auth_gym_id() / auth_role() stay: RLS policies call them for every role (null for anon).
-- Apply after 0011. Re-runnable.

revoke all on function public._photo_ticket_ok(text)     from public, anon, authenticated;
revoke all on function public.guard_summary_version()     from public, anon, authenticated;
revoke all on function public.create_gym(text)            from public, anon;
revoke all on function public.join_gym_by_code(text)      from public, anon;
revoke all on function public.delete_my_cloud_data()      from public, anon;
grant execute on function public.create_gym(text)         to authenticated;
grant execute on function public.join_gym_by_code(text)   to authenticated;
grant execute on function public.delete_my_cloud_data()   to authenticated;

-- A fixed search path on every function the advisor named, so none can be pointed at a
-- look-alike table or function by a caller's own search_path.
alter function public.guard_summary_version()                set search_path = public;
alter function public._option_stock_sum(jsonb)               set search_path = public;
alter function public._photo_url_ok(text)                    set search_path = public;
alter function public._brand_hex(text)                       set search_path = public;
alter function public._brand_json(public.gyms)               set search_path = public;
alter function public._logo_url_ok(text)                     set search_path = public;
alter function public._message_json(public.gym_messages)     set search_path = public;
