# Checkpoint L16-server-database-3
- started 2026-11-24. Inputs read: items file (36 features, 0 code-health rows, 0 orphan tests for this range).
- L16.1 in progress: every migration 0063-0098 has a matching supabase/tests SQL test run by CI database job; silent catches = alert/push triggers swallow into raise warning; redefined functions diffed (no drift found); dead-RPC scan running.
- L16.1 done: all 36 migrations have a CI SQL test; 4 redefined functions diffed, no drift; findings 01 silent alert catches, 02 unused visitor door (hq_hide_gym_page no caller = FN-L14-server-database-3-01), 03 India-day rule copied. Dead-RPC scan stopped partway (after hq_*).
- L16.2 done: tests run in one transaction (now() fixed), ordering uses collate C; no flaky test found.
