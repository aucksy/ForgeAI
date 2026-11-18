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
| A2 | 2 | 148k tokens (% not measured yet; plan with 5) |
| A7 | 0 | 5 (start value) |
| E1 | 1 | 189k tokens (% not measured yet; plan with 5) |
| E2 | 0 | 5 (start value) |
| E3 | 0 | 5 (start value) |
| E4 | 0 | 5 (start value) |
| 3F | 0 | 5 (start value) |

## Work items
Counts: 39 todo, 1 in progress, 9 done, 0 blocked. Full list: work-items.jsonl. This table is written by _tools/state.mjs summary; do not edit it by hand.

| id | step | what | status (todo / in progress / done) | checkpoint file | helper result (1 line) |
|---|---|---|---|---|---|
| W8 | E2 | 3E E2 label failed jobs by rule (script), then one helper reads only the UNKNOWN rows (at most 40) -> test-failures.jsonl | in progress | _work/E2.md |  |
| A7-pilot | A7 | promises: PILOT, one source group of at most 120 candidate sentences from _sources/promises.txt; runs alone | todo | _work/A7-pilot.md |  |
| W9 | E3 | 3E E3 release gate cost by script: minutes per round part, 20 slowest flows, repeated checks | todo | _work/E3.md |  |
| W10 | E4 | 3E E4 better test framework: research + proposals only -> TEST-SYSTEM-REVIEW.md | todo | _work/E4.md |  |
| W11 | 3F | 3F F1, F4-F6 change-360 review (proposals only; switch stays OFF) -> CHANGE-360-REVIEW.md draft | todo | _work/F.md |  |
| A2-web-pages | A2 | A2 features: area web/pages (398 items, 9556 lines) | todo | _work/A2-web-pages.md |  |
| A2-panel-screens-2 | A2 | A2 features: area panel/screens-2 (53 items, 9167 lines) | todo | _work/A2-panel-screens-2.md |  |
| A2-panel-forms | A2 | A2 features: area panel/forms (6 items, 1647 lines) | todo | _work/A2-panel-forms.md |  |
| A2-panel-ui-shell | A2 | A2 features: area panel/ui-shell (153 items, 11728 lines) | todo | _work/A2-panel-ui-shell.md |  |
| A2-panel-logic-1 | A2 | A2 features: area panel/logic-1 (43 items, 10928 lines) | todo | _work/A2-panel-logic-1.md |  |
| A2-panel-logic-2 | A2 | A2 features: area panel/logic-2 (96 items, 10982 lines) | todo | _work/A2-panel-logic-2.md |  |
| A2-panel-shop | A2 | A2 features: area panel/shop (128 items, 8869 lines) | todo | _work/A2-panel-shop.md |  |
| A2-panel-assistant | A2 | A2 features: area panel/assistant (30 items, 6837 lines) | todo | _work/A2-panel-assistant.md |  |
| A2-panel-auth-data | A2 | A2 features: area panel/auth-data (56 items, 8459 lines) | todo | _work/A2-panel-auth-data.md |  |
| A2-panel-brand-shell | A2 | A2 features: area panel/brand-shell (740 items, 8507 lines) | todo | _work/A2-panel-brand-shell.md |  |
| A2-phone-screens-1 | A2 | A2 features: area phone/screens-1 (161 items, 7231 lines) | todo | _work/A2-phone-screens-1.md |  |
| A2-phone-screens-2 | A2 | A2 features: area phone/screens-2 (161 items, 7566 lines) | todo | _work/A2-phone-screens-2.md |  |
| A2-phone-shop-1 | A2 | A2 features: area phone/shop-1 (68 items, 9373 lines) | todo | _work/A2-phone-shop-1.md |  |
| A2-phone-shop-2 | A2 | A2 features: area phone/shop-2 (185 items, 9398 lines) | todo | _work/A2-phone-shop-2.md |  |
| A2-phone-tracker-services-1 | A2 | A2 features: area phone/tracker-services-1 (74 items, 10762 lines) | todo | _work/A2-phone-tracker-services-1.md |  |
| A2-phone-tracker-services-2 | A2 | A2 features: area phone/tracker-services-2 (73 items, 10868 lines) | todo | _work/A2-phone-tracker-services-2.md |  |
| A2-phone-tracker-components-1 | A2 | A2 features: area phone/tracker-components-1 (52 items, 8226 lines) | todo | _work/A2-phone-tracker-components-1.md |  |
| A2-phone-tracker-components-2 | A2 | A2 features: area phone/tracker-components-2 (102 items, 8215 lines) | todo | _work/A2-phone-tracker-components-2.md |  |
| A2-phone-tracker-engine | A2 | A2 features: area phone/tracker-engine (35 items, 10011 lines) | todo | _work/A2-phone-tracker-engine.md |  |
| A2-phone-tracker-data | A2 | A2 features: area phone/tracker-data (40 items, 9326 lines) | todo | _work/A2-phone-tracker-data.md |  |
| A2-phone-tracker-lib | A2 | A2 features: area phone/tracker-lib (59 items, 9117 lines) | todo | _work/A2-phone-tracker-lib.md |  |
| W1 | A1 | surfaces.json (11 surfaces) | done | - | coordinator |
| T1a | tools | coordinator tooling: work-items.jsonl, _tools/state.mjs, _tools/merge.mjs, _briefs/, RUNBOOK.md | done | _work/T1a.md | tools, briefs, runbook built and tested |
| A1b | A1b | source lists by script: _tools/sources.mjs -> _sources/<surface>.txt, sizes.csv, readers-raw.txt, promises.txt (no model reading) | done | _work/A1b.md | 37 areas, source lists pushed |
| G0 | redact | blind-check redaction: _tools/redact.mjs -> _sources/owner-inbox-redacted.md + claude-notes-redacted.md (parts of at most 600 lines); prints counts only | done | _work/G0.md | redacted copies written by the coordinator's script |
| A2-pilot | A2 | features: PILOT, one area of at most 12,000 lines picked from sizes.csv; runs alone | done | _work/A2-pilot.md | 28 features, 60 of 60 source lines; source list misses files in pay/ move/ machines/ |
| A2-split | coord | coordinator: add one A2 item per area from sizes.csv, sized by the A2 pilot cost (state.mjs add) | done | - | 36 area items made by script, every source file listed |
| W7 | E1 | 3E E1 test history (script) -> test-history.csv | done | _work/E1.md | 3,128 runs, 39% red tries, 91 proven flaky |
| A2-panel-screens-1 | A2 | A2 features: area panel/screens-1 (39 items, 9139 lines) | done | _work/A2-panel-screens-1.md | 40 features (hit the 40 limit), 39 of 39 lines |
(+ 14 more todo items, not shown)
(+ 1 older done items, not shown)

