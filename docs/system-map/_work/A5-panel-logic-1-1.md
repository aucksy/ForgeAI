# Checkpoint A5-panel-logic-1-1

F-panel-605: 16 journeys, 21 type lines
F-panel-604: 15 journeys, 21 type lines
F-panel-607: 11 journeys, 14 type lines
F-panel-608: 9 journeys, 15 type lines
F-panel-609: 5 journeys, 7 type lines
F-panel-610: 9 journeys, 15 type lines
F-panel-611: 8 journeys, 16 type lines
F-panel-613: 8 journeys, 16 type lines

All 8 features done. 1 finding row (FN-A5-panel-logic-1-1-01).

## Entities
- No entity for "which alerts this person has read, opened or removed" (per person bell state) and none for "news already shown on Today" (kept in the browser): E-gym-alerts used for both.
- No entity of its own for visits, members, enquiries or batches: all are E-crm-records.
- F-panel-608 staff, F-panel-611: no promise fits; promise_ids left empty.

## Seen in passing (not findings, not checked further)
- Today drops a message or request that still needs someone once it is older than 24 hours (alertInbox.ts:164-171); the bell keeps it. The What's new words say Today shows what still needs you.
- The panel's own second check hides only complaints from non-owners (gymAlerts.ts:146-148); feedback for trainers is left to the server alone, and the panel has no trainer role (permissions.ts:88-90).
- The Losing the habit export (names and mobile numbers) has no role check in Attendance.tsx:774-797; the front desk can download it.
- MemberMeasurements.tsx has no role check for Add, Fix or Delete (lines 78-84); who may do it rests on the server alone. The feature row names owner and trainer only.
- An alert is matched to an enquiry by time alone, including the enquiry's last-changed time (alertHandled.ts:193-205): an unrelated enquiry edited within 2 seconds of an alert could mark the wrong line handled or waiting.
- Everyone count adds every app member that has no readable mobile number (audience.ts everyoneCount): a list member whose app record has no number is counted twice.
- Saved reminder days that are all outside the range are silently replaced by the defaults on load (autoReminders.ts:145-160).
- Measurements are rounded to one decimal on save with no word to the user (bodyMeasures.ts parseBox).
- A failed read, opened, remove or undo of a bell line is only written to the console (NeedsYou.tsx:369-374); the list is read again, so the line quietly comes back.

## Could not check
- Trainer role: which alerts the server sends a trainer, and whether a trainer can open measurements of members who are not theirs (server code not read; not in this brief).
- Exact words of: the check-in success message, the BellInbox card labels, the 40-letter limit on the batch box, who-changed-it line on Automatic reminders, the staff redirect target for Messages & offers (code-line limit reached).
- Whether a scheduled message works out its group again at send time (send code not read).
- Nothing was driven on screen and no test file was opened: every journey has coverage "unknown".
- Code lines read: about 2,950 of 3,000.
