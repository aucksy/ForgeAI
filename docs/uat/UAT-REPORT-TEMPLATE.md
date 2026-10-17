# UAT report — <tag> (<date>)

## Verdict: GO / GO WITH CONDITIONS / NO-GO
One line why.

## Proof (links)
| Gate | Result | Run |
|---|---|---|
| CI (unit + SQL + admin journeys) | | |
| Whole phone run, default phone | | |
| Whole phone run, your phone (360 dp, font 1.3, IST) + random taps | | |
| Cross-role journeys (both apps + live server) | | |
| Phone conditions (offline, kill, upgrade, Doze) — advisory | | |
| Server tests on the LIVE database | | |

## Coverage (from `python coverage.py --md`, never typed)
<paste>

## Open problems
| Id | Sev | What you would see | Workaround | Fix by |
|---|---|---|---|---|

## Not tested this release
- ...

## Your checks (OWNER-CHECKS.md) — tick or write what went wrong
- [ ] ...

## If something goes wrong after release
Phone: install the previous APK link (same key; data stays). Admin app: redeploy the previous
version (Cloudflare keeps versions). Database: changes are additive; a bad rule is replaced by a
new migration, never by deleting data.

Signed: ______ (owner)  Date: ______
