# A5-panel-logic-1-4 checkpoint

F-panel-633: 6 journeys, 7 type lines
F-panel-634: 10 journeys, 14 type lines
F-panel-635: 10 journeys, 14 type lines
F-panel-636: 15 journeys, 21 type lines
F-panel-602: 6 journeys, 7 type lines
F-panel-603: 6 journeys, 7 type lines
F-panel-600: 7 journeys, 7 type lines

All 7 features done. Findings: FN-A5-panel-logic-1-4-01 (S4), FN-A5-panel-logic-1-4-02 (S3).

## Entities
- F-panel-634: the gym's workout plans (the list the workout is picked from) have no entity of their own that I could find by name; left out of "reads".
- F-panel-636: "seen" is kept in the browser's own storage (keys forgeai.hqNews.seen.v1, forgeai.bell.alertsSeen.v2.<gym>); no entity fits, so "writes" is empty.
- F-panel-600 / 602 / 603: members, plans and receipts made by an import are written as E-crm-records (the panel's synced rows); the "Past imports" list has no entity of its own.

## Roles
- F-panel-600 / 602: the feature rows say owner only, but the code also runs for a front-desk login (apps/dashboard/src/crm/logic/importSave.ts:61, role 'owner' | 'staff'; plans and payments are then left for the owner). Journeys were written for owner only, as the rows say; the front desk appears only inside the type 12 journeys.
- F-panel-633: the row says owner only; the front desk has a read-only view (ui/screens/GymTimings.tsx:185-196), covered inside the type 12 journey.
- F-panel-634: "trainer" follows the code comment "Owner and Staff (trainers) alike" (ui/screens/WorkoutOfTheDay.tsx:8). Whether a front-desk login that is not a trainer can also set it was not read.

## Seen in passing (not sure, not filed)
- gymWod: "Take it off" in the confirm sheet has no busy state and is not marked as needing the internet, unlike Save (ui/screens/WorkoutOfTheDay.tsx:161-176). A double tap sends two clears; the second is harmless if the server ignores a missing day.
- gymWod: today is read once from the server when the card loads (WorkoutOfTheDay.tsx:96); a card left open over midnight still labels yesterday "Today" and offers it in "Day"; the server then answers BAD_DATE ("Pick today or a day in the next week.").
- gymWod: the second panel never re-reads the list (one read on mount, WorkoutOfTheDay.tsx:62-80); two people can each see a different list until a reload.
- hqNews: on a first look a message whose time cannot be read is never counted as new (logic/hqNews.ts:58-59, Date.parse gives NaN).
- hqNews: a failed read returns an empty list (hqNews.ts:83-95); with the change guard in ui/WhatsNew.tsx:91-94 a short outage makes the "From MettleUp" group vanish until the next good read.
- importIds: an Aadhaar is recognised only as 12 English digits with a correct check digit, split by spaces or dashes (logic/importIds.ts:51-60, 98). A mistyped Aadhaar, one in Hindi digits, one with dots, or a 16-digit virtual ID stays in the imported text, while the screen says "Aadhaar and PAN numbers are never imported." By design for the check digit; worth a look for the promise.
- importIds / aiImport: the whole-column check reads only the first 60 filled rows (logic/aiImport.ts:267-273); a column whose ID numbers start lower down is not dropped as a column, only cut cell by cell.
- importSave: after plans and payments fail (termsError), "Try again" does not resend them (logic/importSave.ts:246-248 sends waiting rows only); the screen tells the owner to undo and import again instead (ui/screens/ImportMembers.tsx:1384-1385). Works, but heavy for the owner.
- ImportMembers: run() has no own guard against a second tap (ui/screens/ImportMembers.tsx:450-475); it relies on the screen changing to 'running'. Each run makes a new import id.
- homeTiles: the 'visited-today' bucket in logic/homeTiles.ts:76-77 is not what the "Came in today" tile shows (Today.tsx uses stats.visitsToday and opens the register); two counts for one idea.
- GymTimings: most headings on the page are plain strings, not passed through the language function (ui/screens/GymTimings.tsx:118-196), so Hinglish may show English there. Same for WorkoutOfTheDay and ImportMembers.

## Could not check
- Nothing was driven on a screen: every journey is from reading code; coverage is "unknown" on every row.
- The shared rules in packages/theme/src/gymHours.ts (hoursProblem words) and logic/workoutPlans.ts (workoutPlanProblem words) were not opened: exact refusal words are marked as not read.
- What a front-desk login sees at /money/today and what /members/f/<wrong word> shows: not read.
- Server side (owner_save_gym_timings, owner_save_gym_wod, /api/hq-news, the import store): not opened in this step.
- Branch isolation of an import: needs a second test gym.
