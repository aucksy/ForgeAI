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
- Work item: A7-src. Test gym Crispy Curves id: not needed in this step: no database reads.
- Never open the audit plan (D:\Brain\Dev-Framework\2026-11-16-full-system-audit-plan.md) or any planning note. Everything you need is in this brief. If something is missing, write it under could-not-check; do not go looking.
- Checkpoint file: docs/system-map/_work/A7-src.md. Read it first: if it lists finished units, carry on after them. Add a line after EVERY finished unit.
- Write your output file after every finished unit, so a stop loses nothing.
- Repo root: C:/Users/AAKASH~1/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit

WORDS
- Promise: any sentence a user can read that says what the product does or does not do.
- Candidate sentence: a user-readable sentence that holds one of the trigger words below.
- Source group: one set of places a user reads: (1) legal pages: privacy, terms, data agreement, refund, delivery, delete-account; (2) websites: about, contact, home, pricing, gym pages; (3) store listing text and store screenshot text; (4) help articles; (5) panel in-app sentences; (6) phone and watch in-app sentences; (7) What's new lines; (8) message templates (WhatsApp, email, SMS, push).

STEP A7-src: MAKE THE CANDIDATE LIST BY SCRIPT (NO JUDGING OF PROMISES)
1. Find where each source group lives in the repo. List folders first; do not read whole files. Likely places: scripts/ (page builders), deploy/, apps/dashboard/src, apps/mobile/src, apps/mobile/android/wear, docs/legal, docs/launch, docs/marketing, help article files. In docs/ open only folders that hold text a user reads; never OWNER-INBOX.md, CLAUDE-NOTES.md, CLAUDE-NOTES-ARCHIVE.md, PLAN.md or docs/system-map/_sources.
2. Write docs/system-map/_tools/promises.mjs (plain Node, no packages, runs in seconds, exits). It scans those places and prints one line per candidate sentence. Trigger words, whole words, any case: we, never, only, "not kept", "not shared", free, recorded, always, guarantee, refund, delete, private, secure, and "within <number> hours/days/minutes". Every What's new line and every message template is a candidate even without a trigger word.
3. Skip: test files, code comments, import lines, log lines, variable names. A sentence = a string a user can read (string literals and JSX text in code; plain lines in text, Markdown and HTML).
4. Sort by source group, then file, then line. Write docs/system-map/_sources/promises.txt.
5. Check 30 random lines by eye: open the file:line. If more than 6 are not user-readable text, tighten the script and run it again. Write the check result in your checkpoint.
6. In your checkpoint, write a table: source group | first line number | last line number | count. Split any group over 120 candidates into parts of at most 120 and list each part's line range.

OUTPUT FILES
docs/system-map/_tools/promises.mjs and docs/system-map/_sources/promises.txt

ROW FORMAT of promises.txt (one line per candidate; MADE-UP example)
legal | scripts/legal_pages.py:210 | We never share your phone number with other gyms.
Fields: source group name | file:line (a real repo path and line) | the sentence, at most 300 characters, on one line.

SIZE: 1 script. Read at most 1,500 lines. Never read a file over 800 lines whole. At a limit: write the checkpoint and report "limit reached".
