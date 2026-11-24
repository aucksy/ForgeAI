# Checkpoint B-run-panel-screens-1-a
- started 2026-11-24: read brief, items, related findings (forms-a-01, forms-a-02, logic-1-a-01, assistant-a-02, hq-app-a-02, hq-app-a-04)
- L6.2 checked: expenses+enquiry add use request id; measures one-per-day guard; challenges OVERLAP guard; diet plan new has no guard (DietPlans.tsx:414-427, 0035 sql insert line ~359)
- L6.1 checked: writes greyed via needsInternet on most screens; Feedback send has none but says offline words (logic/feedback.ts:224-227)
- L6.3 checked: missing-server-function shown as 'not switched on' with no log (Challenges.tsx:129, GymTimings.tsx:105, DietPlans.tsx:75-77, MemberMeasurements.tsx:62-64)
- L6.5 checked: challenge rewards given on read, not by a timer (0047_challenge_rewards.sql:15-21); worker crons deploy/panel/wrangler.jsonc:59
- L6.4 checked: backup covers every public table (docs/BACKUP-RESTORE.md:10), photos not (line 17); reuse FN-B-run-panel-forms-a-02, FN-L14-server-database-2-03
- L6.7/L6.8 checked: only timer is EntryMachines 30s refresh (EntryMachines.tsx:48-55,95-98); import yields between batches (ImportMembers.tsx:122)
- all 11 items written to out file; 4 findings (01-04)
