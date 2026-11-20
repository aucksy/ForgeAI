# A5-panel-brand-shell-2 checkpoint

F-panel-1109: 9 journeys, 16 type lines
F-panel-1121: 10 journeys, 15 type lines
F-panel-1132: 10 journeys, 15 type lines
F-panel-1127: 9 journeys, 16 type lines
F-panel-1126: 18 journeys, 21 type lines
F-panel-1116: 12 journeys, 14 type lines
F-panel-1128: 4 journeys, 8 type lines
F-panel-1135: 9 journeys, 15 type lines
F-panel-1111: 9 journeys, 15 type lines

All 9 features done. 0 items left. Findings: none (no clear bug seen in the lines read).

## No entity fits (left out of writes/reads)
- F-panel-1128: an expense row. No entity in entities.json names expenses; E-crm-records lists gym, member, plan, membership, payment, visit, workout plan only. Type lines 7 and 11 carry entity "unknown".
- F-panel-1116: the enquiry row itself. Same gap; E-crm-records used only because the journey also makes a member / moves a membership.
- F-panel-1109: the "seen" marks (bell, MettleUp messages, new dots) and F-panel-1135 "Your questions" live in browser storage, no entity.

## Seen in passing (not sure, not findings)
- apps/dashboard/src/crm/ui/screens/MemberDetail.tsx:845-853: "Give extra days" from the workout code sheet opens the extra-days sheet preset to 3 days, whatever the running offer's reward days are. May be a default the owner edits; not checked.
- apps/dashboard/src/crm/ui/screens/Feedback.tsx:41 + logic/helpHistory.ts: "Your questions" is read from this browser; not checked whether the key is per person or per gym. On a shared desk browser staff may see the owner's questions and answers.
- apps/dashboard/src/crm/ui/screens/Challenges.tsx:514-530: "give to all" calls the server once per winner in a loop; a failure half-way shows only the error words, though earlier winners were given (the reload shows the truth).
- apps/dashboard/src/crm/ui/screens/Enquiries.tsx:276-292: the friend reward is two saves (extend the plan, then mark the enquiry). A drop between them is caught on retry by alreadyRewarded, which matches on the friend's name; two friends with the same name for one member not checked.
- apps/dashboard/src/crm/ui/screens/GymTimings.tsx and BusyMachines.tsx: no leave-page question seen for an unsaved draft.
- apps/dashboard/src/crm/ui/screens/Feedback.tsx:72: the message box cuts typing at 2,000 letters with no counter or word.
- apps/dashboard/src/crm/logic/hqNews.ts:22: the MettleUp-messages seen mark is one key per browser, not per gym or person (the bell's gym alerts are per branch).

## Could not check
- Server side of every owner-only rule (offers, challenges, timings, machines, support access): only the panel code was read, not the SQL functions.
- Trainer role (F-panel-1126): the panel has only owner and staff roles; a trainer is a staff sign-in. Whether the server treats a ticked trainer differently for diet plans and measurements was not read.
- PlusLock.tsx and BringAFriend.tsx were not opened in full (line budget); their journeys use the words found by search and in promises.json.
- No test was opened: every journey has tests [] and coverage "unknown".
- Nothing was driven on a screen; all words are from code.
