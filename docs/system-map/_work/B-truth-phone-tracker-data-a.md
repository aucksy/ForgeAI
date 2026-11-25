# checkpoint B-truth-phone-tracker-data-a (started 2026-11-25)
- L2.5 import: records_from handled post-import (hevyImport.ts:1466-1471); importKeys keeps original start (no dup on re-import after edit). no finding.
- L2.4 double tap: finish guard committing set sync (activeWorkoutStore.ts:2606,2618) + draft clear in same tx. ok.
- L2.6 migrations: trackerSchema.ts v1-v16 all additive nullable cols/new tables, version stamped last (trackerSchema.ts:37-161). ok.
- L2.1 partial: session volume raw w*r excl warmups (sessionDetails.ts:239); merge keeps load_mode + rebuilds records (exerciseManage.ts:186-212). ok so far.
- L2.x L17.x done; out written: 2 new findings (name rules, rename not to HC)
