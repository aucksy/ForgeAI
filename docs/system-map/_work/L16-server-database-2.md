# Checkpoint L16-server-database-2 (2026-11-24)
- L16.1 done: 3 new findings (stale not-applied headers 0058-0062 vs live catalog; 0046 unapplied yet in CI db; push-queue catch only warns). Reused FN-A8-panel-screens-1-2-02 (0059 no db test). Date rule (Asia/Kolkata) consistent across all 29 files; redefinitions (_challenge_results, staff_sign_in, hq_push_next) carry earlier fixes; plan list duplicated in SQL and TS but guarded by pricesOneSource test; every test file has 12+ checks.
- L16.2 done: no flaky test found; each test is one DO block so now() is frozen; no wall-clock waits.
