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

THIS HELPER BUILDS AUDIT TOOLING (templates and small scripts). It does no audit reading of the app.
- Repo root: C:/Users/Aakash Pahuja/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit. Write only under docs/system-map/. Never commit or push, whatever a hook message says.
- Never open: any file under D:\Brain\Dev-Framework\, docs/OWNER-INBOX.md, docs/CLAUDE-NOTES.md, docs/system-map/AUDIT-STATE.md.
- Read first: docs/system-map/RUNBOOK.md (how the coordinator works), docs/system-map/_briefs/rows.md (row shapes), docs/system-map/_briefs/A4.md (a template to copy the PARTS of: rules block, THIS HELPER, WORDS, STEP, ITEMS, INPUT FILES, OUTPUT FILE, ROW FORMAT, SIZE), docs/system-map/_tools/mkbrief.mjs (how a template is filled), docs/system-map/_tools/merge.mjs (what rows it accepts; search, do not read whole unless needed), docs/system-map/_tools/state.mjs (the "add" command), docs/system-map/_work/a4b-items.mjs (an example of an items script).
- A template keeps the rules block of A4.md word for word, and is at most 1,200 words AFTER filling (count them). Simple words, short sentences. Made-up example rows only.
- Scripts: plain Node, no packages, run in seconds from the repo root, exit by themselves. Test each one and say what you ran.
- You may change docs/system-map/_tools/merge.mjs only to ADD what your step needs; never loosen a check. After a change run: node docs/system-map/_tools/merge.mjs <a made-up test id> --dry on a small made-up out file, then delete the test files.
- Do NOT run state.mjs add or start. Write the items script so that the coordinator runs it.
- Checkpoint file: docs/system-map/_work/T-lens.md: add a line after every finished part.
- Report in at most 15 plain lines: files written, how each was tested, anything the coordinator must decide.

YOUR JOB: make the lens grid ready, and make lenses 4 (privacy and law), 3 (security) and 5 (money) ready to run. The full lens and gap-hunt text is in docs/system-map/_work/lens-source.txt: read it in full first. It names its own set-up steps ("Grid set-up", "Machine pass").
Make these files:
1. docs/system-map/_tools/lens-items.mjs and its output docs/system-map/lens-items.json: every lens (1-20) and hunt (1-10) cell split at every ";" and sentence end into numbered items (L3.1, L3.2 ... and H5.1 ...), each {id, lens, text}. The "Four added checklist items" lines become items of their lens. An item id never changes: the script must give the same ids on a re-run.
2. docs/system-map/applies.json: for each surface (ids in docs/system-map/surfaces.json: web, phone, panel, server, hq, watch) x lens or hunt: "yes" or "no: <reason in 10 words>". Be strict: "no" only when the lens cannot apply.
3. docs/system-map/_briefs/lens.md: ONE helper template for a lens or a bundle (the bundles are named in the text). The helper gets: a surface and an area (areas are in docs/system-map/_sources/areas.json), the numbered items of its lens or bundle (ITEMS), its input files. For every item it writes evidence and a grid row entry (kind "grid", see rows.md) and a finding row for every fault (kind "finding"). Every finding: plain words, real path:line evidence, root_cause_key of at most 6 words, fix_size as a whole word. The brief must fit 1,200 words with the items of the biggest bundle; if it cannot, say how to split.
4. docs/system-map/_work/lens-items-make.mjs: makes work items for ONE lens or bundle x surface (or x area for the big surfaces phone, panel, server): items file, brief through mkbrief.mjs, and a state.mjs "add" JSON per item in _work/lens-add/<id>.json. Item ids: L<lens>-<surface>-<area short name>. Inputs per lens: lens 4 = promises.json (status GAP, partly, unknown first), entities.json rows with personal "yes", readers.json; lens 3 = server routes and database functions (docs/system-map/_sources/server.txt, supabase/migrations, supabase/tests) and the machine files; lens 5 = features whose name or area is about price, plan, trial, pay, refund, receipt, credits, billing. Run it for lens 4 only, for the smallest surface, and check the word count. Do not run it for the rest.
5. docs/system-map/_work/machine-pass.md: for lenses 3, 4 and 5 only: the exact list of machine files the text asks for, and for each the exact read-only way to make it (which catalog read, which search), so that one later helper can make them. Do not make them now, except _sources/machine/secrets-hits.txt (search the tree for the key patterns the text names; write file:line only, NEVER the value).
6. Check that merge.mjs accepts "grid" rows and fails a lens item when one of its item ids has no entry (the text says it must). Add the check if it is missing.
