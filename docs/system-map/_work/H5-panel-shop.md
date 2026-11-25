# H5-panel-shop checkpoint

## Done
- [x] started 2026-11-26: read brief, lens rules, H5-hq-app lessons, items (42 features), live-state-facts, sibling pay-machines output
- [x] catalog read 1: all 94 functions the shop folder calls are present live (owner_* list + demo_start_gym, self_join_preview, staff_give_reward)
- [x] catalog read 2: self_join_preview, owner_billing, _billing_on, gym_has_feature all present and read-only. Crispy self_join_preview call refused by approval guard (unknown).
- [x] live: /api/switches 26 Nov gymPages false, joinPay true; /api/links join=app.mettleup.fit; web-key 200; live script index--GfMsOId.js, newest Whats-new id 2026-11-25 = main. Every shop function name in live script except owner_billing/owner_receipt (cut out because BILLING_ONLINE_ON false).
- [x] checks: plus lock off by MEMBER_PLAN_GATE_ON (logic/plusLock.ts:18, theme memberPlan.ts:28); billing online off by BILLING_ONLINE_ON (plans.ts:231); /m/ join page served live (title Become a member); storage bucket read refused by guard (unknown). Whats-new released lines in area all match live functions. No new finding so far.
- [x] H5.4 LIVE-STATE.md section added at lines 545-601 (42 rows)
