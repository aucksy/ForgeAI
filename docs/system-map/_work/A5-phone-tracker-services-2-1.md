# A5-phone-tracker-services-2-1 checkpoint
Entities: entities.json has no phone-only (on-device SQLite or file) entity for workouts, sets, records, plate setup, profile or progress photos, so writes/reads stay empty for journeys that touch only the phone. E-member-items used where the cloud copy carries photo ids and dates, or old workouts come back.

F-phone-600: 7 journeys, 7 type lines
seen in passing F-phone-600: features.json says tier "free", but the code locks the plate calculator behind MettleUp Plus (F56, R-461); "Add warm-up sets" is not locked.
F-phone-601: 6 journeys, 7 type lines
F-phone-602: 7 journeys, 7 type lines
F-phone-603: 7 journeys, 7 type lines
seen in passing F-phone-603: "Include photos in my backup" copies photos into Android's own backup, against "Your progress photos never leave your phone" (already marked "partly" by A7).
F-phone-604: 5 journeys, 8 type lines
seen in passing F-phone-604: "This week vs your usual" and "Your lifts" have no screen: getProgressTop is used only by an unused hook (useProgressTop) and WeekCard is imported nowhere; the Progress tab redirects to Profile. Only the body map muscle sheet (Profile > Charts) is live. features.json status "live" is too strong.
F-phone-606: 4 journeys, 8 type lines
seen in passing F-phone-606: switched off 5 Nov 2026 (workout.tsx:488); app/ready.tsx is only reachable by a direct link. features.json still says "live" (F-phone-605 was patched to hidden, 606 was not).
F-phone-607: 6 journeys, 8 type lines
F-phone-609: 5 journeys, 7 type lines
F-phone-613: 7 journeys, 7 type lines
seen in passing F-phone-613: tickFollowUp.ts comment still says a set before a drop set means "no rest", while restRules now rests every set the same; comment only.
F-phone-615: 8 journeys, 7 type lines
All 10 items done. Findings: FN-A5-phone-tracker-services-2-1-01 (queued watch tick dropped in background), -02 (help article for a removed card).
