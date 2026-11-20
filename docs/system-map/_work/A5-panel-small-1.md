# A5-panel-small-1 checkpoint

F-panel-107: 6 journeys, 7 type lines
F-panel-103: 6 journeys, 7 type lines
F-panel-104: 6 journeys, 7 type lines
F-panel-105: 3 journeys, 9 type lines
F-panel-106: 9 journeys, 15 type lines
F-panel-3101: 4 journeys, 8 type lines
F-panel-125: 7 journeys, 17 type lines

All 7 features (9 feature x role pairs) done. 111 rows of journeys and type lines + 3 findings = 114 rows in _work/out/A5-panel-small-1.jsonl.

## Entities with no id
- The per-branch keys this device keeps in browser storage (forgeai.branchKeys.v1, branches/logic.ts:75) have no entity; left out.
- The visitor check-in is written into the member's own branch records; E-crm-records used (no separate visit entity found).

## Seen in passing (not sure enough for a finding)
- Visitor with no plan running today: the line says "Ask them to renew at the desk." but the "Check in" button still shows (VisitorsCard.tsx:123 checks allowed and alreadyIn only, not planOk); the server answer carries planOk, so it may be meant. Check what the server does.
- Visitors list load failure is silent: the list just stays empty (VisitorsCard.tsx:39-41).
- "Undo" on a visitor removes the check-in at once, with no confirm, including app check-ins.
- Undo sends the panel's `today`; if the page stays open past midnight IST the day sent may not be the check-in day (VisitorsCard.tsx:86).
- Business name field is reset from the server name each time the branch list reloads, so half-typed text can vanish (BranchesCard.tsx:41).
- A failed rename shows its words in a toast with no timeout set (BranchesCard.tsx:93).
- The All branches, Branches card and Visitors card words are fixed English (not through the language helper); Payments uses it.
- Totals on All branches still show when one branch failed; the banner says so (by design).

## Could not check
- Server side of owner_add_branch, owner_open_branch, branch_check_in_visitor, branch_undo_visitor (only the panel code was read): whether the server refuses a desk person, checks planOk, or limits name length.
- Whether members ever see the business (group) name.
- Whether staff can reach Settings → Payments (route has no role gate in CrmApp.tsx:479; the card hides only the button).
