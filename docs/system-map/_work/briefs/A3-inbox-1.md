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
- Work item: A3-inbox-1. Test gym Crispy Curves id: 7990a942-57f3-4154-bbaf-935bab0aa342.
- Never open the audit plan or any planning note. Everything you need is in this brief. If something is missing, write it under could-not-check; do not go looking.
- Checkpoint file: docs/system-map/_work/A3-inbox-1.md. Read it first: if it lists finished units, carry on after them. Add a line after EVERY finished unit.
- Append your rows to the output file after every finished unit, so a stop loses nothing.

WORDS
- Feature: one thing the product does, named the way a user would name it.
- Surface: one thing a person uses (panel, phone app, watch app, websites, HQ, server jobs, messages, store listing).
- Role: prospect, gym owner, staff (desk), trainer, member, pass member, HQ admin, the system.
- Promise: any sentence a user can read that says what the product does or does not do.
- Redacted copy: a copy of a notes file with some rows removed on purpose. You read ONLY the copy named in INPUT FILES, never the original, and you do not ask what was removed.

STEP A3: FEATURES THE PRODUCT TELLS PEOPLE ABOUT
You get ONE source (one of: a help article set, the What's new history, the website, the Play listing, one part of a redacted notes copy).
1. Read the source from top to bottom. List every feature it names or describes, in your checkpoint, with the line it came from.
2. For each one, find its row in features.json: search by the user's word for it and by the screen it sits on. When the names differ, open the row's entry point (at most 100 lines) to be sure it is the same thing.
3. Found: nothing to write. Add "matched <feature id>" in your checkpoint.
4. Not found: write a feature row with status "unknown" and entry ["unknown"], and a finding row "named in public but not found in code". Severity S2 if a user is told it exists; S3 if only an inside note says so.
5. Found, but the source says more than the feature does (wider, for more people, or live when it is behind a switch): write a finding row, S2.
Done when: every feature your source names has a row or a "matched" line.

ITEMS
Your one source: redacted backlog copy, part 1. New feature rows use the id F-<surface word>-<number> with a number from 3700 to 3759 only. Surface words (use exactly one of): panel, phone, watch, web, hq, server. Search features.json with a search tool (it is one long file: never read it whole).
(your one source, and the feature id numbers you may use for new rows)

INPUT FILES
docs/system-map/_sources/owner-inbox-redacted-part01.md (read it in 100-line slices, top to bottom); docs/system-map/features.json (search only); the code a feature row points at. Repo root: C:/Users/Aakash Pahuja/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit

OUTPUT FILE
docs/system-map/_work/out/A3-inbox-1.jsonl

ROW FORMAT (one JSON object per line; every field required; unknown = the word "unknown"; MADE-UP examples, copy the shape only)
{"kind":"feature","id":"F-panel-214","surface":"panel","area":"unknown","name":"Export members to Excel","roles":["owner"],"switch":"unknown","tier":"unknown","entry":["unknown"],"status":"unknown","sources":[]}
{"kind":"finding","id":"FN-A3-inbox-1-01","date":"2026-11-20","lens":"A3","surface":"panel","area":"unknown","refs":["F-panel-214"],"severity":"S2","title":"Help says members can be exported, but no export exists","what":"The help article tells owners to tap Export on the members list. No such button was found.","expected":"The button exists, or the article does not promise it.","evidence":["deploy/panel/helpPages.js:310"],"proof":"code-read","root_cause_key":"help-names-missing-export","who":"owners","how_often":"every time","fix_line":"Remove the line from the help article or build the export","fix_size":"unknown","needs_him":true,"verified":"pending","status":"open"}
Finding ids start with FN-A3-inbox-1-. fix_size: small | medium | large | unknown (the whole word). A new feature row writes "sources" as ["file#<repo path of your source file>"] (no line number). title, what, who, how_often, fix_line: plain words, no file names. proof: driven | code-read | data-count | machine. root_cause_key: 3-6 lower-case words joined by dashes. Evidence must be a real repo path and a line inside that file: a script checks it.

SIZE: 1 source. Read at most that source. Write at most 60 rows. Never read a file over 800 lines whole: search first, then read the 100 lines you need. At a limit: write the checkpoint and report "limit reached, N items left".
