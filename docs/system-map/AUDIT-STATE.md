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
| plan-review | 1 | 171k tokens (ran beside E1, % not measured) |
| A2 | 0 | 5 (start value) |

## Work items
| id | step | what | status (todo / in progress / done) | checkpoint file | helper result (1 line) |
|---|---|---|---|---|---|
| W0 | review | plan review -> PLAN-REVIEW.md | done | _work/plan-review.md | 26 proposals: 22 applied, 4 need Aakash; 171k tokens |
| T1 | tools | build docs/system-map/_tools/: sources.mjs, merge.mjs, state.mjs, redact.mjs (G0), work-items.jsonl, RUNBOOK.md, _briefs/ | todo | _work/T1.md | must finish before A2 |
| W1 | A1 | surfaces.json (11 surfaces) | done | - | coordinator |
| W2 | A2 | features: panel | todo | _work/A2-panel.md | |
| W3 | A2 | features: phone | todo | _work/A2-phone.md | |
| W4 | A2 | features: server (Workers, DB, crons, messages) | todo | _work/A2-server.md | |
| W5 | A2 | features: websites + HQ + gate | todo | _work/A2-web-hq.md | |
| W6 | A2 | features: watch + store listing | todo | _work/A2-watch-store.md | |
| W7 | 3E | E1 test history (script) | in progress | _work/E1.md | |
| W8 | 3E | E2 classify failures | todo | _work/E2.md | |
| W9 | 3E | E3 release gate cost | todo | _work/E3.md | |
| W10 | 3E | E4 better framework proposal | todo | _work/E4.md | |
| W11 | 3F | F1, F4-F6 change-360 review (proposals only) | todo | _work/F.md | |

## Needs Aakash
- The scheduled task mettleup-audit-pacer could not be switched on by the unattended start run (it needs his click). Backup: an hourly pacer cron inside the start session (dies if that chat closes).
- P2: how Phase B proves journeys. My view: (1, recommended) trace all in code and drive the top 150 in the cloud on a scratch branch that is never merged, writes only in the demo gym; (2) code trace only + about 40 driven by hand.
- P23: report length. My view: (1, recommended) one card per merged problem, full cards for every Serious + top 40 Medium, the rest one line each; (2) a full card for every finding.
- P24: 5 expert panels repeat 5 lenses. My view: (1, recommended) fold them into the lens briefs; (2) keep all 12 separate.
- P25: 4 areas no lens covers (AI answers, rights to pictures/music, product measurement, keys and accounts). My view: (1, recommended) add as checklist items, about 6-10 more helper runs; (2) defer to Opus.
- Until he answers: the audit goes on with work that none of the four change (tools, A1b, A2-A4, A7, 3E).

## Resume notes
- Audit worktree (coordinator): scratchpad wt-audit, detached at origin/main. The main checkout D:\Apps\ForgeAI\Codebase
  has unrelated uncommitted changes and is 729 commits behind: do not use it for the audit.
- Keep-awake tool was not available in the start run.
- Plan file was edited 18 Nov (change log at its top; backup beside it). Helpers must NOT open the plan: pasted briefs only.
- Session crons in the start chat: hourly pacer backup (:41) and one usage guard. They die if that chat closes.
- E1 helper (test history) was started with the OLD brief style; its outputs: test-history.csv, test-history-summary.md, _sources/e1_history.py.
- 18 Nov 2026: chat compacts at 20% now; after it, read these notes before saying we never discussed or he never approved something.
