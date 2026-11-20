# A5-phone-shop-2-1 checkpoint
Started 20 Nov 2026 (no earlier checkpoint). Output: docs/system-map/_work/out/A5-phone-shop-2-1.jsonl

## Done features
F-phone-400: 10 journeys, 14 type lines
F-phone-406: 10 journeys, 14 type lines
F-phone-404: 10 journeys, 14 type lines
F-phone-411: 12 journeys, 14 type lines
F-phone-409: 9 journeys, 15 type lines (+1 finding FN-A5-phone-shop-2-1-01)
F-phone-412: 10 journeys, 14 type lines (no entity for phone-only folders; used E-member-items for the cloud copy)
F-phone-413: 8 journeys, 16 type lines
F-phone-415: 10 journeys, 14 type lines

All 8 items done. 195 rows (79 journeys, 115 type lines, 1 finding).

## No entity fits
- "Seen" marks on gym messages (member_saw_messages, 0008): no entity row; left out of writes.
- Phone-only data (bag, routine folders from gym plans, kept membership answer): no entity; E-member-items used only where the cloud copy holds routines.
- Check-in visits live in crm_records (kind 'visit'): E-crm-records.

## Seen in passing (not sure enough for a finding)
- Join with an empty name says "Type your name so the desk knows whose order it is." (gym.ts:332) - order words on a join.
- joinErrorText has no SUSPENDED case (gym.ts:327-341): a paused gym's join says "Couldn't join just now. Try again." Unclear whether gym_members writes are blocked by 0027's triggers at all.
- Offline "My membership" counts days left from the kept day, not today (membership.ts endsLine with a.day); the "As of an earlier day" line softens it.
- Gym tab plan card counts days from the server's IST day; the Workout tab "plan ends" card from the phone's own day (PlanEndsCard.tsx:38): can differ by a day on a phone set to another zone.
- An inbox message of a kind the app does not know is dropped with no word (inbox.ts inboxFromRow).
- Name box on the invite screen silently cut at 70 letters (InviteScreen.tsx:183).
- Joining while the trainer view is live switches "share with trainers" on (InviteScreen.tsx:132-137); the line is shown above the button, so by design (R-296).

## Could not check
- Whether tests cover these journeys (not asked in A5; tests left empty, coverage unknown).
- Order-ready pop-up for the shop: not looked for.
- Group-only messages (to_group) filtering on the server: not read; journey written from the entity's fields.
