# Checkpoint A2-panel-logic-1

- [x] 1. Read the source list (43 lines: 42 file lines + panel.txt#450)
- [x] 2. Opened each item (file header + export list; targeted reads of gates)
- [x] 3. Switches and plan gates noted (in the rows' "switch" field)
- [x] 4. Grouped into features
- [x] 5. Wrote feature rows: F-panel-600 to F-panel-636 (37 rows) in docs/system-map/_work/out/A2-panel-logic-1.jsonl
- [x] 6. not-a-feature row: dates.ts (F-panel-621)
- Finished units: all 43 source lines covered (checked by script: 0 missing, 0 extra). DONE.
- Code lines read: about 1,650 (limit 2,500).

## Limits of this pass
- tier is "unknown" on every row: no "Pro only" rule is written in these 42 files; the plan/feature list lives outside this area (packages/theme).
- status "live" = the file is imported by a screen in apps/dashboard/src/crm (checked by grep), not proven by opening the panel.
- roles come from the file header comments; the screens' own role checks were not read.
- Switch names for AI column matching and for member questions are not in these files (only the server's "off" answer / the words shown).
- The big files (importMembers.ts 1,746 lines, attendance.ts 780, aiImport.ts 624, businessGrowth.ts 603) were read by header and export list only, not body by body.

## Seen in passing
- apps/dashboard/src/crm/logic/billing.ts:2 says the server half (0063_gym_checkout.sql) is "NOT APPLIED": online checkout cannot be live until it is.
- apps/dashboard/src/crm/logic/gymAlerts.ts:17 says migration 0089 is "NOT LIVE": the panel rewrites the trial alert's words by one exact-sentence pattern (line 22); if the server's sentence differs by a word, the old wording shows.
- apps/dashboard/src/crm/logic/getStarted.ts:2 header says "the five first steps"; the code returns up to 8 (lines 93-104). Stale comment only.
- apps/dashboard/src/crm/logic/claimCode.ts:17 says the file "is copied word for word into the admin app" inside the admin app's own copy: comment carried over from the phone app's twin. Harmless.
- apps/dashboard/src/crm/logic/alertHandled.ts:10 matches an alert to its message/enquiry by kind and time only (no id): two things of the same kind at the same instant could be mixed up. Not verified.
