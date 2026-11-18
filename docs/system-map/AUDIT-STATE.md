status: RUNNING
phase/step: plan review (in progress), A1 done, A2 next
expected end: unknown until A2 learned costs (rough: 3 weekly periods = by about 9 Dec 2026)
mode: ANALYSIS ONLY. No app code, tests, workflows, skills or settings change. "Apply" items in 3E/3F = proposals only.
model: every helper = Fable 5.2 ("fable"), effort "medium". Max 6 helpers at once.
blind check: never put backlog rows F222-F227, F232 or hints into a helper brief.

## Windows
| window reset (IST) | F5 start | F5 now | WF | WA | helpers run | why stopped |
|---|---|---|---|---|---|---|
| 18 Nov 20:00 | 6 | 6 | 0 | 0 | plan-review, E1 | running |

## Learned cost per helper type (5-hour %)
| step | helpers so far | average cost |
|---|---|---|
| plan-review | 0 | 5 (start value) |
| A2 | 0 | 5 (start value) |

## Work items
| id | step | what | status (todo / in progress / done) | checkpoint file | helper result (1 line) |
|---|---|---|---|---|---|
| W0 | review | plan review -> PLAN-REVIEW.md | in progress | _work/plan-review.md | |
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
(more after the plan review)

## Resume notes
- Audit worktree (coordinator): scratchpad wt-audit, detached at origin/main. The main checkout D:\Apps\ForgeAI\Codebase
  has unrelated uncommitted changes and is 729 commits behind: do not use it for the audit.
- Keep-awake tool was not available in the start run.
