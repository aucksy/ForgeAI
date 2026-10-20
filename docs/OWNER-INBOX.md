# Owner inbox — questions and answers, your decisions, the feature backlog

**What this is (owner rule, 18 Oct 2026):** only three things live here:
1. **Questions and answers** between you and me;
2. **your pending decisions** (the table below; answer them on the page);
3. the **feature backlog** and what is already **built**.
Your instructions, requests and feedback go into Claude's own notes (docs/CLAUDE-NOTES.md), not here.

Page: https://claude.ai/artifact/9dAdwmTA8rNXiw5BHX1SJT (private to your account; pin it in the sidebar)

---

## Waiting for your decision (all in one place)

| # | Decision | My pick |
|---|---|---|
| 27 | Paid server plan (Supabase Pro, about ₹2,100 a month): now or in the switch-over week | A: now |
| 28 | Google Play account: personal or organisation | A: personal |
| 29 | Members under 18 in the member app | A: 18+ for the trial |
| 30 | Price after the free 8-week trial | A: ₹1,499 a month or ₹14,999 a year |
| 31 | Lawyer check of privacy notice and agreement: now or before the 2nd gym | A: before the 2nd gym |
| 32 | Register ForgeAI for GST now | A: not now |
| 33 | Your support hours during the trial | A: rush hours, 15 minutes |
| 42 | What to tell the client about locking members' workout history | A: history stays the member's; gym extras stop when the membership ends |

---

## Claude's tasks
What I do myself, cheapest first (owner, 19 Oct: "assign all the tasks you can do to yourself").
On the page: the "Claude's tasks" tab. Status: Done / Doing / To do / Blocked (waits for you).

