# B-run-phone-onboarding-db-a checkpoint
- L6.6 checked: setup save / demo load / home summary failures show try-again, log nothing (WelcomeScreen.tsx:497-500,515-518; dashboardStore.ts:61-63; writeQueue.ts:36-38) -> new finding 01
- L6.2 checked: no double-save; setup save re-checks profile in its transaction (dataActions.ts:330-335), straight-in guard (phoneSignInApi.ts:121), body weight upsert (userRepo.ts:103-104). No finding.
- L6.1 checked: local writes need no network; gym code kept offline (WelcomeGymCode.tsx:131-153). Phone check waiting: offline/server error answer = null, silent wait (findGymApi.ts:58-66; WelcomePhone.tsx:177-178) -> new finding 02
