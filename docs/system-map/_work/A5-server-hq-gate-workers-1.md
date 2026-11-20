# A5-server-hq-gate-workers-1 checkpoint

F-server-202: 5 journeys, 7 type lines
F-server-203: 5 journeys, 7 type lines
F-server-204: 3 journeys, 9 type lines
F-server-205: 5 journeys, 7 type lines
F-server-208: 5 journeys, 8 type lines
F-server-209: 10 journeys, 14 type lines
F-server-211: 8 journeys, 16 type lines
F-server-212: 10 journeys, 14 type lines
F-server-213: 11 journeys, 25 type lines

Done: all 9 features, 14 feature x role pairs. Output: _work/out/A5-server-hq-gate-workers-1.jsonl (62 journeys, 107 type lines, 2 findings). merge --dry --a5cover: 0 rejected, 0 with gaps.

Entities: no entity id exists for the weekly Cloudflare usage check or the HQ "Needs you" alert state (KV), so those type lines say "unknown". GitHub release download counts (System page) have no entity either.

Seen in passing (not findings):
- Making a gym from a lead sets it to Demo, not Won; the nightly clean-up deletes every non-Won lead after a year, while the Leads page says "Kept 12 months unless they become a customer". A gym made from a lead and never marked Won loses its lead row.
- Needs you: a failed minute check keeps the old numbers with no word that they are old (refreshNeeds returns quietly).
- Needs you "could not be counted" note checks only leads, feedback, help and gyms, not payments.
- Feedback "Everything" lists only the newest 200, Leads the newest 300, with no word that more exist.
- HQ message bell shows only the newest 10 from the last 120 days; HQ's "Sent (n)" does not say older ones no longer show.
- HQ messages are English only; a Hinglish admin app shows them in English.
- System page "Feedback n new" counts every source with status new; Needs you counts differently (help questions apart).

Could not check: the exact refusal words when HQ rejects a payment with no reason (decided inside the database function, not read). No tests opened; every journey coverage "unknown".
