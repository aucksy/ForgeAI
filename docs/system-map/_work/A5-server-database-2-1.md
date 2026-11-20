# A5-server-database-2-1 checkpoint

Done (all 9 features, 25 feature x role pairs). Rows: _work/out/A5-server-database-2-1.jsonl (300 journey/type rows + 2 findings = 302). Generator: _work/A5-server-database-2-1/gen.py.

F-server-400: 10 journeys, 14 type lines
F-server-401: 10 journeys, 14 type lines
F-server-402: 14 journeys, 34 type lines
F-server-403: 16 journeys, 32 type lines
F-server-404: 13 journeys, 23 type lines
F-server-405: 12 journeys, 24 type lines
F-server-406: 14 journeys, 22 type lines
F-server-407: 14 journeys, 22 type lines
F-server-408: 5 journeys, 7 type lines

Findings: FN-A5-server-database-2-1-01 (PIN-change lock never grows), FN-A5-server-database-2-1-02 (leaderboard 15-second throttle drops new days).

Entities with no id (left out): gym_signin_fails (wrong-try log), hq_audit (HQ log), gym_message_to (group recipients), gym_board_meta.

Seen in passing (not sure, not findings):
- HQ reset of an owner sign-in clears the PIN and makes a code but does not end the owner's live sessions; a lost or stolen signed-in phone stays in until the owner signs it out (0034_signin_pin.sql:341-363).
- 'Sign out other devices' on the owner's own row (if it uses owner_sign_out_person) also deletes the owner's own PIN in every branch (0034_signin_pin.sql:333); the panel side was not read.
- After 0048 each "give" of a challenge reward makes its own gym message; with many winners this may use up the gym's 10 messages a day (0048_security_fixes.sql:428-430, 0047_challenge_rewards.sql:142-158); the daily cap code was not read.
- The "first 2 messages a day pop up" quiet rule (P-A7-whats-new-2-78) is not in hq_push_next (0053:433-524); it may live in the Worker or the phone. Not checked.

Could not check: panel and phone screens were not opened beyond word searches; HQ app wording for the owner reset; the push Worker (deploy/hq/push.js).
