# H5-server-hq-gate-workers checkpoint

## Done
- [x] H5.1 to H5.4 (one grid row, lens gap-5). Findings FN-H5-server-hq-gate-workers-01, -02. Reused FN-H5-hq-app-01/-02, FN-H5-panel-pay-machines-01.
- LIVE-STATE.md section added at lines 1695-1742 (CRLF kept).
- Live reads 26 Nov: HQ /backup/status, /readlog/status, /push/web-key, POST /billing/<unknown> (NOT_SET_UP), panel /api/switches, DNS gate.mettleup.fit (none), one catalog read (pg_proc names).
- Note: one POST to HQ /push/run was made by mistake; it only runs the every-minute sender early (sends what is already due). Known finding FN-L3-server-hq-gate-workers-03.
- Code lines read: about 250.
- [x] lens-cover ok; merge --dry 3 passed, 0 rejected.
