# A5-phone-tracker-components-1-1 checkpoint

F-phone-700: 4 journeys, 8 type lines
F-phone-701: 4 journeys, 8 type lines
F-phone-703: 4 journeys, 8 type lines
F-phone-702: 3 journeys, 9 type lines
F-phone-710: 4 journeys, 8 type lines
F-phone-712: 5 journeys, 8 type lines
F-phone-713: 4 journeys, 8 type lines
F-phone-714: 3 journeys, 9 type lines
F-phone-715: 5 journeys, 8 type lines

Entities: no entity in entities.json for the phone's own local tables (weigh-ins, measurements, progress photos, workouts, routines, plans); writes/reads left out. E-member-items (cloud copy) not linked as the journeys do not touch backup.
Seen in passing: measures/index.tsx onUndo swallows errors (catch(() => undefined)) so a failed Undo says nothing.
Seen in passing: live workout shows EasyWeekNote with no end date (session/active.tsx:708) though the note's own rule says the end date is always on screen when known.
Seen in passing: DatePickerSheet weekday letters are fixed English; today is the phone clock, not IST.
Seen in passing: promise P-A7-legal-2-58 says progress photos never leave the phone, while PhotoBackupCard (P-A7-phone-watch-1-39) implies a photo backup when on. Not checked here.
Could not check: nothing driven; all from code reads.
