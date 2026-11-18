# Plan review: full system audit plan (reviewed 18 Nov 2026)

1. The plan's scope is right, but as written it cannot run inside 3 weekly periods: about 450 helper runs, each told to read a 17,000-token plan, on a code base of about 300,000 lines, with 1,500-3,000 hand-written journeys.
2. Biggest fixes: helpers get a short pasted brief and never open the plan (P3); scripts list routes, screens, database functions and tests before any model reads (P6, P16-P19); journeys come from templates (P7); one output file per helper (P5).
3. Phase B clashes with "analysis only": the ugly data pack and the matrix it needs were never built, and driving journeys needs new tests or live writes. This needs his decision (P2).
4. The pacer can double-launch and overshoot: it ignores helpers already running, its lock can go stale under a live run, and cost per helper cannot be learned while 6 run at once (P9, P10).
5. 26 proposals: 22 "apply", 4 "needs Aakash" (P2, P23, P24, P25). Facts measured in the repo on 18 Nov are marked "(measured)"; token figures are rough estimates.

Measured in the repo (18 Nov 2026): panel source 93,000 lines; phone app source 147,000 lines; server Worker folder 20,000 lines; database migrations 24,000 lines with 569 functions and 105 tables; 289 Maestro flows; 100 panel e2e specs; 610 unit test files; docs/OWNER-INBOX.md is 360 KB (about 90,000 tokens); docs/CLAUDE-NOTES.md is 133 KB. No ugly data pack, no docs/changes/ cards, no ESCAPES.jsonl exist yet.

---

## P1. Remove every "apply / build / commit" step that the analysis-only rule forbids
- **Section:** 3E (E5 and the closing note), 3F (F7), 4 (B3), 3 (A6), 6 (item 0).
- **Problem:** Section 5 says the audit changes no code, tests, workflows, skills or settings, but E5, F7, B3 and A6 still tell a helper to apply, commit tests, or add a CI job. A medium-effort helper obeys the line in its own step. (His own lesson: superseded lines get obeyed; fix the line itself.)
- **Exact change:**
  - Replace E5 with: `E5. PROPOSALS ONLY in this run. Do not change any test, flow or workflow. TEST-SYSTEM-REVIEW.md lists each proposal with: files it would touch, the exact change in words, hours saved per release. The "measure again for 2 weeks" step moves to Phase C (Opus).`
  - Replace "Note for E1-E5: these change tests and CI only, so they are allowed during the audit freeze." with: `Note for E1-E5: analysis only. E1-E4 read run history and write files under docs/system-map/. Nothing under apps/, deploy/, supabase/, scripts/ or .github/ changes.`
  - In F7 replace "Apply the "apply" ones to the skill, questions and hook (tooling, allowed in the freeze)." with: `Do not edit the skill, the questions, the hook or the switch. Each "apply" proposal carries the exact text to paste, for Phase C.`
  - Replace B3's body with: `B3. Proposals only. For each driven journey write docs/system-map/test-proposals/<journey id>.md: the steps driven, what was checked at each step, the selectors or words used. No file under any test folder. Opus turns these into tests in Phase C.`
  - In A6 replace "Build `scripts/system-map/impact.mjs`" with `Build docs/system-map/_tools/impact.mjs (audit tooling, not app code)` and replace "Done when: the script runs in CI and its output is committed." with `Done when: the script runs on the laptop in seconds (one Node process, JSON in, JSON out, exits) and impact.json is committed. Wiring it into CI is Phase D item 2 (Opus).`
  - In section 2 replace `scripts/system-map/impact.mjs` with `docs/system-map/_tools/impact.mjs`.
  - In section 6 item 0 add: `The generator is docs/system-map/_tools/product-map.mjs (same rule: seconds, on the laptop, no CI change).`
- **Risk removed:** a helper committing tests or editing the change-360 hook during the freeze. 
- **Mark:** apply

## P2. Phase B cannot run as written
- **Section:** 4 (B1, B2, B4), section 0 ("No live database change").
- **Problem:** (a) B1 runs suites "on the ugly data pack and the matrix", but neither exists in the repo (measured), and building them is a test change. (b) B2 drives uncovered journeys with Playwright or Maestro in CI, which needs new test files pushed. (c) Driving a writing journey (collect dues, add member) in Crispy Curves changes the live database, which section 0 forbids. (d) Driving by hand in a browser costs roughly 20,000-50,000 tokens per journey; 1,000 uncovered journeys would cost more than the whole budget.
- **Exact change (after his choice):** replace B1 and B2 with:
  - `B1. Read, do not re-run: for each journey with tests[], take last_result from the newest finished run of that test on main (GitHub API script, docs/system-map/_tools/last-results.mjs -> _sources/last-results.csv). Start a fresh run of an existing workflow only if the newest run is older than the last app commit.`
  - `B2. Prove by code trace first: for every journey with coverage none/partial, a helper follows the code path step by step and writes last_result {proof: "code-read", pass/fail/unsure, file:line per step}. Then drive only the top N journeys by impact (N = his choice below).`
- **My view:** two options.
  1. **Recommended: drive the top 150 journeys through throwaway specs on a scratch branch.** The specs live on a branch named `audit-drive` that is never merged; the existing CI workflows are started on that branch. Main stays untouched, pictures come back as CI files, and each driven journey costs about 8,000-15,000 tokens. Writes go only to the demo gym. This bends "no tests change" (the branch holds test files), so it needs his yes.
  2. **Strictly nothing new: code trace only, plus about 40 journeys driven by hand in the browser on the demo gym.** Cheaper to approve, but most findings will read "found by reading the code, not proven on a screen".
  Either way, add to section 0: `Never press a button that sends a WhatsApp, email, SMS or push to a real person. Never write in Crispy Curves; writes happen only in the demo gym.` If he wants writes allowed in Crispy Curves, that is a third thing only he can allow.
- **Risk removed:** Phase B stalling on day one; live data changed by the audit; real members messaged.
- **Mark:** needs Aakash

