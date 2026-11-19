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
- Data. This step reads NO database. Code and files in the repo only.
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
- Work item: A7-panel-3b. Test gym Crispy Curves id: not needed in this step: no database reads.
- Never open the audit plan or any planning note. Everything you need is in this brief. If something is missing, write it under could-not-check; do not go looking.
- Checkpoint file: docs/system-map/_work/A7-panel-3b.md. Read it first: if it lists finished units, carry on after them. Add a line after EVERY finished unit (a unit = about 10 rows).
- Append your rows to the output file after every finished unit, so a stop loses nothing.

WORDS
- Promise: any sentence a user can read that says what the product does or does not do.
- Kept by: what makes the promise true: a journey, a piece of code, or a written process.
- Status: kept (you have proof), partly, GAP (the code does something else, or nothing keeps it), unknown.

STEP A7, SECOND PASS: FIND WHAT KEEPS THE PROMISES THAT ARE STILL "unknown"
An earlier helper wrote 80 promise rows for the admin panel (file docs/system-map/_work/out/A7-panel-3.jsonl). It ran out of reading room: most rows have status "unknown" because nobody searched the code that would keep them.
1. Read docs/system-map/_work/out/A7-panel-3.jsonl. Your items = every row whose status is "unknown" (the earlier helper counted 63).
2. Order: promises about privacy, who can see data, money, receipts, prices, deletion and time limits FIRST. Named by the earlier helper as highest value: member photo visibility (rows 07, 08), "Members, money and staff never show on the page" (row 80), receipt number never reused (row 15), "A new price is used only for new sales", "Nothing is deleted from your gym's records online", "A demo gym is never put online", owner-only import of plans and payments.
3. For each item: read the sentence where it stands (the row's "where", the lines around it). Then search the code for the thing the sentence talks about (panel code is under apps/dashboard/src; server rules are under supabase/migrations and supabase/functions; tests under supabase/tests and beside the code). Read the exact lines, at most 100 at a time. For a database function, read its body, not only its header comment.
4. Write ONE patch row per item you settled (format below). "kept" needs proof: a test path:line that really checks it, or the code lines that do it. If the code does something else, or nothing keeps it: GAP, and say in "proof" what the code does instead, with path:line.
5. An item you could not settle gets NO row: list its id in the checkpoint under "still unknown", with one line why.
Done when: every item has a patch row or a "still unknown" line.
Do not fix wording. Do not write findings in this step: status GAP is the record.

OUTPUT FILE
docs/system-map/_work/out/A7-panel-3b.jsonl

ROW FORMAT (one JSON object per line; MADE-UP example, copy the shape only)
{"kind":"promise","id":"P-A7-panel-3-07","patch":true,"kept_by":["apps/dashboard/src/example/File.tsx:120"],"proof":"apps/dashboard/src/example/File.test.ts:44 checks that ... ","status":"kept"}
- "id" is the id of the EXISTING row in A7-panel-3.jsonl (ids start with P-A7-panel-3-). Do not make new ids.
- "patch" is always true. Send only these fields: kind, id, patch, kept_by, proof, status. Do not send text, page or where.
- kept_by entries: a plain repo path:line (a real file and a line inside it: a script checks it), or the word "unknown". No extra words inside a kept_by entry.
- status: kept | partly | GAP.

SIZE: about 63 items. Read at most 2,000 lines. Never read a file over 800 lines whole: search first, then read the 100 lines you need. At a limit: write the checkpoint and report "limit reached, N items left".

Repo root: C:/Users/AAKASH~1/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit
