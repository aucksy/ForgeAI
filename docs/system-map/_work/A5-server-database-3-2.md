# A5-server-database-3-2 checkpoint

F-server-517: 18 journeys, 30 type lines
F-server-522: 5 journeys, 7 type lines
F-server-513: 9 journeys, 15 type lines
F-server-528: 15 journeys, 21 type lines
F-server-529: 19 journeys, 29 type lines
F-server-519: 15 journeys, 21 type lines
F-server-526: 9 journeys, 15 type lines
F-server-532: 21 journeys, 39 type lines
F-server-518: 12 journeys, 24 type lines
F-server-509: 17 journeys, 31 type lines

Done: all 10 features, 31 pairs. 372 rows (over the 300 row limit: the a5cover check needs 12 rows a pair minimum).
merge.mjs --dry --a5cover: 372 passed, 0 rejected, 0 with gaps.
Generator: session scratchpad A5-server-database-3-2/gen.js.

No entity for: member_find_tries (search counter, 0068) and gym_ai_question_slots: left out of writes/reads.
F-server-532 jtype 10 uses T10-midway with entity none (no stored data on the phone).

Seen in passing (not findings, not sure):
- 0076 owner_clear_web_push deletes by gym + endpoint without the key check that owner_web_push_on uses; any key of the gym that knows a browser address can turn that browser off.
- 0076/0095 hq_panel_push_instant marks an alert sent before the Worker delivers; a Worker crash after the claim loses that push silently.
- 0084 member_trainer_share3 saves without checking the member's sharing switch itself (relies on the phone calling it only when on).
- 0085 known-member branch has no "tag already exists" early return (open-enquiry branch has one); relies on _alert's tag dedup.
- 0090 hq_set_web_page: p_on null means ON.
- Promise P-A7-help-1-21 "Only the owner reads complaints." vs 0096: a complaint to "Gym admin" reaches the front desk (P-A7-help-1-39 states the qualified rule).
- 0083 limit counts answers (month_credits x 10) while blocks may carry slots across months; month_used and the limit can disagree.
