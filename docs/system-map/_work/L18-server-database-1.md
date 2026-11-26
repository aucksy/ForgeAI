# L18-server-database-1 checkpoint

## Progress
- 2026-11-27 L18.1 checked: 8 improvement rows (IM-L18-server-database-1-01..08). Later migrations (0034-0100) were
  grep-checked so no idea proposes something already built (server pop-ups, phone sign-in, Join online, Bring a friend).
- 2026-11-27 L18.2 checked: every row is a "My view:" proposal, nothing built. No findings (nothing broken found).
- lens-cover ok; merge --dry 9 read, 9 passed, 0 rejected. DONE.

## Notes for the next helper
- This database is heavily built out; read migration headers (the leading comment block) of 0040+ before proposing.
- The phone's "not on the gym list" check-in ends at "Ask the desk to add you" (apps/mobile/src/shop/checkIn.ts:156-159).
