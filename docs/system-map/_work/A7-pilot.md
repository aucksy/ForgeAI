# A7-pilot checkpoint

Source group: legal pages, part 1 of 3. Candidates: lines 1 to 120 of docs/system-map/_sources/promises.txt.
Output: docs/system-map/_work/out/A7-pilot.jsonl (90 rows, P-A7-pilot-01 to P-A7-pilot-90).

## Finished units
- unit 1 DONE: apps/dashboard/public/data-agreement.html (candidates 1-44) -> rows 01-32, 12 not a promise
- unit 2 DONE: apps/dashboard/public/delete-account.html (candidates 45-64) -> rows 33-44, 8 not a promise
- unit 3 DONE: apps/dashboard/public/delivery.html (candidates 65-76) -> rows 45-54, 2 not a promise
- unit 4 DONE: apps/dashboard/public/privacy.html (candidates 77-120) -> rows 55-90, 8 not a promise
- ALL 120 candidates handled: 90 rows + 30 not a promise. Nothing left.

## Not a promise
- not a promise: apps/dashboard/public/data-agreement.html:15, names the two parties ("we", "you"); a definition
- not a promise: apps/dashboard/public/data-agreement.html:20, a heading ("What we do with them")
- not a promise: apps/dashboard/public/data-agreement.html:43, a duty of the gym ("Keep only what you need..."), not something MettleUp does
- not a promise: apps/dashboard/public/data-agreement.html:45, a duty of the gym ("Add only people who need access...")
- not a promise: apps/dashboard/public/data-agreement.html:46, a duty of the gym ("Use members' details only for your gym's work.")
- not a promise: apps/dashboard/public/data-agreement.html:46, a duty of the gym ("Take a member's photo only with their agreement.")
- not a promise: apps/dashboard/public/data-agreement.html:47, a duty of the gym ("Only import a member list you are allowed to use.")
- not a promise: apps/dashboard/public/data-agreement.html:57, a heading ("Deleting your gym")
- not a promise: apps/dashboard/public/data-agreement.html:78, change note ("What changed: we rewrote the agreement...")
- not a promise: apps/dashboard/public/data-agreement.html:78, change note ("Corrected: staff sign in..."); the promises it repeats have rows 09 and 28
- not a promise: apps/dashboard/public/data-agreement.html:82, text the GYM copies and gives to its members ("We use them only to run your membership."); "we" is the gym
- not a promise: apps/dashboard/public/data-agreement.html:82, same copy-and-paste notice ("We must keep payment records as the law requires."); "we" is the gym
- not a promise: apps/dashboard/public/delete-account.html:7, the page title
- not a promise: apps/dashboard/public/delete-account.html:8, the page's search description
- not a promise: apps/dashboard/public/delete-account.html:16, a heading
- not a promise: apps/dashboard/public/delete-account.html:17, intro saying what the page is for
- not a promise: apps/dashboard/public/delete-account.html:20, a heading ("Delete it in the app")
- not a promise: apps/dashboard/public/delete-account.html:29, an instruction to the reader ("Email contact@mettleup.fit..."); the promise after it has row 38
- not a promise: apps/dashboard/public/delete-account.html:31, a heading ("What we delete")
- not a promise: apps/dashboard/public/delete-account.html:49, change note ("What changed: backup copies are removed within 7 days..."); the promise has row 41
- not a promise: apps/dashboard/public/delivery.html:24, a pointer to another page ("See refunds and cancellation, section 6.")
- not a promise: apps/dashboard/public/delivery.html:26, a pointer to another page
- not a promise: apps/dashboard/public/privacy.html:29, contents list entry ("Who we are")
- not a promise: apps/dashboard/public/privacy.html:32, contents list entry
- not a promise: apps/dashboard/public/privacy.html:34, contents list entry
- not a promise: apps/dashboard/public/privacy.html:35, contents list entry
- not a promise: apps/dashboard/public/privacy.html:38, contents list entry
- not a promise: apps/dashboard/public/privacy.html:44, a heading
- not a promise: apps/dashboard/public/privacy.html:45, a definition ('"we" means MettleUp')
- not a promise: apps/dashboard/public/privacy.html:59, a heading

## Status counts
kept 11, partly 20, GAP 3, unknown 56. (Counted by script; all 90 rows parse, every "where" and text matches its candidate line.)

## Could not check (read limit of 1,500 lines reached at about 1,250; the rest was kept for writing)
- Test files were not opened, so no row is "kept" on the strength of a test. Rows marked kept rest on code lines read.
- Rows whose only evidence is a design comment are "unknown", with the comment's line in proof.
- Live database state not checked (no database reads in this step): matters most for row 15 (migration 0097 says NOT APPLIED LIVE).
- Process promises done by hand (leak notice in 24 hours, 72-hour report, answers in 30 days, 7-day export, 30 days' notice): no written process in the files this step may open. docs/launch/GYM-DELETE.md is named in code but was not opened.
- Not opened for lack of budget: supabase/tests/security.sql, deploy/panel/payProviders.js bodies, apps/mobile/src/cloud/pack.ts body, the Pay MettleUp screen, the Health Connect code, the "Ask an AI" and "Tell my gym" code.
