# A5-phone-screens-2-1b checkpoint

Notes: phone-local data (routines, workouts, exercises, measures, photos, plans on the phone database) has no entity in entities.json; writes/reads are left empty unless the cloud copy (E-member-items) or the gym's measurements (E-gym-body-measurements) are touched.

F-phone-234: 8 journeys, 8 type lines
F-phone-236: 7 journeys, 8 type lines
F-phone-237: 6 journeys, 7 type lines
F-phone-200: 7 journeys, 7 type lines (findings FN-A5-phone-screens-2-1b-01, -02)
F-phone-201: 4 journeys, 8 type lines
F-phone-202: 5 journeys, 8 type lines
DONE: all 6 items in the item file (the brief said 8 pairs; the file holds 6 features, 6 feature x role pairs).
Entities: no entity exists for phone-local routines, plans, exercises, measures or photos; journeys use E-member-items (cloud copy) and E-gym-body-measurements only.
F-phone-238 note checked here: the photo promise conflicts with the photo backup setting, filed as FN-A5-phone-screens-2-1b-01 (privacy notice) and -02 (Add measures words).
Seen in passing: the Quick workout and Muscles ready pages (app/quick.tsx, app/ready.tsx) still exist as routes; the card that opened them (tracker/components/ReadyCard.tsx) is used nowhere, so only an old link can reach them. Not a clear bug.
Seen in passing: the New exercise name box has no length limit when typed (library/new.tsx:487-494); only a name passed in a link is cut to 80.
Seen in passing: backupStore.ts packs photos into a Drive backup file (promise proof of P-A7-legal-2-58); not opened here.
Could not check: watch reach of a newly followed plan; gym logo on the before-and-after picture; test files (none opened).
