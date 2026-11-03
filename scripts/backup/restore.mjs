// Turn one nightly backup copy into a SQL file that puts it back (launch audit 3 Nov 2026, ops #1).
// The copy comes from Cloudflare KV (deploy/hq/backup.js): one or more parts, joined in order.
//
//   node scripts/backup/restore.mjs part-0 [part-1 ...] -o restore.sql
//   psql "<STAGING connection string>" -v ON_ERROR_STOP=1 -f restore.sql
//
// The SQL never reads anything from this script's own understanding of the rows: the copy goes into the
// database as ONE jsonb value, byte for byte, and the database splits it (so no number, date or text is
// changed by a JavaScript round trip). Then, in ONE transaction:
//   - foreign keys and triggers are paused for this session only (session_replication_role = replica, the
//     way Supabase's own restore guide does it), so tables can go in any order and the append-only audit
//     log accepts its old rows;
//   - every table must be EMPTY first (a restore never mixes with live rows; it stops otherwise);
//   - sign-in accounts first (auth.users, auth.identities), then every public table in the copy;
//   - counters (identity columns) are moved past the restored rows;
//   - each table's restored row count must equal the count stored in the copy, or NOTHING is kept.
// The target must have the same migrations applied as the database the copy came from.
// Full drill: docs/BACKUP-RESTORE.md. CI proves the round trip on every push: scripts/backup/ci_drill.sh.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const FORMAT = 'mettleup-backup-1';

/** Join the parts' bytes and check it is one MettleUp copy. -> { text, snap } or throws with plain words. */
export function readCopy(buffers) {
  const text = Buffer.concat(buffers).toString('utf8');
  let snap;
  try {
    snap = JSON.parse(text);
  } catch {
    throw new Error('This is not a whole backup copy (it does not read as JSON). Are all parts there, in order?');
  }
  if (snap?.format !== FORMAT) throw new Error(`Not a MettleUp backup copy (format is ${JSON.stringify(snap?.format)}).`);
  if (!snap.tables || typeof snap.tables !== 'object' || !snap.counts) throw new Error('The copy has no tables.');
  for (const [t, rows] of Object.entries(snap.tables)) {
    if (!Array.isArray(rows) || rows.length !== snap.counts[t]) throw new Error(`Table ${t}: ${rows?.length} rows but the copy says ${snap.counts[t]}.`);
  }
  return { text, snap };
}

/** A dollar-quote tag that does not occur in the text. */
export function quoteTag(text, rand = () => randomBytes(6).toString('hex')) {
  for (;;) {
    const tag = `$mu${rand()}$`;
    if (!text.includes(tag)) return tag;
  }
}

/** One line per table, for the person running the restore. PURE. */
export function summary(snap) {
  const rows = Object.values(snap.counts).reduce((a, b) => a + Number(b), 0);
  return [
    `Copy taken ${snap.takenAt}: ${Object.keys(snap.tables).length} tables, ${rows} rows, ${snap.authUsers?.length ?? 0} sign-in accounts.`,
    ...Object.entries(snap.counts).filter(([, n]) => n > 0).map(([t, n]) => `  ${t}: ${n}`),
  ].join('\n');
}

