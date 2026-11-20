# A5-phone-tracker-engine-1 checkpoint

F-phone-900: 5 journeys, 8 type lines
F-phone-901: 4 journeys, 8 type lines
F-phone-902: 5 journeys, 7 type lines
F-phone-903: 5 journeys, 8 type lines
F-phone-904: 6 journeys, 7 type lines
F-phone-906: 4 journeys, 8 type lines
F-phone-907: 4 journeys, 8 type lines
F-phone-908: 5 journeys, 7 type lines

All 8 items done. 102 rows in _work/out/A5-phone-tracker-engine-1.jsonl (38 journeys, 61 type lines, 3 findings). Code read: about 1,800 lines.

## Entities
No entity in entities.json fits the phone's own local data (workouts, sets, weigh-ins, measurements, routines, balance-check state, clip files). E-member-items is only the cloud copy. So writes/reads are left empty and type lines use entity "none". One type line uses E-gym-body-measurements (the gym-recorded measurements).

## Promises
- No promise row found for: the Ask an AI page's own words ("MettleUp sends nothing... Your name, phone number and body weight are left out."), the exercise clips, the balance check, the body map, the machine details, the headline numbers.
- Linked: P-A7-whats-new-2-48 (badges), P-A7-phone-watch-2-29 (body weight never sent).

## Seen in passing (not findings)
- F-phone-903's name in features.json is out of date: owner decision R-483 (13 Nov 2026) took the swap offer out of the balance card; it now only names the muscle with "Not now". Only blocks started before R-483 still show "Keep it" / "Go back" (components/analytics/BalanceCard.tsx:20-26, 105-114).
- F-phone-904's name says it asks before replacing the same day's weigh-in; the code asks only for an EARLIER day, by design (tracker/engine/bodyCheck.ts:65-72).
- member_summary (E-member-summary) has a weight_kg column visible to owner and trainer, while promises say body weight is never sent to the gym (P-A7-phone-watch-2-29, P-A7-help-1-24). Not checked whether the phone fills that column.
- Add measures says photos "stay on your phone" (app/measures/add.tsx:185) and the privacy notice says progress photos never leave the phone (P-A7-legal-2-58), yet the same screen calls refreshPhotoBackup (add.tsx:77). Not checked what the photo backup sends.
- Balance card: when reading the card fails it just disappears with no word (BalanceCard.tsx:41, services/balanceCheck.ts:88-90).

## Could not check
- Tests: no test file was opened, so every journey has tests [] and coverage "unknown".
- The finish-screen "New badge" line and the badge shelf on Profile were not read (only the engine words in tracker/engine/badges.ts:310-314).
- Whether gym-recorded weigh-ins go into the typo question's history (needs the body weight history service).
- Whether watch workouts reach the phone database these engines read (type 11 lines assume they do).
