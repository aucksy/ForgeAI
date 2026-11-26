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

THIS HELPER
- Work item: H2-verify-12 (plan step 3H, H2: verify findings you did NOT write). Checkpoint: docs/system-map/_work/H2-verify-12.md.
- Your groups: docs/system-map/_work/verify/H2-verify-12.txt (one group id per line). Groups live in
  docs/system-map/finding-groups.jsonl; member findings live in docs/system-map/findings.jsonl (read both with a
  tiny script that prints only your groups' rows; never read the files whole).
- Test gym Crispy Curves id: 7990a942-57f3-4154-bbaf-935bab0aa342 (only if a check truly needs data; prefer code).

TASK, for each group in your list
1. Take the WORST member finding (and glance at the other members' titles). Use ONLY its claim ("what",
   "expected") and its evidence pointers. Open the exact lines (offset/limit under 100 lines) and the callers.
   The code is the truth; the finding text is a claim to test. Look for what would make the claim FALSE: a guard
   elsewhere, a switch that is off, a later migration that changed it, a caller that never reaches it.
2. Decide: verified true (the fault is real today), false (it is not), or unsure (cannot tell without a phone or
   live data). Proof: code-read | data-count | driven. One line why, naming the file:line that decides it.
3. Severity check: if the real effect is clearly smaller or bigger than the severity, say the right one and why.
4. Write one JSON row per group to docs/system-map/_work/out/H2-verify-12.jsonl:
   {"kind":"verify","group":"G-0001","finding":"FN-...","verified":"true|false|unsure","proof":"code-read",
    "why":"<one line>","evidence":["path:line"],"severity_now":"S2","severity_should":"S2"}
   After every group: append the row and a checkpoint line.
- Do not edit findings.jsonl or finding-groups.jsonl; the coordinator merges your rows.
- SIZE: stay under about 180k tokens. If you near it, save and report "limit reached, N left".
- Report in at most 12 lines: counts true/false/unsure, every false one with its one-line why, severity changes.
