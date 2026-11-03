#!/usr/bin/env bash
# The backup restore drill, in CI on every push (launch audit 3 Nov 2026, ops #1). Runs in the "database" job
# on the throw-away local Supabase that already has every migration applied. The full round trip:
#   1. some rows: two demo gyms (gym, owner key, shop) and one Google-style sign-in account;
#   2. a fingerprint of every public table and the sign-in accounts;
#   3. tonight's copy, exactly the way the HQ Worker takes it (hq_backup_snapshot, migration 0052);
#   4. WIPE everything (every public table, every sign-in account);
#   5. the restore file from scripts/backup/restore.mjs, run with psql;
#   6. the fingerprint again: it must be identical, table by table.
# A restore drill with REAL data, on the staging project, is docs/BACKUP-RESTORE.md.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
WORK="$(mktemp -d)"
q() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

q <<'SQL'
select public.demo_start_gym('Drill Gym A');
select public.demo_start_gym('Drill Gym B');
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data)
  values ('0d000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'drill@example.com', '', now(), now(), '{"provider":"google","providers":["google"]}');
insert into auth.identities(id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values (gen_random_uuid(), '0d000000-0000-4000-8000-000000000001', 'google', 'drill-google-1',
          '{"sub":"drill-google-1","email":"drill@example.com"}', now(), now());
SQL

FINGERPRINT=$(cat <<'SQL'
create or replace function pg_temp.fp() returns table(name text, n bigint, sum text) language plpgsql as $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
            where s.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition order by 1 loop
    return query execute format(
      'select %L::text, count(*), md5(coalesce(string_agg(to_jsonb(x)::text, chr(10) order by to_jsonb(x)::text), '''')) from public.%I x',
      t.relname, t.relname);
  end loop;
  return query select 'auth.users'::text, count(*), md5(coalesce(string_agg(id::text || email, ',' order by id), '')) from auth.users;
  return query select 'auth.identities'::text, count(*), md5(coalesce(string_agg(user_id::text || provider || provider_id, ',' order by provider_id), '')) from auth.identities;
end $$;
select * from pg_temp.fp();
SQL
)

echo "$FINGERPRINT" | q -At > "$WORK/before.txt"
q -At -c 'select public.hq_backup_snapshot()' > "$WORK/copy.json"
echo "copy: $(wc -c < "$WORK/copy.json") bytes; tables with rows: $(grep -c '|[1-9]' "$WORK/before.txt")"

# Wipe: every public table and every sign-in account (triggers and foreign keys paused for this session).
q <<'SQL'
begin;
set local session_replication_role = replica;
do $$
declare l text;
begin
  select string_agg(format('public.%I', c.relname), ', ') into l from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition;
  execute 'truncate table ' || l;
end $$;
delete from auth.identities;
delete from auth.users;
commit;
SQL
if [ "$(q -At -c 'select count(*) from public.gyms')" != "0" ]; then echo "FAIL: the wipe did not wipe"; exit 1; fi

node scripts/backup/restore.mjs "$WORK/copy.json" -o "$WORK/restore.sql"
q -f "$WORK/restore.sql"
echo "$FINGERPRINT" | q -At > "$WORK/after.txt"

if diff -u "$WORK/before.txt" "$WORK/after.txt"; then
  echo "RESULT PASS: every table and sign-in account came back identical ($(wc -l < "$WORK/before.txt") checked)"
else
  echo "RESULT FAIL: the restore did not bring back the same rows (diff above)"
  exit 1
fi

# A second restore into the now-full database must refuse and change nothing.
if q -f "$WORK/restore.sql" 2> "$WORK/again.txt"; then echo "FAIL: a restore over live rows was allowed"; exit 1; fi
grep -q 'already has rows' "$WORK/again.txt" || { cat "$WORK/again.txt"; echo "FAIL: wrong refusal"; exit 1; }
echo "$FINGERPRINT" | q -At > "$WORK/again-fp.txt"
diff -q "$WORK/before.txt" "$WORK/again-fp.txt" > /dev/null || { echo "FAIL: the refused restore changed rows"; exit 1; }
echo "ok: a restore over live rows is refused and changes nothing"
