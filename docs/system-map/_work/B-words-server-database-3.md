# B-words-server-database-3 checkpoint

## Progress
- L10.1 checked (lens 10): new finding 01 (alert lines English only); reused FN-B-truth-server-hq-gate-workers-a-01, FN-B-alerts-server-database-3-a-02, FN-A3-notes-claude-1-05.
- H10.1-H10.16 checked (gap-10): new finding 02 (credit alert title, at-once list); reused FN-B-words-phone-shop-1-01, FN-L3-server-database-3-03, FN-L4-server-database-3-05, FN-B-words-hq-app-06 and others.
- Data: catalog only (0097 and 0098 are live although their first line says not applied).
- Output rows being written to _work/out/B-words-server-database-3.jsonl; then lens-cover and merge --dry.
- Code lines read: about 1,100.
- Rows written: 2 findings + 2 grid rows. lens-cover ok; merge --dry 4 rows, 0 rejected.
- Lesson: data evidence must be "data:..." with no space after the colon, or merge rejects it.
DONE.
