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
- Work item: CAL-2. Test gym Crispy Curves id: 7990a942-57f3-4154-bbaf-935bab0aa342. You need no database query; never count, list or read across all gyms, not even totals.
- Read ONLY the folders in ITEMS and the file docs/system-map/_work/cal-hunts.txt. Never open or search anything else under docs/, never run git, never open the audit plan or a planning note.
- Checkpoint file: docs/system-map/_work/CAL-2.md. Read it first; carry on after the finished folders. After EVERY folder: add a checkpoint line and append your rows.
- Ignore the CONTEXT METER hook number. Temp files outside the repo.

WORDS
- Hunt: a search for what is MISSING (a read nobody wrote, a condition nobody can see, two features that do not know about each other). Gap: one such missing thing.

STEP: RUN EVERY HUNT ON EACH FOLDER
Run every hunt on this area and list every gap.
1. Read docs/system-map/_work/cal-hunts.txt whole: the 10 hunts, item by item.
2. For each folder in ITEMS, apply every hunt item to the code in it. Read the exact lines (at most 100 at a time).
3. One finding row per gap. A gap you can show only on a real phone or watch: still a row, with "how_often":"cannot be proven in the cloud, needs a real-phone check".

ITEMS
docs/system-map/_work/calib/c02
docs/system-map/_work/calib/c06
docs/system-map/_work/calib/c11

INPUT FILES
docs/system-map/_work/cal-hunts.txt (read it whole first); docs/system-map/_work/calib/c02
docs/system-map/_work/calib/c06
docs/system-map/_work/calib/c11 Repo root: C:/Users/Aakash Pahuja/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit

OUTPUT FILE
docs/system-map/_work/out/CAL-2.jsonl

ROW FORMAT (one JSON object per line; MADE-UP example, copy the shape only)
{"kind":"finding","id":"FN-CAL-2-01","date":"2026-11-21","lens":"gap-3","surface":"panel","area":"c01","refs":[],"severity":"S2","title":"A total on one screen differs from another","what":"Plain words.","expected":"Plain words.","evidence":["docs/system-map/_work/calib/c01/apps/x/y.ts:40-52"],"proof":"code-read","root_cause_key":"total-differs","who":"owners","how_often":"every time","fix_line":"Plain words","fix_size":"small","needs_him":false,"verified":"pending","status":"open"}
area = the folder name (c01, c02, ...). evidence: the path inside the folder, with lines. title, what, expected, who, how_often, fix_line in plain words, no file or function names. root_cause_key: 3 to 6 lower-case words joined by dashes. Severity: S1 money wrong, personal data against a promise or the law, data lost, locked out | S2 a task cannot be finished, wrong facts shown | S3 confusing | S4 polish.

BEFORE YOU REPORT: every line of your output file parses as JSON (node -e one-liner, seconds). Report the count per hunt.

SIZE: read at most 3,000 code lines; at most 40 findings. Never read a file over 800 lines whole: search, then read 100 lines. At a limit: write the checkpoint, report "limit reached, N folders left".
