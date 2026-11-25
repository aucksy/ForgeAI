# Calibration result, FINAL after 3 rounds (plan steps C4-C6), 25 Nov 2026

Question: given only the old code (the commit before each fix) and the 10 gap hunts, did a fresh helper re-find
the bugs he already found? Helper rows: `_work/out/CAL-1.jsonl` .. `CAL-11.jsonl`. Scored by the coordinator
against each fix commit's real change.

**FINAL score, best of three rounds: 11 found, 2 partly, 2 missed, of 15.** 10 of the 11 were found only because
the hunt text (an example or a calibration rewrite) names that kind of bug; 1 was found unaided. Written off (no more
re-runs): 2 whole bugs and 2 halves, all to the cloud screenshot check; none to his phone. Detail: "Round 3 (final)"
and "What this means for the audit" at the end.

Earlier headline, best of rounds 1 and 2: 8 found, 1 partly, 6 missed, of 15. Only 1 of the 8 was found without the
hunt text naming that kind (7 rode on an example or a round-1 rewrite that names the kind). Both phone/watch-only
bugs now pass (their code paths were flagged for a real-phone check in round 2). Round 2 detail: see "Round 2" below.

Round 1 alone: 3 found (2 of them only because the hunt text names that kind), 1 partly, 11 missed, of 15.
The two phone/watch-only bugs both failed in round 1: neither helper flagged their code path as needing a real-phone check.

Caveat: the hunt text (`_work/cal-hunts.txt`) gives examples that name some of these bug kinds (automatic
birthday wish vs AI ideas, reach of a reminder, "done in one is done in the other"). A "found" on such a row is
generous; it is marked "found (hunt example named it)".

## Per bug

| Folder | Kind of bug (neutral) | Verdict | Matching row | Why |
|---|---|---|---|---|
| c01 | A server summary push counted alerts already handled, because "done" lived only in one browser | missed | none in c01 (FN-CAL-5-08 found the browser-only "seen" mark in another folder) | The c01 helper read the summary push code (FN-CAL-1-06 cites it) but never asked where "done" is kept; hunt 4 names "done in one is done in the other" and still missed it. |
| c02 | AI ideas suggested a task the automatic version already does | found (hunt example named it) | FN-CAL-2-08 | Exact: names the AI birthday idea not reading the automatic wish switch. Hunts 1 and 4 give this very pair as an example. |
| c02 | An automatic message silently skipped members whose app is not linked, with no record | found (hunt example named it) | FN-CAL-2-05, FN-CAL-2-06 | Both say: no record of who got it or why not; app link is a silent condition. Hunts 2 and 3 name exactly this. |
| c03 | Today kept items already handled elsewhere; a member who joined today counted as "not seen" | missed | none | No row on Today's member list keeping handled items, none on the day-0 edge of the "not seen for N days" count. |
| c03 | A card wider than a phone screen in the longer language | missed | none | No hunt looked at layout or width at all. |
| c04 | Admin alerts showed the old-brand icon; the status-bar badge drew as a white square | missed | none | The helper read the alert service worker (FN-CAL-4-04 cites it) but no hunt asks whether pictures are current or in the form the platform needs. |
| c05 | Tapping a reply notification opened nothing | missed | none | No hunt follows a tap from a notification to where it lands. |
| c06 | Gym messages silent on one phone brand (device-only) | missed | none | Pass needed: the path flagged "needs a real-phone check". The only such flag on c06 (FN-CAL-2-10) is a different path. Hunt 2 lists "phone maker rules" but gave no instruction to flag it. |
| c07 | "Your watch app has an update" never showed (device-only) | missed | none | FN-CAL-3-10 flags a watch path for a real check, but it is the rest alarm, not the update notice path. |
| c08 | "New" dots lit for everything on a first install | missed | none | Hunt 7 asks only old users vs new rules, never the reverse (what a brand-new install sees). |
| c09 | A save button looked broken (no reason shown); phone top bar crowded | missed | none | No hunt asks why a button is greyed out or does nothing; layout not covered. |
| c10 | A legal promise said every look at the data is recorded; a direct database read left no record | missed | none | Two causes: the copy did not contain the page with the promise (it sits outside the copied folders), and hunt 10 did not point at legal text or direct logins. |
| c11 | A form said the number is not kept, but the app kept it | found | FN-CAL-2-02 | Exact, with the saving lines. Hunt 10 found it without an example naming it. |
| c12 | A workout target lower than last time after a long gap, with no reason shown; the box and the rows used different maths | missed | none | No hunt compares a summary number with its own rows or asks for a reason on a drop. |
| c13 | Keyboard autofill of a mobile number (country code, spaces) was cut by a length limit, so a form failed | partly | FN-CAL-4-11 | It found that the gym page uses its own, different number rule (the right file and lines), but not the autofill failure itself. |