## P3. Helpers never open the plan file; every brief is pasted from a short template
- **Section:** 0 (the block), 8C.
- **Problem:** The block says "Read sections 0, 1 and your own step in that file". The plan is about 17,000 tokens, and a medium-effort helper will read all of it. Over about 450 helper runs that is roughly 7 million tokens, more than Phase A. The plan also names the blind-check file and lists the calibration answers. Two lines in the block also contradict 8C (effort; helpers cannot read the usage meter).
- **Exact change:** in the section 0 block:
  - Replace lines 1-2 with: `YOU ARE RUNNING ONE STEP OF THE METTLEUP FULL SYSTEM AUDIT. Everything you need is in this brief. Do NOT open any file under D:\Brain\Dev-Framework\, docs/OWNER-INBOX.md, docs/CLAUDE-NOTES.md or docs/system-map/AUDIT-STATE.md. Do only your step.`
  - Replace "Stop and report when: your step is done; you hit 85% of the 5-hour or weekly limit; or something needs him." with: `Stop and report when: your items are done; you have used your size limit (see SIZE in this brief); the coordinator tells you to stop; or something needs him.`
  - Replace "Run at the main chat's effort (pass effort on every Agent call). At most 6 helpers in total at once." with: `You are one helper on Fable 5.2 at medium effort. Do not start helpers of your own.`
  - Add: `ANALYSIS ONLY: change no file outside docs/system-map/. No commit, no push (the coordinator does both).`
  - Add after the block: `The coordinator builds each brief from docs/system-map/_briefs/<step>.md: this block + the 8 word meanings the step uses (not all of section 1) + the step text + ITEMS (exact list) + INPUT FILES (exact paths) + OUTPUT FILE (one path) + ROW FORMAT with one example row + SIZE. A brief is at most 1,200 words.`
- **Tokens saved:** about 15,000 per helper, roughly 6-7 million over the audit.
- **Mark:** apply

## P4. The coordinator runs from a 150-line runbook and a machine-read ledger
- **Section:** 8C ("Two scheduled tasks", "AUDIT-STATE.md format", "One pacer run").
- **Problem:** Each hourly pacer run starts with an empty memory. To act it must re-read the plan (17,000 tokens) and a state file whose work-item table will grow to 400+ rows and be rewritten by hand each run. Over about 300 runs that is 5-8 million tokens of coordinator reading, and a hand-rewritten table loses rows.
- **Exact change:** add to 8C:
  ```
  **Coordinator files.**
  - docs/system-map/RUNBOOK.md (at most 150 lines): the pacer loop, the formulas, the hard stops, where the brief
    templates are. The pacer task prompt says: "Read RUNBOOK.md and AUDIT-STATE.md only. Do not read the plan."
  - docs/system-map/work-items.jsonl: one line per work item
    {id, step, item, needs[] (item ids that must be done first), status (todo|running|done|blocked),
     owner_run, tries, checkpoint, out_file, cost_tokens, result_line}.
  - docs/system-map/_tools/state.mjs (seconds, laptop): `next 6` prints the next runnable items (all needs done);
    `start <id> <run>`, `done <id> <tokens> "<line>"`, `fail <id> "<why>"`; `summary` rewrites the three tables
    in AUDIT-STATE.md. The coordinator never edits the tables by hand.
  - AUDIT-STATE.md keeps only: status, phase, expected end, the Windows table (last 10 rows), learned costs,
    Needs Aakash. Target size under 80 lines.
  - An item that failed twice becomes `blocked` with the reason and is listed under Needs Aakash only if he is
    the one who can unblock it; otherwise the coordinator splits it in two smaller items.
  ```
- **Tokens saved:** about 15,000-25,000 per pacer run; removes lost or duplicated work items.
- **Mark:** apply

## P5. One output file per helper; a script merges and checks
- **Section:** 2 (file table), 3B, 8C ("output rows go straight into the step's JSON/JSONL files").
- **Problem:** Up to 6 helpers write into the same journeys.json, features.json and findings.jsonl at once. Edits overwrite each other, ids collide, and one bad comma breaks the whole file. journeys.json at 2,000+ rows would be about 1 million tokens: no helper can open it again.
- **Exact change:** add to section 2:
  ```
  **Who writes what.** A helper writes ONLY docs/system-map/_work/out/<work item id>.jsonl (one JSON object per
  line, with a "kind" field: feature | entity | reader | journey | promise | finding | improvement | grid) and its
  checkpoint file. Ids carry the work item: finding id = FN-<work item id>-<nn>, so two helpers can never clash.
  After each helper report the coordinator runs docs/system-map/_tools/merge.mjs, which:
  1. checks every line parses and has the required fields for its kind;
  2. checks every id it points to exists (feature, entity, journey, promise);
  3. checks every evidence "file:line" exists in the repo and the line number is inside the file;
  4. upserts by id (a re-run after a dead helper replaces rows, never doubles them);
  5. writes the kept files, split so each stays readable: features.json, entities.json, readers.json,
     promises.json, journeys/<feature id>.json, findings.jsonl, improvements.jsonl, LENS-GRID.json;
  6. prints rejected lines to _work/rejects/<work item id>.txt. Any reject = the item is not done.
  ```
  In 8C replace "its output rows go straight into the step's JSON/JSONL files" with `its output rows go into its own _work/out/<work item id>.jsonl, appended after every finished unit`.
- **Risk removed:** corrupt or half-merged map files; invented file paths (check 3 catches them for free).
- **Mark:** apply

## P6. A2 and A4 start from one script, not from a helper reading a whole surface
- **Section:** 3 (A2, A4).
- **Problem:** "1 helper per surface" asks one helper to take in the phone app (147,000 lines, about 1.9 million tokens) or the panel (93,000 lines). It cannot. Also the helper writes both the grep list and the features, so the done-check marks its own homework.
- **Exact change:** add before A2:
  ```
  ### A1b. Source lists (coordinator, script, no model reading)
  docs/system-map/_tools/sources.mjs writes one line per item, "kind | name | file:line", into
  docs/system-map/_sources/<surface>.txt:
  - panel: every folder and screen file under apps/dashboard/src/crm, every route or tab name in CrmApp.tsx,
    every component whose name ends in Sheet, Dialog, Drawer or Modal, every call to .rpc( or .from(.
  - phone: every file under apps/mobile/src/app (each file is a screen), every notification channel id,
    every background task name, every deep link pattern, every settings key written to local storage.
  - watch: every Activity, Service, Tile and Complication in apps/mobile/android/wear.
  - server: every route string in deploy/panel/*.js and deploy/hq, every "create function" and "create table"
    in supabase/migrations (569 and 105 today), every cron in .github/workflows and in the database.
  - words: every message template and every What's new entry.
  The script also writes _sources/sizes.csv (folder, files, lines) so items can be sized (see P8).
  ```
  In A2 replace "1 helper per surface" with `1 helper per AREA (an area = one folder group from sizes.csv of at most 12,000 lines; the panel is about 8 areas, the phone about 12, the server about 5)` and replace the "Done when" text in brackets with `(the list comes from A1b, not from the helper; merge.mjs fails the item if any A1b line of its area has no feature)`.
  In A4 replace "grep every place that reads it" with `take the reader candidates from _sources/readers-raw.txt (sources.mjs: every .from('<table>') and .rpc('<function>') call with file:line, grouped by table) and classify each: kind, surface, or "not a reader" with the reason`.
