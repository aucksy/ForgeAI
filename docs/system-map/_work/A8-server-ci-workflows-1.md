# A8-server-ci-workflows-1 checkpoint

- 2026-11-21: all 91 journeys written to _work/out/A8-server-ci-workflows-1.jsonl, plus 14 findings (FN-A8-server-ci-workflows-1-01..14).
- Real cover found outside the candidate list: scripts/ci/test_*.py (Play scripts, phone gate, shards, release checks, flow tools, iPhone parity), scripts/watch/watch.test.mjs, deploy/hq/readLogAlert.test.mjs, scripts/backup/ci_drill.sh, supabase/tests/security.sql, deploy/panel/razorpayTestMode.check.mjs (its PASS/FAIL steps only, not its guards).
- The script's candidate tests were all word-share noise for these workflow journeys.
- Already listed, reused not re-raised: FN-A5-server-ci-workflows-1-02 (Razorpay green on main with no keys), FN-A5-server-ci-workflows-2-01 (watch signing not rehearsed).
- Test lines read: about 1,100.