## Not scored

- **2 unresolved:** (1) he could not tell a feature was only on main and not live: no app-code fix, it is a
  release-state issue that the live-state step (hunt 5 output) covers, not a code copy; (2) a next-set suggestion
  that repeats last time for a bodyweight move: not fixed yet (after-audit backlog), so there is no fix commit and no
  parent to copy.
- Both device-only bugs were scored above under C6 (both missed).

## Hunt rewrites (C5)

Applied to `_work/lens-source.txt` (the source the real hunt briefs are made from, through
`_tools/lens-items.mjs` -> `lens-items.json` -> `lens-items-make.mjs` -> `mkbrief.mjs`), `lens-items.json`
regenerated (new items only; no id changed), and `_work/cal-hunts.txt` regenerated from it.

| For | Hunt | New sentence (items) |
|---|---|---|
| c01, c03 | 4 | H4.3-H4.5: for every "done", "read" or "seen" mark, find where it is kept (one browser, one phone, the server); every other place that counts or sends the same items must read that same mark. |
| c03, c12 | 9 | H9.3-H9.4: numbers worked out from dates are tested at the edges (day 0, joined today, plan starts later, no visit yet, a gap of weeks). H9.5-H9.6: a summary number must come from its own rows, and a drop from last time must show a reason. |
| c03, c09 | 10 | H10.8-H10.9: every label in every language must wrap or shrink at 320-390 px (no fixed no-wrap, no unshrinkable min-width, no crowded top bar). |
| c04 | 10 | H10.10-H10.11: every picture the code points at (icons, badges, manifest and share images) is the current brand and in the form the platform needs. |
| c05 | 10 | H10.4-H10.5: follow every notification, link and button tap to where it lands. |
| c09 | 10 | H10.6-H10.7: a button that can be greyed out or do nothing says why, next to it. |
| c10 | 10 | H10.3: include legal and privacy pages, and check every way into the data, direct database logins included. |
| c08 | 7 | H7.4-H7.5: the reverse case: what a brand-new install or member sees of "new since your last version" marks. |
| c13 | 6 | H6.4-H6.5: feed every input box what autofill or paste really puts in; check the length limit and cleaning together. |
| c06, c07 | 2 | H2.5: where reach depends on the phone or watch itself, mark the path "cannot be proven in the cloud, needs a real-phone check" and name what to look at. |

## Re-runs needed (first re-run of 2 allowed)

c01, c03, c04, c05, c06, c07, c08, c09, c10, c12, c13 (11 folders; c13 is a partly, re-run for the autofill half).
c10 must be re-copied with the public legal pages added (the data-agreement page lives in the panel's public
folder); without it no hunt can find that bug.

## Round 2 (re-run 1 of 2), 25 Nov 2026

