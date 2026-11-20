# A5-phone-shop-2-3 checkpoint
F-phone-428: 10 journeys, 16 type lines
F-phone-424: 16 journeys, 14 type lines
F-phone-402: 11 journeys, 14 type lines (E-leads used for the 'Tell my gym' lead POST; body carries gym and city only, no number: findGymApi.ts:73)
F-phone-430: 10 journeys, 16 type lines
F-phone-403: 14 journeys, 14 type lines
F-phone-432: 10 journeys, 14 type lines (no entity fits: share only, nothing stored)
F-phone-405: 6 journeys, 18 type lines, 1 finding (sample shop unreachable: every page redirects without a gym; no entity fits, phone-only store)
F-phone-414: 14 journeys, 14 type lines (plans' video links ride in crm_records kind workout_plan: supabase/migrations/0051_gym_videos_and_wod.sql:12)
DONE: all 8 features, 16 feature x role pairs, 212 rows (91 journeys, 120 type lines, 1 finding).
Seen in passing (not sure, not findings):
- Bring a friend: after one "server has no 0056" answer the card stays hidden for the whole app session (serverMissing), even if the server is updated meanwhile (BringFriendCard.tsx:22,54).
- Find my gym: the number link after the join is tried once; offline at that moment it is dropped with only a log, and the desk must confirm the number instead (findGymApi.ts:104-123).
- Message your gym: the complaint reader line says "Only the owner" with no recipient, but a complaint sent to "Gym admin" is read by the front desk too (gymMessages.ts:191-199); older promises P-A7-help-1-21 and P-A7-phone-watch-2-49 say only the owner reads complaints.
- Message your gym: typed text is lost on back with no question (no draft kept).
Could not check: nothing driven on a device; no tests opened (coverage left "unknown").
