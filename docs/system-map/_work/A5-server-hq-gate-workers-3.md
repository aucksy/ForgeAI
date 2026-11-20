# A5-server-hq-gate-workers-3 checkpoint

F-server-222: 5 journeys, 7 type lines
F-server-224: 4 journeys, 8 type lines
F-server-217: 10 journeys, 14 type lines
F-server-227: 8 journeys, 16 type lines
F-server-231: 11 journeys, 25 type lines
F-server-201: 4 journeys, 8 type lines
F-server-200: 5 journeys, 7 type lines
F-server-228: 5 journeys, 7 type lines

All 8 done. Rows: _work/out/A5-server-hq-gate-workers-3.jsonl (146 rows: 52 journeys, 92 type lines, 2 findings).
Generator (scratch): _work/A5-server-hq-gate-workers-3/gen.mjs. Dry merge with --a5cover: 0 rejected, 0 with gaps.

No entity fits (left out): D1 pay_requests (fee requests), the KV backup copies and status, the HQ sign-in session cookie, the HQ install files.

Seen in passing (not findings):
- Support access records: the HQ page asks only the first page (shows "200+"); the server takes an offset, but there is no next-page button (apps/hq/public/app.js:679-680).
- Fee request feed reads at most 100 open requests over 15 minutes across ALL gyms, oldest first (deploy/hq/payFeed.js:59-63); past 100 in about a minute, later ones can age out unsent.
- Nightly: if the gym-server clean-up fails, the QA-gym purge and the 400-day AI request purge are skipped that night (deploy/hq/worker.js:195-218); the next good night catches up.
- AI limit and assistant limit: the HQ log line is written before the save, so a failed save still reads as done in the log (deploy/hq/api.js:629-636, 642-644).
- Google-mode sign-out only clears the cookie; it is not written to HQ's log (sign-in is) (deploy/hq/worker.js:157-160).
- Credits note: the page allows 300 letters, the server 500; the API comment says the note is required, the page lets it be empty.

Could not check: the desk's exact 'please pay' button words (panel pay sheet not opened); the error words for BAD_REQUEST / FRESH (errorWords not opened); whether grant credits expire at month end.
