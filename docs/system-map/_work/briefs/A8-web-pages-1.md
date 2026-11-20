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
- Work item: A8-web-pages-1. Test gym Crispy Curves id: 7990a942-57f3-4154-bbaf-935bab0aa342. You need no database query in this step;
  never count, list or read across all gyms, not even totals.
- Never open the audit plan or a planning note. Something missing = "unknown"; do not go looking.
- Checkpoint file: docs/system-map/_work/A8-web-pages-1.md. Read it first; carry on after the finished journeys. After EVERY 5 journeys: add a checkpoint line and append your rows.
- Ignore the CONTEXT METER hook number. Temp files go outside the repo, never in it.

WORDS
- Journey: one path a role takes through a feature. Each step has "see" lines (what the user must see) and "not"
  lines (what must NOT happen). Coverage: whether an automated test checks those lines.
- full: every see and not line of the journey is checked by some test. partial: some are. none: no test checks
  any. manual-only: only a real phone, watch or person can check it (phone maker alert rules, a watch on the wrist).

STEP A8: COVERAGE OF EACH JOURNEY
1. Read your items file whole. It lists your journeys with every see/not line, and per feature the CANDIDATE tests
   a script found (imports the feature's code, or asserts the same words). Candidates are leads, not proof.
2. For each journey, open each candidate test: search it for the journey's words, then read the asserting lines
   (at most 100 lines at a time). Write what the test REALLY checks, in plain words, and which lines it covers
   ("s1 see, s2 not"). A test that only renders, or checks a different result, does not cover the line.
3. No candidate covers a line: one search of docs/system-map/_sources/test-index.jsonl for a key word of that line.
   Still nothing = the line is not covered.
4. Decide coverage by the rule in WORDS. Never "full" because a test name sounds right.
5. A test that asserts the opposite of a "not" line, or is skipped, or checks nothing = a finding (lens "1").

ITEMS
Surface: web. 110 journeys of 8 features: every one is in your items file, docs/system-map/_work/items/A8-web-pages-1.txt (journey ids, their see/not lines, and candidate tests per feature). Write one journey row for each.

INPUT FILES
docs/system-map/_work/items/A8-web-pages-1.txt (read it whole first); docs/system-map/_sources/test-index.jsonl (search only, one line per test file); docs/system-map/findings.jsonl (search only); each candidate test file (search, then read at most 100 lines). Repo root: C:/Users/Aakash Pahuja/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit

OUTPUT FILE
docs/system-map/_work/out/A8-web-pages-1.jsonl

ROW FORMAT (one JSON object per line; MADE-UP examples, copy the shape only)
{"kind":"journey","id":"J-F-panel-014-01","patch":true,"tests":[{"path":"apps/dashboard/test/crm/dues.test.ts","checks":"s1 see: the sheet opens with the due amount filled; s1 not: amount never zero when dues exist"}],"coverage":"full"}
{"kind":"journey","id":"J-F-panel-014-02","patch":true,"tests":[],"coverage":"none"}
{"kind":"finding","id":"FN-A8-web-pages-1-01","date":"2026-11-21","lens":"1","surface":"panel","area":"panel/forms","refs":["J-F-panel-014-01"],"severity":"S3","title":"The dues test never checks the amount","what":"Plain words.","expected":"Plain words.","evidence":["apps/dashboard/test/crm/dues.test.ts:40-52"],"proof":"code-read","root_cause_key":"dues-test-checks-nothing","who":"owners","how_often":"every release","fix_line":"Plain words","fix_size":"small","needs_him":false,"verified":"pending","status":"open"}
Journey rows: send ONLY kind, id, "patch": true, tests, coverage. One row per journey in ITEMS, every one.
tests[].path must be a real repo file. Finding: title, what, expected, who, how_often, fix_line in plain words, no
file or function names; root_cause_key 3 to 6 lower-case words joined by dashes; machine evidence is written
machine:<file>.json#<path>. Search docs/system-map/findings.jsonl first: a fault already there = use that id.

BEFORE YOU REPORT: run node docs/system-map/_tools/a8-cover.mjs A8-web-pages-1 and node docs/system-map/_tools/merge.mjs A8-web-pages-1 --dry
(both seconds, both exit). Fix every line they name, then report.

SIZE: read at most 3,000 test lines; at most 20 findings. Never read a file over 800 lines whole: search, then read 100 lines. At a limit: write coverage "unknown" for the journeys left, write the checkpoint, report "limit reached, N journeys left".
