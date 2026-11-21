# L7-server-database-1 checkpoint
- L7.1 done (does-not-apply)
- L7.2 done (reuses FN-L7-panel-auth-data-01, FN-L7-panel-shop-01)
- L7.3 done (does-not-apply)
- L7.4 done (does-not-apply)
- L7.5 done (FN-L7-server-database-1-01, -02; reuses 4 existing)
- Notes: phone lookup index exists live (added 0068); nightly clean-up and sign-in-fail deletes scan small pruned tables, judged negligible; double read rules on profiles/member_summary use cached sub-selects, negligible. EXPLAIN on Crispy needed approval, not run.
