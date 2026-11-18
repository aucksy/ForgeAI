  Needs a watch release to reach his watch.
- **The rule table (WearWire.watchesSeen; a watch has the app when ANY signal says so, "no app" needs every
  signal that answered to say no; a failed step is never a "no"):**
  | signal | "has the app" | "connected now" |
  |---|---|---|
  | NodeClient.connectedNodes | - | yes |
  | capability forgeai_watch_app, FILTER_REACHABLE | yes | yes |
  | the same, FILTER_ALL | yes, for a connected watch | - |
  | its /forge/watch-version item (0.77.0 on) | yes, with the version | - |
  | its /forge/diag item (every watch app since 5 Nov, 0.76.0 included) | yes | - |
  | the ping: /forge/watch-version-ask to every connected watch without a version item; the item appears (0.77.0+) | yes | yes |
  A watch NOT connected counts only with a diary under 7 days old (a watch he no longer owns would otherwise ask
  for ever); FILTER_ALL or a version item alone never brings in an unconnected watch. The phone's own node never
  counts. ok:false only when connectedNodes AND the reachable capability both failed and nothing was found.
  Each step is tried 3 times at most (0.5 s, 1.5 s backoff) inside a 4.5 s budget, then the ask + 2.5 s reread,
  inside the old 8 s cap. The same rules now feed "Update on watch" and F67 "Install on watch", so the Play
  Store also opens on a watch whose capability is missing. probeWatch (the rest-alert bridging) is unchanged.
- **The answer's why:** "nodes=1 capR=0 capA=0 ver=0 diag=1 asked=1 got=0" (counts; fail:<status code>; ? = no
  answer; late; timeout; paused). No node id, no watch name. The watch log head now ALWAYS says "Watch app:
  0.77.0 (read: ...)", "older than 0.77.0 (not connected) (read: ...)" or "not found (why: ...)", and "Pop-up:
  <time> <state>, <reason>" (shown / waits: phone update first / waits: workout open / waits: another pop-up /
  hidden: Later (24 hours) / hidden: Update on watch tapped for this version / waits: not on the main tabs),
  also in the console as "[watch update] ...".
- **The pop-up itself:** an 'unknown' or 'none' read is tried again after 20 s and 2 min (before: one bad read
  hid it for 6 hours). It waits while another pop-up (a question sheet, the free month's notice) is up. The
  "What's new" after a phone update is NOT a pop-up here: it is the Workout tab's "New in this version" card,
  which stays until he closes it; waiting for it could hide the watch pop-up for a whole version, so it does not.
  The phone's own update screen (UpdatePrompt) already held it (phonePopup).
- **Tests:** WearWireTest (his exact case: capability empty, diary from node X, no version item -> hasApp true,
  version null, pinged; each signal alone; a failed step is not a no; fresh-diary rule; own node; order),
  watchUpdate / watchDiag / watchUpdateCard tests (parse, the head line, the decision and its reasons).
  Cloud runs: CI 43720782230 green; device QA 43720843604 green (u438 + u336 + u401, owner profile: the offer, no
  pop-up when up to date, the not-connected step, the phone update screen, the What's new card); wear unit tests
  passed inside 43720782161 (cancelled by a later push); wear 43724579949 failed on the new capability check (the
  proof above); wear 43726710831 (after the watch fix, fa963d98): the capability check PASSES, build + both large-watch UATs
  green; the small-watch "largest text" step failed because emulator system screens (tray setup, charging) were
  in front, same failure on 43726347844 before this change; re-run of that job started, result not read yet.
  CI on fa963d98 (43726701725) red only on other helpers' rep-hint tests (R-576), already red on the 3 commits
  before it. LEFT: read the 43726710831 re-run; follow-up: probeWatch (rest-alert bridging) is still
  capability-only; the watch fix reaches his watch only with a watch release (none done).
- **Only his real watch can confirm** the pop-up shows, and his next "Add my watch's screen log" says which signal
  found it (no cloud phone can pair a real watch).