- **Tokens saved:** roughly 1-2 million in A2 and A4; the done-check becomes independent.
- **Mark:** apply

## P7. A5 journeys: write the core by hand, generate the rest from templates
- **Section:** 3 (A5), 2 (journeys row), 8.
- **Problem:** 150-250 features x roles x 12 types is 3,600+ slots. At 300-400 output tokens per full journey, 2,000-3,000 journeys cost about 1 million output tokens before any reading, and seven of the twelve types are the same check repeated per feature (360 px, back button, 23:59, Hinglish).
- **Exact change:** add to A5 after the 12 types:
  ```
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
  ```
  Replace the "Done when" line with: `Done when: every feature x role has a happy + negative + state journey in full; every one of the 12 types has either journeys or a why_not line; every Tier 1 journey lists writes/reads.`
  In section 8 replace "1,500-3,000 journeys" with `about 600-1,000 written journeys plus about 1,500-2,500 generated ones`.
- **Tokens saved:** about 60% of A5 output (roughly 0.6-0.8 million), and A8 only has to match tests against Tier 1 plus the templates.
- **Mark:** apply (same coverage rule: every type is written or has a "why not" line)

## P8. A size limit in every brief, and a pilot before each step fans out
- **Section:** 8C (pacing rule), each step header in 3, 3B, 3C, 3D.
- **Problem:** "1 helper per surface" and "1 helper per 10-15 features" are not sized. A helper that reads 40,000 lines burns a third of a window and dies without a report. The plan says to brief smaller items only after the cost is learned the hard way.
- **Exact change:** add to 8C:
  ```
  **Size of one helper (target: about 45 minutes, at most 15% of a 5-hour window).**
  Every brief ends with a SIZE line. Defaults until learned costs say otherwise:
  | step | items per helper | read at most | write at most |
  | A2 features | 1 area (<= 12,000 lines) | the A1b list + 2,500 code lines | 40 features |
  | A3 human side | 1 source (help, What's new, website, Play listing, backlog copy) | that source | 60 rows |
  | A4 entities/readers | 12 tables | 250 reader candidates | 250 rows |
  | A5 journeys | 6 features | 2,000 code lines | 30 full journeys + type lines |
  | A7 promises | 1 source group, <= 120 candidate sentences | 1,500 lines | 120 rows |
  | A8 coverage | 40 Tier 1 journeys | 25 test files | 40 rows |
  | lens / gap hunt cell | 1 area x 1 lens bundle | 2,500 code lines, 25 pictures | 40 findings |
  | expert panel | 1 role x 1 surface | 25 pictures + journey titles | 25 improvements |
  | verify (P12) | 25 findings | 100 lines per finding | 25 verdicts |
  | report cards | 30 findings | findings rows + pictures | 30 cards |
  When a helper reaches a limit it writes its checkpoint, reports "limit reached, N items left", and the
  coordinator makes a new work item from what is left. A helper never reads a file over 800 lines whole:
  it searches first, then reads the 100 lines it needs.
  **Pilot.** The first helper of every step runs ALONE (no other helper started in that pacer run until it
  reports). Its token count sets the step's learned cost and the items-per-helper for the rest of the step.
  ```
- **Risk removed:** dead helpers and lost half-hours; the 15% rule becomes something a brief can state.
- **Mark:** apply

## P9. Pacer: count running helpers, keep one live coordinator, learn cost in tokens
- **Section:** 8C (budget for this hour, lock, one pacer run).
- **Problem:** five things can break the pacing.
  1. The launch test `F5 + cost <= T` ignores helpers already running. Six launched at the same reading can spend 6 x their cost and jump past both T and the 85 line.
  2. A helper started by one scheduled run cannot be reached by the next run (no SendMessage, no report). If the run ends while helpers work, their reports are lost.
  3. The lock "refreshed every ~20 minutes" is refreshed by nobody while the coordinator waits for a helper. After 75 minutes the next run treats it as stale and starts a second coordinator: 12 helpers, the same item run twice.
  4. Cost "in 5-hour %" cannot be read per helper when 6 run together or when he uses Claude in the same hour.
  5. When no 5-hour window is open, the meter shows no reset time, and hours_gone is undefined.
- **Exact change:** in 8C:
  - Replace the launch line with: `Launch a helper only if F5_now + RESERVED + cost(that step) <= T, where RESERVED = the sum of the learned cost of every helper this run started that has not reported yet. Re-read F5 after every report.`
  - Add: `One pacer run stays alive until every helper it started has reported or been stopped. It loops: launch what fits -> wait for the next report -> merge, state, push -> re-read limits -> launch again if F5_now + RESERVED + cost <= T. It ends when nothing fits and nothing is running. No helper outlives its run.`
  - Replace the lock paragraph with: `Lock: D:\Apps\ForgeAI\audit-pacer.lock holds {run id, started, last beat}. The run rewrites "last beat" every time it launches, merges or re-reads limits, and at least every 15 minutes while waiting (it wakes on a timer, not only on reports). A lock whose last beat is over 40 minutes old is stale. A run that finds a stale lock first sets every "running" item of the dead run back to "todo" (its checkpoint and out file are kept), then takes the lock. Every helper brief has a 45-minute size limit, so a live run can never look stale.`
  - Replace "Learned cost = the average 5-hour-% one helper of that step cost so far (write it after each helper; start at 5% until known)" with: `Learned cost: record each helper's total tokens from its Agent result. Once per window, when exactly one helper ran alone (the pilot in P8 gives this for free), compute PCT_PER_100K = (F5 after - F5 before) / (its tokens / 100,000). cost(step) = average tokens of that step x PCT_PER_100K. Start at 5% until known.`
  - Add: `No open window (no 5-hour reset time shown): treat F5_start = F5_now, hours_gone = 0. The first helper opens the window; read the reset time after it reports.`
  - Add: `A helper still running when the window resets is charged to the new window; write F5_start for the new window only after RESERVED is back to 0.`
