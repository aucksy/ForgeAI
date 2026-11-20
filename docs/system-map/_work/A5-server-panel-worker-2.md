# A5-server-panel-worker-2 checkpoint

Done (all 8 features, 23 feature x role pairs; output docs/system-map/_work/out/A5-server-panel-worker-2.jsonl):
F-server-104: 10 journeys, 15 type lines
F-server-105: 9 journeys, 16 type lines
F-server-106: 19 journeys, 31 type lines
F-server-107: 14 journeys, 23 type lines
F-server-110: 7 journeys, 17 type lines
F-server-109: 13 journeys, 25 type lines
F-server-111: 8 journeys, 16 type lines
F-server-112: 19 journeys, 41 type lines

Total 283 rows: 99 journeys, 184 type lines, 0 findings. merge.mjs --dry --a5cover: 0 rejected, 0 with gaps.

No entity fits:
- F-server-109, F-server-110, F-server-111: they read GitHub release files and Cloudflare's edge cache only; no entity in entities.json for a release file or a cached copy. writes/reads left empty.
- The gym invite/check-in preview caches (5 minutes per code) have no entity; E-gyms / E-gym-logos used for what they show.

Seen in passing (not sure enough for a finding):
- friend.js:74 and selfJoin.js:108 (and feedback.js:100): the network-address code includes the UTC date, while the count looks back 24 hours. The "5 a day" (friend) / "10 a day" (self-join) / "20 a day" (feedback) limits really restart at 05:30 India time, not 24 hours after the first send.
- friend.js:79 / selfJoin.js:113: a send is counted before the gym server is asked, so a failed send ("Could not send. Check your internet and try again.") still uses up one of the 5 a day.
- friend.html:127: the TOO_MANY words say "Too many requests from this link today", but the same answer comes from the per-network-address limit (shared gym Wi-Fi), not only the per-link limit.
- join.html:118: "You pay at the gym desk." is fixed text on the gym invite page's "Not a member yet?" card; true today (JOIN_PAY off, wrangler.jsonc:92) but will be wrong once online join payment is switched on (selfJoinDesc already drops that line, worker.js:302).
- whatsNewFeed.js:8: asks GitHub's API with no token (60 calls an hour per address); the second door covers it.
- worker.js:388 /app/apk assumes every newest release carries mettleup-<tag>.apk; a release without one would send phones to a missing file (not checked which releases carry an APK).

Could not check:
- The app-side words (member app join step, check-in screen, update screen, feedback thank-you) are other features; not read.
- join.html / join-online.html words for "gym not found", TRIAL_USED and the success screen: not read (size limit kept for the server code).
- Live behaviour (no live calls made; read-only audit).
