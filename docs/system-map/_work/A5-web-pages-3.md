# A5-web-pages-3 checkpoint

F-web-121: 5 journeys, 7 type lines
F-web-122: 8 journeys, 16 type lines
F-web-123: 8 journeys, 16 type lines
F-web-124: 7 journeys, 7 type lines
F-web-125: 4 journeys, 8 type lines
F-web-133: 6 journeys, 18 type lines
F-web-116: 4 journeys, 8 type lines
F-web-140: 5 journeys, 7 type lines

Total: 134 rows (47 journeys, 87 type lines), 0 findings. merge --dry --a5cover: 0 rejected, 0 with gaps.

## Entities
- F-web-116 journeys list no entity: the switches and the join host are Worker vars (wrangler.jsonc), not stored data; no entity fits.
- F-web-133: the public key itself is no entity; journeys use E-gym-web-push (the subscription the key leads to).

## Seen in passing (not findings)
- AI Assistant and AI column matching: a call where the AI does not answer still uses one of the gym's daily allowance (the question credit is given back, the daily count is not). Possibly by design.
- HQ news (hq_messages) has a single title and body, no Hindi copy: a Hindi-set admin app shows HQ's words as written.
- Help article says the plan writer is "for free" then "saving it uses 3 credits": consistent, but the first half can read as fully free.

## Could not check
- Exact button words of the admin app's bell, browser-alerts switch and Import column list were not opened (panel code outside this item's entry points); words taken from promises.json where known.