/** The restore SQL. `text` is the copy exactly as stored. PURE (given the tag). */
export function restoreSql(text, tag = quoteTag(text)) {
  return `-- MettleUp backup restore (scripts/backup/restore.mjs). Run on an EMPTY database with every migration applied:
--   psql "<connection string>" -v ON_ERROR_STOP=1 -f <this file>
-- One transaction: it either restores everything and every count matches, or keeps nothing.
begin;
set local session_replication_role = replica;

create temp table mu_copy(j jsonb) on commit drop;
insert into mu_copy values (${tag}${text}${tag}::jsonb);

-- Put one table's rows back. The table must exist here and be empty. -> rows written.
create or replace function pg_temp.mu_put(p_schema text, p_table text, p_rows jsonb) returns int
  language plpgsql as $$
declare cols text; n int; has boolean; c record; seq text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = p_schema and table_name = p_table and is_generated = 'NEVER';
  if cols is null then raise exception 'RESTORE: table %.% is not on this database (apply every migration first)', p_schema, p_table; end if;
  execute format('select exists (select 1 from %I.%I)', p_schema, p_table) into has;
  if has then raise exception 'RESTORE: %.% already has rows; restore only into an empty database', p_schema, p_table; end if;
  if p_rows is null or jsonb_array_length(p_rows) = 0 then return 0; end if;
  execute format('insert into %I.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::%I.%I, $1)',
                 p_schema, p_table, cols, cols, p_schema, p_table) using p_rows;
  get diagnostics n = row_count;
  -- Counters past the restored rows, so the next new row does not collide.
  for c in select column_name from information_schema.columns
            where table_schema = p_schema and table_name = p_table
              and (is_identity = 'YES' or column_default like 'nextval(%') loop
    seq := pg_get_serial_sequence(format('%I.%I', p_schema, p_table), c.column_name);
    if seq is not null then
      execute format('select setval(%L, coalesce(max(%I)::bigint, 1), max(%I) is not null) from %I.%I',
                     seq, c.column_name, c.column_name, p_schema, p_table);
    end if;
  end loop;
  return n;
end $$;

do $$
declare
  s jsonb;
  t text;
  n int;
  bad text := '';
  total bigint := 0;
  col text;
begin
  select j into s from mu_copy;
  if s->>'format' is distinct from '${FORMAT}' then raise exception 'RESTORE: not a MettleUp backup copy'; end if;

  -- 1. Sign-in accounts. Password hashes and one-time tokens were never copied: blank them the way the
  --    sign-in service expects (an empty text, not null), so the account loads; email-and-password accounts
  --    then need "Forgot password".
  n := pg_temp.mu_put('auth', 'users', s->'authUsers');
  if n <> jsonb_array_length(coalesce(s->'authUsers', '[]')) then bad := bad || ' auth.users'; end if;
  foreach col in array array['encrypted_password', 'confirmation_token', 'recovery_token', 'email_change_token_new',
      'email_change_token_current', 'reauthentication_token', 'phone_change_token', 'email_change', 'phone_change'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = col) then
      execute format('update auth.users set %I = '''' where %I is null', col, col);
    end if;
  end loop;
  n := pg_temp.mu_put('auth', 'identities', s->'authIdentities');
  if n <> jsonb_array_length(coalesce(s->'authIdentities', '[]')) then bad := bad || ' auth.identities'; end if;

  -- 2. Every public table in the copy, each count checked against the copy's own count.
  for t in select k from jsonb_object_keys(s->'tables') k order by k loop
    n := pg_temp.mu_put('public', t, s->'tables'->t);
    total := total + n;
    if n <> (s->'counts'->>t)::int then bad := bad || format(' %s: %s of %s', t, n, s->'counts'->>t); end if;
  end loop;

  if bad <> '' then raise exception 'RESTORE FAILED, nothing kept:%', bad; end if;
  raise notice 'RESTORE OK: % tables, % rows, % sign-in accounts (copy taken %)',
    (select count(*) from jsonb_object_keys(s->'tables')), total, jsonb_array_length(coalesce(s->'authUsers', '[]')), s->>'takenAt';
end $$;

commit;
`;
}

function main(argv) {
  const out = argv.indexOf('-o');
  const file = out >= 0 ? argv[out + 1] : null;
  const parts = argv.filter((a, i) => a !== '-o' && i !== out + 1);
  if (!parts.length || !file) {
    console.error('Use: node scripts/backup/restore.mjs <part-0> [part-1 ...] -o restore.sql');
    process.exitCode = 2;
    return;
  }
  const { text, snap } = readCopy(parts.map((p) => readFileSync(p)));
  writeFileSync(file, restoreSql(text));
  console.log(summary(snap));
  console.log(`Wrote ${file}. Next: psql "<STAGING connection string>" -v ON_ERROR_STOP=1 -f ${file}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
