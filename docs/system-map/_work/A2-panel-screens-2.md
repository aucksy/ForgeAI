# A2-panel-screens-2 checkpoint
Status: DONE. 53 of 53 source lines covered, 39 feature rows in docs/system-map/_work/out/A2-panel-screens-2.jsonl.
Code lines read: about 2,200 (limit 2,500).

Finished units (all items ticked):
- [x] 1 read source list (53 lines)
- [x] 2 opened code: MemberMessages, Members, Messages, MettleUpReceipt, Money, More, MyMembers, OnlineJourney, PassVisits, PayMettleUp, Plans, PlusLock, Questions, Receipt, Settings, SetupGym, Today, Trainers, WebPage, WorkoutOfTheDay, WorkoutPlans, useWodServer
- [x] 3 switches and plan gates noted (in each row's "switch")
- [x] 4 grouped into features
- [x] 5 rows written (F-panel-300 to F-panel-342, some numbers unused)
- [x] 6 no not-a-feature lines and no demo-copy lines in this area

Could not check:
- Who may open Trainers and book / cancel / edit (roles "unknown"): the role rule is in auth/permissions.ts and the server, outside this area.
- Free or Pro for most features: only the 'workoutOffer' and 'yourNumbers' gates are visible in these files; the gate list lives in plan/, outside this area.
- Whether server migrations 0050/0051/0053/0060/0063/0065/0069/0070/0080/0090 are applied: no database reads in this step.
- Pass visits roles: only the file header (PassVisits.tsx:3) names the owner; the route's permission was not read.

Seen in passing:
- Trainers.tsx:11 and PayMettleUp.tsx:8 headers say their migrations (0065, 0060) are "NOT APPLIED": either the features are live for no gym or the comments are stale; needs a catalog check.
- Today.tsx:653 builds the WhatsApp link from phoneDigits(member.phone) with no validity check, while Receipt.tsx:65 hides its WhatsApp link when validateE164 fails: a member with a bad number may get a dead "Message" link on Today (possible, not proven).
- Messages.tsx:32 + :62: the front desk opening /messages lands on Workout offer; when the 'workoutOffer' plan gate is off, the desk's page is only a Pro note (worth a journey check).
