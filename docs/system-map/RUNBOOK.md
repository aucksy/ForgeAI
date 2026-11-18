# MettleUp audit: runbook for the pacer (coordinator)

Read this file and AUDIT-STATE.md only. Do not read the plan. You plan, launch, merge and write state.
You do no audit work yourself.

## Fixed rules
- Every helper: Agent call with model "fable" and effort "medium". At most 6 helpers at once.
- ANALYSIS ONLY. No app code, test, workflow, skill or setting changes. Every "apply" item is a written proposal.
- Data: only the test gym Crispy Curves (every query carries its gym id) and the database catalog. No writes.
- Never message a real person. Never press a button that sends a WhatsApp, email, SMS or push.
- Blind check: never put the held-out rows, their numbers or hints into a brief, a template, this file or
  AUDIT-STATE.md. Write "the held-out rows". Helpers read only the redacted note copies under _sources/.
- The repo to work in is a clean worktree of origin/main, never a stale checkout. Check before the first launch
  of a run: the worktree has no changes outside docs/system-map/ and is not behind origin/main.
- Nothing heavy on the laptop. Tools here are plain Node, run in seconds and exit.
- Accuracy mods stay off (model-router, effort-optimizer, input-router, research-router, efficient-browser-use
  in ~/.claude/mods/switches.json). Check at every window start that each is false.
- Message Aakash only: at the end of a phase, when something needs him, for a fast-lane bug, or once per
  weekly pause. Plain English.

## Where things are (all under docs/system-map/)
- work-items.jsonl: every work item. Changed only through _tools/state.mjs.
- _tools/state.mjs: next, start, done, fail, add, summary, reset, pct.
- _tools/merge.mjs: checks a helper's rows and merges them into the map.
- _briefs/<step>.md: brief templates (A2, A3, A4, A7, E2, E4). _briefs/rows.md: one example row per kind.
- _work/<item>.md: checkpoints. _work/out/<item id>.jsonl: helper rows. _work/rejects/<item id>.txt: rejects.
- _sources/: script-made lists and the redacted note copies.
- Lock file: D:\Apps\ForgeAI\audit-pacer.lock.
- The blind pattern file lives OUTSIDE the repo (coordinator only). Pass its path to merge.mjs with --blind.

## One pacer run
1. Quick exits: status DONE; or the lock is fresh (last beat under 75 minutes old). Then end at once.
2. Lock. Stale lock (last beat over 75 minutes old): `node _tools/state.mjs reset <dead run id>` puts every
   running item of the dead run back to todo (checkpoints and out files are kept). Then write the lock
   {run id, started, last beat}. Rewrite "last beat" at every launch, merge and limits read, and at least
   every 15 minutes while waiting.
3. Read limits (mcp__ccd_session_mgmt__get_usage): F5 = 5-hour limit, WA = Weekly all models,
   WF = Weekly Fable, each with its reset time. Fable work counts in all three.
4. Weekly pause check (see Hard stops).
5. New window (a new 5-hour reset time): add a Windows row and write F5_start. Keep the last 10 rows.
6. Compute T (see Formulas).
7. `node _tools/state.mjs next 6`. For each item, in order, launch it only if it fits (launch rule below).
   Before the launch: `node _tools/state.mjs start <id> <run id>`. Build the brief from its template.
8. Wait for the next report. Then, for that item:
   a. `node _tools/merge.mjs <id> --blind <blind pattern file>` (for A2 add `--cover <file>#<from>-<to>`).
   b. Exit 0: `node _tools/state.mjs done <id> <tokens> "<one line>"`.
      Exit 1: read _work/rejects/<id>.txt, then `node _tools/state.mjs fail <id> "<why>" <tokens>`.
      Steps whose output is not map rows (E2, E3, E4, 3F, scripts): no merge; check the output file exists.
   c. Search the item's out file and checkpoint for SQL without the Crispy Curves id (catalog queries are
      fine). merge.mjs prints a WARN line for these. Any real hit: status PAUSED, tell Aakash.
   d. If merge.mjs says "BLIND CHECK TOUCHED": the item is in _work/blind-touched.txt. Do not open the row.
      Re-run the item, or merge the rest with --allow-rejects. That finding is scored as not blind.
   e. `node _tools/state.mjs summary`, then commit and push docs/system-map/ (only that folder).
   f. Re-read limits. Go to step 6.
9. End the run when nothing fits and nothing is running. No helper outlives its run.
   Last: summary, update the status lines and the Windows row by hand, push, delete the lock.

## Building a brief
- Take _briefs/<step>.md, the text below its first line. Fill {WORK ITEM ID}, {CRISPY CURVES ID},
  {CHECKPOINT FILE}, {ITEMS} (the exact list), {INPUT FILES} (exact paths), {OUTPUT FILE} (one path).
- At most 1,200 words after filling. Do not add plan text. Do not add held-out rows or hints.
- Paste the brief. A helper never opens the plan, AUDIT-STATE.md, OWNER-INBOX.md or CLAUDE-NOTES.md.
- A2 and A3: give each helper its own feature id numbers in {ITEMS}, so ids never clash.
- A step with no template yet: write the template first (same parts: rules block, word meanings, step,
  ITEMS, INPUT FILES, OUTPUT FILE, ROW FORMAT with one made-up row, SIZE), then use it.

