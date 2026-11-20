F-phone-1600: 26 journeys, 49 type lines
F-phone-1602: 11 journeys, 15 type lines
F-phone-1605: 6 journeys, 7 type lines
F-phone-1608: 9 journeys, 15 type lines, 1 finding
F-phone-1614: 9 journeys, 16 type lines
F-phone-1613: 6 journeys, 7 type lines
F-phone-1609: 8 journeys, 16 type lines
F-phone-1610: 10 journeys, 15 type lines
ALL 8 ITEMS DONE. 226 rows (85 journeys, 140 type lines, 1 finding).
Entity note: profile, workouts, routines, exercises, demo rows and settings live in the phone database; no entity id fits them. Used only E-gym-members, E-gyms, E-phone-inbound, E-member-items where a step reaches the server.
Could not check: owner/trainer/staff number found only on a gym's staff list in the member app phone sign-in (words not read; written as unknown). Whether the watch shows or drops demo data and own exercises (not read).
Seen in passing:
- Setup saves the profile's unit column as 'metric' even when Pounds is picked (onboarding/db/dataActions.ts:359); the unit setting itself is saved separately, so likely harmless.
- Straight-in marks its note 'due' before saving the setup (onboarding/phoneSignInApi.ts:134-136); an app killed between the two leaves the note, so a member who then answers the 3 questions may read "We set you up as New to lifting".
- "Remove demo data" when the data stopped being the demo closes with no words (onboarding/demoRemoval.ts:29-33).
- Erase all data: the busy guard is set only after the confirm, so a fast double tap can open two confirm sheets (components/settings/DataCard.tsx:150-171).
- Straight-in always sets units to kg (onboarding/phoneSignInApi.ts:133).
