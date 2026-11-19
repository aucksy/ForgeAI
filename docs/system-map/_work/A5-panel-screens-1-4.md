# A5-panel-screens-1-4 checkpoint

Status: all 10 features done (19 feature x role pairs). Output: docs/system-map/_work/out/A5-panel-screens-1-4.jsonl (235 rows: 93 journeys, 141 type lines, 1 finding). Code lines read: about 2,300 of 3,000.

## Done
F-panel-232: 12 journeys, 14 type lines
F-panel-231: 10 journeys, 14 type lines
F-panel-230: 10 journeys, 14 type lines
F-panel-235: 8 journeys, 16 type lines (type 12 is a "no" line for each role)
F-panel-237: 8 journeys, 16 type lines (type 2 is a "no" line for each role)
F-panel-238: 15 journeys, 24 type lines (type 12 is a "no" line for each role)
F-panel-233: 4 journeys, 8 type lines (type 2 is a "no" line)
F-panel-234: 6 journeys, 7 type lines
F-panel-236: 5 journeys, 7 type lines
F-panel-239: 15 journeys, 21 type lines

## Finding
FN-A5-panel-screens-1-4-01 (S3): an owner checking a workout code reads "The owner gives the extra days." when the member has no gym plan to add days to.

## Seen in passing (not sure, not written as findings)
- Workout code: the check saves nothing, so the same code can be checked and rewarded again with no word that it was used before (apps/dashboard/src/crm/ui/WorkoutCodeCheckSheet.tsx:34, MemberDetail.tsx:848-855). The offer list elsewhere may keep track; not checked.
- Workout code reward opens on a fixed 3 days whatever the gym's offer says (MemberDetail.tsx:852).
- PT card: all sessions used and the PT plan no longer on sale shows "Time to renew." with no button at all (MemberDetail.tsx:1168-1169).
- Body measurements: when the list is already on screen, a failed reload after a save shows nothing; the old list stays with no word (MemberMeasurements.tsx:94).
- Member photo: "Remove photo" has no "are you sure" step (DeskCameraSheet.tsx:339). The sheet says only the gym's staff can see the photo and also that it shows on the member card; whether that card can be sent to the member was not checked.
- Freeze / extra days: no way to take added days back; the reason "Freeze – Medical" is kept in the plan's notes, and where else those notes show was not checked (ExtendMembershipSheet.tsx:67).
- WhatsApp to one member: nothing records that a message was sent (WhatsAppSheet.tsx:108).
- Most words on these sheets are plain English in the code, not passed through the wording switch, so a Hinglish panel likely leaves them in English (for example MemberDetail.tsx:412 and 1172).

## Entities
- All membership, payment, visit and workout plan data is written as E-crm-records. Photo: E-gym-member-photos. Measurements: E-gym-body-measurements. Trainer journeys also read E-gym-trainers.
- Left out because not sure: E-receipt-history on a cancelled receipt (the save is on the server, not read), E-photo-tickets for the photo upload, E-gym-offers and E-offer-members for the workout code (the check itself reads only the member's check-ins).

## Could not check
- Nothing was driven on a screen: every journey is from reading the code. No test was opened, so coverage is "unknown" on every row.
- Exact words made outside the files read: the date refusal for a receipt, the higher-price question on a sale, the workout-code result line and its error lines, the measurement error lines, the "gym not online yet" line.
- Trainer: the panel knows only owner and staff logins (a trainer is a staff login ticked as trainer). Whether a trainer can open members who are not their own was not checked.
- Whether the server refuses a front desk login that calls cancel, freeze or cancel-receipt directly (only the hidden buttons were read).
- Anything needing a second gym: needs a second test gym.
