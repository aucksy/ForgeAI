# B-run-panel-pay-machines-a checkpoint
- started 2026-11-24; reading machines code
- machines read: handler.ts, supabaseStore.ts, 0058 gate_save_punches (idempotent); possible: broken upload body -> stamp saved -> punches lost
- pay read: payApi, CollectOnline makeLink, useDeskPay settle, PaidOnline sweep, server createRequest (same dues+amount reuses request = retry-safe)
- branches/move read: add-branch retry -> NAME_TAKEN (S4 candidate); move stays while unsent (ok)
- all 11 items done; 7 findings written to out/B-run-panel-pay-machines-a.jsonl
