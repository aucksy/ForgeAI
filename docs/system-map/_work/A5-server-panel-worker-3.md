# A5-server-panel-worker-3 checkpoint

F-server-113: 20 journeys, 40 type lines
F-server-115: 9 journeys, 15 type lines
F-server-117: 11 journeys, 25 type lines
F-server-137: 9 journeys, 27 type lines
F-server-135: 8 journeys, 16 type lines
F-server-139: 10 journeys, 26 type lines
F-server-140: 9 journeys, 15 type lines
F-server-116: 5 journeys, 7 type lines

All 8 features done. Output: _work/out/A5-server-panel-worker-3.jsonl (252 rows: 81 journeys, 171 type lines). Dry merge: 0 rejected, 0 with gaps, 23 warnings (journeys with no entity).

## No entity fits
- F-server-137 (web push key): the key is not stored; only the owner/staff "turn on alerts" journeys write E-gym-web-push (the next step after the key).
- F-server-139 (/api/switches): Worker vars only; no entity exists for them.
- F-server-135 (WhatsApp webhook): logs only; only signed inbound messages touch E-phone-inbound.

## Seen in passing (not findings)
- crash.js:131 and leads.js:281 hash the network address with the UTC day, so the "per address in 24 hours" limit and the "same crash today" check restart at UTC midnight (05:30 India time), not a rolling 24 hours.
- help.js:17-18 comment says "20 questions = 1 credit"; questionCredits.js:4 and the What's new line say 10 answers = 1 credit. Comment only.
- help.js: a double tap on send saves two questions (no duplicate guard); feedback.js limits only by count.
- hqNews.js passes the HQ message "link" through unchecked; only HQ writes it.

## Could not check
- The admin app and member app screens that call these addresses (button words beyond the server words); not in this item's entry points.
- HQ app screen words for the feedback list, news and leads (deploy/hq/web.js only grepped).
- Whether the daily crash watch (scripts/watch/crashes.mjs) really opens one issue per signature: not opened.
