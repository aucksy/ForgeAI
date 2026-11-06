-- NOT APPLIED. Needs the owner's yes (a live server change). Re-runnable. Apply after 0048 (it uses 0048's
-- gym_staff_pins.lock_streak) and after 0034 (it replaces 0034's
-- gym_create_online; RE-RUNNING 0034 puts back its own version, so always re-run 0061 after it).
-- Test: supabase/tests/0061_phone_codes.sql (CI runs it after every migration; pasted into the SQL Editor it
-- always ends in an error and so changes nothing).
--
-- 0061: a 6-digit code by WhatsApp proves a person holds a mobile number (F187, R-383, 6 Nov 2026).
-- The code is made, sent, limited and checked by the panel Worker (deploy/panel/phoneCode.js, D1 0012). A right
-- code gives the app a short PROOF; THIS server checks the proof itself, so the app can never just say
-- "verified":   v1.<purpose>.<10-digit mobile>.<expires, unix seconds>.<nonce, 32 hex>.<hmac, 64 hex>
-- hmac = HMAC-SHA256(secret, the first five parts joined by "."), the secret being the Worker's secret
-- PHONE_CODE_SECRET, kept here in phone_code_settings (one row, set live, never in git). A proof lives at most
-- 20 minutes (the Worker gives 15) and is used once (phone_proofs_used).
--
-- NEW
--   phone_code_settings  one row: secret, signup_check_required (false = "Create my gym" works without a
--                        code, exactly as before; true = every new gym needs a checked number).
--                        Until the row exists every proof is refused and the account check says NOT_READY.
--   phone_proofs_used    the nonce of every proof used (one use).
--   trial_phones         numbers that already started a free trial with a checked number.
--   phone_code_has_account(phone, at, sig) -> boolean   the Worker's "send a Forgot-PIN code to this
--       number?" Only the Worker can ask: sig = HMAC(secret, "exists.<phone>.<at>"), at within 5 minutes,
--       else BAD_SIG. The Worker answers every caller the same either way (nobody learns who has an account).
--   staff_reset_pin_with_proof(proof, pin) -> {ok, people} | {error: BAD_PROOF | BAD_PIN | WEAK_PIN | NO_PERSON}
--       Forgot PIN: a 'pin' proof sets this PIN for every person (owner or desk, any gym) with that number,
--       clears their wrong tries and locks (0048's lock_streak too). The PIN rules are 0034's (_pin_problem); a refused PIN does not use
--       up the proof. The app then signs in with the number and the new PIN (staff_sign_in, unchanged).
-- CHANGED
--   gym_create_online gains p_phone_proof (default null). With a 'signup' proof for the same number: the gym's
--   free trial is given only if this number never had one (trial_phones) and is not already a gym owner;
--   otherwise the trial ends at once (0030: nothing locks; the owner sees "trial ended"). Without a proof:
--   as before, unless signup_check_required is on (then PHONE_CHECK). Answer adds freeTrial, phoneChecked.
--   An older admin app that sends no proof makes a gym exactly as before while the switch is off.
-- SWITCHING ON (docs/WHATSAPP-SETUP.md): insert the settings row with the same secret as the Worker's
-- PHONE_CODE_SECRET; later, when sign-ups by WhatsApp work, set signup_check_required = true.
-- NOTE: the device QA runs make gyms with gym_create_online and no code; with the switch on they would get
-- PHONE_CHECK.

set lock_timeout = '3s';

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ tables (RLS on, no grants)
create table if not exists public.phone_code_settings (
  id                    boolean primary key default true check (id),
  secret                text not null check (length(secret) >= 32),
  signup_check_required boolean not null default false,
  updated_at            timestamptz not null default now()
);
alter table public.phone_code_settings enable row level security;
revoke all on public.phone_code_settings from anon, authenticated;

create table if not exists public.phone_proofs_used (
  nonce   text primary key,
  purpose text not null,
  used_at timestamptz not null default now()
);
alter table public.phone_proofs_used enable row level security;
revoke all on public.phone_proofs_used from anon, authenticated;

create table if not exists public.trial_phones (
  phone  text primary key,
  gym_id uuid references public.gyms(gym_id) on delete set null,
  at     timestamptz not null default now()
);
alter table public.trial_phones enable row level security;
revoke all on public.trial_phones from anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
-- Is p_sig the HMAC of p_msg with the secret? Compared as digests, so the time taken says nothing.
create or replace function public._phone_sig_ok(p_msg text, p_sig text) returns boolean
  language plpgsql stable security definer set search_path = public, extensions as $$
declare k text;
begin
  select secret into k from public.phone_code_settings where id;
  if k is null or p_msg is null or p_sig is null or p_sig !~ '^[0-9a-f]{64}$' then return false; end if;
  return digest(encode(hmac(p_msg, k, 'sha256'), 'hex'), 'sha256') = digest(p_sig, 'sha256');
end $$;

-- The number a proof is for, or null (bad, other purpose, expired, too long-lived, or used). p_use: use it up.
create or replace function public._phone_proof(p_proof text, p_purpose text, p_use boolean) returns text
  language plpgsql volatile security definer set search_path = public, extensions as $$
declare parts text[] := string_to_array(coalesce(p_proof, ''), '.'); v_exp bigint;
  now_s bigint := extract(epoch from now())::bigint;
begin
  if coalesce(array_length(parts, 1), 0) <> 6 or parts[1] <> 'v1' or parts[2] is distinct from p_purpose
     or parts[3] !~ '^[6-9][0-9]{9}$' or parts[4] !~ '^[0-9]{10}$' or parts[5] !~ '^[0-9a-f]{32}$' then
    return null;
  end if;
  v_exp := parts[4]::bigint;
  if v_exp <= now_s or v_exp > now_s + 1200 then return null; end if;
  if not public._phone_sig_ok(array_to_string(parts[1:5], '.'), parts[6]) then return null; end if;
  if exists (select 1 from public.phone_proofs_used where nonce = parts[5]) then return null; end if;
  if p_use then
    insert into public.phone_proofs_used(nonce, purpose) values (parts[5], p_purpose) on conflict (nonce) do nothing;
    if not found then return null; end if;
  end if;
  return parts[3];
end $$;

-- ------------------------------------------------------------------ the Worker's account check
create or replace function public.phone_code_has_account(p_phone text, p_at bigint, p_sig text) returns boolean
  language plpgsql stable security definer set search_path = public, extensions as $$
declare ph text := public._norm_phone(p_phone); now_s bigint := extract(epoch from now())::bigint;
begin
  if not exists (select 1 from public.phone_code_settings where id) then raise exception 'NOT_READY'; end if;
  if ph is null or p_at is null or abs(now_s - p_at) > 300
     or not public._phone_sig_ok('exists.' || ph || '.' || p_at, p_sig) then
    raise exception 'BAD_SIG';
  end if;
  return exists (select 1 from public.gym_staff s where s.phone = ph and s.removed_at is null);
end $$;

-- ------------------------------------------------------------------ Forgot PIN
create or replace function public.staff_reset_pin_with_proof(p_proof text, p_pin text)
  returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare ph text; bad text; h text; n int; at_ timestamptz := now();
begin
  ph := public._phone_proof(p_proof, 'pin', false);
  if ph is null then return jsonb_build_object('error', 'BAD_PROOF'); end if;
  perform pg_advisory_xact_lock(hashtext('signin:' || ph));
  bad := public._pin_problem(p_pin, ph);
  if bad is not null then return jsonb_build_object('error', bad); end if;
  if not exists (select 1 from public.gym_staff s where s.phone = ph and s.removed_at is null) then
    return jsonb_build_object('error', 'NO_PERSON');
  end if;
  if public._phone_proof(p_proof, 'pin', true) is null then return jsonb_build_object('error', 'BAD_PROOF'); end if;
  h := crypt(p_pin, gen_salt('bf', 10));
  insert into public.gym_staff_pins(staff_id, pin_hash, set_at)
    select s.staff_id, h, at_ from public.gym_staff s where s.phone = ph and s.removed_at is null
  on conflict (staff_id) do update
    set pin_hash = excluded.pin_hash, set_at = excluded.set_at, wrong_tries = 0, locked_until = null, lock_streak = 0;
  get diagnostics n = row_count;
  delete from public.gym_signin_fails where phone = ph;
  return jsonb_build_object('ok', true, 'people', n);
end $$;

-- ------------------------------------------------------------------ Create my gym (0034, plus the number check)
drop function if exists public.gym_create_online(text, text, text, text, text, text);
create or replace function public.gym_create_online(p_gym_name text, p_name text, p_phone text, p_device text default null,
                                                    p_terms_version text default null, p_pin text default null,
                                                    p_phone_proof text default null)
  returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare g public.gyms; st public.gym_staff; ph text := public._norm_phone(p_phone); n int; v_ip text := public._caller_ip();
  tv text := case when nullif(btrim(coalesce(p_terms_version, '')), '') is null then null else public._terms_version(p_terms_version) end;
  pin text := nullif(btrim(coalesce(p_pin, '')), ''); bad text;
  proof text := nullif(btrim(coalesce(p_phone_proof, '')), ''); checked text; required boolean; free_trial boolean := true;
begin
  if ph is null then raise exception 'BAD_PHONE'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 or length(btrim(coalesce(p_gym_name, ''))) = 0 then raise exception 'EMPTY'; end if;
  if pin is not null then
    bad := public._pin_problem(pin, ph);
    if bad is not null then raise exception '%', bad; end if;
  end if;
  -- 0061: the number check. A proof must be a fresh 'signup' proof for THIS number.
  select s.signup_check_required into required from public.phone_code_settings s where s.id;
  if proof is not null then
    checked := public._phone_proof(proof, 'signup', true);
    if checked is null or checked <> ph then raise exception 'PHONE_CHECK'; end if;
  elsif coalesce(required, false) then
    raise exception 'PHONE_CHECK';
  end if;
  if v_ip <> '' then
    select count(*) into n from public.gym_creator_ips where ip = v_ip and created_at > now() - interval '1 hour';
    if n >= 5 then raise exception 'BUSY'; end if;
  end if;
  select count(*) into n from public.gyms where created_at > now() - interval '1 hour';
  if n >= 1000 then raise exception 'BUSY'; end if;
  -- 0061: one free trial per checked number (also none for a number that already owns a gym).
  if checked is not null then
    free_trial := not exists (select 1 from public.trial_phones t where t.phone = ph)
              and not exists (select 1 from public.gym_staff s where s.phone = ph and s.role = 'owner');
  end if;
  insert into public.gyms(name, join_code, creator_ip, trial_ends_at)
    values (left(btrim(p_gym_name), 60), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), nullif(v_ip, ''),
            case when free_trial then now() + interval '3 months' else now() end)
    returning * into g;
  if checked is not null then
    insert into public.trial_phones(phone, gym_id) values (ph, g.gym_id) on conflict (phone) do nothing;
  end if;
  insert into public.gym_staff(gym_id, name, phone, role)
    values (g.gym_id, left(btrim(p_name), 60), ph, 'owner') returning * into st;
  if tv is not null then perform public._record_terms(g.gym_id, st, tv, 'create'); end if;
  if pin is not null then
    insert into public.gym_staff_pins(staff_id, pin_hash) values (st.staff_id, crypt(pin, gen_salt('bf', 10)));
  end if;
  return public._signed_in_json(st, public._new_session(st.staff_id, p_device))
         || jsonb_build_object('termsVersion', tv, 'hasPin', pin is not null,
                               'freeTrial', free_trial, 'phoneChecked', checked is not null);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._phone_sig_ok(text, text)                    from public, anon, authenticated;
revoke all on function public._phone_proof(text, text, boolean)            from public, anon, authenticated;
revoke all on function public.phone_code_has_account(text, bigint, text)   from public;
revoke all on function public.staff_reset_pin_with_proof(text, text)       from public;
revoke all on function public.gym_create_online(text, text, text, text, text, text, text) from public;

grant execute on function public.phone_code_has_account(text, bigint, text) to anon, authenticated;
grant execute on function public.staff_reset_pin_with_proof(text, text)     to anon, authenticated;
grant execute on function public.gym_create_online(text, text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
