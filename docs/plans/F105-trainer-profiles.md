# F105 Trainer profiles and schedules: plan (7 Nov 2026)

Owner scored it 8 on 7 Nov 2026. Backlog: "Each trainer gets a page: photo, what they teach, working hours,
their personal-training members and sessions left. A weekly calendar shows the booked personal-training slots,
so the desk can book a member with a free trainer."

## What exists already (no change)
- A trainer = a person in Settings -> Staff & sign-in that the owner ticked "Trainer" (0050, live). Their role
  stays "staff" (front desk powers), never owner.
- A member's trainer = picked by the owner on the member's page (0050 gym_trainer_members, live).
- Personal-training packs = plans with a class count (`ptSessions`); the desk taps "Mark session" on the member's
  page to use one (logic/pt.ts). The pack's `trainer` is a typed name.

## Screens (first version)
1. **More -> "Trainers"** (`/trainers`). Two parts on one page:
   - **The trainers**: one card each: photo (or initials), name, "Teaches: ...", today's hours, how many
     personal-training members. Tap -> the trainer's page.
   - **"Personal training this week"**: the week (Mon-Sun, "Last week" / "Next week"), a day strip with how
     many bookings each day, and for the chosen day a time grid: one column per trainer, 30-minute rows.
     Each slot is Booked (member name), Free (tap to book) or "Not working". The grid scrolls sideways inside
     its box on a phone; the page never does.
2. **A trainer's page** (`/trainers/<id>`): photo, name, what they teach, working hours for each day, their
   personal-training members with "N personal-training classes left" each (0 shown in red), and their bookings
   for the next 7 days. "Edit" (photo, what they teach, hours).
3. **Book sheet**: member (search; members with classes left first, each shows classes left), trainer, day,
   start time, length (30 / 45 / 60 / 90 min, default 60). **Booking sheet** for a booked slot: who, when,
   "Cancel booking".

## Data (new migration 0065_trainer_schedule.sql, NOT APPLIED)
- `gym_trainer_profiles`: one row per ticked trainer: what they teach (80 letters), photo (a small JPEG, at most
  100 KB, sent inside the answer like member photos, no public link), working hours (for each weekday up to 2
  shifts, from-to in minutes).
- `gym_pt_bookings`: trainer, list member id, day, start minute, length, who booked, cancelled at / by.
- Functions: `owner_trainer_schedule(key, week Monday)` read; `owner_save_trainer_profile`; `owner_book_pt`;
  `owner_cancel_pt`. Kept OUT of crm_records, so a booking never fights with the offline copy.

## Roles
| | Owner | Desk (staff) | Trainer (staff + tick) |
|---|---|---|---|
| See trainers, their pages and the week | yes | yes | yes |
| Book / cancel a booking | yes | yes | yes |
| Cancel a booking that already started or is past | yes | no | no |
| Edit a trainer's photo, what they teach, hours | yes, anyone | no | their own only |
| Tick someone as Trainer | yes (existing Staff screen) | no | no |

## Clashes (checked in the app before saving, and again on the server)
- **Trainer double booked**: a booking that overlaps another of the same trainer is refused: "Rohit already has
  Asha Verma at 7:00 am. Pick another time."
- **Member double booked**: the same member at an overlapping time with any trainer is refused.
- **Outside working hours**: warned, not refused: "This is outside Rohit's working hours." + "Book anyway". A
  trainer with no hours set: every time is open, with a note "Working hours not set".
- **0 classes left**: refused: "Asha Verma has no personal-training classes left. Sell a personal-training pack
  first." Classes already booked count too: 2 left and 2 future bookings = full. (App-only check: the packs
  live in the gym's records; the server checks the three above.)
- **In the past**: refused ("Pick a time later than now").
- Only 5:00 am to 11:00 pm, 30-minute steps; at most 31 days ahead.

## Not ready yet
Until 0065 is applied, the page says "Trainer pages are not ready for your gym yet. Nothing you do here is
saved." A gym kept in this browser only: "Trainer pages need your gym online". Demo: the usual "This works in
your own gym" card. No ADMIN_NEWS line and no help article until it is live (NO_HELP_SCREENS has the reason).

## Cut from the first version
- Booking does NOT use up a class: the desk still taps "Mark session" when the member comes (no double rules).
- No member-app booking, no reminders to the member or trainer, no repeat bookings ("every Mon/Wed/Fri").
- No trainer leave / holidays (edit the hours instead).
- No group classes or room capacity.
- The trainer's members come from the owner's pick on the member's page, plus packs typed with that trainer's
  name. No new way to assign.

## Owner decisions
1. Apply 0065 to the live server (his yes).
2. Booking outside working hours: warn and allow (chosen), or refuse?
3. Later: should a booking use up a class by itself when its time passes?
