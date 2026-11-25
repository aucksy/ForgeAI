# Calibration result, round 1 (plan steps C4-C6), 25 Nov 2026

Question: given only the old code (the commit before each fix) and the 10 gap hunts, did a fresh helper re-find
the bugs he already found? Helper rows: `_work/out/CAL-1.jsonl` .. `CAL-5.jsonl`. Scored by the coordinator
against each fix commit's real change.

**Score: 3 found (2 of them only because the hunt text names that kind), 1 partly, 11 missed, of 15.**
The two phone/watch-only bugs both failed: neither helper flagged their code path as needing a real-phone check.

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

## Gap in the seed list

Seeds came only from the 15-25 Nov notes. A quick count of the older notes (git `b29da208^` for 5-14 Nov, the
archive for 26 Oct-4 Nov) finds about 35 more bugs he reported (about 20 in 5-14 Nov, about 15 in 26 Oct-4 Nov).
It matters: that is more than twice the scored seeds, and many are kinds this round missed (suggested weights,
pop-ups that never arrive, layout overlap). No seeds were added in this step.
