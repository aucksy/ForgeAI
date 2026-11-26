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
- Work item: H1-dedupe (plan step 3H, H1: merge findings by script). Checkpoint: docs/system-map/_work/H1-dedupe.md.
- No gym data is needed. Do not query any database.

TASK
1. Write docs/system-map/_tools/dedupe.mjs (plain Node, no packages, runs in seconds, exits). It reads
   docs/system-map/findings.jsonl (about 2,550 rows; fields include id, severity S1-S4, surface, area, title,
   evidence, root_cause_key, lens, refs, who, how_often, fix_size, needs_him) and writes
   docs/system-map/finding-groups.jsonl, one JSON row per group:
   {"group":"G-0001","members":["FN-..",..],"lenses":[..],"worst":"S1|S2|S3|S4","surface":"..","areas":[..],
    "title":"<title of the worst member>","root_cause_key":"..","reason":"same root_cause_key | same file within 30 lines"}
   Grouping rule (plan 3H H1): two findings join one group when (a) their root_cause_key is equal (ignore empty or
   generic keys: print the 20 most common keys first and treat any key shared by more than 15 findings across
   different surfaces as generic, then decide), or (b) any evidence pointer of one names the same file as one of the
   other's within 30 lines. Use union-find so groups are transitive, but CAP a group: if a group would pass 25
   members, do not join on rule (b) alone (shared big files like an app.js would glue everything together).
   Every finding is in exactly one group (singletons too). Order groups worst first, then by member count.
2. Run it. Print and write into your checkpoint: group count, groups per worst severity, the 10 biggest groups
   (id, size, title), and how many findings were joined by rule (a) vs (b). Spot-check 10 multi-member groups by
   reading their titles: they must be the same fault. If more than 2 of 10 are not, tighten the rule and re-run.
3. Also write docs/system-map/_work/verify-queue.json: the list of group ids to verify in step H2 = every group
   whose worst is S1 or S2, plus a fixed 1-in-5 sample of S3 groups (every 5th S3 group in file order). Print the
   counts.
- SIZE: stay under about 150k tokens. Read findings.jsonl with a script, never whole into your context.
- Report in at most 15 lines: files written, the counts, the spot-check result, any rule you changed.
