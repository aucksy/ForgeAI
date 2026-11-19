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
- Checkpoint file: docs/system-map/_work/T-A5.md: add a line after every finished part.
- Report in at most 15 plain lines: files written, how each was tested, anything the coordinator must decide.

YOUR JOB: make step A5 (journeys) ready to run. The step text, word for word:
-----
### A5. Journeys (1 helper per 10-15 features; the biggest step)
For every feature x every role that uses it, write journeys of every type below. A type that cannot apply gets
one line saying why ("no time edge: nothing is dated").

**4.2 Journey types (the checklist, do all 12):**
1. **Happy**: the normal way, start to finish.
2. **Alternate**: every other way to reach the same end (another button, deep link, from a notification, from search). Also every KIND of the same thing: built-in vs user-made items, every type or category (for workouts: routine vs empty workout, library vs custom exercise, normal / warm-up / drop sets). [tightened 18 Nov 2026]
3. **Negative**: wrong input, empty input, too long, duplicate, not allowed for this role, plan/feature off.
4. **Edge data**: zero, one, many (500+), longest name/text, Hinglish, emoji, missing photo/logo, money edge
   (part-paid, refund, zero price), dates at plan start/end.
5. **Time**: 23:59 / 00:00 IST, 1st of month, Monday, plan ends today, joined today (the 15 Nov bug), daylight on
   phone set to another zone.
6. **State**: item new / seen / done / reopened / undone / deleted; feature switched on then off.
7. **Interrupt**: back button, app closed mid-way, phone locked, call comes in, no internet then back, double tap,
   two staff at once on two devices.
8. **Settings**: every setting that changes this journey, before and after the change (language, theme, units,
   alerts, permissions not granted).
9. **Size/look**: phone 360 and 390 px, tablet, laptop; largest font; dark and light; English and Hinglish.
10. **Upgrade**: user on the old version updates mid-journey; old saved data opens in the new version.
11. **Cross-device**: phone + watch, panel on phone + panel on laptop, member app + gym panel.
12. **Privacy and promise**: who else can see what this journey shows or stores; does any promise text apply
    (link `promise_ids`); is personal data kept only as promised.

**Two tiers.**
Tier 1, written in full by the helper: types 1 Happy, 3 Negative, 6 State, 12 Privacy and promise, and
type 2 Alternate only where another real entry point exists in the A1b list. Expect 3-5 per feature x role.
Tier 2, generated: types 4, 5, 7, 8, 9, 10, 11. docs/system-map/journey-templates.json holds one template
per type variant (about 40 in all, written once by the coordinator from the checklist above; e.g.
T7-back "press back at step {n}; must NOT: half-saved {entity}"). For each feature x role the helper writes
ONE line per type: {feature, role, type, applies: yes|no, why_not, variants[], at_step, entity, note}.
docs/system-map/_tools/expand.mjs turns each "yes" line into journey rows marked "generated": true, built on
the Tier 1 happy journey's steps.
A generated journey that B2 or a lens finds interesting is promoted: a helper rewrites it in full.

For every step write "user sees" (exact words/buttons where known) and at least one "must NOT happen" line.
Fill `writes[]` and `reads[]` with entity ids.
- Done when: every feature x role has a happy + negative + state journey in full; every one of the 12 types has either
  journeys or a why_not line; every Tier 1 journey lists writes/reads.
-----
Facts: docs/system-map/features.json has 1,315 rows (status live 918+, behind switch 216, hidden 41, unknown, not-a-feature 59); each has id, surface, area, name, roles, entry[]. entities.json, readers.json and promises.json exist. Learned cost: one helper holds about 150-250k tokens in all.
Make these files:
1. docs/system-map/journey-templates.json: one template per variant of the Tier 2 types 4, 5, 7, 8, 9, 10, 11 (about 40 in all), each {id (for example T7-back), type, variant, text with {n} {entity} {feature} holes, must_not}.
2. docs/system-map/_briefs/A5.md: the helper template. The helper gets 6 to 10 features (ITEMS). For each feature x role it writes the Tier 1 journeys in full (kind "journey", see rows.md) and ONE type line for each Tier 2 type. Decide the type-line row shape (suggest kind "jtype", id JT-<feature id>-<role>-<type>) and make merge.mjs accept and store it (journeys/<feature id>.json or a file of its own). The helper must read the code at the feature's entry points (exact lines), use real button words where the code shows them, fill writes[] and reads[] with entity ids that exist, link promise_ids from promises.json by search. Not-a-feature rows get no journeys. The brief must tell the helper to write one line per finished feature in its checkpoint, and that a clear bug seen while reading is one finding row (shape in rows.md) or a "seen in passing" line: choose one and say why in your report.
3. docs/system-map/_tools/expand.mjs: turns every "applies: yes" type line into journey rows marked "generated": true, built on that feature x role's Tier 1 happy journey steps and the template text. Idempotent (a re-run replaces, never doubles).
4. docs/system-map/_work/a5-items.mjs: groups the features (skip not-a-feature) by surface and area into work items of N features (N is one number at the top; start with 8), writes _work/items/<id>.txt (one line per feature: id | name | first entry) and _work/briefs/<id>.md through mkbrief.mjs, and prints one state.mjs "add" JSON per item into _work/a5-add/<id>.json. Item ids: A5-<surface>-<area short name>-<n>. It takes an argument "--only <id>" to make just one item (for the pilot) and "--all" for the rest. Run it with --only for ONE small phone or panel area and check the brief's word count; do not run --all.
5. A done-check the coordinator can run after a helper reports: every feature in the items file x every role has a happy (1), a negative (3) and a state (6) journey, and every Tier 2 type has a type line. Put it in merge.mjs as an option (for example --a5cover <items file>) or in a small script; say which.
