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
- Work item: A2-server-database-2. Test gym Crispy Curves id: not needed in this step: no database reads.
- Never open the audit plan or any planning note. Everything you need is in this brief. If something is missing, write it under could-not-check; do not go looking.
- Checkpoint file: docs/system-map/_work/A2-server-database-2.md. Read it first: if it lists finished units, carry on after them. Add a line after EVERY finished unit.
- Append your rows to the output file after every finished unit, so a stop loses nothing.

WORDS
- Surface: one thing a person uses (panel, phone app, watch app, websites, HQ, server jobs, messages, store listing).
- Area: one folder group of a surface, at most 12,000 lines. You get exactly one.
- Role: who uses it: prospect, gym owner, staff (desk), trainer, member, pass member, HQ admin, the system (scheduled jobs).
- Feature: one thing the product does, named the way a user would name it ("collect dues", "check in by QR", "rest timer").
- Source list: lines "kind | name | file:line" made by a script from the code. It is the full list of items in your area.
- Switch / plan gate: a per-gym on/off setting, or a "Pro only" rule, that shows or hides a feature.

STEP A2: FEATURE INVENTORY OF ONE AREA
Do every item, and tick each in your checkpoint:
1. Read your lines of the source list (ITEMS). Every line is one item: a route, screen, sheet, dialog, drawer, button that saves, notification channel, background task, deep link, settings switch, Worker route, database function, table, cron or outgoing message.
2. For each item, open the code at its file:line (at most 100 lines around it) and learn what a user can do there.
3. Note every feature switch and plan gate you meet.
4. Group the items into features named in user words. One item may belong to more than one feature.
5. Write one feature row per feature. "entry" = the code entry points (file:line). "sources" = EVERY source line that belongs to it, as <file>#<line number>.
6. A source line that is no feature (a helper, a dead file) still needs a row: status "not-a-feature", and say why in "name".
Done when: every source line in ITEMS is named in the "sources" of at least one row. A script checks this; one missing line fails your item.
Do not write journeys, entities or findings in this step. If you see a clear bug, add one line to your checkpoint under "seen in passing".

ITEMS
Area server/database-2 = folders supabase/migrations (files supabase/migrations/0034_signin_pin.sql to supabase/migrations/0062_plan_features.sql only). Your items: docs/system-map/_work/items/A2-server-database-2.txt (293 lines; each starts with its id, e.g. "panel.txt#212" or "file#<path>", then kind | name | file:line). A "file" line means: this whole source file must belong to some feature. Put the line id (the text before the first " | ") in "sources". Lines that are the demo gym's pretend copy of a real feature: one row named "demo copy of <feature>". Feature ids you may use: F-server-400 to F-server-499.
(the source file and line range of your area, and the feature id numbers you may use)

INPUT FILES
docs/system-map/_work/items/A2-server-database-2.txt and the code those lines point to. Repo root: C:/Users/AAKASH~1/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit

OUTPUT FILE
docs/system-map/_work/out/A2-server-database-2.jsonl

ROW FORMAT (one JSON object per line; every field required; unknown = the word "unknown"; MADE-UP example, copy the shape only)
{"kind":"feature","id":"F-panel-014","surface":"panel","area":"panel/pay","name":"Collect dues","roles":["owner","staff"],"switch":"none","tier":"free","entry":["apps/dashboard/src/crm/pay/DuesSheet.tsx:41"],"status":"live","sources":["panel.txt#212","panel.txt#213"]}
status: live | behind switch | hidden | unknown | not-a-feature. tier: free | Pro | unknown. switch: its name, or "none".
Every "entry" must be a real repo path and a line inside that file: a script checks it.

SIZE: 1 area (at most 12,000 lines). Read at most the source list + 2,500 code lines. Write at most 40 features. Never read a file over 800 lines whole: search first, then read the 100 lines you need. At a limit: write the checkpoint and report "limit reached, N items left".