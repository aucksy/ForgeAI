# A5-phone-shop-2-2 checkpoint
Started 20 Nov 2026. Rows in _work/out/A5-phone-shop-2-2.jsonl.
F-phone-416: 10 journeys, 14 type lines
F-phone-419: 10 journeys, 14 type lines
F-phone-417: 10 journeys, 14 type lines
F-phone-410: 8 journeys, 16 type lines
F-phone-427: 8 journeys, 16 type lines
F-phone-426: 12 journeys, 14 type lines (pass member: whether a pass counts as a running plan for NO_PLAN is unknown from the phone code)
F-phone-429: 12 journeys, 14 type lines
F-phone-423: 9 journeys, 16 type lines

## Notes
- No finding rows: nothing read was plainly wrong in the code.
- Seen in passing: gym hours sync (gymTimingsSync.ts:36-37) stamps lastAsked before the call, so a failed or offline ask blocks the next automatic ask for 10 minutes (only a pull asks again).
- Seen in passing: Ask about your workout says "Only the person you pick sees your question." (askTrainer.ts:70); promise row P-A7-phone-watch-2-25 already records the server also shows it to the owner. Not re-filed.
- Seen in passing: leaderboard title says "last 30 days" (boardWords.ts:12) while the phone pushes 31 days (leaderboard.ts BOARD_PUSH_DAYS); the server picks the window.
- F-phone-427: only way in is the Gym tab card; no report alert in the phone alert runner, so type 2 is a "no" line.
- F-phone-426 pass member: whether a pass counts as a running plan for the offer's NO_PLAN refusal is decided on the server; unknown from phone code.
- Entities: no entity for the busy level; F-phone-417 reads E-crm-records (visits) and E-gym-timings.
- Could not check: tests not opened, so every journey has coverage "unknown"; no device run, no data query.
DONE: all 8 features.
