# A5-web-pages-1 checkpoint

Done: all 8 features, 20 feature x role pairs. Output: docs/system-map/_work/out/A5-web-pages-1.jsonl (253 rows; built by _work/A5-web-pages-1/gen.mjs).
Dry merge with --a5cover: 0 rejected, 0 with gaps. The "lists no entity" warnings are real: static legal pages, address routing and proxy error paths touch no stored data.

F-web-139: 25 journeys, 35 type lines
F-web-138: 18 journeys, 21 type lines
F-web-100: 23 journeys, 37 type lines
F-web-127: 14 journeys, 14 type lines
F-web-129: 6 journeys, 7 type lines
F-web-137: 6 journeys, 7 type lines
F-web-108: 12 journeys, 14 type lines
F-web-109: 6 journeys, 7 type lines

Entities: no entity fits the browser-stored sign-in keys handed over by /api/move; E-gym-sessions used as nearest. No entity for the service worker's cache (left out).

Seen in passing (not sure enough for a finding):
- Check-in poster page (checkin.html) tells every iPhone "MettleUp is an Android app for now"; the invite page already sends iPhones to the App Store once that address is set. Will be wrong when the iPhone app ships.
- pay.js deskWho: a staff_me answer with no person role is treated as owner (pay.js:222), which lets that key set any UPI ID on a request. Depends on whether staff_me can ever return no person.
- delete-account.html says you only have an account if you tapped Continue with Google; phone-number sign-in (privacy, 15 Nov) is lookup only, so likely still true.
- Join page preview is cached 5 minutes, including "no gym" answers (worker.js:249-264).

Could not check: live pages and redirects (no browser run in this step); admin-app words for Check and Cancel buttons were not opened (budget).
