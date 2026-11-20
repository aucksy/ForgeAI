# A5-phone-screens-1-3 checkpoint
Note: no entity in entities.json covers phone-local data (workouts, sets, records, routines, photos on the phone); writes/reads left empty there. Cloud copy = E-member-items, help/feedback = E-feedback.
Phone app has no language setting (English only): T8-language and T9-hinglish never apply.

F-phone-107: 6 journeys, 7 type lines
F-phone-108: 6 journeys, 7 type lines
F-phone-124: 7 journeys, 7 type lines - seen in passing: reorder save failure reloads silently with no message (routines/[id].tsx ~line 316), against the file's own 'a failed save says so' rule; back from guide step 1 drops ticked exercises without asking (only Skip asks)
F-phone-127: 7 journeys, 7 type lines - seen in passing: the add-photo sheet says 'Private: they stay on this phone.' while Settings has 'Include photos in my backup' that copies them to the account; wording may need an 'unless' (not checked further)
F-phone-126: 7 journeys, 7 type lines - seen in passing: cloud/summary.ts:81 puts weight_kg (body weight) into member_summary, which entities.json says owner and trainer can read; Settings 'What my gym can see' promises body weight is never sent (P-A7-phone-watch-2-28). Not checked whether this path still runs for today's members
F-phone-132: 5 journeys, 7 type lines
F-phone-131: 9 journeys, 7 type lines
F-phone-133: 7 journeys, 7 type lines
