# Next work items (made 21 Nov 2026 by a coordinator-side helper; nothing added to work-items.jsonl yet)

All paths are under docs/system-map/. Run every command from docs/system-map/ unless it says the repo root.
Nothing here is in work-items.jsonl: the coordinator adds the batches below, IN THIS ORDER (an "add" refuses a
"needs" id that does not exist yet). All five adds were tried on a copy of work-items.jsonl: they go in cleanly and
`next 6` then shows 249 runnable items.

## Already done by script (21 Nov, one process each, seconds, exited)
- A6 impact map: `_tools/impact.mjs` -> impact.json (24,646 journeys, 7,839 Tier 1; lossless index, 2.5 MB). Re-run:
  `node docs/system-map/_tools/impact.mjs` (repo root, about 20 s). `--check` = exit 1 if out of date.
- A8 test index: `_tools/test-index.mjs` -> _sources/test-index.jsonl (1,148 test files).
- Hunt 8 script: `_tools/silent.mjs` -> _sources/silent.csv (2,182 catch blocks, 767 silent; 2,505 fallbacks).
- Lens 16 machine file: `_tools/code-health.mjs` -> _sources/machine/code-health.csv.
These four are recorded by the A6 and A8-index rows of batch 1 (status done).

## Adds, in launch order
| # | add | items | what |
|---|---|---|---|
| 1 | `node _tools/state.mjs add @_work/next-add/_batch-1-prereq.json` | 12 | A6 (done), A8-index (done), M2-machine-pass, M3-play-report (coord), CAL-prep (coord), CAL-1..4, CAL-score (coord), A8-rules, A8-tier2 |
| 2 | `node _tools/state.mjs add @_work/next-add/_batch-2-a8.json` | 97 | A8 coverage, one per group of Tier 1 journeys (at most 110 journeys / 650 see-not lines) |
| 3 | `node _tools/state.mjs add @_work/next-add/_batch-3-report.json` | 1 | A8-report (script: COVERAGE.md + orphan-tests.txt), needs every A8 item + A8-tier2 |
| 4 | `node _tools/state.mjs add @_work/next-add/_batch-4-lenses.json` | 642 | every other lens and hunt item (not 3, 4, 5, 18), sorted in launch order |
| 5 | `node _tools/state.mjs add @_work/next-add/_batch-5-l18.json` | 38 | L18-gate (coord) + 37 lens 18 items; the gate needs all 642 + A8-report, so lens 18 runs last |
Single add files (same rows): _work/next-add/<id>.json, _work/a8-add/<id>.json (with the "journeys" list that
a8-cover.mjs reads; the batch copy leaves that list out), _work/lens-add/<id>.json.
Not an item: _work/lens-add/L9-server-na.grid.jsonl (lens 9 does not apply to the server): merge it the way
L5-watch-na.grid.jsonl was merged.

## What runs first, and the pilots (a new kind of step = ONE pilot alone first, RUNBOOK pilot rule)
Runnable at once after the adds: M2-machine-pass, A8-rules, the A8 items, L19, L14, B-run lens parts (-a),
B-truth lens parts, and the coordinator steps M3-play-report and CAL-prep.
Pilots, each ALONE (no other helper started in that run until it reports), in this order:
1. A8-hq-app-2 (43 journeys, smallest whole group): first A8 helper. Its tokens set the A8 cost and group size.
2. A8-rules (new kind). 3. M2-machine-pass (new kind; Supabase reads, Crispy Curves only).
4. L19-hq-app (first lens helper on the new template: the template gained the gym-data line, the model line
   "Opus 5.5", the machine-citation line and the lens-cover / merge --dry check).
5. The first item of each NEW step, smallest area first (hq-app, else web-pages): B-run-hq-app-a, B-truth-hq-app-a,
   L14-hq-app, then after M2/M3: L7-, L8-, L9-, L12-hq-app; after A8-report: L16-hq-app;
   after CAL-score: H5-hq-app, B-run-hq-app-b, B-alerts-hq-app-a, B-switch-hq-app, B-time-hq-app, B-words-hq-app;
   after L18-gate: L18-hq-app. If the coordinator judges a single lens step not new (same template as L3), it
   may skip its pilot; bundles and hunts are new and keep theirs.