- **Risk removed:** overshooting 85%, twin coordinators, lost reports, a stalled first run.
- **Mark:** apply (S = 85, the target formula and the weekly 95 pause stay as he set them)

## P10. Make the budget checkpoint a formula with numbers, and run it before A5
- **Section:** 8C (BUDGET CHECKPOINT), 8 (tokens), 9 (item 5).
- **Problem:** "project the whole audit in weekly periods" has no formula, and the 5-hour meter says nothing about how much of the week one window costs. The projection is also due only after 2 windows and after A2+A3, while the big spenders (A5, lenses, hunts) are sized later.
- **Exact change:** add to the BUDGET CHECKPOINT bullet:
  ```
  How to project. In window 1 record WEEK_PER_F5 = (rise in the higher of WF and WA) / (rise in F5) over the
  window. Then: AUDIT_F5 = sum over all todo items of cost(step);  PERIODS = AUDIT_F5 x WEEK_PER_F5 / 95.
  Recompute after: the first 2 windows; A1b (real line and item counts); A2+A3 (real feature count);
  the A5 pilot; the first lens pilot. Write the line "projection: N.N weekly periods of 3" in AUDIT-STATE.md
  each time. If PERIODS > 2.7 (10% kept back for re-runs after 3G and calibration), cut in the order below.
  First guess before any run, to be replaced: about 340 helper runs (A: 95, lenses: 95, hunts: 50,
  experts: 35, 3E/3F/calibration: 12, verify + report: 25, B: 30) at 5% each = 1,700 F5-% = 20 full windows.
  ```
  In section 9 item 5 replace "before starting A5" with `before starting A5, with the projection line`.
- **Flag only (his decision, unchanged):** the weekly pause at 95% leaves him about 5% of the week for his own use until he resets, while each 5-hour window keeps 15% for him.
- **Risk removed:** finding out in week 3 that the audit needs 5 periods.
- **Mark:** apply

## P11. The blind check leaks today: close it with a redacted copy and a no-read list
- **Section:** 3G (G1), 3 (A3), 3D (calibration), section 0.
- **Problem:** The held-out row numbers appear in docs/OWNER-INBOX.md, docs/CLAUDE-NOTES.md and docs/system-map/AUDIT-STATE.md (measured by file name only; rows not read). A3 tells a helper to read the backlog and "skip" those rows, and A3 plus the calibration tell helpers to read CLAUDE-NOTES. A model cannot un-read a row. Any search across docs/ also lands on them. A found item would then prove nothing.
- **Exact change:** add to 3G:
  ```
  G0. Before any helper starts, the coordinator runs docs/system-map/_tools/redact.mjs (it never prints what it
  removes). It writes _sources/owner-inbox-redacted.md and _sources/claude-notes-redacted.md: the originals minus
  every table row, heading block or paragraph that contains a held-out id. It prints only counts.
  Helpers read ONLY the redacted copies. Section 0 names docs/OWNER-INBOX.md, docs/CLAUDE-NOTES.md,
  docs/system-map/AUDIT-STATE.md and D:\Brain\Dev-Framework\ as never-open, and every brief says: "search
  inside the folders your brief names, never across docs/".
  AUDIT-STATE.md, RUNBOOK.md and every brief template must not contain the held-out ids: write "the held-out
  rows" instead. merge.mjs rejects any helper row that contains a held-out id pattern and flags the item
  "blind check touched" so that finding is scored as not blind.
  ```
  In A3 replace "OWNER-INBOX feature backlog" with `_sources/owner-inbox-redacted.md` and "CLAUDE-NOTES R-notes of the last 60 days" with `_sources/claude-notes-redacted.md (last 60 days)`.
- **Also:** OWNER-INBOX is about 90,000 tokens. redact.mjs should also split the redacted copy into parts of at most 600 lines so one A3 helper takes one part.
- **Risk removed:** a blind-check score that means nothing; saves about 60,000 tokens per A3 helper.
- **Mark:** apply

## P12. Add a verify step and a de-duplicate step before anything reaches the report
- **Section:** new step between 3D and 4, and section 5 (HIS REPORT).
- **Problem:** 20 lenses, 10 hunts, 12 experts and the journeys all look at the same code, so one fault will be written up 5-10 times. A medium-effort helper reading code will also report things that are not true. Without a check, the report is long and partly wrong, and he cannot tell which cards to trust.
- **Exact change:** add:
  ```
  ## 3H. Verify and merge findings (after each phase, and again before the report)
  H1. Merge by script: docs/system-map/_tools/dedupe.mjs groups findings whose evidence is the same file within
      30 lines, or whose "root_cause_key" matches (see P20). Output: finding-groups.jsonl
      {group id, member finding ids, lenses that found it, worst severity}.
  H2. Verify every S1 and S2 group, and a 1-in-5 sample of S3: a helper that did NOT write the finding gets only
      the claim ("what happened", "expected") and the evidence pointer. It reads the exact lines and the callers
      and answers: verified: true | false | unsure, proof: driven | code-read | data-count, and one line why.
      "false" groups move to findings-rejected.jsonl (kept, never deleted). "unsure" stays, marked as such.
  H3. If more than 1 in 4 of a helper's sampled S3 findings are false, verify all of that work item's findings.
  H4. Only verified or unsure groups get a report card. The card says "proven on screen", "found by reading the
      code" or "not confirmed yet".
  The report's count line reads: N problems found, M confirmed, K could not be confirmed.
  ```
- **Risk removed:** a report with repeated and false cards; Opus fixing things that were never broken.
- **Mark:** apply