Fresh helpers, rewritten hunts, only the round-1 misses and the partly: CAL-6 (c01, c05, c12), CAL-7 (c03, c06,
c07), CAL-8 (c04, c08, c13), CAL-9 (c09, c10; c10 now also held the panel's legal pages). Rows:
`_work/out/CAL-6.jsonl` .. `CAL-9.jsonl`. Every helper stayed under the 3,000-line read cap (about 1,800-2,000
lines each), so no miss below is caused by the cap.

| Folder | Kind of bug (neutral) | Round 1 | Round 2 | Best | Matching row | Why |
|---|---|---|---|---|---|---|
| c01 | Server summary push counted alerts already handled | missed | missed | missed | none | Rows on reach and records of automatic reminders; the summary push was not followed. The round-1 rewrite asked where a "done" mark is kept, but here no mark existed: the alerts never learned their thing was handled. |
| c03 | Today kept handled items; joined-today counted as "not seen" | missed | missed | missed | none (FN-CAL-7-08 is a different date edge: never visited, in reminders) | Same reason as c01 for the first half. The joined-today half: the hunt names that edge, but the helper never opened Today's list. |
| c03 | Card wider than a phone in the longer language | missed | missed | missed | none | See "Cannot be found by reading code" below. |
| c04 | Old-brand alert icon; badge drew as a white square | missed | found (hunt example named it) | found | FN-CAL-8-04 | Exact: full-colour picture used as the one-colour badge, from a different folder than the current app icons. |
| c05 | Tapping a reply notification opened nothing | missed | missed | missed | none | The tap handler was never opened; the helper spent its reading on rest-alert warnings. The hunt said "follow a tap" but gave no way in. |
| c06 | Gym messages silent on one phone brand (device-only) | missed | pass (C6) | found | FN-CAL-7-11 (also FN-CAL-9-05 in c10) | The gym pop-up path is flagged "cannot be proven in the cloud, needs a real-phone check" on that brand. It names battery rules, not the stripped sound, which is fine for a C6 pass. |
| c07 | Watch update notice never showed (device-only) | missed | pass (C6, generous) | found | FN-CAL-7-14 | The update decision and the watch's version report are flagged for a real-phone check. The real cause (the watch's "I have the app" signal stripped in release builds) is not named. |
| c08 | "New" dots lit for everything on a first install | missed | found (hunt example named it) | found | FN-CAL-8-06 | Exact, with the lines. |
| c09 | Save button looked broken (no reason); phone top bar crowded | missed | partly | partly | FN-CAL-9-08, FN-CAL-9-09 | Found the kind (grey buttons with no reason) in the same screen file, but not the save button greyed because nothing changed. Top bar: not found. |
| c10 | Legal promise that every look is recorded; a direct database read left no record | missed | missed | missed | none | The legal pages were in the copy this time (other promise gaps were found: FN-CAL-9-03). Nobody tested the promise against routes that skip the app's code, which leave no code to read. |
| c12 | Target lower than last time after a long gap, no reason; box and rows used different maths | missed | missed | missed | none | The helper read only screen components (rest-alert hints); the maths lives in engine, lib and store files it never opened. |
| c13 | Autofilled mobile number cut by a length limit | partly | found (hunt example named it) | found | FN-CAL-8-13 | Same bug on the phone sign-in box (16 characters cuts a spaced, bracketed number). The same fix commit removed every such limit, this box included. |

Not re-run (found in round 1): c02 (both), c11.

### Hunt rewrites for re-run 2 (C5)

Applied to `_work/lens-source.txt`; `lens-items.json` regenerated (new items only, no id changed);
`_work/cal-hunts.txt` regenerated from it in the same format.

