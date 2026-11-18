# A2-panel-brand-shell checkpoint

- [x] unit 0: source list read (740 lines)
- [x] unit 1: gates read (CrmApp.tsx 150-500 menu, routes, offline list; auth/permissions.ts; plan/pack.ts; plan/ProNote.tsx; App.tsx; main.tsx)
- [x] unit 2: file headers read for about 150 files (first 2-4 comment lines each); import checks for possibly dead files
- [x] unit 3: 740 source lines grouped into 40 rows F-panel-1100..1139; written to out/A2-panel-brand-shell.jsonl
- [x] unit 4: self-check: 740 of 740 ids covered, every entry path exists and its line is inside the file, JSON parses
- DONE. Code lines read: about 1,900 of the 2,500 allowed.

## Limits of this pass
- 740 items against a 2,500-line reading limit: most items were placed by their file's header comment and name, not by reading 100 lines around each.
- 40-row cap: the 41 demoServer lines are ONE "demo copy of ..." row, not one per feature.
- tier "Pro" = the page is in proFeatureOfPage (plan/pack.ts) while PLAN_GATE_ON is false (packages/theme/src/plans.ts:40), so nothing is closed today.
- "behind switch" rows name a server part or Worker switch whose live state was NOT checked (no database reads in this step).

## Seen in passing
- crm/CrmApp.tsx:477 the source list calls this redirect "/settings -> /settings"; it is the /settings/web-page route sending the owner to /settings while gym pages are closed. Source-list naming only, not an app bug.
- crm/machines/handler.ts, adms.ts, memoryStore.ts, supabaseStore.ts are imported by no file under apps/dashboard/src (non-test); headers say the gate Worker is NOT DEPLOYED and 0058 NOT APPLIED. They ship inside the panel's source folder but the panel never runs them.
- App.tsx, components/{Dashboard,Login,MembersTable,Onboarding,Panels,ui}.tsx, hooks/*, lib/format.ts, src/types.ts: main.tsx mounts only CrmApp or DemoApp, so this old dashboard (and its create_gym call, Onboarding.tsx:27) is unreachable.
- plan/pack.ts PRO_HOW tells a Starter gym to "open Help and feedback in the menu"; CrmApp.tsx:306 hides Help and feedback in the demo gym (harmless today: gate off).
