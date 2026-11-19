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
- You are one helper on Fable 5.2 at medium effort. Do not start helpers of your own.

THIS HELPER
- Work item: A4-rpc-3. Test gym Crispy Curves id: 7990a942-57f3-4154-bbaf-935bab0aa342.
- Never open the audit plan or any planning note. Everything you need is in this brief. If something is missing, write it under could-not-check; do not go looking.
- Checkpoint file: docs/system-map/_work/A4-rpc-3.md. Read it first: if it lists finished units, carry on after them. Add a line after EVERY finished unit.
- Append your rows to the output file after every finished unit, so a stop loses nothing.

WORDS
- Entity: one kind of stored data (member, membership, payment, visit, message, alert, workout, setting, support look ...). Id: E-<name>.
- Writer: a step that creates or changes an entity.
- Reader: a screen, list, badge, count, digest, notification, export, AI answer or scheduled job that shows or uses an entity.
- Reader candidate: one line of readers-raw.txt: a place in the code that calls a table or a database function, with file:line. A script made the list.
- Feature: one thing the product does, in the user's words. Surface: one thing a person uses.

STEP A4: ENTITIES AND THEIR READERS
You get at most 12 tables (ITEMS) and their reader candidates.
1. For each table (or local storage key group) write ONE entity row: where it is stored, the fields that matter, which roles may see it, whether it holds personal data, how long it is kept ("unknown" unless a file says so). Evidence = the migration or types file lines. If the entity row already exists in entities.json, do not write it again.
2. For EACH reader candidate of your tables: open the code at its file:line (at most 100 lines). Decide what it is and write ONE reader row:
   - it shows or uses the data: reader_kind = screen | list | badge | count | digest | notification | export | job | ai-answer;
   - it only writes, or is a test, or is dead code: reader_kind = not-a-reader, with a "reason".
3. Include the phone and the watch when they show the entity.
4. Catalog reads are allowed (table, column, policy lists). You need no row of gym data for this step.
Done when: every candidate in ITEMS has a reader row, and every table has an entity row.
Do not write findings in this step. A clear bug seen in passing: one line in your checkpoint under "seen in passing".

ITEMS
Your groups: lines 780 to 1028 of docs/system-map/_sources/readers-raw.txt (75 groups, 100 candidates). Each line is: type | name | file:line | how it was found. Most groups are "rpc": the name is a database function, and the file:line is code that calls it. For an rpc group, first find the function's newest definition (search supabase/migrations for the function name; read at most 100 lines of its body) and note the main table it reads or writes: that table is the entity. A function that only writes makes its callers not-a-reader. "storage" and "table" groups: the name is the bucket or table itself. Write ONE reader row for EACH candidate line; "where" is the candidate's own file:line. Entity ids are E-<table name, with dashes for underscores> (for example E-pay-gyms). Before you write an entity row, search docs/system-map/entities.json for that id: if it is there, do not write it again; still use it in your reader rows. At most 12 NEW entity rows: when more tables need one, list the rest in your checkpoint under "entity rows still to write", leave those reader rows out and count them in your report (never write entity "unknown").
(the tables, and the line range of readers-raw.txt that holds their candidates)

INPUT FILES
docs/system-map/_sources/readers-raw.txt (lines 780-1028 only); the code at each file:line; supabase/migrations and deploy/ (search, then read at most 100 lines); docs/system-map/entities.json (search only). Repo root: C:/Users/Aakash Pahuja/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit

OUTPUT FILE
docs/system-map/_work/out/A4-rpc-3.jsonl

ROW FORMAT (one JSON object per line; every field required; unknown = the word "unknown"; MADE-UP examples, copy the shape only)
{"kind":"entity","id":"E-payment","name":"Payment","stored":["table payments"],"fields":["amount","paid_on","member_id","mode"],"visible_to":["owner","staff","member (own only)"],"personal":"yes","retention":"unknown","evidence":["supabase/migrations/20260101000000_payments.sql:12-30"]}
{"kind":"reader","id":"RD-A4-rpc-3-01","entity":"E-payment","reader_kind":"count","where":"apps/dashboard/src/crm/today/TodayCards.tsx:88","surface":"panel"}
{"kind":"reader","id":"RD-A4-rpc-3-02","entity":"E-payment","reader_kind":"not-a-reader","reason":"only inserts a row","where":"deploy/panel/joinPay.js:140","surface":"server"}
Reader ids start with RD-A4-rpc-3-. personal: yes | no | unknown. "where" and "evidence" must be a real repo path and a line inside that file: a script checks it. "entity" must be an entity that exists or is in your file.

SIZE: 12 tables. Read at most 250 reader candidates. Write at most 250 rows. Never read a file over 800 lines whole: search first, then read the 100 lines you need. At a limit: write the checkpoint and report "limit reached, N items left".