## Needs Aakash
- Nothing open. P2, P23, P24, P25: he said "take best decisions yourself..." (18 Nov 2026); the recommended option of each was taken and written into the plan (change log at its top).

## Resume notes
- BUDGET WARNING (18 Nov 18:42 IST): window 1 so far: F5 6 -> 52 while Weekly-Fable 0 -> 12 and Weekly-all 0 -> 7. WEEK_PER_F5 = about 0.26 (Fable binds). One full window (79 points) = about 20% of a weekly Fable period, so one period = about 4.5 windows and 3 periods = about 13-14 windows. The first guess for the whole audit was 20 windows: OVER budget. Recompute after A2 with real costs (A2 helper = about 4-5 F5 points, 135-160k tokens); if still over 2.7 periods, cut in the plan's order and tell him in one line. Part of window 1 was his own other chat, so the ratio may be a little high.
- 18:42 IST: F5 52, target 56.6, E2 still running (reserve 6): nothing more launched this hour.

- 36 A2 items exist (briefs in _work/briefs/<id>.md, item lists in _work/items/). Launch prompt = "Your full brief is the file <path>; read it in full and follow it exactly" + never-open list. 10 items have over 160 lines (web-pages 398, panel-brand-shell 740, server-database-1..3, server-panel-worker 355 ...): the helper will report "limit reached, N left"; then add a second item for the rest.
- After each A2 report: node _tools/merge.mjs <id> --blind "C:/Users/Aakash Pahuja/.claude/audit-blind-patterns.txt", then state.mjs done, summary, commit, push.
- A2 pilot lesson (18 Nov): the source list misses whole files (pay/, move/, machines/). FIX for every A2 item: the items file must ALSO list every non-test source file in the area's folders as a line 'file | <name> | <path>:1', so each file lands in some feature. Pilot cost 135k tokens for 60 items (about 4 points of the 5-hour window); one helper can hold about 100 items. Demo-gym lines copy other areas' features: tell helpers to write one row 'demo copy of <feature>'.
- Next for the pacer: make A2 items per area from _sources/areas.json (36 left) with the fix above; then A7 pilot, W9 (E3), W11 (3F). W8 (E2) is still running under the start chat.

- Audit worktree (coordinator): scratchpad wt-audit, detached at origin/main. The main checkout D:\Apps\ForgeAI\Codebase
  has unrelated uncommitted changes and is 729 commits behind: do not use it for the audit.
- Keep-awake tool was not available in the start run.
- Plan file was edited 18 Nov (change log at its top; backup beside it). Helpers must NOT open the plan: pasted briefs only.
- The start chat (run id start-run) still owns helpers W8 (E2) and A2-pilot and keeps the lock fresh until they report. Pacer: work in a clean worktree of origin/main, never D:\Apps\ForgeAI\Codebase's main checkout (stale).
- E1 helper (test history) was started with the OLD brief style; its outputs: test-history.csv, test-history-summary.md, _sources/e1_history.py.
- 18 Nov 2026: chat compacts at 20% now; after it, read these notes before saying we never discussed or he never approved something.