## P13. Lens grid: decide "does not apply" once, number the checklist items, bundle lenses that read the same code
- **Section:** 3B (first paragraph and the table), 3D.
- **Problem:** (a) "Every lens over every surface" is about 9 x 30 = 270 cells; many cannot apply (watch x money, Play listing x speed) and each still costs a helper. (b) "Checked only when every item has a line in the evidence" cannot be checked: the items are prose split by semicolons. (c) One helper per lens per surface re-reads the same code up to 30 times.
- **Exact change:** add to 3B before the table:
  ```
  **Grid set-up (coordinator, once, after A2).**
  1. lens-items.json: split each lens and hunt cell at every ";" and sentence end into numbered items
     (L3.1 "every server route and RPC: who can call it", L3.2 ...). An item id never changes.
  2. applies.json: for each surface x lens/hunt write yes, or "no: <reason in 10 words>". A "no" cell is filled
     in the grid as "does not apply: <reason>" and costs no helper. He sees the list of "no" cells in the
     Phase A summary.
  3. Bundles (one helper reads an area once and answers several lenses): B-sec = lenses 3 + 19;
     B-run = lenses 6 + 15 + hunt 8; B-truth = lenses 2 + 17 + hunt 9; B-alerts = lens 11 + hunts 2 + 3 + 4;
     B-words = lens 10 + hunt 10; B-time = lenses 13 + 20 + hunt 7; B-switch = hunts 1 + 6. Lenses 4, 5, 7, 8,
     9, 12, 14, 16, hunt 5 run alone. Big surfaces run a bundle per AREA (see A2), small ones per surface.
  4. A grid row: {surface, area, lens, items: [{item, status: checked | does-not-apply | could-not-check,
     evidence, finding_ids[]}]}. "could-not-check" needs the reason and goes into DEFERRED.md.
  merge.mjs fails a lens work item if any of its item ids has no row.
  ```
  In the goal paragraph replace "An empty cell means the audit is not finished." with `An empty cell means the audit is not finished; a cell may be "does not apply" (with its reason) or "deferred to Opus" (listed in DEFERRED.md).`
- **Tokens saved:** about 60-80 cells that do not apply (roughly 1.2-2 million) and about a third of the reading in the bundled cells.
- **Mark:** apply

## P14. State the order as a needs-table, and move three steps earlier
- **Section:** 3 ("Order matters"), 3B (order line), 6 (item 0), 9.
- **Problem:** The order is implied, and three things are out of place. (1) features.json "status (live / behind switch / hidden)" and PRODUCT-MAP "live or not" at the end of Phase A need gap hunt 5 (built vs live), which is listed after Phase A. (2) Journeys must link promise ids, so A7 has to finish before A5, but it is listed after. (3) 3E (E1-E3) and 3F (F1, F4-F6) need nothing from the map and can fill early windows while A1b and pilots run.
- **Exact change:** replace "Order matters. Each step names its input, output, how, and "done when"." with:
  ```
  Order (work-items.jsonl "needs" follows this table; nothing starts before its needs are done):
  | step | needs | can run beside |
  | A1 surfaces | - | E1, F1 |
  | A1b source lists (script) | A1 | E1-E3, F1, F4-F6 |
  | A2 features per area | A1b | A7, E2-E4 |
  | A3 human side | A2 | A4, A7 |
  | A4 entities + readers | A2 | A3, A7 |
  | A7 promises | A1b (word lists) | A2-A4 |
  | hunt 5 built vs live (now "A4b") | A2 | A4 |
  | A5 journeys | A2, A3, A4, A7, A4b | - |
  | A6 impact (script) | A5 | A8 |
  | A8 coverage | A5 + test index (P17) | lenses |
  | PRODUCT-MAP (script) + Phase A summary | A5, A6, A8, A4b | - |
  | lenses 4, 3, 5 | A4, A7 (not A5) | A5 |
  | other lenses, hunts 1-4, 6-10 | A5, A6 | each other |
  | calibration | hunts written; before any hunt runs on today's code | A5 |
  | expert panels | pictures index (P22), A5 | lenses |
  | 3H verify + merge | each phase's findings | - |
  | Phase B | A8, 3E E1-E4, calibration | - |
  | 3F F2-F3 | calibration, 3H | - |
  | 3G blind check | Phase B, 3H | - |
  | final report | 3G | - |
  ```
  Lenses 4, 3 and 5 are moved up beside A5 because they hold the S1 risks and need only entities and promises; if the budget runs short, the S1 work is already done.
- **Risk removed:** a PRODUCT-MAP with empty "live" columns; journeys with no promise links; idle early windows.
- **Mark:** apply

## P15. Calibration: make it runnable and stop it from seeing the answers
- **Section:** 3D (calibration paragraph).
- **Problem:** (a) The seed bug list sits in the same section the hunt helper is told to read, and hunt 1's "seed pairs" name one of the seed bugs. The helper is handed the answers. (b) "Code at the commit before each fix" has no method. (c) Some seeds cannot be found from code (silent on his OPPO phone). (d) "Rewrite the hunt, then run it again" has no limit.
- **Exact change:** replace the paragraph's method with:
  ```
  How to run it.
  C1. Coordinator, script: docs/system-map/_tools/seeds.mjs finds, for each seed, the fix commit (search commit
      messages for the R-number) and writes calibration/seeds.json {seed id, fix commit, parent commit, area
      folders the fix touched}. Seeds with no R-number are found by date and file, by the coordinator.
      seeds.json and the seed list are coordinator-only files.
  C2. For each seed the coordinator makes a read-only copy of the area folders at the PARENT commit into
      _work/calib/<seed id>/ (git archive of those folders only; removed after scoring). No docs/ folder in it.
  C3. A helper gets: that folder, the full text of the 10 hunts WITHOUT the seed list and WITHOUT the
      "seed pairs" line, and one sentence: "Run every hunt on this area and list every gap." It is not told
      what to look for, how many gaps exist, or that this is a calibration. It may not run git or open docs/.
      3 seeds per helper, areas mixed.
  C4. Score by the coordinator: found / partly / missed per seed, in calibration/RESULT.md.
  C5. A missed seed: rewrite that hunt's text, re-run ONLY that seed with a fresh helper. At most 2 re-runs
      per seed. Still missed = written in the report as "this audit cannot find this kind of bug: <why>",
      and that kind is added to the device checks only he can do.
  C6. Device-only seeds (R-590 silent on OPPO, R-575 watch update notice): pass = the helper flags the code
      path as "cannot be proven in the cloud, needs a real-phone check", not "found the bug".
  ```
  Move hunt 1's sentence "Seed pairs to prove the hunt works: ..." out of the hunt text into the coordinator-only seed list.
- **Risk removed:** a calibration that always passes; an endless rewrite loop.
- **Mark:** apply

