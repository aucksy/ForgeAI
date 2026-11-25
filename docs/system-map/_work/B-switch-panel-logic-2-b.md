# B-switch-panel-logic-2-b checkpoint
## Done
- 2026-11-26 started: read lens rules, pilot lessons, brief, items, field-fill.csv (Crispy Curves: birthday 1/2, phone 2/2, check-in phone 1/2, app link 0/2, plan dates 1/1, trainer 0/2, batch 0/2).
- 2026-11-26 H6.1-H6.3 checked: birthday wish (whatsapp.ts) needs a birthday; join-page request never carries one (selfJoin.ts:54-76, :134-137; no join migration writes dateOfBirth) -> new 01 S4. App link / trainer / batch at 0/2 but features hide quietly (progress card, phone links ask at check-in); no finding (2-member test gym).
- 2026-11-26 H6.4-H6.5 checked: Messages & offers amount/discount boxes drop the decimal point (1499.00 -> 149900, 7.5 -> 75%) -> new 02 S4. Hindi digits dropped by these boxes, workout offer and friend-days boxes = same root as FN-B-switch-panel-logic-1-b-02 (reused). Mobile rule (members.ts:51-77), Pay MettleUp reference (payMettleUp.ts:160-175), YouTube link (trainerVideos.ts:25-34) OK; Pay amount comma = FN-L16-panel-logic-2-01 (reused).
- 2026-11-26 output written (2 findings + 1 grid row); lens-cover ok; merge --dry 3/3 passed. DONE.
