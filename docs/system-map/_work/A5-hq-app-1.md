# A5-hq-app-1 checkpoint

F-hq-103: 6 journeys, 7 type lines
F-hq-104: 6 journeys, 7 type lines
F-hq-105: 5 journeys, 7 type lines
F-hq-106: 5 journeys, 7 type lines
F-hq-107: 5 journeys, 7 type lines
F-hq-108: 6 journeys, 7 type lines
F-hq-111: 4 journeys, 8 type lines
F-hq-112: 5 journeys, 7 type lines
F-hq-113: 5 journeys, 7 type lines

All 9 done. Output: docs/system-map/_work/out/A5-hq-app-1.jsonl (113 rows: 47 journeys, 64 type lines, 2 findings). merge --dry: 0 rejected, 0 with gaps.

Entities with no fitting id: the read log's failure reason / key end date live in E-db-read-log-state (used); no entity for the CSV file itself (a download, not stored); no entity for HQ's in-memory list search state.

Seen in passing (not findings):
- POST /api/gym/create returns a new owner sign-in code without the 15-minute fresh sign-in check, while the comment just below it (deploy/hq/api.js:523) says a new owner code needs one. Low risk (a brand-new gym holds no data), but worth a decision.
- "Gyms with branches" card counts every branch, test gyms included, even while "Show test and demo gyms" is off (apps/hq/public/app.js:224-238 uses data.gyms, not the filtered list).
- Pause reason: the box does not say it is required; the database refuses an empty one (NEED_REASON), so the user learns only after clicking.

Could not check: whether a second reset code cancels the first (needs the database function body; not read); real clicks (analysis only).