| For | Hunt | Concrete reason the text missed it | New items |
|---|---|---|---|
| c01, c03 | 4 | H4.3-H4.5 assume a "done" mark exists somewhere; here none did, so "where is the mark kept" had no answer. | H4.6-H4.8: a list or count of items pointing at a thing to act on must drop the item when that thing is handled in its own page, in every place, server sends included. |
| c12 | 9 | H9.5-H9.6 said what to check but helpers read only screens; the numbers are made elsewhere. | H9.7-H9.9: open the files that work numbers out; find the function behind a shown number and the one behind each row; compare on a long-gap case. |
| c05 | 10 | H10.4 gave an outcome with no way in. | H10.12-H10.13: find the one tapped-notification handler, list the pages it knows, then every kind of notification posted, and check each is known. |
| c09 | 10 | "Greyed because nothing changed" reads as normal, so it was skipped next to buttons that were flagged. | H10.14: a save button greyed because nothing changed must say it is already saved. |
| c10 | 10 | H10.3 said "check every way in", but a route with no code is invisible to a code reader. | H10.15-H10.16: for an "always recorded" promise, look for a record the database itself writes; none = finding. |

### Re-run 2 needed

**c01, c03 (handled-items and joined-today half), c05, c09 (save-button half), c10, c12.** Six folders, last allowed
re-run. A seed still missed after it is written into the final report as "this audit cannot find this kind of bug".

### Cannot be found by reading code (C5)

- **c03 card width and c09 crowded top bar: this audit cannot find this kind of bug: whether a label pushes past the
  screen depends on the real text length in each language, the font and how the browser lays out nested boxes; the
  code shows only the rules, not the result.** Two rounds missed both, the second with a hunt item that named the
  exact code patterns. They go to a picture check, not a code read: every screen photographed at 320-412 px in both
  languages, light and dark, with a "nothing past the screen edge" test (the fix for c03 added exactly this). That
  check runs in the cloud, so it does not need his phone.
- No device-only seed is written off: both now pass under C6, and stay on his real-phone list as the helpers asked
  (gym pop-up sound and banner on his OPPO; watch update notice with the watch paired).

## Gap in the seed list

Seeds came only from the 15-25 Nov notes. A quick count of the older notes (git `b29da208^` for 5-14 Nov, the
archive for 26 Oct-4 Nov) finds about 35 more bugs he reported (about 20 in 5-14 Nov, about 15 in 26 Oct-4 Nov).
It matters: that is more than twice the scored seeds, and many are kinds this round missed (suggested weights,
pop-ups that never arrive, layout overlap). No seeds were added in this step.

## Round 3 (re-run 2 of 2, the last), 25 Nov 2026

Fresh helpers, round-2 rewrites: CAL-10 (c01, c03, c05), CAL-11 (c09, c10, c12). Rows: `_work/out/CAL-10.jsonl`,
`CAL-11.jsonl`. Both stayed under the read cap (about 1,750 and 2,000 lines).

