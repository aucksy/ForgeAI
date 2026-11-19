# Machine pass for lenses 3, 4 and 5: what to make, and the exact read-only way

Made by helper T-lens, 19 Nov 2026. Source: the "Machine pass" table in `_work/lens-source.txt`.
All files go under `docs/system-map/_sources/machine/`. One later helper can make them all.
Rules for that helper: catalog reads only, no row of gym data, no write, never a key value in any file.

## What the text asks for

| lens | file | state today |
|---|---|---|
| 3 | `db-security.json` | NOT made |
| 3 | `cve.json` | NOT made |
| 3 | `secrets-hits.txt` | made 19 Nov 2026 (174 hits) |
| 4 | none: the table has no row for lens 4 | - |
| 5 | none: the table has no row for lens 5 | - |

Lens 4 and lens 5 helpers start from the map instead (promises, entities, readers, features): see
`_work/lens-items-make.mjs`. `lens-items-make.mjs 3` and `B-sec` print a WARNING while a lens 3 file is missing.

## 1. db-security.json (lens 3)

What it must hold: the Supabase security advisor, every table with row-level rules on or off, every policy
text, every function marked "security definer" and who may execute it.

How (Supabase tools; all read-only):
1. Advisor: tool `get_advisors` with type `security`. Keep every row as it comes (name, level, detail, the object it names).
2. Tables and row-level rules: tool `execute_sql` with exactly:
   ```sql
   select n.nspname as schema, c.relname as table_name, c.relrowsecurity as rls_on, c.relforcerowsecurity as rls_forced
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r','p') and n.nspname in ('public','storage') order by 1, 2;
   ```
3. Policies: 
   ```sql
   select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
   from pg_policies where schemaname in ('public','storage') order by 1, 2, 3;
   ```
4. Security definer functions and who may run them:
   ```sql
   select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
          p.prosecdef as security_definer, p.proconfig as settings, p.proacl::text as acl
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef order by 2, 3;
   ```
   and the plain list of grants:
   ```sql
   select routine_schema, routine_name, specific_name, grantee, privilege_type
   from information_schema.routine_privileges
   where routine_schema = 'public' and grantee in ('anon','authenticated','public','service_role') order by 2, 4;
   ```
   `acl` empty (null) means the default: everyone (PUBLIC) may execute. Write that as "public (default)".
   `settings` without a `search_path=` entry on a definer function is worth a flag.
5. Views that skip row-level rules:
   ```sql
   select schemaname, viewname, viewowner from pg_views where schemaname = 'public' order by 2;
   ```
These five queries read the catalog only. None names a gym table's rows, so none needs the gym filter.

File shape:
```
{"made_on":"<date>","advisor":[...],"tables":[{"schema","table_name","rls_on","rls_forced","policy_count"}],
 "policies":[...],"definer_functions":[{"schema","name","args","settings","acl","grants":["anon",...]}],"views":[...],
 "flags":[{"row":"<table or function>","why":"<rls off | no policy | definer open to anon | no search_path>"}]}
```
`flags` is computed, not judged: a table with rls_on false; a table with rls_on true and 0 policies; a definer
function that anon or public may execute; a definer function with no search_path setting. Lens helpers cite a row as
`machine:db-security.json#<table or function name>`.
The second database (Cloudflare D1, `deploy/panel/migrations`, `deploy/hq`) has no catalog read here: write
`"d1":"not read: no read-only tool; lens 3 reads its SQL files instead"`.

## 2. cve.json (lens 3)

What it must hold: the open alerts for known-vulnerable packages.
Finding on 19 Nov 2026: no workflow under `.github/workflows` runs `npm audit` or any dependency check, and the
repo has no Dependabot settings file. So "the last CI audit step" does not exist. That gap is itself a lens 3
finding (item L3.11) for the lens helper to write.

How, in this order:
1. GitHub Dependabot alerts (read): `GET https://api.github.com/repos/aucksy/ForgeAI/dependabot/alerts?state=open&per_page=100`
   with the stored token (note `no-gh-cli-use-the-stored-token`). Follow the `Link: next` header. Keep per alert:
   number, package name, ecosystem, manifest path, severity, GHSA id, CVE id, vulnerable range, first patched version.
   Never write the token. A 403 or 404 that says alerts are disabled: write `"dependabot":"disabled"` and go to step 2.
2. Fallback for npm (seconds, no install, no build): from the repo root
   `npm audit --package-lock-only --json` (reads `package-lock.json` only; it is the one lock file in the repo).
   Keep per advisory: package, severity, range, the path that pulls it in, fix available.
3. Gradle (`apps/mobile/android/build.gradle`, the app and wear modules, `apps/mobile/modules/*/android`): there is
   no lock file. Search those files for `implementation`, `api` and `classpath` lines and list name + version.
   Check each against `https://api.osv.dev/v1/query` (package names and versions only; nothing about the project).
   If that cannot be done in the time: write `"gradle":"could-not-check: no lock file, list only"` with the list.

File shape: `{"made_on","source":"dependabot | npm-audit | osv","alerts":[{"id","package","ecosystem","manifest","severity","advisory","range","fixed_in"}],"gradle":[...]}`.
Lens helpers cite `machine:cve.json#<id>`.

## 3. secrets-hits.txt (lens 3): MADE

How it was made (repeatable, from the repo root; writes file:line and the pattern NAME only):
```
for each pattern:  git grep -n -I -E -e '<pattern>' -- . ':!docs/system-map' | cut -d: -f1,2
```
Patterns: `(^|[^A-Za-z0-9_-])sk-[A-Za-z0-9_-]{16,}` | `AIza[0-9A-Za-z_-]{20,}` | `eyJ[A-Za-z0-9_-]{10,}` |
`service_role` | `BEGIN [A-Z ]*PRIVATE KEY`.
Result: 174 hits: service_role 163 (mostly the role name in SQL and tests), sk- 7 (all in `deploy/panel/*.test.mjs`),
AIza 3 (two `google-services.json` files, one test), eyJ 1 (`package-lock.json`), private key 0.
Limits, so the gap stays visible:
- Only git-tracked text files of the current commit. Not searched: git history, the built APK, GitHub Actions
  secrets and logs, the Cloudflare and Supabase dashboards. Items L3.5 and L3.6 ("in the public repo", "in the APK")
  need: a history search (`git log -p -S` per pattern, file:line and commit only) and a string search of the newest
  release APK from a CI artifact. Both are cloud or seconds-long reads; neither is done.
- `docs/OWNER-INBOX.md` and `docs/CLAUDE-NOTES.md` were pattern-matched by the search but never opened or printed.
- A hit is a place to look. Whether the AIza keys are restricted, and whether an AI key ships inside the app with no
  spend cap, is for the lens 3 helper of `phone/native` and `phone/cloud-backup-ai` to judge from the code.

## Coordinator: to decide
- Lens 4 and lens 5 have no machine file in the text. Two cheap ones would help and are catalog-only:
  (a) lens 4: the list of columns whose name looks personal (phone, email, dob, birth, name, address, photo, weight,
  heart) per table, from `information_schema.columns`, to catch personal data no entity row names;
  (b) lens 5: nothing from the database; the money features list in each items file is enough.
  They are NOT made and NOT in the text: say yes or no.
