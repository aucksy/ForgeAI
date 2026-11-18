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
| A2 | 15 | 161k tokens (% not measured yet; plan with 5) |
| A7 | 0 | 5 (start value) |
| E1 | 1 | 189k tokens (% not measured yet; plan with 5) |
| E2 | 1 | 299k tokens (% not measured yet; plan with 5) |
| E3 | 1 | 198k tokens (% not measured yet; plan with 5) |
| E4 | 0 | 5 (start value) |
| 3F | 0 | 5 (start value) |

## Work items
Counts: 20 todo, 6 in progress, 24 done, 0 blocked. Full list: work-items.jsonl. This table is written by _tools/state.mjs summary; do not edit it by hand.

| id | step | what | status (todo / in progress / done) | checkpoint file | helper result (1 line) |
|---|---|---|---|---|---|
| W10 | E4 | 3E E4 better test framework: research + proposals only -> TEST-SYSTEM-REVIEW.md | in progress | _work/E4.md |  |
| W11 | 3F | 3F F1, F4-F6 change-360 review (proposals only; switch stays OFF) -> CHANGE-360-REVIEW.md draft | in progress | _work/F.md |  |
| A2-phone-shop-1 | A2 | A2 features: area phone/shop-1 (68 items, 9373 lines) | in progress | _work/A2-phone-shop-1.md |  |
| A2-phone-tracker-services-1 | A2 | A2 features: area phone/tracker-services-1 (74 items, 10762 lines) | in progress | _work/A2-phone-tracker-services-1.md |  |
| A2-phone-tracker-services-2 | A2 | A2 features: area phone/tracker-services-2 (73 items, 10868 lines) | in progress | _work/A2-phone-tracker-services-2.md |  |
| A7-src | tools | script: _tools/promises.mjs -> _sources/promises.txt (candidate sentences per source group; the file was missing) | in progress | _work/A7-src.md |  |
| A7-pilot | A7 | promises: PILOT, one source group of at most 120 candidate sentences from _sources/promises.txt; runs alone | todo | _work/A7-pilot.md |  |
| A2-phone-tracker-components-1 | A2 | A2 features: area phone/tracker-components-1 (52 items, 8226 lines) | todo | _work/A2-phone-tracker-components-1.md |  |
| A2-phone-tracker-components-2 | A2 | A2 features: area phone/tracker-components-2 (102 items, 8215 lines) | todo | _work/A2-phone-tracker-components-2.md |  |
| A2-phone-tracker-engine | A2 | A2 features: area phone/tracker-engine (35 items, 10011 lines) | todo | _work/A2-phone-tracker-engine.md |  |
| A2-phone-tracker-data | A2 | A2 features: area phone/tracker-data (40 items, 9326 lines) | todo | _work/A2-phone-tracker-data.md |  |
| A2-phone-tracker-lib | A2 | A2 features: area phone/tracker-lib (59 items, 9117 lines) | todo | _work/A2-phone-tracker-lib.md |  |
| A2-phone-native | A2 | A2 features: area phone/native (103 items, 11102 lines) | todo | _work/A2-phone-native.md |  |
| A2-phone-components-1 | A2 | A2 features: area phone/components-1 (127 items, 7312 lines) | todo | _work/A2-phone-components-1.md |  |
| A2-phone-components-2 | A2 | A2 features: area phone/components-2 (127 items, 7178 lines) | todo | _work/A2-phone-components-2.md |  |
| A2-phone-cloud-backup-ai | A2 | A2 features: area phone/cloud-backup-ai (59 items, 9259 lines) | todo | _work/A2-phone-cloud-backup-ai.md |  |
| A2-phone-onboarding-db | A2 | A2 features: area phone/onboarding-db (81 items, 11893 lines) | todo | _work/A2-phone-onboarding-db.md |  |
| A2-phone-lib-core | A2 | A2 features: area phone/lib-core (131 items, 7594 lines) | todo | _work/A2-phone-lib-core.md |  |
| A2-watch-app | A2 | A2 features: area watch/app (50 items, 5958 lines) | todo | _work/A2-watch-app.md |  |
| A2-hq-app | A2 | A2 features: area hq/app (141 items, 2841 lines) | todo | _work/A2-hq-app.md |  |
| A2-server-panel-worker | A2 | A2 features: area server/panel-worker (355 items, 8014 lines) | todo | _work/A2-server-panel-worker.md |  |
| A2-server-hq-gate-workers | A2 | A2 features: area server/hq-gate-workers (183 items, 4483 lines) | todo | _work/A2-server-hq-gate-workers.md |  |
| A2-server-database-1 | A2 | A2 features: area server/database-1 (231 items, 7918 lines) | todo | _work/A2-server-database-1.md |  |
| A2-server-database-2 | A2 | A2 features: area server/database-2 (293 items, 7930 lines) | todo | _work/A2-server-database-2.md |  |
| A2-server-database-3 | A2 | A2 features: area server/database-3 (251 items, 8114 lines) | todo | _work/A2-server-database-3.md |  |
| A2-server-ci-workflows | A2 | A2 features: area server/ci-workflows (20 items, 3524 lines) | todo | _work/A2-server-ci-workflows.md |  |
| A2-panel-logic-2 | A2 | A2 features: area panel/logic-2 (96 items, 10982 lines) | done | _work/A2-panel-logic-2.md | 39 rows (38 features), 96 of 96 lines |
| A2-panel-shop | A2 | A2 features: area panel/shop (128 items, 8869 lines) | done | _work/A2-panel-shop.md | 39 rows (38 features), 128 of 128 lines; tier unknown on all |
| A2-panel-assistant | A2 | A2 features: area panel/assistant (30 items, 6837 lines) | done | _work/A2-panel-assistant.md | 18 features, 30 of 30 lines; all behind switch |
| A2-panel-auth-data | A2 | A2 features: area panel/auth-data (56 items, 8459 lines) | done | _work/A2-panel-auth-data.md | 26 features, 56 of 56 lines; 23 live, 2 behind a switch, 1 unknown; 5 passing notes in checkpoint |
| A2-panel-brand-shell | A2 | A2 features: area panel/brand-shell (740 items, 8507 lines) | done | _work/A2-panel-brand-shell.md | 40 rows (38 features), 740 of 740 lines, placed mostly by file header; list overlaps other panel areas (de-duplicate in A3); old dashboard is dead code |
| A2-phone-screens-1 | A2 | A2 features: area phone/screens-1 (161 items, 7231 lines) | done | _work/A2-phone-screens-1.md | 40 rows (39 features), 161 of 161 lines; 34 live, 3 behind switch, 2 hidden; items file also holds lines of later screens |
| A2-phone-screens-2 | A2 | A2 features: area phone/screens-2 (161 items, 7566 lines) | done | _work/A2-phone-screens-2.md | 40 rows, 161 of 161 lines; 31 live, 6 behind switch; about 80 lines are the same as screens-1 (de-duplicate in A3) |
| A2-phone-shop-2 | A2 | A2 features: area phone/shop-2 (185 items, 9398 lines) | done | _work/A2-phone-shop-2.md | 36 rows (34 features), 185 of 185 lines; plan gates written but off; surface name fixed by coordinator |
(+ 16 older done items, not shown)

