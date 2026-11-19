# A5-panel-ui-shell-1 checkpoint (2026-11-20)

Status: all 10 features done. Output: docs/system-map/_work/out/A5-panel-ui-shell-1.jsonl (291 rows: 120 journeys, 170 type lines, 1 finding).

F-panel-500: 18 journeys, 21 type lines
F-panel-505: 12 journeys, 14 type lines
F-panel-511: 10 journeys, 14 type lines
F-panel-509: 10 journeys, 15 type lines
F-panel-508: 12 journeys, 14 type lines
F-panel-501: 15 journeys, 24 type lines
F-panel-503: 11 journeys, 14 type lines
F-panel-506: 12 journeys, 24 type lines
F-panel-521: 8 journeys, 16 type lines
F-panel-512: 12 journeys, 14 type lines

## Notes on roles and entities
- "trainer": the code has two roles only (owner, staff; auth/permissions.ts:84-90). A trainer is a front-desk login with the Trainer tick, so trainer journeys are the staff ones plus the Training progress rows.
- Members, plans, memberships, receipts and check-ins all sit in E-crm-records (no finer entity exists).
- No entity fits the per-device choices (theme, language, install banner closed, new-feature seen marks, "Your numbers" days): they live in the browser's own storage. Left out of writes/reads.
- No promise found for: the workout code check (F-panel-521), sell / freeze / cancel rules (F-panel-512; the staff-rights words are in code at auth/permissions.ts:174 but not in promises.json under the words searched), the "Your gym is ready" sheet (F-panel-503).

## Finding
- FN-A5-panel-ui-shell-1-01 (S2, his call): the front desk can freeze a plan by approving a member's pause request, though freezing is owner-only everywhere else.

## Seen in passing (not sure, not written as findings)
- What's new page (ui/WhatsNew.tsx:351-365) shows every news line to the front desk too, including lines written to the owner ("your credits", "sign in as the owner"); only the links are filtered by role.
- MemberCardSheet, WorkoutCodeCheckSheet, InstallCard and the three membership sheets write their words straight in English (no t(...) call in those files). Could not tell from these files whether the shared Sheet/Button/TextField parts translate them; if not, they stay English in Hinglish mode.
- MemberCardSheet "Download picture" (ui/MemberCardSheet.tsx:277-380) draws the member photo and logo onto a canvas and then calls toDataURL; if those pictures come from another address without cross-origin permission the browser refuses and the person only sees "Could not make the picture. Try Print." loadImage was not read.
- MemberCardSheet "Download picture" has no busy state: two fast taps make two files (harmless).
- PlanRequestsCard approve is two saves (plan first, then the request). If the second fails the row stays waiting; the retry relies on alreadyDone (logic/planRequests.ts:138) to not add the days twice. Not driven.

## Could not check
- Anything driven on a screen: this step was code-read only (no dev server on the laptop).
- The new-gym form and sign-in form behind Welcome (not in this feature's entry files); "unknown" in J-F-panel-503-01 step 2.
- The refusal words for a wrong workout code (in the claim checker, not read); "unknown" in the F-panel-521 type 3 journeys.
- What an address that matches no page shows (the page switch in CrmApp.tsx was not read).
- PLAN_GATE_ON on (F-panel-509, F-panel-521 are Pro): the switch is off today, so the locked state has no journey.
- The exact refusal words for the desk's 10% discount limit and 31-days-back date limit (in validateSale, not read).
- Whether "Your gym is ready" can return after "Done" (its caller was not read).
- Tests: no test file was opened; every journey has coverage "unknown".
