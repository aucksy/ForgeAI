# Checkpoint: A2-panel-screens-1

Output: docs/system-map/_work/out/A2-panel-screens-1.jsonl (40 feature rows, F-panel-200 to F-panel-239).
Coverage check run: all 39 source lines are named in "sources"; every "entry" line exists in its file.

## Steps
- [x] 1. Read the 39 source lines
- [x] 2. Opened the code at each item
- [x] 3. Noted switches and plan gates
- [x] 4. Grouped into features
- [x] 5. Wrote the feature rows
- [x] 6. Not-a-feature rows: none needed (every file is a real screen or card)

## Finished units (files)
- [x] Assistant.tsx
- [x] Attendance.tsx
- [x] BringAFriend.tsx
- [x] BusyMachines.tsx
- [x] Challenges.tsx
- [x] DietPlans.tsx
- [x] Enquiries.tsx
- [x] EntryMachines.tsx
- [x] Expenses.tsx
- [x] Feedback.tsx
- [x] GymTimings.tsx
- [x] ImportMembers.tsx
- [x] MemberDetail.tsx
- [x] MemberMeasurements.tsx

## Switches and gates met
- PLAN_GATE_ON = false (packages/theme/src/plans.ts:40): every Pro gate is off, so Challenges, Diet plans, workout plans and body measurements are open to every gym today. Route gate: apps/dashboard/src/crm/CrmApp.tsx:388-389 with plan/pack.ts:14-22; member page: MemberDetail.tsx:168.
- Role gates: apps/dashboard/src/crm/auth/permissions.ts (canOpen: expenses, assistant owner only; diet needs editWorkoutPlans, which Staff has).
- "Server has migration N" gates, each hides or greys the feature: 0071 assistant, 0056 bring a friend, 0049 busy machines, 0037 challenges, 0035 diet + measurements, 0036 timings, 0043 member photo, 0059 entry machines.
- Entry machines: file header says migration 0059 NOT APPLIED and gate Worker NOT DEPLOYED (EntryMachines.tsx:10). Taken from the comment only, not checked on the server.
- Web page question / AI chat on enquiries: usePagesOpen and usePageAiOn (Enquiries.tsx:411-414).

## Could not check
- Whether each "server has migration N" gate is open on the live server (no database reads in this step).
- The tier of AI Assistant, AI column matching, web page chat, entry machines and "Check workout code": no plan gate seen in these files; written as "unknown".
- Staff vs trainer: the code has one "staff" role; "trainer" is written on rows gated by editWorkoutPlans only because trainers sign in as Staff.
- Sub-sheets hosted by MemberDetail but defined elsewhere (sell, collect, void, send plan, member card, camera) were not opened: outside this area.

## Seen in passing
- EntryMachines.tsx:97-99: the refresh effect lists only [now] as its trigger, so it does not re-run when the key or load state first becomes ready; first refresh waits up to 30 seconds. Not confirmed as a visible bug.
- Feedback.tsx:2 file comment says "More -> Send feedback" while the page title is "Help and feedback" (Feedback.tsx:64). Wording drift in a comment only.

## Size used
About 2,150 code lines read (limit 2,500). 40 features written (limit 40).
