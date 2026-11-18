status: RUNNING
phase/step: plan review DONE and applied (22 of 26), A1 done; next = tools (T1), A1b, then A2 pilot
expected end: unknown until A2 learned costs (rough: 3 weekly periods = by about 9 Dec 2026)
mode: ANALYSIS ONLY. No app code, tests, workflows, skills or settings change. "Apply" items in 3E/3F = proposals only.
model: every helper = Fable 5.2 ("fable"), effort "medium". Max 6 helpers at once.
blind check: never put the held-out rows or hints into a helper brief (ids are in plan section 3G only).

## Windows
| window reset (IST) | F5 start | F5 now | WF | WA | helpers run | why stopped |
|---|---|---|---|---|---|---|
| 18 Nov 20:00 | 6 | 6 | 0 | 0 | plan-review, E1 | running |

## Learned cost per helper type (5-hour %)
| step | helpers so far | average cost |
|---|---|---|
| plan-review | 1 | 171k tokens (% not measured yet; plan with 5) |
| tools | 1 | 212k tokens (% not measured yet; plan with 5) |
| A1b | 1 | 201k tokens (% not measured yet; plan with 5) |
| A2 | 1 | 135k tokens (% not measured yet; plan with 5) |
| A7 | 0 | 5 (start value) |
| E1 | 1 | 189k tokens (% not measured yet; plan with 5) |
| E2 | 0 | 5 (start value) |
| E3 | 0 | 5 (start value) |
| E4 | 0 | 5 (start value) |
| 3F | 0 | 5 (start value) |

## Work items
Counts: 5 todo, 1 in progress, 7 done, 0 blocked. Full list: work-items.jsonl. This table is written by _tools/state.mjs summary; do not edit it by hand.

| id | step | what | status (todo / in progress / done) | checkpoint file | helper result (1 line) |
|---|---|---|---|---|---|
| W8 | E2 | 3E E2 label failed jobs by rule (script), then one helper reads only the UNKNOWN rows (at most 40) -> test-failures.jsonl | in progress | _work/E2.md |  |
| A2-split | coord | coordinator: add one A2 item per area from sizes.csv, sized by the A2 pilot cost (state.mjs add) | todo | - |  |
| A7-pilot | A7 | promises: PILOT, one source group of at most 120 candidate sentences from _sources/promises.txt; runs alone | todo | _work/A7-pilot.md |  |
| W9 | E3 | 3E E3 release gate cost by script: minutes per round part, 20 slowest flows, repeated checks | todo | _work/E3.md |  |
| W10 | E4 | 3E E4 better test framework: research + proposals only -> TEST-SYSTEM-REVIEW.md | todo | _work/E4.md |  |
| W11 | 3F | 3F F1, F4-F6 change-360 review (proposals only; switch stays OFF) -> CHANGE-360-REVIEW.md draft | todo | _work/F.md |  |
| W0 | plan-review | plan review -> PLAN-REVIEW.md | done | _work/plan-review.md | 26 proposals: 22 applied, 4 need Aakash; 171k tokens |
| W1 | A1 | surfaces.json (11 surfaces) | done | - | coordinator |
| T1a | tools | coordinator tooling: work-items.jsonl, _tools/state.mjs, _tools/merge.mjs, _briefs/, RUNBOOK.md | done | _work/T1a.md | tools, briefs, runbook built and tested |
| A1b | A1b | source lists by script: _tools/sources.mjs -> _sources/<surface>.txt, sizes.csv, readers-raw.txt, promises.txt (no model reading) | done | _work/A1b.md | 37 areas, source lists pushed |
| G0 | redact | blind-check redaction: _tools/redact.mjs -> _sources/owner-inbox-redacted.md + claude-notes-redacted.md (parts of at most 600 lines); prints counts only | done | _work/G0.md | redacted copies written by the coordinator's script |
| A2-pilot | A2 | features: PILOT, one area of at most 12,000 lines picked from sizes.csv; runs alone | done | _work/A2-pilot.md | 28 features, 60 of 60 source lines; source list misses files in pay/ move/ machines/ |
| W7 | E1 | 3E E1 test history (script) -> test-history.csv | done | _work/E1.md | 3,128 runs, 39% red tries, 91 proven flaky |

## Needs Aakash
- (done 18 Nov, his "Yes, switch on") pacer task mettleup-audit-pacer is ENABLED; the backup cron in the start chat was deleted.
- P2: how Phase B proves journeys. My view: (1, recommended) trace all in code and drive the top 150 in the cloud on a scratch branch that is never merged, writes only in the demo gym; (2) code trace only + about 40 driven by hand.
- P23: report length. My view: (1, recommended) one card per merged problem, full cards for every Serious + top 40 Medium, the rest one line each; (2) a full card for every finding.
- P24: 5 expert panels repeat 5 lenses. My view: (1, recommended) fold them into the lens briefs; (2) keep all 12 separate.
- P25: 4 areas no lens covers (AI answers, rights to pictures/music, product measurement, keys and accounts). My view: (1, recommended) add as checklist items, about 6-10 more helper runs; (2) defer to Opus.
- Until he answers: the audit goes on with work that none of the four change (tools, A1b, A2-A4, A7, 3E).

## Resume notes
- A2 pilot lesson (18 Nov): the source list misses whole files (pay/, move/, machines/). FIX for every A2 item: the items file must ALSO list every non-test source file in the area's folders as a line 'file | <name> | <path>:1', so each file lands in some feature. Pilot cost 135k tokens for 60 items (about 4 points of the 5-hour window); one helper can hold about 100 items. Demo-gym lines copy other areas' features: tell helpers to write one row 'demo copy of <feature>'.
- Next for the pacer: make A2 items per area from _sources/areas.json (36 left) with the fix above; then A7 pilot, W9 (E3), W11 (3F). W8 (E2) is still running under the start chat.

- Audit worktree (coordinator): scratchpad wt-audit, detached at origin/main. The main checkout D:\Apps\ForgeAI\Codebase
  has unrelated uncommitted changes and is 729 commits behind: do not use it for the audit.
- Keep-awake tool was not available in the start run.
- Plan file was edited 18 Nov (change log at its top; backup beside it). Helpers must NOT open the plan: pasted briefs only.
- The start chat (run id start-run) still owns helpers W8 (E2) and A2-pilot and keeps the lock fresh until they report. Pacer: work in a clean worktree of origin/main, never D:\Apps\ForgeAI\Codebase's main checkout (stale).
- E1 helper (test history) was started with the OLD brief style; its outputs: test-history.csv, test-history-summary.md, _sources/e1_history.py.
- 18 Nov 2026: chat compacts at 20% now; after it, read these notes before saying we never discussed or he never approved something.
