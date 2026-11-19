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
- Work item: A5-panel-logic-2-1. Test gym Crispy Curves id: 7990a942-57f3-4154-bbaf-935bab0aa342.
- Something missing: write it under could-not-check; do not go looking.
- Checkpoint file: docs/system-map/_work/A5-panel-logic-2-1.md. Read it first; carry on after the features it lists. After EVERY finished feature add one line "<feature id>: <n> journeys, <n> type lines" and append your rows to the output file.

WORDS
- Feature: a row of features.json. Role: who uses it (the row's "roles"). Entity: one kind of stored data (id E-...). Journey: one path a role takes through a feature, step by step.
- Journey types: 1 happy (the normal way, start to finish); 2 alternate (another way in: button, deep link, notification, search; or another KIND of the same thing); 3 negative (wrong, empty, too long, duplicate input; role not allowed; plan or switch off); 4 edge data; 5 time; 6 state (new / seen / done / reopened / undone / deleted; switched on then off); 7 interrupt; 8 settings; 9 size and look; 10 upgrade; 11 cross-device; 12 privacy and promise (who else can see what it shows or stores; which promise applies).
- Template: a ready-made variant of types 4, 5, 7-11 in journey-templates.json (for example T7-back). A script turns your type lines into journeys.

STEP A5: JOURNEYS
For EACH feature in ITEMS:
1. Read its row in features.json (search by id). Status not-a-feature: skip it. Open the code at EVERY entry point (file:line, at most 100 lines each; one call deeper when the save or the words live there). Use the real button and title words.
2. For EACH role (spelled exactly as in the row) write journeys in full:
   - types 1, 3 and 6: at least one each, always. No input or no state: the journey shows what the role sees instead (the refusal, the unchanged screen).
   - type 12: one journey, or a type line "no" with the reason.
   - type 2: one journey per other real entry point in "entry" and per other kind; none = a type line "no".
   Expect 3 to 5 journeys per role. Every step: action, user_sees (exact words where known), must_not (at least one thing that must NOT happen).
   writes / reads: entity ids. Search entities.json by table or name; only ids that exist. None fits: leave it out, say so in the checkpoint.
   promise_ids: search promises.json for the feature's key words (2 or 3 searches); link only promises this journey touches.
3. For EACH role write ONE type line (kind jtype) for EACH of types 4, 5, 7, 8, 9, 10, 11. Either applies "yes" with the template ids that fit, at_step (the step of YOUR happy journey where it bites) and the entity at risk; or "no" with a real reason in why_not. Pick only variants that can change the result here, never all by habit.
4. A clear bug seen while reading (the code plainly does the wrong thing): ONE finding row. Shape: docs/system-map/_briefs/rows.md, part "finding"; id FN-A5-panel-logic-2-1-<nn>; lens "A5". At most 3 per work item. Do not hunt. Not sure = a "seen in passing" line in the checkpoint.

ITEMS
The 9 features (18 feature x role pairs) listed in docs/system-map/_work/items/A5-panel-logic-2-1.txt, one per line: feature id | name | first entry point. Area: panel / panel/logic-2. Do them in the order of the file.

INPUT FILES
docs/system-map/features.json, entities.json and promises.json (search only, never read whole); docs/system-map/journey-templates.json (read it whole: 42 short lines); docs/system-map/_briefs/rows.md (only for a finding row); the code at each entry point. Repo root: C:/Users/Aakash Pahuja/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit

OUTPUT FILE
docs/system-map/_work/out/A5-panel-logic-2-1.jsonl

ROW FORMAT (one JSON object per line; every field required; MADE-UP examples, copy the shape only)
{"kind":"journey","id":"J-F-panel-014-01","feature":"F-panel-014","role":"staff","type":1,"generated":false,"start":"Members list, a member with dues","steps":[{"n":1,"action":"Tap the member, tap Collect","user_sees":["Sheet titled 'Collect dues'"],"must_not":["Amount is zero when dues exist"]}],"writes":["E-payment"],"reads":["E-member"],"promise_ids":[],"tests":[],"coverage":"unknown","last_result":null}
{"kind":"jtype","id":"JT-F-panel-014-staff-7","feature":"F-panel-014","role":"staff","type":7,"applies":"yes","why_not":"none","variants":["T7-back","T7-doubletap"],"at_step":1,"entity":"E-payment","note":"Save has no busy state"}
{"kind":"jtype","id":"JT-F-panel-014-staff-5","feature":"F-panel-014","role":"staff","type":5,"applies":"no","why_not":"no time edge: nothing is dated","variants":[],"at_step":0,"entity":"none","note":"none"}
Journey id: J-<feature id>-<nn>; nn counts on through all roles. Type line id: JT-<feature id>-<role, lower case, other characters as one dash>-<type>. "entity": an entity id, "unknown" or "none".

SIZE: your ITEMS only. Read at most 3,000 code lines. Write at most 300 rows. Never read a file over 800 lines whole: search first, then read the 100 lines you need. At a limit: write the checkpoint and report "limit reached, N items left".
