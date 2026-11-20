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
- Work item: A8-rules. Test gym Crispy Curves id: 7990a942-57f3-4154-bbaf-935bab0aa342. You need no database query; never count, list or read across all gyms, not even totals.
- Never open the audit plan or a planning note. A missing input = say so in the rule's "note"; never go looking.
- Checkpoint file: docs/system-map/_work/A8-rules.md. Read it first; carry on after the finished templates. After EVERY 5 templates: add a checkpoint line.
- Ignore the CONTEXT METER hook number. Temp files outside the repo.

WORDS
- Tier 2 journey: a journey a script made from a TEMPLATE (types 4, 5, 7, 8, 9, 10, 11: zero items, midnight, offline, dark theme, 360 dp width, an old page left open ...). It has a "template" id.
- Gate: a CI check that runs on many screens at once (the panel crawl, the picture or layout gate, the watch render harness, store shots, the device QA flows). Its LIST is the screens it opens.
- Coverage: full | partial | none | manual-only. full = a test really checks what the template says the user sees AND what must not happen.

STEP A8-RULES: ONE COVERAGE RULE PER TEMPLATE
1. Read docs/system-map/journey-templates.json whole (42 templates: id, type, variant, text, sees, must_not).
2. Find every gate in .github/workflows/ and the test folders it runs. For each gate, find its LIST of screens (a file of routes, pages or screens) and read what it checks (open it; never trust a name).
3. For each template, decide: which gate (if any) really checks its "sees" and "must_not" for the screens on its list. Then write one rule: coverage_then for journeys whose feature's entry file is on the gate list; coverage_default for all others. A template no gate checks: coverage_default "none" (or "manual-only" when only a real phone or person can check it, e.g. a phone maker's alert rule), no covered_when.
4. entry_file_in must hold REPO FILE PATHS (the screen files the gate opens), so a script can match them to the features' entry files. A gate list of routes: map each route to its screen file by reading the router.

ITEMS
Every template id in docs/system-map/journey-templates.json (42).

INPUT FILES
docs/system-map/journey-templates.json; .github/workflows/*.yml; docs/system-map/_sources/test-index.jsonl (search only); the gate list files and test files you find (search, then read at most 100 lines). Repo root: C:/Users/Aakash Pahuja/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit

OUTPUT FILE
docs/system-map/_work/a8-rules.json (one JSON list; it must parse).

ROW FORMAT (MADE-UP example, copy the shape only)
[{"template":"T9-360","coverage_default":"none","covered_when":{"entry_file_in":["apps/dashboard/src/crm/MembersPage.tsx"]},"coverage_then":"full","tests":[{"path":".github/workflows/ci.yml","checks":"the layout gate opens each listed page at 360 px and fails on text over text or a cut-off button"}],"evidence":["apps/dashboard/e2e/layout-pages.mjs:12-40"],"note":"plain words"}]
coverage values: full | partial | none | manual-only. tests: only when a rule gives full or partial; each path a real repo file. evidence: real path:line.

BEFORE YOU REPORT: node docs/system-map/_tools/a8-tier2.mjs (seconds, exits). It must end with no "NO RULE" line and no error. It writes _work/out/A8-tier2.jsonl; leave that file.

SIZE: read at most 3,000 lines. At a limit: write the rules you have, write the checkpoint, report "limit reached, N templates left".
