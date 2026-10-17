# UAT report — v0.47.0 (17 Oct 2026)

## Verdict: GO WITH CONDITIONS
Every automatic gate is green on one commit (52e8f43, the app in this release); open items are minor
or need a person (your checks below, and the live database tests the PC must run).

## Proof (links)
| Gate | Result | Run |
|---|---|---|
| CI (unit + SQL + admin journeys) | Read by the release workflow on the tag commit (it refuses to build otherwise) | release-apk.yml run for v0.47.0 |
| Whole phone run, default phone | PASS (attempt 2: shard 1's part B0 died before its first step on attempt 1, so B, H3B and H3C fell over after it; one re-run, all green) | https://github.com/aucksy/ForgeAI/actions/runs/39020754722 |
| Whole phone run, your phone (360 dp, font 1.3, IST) | PASS | https://github.com/aucksy/ForgeAI/actions/runs/39020756689 |
| Cross-role journeys (both apps + live server) | PASS | https://github.com/aucksy/ForgeAI/actions/runs/39020758474 |
| Phone conditions (offline, kill, upgrade, Doze) — advisory | PASS on 9a07be2 (U-C1 below is its known, written-down gap) | https://github.com/aucksy/ForgeAI/actions/runs/39004899634 |
| Pairwise phone settings (WP14, 11 rows) | PASS, all 11 | docs/uat/ENV-MATRIX.md |
| Server tests on the LIVE database | NOT RUN from the cloud (no live database access here) | PC must do, after your yes on 0021/0022 |
| Release review (second Claude, adversarial) | No blockers; 3 minor items logged | FINDINGS U-M7, U-M8, U-G6 |

New this release: the whole phone run is split into 4 pieces on 4 phones at once (built once, the same
APK checked by fingerprint in every piece, and a final check that every part ran). About 2 h instead of
about 3 h 30 min.

## Coverage (from `python coverage.py --md`, never typed)
| Role | Tasks | Real screen | of which new | Logic only | Not covered |
|---|---|---|---|---|---|
| Member (phone) | 190 | 142 | 30 | 43 | 5 |
| Owner (admin) | 73 | 50 | 50 | 22 | 1 |
| Front desk | 32 | 17 | 17 | 15 | 0 |
| Watch | 19 | 0 | 0 | 12 | 7 |
| Cross-role | 16 | 10 | 10 | 6 | 0 |
| **Total** | **330** | **219 (66%)** | 107 | 98 | 13 |

H-risk tasks not on a real screen: 12
- M-180 [LOGIC] Leave the gym while offline (kept, sent at next start)
- M-190 [LOGIC] Gym side offline: cached shop, bag kept, seen kept, failed check-in
- F-19 [LOGIC-NEW] Change a saved receipt; post a negative or zero receipt
- F-24 [LOGIC] Sell more than 31 days back, an off-list plan, a negative price
- F-28 [LOGIC] Undo an import; stamp or strip the import mark
- W-03 [LOGIC-NEW] Get buzzed at rest end by the watch's own alarm
- W-05 [LOGIC-NEW] Exactly one buzz at rest end, never zero, never two
- W-06 [LOGIC-NEW] Tap Done / +15 s / Skip on the watch
- W-07 [LOGIC-NEW] "Complete set" from the watch, never ticked twice or lost
- W-12 [LOGIC-NEW] Phone and watch lose touch; updates are re-sent
- X-10 [LOGIC] Member leaves → their numbers are cleared → owner's "joined in the app" list updates
- X-14 [LOGIC-NEW] One gym's data never reaches another (members, owners, desk of gym B)

## Open problems
| Id | Sev | What you would see | Workaround | Fix by |
|---|---|---|---|---|
| U-G6 | S3 | Switching gyms with open orders while the new gym can't be reached: your old orders are cancelled but you stay in the old gym | Switch only with internet; re-order at the desk | next release |
| U-M7 | S4 | After an RPE tap, the ✓ "pop" can replay after you drag an exercise or reopen the workout | None needed (cosmetic) | next release |
| U-M8 | S4 | Typing into a set during the 0.35 s after an RPE tap can tick the older hint numbers | Check the set's numbers | next release |
| U-C1 | S4 | If the app updates in the middle of a rest, "Rest is over" comes on time but without "Complete set" | Open the app and tick the set | open |
| U-G3 | S1? | No isolation test yet for shop/message server functions across gyms | — | sent to the money/access helper (PC) |

## Not tested this release
- Live database tests (supabase/tests/*.sql): PC, after your yes on migrations 0021/0022.
- The watch on a real watch (W-03..W-12 are logic-tested only): your checks 1-3.
- The /inbox desktop mod in a real desktop app (not part of the phone app): built and validated only.

## Your checks (OWNER-CHECKS.md) — tick or write what went wrong
- [ ] Settings → Your gym → type RAMS01 → Next → "Join this gym": the app turns RAM'S colours
- [ ] Tap an RPE on an unticked set: you see the ✓ tick, then the rest starts
- [ ] Press and hold an exercise card by its small bar and drag it
- [ ] The new app icon on your home screen
- [ ] Watch checks 1-3 and every-release checks 4-8 in OWNER-CHECKS.md

## If something goes wrong after release
Phone: install the previous APK link (same key; data stays). Admin app: redeploy the previous
version (Cloudflare keeps versions). Database: changes are additive; a bad rule is replaced by a
new migration, never by deleting data.

Signed: ______ (owner)  Date: ______
