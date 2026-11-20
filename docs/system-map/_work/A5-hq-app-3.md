# A5-hq-app-3 checkpoint

F-hq-101: 5 journeys, 7 type lines
F-hq-125: 6 journeys, 7 type lines
F-hq-126: 6 journeys, 7 type lines
F-hq-127: 5 journeys, 8 type lines
F-hq-131: 5 journeys, 7 type lines
F-hq-132: 4 journeys, 8 type lines
F-hq-100: 6 journeys, 7 type lines
F-hq-133: 6 journeys, 7 type lines

Done: all 8 features, 8 feature x role pairs (HQ admin). Output: _work/out/A5-hq-app-3.jsonl (43 journeys, 58 type lines, 1 finding). merge --dry --a5cover: 0 rejected, 0 with gaps (6 warnings: F-hq-133 install, More sheet and offline page touch no stored data, true).

Entities: none exists for the HQ sign-in session (F-hq-100) or the service worker's offline store (F-hq-133); those journeys list E-gyms / none.

Seen in passing (not findings):
- After "Delete the gym for ever" succeeds, the page is not reloaded: the request card keeps its delete button and stays under Open until a reload.
- Delete requests: "Asked on" takes a future date with no check; days left then shows more than 30.
- Delete requests that are open and near their 30-day end are not a Needs you line at all; only new admin app messages reach it (as feedback, not counted in the red number).
- Log on a phone: the When cell has no label in the stacked table.
- Pay details: the page allows 120 letters for the UPI ID, the server keeps 300; no format check on IFSC or account number on the page.
- Install: declining Android's install question hides the Install app button until the browser offers again.

Could not check: words the database returns for a bad pay-details save or a bad delete step (inside database functions, not read); what hq_delete_gym does to the request row (assumed closed as done). No tests opened; every coverage "unknown".
