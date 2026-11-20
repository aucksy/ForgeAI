# A5-server-ci-workflows-2 checkpoint

F-server-614: 4 journeys, 8 type lines
F-server-615: 8 journeys, 16 type lines
F-server-616: 5 journeys, 7 type lines
F-server-619: 4 journeys, 8 type lines
F-server-600: 9 journeys, 15 type lines
F-server-620: 7 journeys, 17 type lines
F-server-621: 5 journeys, 7 type lines
F-server-601: 5 journeys, 7 type lines

Seen in passing:
- watch-video.yml:15 and :41 default tag v0.71.0 while app.json says 0.79.0: a run with defaults records an old watch app for the Play form.
- scripts/watch/outage.mjs:181 the issue body says 'not answering' even when only the read log is down (title says 'not working').
- whatsapp-probe.yml:51,60 a Meta refusal leaves the step green (curl without --fail); the owner must read the JSON.
- qa-journeys.yml:20 workflow_call trigger: no workflow calls it.
- apps/mobile/qa/run-journeys.sh:26 every run leaves two test gyms on the live server.

Entities: CI runs mostly store no app entity; journeys with none leave writes/reads empty.
Could not check: whether outage emails really reach the owner (needs his inbox); last run results (no CI run read).
Rows: 133
