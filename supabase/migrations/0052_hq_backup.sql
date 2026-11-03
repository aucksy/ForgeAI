-- NOT APPLIED LIVE YET (written 3 Nov 2026, launch audit ops #1 / owner #1). Needs the owner's yes:
-- SQL Editor -> paste this file -> Run. Additive and re-runnable: one new function, nothing else changes.
--
-- 0052: the nightly backup's one read (hq_backup_snapshot). The HQ Worker (deploy/hq/backup.js) calls it
-- once a night with the HQ key it already holds, and stores the answer, untouched, in Cloudflare KV for 14
-- days. Restore: scripts/backup/restore.mjs turns a stored copy into SQL; the drill is docs/BACKUP-RESTORE.md.
--
-- WHY ONE FUNCTION, not one read per table through the REST door:
--  - one consistent copy: every table is read inside ONE statement, so a payment and its receipt can never
--    land in different copies (a per-table read across 60+ calls could split them);
--  - the free Cloudflare plan allows 50 outside calls per run; there are 60+ tables;
--  - it can also copy the sign-in accounts (auth.users, auth.identities), which the REST door cannot reach.
--
-- WHAT IS IN A COPY (jsonb):
--   format      'mettleup-backup-1'
--   takenAt     when the copy was taken (the database clock)
--   tables      { "<table>": [ rows as jsonb ] } for EVERY ordinary table in schema public, found at run
--               time from the catalogue (a table added by a later migration is in the next copy by itself;
--               no hand-kept list to go stale)
--   counts      { "<table>": number of rows }  (the restore checks it got exactly these back)
--   authUsers, authIdentities   the sign-in accounts, WITHOUT password hashes or one-time tokens (those
--               columns are removed by name). After a restore, a member who signed in with Google signs in
--               again as before; an email-and-password account needs a password reset.
-- NOT in a copy: files in Supabase Storage (gym logos, member photos, report files). See the restore doc.
--
-- WHO MAY CALL IT: service_role only (the HQ key), like every hq_* function (0026). anon and authenticated
-- are refused by the grants and again by _hq_guard; supabase/tests/0026_hq_access.sql checks every hq_*
-- function this way automatically, and supabase/tests/0052_hq_backup.sql checks the copy itself.
-- It writes one hq_audit row (actor 'nightly-backup', the row counts), like the nightly clean-up.
--
-- Undo: drop function public.hq_backup_snapshot().
set lock_timeout = '3s';

create or replace function public.hq_backup_snapshot()
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  t      record;
  rows_j jsonb;
  tabs   jsonb := '{}'::jsonb;
  counts jsonb := '{}'::jsonb;
  users  jsonb;
  idents jsonb;
  -- Secrets of a sign-in account that a backup must never carry (removed by name; a missing one is ignored).
  drop_cols text[] := array['encrypted_password', 'confirmation_token', 'recovery_token', 'email_change_token_new',
    'email_change_token_current', 'reauthentication_token', 'phone_change_token'];
begin
  perform public._hq_guard();
  for t in
    select c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
     order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t.name) into rows_j;
    tabs   := tabs   || jsonb_build_object(t.name, rows_j);
    counts := counts || jsonb_build_object(t.name, jsonb_array_length(rows_j));
  end loop;

  select coalesce(jsonb_agg(to_jsonb(u) - drop_cols), '[]'::jsonb) into users from auth.users u;
  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into idents from auth.identities i;

  insert into public.hq_audit(actor, action, detail)
    values ('nightly-backup', 'backup', jsonb_build_object('tables', (select count(*) from jsonb_object_keys(counts)),
            'rows', (select coalesce(sum(value::bigint), 0) from jsonb_each_text(counts)),
            'authUsers', jsonb_array_length(users)));

  return jsonb_build_object('format', 'mettleup-backup-1', 'takenAt', now(), 'counts', counts,
    'authUsers', users, 'authIdentities', idents, 'tables', tabs);
end $$;

revoke all on function public.hq_backup_snapshot() from public, anon, authenticated;
grant execute on function public.hq_backup_snapshot() to service_role;