6. CAL-1 alone, after CAL-prep.
After a step's pilot: its other items run in parallel, at most 6 helpers at once, inside the window rules.

## Before you launch some items
- After M2-machine-pass AND M3-play-report are done, re-make the items that read their files (the briefs and items
  files say "MISSING" until then; ids and splits stay the same), from the repo root:
  `for l in 7 8 9 12 gap-5 B-alerts B-switch; do node docs/system-map/_work/lens-items-make.mjs $l; done; node docs/system-map/_work/lens-post.cjs docs/system-map/_work`
  (lens-post.cjs puts the "needs" back; run it after EVERY lens-items-make run). Already-added rows need no change.
- L16 items read _sources/orphan-tests.txt, which A8-report writes: they need A8-report (set).
- CAL-prep (coordinator only, plan C1-C2): seeds.json outside the helpers' reach; copy each seed's area folders at
  the parent commit into _work/calib/c01, c02, ... (names never name a seed). Then fill each CAL brief:
  `node _tools/mkbrief.mjs CAL CAL-<n> "<3 folders, one per line>" "<the same 3 folders>"` (repo root). Only
  folder paths go in: no seed, date, R-number or hint. More than 12 seeds (the 60-day notes rule) = add CAL-5, ...
  and add them to CAL-score's needs. CAL-score (C4-C5) must be done before ANY hunt item runs (all set as needs).

## Finish command per kind (after the helper reports)
| kind | commands |
|---|---|
| lens / hunt / bundle items (L*, H5, B-*) | `node _tools/clamp-evidence.js <id>`; `bash _tools/lens-finish.sh <id> <tokens> "<line>"` |
| A8 coverage items (A8-<area>-<n>) | `bash _tools/a8-finish.sh <id> <tokens> "<line>"` (clamp, then a8-cover.mjs instead of lens-cover.mjs, then the same merge, done, summary, push). A8 rows are journey PATCHES: plain merge.mjs, no --cover, no --a5cover |
| A8-rules | `node -e "JSON.parse(require('fs').readFileSync('_work/a8-rules.json','utf8'))"`, then (repo root) `node docs/system-map/_tools/a8-tier2.mjs`: no "NO RULE" line; `node _tools/state.mjs done A8-rules <tokens> "<line>"` |
| A8-tier2 (script) | `node _tools/merge.mjs A8-tier2 --blind <blind file>`; `node _tools/state.mjs done A8-tier2 0 "<line>"` |
| A8-report (script) | (repo root) `node docs/system-map/_tools/coverage.mjs`; `node _tools/state.mjs done A8-report 0 "<line>"` |
| M2-machine-pass | each file of its list exists and parses; search them for a query without the Crispy Curves id; `state.mjs done` |
| CAL-1..n | NEVER merge (old code; the evidence paths point into _work/calib). Check the out file parses; `state.mjs done`; score in CAL-score |
| coord rows (M3, CAL-prep, CAL-score, L18-gate) | the coordinator does the step, then `state.mjs done <id> 0 "<line>"` (L18-gate: when its needs are done) |

## Counts
- A8: 97 items, 7,839 Tier 1 journeys (live features only, as A5). Tier 2 (16,807): by rule (A8-rules + a8-tier2.mjs).
- Lenses and hunts: 679 items: L19 37, L14 37, L7 37, L8 37, L9 31, L12 37, L16 37, L18 37, H5 37, B-run 74 (6+15 | hunt 8),
  B-truth 74 (2+17 | hunt 9; a few areas split differently), B-alerts 74 (11 + hunt 2 | hunts 3+4), B-switch 56,
  B-time 37, B-words 37. Bundles split in two where one brief would pass 1,200 words.
- Plan cut order if the projection is over 2.7 periods (8C): lens 18 (37 items, already last), then lenses 7, 8, 14
  to a script-only pass (111 items), then journey types 9-10. Recompute the projection BEFORE batch 4: 97 + 679 + 18
  new helper items is far more than the first guess of 95 lens + 50 hunt helpers.
