# H5-hq-app checkpoint

## LESSONS for the next H5 helpers
- Read first: _sources/live-state-facts.md (103 lines). It holds the D1 list, live switches and Play state; the machine
  live-state.csv is only its short form. Then the items file. Skip reading the area's front-end code: for gap-5 the
  switches sit in the SERVER code (deploy/<surface>/api.js, wrangler.jsonc vars), not in apps/*/public.
- The brief says "features.json" but your list is only your area's features. LIVE-STATE.md is ONE shared file: it now has a
  whole-system block plus an HQ section. Add your own section; never rewrite others.
- One catalog read settles most "waiting for a migration" questions: list the function names your server calls
  (grep -ohE "'name_prefix_[a-z_]+'" deploy/<x>/*.js) and check them in pg_proc. Keep catalog queries plain
  (WHERE proname IN (...)); a VALUES-list query was refused by the approval guard.
- Migration headers lie both ways: 0058-0064, 0071, 0072, 0097 say "not applied" but are live; 0046, 0091, 0092, 0094 are
  really not live. Do not trust a first line.
- D1 (small web database) cannot be read: no wrangler on the laptop. Mark D1-only parts unknown / could-not-check.
- Do not open HQ or the panel in Chrome to read a live switch: the first page lists every gym (breaks the one-gym rule).
- Existing ids to reuse: FN-L16-server-database-2-01 (stale migration headers), FN-A3-whats-new-panel-02 (notes vs headers),
  FN-L16-server-panel-worker-06 (D1 not-ready branches).
- H5.3: What's new lines for things not yet live sit in "pending-..." entries; those are fine.

## Done
- [x] H5.1 to H5.4 (one grid row, lens gap-5). Findings FN-H5-hq-app-01, -02. LIVE-STATE.md written (whole-system block + HQ section).
- Code lines read: about 120. Catalog reads: 3.
- [x] lens-cover ok; merge --dry 3 passed, 0 rejected.
- Lesson added: merge --dry hides the reject reason. Evidence pointing at a whole file (no :line) is rejected; give LIVE-STATE.md a line range.
