# A8-server-database-1-3 checkpoint

- 2026-11-21: read 0024, 0025, 0018 (owner fns), 0026, 0027, 0028, 0042 (part), uat_shop_orders (messages), uat_access_matrix (messages), forgeaccess.spec, hqAccess.test. About 1,250 test lines.
- All 79 journeys written to _work/out/A8-server-database-1-3.jsonl (F-320, 321, 322, 310, 323, 324, 325, 326, 327) plus 10 lens-1 findings (-01 to -10).
- Already-listed faults used as coverage notes only: desk reading the Sent list (FN-A8-panel-shop-1-03), gym delete checks two tables (FN-A8-hq-app-2-03), emergency-window wording (FN-A5-server-database-1-3-01), number kept on leave (FN-A5-server-database-1-2-01).
- Next: run a8-cover.mjs and merge.mjs --dry, fix, report.
