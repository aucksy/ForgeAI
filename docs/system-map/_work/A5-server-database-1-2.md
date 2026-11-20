# A5-server-database-1-2 checkpoint

F-server-318: 7 journeys, 7 type lines
F-server-317: 5 journeys, 7 type lines
F-server-303: 8 journeys, 16 type lines
F-server-307: 9 journeys, 15 type lines
F-server-315: 11 journeys, 14 type lines
F-server-306: 14 journeys, 22 type lines
F-server-316: 9 journeys, 15 type lines
F-server-319: 5 journeys, 7 type lines
F-server-314: 13 journeys, 23 type lines

All 9 features done (17 feature x role pairs). Output: _work/out/A5-server-database-1-2.jsonl (208 rows: 81 journeys, 126 type lines, 1 finding).

## Read against the LIVE function, not the entry file
- Check-in: entry 0015 was replaced by 0016, 0020, 0031 and 0048; journeys follow 0048 (typed number waits for the desk).
- My membership: 0023 replaced by 0055 (pass members); crm_push last replaced in 0024; crm_pull in 0028.

## Entities with no id (left out of writes/reads)
- member_checkin_tries, gym_checkin_misses (check-in rate limits), crm_push_log (safe retries), gym_creator_ips.

## Seen in passing (not sure enough for a finding)
- Check-in: a typed number answers either "not on the list" or "ask the desk to confirm", so a typer learns whether a number is on the gym's list (capped at 3 numbers a day per member, 20 misses an hour per gym). Designed trade-off per 0048, but it is a membership lookup.
- Product photo and logo links are checked only for the right storage folder shape, not that the upload ticket belonged to this gym: a gym can point at another gym's public photo.
- crm_pull has no role filter: front-desk and trainer devices receive expenses and every receipt. No promise found that says they may not.
- An owner device resending an unchanged copy of an undone-import receipt passes the receipt check (same data) and the save clears its deleted mark. Not proven that any panel path resends it.
- owner_app_members uses the any-session gym check, so the front desk sees app members' phone numbers and money spent.

## Could not check
- Panel and app screens were not driven; words come from the code (dashboard signin.ts, brandLogic.ts, shop/photo.ts, mobile checkIn.ts, membership.ts).
- Whether undone (deleted) import rows are ever purged from the server: no clean-up was read.
