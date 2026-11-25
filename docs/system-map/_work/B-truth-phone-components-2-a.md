# B-truth-phone-components-2-a checkpoint
- 2026-11-25 started; read lens, brief, items
- L2.9 checked: help AI prompt (deploy/panel/help.js:7-8,83-86) matches privacy.html:125-127,163-164; voice to Groq named. No new finding.
- L2.5/L2.1 restore counts: new finding 01 (damaged workouts left out silently, count mismatch). backupRestore.ts:295-315, copyLocal.ts:358-364, backupText.ts:67-73
- L17.2 mobile number: new finding 02 (ProfileCard.tsx:453 promise vs dataActions.ts:191-193 local only; InviteScreen sends none)
- wrote out file: 3 new findings, 2 grid rows (L2.1-L2.9, L17.1-L17.3 all checked). Running checks.
- DONE 2026-11-25: lens-cover ok, merge dry 5/5 passed.
