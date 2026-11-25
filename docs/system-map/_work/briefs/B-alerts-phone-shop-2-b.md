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
- Work item: B-alerts-phone-shop-2-b. Test gym Crispy Curves id: 7990a942-57f3-4154-bbaf-935bab0aa342.
- Never open the audit plan or planning notes. A missing input = could-not-check; never go looking.
- Checkpoint file: docs/system-map/_work/B-alerts-phone-shop-2-b.md. Read it first; carry on after the finished items. After EVERY item: add a checkpoint line and append your rows.
- Gym data: Crispy Curves only. Never count, list or read across all gyms, not even totals. Ignore the CONTEXT METER hook number. Temp files outside the repo.

WORDS
- Lens: one way to look at the product. Hunt: a search for what is MISSING. Item: one numbered check (L3.1, H5.1).
- Area: one group of folders of a surface. Machine file: a list a tool made earlier.

STEP LENS: CHECK EVERY ITEM ON ONE AREA
ITEMS gives your surface, area and items. Check only that area.
1. Read the input files first: the rows they flag, then the code no tool can judge.
2. For EACH item, look in your area for the fault it names. Read the exact code lines. Then decide:
   - checked: you looked and can show where (path:line, machine row or data count). A fault = also a finding row, its id in finding_ids.
   - does-not-apply: the area holds nothing of that kind. Give "reason".
   - could-not-check: it needs a second gym, a real phone, a live write or a missing input. Give "reason".
   An item that is a rule ("... = finding") is checked once you applied it.
3. One finding per fault, not per item. Search docs/system-map/findings.jsonl first: a fault already there = use that id, no second finding.
4. Severity: S1 money wrong, personal data against a promise or the law, data lost, locked out | S2 a task cannot be finished, wrong facts shown | S3 confusing | S4 polish.
5. Write ONE grid row per lens or hunt, holding every item of it.
Done when every item id in ITEMS is in a grid row: a script checks.

ITEMS
Surface: phone. Area: phone/shop-2 (write exactly these two in every row). Folders: apps/mobile/src/shop (files gymApi.ts to workoutCode.ts, sorted by name).
Hunt 3, Did it happen? (proof of every automatic action): write "lens":"gap-3".
H3.1 Every automatic send, reminder, push, digest, job: is there a record the owner (or HQ) can open that says it went, to whom, when, and why not when it did not?
H3.2 An automatic action with no record and no "why not" = finding (S2 when the owner believes it ran)
Hunt 4, Two features, one job (overlap and conflict): write "lens":"gap-4".
H4.1 Find every pair of features that act on the same people or the same event (manual message vs automatic reminder; AI idea vs Today nudge; bell vs Today vs push; desk link vs phone proof)
H4.2 Check they agree: no double message, no suggestion to do what the system already did, the same count in both places, "done" in one is "done" in the other
H4.3 For every "done", "read" or "seen" mark: find where it is kept (this browser only, this phone only, or the server)
H4.4 Every other place that counts or sends the same items (a server push or daily summary, another device, another staff member, Today, the bell) must read that same mark
H4.5 a mark kept in one place while another place still counts the same item as waiting = finding
H4.6 Also the case where no mark exists at all: every list or count of items that point at a thing to act on (alerts, to-dos, a daily summary)
H4.7 When that thing is handled in its own page (reply sent, request settled, enquiry closed), does the item leave the list and the count in every place, server sends included, without anyone touching the item itself?
H4.8 An item that cannot learn its thing was handled = finding
Your lists (34 features): docs/system-map/_work/items/B-alerts-phone-shop-2-b.txt. 

INPUT FILES
docs/system-map/_work/items/B-alerts-phone-shop-2-b.txt (read it whole first); docs/system-map/features.json, entities.json, readers.json, findings.jsonl (search by id or word, never read whole); the code at each entry file:line. docs/system-map/features.json, readers.json, impact.json, findings.jsonl (search by id or word, never read whole); the code at each entry file:line. Repo root: C:/Users/Aakash Pahuja/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit

OUTPUT FILE
docs/system-map/_work/out/B-alerts-phone-shop-2-b.jsonl

ROW FORMAT (one JSON object per line; every field required; MADE-UP examples, copy the shape only)
{"kind":"finding","id":"FN-B-alerts-phone-shop-2-b-01","date":"2026-11-20","lens":"3","surface":"server","area":"server/pay","refs":["F-panel-014"],"severity":"S1","title":"A desk login can change another gym's dues","what":"Plain words.","expected":"Plain words.","evidence":["deploy/panel/joinPay.js:118-131"],"proof":"code-read","root_cause_key":"dues-save-no-gym-check","who":"owners","how_often":"every time","fix_line":"Plain words","fix_size":"small","needs_him":false,"verified":"pending","status":"open"}
{"kind":"grid","surface":"server","area":"server/pay","lens":"3","checked_on":"2026-11-20","items":[{"item":"L3.1","status":"checked","evidence":["deploy/panel/joinPay.js:118-131"],"finding_ids":["FN-B-alerts-phone-shop-2-b-01"]},{"item":"L3.9","status":"does-not-apply","reason":"no uploads here","evidence":[],"finding_ids":[]}]}
Finding: title, what, expected, who, how_often, fix_line in plain words, no file or function names. evidence: real repo path:line. root_cause_key: 3 to 6 lower-case words joined by dashes, never over 6. fix_size: the whole word small | medium | large | unknown. proof: driven | code-read | data-count | machine. refs: existing ids or [].
Grid: surface, area, lens exactly as ITEMS says. Machine evidence: machine:<file>.json#<path>. Never print a key or password: file:line only.
BEFORE YOU REPORT: node docs/system-map/_tools/lens-cover.mjs B-alerts-phone-shop-2-b and node docs/system-map/_tools/merge.mjs B-alerts-phone-shop-2-b --dry. Fix every line they name.

SIZE: read at most 3,000 code lines; at most 40 findings. Never read a file over 800 lines whole: search, then read 100 lines. At a limit: mark the items left could-not-check ("size limit"), write the checkpoint, report "limit reached, N items left".
