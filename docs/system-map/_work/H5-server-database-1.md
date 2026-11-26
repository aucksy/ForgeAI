# H5-server-database-1 checkpoint

## Done
- [x] H5.1 to H5.4 (one grid row, lens gap-5). New finding FN-H5-server-database-1-01 (retired free-limits switch). Reused FN-L16-server-database-2-01 (0031/0032 stale "NOT APPLIED" first lines) and FN-A3-inbox-4-05 (0033).
- Catalog reads: 112/112 functions and 35/35 tables from 0001-0033 present live; prosrc of 4 helpers; app_config free_limits (off); Crispy Curves reminder row (none).
- A plain function call (select _terms_versions()) was refused by the approval guard; read its body from pg_proc instead.
- LIVE-STATE.md section added at lines 1541-1590.
- Code lines read: about 150.
- [x] lens-cover ok; merge --dry 2 passed, 0 rejected.
