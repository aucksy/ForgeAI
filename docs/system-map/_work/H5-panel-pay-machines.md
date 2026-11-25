# H5-panel-pay-machines checkpoint

## Done
- [ ] started 2026-11-26: read brief, lessons, items, live-state-facts
- [x] inputs read; live /api/switches 26 Nov: joinPay TRUE now (main JOIN_PAY "live" wrangler.jsonc:92; note at :74 still says Off)
- [x] catalog read 1: all branch_*, owner_*branch*, gate_*, self_join_pay_gym present; owner_gym_pack ABSENT (0046 not live)
- [x] gate.mettleup.fit: no DNS answer (curl exit 6) = door service not deployed; wrangler route commented (deploy/gate/wrangler.jsonc:15)
- [x] live panel script index--GfMsOId.js holds area words (payments, pro pack, entry address, branch calls, demo strings)
- finding plan: NEW -01 entry machine screen live, address dead (S2). Reuse FN-H5-panel-logic-2-01 (stale notes), FN-H5-hq-app-02 (stale marks), FN-B-truth-server-panel-worker-a-01 (join pay words)
- [x] H5.1 to H5.4 done (one grid row, lens gap-5). New FN-H5-panel-pay-machines-01 (S2), -02 (S3). Reused FN-H5-hq-app-02, FN-H5-panel-logic-2-01, FN-B-truth-server-panel-worker-a-01.
- [x] LIVE-STATE.md section added at lines 328-373 (31 feature rows).
- [x] lens-cover ok; merge --dry 3 passed, 0 rejected. Code lines read: about 450. Catalog reads: 1.
