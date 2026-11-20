F-phone-103: 6 journeys, 7 type lines
F-phone-137: 7 journeys, 7 type lines
F-phone-102: 7 journeys, 8 type lines (incl. type 12 no)
F-phone-101: 7 journeys, 8 type lines (incl. type 12 no)
F-phone-100: 7 journeys, 7 type lines
F-phone-116: 7 journeys, 7 type lines
F-phone-106: 6 journeys, 8 type lines (incl. type 12 no), 1 finding
F-phone-104: 5 journeys, 7 type lines, 1 finding
F-phone-109: 5 journeys, 8 type lines (incl. type 12 no)
ALL 9 ITEMS DONE.
Entity note: workouts, routines, profile and exercises live in the phone database; no entity id fits them (E-member-items is only the cloud copy, used where a save also reaches it). Left out of writes/reads where nothing fits.
Seen in passing:
- What's new 0.56.0 line P-A7-whats-new-3-04 still promises 4 tabs (Workout, Progress, Gym, Profile); the app now has 3 (lib/appTabs.ts:15-19).
- What's new line P-A7-whats-new-2-71 names the part "Leaderboard"; it is "Ranking" now (shop/gymTab.ts:22).
- Check-in button has no ref guard (shop/CheckInScreen.tsx:225); a fast double tap may send two check-in calls (server likely answers already checked in).
- _layout.tsx:214-217: a kept invite and a kept check-in poster link both push a screen; two stacked screens after setup.
- exercise/[id].tsx:302: a merge refusal other than in-workout returns with no message.
