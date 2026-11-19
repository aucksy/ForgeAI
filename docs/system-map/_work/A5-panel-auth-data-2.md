# A5-panel-auth-data-2 checkpoint

F-panel-1012: 7 journeys, 8 type lines
F-panel-1005: 18 journeys, 21 type lines
F-panel-1000: 17 journeys, 21 type lines
F-panel-1001: 11 journeys, 14 type lines
F-panel-1016: 6 journeys, 7 type lines
F-panel-1002: 20 journeys, 21 type lines
F-panel-1014: 18 journeys, 21 type lines
F-panel-1009: 5 journeys, 7 type lines
F-panel-1017: 6 journeys, 7 type lines

All 9 features done. 2 findings written (FN-A5-panel-auth-data-2-01, -02).

## Entities with no fitting id
- The job name kept on this browser (browser storage, one list per gym): no entity id; journeys point at E-gym-staff only.
- The remembered "ask for a PIN" mark and the signed-in gym kept on the device: no entity id; left out.

## Seen in passing (not sure, no finding row)
- Terms card: the panel opens after 4 seconds if the terms answer is slow; when the answer then says the terms are needed, the card replaces the whole panel and whatever was being typed is dropped (apps/dashboard/src/crm/auth/TermsGate.tsx:89-124).
- Signed-out reason: the removed words replace the signed-out words only after a second server answer, so a removed person first sees "ask the gym owner for a new code"; with no internet at that moment they keep those words. The reason lives only in the page, so a refresh drops it (apps/dashboard/src/crm/auth/AuthProvider.tsx:151-165).
- The "You" card shows "Staff" for a trainer and for a person with a typed job; the list shows "Trainer" or the job (apps/dashboard/src/crm/auth/PeopleScreen.tsx:273 against :328-344).
- A typed job of "Owner" gives a front desk person a pill that reads Owner, in the muted colour (apps/dashboard/src/crm/logic/staffJobs.ts:69-74).
- Staff & sign-in, the Remove and PIN sheets, the terms card and the MettleUp access card are written in English only, while the sign-in and set-up forms are translated.
- MettleUp access card: the open or closed state is read only when the card loads; a window that runs out while the card is on screen still shows "Close it now" (apps/dashboard/src/crm/ui/ForgeAccessCard.tsx:69-71, :102-105).
- A closed support window that crosses midnight prints one day and two times (apps/dashboard/src/crm/auth/hqAccess.ts:130-134).

## Could not check
- Server side of every call (remove, PIN rules and the 15-minute window, sign-in locks, terms, support window): not in this brief; taken from the panel code and its own notes.
- Whether an owner can make a second gym on the same mobile number: the server decides; journey J-F-panel-1001-08 says to check.
- The forgot-PIN form was read by word search only, not line by line (code line limit).
- Tests: none opened; every journey has coverage "unknown".
- "trainer" is not a sign-in role in the panel code (roles are owner and staff; Trainer is a tick on a staff person): trainer journeys follow the staff path.

Rows: 237 (journeys 108, type lines 127, findings 2). Pairs: 18.
Journeys per type: type 1: 18, type 2: 33, type 3: 20, type 6: 19, type 12: 18.
