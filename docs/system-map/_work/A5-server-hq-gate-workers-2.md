# A5-server-hq-gate-workers-2 checkpoint

F-server-214: 5 journeys, 7 type lines
F-server-216: 14 journeys, 22 type lines
F-server-206: 14 journeys, 22 type lines
F-server-218: 5 journeys, 7 type lines
F-server-219: 5 journeys, 7 type lines
F-server-215: 5 journeys, 7 type lines
F-server-220: 10 journeys, 14 type lines
F-server-221: 14 journeys, 22 type lines

All 8 items done. Output: _work/out/A5-server-hq-gate-workers-2.jsonl (181 rows: 72 journeys, 108 type lines, 1 finding).
Dry merge: 0 rejected, 0 with gaps. One warning: J-F-server-220-03 (refused gym create) really stores and reads nothing.

## Seen in passing (not sure enough for a finding)
- Gym delete touches only the Supabase database: the gym's rows in Cloudflare's database (help questions with members' words and push addresses, AI use, leads note) are not removed by "Delete the gym for ever". Whether the 30-day promise covers them is unclear.
- "Make the gym" comes back after a save, so a second press makes a second gym for the same owner (no duplicate check on the mobile or the lead).
- A help reply's push address is cleared before the pop-up is sent; if Google is busy, the pop-up is lost and HQ is told only "They see it the next time they open the app".
- "Sign out everywhere" does not need a fresh HQ sign-in, while a new code does.
- "Set the plan" accepts a paid-until date in the past.
- Storage removal sends only the apikey header (no Authorization); whether Supabase accepts that with the HQ key is not checked.

## Could not check
- The admin app's sign-in and PIN screen words (F-server-221 owner and staff journeys use described words, not exact ones).
- Member app Help and feedback reply screen words beyond the pop-up text.
