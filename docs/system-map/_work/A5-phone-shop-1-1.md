# A5-phone-shop-1-1 checkpoint

F-phone-327: 11 journeys, 15 type lines
  - no entity for the share-link base; check-in and invite page visits have no entity
F-phone-308: 12 journeys, 15 type lines
  - no entity for a check-in (visit) row; E-gym-phone-links used for the first-time number
F-phone-318: 11 journeys, 15 type lines
  - no entity for check-ins (busy levels are counted from them)
F-phone-330: 11 journeys, 15 type lines
  - no promise found for the phone's logo header (searched logo, branding, gym name)
F-phone-317: 11 journeys, 15 type lines
F-phone-311: 5 journeys, 8 type lines
F-phone-315: 11 journeys, 15 type lines
  - seen in passing: the ask line says the gym gets 'exercises, sets, weights, reps and your notes' while Settings, What my gym can see says MettleUp never sends exercises or notes (P-A7-phone-watch-2-28): wording clash for the promises step
F-phone-320: 14 journeys, 14 type lines
F-phone-323: 12 journeys, 15 type lines
  - no entity for the member's 'seen' mark on a gym message; no promise found for the inbox (searched inbox, bell, seen by)
F-phone-310: 8 journeys, 7 type lines
  - no entity for the member's own terms tick (kept on the phone by saveTermsAgreed); E-gym-terms-acceptance is the gym owner's

All 10 features done (18 feature x role pairs). Findings: none (no plain bug seen; see below).
Seen in passing (not sure, not findings):
- Check-in time ('You're checked in at 6:42 pm') is printed on the phone's own clock (checkIn.ts checkInTime, getHours), while the busy card and timings use India time; a phone set to another zone shows a different time from the desk.
- Gym timings screen: its refresh flag is reset only after both reads return; if a read ever throws, pull to refresh stops working until the screen is reopened.
- Check in, Join and the report Yes rely on React state or a re-render for their busy guard; two very fast taps may both start (the join id and the server's 'already checked in' should absorb it; unproven).
- Report ask words say the gym gets 'exercises, sets, weights, reps and your notes'; Settings, What my gym can see says MettleUp never sends exercises or notes (P-A7-phone-watch-2-28). Wording clash for the promises step.
- Bring a friend: header says hidden offline, but a card already drawn keeps its old invite when a later ask fails offline.
Entities missing (left out of writes/reads): a check-in (visit) row; the member's 'seen' mark on a gym message; the member's own terms tick.
