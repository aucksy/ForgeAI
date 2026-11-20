# A5-server-ci-workflows-1 checkpoint

F-server-602: 4 journeys, 8 type lines
F-server-603: 4 journeys, 8 type lines
F-server-604: 5 journeys, 7 type lines
F-server-605: 5 journeys, 8 type lines
F-server-610: 4 journeys, 8 type lines
F-server-611: 7 journeys, 17 type lines
F-server-612: 5 journeys, 7 type lines
F-server-613: 10 journeys, 15 type lines

All 8 items done. 124 rows (44 journeys, 78 type lines, 2 findings); merge --dry: 124 passed, 0 rejected.

Entities: CI, release and Play runs touch no stored entity (entities.json has no row for builds, releases, Play tracks
or clips), so most journeys list none. Razorpay check writes pay rows only in an in-memory copy (E-pay-requests,
E-pay-connections listed). Conditions run makes its own gym on the real server (E-gyms, E-shop-orders).

Could not check:
- scripts/ci/phone_gate.py words (F-server-613 system type 3): not read, written as unknown.
- No CI run ids opened; every journey is code-read, coverage unknown.

Seen in passing (not findings):
- Device QA, the release gate, tests a build with qaStandIns added to app.json (made-up answers, stand-in store);
  the store build never carries them, so the gate never tests the exact store app.json (qa-device.yml:153-162).
- qa-device.yml:17: a workflow_call run is recorded under the caller's name; the gate looks runs up by name.
- ci.yml job database and exercise-clips use ubuntu-latest, while job check was pinned to 24.04 after latest broke Playwright.
- exercise-clips.yml and qa-device.yml put hand-typed inputs straight into shell lines (keys, version, env);
  only people with write access can start them.
- exercise-clips publish runs after some render jobs fail (!cancelled()), publishing a partial set (the run itself is red).
- play-upload.yml header (lines 3-9) still says internal + closed only; the step now also sends to open testing (beta).