## Needs Aakash
- Nothing open. P2, P23, P24, P25: he said "take best decisions yourself..." (18 Nov 2026); the recommended option of each was taken and written into the plan (change log at its top).

## Resume notes
- ADDED 18 Nov evening: NIGHT RULE (his words, 18 Nov 2026: "Anywhere between 12am to 6am, you can feel free to use up to 100% of my 5 hour limit. Just ensure that you're not starting tasks at the very end moment that gets impacted by the limit end."). Between 00:00 and 06:00 IST this replaces the 75 / 80 / 85 numbers above, wherever they appear in this file: launch at full speed (max 6 at once) only while F5_now + RESERVED + cost(step) <= 96, costs rounded up, so that no helper is cut by the limit. Start nothing new at F5 >= 92. Tell helpers to save and stop only at F5 >= 98. From 06:00 IST the day rule applies again to every new launch; helpers that started before 06:00 finish. The weekly limits and their stop lines do not change at night.
- 18 Nov 18:10 IST: window 1 CLOSED at F5 84 (weekly Fable 20, weekly all 11). No helper runs. Lock file deleted, so the hourly pacer task takes over after the 20:00 IST reset. 9 of 37 A2 areas done, 264 feature rows. Next: the other 28 A2 areas.
- NEWEST PACING RULE, 18 Nov evening (replaces every pacing line below): NO HOURLY SPREADING; STOP BETWEEN 75 AND 80 (his words, 18 Nov 2026, newest: "stop anywhere between 75 to 80% and in case needed maximum it can go up to 85% ... sooner the better"; earlier the same day: "it's one and the same thing you wait now or you wait later"). RULE: launch helpers at full speed (max 6 at once) only while F5_now + RESERVED + cost(step) <= 80. At F5 >= 75: start nothing new. Helpers already running always finish; the window should end between 75 and 80 and must not pass 85, so count RESERVED honestly and round costs up. Tell helpers to save and stop only at F5 >= 95. The hourly target T is not used.
- Window 1 (reset 20:00 IST): F5 80 at 17:45 IST with one last small helper (A2-panel-forms) running; nothing more starts in this window. 8 of 37 A2 areas done, 240 feature rows. Learned cost: one A2 helper = about 150k tokens = about 4 F5 points.
- NEWEST PACING RULE (replaces the "STOP LINE IS 80" line below): NO HOURLY SPREADING (his words, 18 Nov 2026, later the same day: "let the audit run ... without any early limitations. Because it's one and the same thing you wait now or you wait later ... once you know it's 85% do not start anything new ... Do not let the review stop just because you have reached 85%. Let it complete, it's okay if it goes 90%"). RULE: launch helpers at full speed (max 6 at once) while F5_now + RESERVED + cost(step) <= 85. Aim to end each window between 80 and 85. At F5 >= 85: start nothing new. Helpers already running ALWAYS finish (ending near 90 is fine); never tell them to stop for the 5-hour limit unless F5 >= 95. The hourly target T is no longer used.
- STOP LINE IS 80, not 85 (his words, 18 Nov 2026: "only consume up to 80% of my 5 hour window by these audit tasks"). Target T = F5_start + (80 - F5_start) x min(1, (hours_gone + 1) / 5). At 87: tell helpers to save and stop. Changed in the plan (8C), RUNBOOK.md and the pacer task file.
- 17:26 IST: start chat has no helpers running; lock deleted; the pacer task owns the next launches.
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
