# H5-server-panel-worker checkpoint

## Progress
- started 2026-11-26; inputs read (brief, lens rules, hq-app lessons, items, live-state-facts, live-state.csv)
- live reads 26 Nov: /api/switches joinPay true; phone-code inbound; links; moved; /api/pay/desk 405 (D1 0011 ready); hq-news 1 row (D1 0006 live); web-key 200; whats-new 0.80.0; /app android->Play, iphone coming soon; join.mettleup.fit no DNS. catalog: all panel rpc present except page_chat_* (0094)
- findings planned: -01 AI assistant listed unknown but live; -02 update-screen news follows GitHub not Play; reuse FN-H5-server-database-3-01, FN-L14-server-panel-worker-02

## Done
- [x] H5.1 to H5.4 (one grid row, lens gap-5). Findings FN-H5-server-panel-worker-01 (S4), -02 (S2). Reused FN-H5-server-database-3-01, FN-L14-server-panel-worker-02.
- LIVE-STATE.md section added at lines 1743-1796 (CRLF kept).
- Catalog reads: 2 (pg_proc names; ledger columns) + 1 Crispy-only ledger count. A read of app_config was refused by the guard and not retried.
- Code lines read: about 330.
- [x] lens-cover ok; merge --dry 3 passed, 0 rejected.