| Folder | Kind of bug (neutral) | R1 | R2 | R3 | Best | Matching row | Why |
|---|---|---|---|---|---|---|---|
| c01 | Server summary push counted alerts already handled | missed | missed | found (hunt example named it) | found | FN-CAL-10-05 | Exact: "handled" is worked out only in the browser; the server's summary counts every alert not yet pushed. H4.6-H4.8 named this case. |
| c03 | Today kept handled items; joined-today counted as "not seen" | missed | missed | partly | partly | FN-CAL-10-13 | Joined-today half exact (the "not seen for 10+ days" count takes a plan with no visit, even one started today); H9.3 names that edge. Handled-items half still missed: the helper never opened Today's member-updates list (its rows on "done" marks are about the WhatsApp list and the AI ideas). |
| c05 | Tapping a reply notification opened nothing | missed | missed | found, other folder (hunt example named it) | found | FN-CAL-11-11 | Exact bug, file and lines, but found by the c12 helper: c12's copy is 35 minutes older than the fix and holds the same tap handler. The c05 helper itself missed it again. Generous; counted found. |
| c09 | Save button looked broken (no reason); phone top bar crowded | missed | partly | partly | partly | FN-CAL-11-03 | Save half exact (the timings page's grey Save with no words; H10.14 named it). Top-bar half written off (layout, below). |
| c10 | Legal promise that every look is recorded; a direct database read left no record | missed | missed | found (hunt example named it) | found | FN-CAL-11-05 | Exact: searched every migration for a database-level record, none. H10.15-H10.16 named it. |
| c12 | Target lower than last time after a long gap, no reason; box and rows used different maths | missed | missed | missed | missed | none | Third miss. H9.7-H9.9 sent the hunt to the number files, but this helper's c12 reading went to the open-workout restore, the tap handler and rest alerts; no row on the target maths. |

### Final per bug (best of three)

found 11: c01, c02 (both), c04, c05, c06, c07, c08, c10, c11, c13. partly 2: c03 (handled-items/joined-today),
c09. missed 2: c03 card width, c12. Found unaided by the hunt text: c11 only.

### Written off: "this audit cannot find this kind of bug"

- **c03 card wider than the phone (missed) and c09 crowded top bar (half): this audit cannot find this kind of bug:**
  whether a label pushes past the screen depends on the real text length per language, the font and the browser's
  layout; code shows only the rules. Goes to the **cloud screenshot check** (every screen at 320-412 px, both
  languages, light and dark, "nothing past the screen edge").
- **c12 target lower than last time with no reason, box and rows on different maths (missed): this audit cannot
  find this kind of bug:** the wrong number shows only for one member history (a long gap) and comes out of
  several functions in different files; a reader with a fixed reading budget picks other files three times out of
  three. Goes to the **cloud screenshot check**: the phone app run in the cloud emulator on a seeded history with
  a 4-week gap, photographing the target box next to its rows, with a test that the box equals the rows and a drop
  shows its reason.
- **c03 Today keeping handled items (half): this audit cannot find this kind of bug:** the fault is a missing link
  (nothing tells a list line its thing was handled), so there is no wrong line to read, only an absent one, and the
  helper has to choose to open that one screen. The sibling bug in the server push was found, so the hunt can see
  the kind when it reads the right file. Goes to the **cloud screenshot check** as a journey: handle a message,
  answer a question, settle a request, then photograph Today and check each line is gone.
- Real phone: nothing new written off. The two device-only bugs (gym pop-up sound on his OPPO; watch update notice
  with the watch paired) passed under C6 and stay on his real-phone list.

### What this means for the audit

The hunts now catch most kinds of bug he has already reported, but mostly because the calibration taught them
those exact kinds: of 11 found, only 1 was found by a hunt that had not been told about that kind. Expect the real
hunts to be good at the kinds now written into them (things marked "done" in one place but not another, reminders
nobody can see reached a member, grey buttons with no reason, notification taps, promises in the legal pages,
autofilled numbers, "new" dots on a first install) and weak at kinds nobody has described yet. They still miss
three kinds: things that do not fit on a phone screen, a wrong number that appears only for one member's history,
and a list that never learns its item was dealt with elsewhere. Those go to cloud screenshot runs, not code
reading. Phone- and watch-only problems are flagged for his real-phone checks, not proven. Finally, the test used
only the 15 bugs he reported on 15-25 Nov; about 35 older reports (26 Oct-14 Nov) were never used, so this score
says little about kinds that appear only there.

### Hunt briefs re-made for today's code (C5 follow-through)

Every todo hunt item (B-run, B-truth, B-alerts, B-switch, B-time, B-words, H5: 315 items) had its items file,
brief and add file re-made from the current `lens-items.json`, keeping its id and lens groups (the maker's own
split would have renamed items, so a remake script used the existing rows). 222 todo rows in `work-items.jsonl`
gained the new hunt item ids (1,184 ids: H2.5, H4.3-H4.8, H6.4-H6.5, H7.4-H7.5, H9.3-H9.9, H10.3-H10.16); no done
row was touched. 172 of the 315 briefs are now over the 1,200-word limit (most 1,230-1,330; B-words 10+hunt 10
at 1,409-1,428). The calibration copies in `_work/calib/` were deleted (plan C2).
