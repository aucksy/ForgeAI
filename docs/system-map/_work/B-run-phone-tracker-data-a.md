# Checkpoint B-run-phone-tracker-data-a
- started 2026-11-24. Read lens rules, brief, items. Existing findings to reuse: FN-B-run-phone-components-1-a-01 (save fail not logged/reported), FN-B-run-phone-lib-core-a-06 (no product measurement), FN-B-run-phone-lib-core-a-04/05 (crash report gaps).
- L6.6: draft save + Finish failure banner logs nothing (saveProblemStore.ts:76-91, activeWorkoutStore.ts:701-711,2700-2715) -> reuse FN-B-run-phone-components-1-a-01.
- L6.1/6.2/6.3/6.4/6.5/6.7/6.8 read: Finish guard + one transaction (activeWorkoutStore 2602-2690), draft upsert+retry (695-725), rest timer absolute time (restTimerStore 120-145), backup covers tracker tables (backup/backupCollect.ts:130-149, test/backup/backupRoundTrip.test.ts:275). New faults: draft read fail at start = no workout (1839), records re-work fail no note (sessionEdit 133, 1764), import key read fail -> dup (importKeys 56).
- DONE all items; output written.
