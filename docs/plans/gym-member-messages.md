# Message your gym (member app) and Member messages (admin app)

## In plain English

**What the owner asked (12 Nov 2026):** "Do we have an option in the app for user to send queries or feedback for
the gym from inside the gym section? And does the admin app has a place for them to know these questions and
respond? If not, we gotta build it."

**What existed:** only "Ask a trainer" (R-319): ONE training question to ONE trainer, one reply, no back and forth,
and the front desk cannot see it. Nothing for a question to the gym itself ("Is the gym open on Diwali?"), feedback
("Please add a second squat rack") or a complaint ("The AC in the cardio room is broken"). Our own "Help and
feedback" button goes to the MettleUp team, not to the gym.

**What we build:**
- Member app, Gym tab -> My gym: a row "Message your gym". The member picks Question, Feedback or Complaint, types
  up to 1,000 letters and sends. Feedback can be sent without their name. The gym's replies show in a simple
  conversation under each message; the member can write back. A red count shows on the row and on the Gym tab when
  the gym replied and the member has not read it yet, and the phone shows a notification (when "Messages from my
  gym" is on). The member also sees "Seen by your gym" before a reply comes, so a message never feels ignored.
- Admin app: a new page "Member messages" in the menu, with a count of messages waiting for a reply. Filter by
  Question / Feedback / Complaint and Waiting / Done. Reply, and "Mark as done" (a member's new message opens it
  again).
- Who sees what: the owner sees everything. The front desk and trainers see Questions and Feedback, NOT
  Complaints: a complaint is often about a staff member, so it goes to the owner only (my pick; easy to change).
  Feedback sent without a name shows as "A member (name hidden)" to everyone at the gym, including the owner.
- Safe until switched on: everything waits for one new database update (migration 0069). Until the owner says yes
  and it is applied, the row, the page and the menu item simply do not show. Nothing broken, nothing half-shown.

**Research (12 Nov 2026), and how ours is better:** gym CRMs sold in India (FitnessForce, Wellyx, Zenoti) sell a
member app but advertise bookings and payments, not a member-to-gym inbox; Zenoti now answers member questions with
an AI assistant. What members complain about, again and again (Trustpilot reviews of gym chains, industry guides
from Glofox, Smart Health Clubs, Zonka): feedback goes into a box and nobody answers; "customer service unresponsive
when dealing with ignored complaints". The guides agree the fix is closing the loop: the member must SEE that the
gym read it and what it did. So:
1. "Seen by your gym" and "Done" on each message, plus the reply in the same place: the member knows it was read.
2. Anonymous feedback that can still be answered: the gym replies without ever learning who wrote it.
3. Complaints go to the owner only, so a member can complain about staff without the staff reading it first.
Later (F200, top plan): an AI draft reply from the gym's own details, checked by the desk before sending.

## How it works (for the next person reading the code)

### Server: `supabase/migrations/0069_member_messages.sql` (NOT applied live; waits for the owner's yes)
Two tables, row security on, no grants (only the functions below touch them):
- `gym_talk_threads`: one per message the member starts. gym, member, list id (null when sent without a name),
  kind question / feedback / complaint, anonymous (feedback only, checked by the table), created_at, last_at,
  last_from member / gym, member_seen_at, gym_seen_at, done_at, done_by_name.
- `gym_talk_messages`: the lines of a thread: from_gym, staff id and name (gym side), body (1..1000), created_at.

Member functions (member key; BAD_KEY for a member who left):
- `member_talk_list(key)` -> {ok, unread, threads:[...]} the last 20 threads, at most 50 lines each; marks the gym's
  replies read. Staff names are first names only.
- `member_talk_unread(key)` -> {ok, unread}: threads with a gym reply the member has not read (the red count).
- `member_talk_send(key, kind, anonymous, text)` -> {ok, thread}. INVALID, ANON_FEEDBACK_ONLY, TOO_MANY (5 new
  messages and 20 lines in 24 hours), SUSPENDED.
- `member_talk_reply(key, thread, text)` -> {ok, thread}. NOT_FOUND, THREAD_FULL (50 lines), TOO_MANY. A reply to
  a done thread opens it again.

Gym functions (owner key or a signed-in person's key):
- `owner_talk_list(key)` -> {ok, role, waiting, threads:[...]} the last 90 days, at most 200; marks the member's
  newest message seen ("Seen by your gym"). Owner: every thread. Staff: questions and feedback only.
  Anonymous threads never carry the member's name, phone, app id or list id.
- `owner_talk_count(key)` -> {ok, waiting}: open threads whose last line is the member's (the menu count).
- `owner_talk_reply(key, thread, text)` -> {ok, thread}; writes a phone notification (0054's member_push_notes,
  kind gym_reply, opens /shop/message). NOT_FOUND, INVALID, THREAD_FULL, SUSPENDED.
- `owner_talk_done(key, thread, done)` -> {ok, thread}: mark done or open again.

Kept 180 days after the last line, then deleted on the next read; deleted at once when the member leaves the gym.
A paused (suspended) gym refuses new lines. Test: `supabase/tests/0069_member_messages.sql` (CI applies every
migration to a throw-away database and runs it).

### Member app (Android and iPhone: shared code, nothing native)
- `src/shop/gymTalk.ts` pure: types, readers, words (TALK_WORDS), unread count, row line.
- `src/shop/gymTalkSync.ts` the calls; remembers "the server has no 0069" for the run and then hides everything.
  The red count lives in a small store, asked when the Gym tab opens, when the app starts and when it comes back
  (at most every 5 minutes).
- `src/shop/GymTalkRow.tsx` the Gym tab row; `src/shop/GymTalkScreen.tsx` the page (`/shop/message`).
- The Gym tab's badge adds the unread replies to the gym's unread news.
- QA builds only (`qaStandIns` 'gymTalk'): while the server has no 0069, the page runs on a pretend gym kept in the
  phone, says so on screen ("Test build: ..."), and `mettleup://qa-gym-talk?reply=1` adds a pretend reply, so the
  cloud phone test can see every screen before the owner's yes. Store builds never carry it.

### Admin app
- `src/crm/logic/memberMessages.ts` pure: readers, filters, words (MEMBER_MESSAGE_WORDS), errors.
- `src/crm/shop/memberMessagesApi.ts` the calls ("missing" remembered, like Questions).
- `src/crm/ui/screens/MemberMessages.tsx` the page `/member-messages`; `src/crm/ui/MemberMessageParts.tsx` the
  menu count (hidden until 0069 answers).
- What's new: an ADMIN_NEWS_PENDING line; it moves to ADMIN_NEWS at the deploy after 0069 is live.

### Privacy
The privacy notice already says the gym sees what a member sends to it in the app? It does not name these messages.
Draft line for the owner's yes (with the migration): "Messages you send to your gym from the Gym tab (questions,
feedback, complaints) and the gym's replies are kept for 180 days after the last message, and deleted when you leave
the gym. Feedback you send without your name is shown to the gym without your name." (legal words: his yes first).

### R-549 (14 Nov 2026): one row and one page for the gym and the trainers
The owner (option A): one "Message your gym" row; its first question is who the message is for. "The gym" is this
plan's Question / Feedback / Complaint (0069); "A trainer" is "Ask about your workout" (0053), shown only to a member on
a running paid plan (R-505). Feedback and Complaint never go to a trainer. One list of everything sent and every reply,
newest first; one red count from both. Both servers, the owner panel and the trainer inboxes are unchanged. The old
addresses stay: /shop/message opens "The gym", /shop/ask opens "A trainer". Rules: apps/mobile/src/shop/gymMessages.ts.
