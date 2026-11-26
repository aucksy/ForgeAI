# H1-dedupe checkpoint (done, 27 Nov 2026)

Tool: docs/system-map/_tools/dedupe.mjs (plain Node, ~1 s). Run: `node docs/system-map/_tools/dedupe.mjs [--spot]`.
Outputs: docs/system-map/finding-groups.jsonl, docs/system-map/_work/verify-queue.json.

## Input
2,553 findings, 2,509 distinct root_cause_keys. Top keys: backlog-item-not-built-yet 13 (phone/panel), then nothing above 3.
No key passes the >15 rule. Decided by hand: `backlog-item-not-built-yet` is generic (a kind of gap, not one fault) and is ignored.

## Result (final rule)
- Groups: 2,505 (43 multi-member, holding 91 findings; 2,462 singletons). Every finding in exactly one group (script asserts it).
- Groups per worst: S1 17, S2 228, S3 1,329, S4 931.
- Joins: rule (a) 32, rule (b) 16. Rule (b) candidate near-pairs 13,757; 13,680 refused by the tightened rule; 0 by the 25 cap.
- 10 biggest: G-0246 3 (staff help names things not on the form), G-0247 3 (old update note: sign-in page two tabs),
  G-0248 3 (swapped before/after photos), G-0249 3 (plan weeks count time away), G-1575 3 (AI charging / pay-online listed
  off but built), G-0018 2 (member website: Apple Watch / iPhone "coming soon"), G-0019 2, G-0020 2, G-0021 2, G-0250 2.
- Verify queue: 245 S1/S2 groups + 265 S3 (every 5th of 1,329) = 510 groups.

## Rule changes (spot-check driven)
1. First run, rule (b) as written (chain union-find, cap 25): 493 groups, ten 25-member S1 groups. Spot-check 10: 8 of 10 mixed
   different faults (e.g. demo-wipe + pounds/kilos + free-month wording, glued by shared onboarding files). FAILED.
2. Rule (b) made complete-link: two groups join only if EVERY cross pair points within 30 lines in some file AND the titles
   share words (mean word overlap >= 0.25, stop-words and "tested/check" removed). Evidence inside docs/system-map/ (audit
   source notes such as the backlog copy) no longer counts for rule (b). Spot-check: 3-4 of 10 still different faults
   (different untested features in one test file; proxy safety-lines vs live-update test). FAILED.
3. Title overlap raised to 0.35 (final). Spot-check 10: 8 same fault (help names missing buttons; two-tab note; swapped
   photos; 'Sent' at once for later messages x2; "owner gives the extra days"; try-again with no log; no-year dates; strength
   sheet untested). 2 borderline: G-0018 (Apple Watch and iPhone "coming soon" on member website: same stale-page fault,
   two claims) and G-0266-area pair (web page switch-off leaks questions vs photos: same unenforced switch, two tables). PASS.

## Caveat for H2
The tight rule favours precision: near-duplicates written with different words by different lenses stay as singletons
(only 91 of 2,553 merged). H2 should expect some duplicate pairs inside the 510 queue.
