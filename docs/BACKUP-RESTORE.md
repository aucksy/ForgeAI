# Nightly backup and restore drill

Written 3 Nov 2026 (launch audit: ops #1, owner #1). **Owner said yes 4 Nov 2026; store made and wired; live once 0052 is applied and HQ deployed.** Switching it on needed the owner's yes
(it changes the live gym server and deploys HQ).

## What it does
Every night at 03:00 India time, HQ's existing Cron Trigger takes one copy of all gym data and keeps it for 7 days (the privacy page and gym agreement promise backups expire within 7 days).

| Part | What | Cost |
|---|---|---|
| The read | One call to `hq_backup_snapshot()` (migration 0052) with the HQ key HQ already holds. Every public table, read in one go, so the copy is consistent. Sign-in accounts too, **without** password hashes or tokens. | Free, no new secret |
| The store | Cloudflare KV, binding `BACKUP`, keys `snap/<India day>/part/<n>` + `snap/<day>/meta`. Stored byte for byte. Every key expires after 7 days, so KV deletes old copies by itself. | Free plan: 1 GB, 1,000 writes a day. A copy uses a handful of writes. |
| The alarm | `https://hq.mettleup.fit/backup/status` says only fresh / not fresh. The watch workflow reads it and opens a GitHub issue ("Outage: Nightly backup") when last night failed or the newest copy is over 30 hours old. | Free |
| The proof | CI's database job runs `scripts/backup/ci_drill.sh` on every push: copy, wipe everything, restore, and every table must match row for row. | Free |

Code: `deploy/hq/backup.js` (+ `backup.test.mjs`), `supabase/migrations/0052_hq_backup.sql` (+ `supabase/tests/0052_hq_backup.sql`),
`scripts/backup/restore.mjs`, `scripts/backup/ci_drill.sh`.

**Not in the copy:** files in Supabase Storage (gym logos, member photos taken at the desk, workout report files).
Logos can be uploaded again; desk photos and report files would be lost if the whole project were lost. Copying
them needs a second step (Storage list + download per file), which the free plan's 50 calls per run cannot do in one
night for a big gym. Left out on purpose for now; revisit when Supabase Pro (which keeps its own daily backups) is decided.

**Limits:** a copy over about 100 MB would not fit in the Worker's memory (one gym is far below that). The read runs
inside one database statement; if the database's statement time limit for the HQ key ever stops it, the night fails
and the alarm says so.

## Switching it on (owner's yes; about 10 minutes, all free)
1. **Make the store.** From `deploy/hq` (never `apps/dashboard`): `npx wrangler kv namespace create forgeai-backups`.
   It prints an `id`. Give it to Claude (not a secret), or paste it into `deploy/hq/wrangler.jsonc` in place of the
   commented `kv_namespaces` line: `"kv_namespaces": [{ "binding": "BACKUP", "id": "<the id>" }],`
2. **Add the read to the gym server.** Supabase -> SQL Editor -> paste `supabase/migrations/0052_hq_backup.sql` -> Run.
   It only adds one function; nothing existing changes.
3. **Deploy HQ.** From `deploy/hq`: `npx wrangler deploy`. Note: this also deploys any other HQ change waiting on `main`.
4. The next morning: `https://hq.mettleup.fit/backup/status` shows `"fresh":true,"lastRunOk":true`.

## Restore drill on staging (do once after switching on, then once mid-pilot)
Uses the staging project "mettleup-staging" (made 29 Oct 2026, launch plan A2). It must have **every migration
applied (0052 too) and no gym data**: if it has test rows, restore into a fresh free project instead, or the restore
stops at the first table that has rows (on purpose).

1. **Pick a copy.** From `deploy/hq`: `npx wrangler kv key list --binding BACKUP --remote --prefix snap/` and pick the
   newest day that has a `meta` key. Read it: `npx wrangler kv key get --binding BACKUP --remote "snap/<day>/meta"`
   (it says how many `parts`).
2. **Download it.** For each part n = 0, 1, ...:
   `npx wrangler kv key get --binding BACKUP --remote "snap/<day>/part/<n>" > part-<n>.json`
   Keep these files private: they hold members' names and phone numbers. Delete them after the drill.
3. **Make the restore file.** From the repo root: `node scripts/backup/restore.mjs part-0.json [part-1.json ...] -o restore.sql`.
   It prints the tables and row counts in the copy. Write them down.
4. **Restore into STAGING, never live.** Supabase (staging) -> Connect -> copy the "Session pooler" connection string, then
   `psql "<staging connection string>" -v ON_ERROR_STOP=1 -f restore.sql`.
   It ends with `RESTORE OK: <n> tables, <rows> rows, <accounts> sign-in accounts`. If any table already has rows,
   or any count differs, it stops and keeps nothing.
5. **Check the gym's totals** on staging against what the live admin app showed that morning: number of members,
   this month's money collected, today's check-ins, open dues. Write the result and the date in PROGRESS.md.
6. Delete `part-*.json` and `restore.sql`.

## Restoring for real (the live project is lost or corrupted)
Same steps, into a NEW Supabase project with every migration applied (never over the damaged one: the restore refuses
a non-empty database on purpose). Then point the apps at the new project (app config, Worker `SUPABASE_URL` vars and
keys). Email-and-password accounts need "Forgot password"; Google sign-ins work as before. Everything after the copy's
time is lost: at most one day.
