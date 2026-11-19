<!-- Template for step A4b (built vs live). The coordinator fills every {PLACEHOLDER} and pastes the text below this line. -->
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
- Work item: {WORK ITEM ID}. Test gym Crispy Curves id: {CRISPY CURVES ID}.
- Never open the audit plan or any planning note. Everything you need is in this brief. If something is missing, write it under could-not-check; do not go looking.
- Checkpoint file: {CHECKPOINT FILE}. Read it first: if it lists finished units, carry on after them. Add a line after EVERY finished unit.
- Append your rows to the output file after every finished unit, so a stop loses nothing.

WORDS
- Feature: one thing the product does, in the user's words (a row of features.json). Surface: one thing a person uses (web, phone, panel, server, hq, watch).
- Status of a feature: live (real users can reach it today) | behind switch (in the live build, but off unless a switch is on) | hidden (in the code, no way in for a user) | not-a-feature | unknown.
- Migration: one database change file. "Applied" = the live database has run it.
- Facts file: docs/system-map/_sources/live-state-facts.md. It says what the live systems really run.

STEP A4b: BUILT VS LIVE
Goal: no feature row keeps the status "unknown" or a wrong status only because nobody looked at the live system.
1. FACTS (only when ITEMS says "write the facts file"; else read it). Write the facts file with these parts:
   a. Database: call the Supabase tool list_migrations ONCE (catalog read; never execute_sql, never a write). Compare its list with the files in supabase/migrations. Write every file that is NOT applied live, and every file whose first lines say NOT APPLIED but that IS applied live.
   b. deploy/panel/migrations (the second database): no live read is allowed here; write "live state unknown" and what each file's first lines say.
   c. Live version labels: open the public pages only (no login): the gym panel sign-in page, the HQ sign-in page, the website. Write the version label each one shows, and the version in the code on main (search for where the label is set). Play app: write the version in the code; live Play version = "unknown" unless a public page shows it.
   Every fact carries its source (tool name + date, a url, or path:line).
2. For EACH feature in ITEMS: read its row in docs/system-map/features.json (search by id). Open its entry file:line (at most 100 lines). Decide the status from evidence: the route or screen is reachable, the switch and its default, the migration it needs is applied (facts file). Write ONE patch row. If the evidence does not settle it, keep "unknown" and say what is missing in the checkpoint.
3. A feature that public words (What's new, help, website) call live, but that is not live: write ONE finding row (severity S2 when a user is told it exists; else S3). First search docs/system-map/findings.jsonl for the same fault; if it is there, write no second finding.
Done when: every id in ITEMS has a patch row in your output file.

ITEMS
{ITEMS}

INPUT FILES
{INPUT FILES}

OUTPUT FILE
{OUTPUT FILE}

ROW FORMAT (one JSON object per line; MADE-UP examples, copy the shape only)
{"kind":"feature","id":"F-panel-014","patch":true,"status":"behind switch","switch":"pay_dues_v2"}
{"kind":"finding","id":"FN-{WORK ITEM ID}-01","date":"2026-11-19","lens":"gap-5","surface":"panel","area":"panel/pay","refs":["F-panel-014"],"severity":"S2","title":"The update note says a thing is ready, but owners cannot open it","what":"Plain words: what a person is told and what they really get.","expected":"Plain words.","evidence":["supabase/migrations/20260101000000_payments.sql:1-3"],"proof":"code-read","root_cause_key":"migration-not-applied-live","who":"owners","how_often":"every time","fix_line":"Plain words, one line","fix_size":"small","needs_him":false,"verified":"pending","status":"open"}
A patch row holds only kind, id, "patch": true and the fields you change (status, and switch when you learn its name). status: live | behind switch | hidden | not-a-feature | unknown. Finding rules: every field required; title, what, expected, who, how_often, fix_line in plain words with no file or function names; root_cause_key = 3 to 6 lower-case words joined by dashes (at most 6 words); fix_size = the whole word small | medium | large | unknown; evidence = real repo path:line. Write the reason for each patch as one line in your checkpoint: "<id>: <status>: <why, with path:line>".

SIZE: your ITEMS only. Read at most 2,500 code lines. Write at most 60 rows. Never read a file over 800 lines whole: search first, then read the 100 lines you need. At a limit: write the checkpoint and report "limit reached, N items left".