| Task | Status | Details |
|---|---|---|
| "Claude's tasks" tab on the inbox page | Done | 19 Oct. This list. |
| Breach plan (first hour, 24 h, 72 h) | Done | 19 Oct: docs/launch/BREACH-PLAN.md (launch plan D7). |
| WhatsApp texts for members, Hindi + English | Done | 19 Oct: docs/launch/MEMBER-MESSAGES.md (G5). |
| Desk cheat sheet, Hindi + English | Done | 19 Oct: docs/launch/DESK-CHEAT-SHEET.md (G2); button names checked in the code. |
| Clean old notes that now say wrong things | Done | 19 Oct: admin app README rewritten, old owner to-do list retired (points here), U-A14 note fixed. The CRM phase table stays for later (H5). |
| Privacy notice draft (English + Hindi) | To do | D1; complaints contact waits for #37. Medium. |
| Terms of use draft | To do | D2. Medium. |
| Pilot + data agreement draft | Blocked | D3; needs your answers to #30, #31, #33. Medium. |
| Remove unused permissions and "AI coach" wording | To do | C5; check nothing uses them first. Medium (needs a release). |
| Confirm the app targets Android 16 (API 36) | To do | C4; read it from the built app. Small to medium. |
| Admin app security header + rollback note | To do | A6. Medium (needs a deploy). |
| Re-check the two old open server refusals | To do | H1 (other gyms' shop and messages kept apart). Medium. |
| "New version ready" prompt in the app | To do | C6. Large (code + release). |
| Consent screen when joining a gym; 18+ check | Blocked | D5, D6; needs #29. Large. |
| Gym data export and delete | To do | D8. Large. |
| Crash reports and outage alerts wired in | Blocked | B1, B2; needs your free accounts (#34). Medium. |
| Staging server, backups check, restore drill | Blocked | A2, A3, A5; needs #27 and #34. Medium. |
| GGMS column mapping and trial imports | Blocked | F3, F4; needs the export (#36). Large. |
| Feedback button + automatic sorting | To do | H7; #39 decided: automatic, testers first for 24 h. Large. |
| Play Store listing, data safety answers, internal test | Blocked | C2, C3; needs the Play account (#35). Medium. |

---

## Feature backlog
Every feature, built and pending, in one line each. On the page: the "Feature backlog" tab, with a
Comment box on every feature. Status: Live · Next release (v0.49.0) · Planned · Waiting for you · Idea · Not doing.

### Member app
| Feature | Status | Details |
|---|---|---|
| Workout logging | Live | Log sets of weight and reps, time or distance, with last time's numbers shown beside each set. |
| Set types and effort (RPE) | Live | Mark warm-up, drop and failure sets; one tap on RPE ticks the set and starts the rest. |
| Supersets and exercise notes | Live | Pair exercises into supersets and keep a note on any exercise. |
| Rest timer and rest alerts | Live | A rest timer starts after every set, and "Rest is over" sounds and buzzes on time, even with the screen off. |
| Live workout card in the notification shade | Live | Shows the exercise and next set, with a "Complete set" button, without opening the app. |
| Pause and forgotten-finish | Live | Pause a workout; after an hour with no sets the timer pauses itself and asks before counting that time. |
| Plate calculator, your gym's plates and bars | Live | Shows which plates to load, using only the plates and bars your gym really has. |
| Targets (progressive overload) | Live | Each exercise suggests the next weight and reps from your history, using your weight-jump and rep-range settings. |
| Kg to beat per exercise | Live | Start screen shows "1,125 kg to beat · +15%" and the planned weight × reps for each set. |
| Exercise library and your own exercises | Live | 402 exercises with steps and drawings; add your own and hide the ones you don't use. |
| Moving exercise demo clips | Waiting for you | Our own clip maker has made 2 clips; a paid ready-made set (about $405) needs your OK. |
| Routines and folders | Live | Build routines, group them in folders, and press-and-hold to drag them into order. |
| Ready programs and plan builder | Live | Push Pull Legs, Upper/Lower and Full Body, or a plan built for your equipment and sore joints. |
| Easy weeks | Live | A lighter week every 6 weeks, kept out of records and targets. |
| Up next and Today | Live | The Workout tab opens on the next routine due, ready to start. |
| History, calendar and editing old workouts | Live | See every past workout by day, and edit, rename, repeat or delete one. |
| Records | Live | Heaviest weight, most reps, best set and more, with a pop-up the moment you beat one. |
| Charts and statistics | Live | Weekly charts of kg lifted, reps and time, plus a chart for each exercise. |
| Body map | Live | Shows which muscles you trained in the last 7 days, in a male or female figure. |
| Body weight and measurements | Live | Log body weight, body fat and body measurements, with charts. |
| Progress photos and workout photos | Live | Private photos kept on the phone, with side-by-side compare; up to 4 photos per workout. |
| Monthly report and year in review | Live | A month and year summary with short notes on how you did. |
| Share a picture or text | Live | Share a workout as a picture (post or story size) or as text; body weight is never shown. |
| Weekly goal and milestones | Live | Set workouts per week and celebrate your 10th, 100th and later workouts. |
| Import from Hevy and Strong | Live | Bring in your full workout history and your routines, including from a Hevy share link. |
| Google Drive backup and restore | Live | Back up all your workouts to your own Google Drive and restore them on a new phone. |
| Export to Excel | Live | Save your workouts, and separately your measurements, as a spreadsheet. |
| Kg or pounds, km or miles | Live | Switch units anywhere; your saved numbers never change. |
| Health Connect | Live | Sends your workouts and calories burned to Android's Health Connect. |
| Home-screen widgets and app shortcuts | Live | Today's workout and weekly widgets, and long-press shortcuts to start or resume a workout. |
| Workout reminders | Live | Reminders on the days and times you pick. |
| Watch app (Wear OS) | Live | Rest countdown and buzz on the watch, plus heart rate during a workout. |
| Demo data | Live | An optional 3-month sample history to try the app; never loaded by itself. |
| AI coach chat | Planned | Built earlier but hidden from members until the AI phase is switched on. |
| Food and calorie log | Planned | Built earlier but hidden from members until its own phase. |
| Hindi screens | Idea | Not built; the member app is in English today. |
| Body weight from Health Connect | Idea | Read your weight from other health apps instead of typing it. |

### Admin app (gym owner and staff)
| Feature | Status | Details |
|---|---|---|
| Members and plans | Live | Add members, sell and renew plans, freeze or add extra days, with every plan's history. |
| Payments, dues and receipts | Live | Take full or part payments, see who owes and for how long, and print GST-ready receipts. |
| Money reports and Excel export | Live | Collections by day, method and staff member, with cancelled receipts shown separately. |
| Expenses and profit | Live | Record gym expenses and see profit, including shop sales. |
| Enquiries | Live | Track people who asked about joining until they become members. |
| Attendance register | Live | Check members in at the desk, undo a mistap, catch up on missed days. |
| At-risk members list | Live | A daily list of members who stopped coming, judged against each member's own routine. |
| Renewals list and WhatsApp messages | Live | Ready-typed WhatsApp messages for fees, endings, birthdays, welcome and receipts, sent with one tap. |
| Home screen tiles | Live | Live, expired and expiring members, today's collection and dues, each opening its matching list. |
| "Expiring in 1-3 / 4-7 / 8-15 days" tiles | Live | On the Today screen since 15 Oct: Ending today, in 1-3, 4-7 and 8-15 days; each opens its list. |
| Staff logins and roles | Live | Owner and front-desk logins; staff can give at most 10% off and every receipt shows who took it. |
| Personal training packs | Live | Sell personal training packs with a sessions-used counter and the trainer's name. |
| Member ID card | Live | Print a member card, save it as a picture, or send it on WhatsApp. |
| Import members from Excel | Live | Bring in members and payments from old sheets, with "Undo this import". |
| Gym branding | Live | Upload the gym's logo and colours, which members' apps then use. |
| Gym workout plans | Live | Trainers build or pick a plan, add starting weights, and send it to members or a whole membership plan. |
| Works on phone and computer | Live | One website that installs like an app, with dark and light looks. |
| Offline front desk | Planned | Keep the desk working without internet and send everything once it comes back. |
| Full GST tax invoices | Planned | Proper tax invoices on top of today's payment receipts. |
| Entry machine (turnstile, face or fingerprint) | Planned | Link the gym's own Realtime fingerprint machine if it can block expired members (#40), else a Matrix machine; tripod turnstile is the standard offer, and the client buys it. |
| Face check-in with our own camera | Idea | A tablet at the desk marks a visit by face, using free parts (no door attached); for the door, a real machine is safer (#41). |
| Automatic SMS or WhatsApp reminders | Waiting for you | Reminders sent by themselves cost money per message, so a paid provider needs your OK. |
| Trainer profiles and schedules | Idea | Trainers can already send plans; no trainer profile or schedule screen yet. |
| Webcam photo at the desk | Idea | Take a new member's photo with the desk computer's camera. |
| Body measurements taken by the gym | Idea | Let trainers record measurements; members already log their own. |
| Member progress for the gym | Planned | Owner and trainers see if a member is progressing: first a graph of total kg lifted per workout, shared only with the member's OK. |
| AI assistant for the owner | Idea | Ask questions like "peak hours today?"; reports already show peak hours. |
| Staff and trainer salaries | Not doing | Left out on purpose; small gyms handle pay outside the software. |
| Several branches | Not doing | Left out on purpose for now; our target gyms have one branch. |
| Hinglish in the admin app | Not doing | Removed on your word; the admin app is in plain English. |

### Gym ↔ member links
| Feature | Status | Details |
|---|---|---|
| Join a gym by code or invite link | Live | Members join with the gym's code, a WhatsApp invite link or the QR poster. |
| Join from the welcome screen | Live | "Have a gym code? Join your gym" on the very first screen. |
| Gym's colours and logo in the app | Live | After joining, the app takes on the gym's colours and shows its logo at start-up. |
| Gym logo on the home screen | Live | After joining, add a home-screen shortcut with the gym's logo that opens ForgeAI. |
| QR check-in | Live | Members scan the gym's poster and tap once; the desk sees the check-in and plan status. |
| FitPass and other pass members | Planned | Members who come through FitPass (or a similar pass) and don't pay the gym: join without a plan, get workout plans and the shop, and the owner sees their visits apart from paying members. |
| After check-in, start the workout | Live | "You're in ✓" then offers today's routine, or Push Pull Legs for a member with no routines. |
| QR scan opens the door | Waiting for you | The scan could open a networked door lock, but the client must buy the lock first. |
| Gym shop | Live | Members order supplements and gear in the app and pay at the desk; the gym manages stock and orders. |
| Paying in the app | Idea | Shop orders are paid at the desk today; paying in the app may come later. |
| Gym messages inbox | Live | The gym sends offers and news to members' in-app inbox and sees who read them. |
| Messages in the phone's notification shade | Waiting for you | Needs your Firebase (Google) project set up before messages can pop up on phones. |
| My membership | Live | Members see their plan, end date, days left, personal training used and visits this month. |
| Payments shown in the app | Not doing | Left out on purpose, because the app can't prove who is holding the phone. |
| Gym workout plans in Routines | Live | Plans the trainer sends appear in the member's Workout tab by themselves. |
| First-time starting weight from the trainer | Live | The first workout of a gym plan starts at the trainer's weight, e.g. "start at 20 kg × 8". |
| Busy times by exercise | Planned | With members' OK, show "others also plan this exercise at these hours" to help pick a quieter time. |
| Google login | Planned | Research sign-in with Google first, then come back to you with options. |
| Class booking | Waiting for you | Timetable and spaces left; waits for your gym visit to learn whether gyms run classes. |
| Diet plans from the trainer | Idea | Workout plans came first; diet plans come next if gyms ask for them. |
| Separate app per gym | Not doing | One ForgeAI app for every gym; a separate app per gym is unworkable for small gyms. |

### Platform and quality
| Feature | Status | Details |
|---|---|---|
| Automatic tests on every change | Live | Thousands of checks run on both apps before anything can ship. |
| Cloud phone tests | Live | Every release is tried on a cloud phone set up like yours, in about 2 hours, at no cost. |
| Release gate | Live | A new app version can't be published unless every test, phone run and review is green. |
| Server safety checks | Live | Tests prove one gym can never see another gym's records, on the live server too. |
| Private signing key | Live | The app's signing key is kept only on your PC, never in the public code. |
| Workouts stay on the phone | Live | Workouts never go to our server; the gym only gets check-ins, orders and messages. |
| Works without internet | Live | The member app logs workouts fully offline. |
| Owner inbox page | Live | A private page where you read answers, mark them read and send your picks. |
| Feature backlog with comments | Live | This list in your inbox, with a way to comment on any feature. |
| Play Store release | Planned | Google's pre-launch tests and the Play Store listing are not started yet. |
| Paid server with daily backups | Waiting for you | Supabase Pro: no pausing after a quiet week, daily backups, a restore drill before real data goes in (#27). |
| Test server before live | Planned | A second server where every change is tried before it reaches the gym. |
| Crash and outage alerts | Planned | Crash reports from both apps and a "site is down" alert to your phone, so we hear before the gym calls. |
| Real-phone tests on Google's lab | Waiting for you | Built: Google's robot tries each release on 5 real phones; needs your free setup (#25). |
| "New version ready" in the app | Planned | Members are told when an update is ready. |
| Privacy notice, terms and consent | Planned | Plain-English (and Hindi) notice in both apps, a consent screen when joining a gym, a named complaints contact. |
| Gym data export and delete | Planned | A gym can download all its data in one tap, and have it deleted if it leaves. |
| Feedback by text or voice, sorted and fixed by Claude | Waiting for you | A "Send feedback" button in both apps; Claude sorts it every few hours, adds ideas to this list, fixes bugs through the full tests, and replies to the sender (#39). |
| Launch plan for the client gym | Planned | 8-week trial: gym visit, data move from GGMS, training, side-by-side run, switch-over, go/no-go (docs/LAUNCH-PLAN.md). |

---

## 42. Can the gym lock a member's workout history behind the membership, to keep members? — 20 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**Status:** WAITING FOR YOU
**You asked:** your client thinks he could lock members' workout tracking data behind the membership
(stop paying, lose your history), so that more members stay. Is that legally allowed?
**My answer (not legal advice; the lawyer check in #31 should confirm):** No law says "never" in so
many words. But it is risky, and I would not build it. There is a better way to get the same effect.
- **Privacy law (DPDP Act 2023; its rules were notified in Nov 2025, most duties start in May 2027):**
  the workouts are the member's personal data. Members have a right to see what is held about them,
  to have it corrected or erased, and to withdraw consent. India's act has no explicit "take your
  data with you" right (Europe's does). So locking isn't clearly banned, but holding the data
  back as leverage goes against the spirit of the law, and complaints go to the new Data Protection
  Board.
- **Consumer law is the bigger risk.** Since Nov 2023 the Central Consumer Protection Authority bans
  13 "dark patterns" (tricks in apps). One of them is the "subscription trap": making it impossible
  or hard to stop paying. "Pay, or lose 2 years of your workouts" is very close to that. It would
  count as an unfair trade practice, and a member can file a consumer complaint.
- **It doesn't fit how our app works.** A member's workouts are saved on their own phone. They can
  already back them up to their own Google Drive and export them to Excel (both live today). Locking
  them would mean taking away features members already use and putting their data on our server.
  The first member who loses their history would tell everyone at the gym, and review the app badly.
- **What the leading apps do:** Hevy and Strong lock **extra features** behind paying, never the
  member's own history.
**What works instead, and is fully legal (my recommendation):** the member's own history stays theirs,
always. What the **gym** gives stops when the membership ends:
  - the trainer's workout plans (folders say "No longer sent by the gym", which already works this way),
  - the gym's premium features (the AI coach later, challenges and leaderboards, progress the trainer
    follows),
  - a friendly "Renew to keep your trainer's plan" reminder before expiry.
That gives members a real reason to renew, without holding anything hostage.
**Decide:** What should we tell the client?
- A: The history always stays the member's; gym extras (trainer plans, coach, challenges) stop when the membership ends (recommended)
- B: Lock the history behind the membership anyway (legal and reputation risk; it needs a lawyer's OK first, and members' data moved to our server)

## 41. Could we use free face recognition with a plain camera instead of a machine? — 20 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**Status:** ANSWERED
**You asked:** whether there is a free face-recognition library or algorithm we could use. Then,
instead of a machine, a camera could feed our system, recognise the face and open the door, with no
dependency on a vendor.
**My answer:** It is possible, and free parts that a paid product is allowed to use do exist. But
for the main door I don't recommend it. It costs about the same as a machine and is less safe.
- **Free and allowed:** OpenCV's face finder (YuNet, MIT licence), its face matcher (SFace, Apache
  licence, 99.4% on the standard test), and a "real face or photo?" check (Silent-Face, Apache). All
  three run offline on a small computer. The best-known free one (InsightFace) is **not** allowed in a
  paid product without buying a licence.
- **"No dependency" isn't quite true.** We would still need a camera, a light, a small computer at the
  gym running all day, a switch for the lock, and the lock itself. That is about ₹15,000–25,000 in parts.
  A ready-made face machine costs about ₹17,500–31,000, and the gym already owns a fingerprint machine.
- **The risks:**
  - Someone could hold a member's photo or video up to an ordinary camera. Ready-made face machines
    use special (infrared) cameras that are much harder to fool.
  - At a real door (bad light, caps, sweat, 500 members) it will sometimes refuse real members, and
    that means queues at the desk.
  - Faces are personal data under India's privacy law. We would need consent and safe storage.
  - Every camera, Wi-Fi or power problem at the gym becomes ours to fix.
- **My suggestion:** use a real machine for the door (the RS20 now). Keep the camera as an idea for
  later, where a mistake costs little: a tablet at the desk that marks attendance by face, with no
  door attached. I've added it to the feature backlog as an "Idea". Details for the build:
  `docs/overhaul/research/R-face-camera.md`.

## 40. The client's fingerprint machine is a Realtime: do they sell door locks too, and can it all work together? — 20 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**Status:** WAITING FOR YOU
**Your task:** Call Realtime's technical team when you have time (WhatsApp +91 87438 74334 or +91 87440 94409). The 5 questions to ask are in the "20 Oct, later" answer below.
**Your task:** At the gym, on the RS20: open Menu → Comm (or Network) and look for a "Server", "Cloud" or "Push" setting with an IP or web-address box. Send me a photo of that screen.
**You asked:** your client already has a Realtime fingerprint machine, and Realtime's website offers an
API (a way for other software to connect). Do they also sell door locks, and can the machine, the door
lock and our app all work together smoothly?
**My answer:** Yes, very likely. And it is cheaper than the Matrix machine I suggested before, because
the gym already owns the machine.
- **Door locks: yes.** Realtime sells them on its own website: a magnetic door lock (600 lbs), strike
  locks, rim locks, exit push buttons, and a multi-door access controller. Their dealers also sell
  Realtime tripod turnstiles and flap barriers.
- **Machine + lock work together already.** Many Realtime machines have the door switch built in: the
  lock is wired to the machine, and it opens when a known finger is scanned. A small-gym owner wrote that
  their Realtime RS-10 tracks member visits and blocks members whose membership has run out.
- **Machine + our app: possible, but 3 things must be checked first.** Realtime offers a cloud
  connection (punches go to Realtime's cloud, and we read them with an API key they give out) and
  developer kits. Those prove that **reading visits** works. What their pages do not say is whether
  **our app can block an expired member on the machine**. Without that, the desk still blocks people by
  hand. Also, the PHP kit in your screenshot probably needs a computer at the gym that stays on. I would
  avoid that, because it breaks when the PC is off.
**What I need from you (5 minutes on your next gym visit):**
1. A photo of the sticker on the back of the machine (the model number, e.g. RS-10 or T502).
2. Ask the Realtime dealer these three questions:
   - "Can this model send every punch to our own server over the internet, with no PC at the gym?"
   - "Through your cloud API, can our software add a member, block a member, or set an end date for a
     member?"
   - "Is the API free? Who do we ask for the API key?"
**If all three answers are yes:** we link the gym's existing machine, and we don't buy a new one. The
gym only adds a magnetic lock (roughly ₹1,500–3,000 for the lock plus fitting) or a turnstile later.
Then renewals in the admin app unblock the member on the machine by themselves, and every entry shows
in Visits. If the answer to blocking is no, my suggestion stays the Matrix machine (about ₹17,500–31,000).
I won't build anything before those answers.
**YOUR REPLY (20 Oct):** sent a photo of the machine (it is an **RS20**) and asked: can the machine and
the lock work **offline**, without Realtime's server, with a local setup? Find out what their website
says, and email them for the rest.
**My answer (20 Oct):**
- **The door itself works offline, yes.** The back of the RS20 has the lock connection (the pins marked
  NC / COM / NO) and an exit-button connection (PUSH). A magnetic lock, its power supply and an exit
  button wire straight into the machine. It checks the finger itself and opens the door, with no
  computer and no internet. It holds about 3,000 fingers.
- **The hard part is stopping expired members while offline.** The machine only knows who is enrolled.
  To refuse someone whose membership has ended, either (a) the machine stores an end date for each
  member (the website doesn't say if the RS20 can), or (b) a small computer at the gym (an old laptop or
  a mini PC) tells the machine "block this person" over the gym's Wi-Fi. That computer would get the
  list from our app whenever the internet is up. If the internet is down, the door keeps using the
  last list.
- **Their website** shows locks, wiring diagrams, a PHP kit and a data-transfer tool, but no RS20 manual
  and nothing about end dates. So I **emailed support@realtimebiometrics.com** from your Gmail (you'll
  see it in Sent). I said what you said: you are building a custom member system for a gym that already
  has their RS20 and wants their lock too. I didn't name the gym, and there is no need to hide anything.
  I asked six questions: which lock and how to wire it, offline opening, end dates or blocking, a kit
  for a computer at the gym (and which systems it runs on, any fee), firmware or a newer model, and
  sending entries to our own server.
- **If they don't reply in 2–3 days,** a 5-minute call to 88608 86086 works too.
**YOUR REPLY (20 Oct, later):** Realtime answered and asked for your phone number. You said: tell them an
AI-automated system is building the software, so they should answer by email. Don't push them: at
most one gentle reminder tomorrow, and you'll call them yourself. Also download the connection kit
from their website and see if it answers our questions.
**My answer (20 Oct, later):** The kit answered most of it, and it's good news:
- **The machine talks to the software, not the other way round.** The machine contacts the software
  every few seconds and asks "anything for me?". It also reports each fingerprint entry as it happens.
- **The kit has the exact commands we need:** block or unblock a member, **set a member's start and
  end date on the machine**, open the door from the software, fetch past entries, and set the clock.
- **So the door can work offline.** The machine keeps the member list, the fingerprints and each
  member's end date itself. If the internet is down, paid members still get in, and expired ones are
  refused (if the machine respects end dates; still to confirm).
- **Maybe no computer at the gym at all.** Because the machine is the one that calls out, it may be
  able to call our server over the internet directly. Then renewals in the admin app reach the
  machine by themselves.
- **What's still unknown:** their kit was tested on a newer model (Pro 304F+). Our RS20 is older, so
  it may not have this "call the server" setting, or it may need a firmware update.
**What I did:** replied by email as you said (the software is built by an AI system, so written
answers please, and you'll call too), with only 5 short questions. No phone number given. Tomorrow I
check once: if there's no reply, one gentle reminder, then nothing more. The 5 questions, if you call:
1. Does the RS20 support the same "server" connection as the PHP kit? Where is the server setting in
   its menu? Does it need a firmware update?
2. If we set a member's end date on the RS20, does it refuse them by itself after that date, with no
   internet?
3. Can the server address be a website address, not just a local IP?
4. Which lock, power supply and exit button for a gym's main door with the RS20, and the prices?
5. Any licence fee for the kit?
Everything is documented for the build in `docs/overhaul/research/R-realtime-sdk.md`.

## 39. Is an automatic feedback loop (send feedback, Claude sorts it, fixes it, releases it) in the plan? — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** DECIDED
**You asked:** whether the plan has an end-to-end feedback system: the gym owner or members send
feedback by typing or voice; Claude understands and cleans it, adds real issues and features to the
plan, starts fixing real issues and pushes the releases.
**My answer:** No, not yet. Today feedback reaches us only through you. It can be built, and most of
it can run by itself:
1. **Send:** a "Send feedback" button in the member app and the admin app. Type or speak (Hindi or
   English); it attaches the screen, app version and phone model by itself. Voice is turned into text
   on our side (free speech-to-text).
2. **Sort:** every few hours a scheduled Claude session in the cloud reads the new feedback, cleans
   it, joins duplicates, and sorts it: bug, feature idea, question, or praise.
3. **Record:** bugs go into the findings list; feature ideas go into your feature backlog as "Idea"
   (with my short research, as the rule says); anything only you can decide comes to "Waiting for you".
4. **Fix:** for a bug, Claude writes the fix and the test that proves it, and runs the full release
   gate (thousands of tests, both cloud phones, the cross-role journeys) exactly as today.
5. **Reply:** the sender gets an answer in the app: "Thanks, fixed in v0.49" or "Added to our list".
**Two safety limits I would keep, whatever you pick:**
- Feedback text is written by strangers. It is treated as information, never as orders (someone
  could type "delete all data" or "give me free months"). Anything touching money, privacy, prices
  or the live database still needs your yes.
- Nothing reaches the gym's phones without passing the same tests as now.
**Cost:** speech-to-text free; the scheduled Claude sessions run on your Claude plan (cloud sessions);
about a week of building. Members' feedback with their name is personal data, so it goes in the
privacy notice.
**DECIDED (19 Oct, on the page):** B, fully automatic: if every test passes, it goes to everyone
without you. Your note: "Unless you think it should go thru physical user test."
**YOUR REPLY (19 Oct):** "Unless you think it should go thru physical user test"
**My answer (20 Oct):** Yes, a short real-person check is worth it, and it can still run without you.
Tests catch broken code, but not "this screen is confusing" or "it feels slow on a cheap phone". So
each automatic fix goes first to the testers' group (the gym owner, the desk staff and 2–3 members).
If nobody reports a problem and the app does not crash for 24 hours, it goes to everyone by itself.
If someone reports a problem, it stops and waits for me to look. You never need to tap anything.
Safety-critical fixes (a crash, wrong money, a privacy leak) skip the wait.

## 38. Launch task: sign the pilot and data agreement with the gym owner — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Your task:** When Claude says the draft is ready (it follows your answers to #30, #31 and #33), read it: one pilot agreement with the data agreement inside (dates, success measures, the gym owns its data, export in 7 days and deletion in 30 if they leave, breach notice to the gym in 24 hours, support hours, price after the pilot, it is a beta).
**Your task:** Sign it with the gym owner (2 copies, or both sign a PDF), and send Claude a photo of the signed page.
**Why:** India's data law makes the gym responsible for its members' data and needs a written contract with us (we handle it for the gym). It also stops the trial turning into a free service with no end date. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (D3).

## 37. Launch task: name the complaints contact for members — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Your task:** Tell Claude one name and one email address that members can write to about their data (it can be you and a new address such as privacy.forgeai@gmail.com; one you will check weekly).
**Why:** India's data law requires a named contact on the website and in the app, with an answer within 90 days. Claude puts it into the privacy notice and both apps. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (D4).

## 36. Launch task: the gym visit and the GGMS export — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Your task:** Visit the gym with the one-page question sheet (about 45 minutes): https://github.com/aucksy/ForgeAI/blob/main/docs/launch/GYM-VISIT.md
**Your task:** Ask the desk to export from GGMS whatever it can (members, plans, dues, payment history, attendance; Excel best) and get a copy, plus photos of 2 receipts.
**Your task:** Send Claude the answers (typed, voice note text, or photos of your notes) and the export files.
**Why:** everything after this depends on it: the data move, the training plan, whether the desk needs the offline mode, FitPass, receipts with GST. We have never asked the gym these questions. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (F1, F2).

## 35. Launch task: open the Google Play developer account ($25 once) — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Your task:** After you answer #28: go to https://play.google.com/console/signup and make the account type you picked. It needs your government ID, a card in your name and an Android phone. Pay the $25 once.
**Your task:** Tell Claude "Play account ready". Claude then prepares the store listing, the data safety answers and the internal test for you to submit.
**Why:** members get updates by themselves from the Play Store; the GitHub download link will be blocked by Google for unregistered apps from 2027. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (C1-C3).

## 34. Launch task: accounts and safety switches only you can turn on — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Your task:** If you say yes in #27: in Supabase (https://supabase.com/dashboard), open the project → Billing → upgrade the organisation to Pro. Leave "Spend cap" ON.
**Your task:** In Supabase, create a second, free project named `forgeai-staging`, region Mumbai (Claude fills it with the same tables, for testing changes before they reach the gym).
**Your task:** Turn on two-step sign-in (an authenticator app) on Supabase, GitHub, Cloudflare and your Google account.
**Your task:** Make a free Sentry account (https://sentry.io/signup) and a free Better Stack account (https://betterstack.com/users/sign-up); then tell Claude. Claude wires crash reports into both apps and sets the "site is down" alerts to your phone.
**Your task:** Check that your 2 offline copies of the app's signing key still open (the folder from docs/RELEASE-SIGNING.md). If that key is lost, every member must reinstall and loses their data.
**Why:** today the server pauses after a quiet week, has no backups, and nobody hears about a crash or an outage until the gym calls. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (A1-A7, B1-B2).

## 33. Launch decision: your support hours during the trial — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Decide:** When will you answer the gym's WhatsApp support group during the 8-week trial?
- A: Gym rush hours (about 6-10 am and 5-9 pm) on gym days: payment problems answered within 15 minutes, everything else the same day (recommended)
- B: Evenings only, within 2 hours; the desk uses paper or GGMS for anything urgent
**Why it matters:** this promise goes into the pilot agreement (#38). A desk that cannot take a payment and gets no answer is the most common reason a gym gives up on new software. Claude watches the alerts all day; you are the human the gym talks to.

## 32. Launch decision: should ForgeAI register for GST now? — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Decide:** Register ForgeAI for GST now?
- A: Not now: registration is required only above ₹20 lakh a year; gyms cannot claim back GST since Sep 2025, so our 18% GST would be a straight extra cost to the gym (recommended)
- B: Register now (needed only if you want to bill GST from day one, for example as a company)
**Why it matters:** it changes the price the gym pays by 18%. Check with your accountant before the second or third gym. The gym's own receipts already use 5% GST and number by financial year.

## 31. Launch decision: lawyer check of the privacy notice and the agreement — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Decide:** Who checks the privacy notice, the terms and the gym agreement before real members use the app?
- A: For this one-gym trial: Claude drafts them from India's data law and standard SaaS terms, you read them; a lawyer checks them before the second gym (recommended)
- B: A lawyer checks them now, before the trial (paid; ask for a quote first)
**Why it matters:** the law (DPDP) applies in full from May 2027; penalties are large, but the risk in a one-gym, 8-week trial with a signed agreement is low. Legal wording is your decision.

## 30. Launch decision: the price after the trial — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Decide:** What does the gym pay after a free 8-week trial? (It goes into the agreement before the trial starts.)
- A: ₹1,499 a month, or ₹14,999 a year (about GGMS's price, with the member app included) (recommended)
- B: A first-client price of ₹999 a month for the first year, in return for a testimonial and feedback
**Why it matters:** small Indian gyms pay ₹1,000-3,500 a month for software; GGMS costs them about ₹12,000 a year. Writing the price down now means the trial ends with a decision, not a negotiation. Our running cost: about ₹2,100 a month (server).

## 29. Launch decision: members under 18 — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Decide:** How do we handle members under 18 in the member app?
- A: For the trial, the member app is for 18 and over (it asks the birth year when joining a gym); the desk still records younger members in the admin app as the gym's own records (recommended)
- B: Build a parent-consent step now (a parent confirms with their own phone)
**Why it matters:** India's data law needs a parent's verified consent for anyone under 18, and bans tracking them. A builds in a day; B takes about a week and slows joining for everyone.

## 28. Launch decision: which Google Play account — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Decide:** Which kind of Google Play developer account?
- A: Personal account ($25 once, ready in days). Before going public, the app needs 12 testers using it for 14 days in a row: the gym's members can be those testers (recommended)
- B: Organisation account: no 12-tester rule, but needs a registered company and a free D-U-N-S number (can take up to 30 days)
**Why it matters:** the Play Store gives members automatic updates and keeps the app installable after Google's 2027 rule against unregistered downloads. You can move to an organisation account later when you form a company.

## 27. Launch decision: paid server plan (Supabase Pro, about ₹2,100 a month) — 19 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Decide:** When do we move the live server to the paid plan (Supabase Pro, $25 a month, about ₹2,100)?
- A: Now, before the gym's real data goes in (recommended)
- B: In the switch-over week
**Why it matters:** the free plan pauses after 7 quiet days (the app and the admin app stop working until someone wakes it) and keeps no backups we can restore. With the gym's real data, one bad day without a backup could lose their records. A means real data is safe from the first import.

## 26. Try v0.48.0 on your phone with one real workout — 18 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Your task:** Install v0.48.0 on your phone: https://github.com/aucksy/ForgeAI/releases/download/v0.48.0/forgeai-v0.48.0.apk
**Your task:** Do one real workout with it, and tell me anything that looks or feels wrong (a screenshot helps).
**Why:** every automatic test passed, but you are the first real person in a real gym on this
version (new: gym workout plans, kg to beat per exercise, My membership, check-in offers the workout).

## 25. Set up Google Test Lab (free, about 10 minutes) — 18 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** WAITING FOR YOU
**Your task:** Follow the 5 short steps in `docs/uat/TEST-LAB-SETUP.md` (on GitHub: https://github.com/aucksy/ForgeAI/blob/main/docs/uat/TEST-LAB-SETUP.md): make a free Firebase project `forgeai-testlab`, turn on 2 services, make a key, and add `TEST_LAB_PROJECT` and `TEST_LAB_KEY` to the GitHub secrets.
**Your task:** Then tap "I have done it" here (or tell me "Test Lab is set up").
**Why:** after that, every release is tried by Google's robot on 5 real phones (Samsung, Xiaomi,
vivo, OPPO, OnePlus or Pixel) and 2 virtual ones, free. Only you can make the project and the key.
Then I run the first test on v0.48.0 and tell you what it found.

## 24. Is Google Test Lab free, and will it use many tokens? — 18 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** ANSWERED
**READ (18 Oct, 09:53 pm, via the page)**
**You asked:** whether testing on Google's test lab (Firebase Test Lab) is free, and whether the
work is token heavy.
**My answer:** Free for what we need.
- Free plan: 15 test runs a day, 5 on real phones and 10 on virtual phones. No card needed.
- Paid plan only above that: about $5 an hour on a real phone, $1 an hour on a virtual one, after
  a free 30 minutes (real) and 60 minutes (virtual) every day.
- The Play Store's pre-launch report is also free: Google tries the app on several real phones
  every time we upload a build to a test track.
- What it can do: an automatic "crawler" taps through the app on real Samsung, Xiaomi, Pixel
  phones and reports crashes, screens that look broken, and slow starts. It cannot run our own
  scripted tests (those run on our cloud phone already).
- Tokens: light. The tests run on Google's machines, not on me. Setting it up once is a normal
  small task; after that I only read a short result per release.
- One thing only you can do: create the free Firebase project and give the cloud build a key to
  start the tests (about 10 minutes; I write the steps). Nothing is paid.

## 23. Does the audit also cover all possible UAT scenarios? — 16 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** DONE
**READ (16 Oct, answered in chat)**
**You asked:** whether the audit covers every UAT scenario (UAT = checking each real user can do
their real tasks).
**My answer:** No. The audit hunts for bugs area by area: full workouts at your phone's size, Do Not
Disturb, screen-off rests, 12,000 random taps, every money and server rule. Gaps were: bad or no
internet, updating over an old version with data, whole business stories across member, desk and
owner, a workout past midnight, the admin app on a real phone with the real server, and no written
list of stories per role ticked off each release. I recommended a written UAT list per role, each
marked "automatic" or "owner check", tests for the gaps, and a short report every release.
**DECIDED (16 Oct, in chat):** "research and plan a full coverage professional UAT". Done: the UAT
plan and its work packages (docs/uat/), now part of every release.

## 22. What is this: Camera "No" was not logged? — 16 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** ANSWERED
**READ (16 Oct, answered in chat)**
**You asked:** what the audit line "Camera No was not logged" meant.
**My answer:** I first described it wrongly. When a member taps the camera button in a workout for
the first time, Android asks to allow the camera. If they tapped "Don't allow", the app said
"Couldn't add the photo. Please try again." (retrying never helps) and logged it as an error,
though saying no is a normal choice. Now it says "Camera not allowed" with an "Open settings"
button, like progress photos, and logs it as a normal note. Found by the 12,000 random taps.
Shipped in v0.46.0.

## 21. What is this concept of receipts that were taken back? — 16 Oct 2026
**Chat:** PC chat (desktop app), 10-18 Oct: audit, UAT, releases
**Status:** DONE
**READ (16 Oct, answered in chat)**
**You asked:** what "receipts that were taken back" means.
**My answer:** It is how the admin app fixes a payment saved by mistake. A receipt is never deleted
or changed. The owner marks it as not counting and types a reason (for example "saved twice"). It
stays in the list marked cancelled, its money leaves the day's total and goes back onto what the
member owes (so the app asks first), its number is never used again, and a print says "CANCELLED".
Only the owner can do it. The question was the button's name: "Void receipt" or "Cancel receipt".
**DECIDED (16 Oct, in chat):** "Cancel receipt". It is live in the admin app.

## 20. Which GGMS features have we built that we didn't have, and which are pending? — 18 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**Status:** ANSWERED
**READ (18 Oct, 02:25 pm, via the page)**
**You asked:** what we built from GGMS's list that we didn't have, and what is still pending.
**My answer:**
**Built (from the GGMS gap list):**
1. **Member sees their plan in the app** ("My membership"): plan name, end date, days left, "renew
   at the desk" in the last week, the next plan, personal training used, days at the gym this
   month. Server live; members get it in v0.48.0. On purpose, no payments (the app can't prove who
   is holding the phone).
2. **Workout plans from the gym or trainer**: trainers build or pick a ready plan, add starting
   weights, send to members or a whole membership plan; it appears in the member's app by itself.
   Server and admin app live; members get it in v0.48.0.
3. **Trainers can do this from their own staff login** (a first piece of GGMS's "trainer section").
Already had before: members, plans, renewals, dues, receipts, expenses, enquiries, reports, staff
roles, QR check-in, member ID card, shop with stock, WhatsApp messages typed for you.
**Pending:**
| Feature | Where it stands |
|---|---|
| Entry machine / turnstile (fingerprint, face, open door from the phone) | Planned (P8); the tripod turnstile is the standard pick (#2) |
| Automatic reminders (expiry, birthday, renewal) by SMS / WhatsApp | Not built: today the owner taps to send ready-typed WhatsApp messages. Costs money per message, so it needs your OK on a provider |
| "Expiring in 1-3 / 4-7 / 8-15 days" on the home screen | Built (correction, 18 Oct): live since 15 Oct as the Today tiles "Ending today / in 1-3 / 4-7 / 8-15 days"; each opens its list. A new test checks the day edges |
| Class booking (timetable, spaces left) | Waits for your gym visit: "Do you run group classes?" |
| Diet plans from the trainer | Not built (workout plans first; diet is next if gyms ask) |
| Trainer profiles and schedules | Partly (trainers send plans); no schedule screen yet |
| Staff / trainer salaries | Left out on purpose (small gyms pay staff outside the software) |
| Several branches | Left out on purpose for now (our gyms have one branch) |
| Webcam member photo at the desk | Not built (small) |
| Body measurements taken by the gym | Not built (members log their own) |
| AI assistant for the owner ("peak hours today?") | Later; the reports already show peak hours |
| Admin app fully offline | Decided (#7), build queued |
| Member's payments in the app | Left out on purpose (privacy, see #6) |

---

## 15. An owner-inbox "mod" in Claude, one page per chat, on the right-hand side — 17 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**You asked:** with the new Claude "mods" feature, can we build a mod for the owner inbox, where I
pick the chat I'm working on and each chat has its own page, ideally shown on the right-hand side?
**Status:** BUILT (A)
**READ (17 Oct, answered in chat)**
**My answer:** "Mods" are real (Claude Code, early Oct 2026). A mod can open its own panel; in the
desktop app it docks beside the chat when the window is wide enough. But (official docs):
- **Mods draw only in the terminal, the desktop app's Code tab and VS Code.** In cloud sessions
  (claude.ai/code on the web and the mobile app, where you are now) a mod's panel never draws, and
  plugins a repo declares are not installed there. The mobile docs don't mention mods at all.
- So a mod would only help on your PC, not in the chats you follow on your phone.
- A mod can read the session id, so "one page per chat" is possible there. Whether that id matches
  the chat in the app isn't documented.

**What works everywhere today: a private page in your Claude account (an "Artifact").**
- One page, "Owner inbox": the open-decisions table on top, then every entry. Each entry is tagged
  with the chat it came from, and a chat picker at the top shows one chat's entries.
- It opens in the app on your phone and on the web, and you can pin it to your sidebar. I update it
  every time I update the inbox file. Private unless you share it.
- In this app, a file I send with "show" opens in the side panel. So I can also pop the inbox open
  on the right after each answer.

**Options:**
- **A (recommended):** the private "Owner inbox" page with a chat picker, kept up to date by me,
  plus the file in the repo as the backup. Small job, works on phone + web now.
- **B (later, PC only):** a desktop mod that shows the inbox in a side panel next to the chat.
  More work, and invisible in cloud/mobile chats.
**Needs you:** A, B, or both?
**DECIDED (17 Oct):** A. Built: https://claude.ai/artifact/9dAdwmTA8rNXiw5BHX1SJT
**Sources:** code.claude.com docs: plugins/mods overview, interface, reference; cloud-environments;
mobile. Press: The New Stack and XDA on the mods launch.

## 14. What would it cost on GitHub to make the phone test runs faster? — 17 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**You asked:** the cost of making the cloud test runs faster.
**Status:** BUILT, first split runs in progress (decided: split, free)
**READ (18 Oct, 08:43 am, via the page)**
**My answer:**
- **Today it costs ₹0.** The repo is public, so GitHub's normal test machines are free and
  unlimited. A whole phone run took 3 h 04 min (run 38984599010; GitHub billed 0 minutes).
- **Paying for bigger machines buys less than it sounds:**
  - GitHub's paid "larger runners" only work for an **organisation** on the Team plan (about $4 per
    user a month). The repo is under your personal account today, so it would have to move.
  - Rough prices (third-party sites quoting GitHub, June 2026; not confirmed on GitHub's own page):
    Linux 8-core about $0.022/min, 16-core about $0.042/min. One site says larger runners are billed
    even on public repos.
  - Free public-repo machines already have 4 cores. An 8-core machine doubles that at most. A lot of
    a phone run is real waiting (rest timers, app start-ups, "wait 30 s"), which no machine shortens.
    My estimate: maybe 20–40% faster, not 4x.
  - Estimated cost on 8-core: about $2–3 per whole run. A release needs about 4 runs (both phones,
    journeys, conditions), so about $10 a release. A busy fixing day like today (~30 runs) is
    about $30–40.
- **Better, free option: split each whole run into 4 smaller runs at the same time.** Free machines
  can run up to 20 jobs at once. Each part group runs on its own machine, so a whole run would
  take about 45–60 min instead of 3 h. It costs ₹0 but takes me about half a day of work. The
  release gate must learn to accept "all 4 pieces green", and parts that rely on earlier parts
  (e.g. J needs B–I) must stay in the same piece.
**Needs you:** split the runs for free (my pick), pay for bigger machines, or leave it as is?
**Follow-up — you asked: "any problems in splitting the runs?"** Yes, six, all manageable:
1. **Many parts lean on the parts before them.** Parts A to I build up one workout history that J, R,
   the gym parts and others use. That chain can't be cut, so the longest chain sets the floor. The
   UAT parts (UH to UK) each start fresh, so they split off easily. Honest estimate: about
   60–75 min, not 45, until I measure each part's time from a real run.
2. **Each piece builds the app again** (a Gradle build takes many minutes). Fix: build once, then
   hand the same app file to all pieces. This also guarantees every piece tests the exact same app.
3. **The release gate gets more complex.** It must demand ALL pieces green, from the same run and
   the same commit, on both phones. A mistake here could let an untested build ship. This needs its
   own tests and a review.
4. **Hidden links between parts we don't know about yet.** The first split runs may fail for reasons
   that aren't app bugs (like today's J/J2 partial run). Plan: run split and whole side by side twice
   and compare before the split one becomes the release gate.
5. **More phones at once = more chances that one emulator has a hiccup.** Plus side: only that piece
   is re-run, not 3 hours.
6. **The evidence is spread over 4 downloads** (screenshots, logs, crash scan). The report must merge
   them so the UAT report and coverage numbers stay right.
Also: the free plan runs up to 20 jobs at once. 2 phones × 4 pieces + journeys = 9, which fits, but
other runs started at the same time will queue.
**Work:** about a day (not half a day) with the side-by-side check. ₹0 running cost.
**DECIDED (17 Oct):** split the runs. Research the best way so build/test quality stays top notch, and use it from the next runs.
**BUILT (17 Oct, commit b8b9890), first split runs started:**
- The app is built ONCE and every piece tests that exact same file (a fingerprint check).
- 4 pieces run at the same time: (1) the core workout history, (2) routines, history, gym and
  backup, (3) and (4) the newer one-screen checks and the real workout. Tests that depend on each
  other stay in the same piece.
- A final step proves all 4 finished green AND that together they ran every test of the full run.
  A test added later but left out of every piece fails a check, so it can't silently stop running.
- The release check needed no change: a run only counts as green if every piece is green.
- Expected at first: about 1 h 20 min per full run (see the first-run result below: about 2 h).
- Validation: the first split runs are compared with the old-style runs on the same app.
**First split runs (17 Oct):** 3 of 4 pieces passed on both phones, and a whole run took ~1 h 20 min.
The 4th piece failed from part J on: J needs the demo already removed by an earlier test, so J..R
can't start from scratch. Regrouped on that evidence (commit 52e8f43): the long chain stays together,
so **a whole run now takes about 2 h instead of 3 h 30 min**, still ₹0. Re-run in progress.

## 13. "Which machines are free when": suggest a schedule with less waiting — 17 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**You asked:** every member logs their workouts, so we know which machines are used on which day
and hour. Show members when machines are free, and suggest moving their schedule so they're more
likely to get a free machine.
**Status:** DECIDED (18 Oct) — build queued
**READ (18 Oct, via the page)**
**My answer:** A good idea, and the machine-level part would be rare. But it can't be built the
way described today, for four reasons:
1. **Workouts never leave the member's phone.** That is a promise in the app today ("Private.
   They stay on this phone"). The server only gets check-ins, shop orders and messages. Each member
   would have to agree to share "which exercise, what time" (no weights, no names).
2. **A log says the exercise, not the machine.** "Bench press" could be any of 4 benches. The gym
   would have to enter its equipment (e.g. 4 benches, 2 squat racks, 1 cable tower), and we'd turn
   that into "how likely one is free".
3. **Only members who log count.** If 40 of 300 members use the app, the picture is thin and
   skewed. That's fine for "busy vs quiet hour", but weak for "is the squat rack free on Tuesday at 7".
4. **It needs weeks of data per gym** before any advice is right. Wrong advice ("go at 6, it's
   free" when it isn't) costs trust fast.

What the market does (research): the mainstream feature is **how busy the whole gym is**, not each
machine. PureGym's app shows live busyness and how busy it will be. Planet Fitness has a "Crowd
Meter". Google Maps shows "Popular times". I found no mainstream app that shows individual
machines; only student prototypes with sensors on the machines. So the machine part would make us
stand out, but nobody has proven members want it.

**Two options:**
- **A (recommended first): "Best times to go" for the whole gym, from QR check-ins.** The server
  already has every check-in with its time. No new permission, no privacy change. Member app: "Your
  usual time (Tue 7 pm) is the busiest. Thu 7 pm is usually 40% quieter." The admin app already
  shows peak hours to the owner. Works once the gym uses QR check-in for a few weeks.
- **B (later, if A is used): machine-level advice.** Opt-in sharing of exercise + time, plus the
  gym's equipment list. "Squat racks are usually all taken Mon 6–8 pm; Wed 6 pm you're likely
  to get one." Build only after A shows members care, and a gym has enough members logging.
**Needs you:** A first then maybe B (my pick), B straight away, or keep it parked?
**Sources:** PureGym help centre (live busyness tracker); PureGym blog (when is the gym quiet);
Notre Dame senior design "GyEEm" (machine sensors, prototype); Planet Fitness Crowd Meter (blog,
low-quality source).
**DECIDED (18 Oct, via the page):** B — build the exercise-level advice now. Your note: no gym
equipment list needed. Show "other members also plan this exercise between these hours" from the
exercises in their routines/logs; members judge for themselves from how much equipment their gym has.
Open point for me to design: members must agree to share their exercise times (they stay on the
phone today) — opt-in, no weights or names.

## 12. QR code at the entry gate instead of a fingerprint machine — 17 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**You asked:** members open our app and scan a QR at the gate to get in. That marks attendance,
then nudges them to start their workout; with no saved routines, give them a research-based
Push Pull Legs plan. Don't build yet; does it work, and how?
**Status:** STEP 1 BUILT, NOT RELEASED (next release, v0.48.0)
**My answer:** Yes, it works, and gym apps abroad already do it (PerfectGym, GymMaster; BETA and
ButaGYM use a QR that changes every few seconds). Most of it already exists in our app:
- the gym's QR poster already opens ForgeAI on "Check in": one tap marks attendance and checks
  the membership;
- a ready Push Pull Legs plan already exists (plus Upper/Lower and Full Body).

Missing, in two steps:
- **Step 1 (app only, no hardware):** after check-in, "You're in ✓ — Start Push day"; for a
  member with no routines, "Add Push Pull Legs".
- **Step 2 (the door):** the scan tells our server to open a networked door lock for a few
  seconds. This needs hardware at the gate. Wi-Fi door kits are roughly USD 95–360 abroad (not an
  Indian price; get an installer's quote). Many cheap kits can't be opened by our server, so pick
  one that can; ask Matrix (local in Jaipur) first.

Risks: a forwarded photo of the QR (fix: a QR that changes every 30 s on a small screen at the
gate, or open only near the gym); no internet means nobody gets in (keep the desk button and a
keypad PIN); fire safety (lock must open on power loss, plus an exit button).
**Needs you:** build Step 1 now? Step 2 waits until the client agrees to buy a lock.
**Details:** `docs/overhaul/research/R-qr-entry.md`
**DECIDED (18 Oct, via the page):** A — build Step 1 now (after check-in: "Start <today's routine>",
or "Add Push Pull Legs" for no routines). The door (Step 2) waits until the client buys a lock.
**BUILT (18 Oct), Step 1:** after "You're in ✓" the check-in screen now offers the next step: "Start
Push" (today's routine, the same one the Workout tab shows), "Back to your workout" if one is open, or
"Add Push Pull Legs" for a member with no routines (opens the plan, where they choose to follow it or
just keep it). Nothing extra once today's workout is done. Comes in the next release.

## 7. Offline mode: can the gym use the admin app without internet? — 16 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**Status:** DECIDED (18 Oct) — build queued
**READ (18 Oct, via the page)**
**My answer:** Partly. A gym kept "in this browser only" works offline but lives on one device.
An online gym: if the internet drops, the desk can still SEE members and dues, but can't save
(add member, take payment, check in). A payment cut off mid-save is resent once the internet is back,
never twice. Opening or refreshing the app with no internet: it won't open. The member phone app
works fully offline for workouts. The planned entry machine would keep letting paid members in.
**Needs you:** 1) build "offline front desk" (saved copy on the desk device; offline check-ins
and payments queued and sent once each when back online), recommended; or 2) leave it.
**DECIDED (18 Oct, via the page):** A — build the offline front desk. Your note: not only the
installed admin app but also the website in Chrome on a desktop. Detect when there is no internet;
keep the whole CRM working, save changes and sync when the internet is back. Anything that cannot
work offline is greyed out/disabled, and a persistent "Offline mode" banner tells staff only some
things work.

## 6. GGMS member app: what members get there — 16 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**Status:** DONE (server live 18 Oct; member app in v0.48.0)
**READ (18 Oct, 02:02 pm, via the page)**
**My answer:** GGMS is one app for owners and members ("I'm Member" tick at login). Members see
their plan end date, payments and attendance, book classes, check in by QR, get reminders and
the gym's diet/workout plans. No workout logging or progress, where we are far ahead. Gaps for us
(members): own plan end date / payments / attendance in the app; class booking; trainer-sent
diet and workout plans; gym-recorded body measurements.
**Details:** `docs/overhaul/research/R-ggms-competitor.md`
**YOUR REPLY (18 Oct, 08:44 am, via the page):** "You should build the useful features from the list."
**My answer:** agreed. Here is the list ranked by how much members would use it:
1. **"My membership" in the member app** (most useful, medium job): plan name, end date and days
   left, payments made, and check-ins this month, with a reminder before it ends. This is the
   question gym desks get most ("when does mine expire?"). The server already has it all (the
   gym's plans, payments and check-ins, matched by the member's mobile number, like check-in does).
   Needs one small read-only server addition, which goes live only after your yes (like 0021/0022).
2. **Workout plans from the gym or trainer** (useful, bigger job): the trainer picks or builds a
   routine in the admin app and sends it; it appears in the member's Routines, ready to start. A
   good fit, since we are already the best workout logger. Needs a new admin app page too.
3. **Class booking** (only if the gym runs classes): timetable, spaces left, book and cancel. Big
   job. Waits for your gym visit: "Do you run group classes? How full are they?" is on the list.
4. **Body measurements taken by the gym** (small value): members already log their own in the app.
5. **Member photo by webcam** (admin app, small): at the desk when a member joins.
6. **AI assistant for the owner** ("peak hours today?"): later; the reports already show this.
**DECIDED (18 Oct, my call under your rule #18):** "My membership" first (members ask the desk
about their end date more than anything), then the gym's workout plans. Class booking after your
gym visit. Tell me if you want a different order.
**BUILT (18 Oct):** "My membership" at the top of the gym's Shop and in Settings → Your gym: plan
name, "Ends 30 Oct · 12 days left", "Renew at the desk" in the last week (unless the next plan is
already paid), the next plan, personal training used ("3 of 12 used, with Ravi"), days at the gym
this month. Works offline with the last copy. On purpose, **no money is shown**: the app only knows
a member by the number typed at check-in, which nobody verifies. A review also found that someone
could type another member's number and see their plan, so the plan now shows only when the first
name given in the app matches the gym's list, and never for a number two members share (a parent
and child): those members are asked to see the desk. Tested on a copy of the database (12 checks).
**Needs you:** it reads one new server function (0023), which only reads, never changes anything.
Until it is turned on, the card simply doesn't show. 0021 (receipt rules) and 0022 (why a staff
sign-in stopped) are waiting too; all three are applied from your PC.
**DECIDED (18 Oct, in chat):** "Yes": apply 0021, 0022 and 0023 on the live server from the PC
(the cloud session has no live access). The paste-in prompt for Claude on the PC is in chat and in
docs/uat/HANDOFF.md ("PC must do").
**DONE (18 Oct, from your PC):** 0021, 0022 and 0023 are live, no errors. All 13 database test files
passed on the live server (including "one gym can never see another gym's records": 66 of 66 blocked).
Members see "My membership" once they have the next app release (v0.48.0).
**Workout plans (item 2):** built; see #19 for how the trainer side works.
**DECIDED (18 Oct, in chat):** "yeah of course - lets switch it on": apply 0024 on the live server
from the PC, run its checks, then put up the new admin app (in that order). The paste-in steps
for Claude on the PC are in chat and in docs/uat/HANDOFF.md ("PC must do").
**DONE (18 Oct, from your PC):** 0024 is live, no errors; its checks all passed on the live server
(including "one gym can never see another gym's records"), and the new admin app is up. Trainers
can send plans now; members see them once they have the next app release (v0.48.0).

## 4. GGMS (the client's current CRM): features and prices — 16 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**Status:** ANSWERED
**My answer:** GGMS (Gayatri Software, Jaipur, since 2017, claims 1,000+ gyms). Offline Plan from
₹11,999/year (no member app); Online Plan from ₹14,999/year (with app). These are starting prices
from listing sites; GGMS doesn't publish prices. Ask the client what they really pay. Owner gaps
for us: entry machine (planned P8), automatic SMS/email reminders, an AI business chat, "expiring
soon" split by days, class booking, trainer section, staff salaries, several branches, webcam
photo, birthday wishes. Their users complain about bugs, so reliability is a point we can win on.
**Details:** `docs/overhaul/research/R-ggms-competitor.md`

## 2. Matrix's connection kit: does it really work? Top 3 at different prices — 16 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**Status:** DECIDED (my call, 18 Oct)
**My answer:** Yes. Matrix's own guide covers everything we need: the machine connects to our
server by itself (no PC at the gym); add/remove members; block an expired member by itself even
when offline; face/finger sign-up; every entry sent to us with a reason; open-door commands; no
licence fee mentioned. To confirm with the dealer in writing: the exact model supports "Third Party
Server", their latest guide, and one real machine to test.
1. Budget smart door (face reader + magnetic lock): about ₹25,000–40,000.
2. Tripod turnstile: about ₹80,000–1.6 lakh. **My pick as the standard offer.**
3. Flap barrier: about ₹2.5–4 lakh+.
(Online prices outside Jaipur, before GST and fitting.)
**Details:** `docs/overhaul/research/R-entry-machines.md`
**DECIDED (18 Oct, my call under your rule #18):** offer the tripod turnstile (about ₹80,000–1.6
lakh) as standard, the budget smart door for small gyms, and the flap barrier only on request. The
client still decides what to buy; nothing is bought by us. Tell me if you want a different default.

## 1. Physical entry / attendance machines in Jaipur that connect to our CRM — 16 Oct 2026
**Chat:** Cloud session, 17 Oct (UAT + ideas) — https://claude.ai/code/session_015MTY1WJLpZDueLpknLVLR2
**Status:** ANSWERED
**READ (18 Oct, 08:45 am, via the page)**
**My answer:** No brand has its own Jaipur office; all sell through local dealers. Two options
connect: Matrix COSEC (Indian, official connection kit, gym case study; recommended) and
ZKTeco/eSSL (cheaper, "push" to our server, more for us to build).
**Details:** `docs/overhaul/research/R-entry-machines.md`
