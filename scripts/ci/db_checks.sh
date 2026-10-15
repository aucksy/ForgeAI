#!/usr/bin/env bash
# Database safety check (15 Oct 2026, audit toolkit pick 6). CI starts a throw-away local Supabase,
# which applies every file in supabase/migrations in order. Then each supabase/tests/*.sql must end
# with "RESULT PASS". A test that ends any other way fails the build and its message is printed.
set -u
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
fail=0
for f in supabase/tests/*.sql; do
  out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1)
  line=$(printf '%s\n' "$out" | grep -o 'RESULT [A-Z]*.*' | head -1)
  if printf '%s' "$line" | grep -q '^RESULT PASS'; then
    echo "ok    $f: $line"
  else
    echo "FAIL  $f:"; printf '%s\n' "$out" | tail -20; fail=1
  fi
done
exit $fail
