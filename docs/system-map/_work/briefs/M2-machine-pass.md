YOU ARE RUNNING ONE STEP OF THE METTLEUP FULL SYSTEM AUDIT. Everything you need is in this brief. Do NOT open any file
under D:\Brain\Dev-Framework\, docs/OWNER-INBOX.md, docs/CLAUDE-NOTES.md or docs/system-map/AUDIT-STATE.md. Search
inside the folders your brief names, never across docs/. Do only your step.
- ANALYSIS ONLY: change no file outside docs/system-map/. No commit, no push (the coordinator does both).
- Never press a button that sends a WhatsApp, email, SMS or push to a real person.
- Write ONLY the output files your step names, in the exact format shown. JSON files must parse.
- Every row needs EVIDENCE: a file path + line, a CI run id, or a picture path. No evidence = write "unknown",
  never guess. "I think it works" is not evidence.
- Never mark something "covered" or "pass" because a test with a similar name exists. Open the test and check
  that it really checks the expected result written in the journey.
- Finding a problem is the goal. Do not fix anything in this audit unless your step says so. Write it down.
- Cloud only: builds, test suites, crawls run in GitHub Actions. On the laptop: at most one small test file,
  one worker, seconds long. Never leave a Node job running.
- Data. Allowed without asking: (a) rows of the test gym Crispy Curves: every query carries
  gym_id = '<Crispy Curves id, given in this brief>' in its WHERE; (b) the database catalog: table, column,
  policy, function, index and migration lists, table sizes and total row counts per table, the advisors.
  Never: a row, a name, a phone number or a per-gym count of any other gym; SELECT without the gym filter on
  a table that has a gym column; any INSERT, UPDATE, DELETE, or a function that writes.
  If a check needs a second gym, do not run it: write it as "needs a second test gym" in could-not-check.
  Demo data is always fine (note gym-data-only-through-the-support-window).
- No live database change, no deploy, no release, no key or token, no public wording change. Write it down
  as a finding instead.
- Exact code, not notes: when a finding depends on code, read the exact lines (offset/limit under 100 lines), not a
  summary of the file. A summary can hide the one line that is the bug.
- Stop and report when: your items are done; you have used your size limit (see SIZE in this brief); the coordinator
  tells you to stop; or something needs him.
- Report in at most 15 lines, plain English: what you produced (file paths), counts, the top 5 findings,
  what you could not check and why.
- You are one helper on Opus 5.5 at medium effort. Do not start helpers of your own.


THIS HELPER
- Work item: M2-machine-pass. Test gym Crispy Curves id: 7990a942-57f3-4154-bbaf-935bab0aa342.
- Never count, list or read across all gyms, not even totals: no row count of any table, no per-gym number of any other gym. Catalog reads (names, sizes in bytes, advisors, migrations) and Crispy Curves rows only (every gym query has gym_id = '7990a942-57f3-4154-bbaf-935bab0aa342' in its WHERE).
- Never open the audit plan or a planning note. A missing input = write "MISSING: <why>" in that file; never go looking.
- Checkpoint file: docs/system-map/_work/M2-machine-pass.md. Read it first; carry on after the finished files. After EVERY file: add a checkpoint line.
- Ignore the CONTEXT METER hook number. Temp files (downloaded CI files) go in a folder outside the repo; delete them before you report.
- Tools: Supabase tools (get_advisors, execute_sql with SELECT only, list_migrations), the GitHub token in Windows Credential Manager for the GitHub API, a web fetch for public pages. Never a key value in any file.

WORDS
- Machine file: a list a tool makes, read later by the lens helpers. Catalog: the database's own lists of tables, columns, policies, functions, indexes and migrations.

STEP: MAKE SIX MACHINE FILES (all under docs/system-map/_sources/machine/)
1. db-perf.json (lens 7): get_advisors type "performance", every row as it comes; plus indexes per table from pg_indexes (schema public). {advisor:[...], indexes:[...], made:"<date>"}.
2. pagespeed.json (lens 7): Google PageSpeed Insights (mobile) for each PUBLIC page: https://mettleup.fit/, its pricing, privacy, terms, refund and delete-account pages, and one gym page and one join page of Crispy Curves only. No sign-in page. Keep per URL: performance score, LCP, CLS, INP or TBT, total bytes. A refused call = that URL "MISSING: <reason>".
3. limits.json (lens 8): database size (pg_database_size), size in bytes of each table (pg_total_relation_size; no row counts), storage bytes per bucket (sum of object sizes per bucket only), GitHub Actions storage used for the MettleUp repo (API: actions/cache/usage and the artifact list total size), each with the plan limit it is measured against if the docs state one (url: evidence).
4. a11y.json (lens 9): the accessibility results the panel crawl writes in CI: find the newest GREEN run of the workflow that runs the panel crawl (read .github/workflows/ci.yml to find it), download only its accessibility files into your temp folder, copy the rows (page, rule, impact, count, run id) into a11y.json, delete the temp files.
5. field-fill.csv (hunts 2 and 6): for each field a feature depends on (birthday, phone, check-in phone, app link, plan start and end dates, trainer, batch: find the columns in entities.json and supabase/migrations), ONE count query on Crispy Curves only: "field,table.column,filled,total" (e.g. birthday,gym_members.birthday,1,40). Never another gym.
6. live-state.csv (hunt 5): one row per thing: surface,what,live value,main value,evidence. The live version labels of the panel, HQ and website (fetch the page or version file each serves; find where the build writes its label in the code), the newest migration on the live database (list_migrations) against the newest file in supabase/migrations, and the list of migration files not on the live list. Play version: write "see play-report.md (coordinator)".

ITEMS
The six files above, in that order.

INPUT FILES
.github/workflows/ (read the workflow that runs the panel crawl); docs/system-map/entities.json (search only); supabase/migrations (file names, then search); docs/system-map/_work/machine-pass.md (how the first machine pass was done: read its headings and the query style only). Repo root: C:/Users/Aakash Pahuja/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit

OUTPUT FILE
docs/system-map/_sources/machine/db-perf.json, pagespeed.json, limits.json, a11y.json, field-fill.csv, live-state.csv (and the checkpoint).

ROW FORMAT
JSON files: one object, made: "<date>", source: "<tool or query>", rows: [...]. CSV files: a header line, then one row per line, commas only between fields. Every file must parse. Evidence in rows: url:<address>, run:<CI run id>, path:line, or "unknown".

BEFORE YOU REPORT: every JSON file parses (node -e one-liner, seconds); no file holds a key, a name or a phone number; no query lacks the Crispy Curves filter on a gym table.

SIZE: at most 40 tool calls to the database, at most 3 CI runs downloaded. At a limit: write "MISSING: size limit" in the files left, write the checkpoint, report "limit reached, N files left".
