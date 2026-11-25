# B-switch-panel-logic-1-b checkpoint
## Done
- 2026-11-26 H6.1-H6.3 checked: Crispy Curves (field-fill.csv) birthday 1/2, phone 2/2, check-in phone 1/2, app link 0/2, plan dates 1/1, trainer 0/2, batch 0/2. App link is not depended on (members matched by phone, autoWish.ts:11, audience.ts:138-142); batch only a filter; no finding.
- 2026-11-26 H6.4-H6.5 checked: import mobile path OK (onlyDigits), but import dates/fees, "+" mobiles, body-measure boxes and reminder days ignore other-script digits (new 02, S3, refs FN-B-switch-panel-forms-03); Aadhaar scrub misses other-script digits and dot separators though the AI mask catches them (new 01, S2).
- Output written; lens-cover + merge --dry run.
