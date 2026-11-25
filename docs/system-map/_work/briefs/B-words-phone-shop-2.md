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
- Work item: B-words-phone-shop-2. Test gym Crispy Curves id: 7990a942-57f3-4154-bbaf-935bab0aa342.
- Never open the audit plan or planning notes. A missing input = could-not-check; never go looking.
- Checkpoint file: docs/system-map/_work/B-words-phone-shop-2.md. Read it first; carry on after the finished items. After EVERY item: add a checkpoint line and append your rows.
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
Lens 10, Language and words: write "lens":"10".
L10.1 Every user string in English and Hinglish: plain, true, consistent names for the same thing, no inside words, no banned words, no claims that are not live, Hindi read-aloud list for him
Hunt 10, Words promise more than the code: write "lens":"gap-10".
H10.1 Every switch label, help article, What's new line and button that says what happens ("Members get a birthday wish", "Done items leave the bell"): read the code path end to end and confirm it happens for EVERY member the words cover
H10.2 Words wider than reality = finding (tie to the promise register)
H10.3 Include legal and privacy pages (data agreement, privacy notice, consent and sign-in screens), and check every way into the data, staff and direct database logins included
H10.4 Every notification, link and button: follow a tap to where it lands
H10.5 a tap that opens nothing, or a general page instead of the thing it names = finding
H10.6 Every button that can be greyed out or do nothing: the screen says why, next to it
H10.7 a disabled or silent button with no reason in view = finding
H10.8 Every label in every language the app offers (Hinglish runs longer): check in code it can wrap or shrink at 320 to 390 px wide (no fixed no-wrap, no min-width that cannot shrink, no crowded top bar)
H10.9 text cut off or pushed past the screen edge = finding
H10.10 Every picture the code points at (app and notification icons, badges, manifest and share images): is it the current brand and in the form the platform needs (size, one colour where the system draws only an outline)?
H10.11 An old-brand or wrong-form picture = finding
H10.12 To follow taps, find the one place that handles a tapped notification and list the pages it knows
H10.13 then list every kind of notification the code posts (on the phone and from the server) and check each kind is in that list
H10.14 A save button greyed out because nothing changed yet counts too: the screen must say it is already saved
H10.15 A promise that every look or change is recorded: routes that skip the app's code (the database's own login, its table editor, admin tools) leave no code to read, so look for a record the database itself writes (an audit setting, a job that pulls its logs)
H10.16 none = finding
Your lists (34 features): docs/system-map/_work/items/B-words-phone-shop-2.txt. 

INPUT FILES
docs/system-map/_work/items/B-words-phone-shop-2.txt (read it whole first); docs/system-map/features.json, promises.json, findings.jsonl (search by id or word, never read whole); the code at each entry file:line. Repo root: C:/Users/Aakash Pahuja/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit

OUTPUT FILE
docs/system-map/_work/out/B-words-phone-shop-2.jsonl

ROW FORMAT (one JSON object per line; every field required; MADE-UP examples, copy the shape only)
{"kind":"finding","id":"FN-B-words-phone-shop-2-01","date":"2026-11-20","lens":"3","surface":"server","area":"server/pay","refs":["F-panel-014"],"severity":"S1","title":"A desk login can change another gym's dues","what":"Plain words.","expected":"Plain words.","evidence":["deploy/panel/joinPay.js:118-131"],"proof":"code-read","root_cause_key":"dues-save-no-gym-check","who":"owners","how_often":"every time","fix_line":"Plain words","fix_size":"small","needs_him":false,"verified":"pending","status":"open"}
{"kind":"grid","surface":"server","area":"server/pay","lens":"3","checked_on":"2026-11-20","items":[{"item":"L3.1","status":"checked","evidence":["deploy/panel/joinPay.js:118-131"],"finding_ids":["FN-B-words-phone-shop-2-01"]},{"item":"L3.9","status":"does-not-apply","reason":"no uploads here","evidence":[],"finding_ids":[]}]}
Finding: title, what, expected, who, how_often, fix_line in plain words, no file or function names. evidence: real repo path:line. root_cause_key: 3 to 6 lower-case words joined by dashes, never over 6. fix_size: the whole word small | medium | large | unknown. proof: driven | code-read | data-count | machine. refs: existing ids or [].
Grid: surface, area, lens exactly as ITEMS says. Machine evidence: machine:<file>.json#<path>. Never print a key or password: file:line only.
BEFORE YOU REPORT: node docs/system-map/_tools/lens-cover.mjs B-words-phone-shop-2 and node docs/system-map/_tools/merge.mjs B-words-phone-shop-2 --dry. Fix every line they name.

SIZE: read at most 3,000 code lines; at most 40 findings. Never read a file over 800 lines whole: search, then read 100 lines. At a limit: mark the items left could-not-check ("size limit"), write the checkpoint, report "limit reached, N items left".
