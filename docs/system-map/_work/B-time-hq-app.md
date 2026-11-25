# B-time-hq-app checkpoint

## LESSONS for the next B-time helpers
- The items file lists the feature block 3 times (once per lens); read it once. 7 items only, all one grid row per lens.
- Read first: the area's service worker / install script and how the server sets cache headers (deploy/<surface>/worker.js) for L13.1; then the date helpers (search logic for addMonths, IST, trial, paid until) for L20.1.
- Grep findings.jsonl for "surface":"<surface>" titles before writing: the B-truth / B-run / L5 helpers already wrote most time faults (trial tile, sign-in expiry). Reuse those ids in finding_ids.
- For "new only for new users" (H7.1), check the migration that added the rule: a backfill UPDATE is the existing-users path.
- Skip: features.json and journey-types for a small web area; the code answers it faster. The "sources" and "at_step" rules do not apply to finding or grid rows.
- Watch, sideload and Play parts of L13.1 do not apply to a web panel: say so in the reason, keep status checked.

## Progress
- L13.1 done (FN-B-time-hq-app-01)
- L20.1 done (reused existing ids)
- H7.1-H7.5 done (reused FN-B-truth-hq-app-b-02)
