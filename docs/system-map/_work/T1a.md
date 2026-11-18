# T1a checkpoint
- [x] 1 work-items.jsonl seeded (13 items; old per-surface A2 rows W2-W6 replaced by A2-pilot + A2-split)
- [x] 2 _tools/state.mjs written and tested on a copy (next/start/done/fail x2 -> blocked/add/dup add/reset/pct/summary; only the two tables changed, CRLF kept)
- [x] 3 _tools/merge.mjs written and tested on a throwaway sample (8 kinds merged; bad rows, id clash, missing pointer, line outside file, blind pattern, patch, re-run with fewer rows, --cover, --dry)
- [x] 4 _briefs/rows.md (8 kinds, made-up)
- [x] 5 _briefs/A2 A3 A4 A7 E2 E4 .md (section 0 block copied by script from the plan, unchanged)
- [x] 6 RUNBOOK.md

DONE. Left for the coordinator: run `node docs/system-map/_tools/state.mjs summary` (not run on the real AUDIT-STATE.md by this helper); make the blind pattern file outside the repo; mark T1a done. Not built here: sources.mjs, redact.mjs (items A1b, G0); merge.mjs has no lens-item check yet (needs lens-items.json).