## Formulas (all in 5-hour-limit percent)
- S = 80 (his words, 18 Nov 2026: "only consume up to 80% of my 5 hour window by these audit tasks"). The last 20% of every window stays free for Aakash.
- hours_left = hours until the 5-hour reset. hours_gone = 5 - hours_left.
- T = F5_start + (S - F5_start) x min(1, (hours_gone + 1) / 5).
- RESERVED = the sum of cost(step) of every helper this run started that has not reported.
- Launch rule: launch a helper only if F5_now + RESERVED + cost(its step) <= T. Re-read F5 after every report.
- No open window (no reset time shown): F5_start = F5_now, hours_gone = 0. The first helper opens the
  window; read the reset time after it reports.
- A helper still running at the reset is charged to the new window. Write the new F5_start only after
  RESERVED is back to 0.
- Learned cost: record each helper's total tokens (from its Agent result) with `state.mjs done`.
  Once per window, when exactly one helper ran alone:
  PCT_PER_100K = (F5 after - F5 before) / (its tokens / 100,000). Store it: `node _tools/state.mjs pct <n>`.
  cost(step) = average tokens of that step x PCT_PER_100K / 100,000. Until known: 5.
  `summary` writes the Learned cost table from these numbers.
- If cost(step) is bigger than one hour's slice ((S - F5_start) / 5): make the items smaller.
- Projection. In window 1: WEEK_PER_F5 = (rise in the higher of WF and WA) / (rise in F5).
  AUDIT_F5 = the sum of cost(step) over every todo and running item (`summary` prints it).
  PERIODS = AUDIT_F5 x WEEK_PER_F5 / 95.
  Write "projection: N.N weekly periods of 3" in AUDIT-STATE.md. Recompute after: the first 2 windows;
  A1b; A2 + A3; the A5 pilot; the first lens pilot.
- PERIODS > 2.7: cut in this order, write each cut to DEFERRED.md with its exact scope, tell Aakash in one
  line: (1) expert panels except designer, coach and privacy; (2) lens 18; (3) lenses 7, 8, 14 to a
  script-only pass; (4) journey types 9-10 to the matrix run in CI.
  Never cut: lenses 2-6, 17, the gap hunts, 3E, 3F, 3G.

## Hard stops
- F5 >= 80: launch nothing more this window.
- F5 >= 87: tell every running helper (SendMessage) "save your checkpoint now and stop". Wait for them.
- WF >= 95 or WA >= 95: status PAUSED. Tell Aakash once: "The audit used the weekly limit. Reset it when
  you want the audit to continue." Keep checking each hour. Resume by yourself when both are under 95.
  Never message him again about the same pause.

## Pilot rule
- The first helper of every step runs ALONE: start no other helper in that run until it reports.
- Its tokens set the step's learned cost and the items per helper for the rest of the step.
- After the A2 pilot: add one A2 item per area from _sources/sizes.csv with `state.mjs add`
  (an area = one folder group of at most 12,000 lines).

## Helper size (defaults until learned costs say otherwise)
- Target: about 45 minutes, at most 15% of a 5-hour window. Every brief ends with its SIZE line.
- A helper at its limit writes its checkpoint and reports "limit reached, N items left". Make a new
  item from what is left (`state.mjs add`).

## Work items
- Status: todo, running, done, blocked. An item starts only when every id in its "needs" is done.
- `fail` the first time: back to todo; the next run restarts it from its checkpoint, never from zero.
- `fail` the second time: blocked. Split it into two smaller items (`add`). List it under Needs Aakash
  only if he is the one who can unblock it.
- A dead helper (limit hit, laptop slept): its item stays running until the stale-lock reset.
- Adding an item (PowerShell breaks quoted JSON): write the JSON to a file, then
  `node _tools/state.mjs add @<file>`. Required: id, step, item. Optional: needs, checkpoint, out_file.
- Finding ids carry the work item id (FN-<item id>-<nn>). Never reuse an item id.

## merge.mjs in short
- Six checks: each line parses and has its kind's fields; every id it points to exists; every evidence
  "file:line" is a real file and line; upsert by id (a re-run replaces, never doubles); writes
  features.json, entities.json, readers.json, promises.json, journeys/<feature id>.json, findings.jsonl,
  improvements.jsonl, LENS-GRID.json; rejects go to _work/rejects/<id>.txt.
- Any reject = the item is not done and nothing is merged (exit 1). `--dry` checks without writing.
- A row with "patch": true changes fields of an existing row (coverage, verify). Other rows may not
  overwrite a row another item wrote.

## AUDIT-STATE.md
- Keeps only: status, phase/step, expected end, mode lines, the Windows table (last 10 rows), learned
  costs, work items, Needs Aakash, resume notes. Target: under 80 lines.
- `summary` rewrites only the "Learned cost" and "Work items" tables. Edit the other lines by hand.
- Tell Aakash the expected end date in every phase report.

## Order of the work (an item's "needs" holds this)
- Now: A1b (script), the redaction (script), then the A2 pilot alone. A7 and 3E E2-E4 and 3F F1, F4-F6
  can run beside A2.
- Then: A2 per area -> A3, A4, hunt 5 (built vs live) -> A5 journeys -> A6 impact (script), A8 coverage.
- Lenses 4, 3, 5 start once A4 and A7 are done. Other lenses and hunts need A5 and A6.
- Calibration before any hunt runs on today's code. Verify (S1, S2, 1 in 5 of S3) after each phase.
- Phase B needs A8, 3E E1-E4 and the calibration. Then the blind check, then the final report. Then STOP.
- After A2 + A3: tell Aakash the real feature count and the projection line before A5 starts.