## P16. Run the free machine checks first; models read only what they flag
- **Section:** 3B (lenses 3, 4, 7, 8, 9, 12, 16), 3D (hunts 2, 5, 6).
- **Problem:** Several lens items are facts a tool returns in one call, but the plan sends a helper to read code for them.
- **Exact change:** add to 3B:
  ```
  **Machine pass (coordinator, before the lens helpers; each writes one file under _sources/machine/).**
  | for | what | output |
  | lens 3 | Supabase security advisor + the catalog: every table with row-level rules on/off, every policy text, every function marked "security definer" and who may execute it (catalog reads only, no gym data) | db-security.json |
  | lens 3 | open alerts for known-vulnerable packages from GitHub (Dependabot API) or the last CI audit step | cve.json |
  | lens 3 | search the tree for key patterns (sk-, AIza, eyJ, "service_role", BEGIN PRIVATE KEY) -> file:line only, never the value | secrets-hits.txt |
  | lens 7 | Supabase performance advisor (missing indexes, slow queries); Google PageSpeed for each public page URL (no login pages) | db-perf.json, pagespeed.json |
  | lens 8 | database size, table sizes, row counts per table (counts only), storage used, GitHub Actions storage | limits.json |
  | lens 9 | the accessibility results the panel crawl already produces in CI (newest run's files) | a11y.json |
  | lens 12 | Play Console pre-launch report and Android vitals pages, read in his simpleapps108 Chrome window | play-report.md |
  | lens 16 | files no test imports (script over the import graph); functions never called; tests with no assert/expect | code-health.csv |
  | hunt 5 | live version labels of panel, HQ, website; Play version; migration list on the live database vs supabase/migrations | live-state.csv |
  | hunts 2, 6 | one COUNT query per needed field on Crispy Curves ("members with birthday filled: N of M") | field-fill.csv |
  Each lens helper gets its machine file as input and spends its reading on the flagged rows and on what no
  tool can see.
  ```
- **Tokens saved:** roughly 0.5-1 million, and the tool results are exact where a helper's reading is a sample.
- **Mark:** apply

## P17. A8 coverage from a test index, not by opening 900 test files
- **Section:** 3 (A8).
- **Problem:** "For every journey: find the tests that check it. Open each test." There are 289 Maestro flows, 100 panel e2e specs and 610 unit test files (measured). Finding by search per journey repeats the same lookups thousands of times.
- **Exact change:** add to A8:
  ```
  First, by script: docs/system-map/_tools/test-index.mjs writes _sources/test-index.jsonl, one line per test:
  {path, kind (unit | e2e | maestro | db | watch), title (describe/it text or flow name), screens or routes it
  opens, words it asserts (assertVisible / getByText / expect strings, first 20), feature area (from its
  folder), runs in which workflow}.
  The helper matches each Tier 1 journey to candidate tests from the index, then opens ONLY those candidates
  (the rule "open the test and check" stays). Generated journeys (Tier 2) get coverage by rule from the
  template: e.g. type 9 size/look = "full" only if the screen is in the picture or layout gate list.
  A test in the index that no journey points to goes into _sources/orphan-tests.txt (a feature the map missed,
  or a dead test: lens 16 reads this list).
  ```
- **Tokens saved:** roughly 0.5 million; and the orphan list is a free second check on A2.
- **Mark:** apply

## P18. Hunt 8 (silent fallbacks): filter 3,255 hits by script before a model reads any
- **Section:** 3D (hunt 8).
- **Problem:** "Grep every catch, ?? null, || [] ..." gives 1,810 catch blocks and 1,445 fallback values in the panel, phone app and Worker code today (measured). No helper can judge 3,255 places, and "every default value and early return" is unbounded.
- **Exact change:** replace hunt 8's first sentence with:
  ```
  By script first: docs/system-map/_tools/silent.mjs lists every catch block with file:line and three flags:
  logs? (calls a log, report or crash function inside), tells_user? (sets an error state, toast or alert
  inside), rethrows?. Output _sources/silent.csv. Helpers read ONLY the rows where all three are "no", plus
  every fallback value (?? null, || [], ?? 0) that sits in a file named in a journey that writes money,
  messages, alerts, sign-in or sync. Everything else is counted in the grid as "filtered by script, N rows,
  not read" so the gap is visible.
  ```
- **Tokens saved:** roughly 80% of the hunt (0.3-0.5 million); the grid stays honest about what was not read.
- **Mark:** apply

## P19. 3E: the script labels the failures; a helper reads only the unknowns
- **Section:** 3E (E1, E2, E3).
- **Problem:** E1 says "script first" but not what it pulls, and E2 gives the whole labelling job to a helper, though the plan's own rules for a test fault and a runner fault are mechanical.
- **Exact change:** replace E1-E3's method with:
  ```
  E1. docs/system-map/_tools/test-history.mjs, GitHub API with the stored token (never unauthenticated: that
      stops at 60 calls an hour). For every run of the last 30 days of ci.yml, qa-device.yml, qa-journeys.yml,
      qa-conditions.yml, test-lab.yml, watch.yml, wear-build.yml, release-apk.yml: run id, workflow, commit,
      attempt number, each job and step with result and minutes. Output test-history.csv. A job that failed on
      attempt 1 and passed on a later attempt of the SAME commit = flaky.
  E2. Same script, second pass, for each failed job: download the log (and the Maestro failure files where
      the run kept them) and label by rule:
      RUNNER FAULT if the log matches: emulator did not boot, download failed, port in use, out of memory,
      runner lost, timeout before the first test step.
      TEST FAULT if the wanted text or id is present in the saved screen hierarchy at the failure, or the same
      commit passed on re-run with no code change.
      APP BUG if a later commit that touched app code (not tests) turned it green.
      Else UNKNOWN. Output test-failures.jsonl {run id, job, flow, label, rule that fired, log line}.
      One helper then reads ONLY the UNKNOWN rows (at most 40 per helper) and labels them with evidence.
  E3. From test-history.csv by script: minutes per release-round part, the 20 slowest flows, flows whose
      index line (P17) asserts the same words on the same screen. No helper unless the numbers need reading.
  Runs older than the log-keeping period have no log: count them as "no log kept", never guess.
  ```
- **Tokens saved:** roughly 0.2-0.4 million; the headline number comes from rules he can read.
- **Mark:** apply

