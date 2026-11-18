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
- Work item: A7-phone-watch-2. Test gym Crispy Curves id: not needed in this step: no database reads.
- Never open the audit plan or any planning note. Everything you need is in this brief. If something is missing, write it under could-not-check; do not go looking.
- Checkpoint file: docs/system-map/_work/A7-phone-watch-2.md. Read it first: if it lists finished units, carry on after them. Add a line after EVERY finished unit.
- Append your rows to the output file after every finished unit, so a stop loses nothing.

WORDS
- Promise: any sentence a user can read that says what the product does or does not do (legal pages, website, store listing, in-app text, help articles, What's new, messages).
- Candidate sentence: one line of promises.txt. A script found it by its words ("we", "never", "only", "not kept", "not shared", "free", "recorded", "within N hours/days").
- Kept by: what makes the promise true: a journey, a piece of code, or a written process.
- Journey: one path a role takes through a feature. Surface: one thing a person uses.
- Status: kept (you have proof), partly, GAP (the code does something else, or nothing keeps it), unknown.

STEP A7: PROMISE REGISTER FOR ONE SOURCE GROUP
You get one source group (for example: the legal pages, or the website home and pricing, or the phone app's in-app sentences) and at most 120 candidate sentences.
1. For each candidate: read the sentence where it stands (the lines around it). Is it a promise? If not (a heading, a comment, a test string), write it in your checkpoint as "not a promise: <file:line>, <why>" and move on.
2. A promise gets ONE row: the exact text, the page or screen a user reads it on, and its file:line.
3. Find what keeps it. Search the code for the thing the sentence talks about; read the exact lines (at most 100 at a time). Write kept_by as file:line, a journey or feature id that exists, or the name of a written process.
4. Set the status. "kept" needs proof: a test path, or the code lines that do it. No proof = "unknown", never "kept".
5. Promises about privacy, law, money, deletion, who can see data, and time limits come first if you run short.
6. The same sentence on two pages = two rows (each page can drift).
Done when: every candidate in ITEMS has a row or a "not a promise" line.
Do not fix wording. Do not write findings in this step: status GAP is the record.

ITEMS
Source group: phone-watch, part 2. Your candidates: lines 968 to 1087 of docs/system-map/_sources/promises.txt. Each line is: source group | file:line | the sentence.
(your source group, and the line range of promises.txt that holds its candidates)

INPUT FILES
docs/system-map/_sources/promises.txt (lines 968-1087 only) and the code those sentences talk about. Repo root: C:/Users/AAKASH~1/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit

OUTPUT FILE
docs/system-map/_work/out/A7-phone-watch-2.jsonl

ROW FORMAT (one JSON object per line; every field required; unknown = the word "unknown"; MADE-UP example, copy the shape only)
{"kind":"promise","id":"P-A7-phone-watch-2-01","text":"We never share your phone number with other gyms.","page":"Privacy page, section 4","where":"scripts/legal_pages.py:210","kept_by":["unknown"],"proof":"unknown","status":"unknown"}
Ids start with P-A7-phone-watch-2-. "text" is the exact sentence, word for word. "where" must be a real repo path and a line inside that file: a script checks it. status: kept | partly | GAP | unknown.

SIZE: 1 source group, at most 120 candidate sentences. Read at most 1,500 lines. Write at most 120 rows. Never read a file over 800 lines whole: search first, then read the 100 lines you need. At a limit: write the checkpoint and report "limit reached, N items left".
