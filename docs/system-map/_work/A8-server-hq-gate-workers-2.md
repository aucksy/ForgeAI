# A8-server-hq-gate-workers-2 checkpoint

- 2026-11-21: all 72 journeys written to _work/out/A8-server-hq-gate-workers-2.jsonl (1 full, 61 partial, 10 none), 8 new lens-1 findings. Main cover: supabase/tests 0026, 0027, 0028, 0030, 0034; deploy/hq/hq.test.mjs; apps/hq/test/logic.test.mjs; deploy/panel/help.test.mjs; apps/mobile/test/lib/helpHistoryStore.test.ts. HQ screens themselves are not driven by any test (already FN-A8-hq-app-2-01).
- Note for the coordinator: FN-A8-hq-app-1-01 says the old PIN stopping after an HQ reset is untested, but supabase/tests/0034_signin_pin.sql:169-178 does check it.
- Status: done; a8-cover and merge --dry run before report.