## P20. Row formats with one example row each, and five missing fields on findings
- **Section:** 2 (file table), 3C (improvement row), 7.
- **Problem:** The table lists "key fields" only. Medium-effort helpers will each invent field names, value spellings and id shapes. findings.jsonl also lacks the fields the report, the verify step and the grids need: 3B says "with lens filled", but the table has no lens field.
- **Exact change:** add under the table in section 2:
  ```
  **Exact rows (made-up examples, not real findings; copy the shape; unknown values are the word "unknown", never empty, never a guess).**
  feature:  {"kind":"feature","id":"F-panel-014","surface":"panel","area":"panel/pay","name":"Collect dues",
             "roles":["owner","staff"],"switch":"none","tier":"free","entry":["apps/dashboard/src/crm/pay/DuesSheet.tsx:41"],
             "status":"live","sources":["panel.txt#212","panel.txt#213"]}
  journey:  {"kind":"journey","id":"J-F-panel-014-01","feature":"F-panel-014","role":"staff","type":1,
             "generated":false,"start":"Members list, member with dues",
             "steps":[{"n":1,"action":"Tap the member, tap Collect","user_sees":["Sheet titled 'Collect dues'"],
                       "must_not":["Amount is empty or zero by default when dues exist"]}],
             "writes":["E-payment","E-membership"],"reads":["E-member"],"promise_ids":[],
             "tests":[],"coverage":"unknown","last_result":null}
  finding:  {"kind":"finding","id":"FN-L3-server-02-07","date":"2026-11-20","lens":"3","surface":"server",
             "area":"server/pay","refs":["J-F-panel-014-01"],"severity":"S1",
             "title":"A staff login can change another gym's dues",
             "what":"...","expected":"...","evidence":["deploy/panel/joinPay.js:118-131"],
             "proof":"code-read","root_cause_key":"dues-rpc-no-gym-check","who":"owners","how_often":"every time",
             "fix_line":"Check the caller's gym inside the function","fix_size":"small",
             "needs_him":false,"verified":"pending","status":"open"}
  (entity, reader, promise, improvement, grid: same style, one example each in docs/system-map/_briefs/rows.md)
  Rules: "title", "what", "who", "how_often" and "fix_line" are written in plain words for the report card (no
  file names). proof = driven | code-read | data-count | machine. root_cause_key = 3-6 lower-case words naming
  the cause, so the same fault found by two lenses merges. Severity S1-S4 as in section 7; the report shows
  S1 = Serious, S2 = Serious or Medium (the card says which and why), S3 = Medium or Small, S4 = Small.
  ```
- **Tokens saved:** the report cards are filled from fields instead of a second read of every finding (roughly 0.3 million); removes merge failures from invented shapes.
- **Mark:** apply

## P21. Make "Crispy Curves only" something a brief can obey and a script can check
- **Section:** 0 (data line), 3B (lens 3), 3D (hunts 2, 6, 9), 9 (item 2).
- **Problem:** The rule is stated, but a helper is not told how to stay inside it. Lens 3 says "row-level rules per table tested with another gym's login", which needs a second gym. Lens 8 and hunt 5 need database-wide facts (sizes, migration list). Nothing says whether those count as "reading another gym".
- **Exact change:** replace the section 0 data line with:
  ```
  - Data. Allowed without asking: (a) rows of the test gym Crispy Curves: every query carries
    gym_id = '<Crispy Curves id, given in this brief>' in its WHERE; (b) the database catalog: table, column,
    policy, function, index and migration lists, table sizes and total row counts per table, the advisors.
    Never: a row, a name, a phone number or a per-gym count of any other gym; SELECT without the gym filter on
    a table that has a gym column; any INSERT, UPDATE, DELETE, or a function that writes.
    If a check needs a second gym, do not run it: write it as "needs a second test gym" in could-not-check.
  ```
  In lens 3 replace "row-level rules per table tested with another gym's login" with `row-level rules per table: read every policy from the catalog and the existing database tests in supabase/tests, and for each table state which test proves another gym is refused; a table with no such test = finding. A live cross-gym attempt is NOT run in this audit.`
  Add to 8C "One pacer run": `After each report the coordinator searches the helper's out file and checkpoint for SQL text without the Crispy Curves id (catalog queries excepted); any hit pauses the audit and is told to him.`
- **Risk removed:** a helper reading a real gym's members while "testing security".
- **Mark:** apply

## P22. Pictures: index the ones CI already makes; cap pictures per helper
- **Section:** 3C (expert panels), 3B (lens 9, 10), section 5 (card "Proof").
- **Problem:** The experts "see the real screens as pictures", but the plan does not say where pictures come from. Capturing them is a heavy run or a new test. With the screenshot-shrinking mod off, each full picture costs about 1,500 tokens; "every screen, every state" for one expert is several hundred pictures.
- **Exact change:** add to 3C:
  ```
  **Pictures.** docs/system-map/_tools/screens-index.mjs lists the pictures that already exist: the newest
  green run's files from the panel crawl and journeys, the Maestro flows (qa-device, qa-journeys), the watch
  render harness, store-shots, and docs/uat. Output screens-index.json {picture path or run file, surface,
  screen, state, language, theme, width, date, commit}. Pictures are downloaded one run at a time into a temp
  folder and deleted after the helper reports (his C drive rule).
  A screen in features.json with no picture goes into _sources/no-picture.txt: the expert reads its code
  instead and marks its rows proof "code-read". Taking new pictures is a Phase B item under P2, not a 3C job.
  Each expert helper opens at most 25 pictures: the default state of each screen in its area first, then the
  states its role cares about.
  ```
- **Tokens saved:** no capture runs; picture reading capped at about 40,000 tokens per helper.
- **Mark:** apply

## P23. The final report will be too long to read: one card per PROBLEM, with a ceiling on full cards
- **Section:** 5 (HIS REPORT).
- **Problem:** "One card per finding" with six parts each is about 120 words a card. A 360 audit of this size will produce several hundred findings even after merging: 500 cards is about 60,000 words on a phone. He asked for a report he can understand and act on.
- **My view:** two options.
  1. **Recommended: one card per problem (a merged group from P12), full cards for every Serious one and the top 40 Medium ones; the rest as one-line rows grouped by app part, each with its finding id.** Every problem is still listed, nothing is dropped, and any row can be expanded into a card when he asks. Improvement ideas (3C) go on a second page so they do not bury the bugs.
  2. Keep one full card for every finding, split into one page per app part. Complete, but several hours of reading and about three times the writing cost.
