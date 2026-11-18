# A2-hq-app checkpoint

Output: docs/system-map/_work/out/A2-hq-app.jsonl (34 rows, F-hq-100 to F-hq-133)

## Finished units
- [x] 1. Source list read (141 lines)
- [x] 2. Code opened: app.js lines 100-1317, index.html, pwa.js, sw.js, offline.html; logic.js export list only (934 lines, not read whole); style.css and offline.css not read (styling only)
- [x] 3. Switches and plan gates noted (below)
- [x] 4. Items grouped into features
- [x] 5. Feature rows written (33)
- [x] 6. Not-a-feature rows written (1: F-hq-121 placeholder cards)
- [x] Coverage self-check: all 141 source ids appear in "sources"; every entry path:line exists

## Switches / gates met (all are server readiness flags or per-gym settings; no "Pro only" gate inside HQ)
- plansReady (database update 0030): trial tiles, column, filters, sort, and the Free trial and plan card. app.js:270, 406
- aiCredits missing -> AI_NOT_READY (0071). app.js:593
- assistAllowance missing -> web database update 0015. app.js:647
- englishState.keyOn (Gemini key on the HQ server). app.js:833
- MSG_NOT_READY (Messages page). app.js:1072
- PAY_NOT_READY (Payments page, 0060). app.js:1128
- CHECKS_NOT_READY (Online payments to check card, 0064). app.js:1159
- per-gym: AI reads-a-day limit (0 = off) app.js:523; AI Assistant daily limit (0 = off) app.js:660; web page pageOn + all-gym pagesLive app.js:624-627; support access open (supportUntil) app.js:673
- Browser notification permission for alerts. app.js:924

## Seen in passing (not checked further; server side is outside this area)
- app.js:1051: "Delete the gym for ever" shows even when the "called" and "reminded" steps are not ticked; the page does not hold it back. Whether the server refuses is unknown.
- app.js:1049: "Done: the member is erased" can be pressed before the "called" step. Same question for the server.
- app.js:958: "When HQ is closed, no alert comes to your phone yet." Alerts work only while a tab is open.
- app.js:734-736: two System cards are placeholders ("Not connected yet").
- app.js:570: sign-in history wording "kept 7 days; 1 year from 13 May 2027" reads oddly; check it against the real retention.
- app.js:612-614: empty Credits box becomes 0, and the question reads "Add 0 AI credits"; the page does not stop it.
- logic.js:384: NOT_READY_WORDS says "Trials need the database update (waiting for your yes)"; may be stale wording if 0030 is applied.

## Could not check
- Whether each readiness flag is on in production (no database or server reads in this step), so those features are marked "behind switch", not "live".
- style.css, offline.css and the body of logic.js were not read line by line (size limit; helpers and styling).
