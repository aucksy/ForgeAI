# A5-phone-tracker-services-1-1 checkpoint
Entities: entities.json has no phone-only (on-device SQLite) entity for workouts, sets, badges, photos or settings, so writes/reads stay empty for journeys that touch only the phone database.

F-phone-500: 7 journeys, 7 type lines
F-phone-501: 7 journeys, 7 type lines
F-phone-502: 7 journeys, 8 type lines
F-phone-503: 7 journeys, 7 type lines
seen in passing F-phone-503: copies are only cleared when the sheet closes; an app killed with the sheet open leaves share copies in the cache until the next close or erase.
F-phone-504: 7 journeys, 8 type lines
F-phone-507: 7 journeys, 8 type lines
seen in passing F-phone-507: getTargetsForPlanDay keeps only the first row of an exercise listed twice, while Home/chat give each row its own card; check which one the live screen uses (targetStore uses getTargetsForCards).
F-phone-511: 7 journeys, 8 type lines
F-phone-508: 5 journeys, 8 type lines
seen in passing F-phone-508: no Home screen exists in app/(tabs) (coach, profile, progress, shop, workout); 'today's workout with Targets' is shown by app/today.tsx through coachTargets, not this loader.
