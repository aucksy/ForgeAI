# B-alerts-panel-screens-2-a checkpoint

## Items
- started 26 Nov 2026: read lens rules, pilot lessons, brief, items list.
- alert paths found (grep): member message reply (gym_reply note, 0069:347), Ask-a-trainer reply (trainer_reply job, 0053:378), Training progress cheer (owner_send_message, MyMembers 169), gym alerts card (Settings 271/575, AlertsCards outside folder), manual WhatsApp: receipt, Today week summary + row link, Members queue, web page share, online journey share.
- Cheer uses gym-wide 2-a-day pop-up count (0042:35-45): new finding 01. Questions intro promises a phone notification every time (askQuestions.ts:124): new finding 02 (refs logic-2-a-01). Cheer hint reuses FN-B-alerts-panel-logic-2-a-01.
- Trainers book/cancel tells the member nothing (no booking kind in 0073:36-38): new finding 03. WOD sends no pop-up (members see it on opening the app; line is accurate). PlusLock, Plans, Money, PassVisits, More, SetupGym, WebPage, OnlineJourney, PayMettleUp, MettleUpReceipt: no automatic alert; WhatsApp only by owner tap.
- L11.1 done: findings 01, 03; reused FN-B-alerts-panel-logic-2-a-03 (owner alerts no quiet hours), FN-B-alerts-panel-screens-1-a-04 (member pop-ups any hour), FN-B-run-panel-screens-2-a-03 (double reply). Done means gone: reply and answer pop-ups use a per-message tag, so no repeat; stale over 6 hours skipped.
- H2.1 done. Reply/answer pop-up: member still in gym, app installed, push address kept, notifications allowed, phone maker rules, under 6 hours. Cheer: same plus member shares workouts (shown on Training progress) and gym under 2 messages that India day (gym-wide count).
- H2.2 done: cheer shows 'Sent' or 'no notification this time' only after sending; replies show 'Reply sent.' with no reach; Messages page sections live in shop (reused logic-1-a-01, screens-1-b-02).
- H2.3 done: 02 (Questions promise), reused logic-2-a-01 (cheer promise).
- H2.4 done (field-fill.csv, Crispy Curves): app members 2, check-in phone 1 of 2, app link 0 of 2, trainer 0 of 2 (so a trainer's Training progress shows nobody); reply and answer pop-ups reach only the sender; PT booking notice reaches 0 (no path); push address count not in field-fill.
- H2.5 done: needs a real-phone check: reply to a Crispy Curves member's message and answer a question with the member's phone (OPPO/Xiaomi/Samsung) locked, battery saver on; look for the pop-up, its sound, and that a tap opens the message page. No watch path here.
- Output: 3 findings + 2 grid rows. lens-cover ok; merge --dry 5 of 5 passed.
