# A5-panel-demo-1 checkpoint

Output: docs/system-map/_work/out/A5-panel-demo-1.jsonl (103 rows: 45 journeys, 57 type lines, 1 finding). All 8 features done.

F-panel-108: 6 journeys, 7 type lines
F-panel-109: 5 journeys, 7 type lines
F-panel-110: 6 journeys, 7 type lines
F-panel-111: 6 journeys, 7 type lines
F-panel-112: 6 journeys, 7 type lines
F-panel-113: 6 journeys, 7 type lines
F-panel-114: 5 journeys, 8 type lines (one is the type 2 "no" line)
F-panel-115: 5 journeys, 7 type lines

## Entities
- The demo keeps everything in the page's memory and reads or writes no stored data, so every journey has empty
  "writes" and "reads". No entity fits a made-up, in-memory row.
- On type lines, "entity" names the real-gym twin of the made-up row (for example E-gym-talk-messages), so the
  template sentence reads sensibly. It is not a claim that the demo touches that table.

## Roles
- The feature rows have one role, prospect. The demo has two kinds of sign-in: owner (default) and front desk
  (/demo?as=desk, DemoApp.tsx:37). The desk kind is written as type 2 or type 3 journeys of the prospect.

## Finding
- FN-A5-panel-demo-1-01 (S3): front desk demo, Member messages badge counts the complaint the desk cannot see
  (demoServer.ts:495-498, seeds 175-178): badge 3, list 2.

## Seen in passing (not sure, not findings)
1. demoServer.ts:486-492: answering a question has no owner or trainer check, while the list (483-485) refuses the
   desk. Not reachable from the screen, since the desk never gets the list.
2. demoServer.ts:499-506: a reply to a conversation already marked done leaves it done; the screen's words say a
   done conversation moves back only when the member writes. Real server's rule not read.
3. demoServer.ts:499-506: no "conversation is full" (50 lines) refusal and no empty-text refusal in the pretend
   server; only the screen's greyed button guards these.
4. demoServer.ts:35-41: times are built with the device's local clock (`at`) and named `ist`; the screens show
   India time. On a device outside India the seeded times shift. Also the AC complaint is seeded "today 8:40 am",
   which is in the future when the demo is opened earlier in the morning.
5. demoServer.ts:526-531: taking back a message with an unknown id answers as a success.
6. demoServer.ts:519-525: every send adds a row; a new message never gets "No phone pop-up" (quiet is always
   false), whatever the one-offer-a-day rule would say in a real gym.
7. ui/TrainerParts.tsx:7 and ui/QuestionParts.tsx:9 still say these pieces are hidden "in the demo gym"; since
   R-540 the demo session is online, so they show. Comment only.
8. Questions.tsx:210 and MemberMessages.tsx:328-332: the reply buttons are marked as needing internet. The demo
   needs no internet; whether they grey out offline in the demo was not checked.
9. Demo success words ("Sent to N members in the app.", "Reply sent.", "Saved. Members' phones pick this up...")
   are the real gym's words; only the top strip says nothing is sent.

## Could not check
- Nothing was driven in a browser: every "user_sees" is from code reading. Exact words for a demo refusal on each
  screen (how each screen turns DEMO_REFUSED into words) were read only as the shared sentence in lib/demoLock.ts:21.
- Not read: demo/demoTraining.ts (the weekly figures), ui/ProgressView.tsx, the Today "Needs you" lines, the desk's
  view of the send form in MessagesSection, OffersSection give / take-back buttons beyond their confirm words.
- No promise found for the strip's own sentence "Demo gym: made-up data. Nothing you do here is saved."
  (demoMode.tsx:38); only P-A7-panel-1-49 covers the demo.
- Tests: none opened, so every journey has coverage "unknown".