- **Exact change if option 1:** in section 5 replace "Then one card per finding, grouped most serious first" with `Then one card per problem (a merged group of findings, see 3H), most serious first: a full card for every Serious problem and for the 40 Medium problems with the widest reach; every other problem is one plain line (what you would see, how bad, fix size, finding id), grouped by app part. A second page lists improvement ideas the same way.`
- **Mark:** needs Aakash (changes his "one card per finding" wording)

## P24. Five expert panels repeat five lenses
- **Section:** 3C (expert table), 8C (cut order).
- **Problem:** The security engineer looks at "lens 3 targets", the privacy lawyer at "lens 4 targets", the performance engineer at lens 7, the accessibility expert at lens 9, the reliability engineer at lenses 6, 8 and 15. Each lens already ends with the two expert questions. That is about 35 helper runs reading the same things twice.
- **My view:** two options.
  1. **Recommended: fold those five into their lens briefs.** The lens brief names the method (OWASP Top 10 and Mobile Top 10, DPDP Act 2023, Core Web Vitals, WCAG 2.2 AA, "what wakes us at 3 am") and must answer the two expert questions in that voice. Seven panels stay as separate runs: designer, first-time user, gym owner, coach, content, growth, CEO. Saves roughly 0.7-1.4 million tokens with no loss of coverage.
  2. Keep all 12 as separate runs and rely on the cut order in 8C if the projection goes over 3 periods.
- **Exact change if option 1:** in the 3C table, add to those five rows: `Runs inside the lens brief, not as a separate helper`; in 8C cut item (1) replace "expert panels (3C) except designer, coach and privacy" with `expert panels (3C) except designer and coach (privacy runs inside lens 4)`.
- **Mark:** needs Aakash (changes how many expert runs he asked for, and the cost)

## P25. Four things a 360 audit of this product should look at that no lens names
- **Section:** 3B (table).
- **Problem:** These have no home in the 20 lenses and 10 hunts:
  1. **The AI features** (assistant, AI import, AI questions, coach): are answers built only from that gym's real data; can text typed by a member or lead steer the AI (prompt injection); what is sent to the AI company; what a wrong answer costs the owner. Lenses 3, 4 and 8 touch key, privacy and spend, none checks the answers.
  2. **Rights to what we ship:** exercise pictures and clips, music, voices, fonts, icons, open-source licences, the MettleUp name and logo. One past lesson already found scraped exercise art.
  3. **Do we measure the product?** Which sign-up, activation, day-30 and paid numbers exist, and which decisions are made blind. Lens 15 covers failures only.
  4. **Keys, accounts and the one-person risk:** every account, domain, signing key and token: who holds it, when it expires, what breaks if the laptop is lost, is there a written way back in.
- **My view:** two options.
  1. **Recommended: add them as checklist items inside existing lenses, no new grid columns:** AI answers into lens 2 (data correctness) and AI injection into lens 19 (abuse); rights into lens 12 (store and platform rules); measurement into lens 15; keys and accounts into lens 14. Cost: roughly 6-10 more helper runs.
  2. Leave them out of this audit and list them in DEFERRED.md for Opus.
- **Mark:** needs Aakash (adds scope and cost)

## P26. Fix the stale lines so no helper or coordinator obeys them
- **Section:** 8, 8B, 9, 5, 3C, title block.
- **Problem:** Several lines were replaced by later decisions but still stand as written. A medium-effort reader obeys whichever it meets first.
- **Exact change:**
  - Title block: replace "MettleUp first, then every other store app" with `This run covers MettleUp only. Other store apps get their own plan and budget later.` (also in section 8, first bullet).
  - Section 8: replace "spread over about 3-5 weekly limits" with `inside 3 weekly periods (section 8C budget checkpoint)`.
  - Section 8: replace "Run the usage guard throughout (85%: helpers save and stop starting; 95%: RESUME note, at most 2 helpers)." with `Pacing and stop lines: section 8C only.`
  - Section 8: replace "Report to him at the end of each phase, and in the morning while he is away." with `Report to him at the end of each phase, when something needs him, or for a fast-lane bug (section 8C).`
  - Section 8: delete "Phase C per fix as in the framework plan." and add `Phase C is not part of this run.`
  - Section 8B first bullet: delete the quoted "starts Nov 18 at 4:30pm with Opus 5.5 Medium" and keep only: `Model: every helper runs on Fable 5.2 at medium effort (section 8C).`
  - Section 9 item 4: replace "Then start A2 helpers (one per surface, max 6), each with section 0's block + its step text." with `Then run A1b, then the A2 pilot helper alone, then A2 helpers per area as the pacer allows (section 8C).`
  - Section 9 item 2: replace "Read this file, the framework plan, and notes ..." with `The START run reads this file once and writes RUNBOOK.md and the brief templates from it. Later runs read RUNBOOK.md only.`
  - Section 5: move the two paragraphs "HIS REPORT" and "ANALYSIS ONLY, NO FIXES" out of "Phase C: fix" into a new section `## 4B. Stop here: the final report (end of this run)`, placed after section 4. Section 5 then starts with `Not part of this run. Starts only when he says so, on Opus.`
  - Section 3C: replace "Quick wins ... are batched and built after the audit through the normal framework steps." with `Quick wins are listed for Phase C; nothing is built in this run.`
  - Section 3C: move "End of Phase A: show him a one-page summary ..." to the end of section 3 (it is about Phase A, not the expert panels), and add to it: `plus the projection line and the list of grid cells marked "does not apply".`
  - Section 4, B2: replace "his OPPO only for `manual-only` lines, written as a 2-minute check for him" with `manual-only lines are collected into ONE list in the final report ("only you: needs your phone"), not asked one by one during the run.`
- **Risk removed:** a run that starts other apps, reads the framework plan every hour, or messages him each morning.
- **Mark:** apply

---

## Count
- apply: 22 (P1, P3-P22, P26)
- needs Aakash: 4 (P2, P23, P24, P25)
- Flags with no change proposed: the weekly pause at 95% leaves him little weekly use until he resets (P10); P2 option 1 and any write in Crispy Curves are his to allow.
