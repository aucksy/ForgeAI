# B-alerts-panel-forms-a checkpoint

## Items
- started 26 Nov: read brief, lessons, items; forms send nothing directly (grep). Next: read online-pay send path.
- L11.1 done: forms send nothing themselves. Only alert path: "Send to their app" on Collect payment -> D1 ask -> HQ minute feed -> please-pay pop-up (0073). Findings 01 (says Sent with no reach check), 02 (note never cleared after cash). Phone hint mentions only WhatsApp.
- H2.1 done. Please-pay pop-up conditions: server on, no payment company, UPI ID saved, fee kind; roster phone set and first name valid; no other active member on the same number; app member whose check-in number matches and has not left; push address; notifications allowed; phone maker rules; HQ feed within 15 min while ask still open. Birthday wish: date of birth filled.
- H2.2 done: no per-member reach on the sheet (01); no birthday-missing view from the form (04).
- H2.3 done: 01, 03, 04.
- H2.4 done (field-fill.csv, Crispy Curves): check-in phone 1 of 2, app link 0 of 2 -> please-pay pop-up reaches at most 1 of 2; birthday 1 of 2 -> wish at most 1 of 2.
- H2.5 could-not-check: real phone (OPPO/Xiaomi/Samsung, battery saver, screen off): pop-up shows, sounds, tap opens pay.
- Wrote out/B-alerts-panel-forms-a.jsonl (4 findings, 2 grids). Running tool checks.
- lens-cover ok; merge --dry 6 of 6 passed. Done.
