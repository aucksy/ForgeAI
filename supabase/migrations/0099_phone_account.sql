-- NOT APPLIED LIVE YET (needs the owner's yes). Re-runnable. Apply after 0061 (_phone_proof, phone_code_settings)
-- and 0032 (member_items). Additive: one new function, callable only by the server (service_role). No new table or
-- column, no change to any existing function.
-- Test: supabase/tests/0099_phone_account.sql (CI runs it after every migration; pasted into the SQL Editor it always
-- ends in an error and so changes nothing).
-- Undo: drop function public.phone_account_pick(text, text);
--
-- 0099: F237 "Phone number sign-in also backs up workouts" (owner, 25 Nov 2026, R-627: "This has to go now, today").
-- In 0.79.0 the phone number is the main sign-in, but only a Google sign-in made a MettleUp account, so a member who
-- signed in by phone had no server copy of their workouts. Now the proven number IS the account:
--
--   app -> Edge Function "phone-account" (proof, first name)
--       -> phone_account_pick(proof, first name)   [this file: which account this number signs in to]
--       -> auth admin: make the account when it is new; a one-time sign-in link (never e-mailed)
--   app <- token_hash -> supabase.auth.verifyOtp(magiclink) -> signed in; the copy (0032) works as for Google.
--
-- The account's e-mail is made up: m-<code>@phone.mettleup.fit. <code> = HMAC of the number with the server's own
-- phone secret (0061 phone_code_settings), so the number itself is never stored in the account, and nobody without the
-- secret can turn a number into its account. The first name is kept only as a 16-character HMAC (name_key).
--
-- RECYCLED NUMBERS (owner's pick A, 25 Nov 2026): Indian numbers are given to a new person after the old holder stops
-- using them (about 90 days). So an account not used for 90 days (no sign-in, no copy saved) is reopened by the number
-- ONLY when the first name typed now is the same as the one used before. Otherwise this number gets a NEW, empty
-- account (m-<code>-<n>@...) and the old one stays locked: the new holder never sees the old holder's workouts.
--
--   phone_account_pick(proof, first name) -> {ok, email, create, name_key, fresh}
--                                            | {error: BAD_PROOF | NO_NAME | NO_SECRET}
--     create: the Edge Function must make this account (it does not exist yet).
--     fresh:  no earlier account of this number was reopened (a first sign-in, or a locked old one).
--   The proof is only LOOKED at (not used up), like 0093: the same proof still joins the gym afterwards.

create or replace function public.phone_account_pick(p_proof text, p_name text) returns jsonb
  language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  ph text; k text; code text; nk text; first text;
  u record; used_at timestamptz; gen int;
begin
  ph := public._phone_proof(p_proof, 'member', false);
  if ph is null then return jsonb_build_object('error', 'BAD_PROOF'); end if;
  first := lower(split_part(btrim(coalesce(p_name, '')), ' ', 1));
  if first = '' then return jsonb_build_object('error', 'NO_NAME'); end if;
  select secret into k from public.phone_code_settings where id;
  if k is null then return jsonb_build_object('error', 'NO_SECRET'); end if;

  code := substr(encode(hmac('account:' || ph, k, 'sha256'), 'hex'), 1, 40);
  nk := substr(encode(hmac('name:' || first, k, 'sha256'), 'hex'), 1, 16);

  -- The newest account of this number (m-<code>@ or m-<code>-<n>@).
  select au.id, au.email, au.created_at, au.last_sign_in_at, au.raw_app_meta_data into u
    from auth.users au
   where au.email = 'm-' || code || '@phone.mettleup.fit'
      or au.email ~ ('^m-' || code || '-[0-9]+@phone\.mettleup\.fit$')
   order by au.created_at desc
   limit 1;

  if u.id is null then
    return jsonb_build_object('ok', true, 'email', 'm-' || code || '@phone.mettleup.fit', 'create', true,
                              'name_key', nk, 'fresh', true);
  end if;

  select greatest(u.created_at, u.last_sign_in_at, (select max(mi.saved_at) from public.member_items mi where mi.member_id = u.id))
    into used_at;
  if used_at > now() - interval '90 days' or coalesce(u.raw_app_meta_data->>'name_key', '') = nk then
    return jsonb_build_object('ok', true, 'email', u.email, 'create', false, 'name_key', nk, 'fresh', false);
  end if;

  -- Unused for 90 days and another first name: a new account for this number; the old one stays locked.
  gen := coalesce(nullif(substring(u.email from '^m-[0-9a-f]+-([0-9]+)@'), '')::int, 0) + 1;
  return jsonb_build_object('ok', true, 'email', 'm-' || code || '-' || gen || '@phone.mettleup.fit', 'create', true,
                            'name_key', nk, 'fresh', true);
end $$;

revoke all on function public.phone_account_pick(text, text) from public, anon, authenticated;
grant execute on function public.phone_account_pick(text, text) to service_role;
