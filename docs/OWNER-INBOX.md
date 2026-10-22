# Project Tracker (was "Owner inbox") — questions and answers, your decisions, tasks, the feature backlog

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
| 30 | Price after the free 8-week trial | A: ₹1,499 a month or ₹14,999 a year |
| 32 | Register ForgeAI for GST now | A: not now |
| 33 | Your support hours during the trial | A: rush hours, 15 minutes |
| 41 | Price for an owner with 2 or more branches | A: per branch, no member limit, lower price from the 2nd branch |
| 43 | How members sign in: Google, or a phone code | A: Google, the desk confirms each member once |
| 44 | New brand name (domains free today) | A: Repghar |

---

## Claude's tasks
What I do myself, in the order I do them (re-prioritised 21 Oct: safety and legal before real
members, then what the trial needs, then marketing; owner, 21 Oct: "you can decide the sequence").
On the page: the "Claude's tasks" tab. Status: Done / Doing / To do / Blocked (waits for you).

| Task | Status | Details |
|---|---|---|
| 1. Re-check the two old open server refusals | Done | 21 Oct: both (U-A4, U-G3) already covered by the server test suites, which passed on the LIVE server 18 Oct: 438 permission checks (66 cross-gym attempts all refused) + 66 shop-order checks. Closed in FINDINGS (H1). |
| 2. "I agree" + 18+ check + privacy link when joining a gym | Done | 21 Oct: one tick box above Join on the Shop tab and the invite-link screen ("I'm 18 or older, and I agree to ForgeAI's terms and privacy notice", links to both); wrong codes are still told first; 13 phone-test steps tick it (qa/sub-agree.yaml); 3021 tests + typecheck green. Pages privacy.html + terms.html built by scripts/legal_pages.py; they go live with the admin deploy once #37 fills the contact. Ships in v0.49.0 (D5, D6). |
| 3. "New version ready" prompt in the app | Done | 21 Oct: a card on the Workout tab when a newer release exists ("Get it" / "Later"); checks at most every 6 hours. The release now stops if its number differs from the app's own (review find). Ships in v0.49.0 (C6). |
| 4. Next release (v0.49.0) with 2 + 3 + microphone removed | Done | 21 Oct: released. The phone tests caught a real bug coming back (no tab bar after resuming a workout from the app-icon shortcut) and it was fixed before release. APK: https://github.com/aucksy/ForgeAI/releases/download/v0.49.0/forgeai-v0.49.0.apk |
| 5. Admin app security header + rollback note | Done | 21 Oct: live. The admin app runs only its own scripts and talks only to the gym server; every admin journey runs under that rule (J29). Rollback = one command, written in the admin README (A6). |
| 6. Feedback button + automatic sorting | Done | 21 Oct: More → Send feedback in the admin app (live) and Settings → Send feedback in the member app (v0.49.0). Kept in Cloudflare's free database, not the gym server; no name or number; 20 a day per phone. How Claude sorts it: docs/launch/FEEDBACK.md. The twice-a-day schedule starts with trial week 3 (H7). |
| 7. Gym data export and delete | Done | 21 Oct, live: Settings → Your data → "Download all your gym's data" (Excel, one sheet per record type, + full copy). Online gyms: "Delete our gym from ForgeAI" sends a request; the real delete is a checked step with your yes each time (docs/launch/GYM-DELETE.md) (D8). |
| 8. Landing page + lead form + /app sign-in + "Get started" checklist | Done | 22 Oct, live on your yes (#40): https://forgeai.aakashpahuja.in/home/ with the demo form; "Get started" list live since 21 Oct. Changed from the plan: the page sits at /home/ and the admin app keeps its address (no move behind /app). Later: an email to you for each new request, once the contact email is set (#37). |
| 9. Keep access logs for 1 year | Blocked | Needs either Supabase's paid log export or a live database change, both your call; due before May 2027. Plan in CLAUDE-NOTES R-49. Medium. |
| 10. Night build (21 Oct, you asleep): backlog features | Done | 22 Oct: v0.50.0 released (https://github.com/aucksy/ForgeAI/releases/download/v0.50.0/forgeai-v0.50.0.apk): "Machine in use", rest change moves the running timer, "Save as routine" after a first free workout, automatic Google Drive backup, "What's new" (shows from v0.51). Admin app: quick buttons on Today (live). Two reviews; one real backup risk caught and fixed before release. |
| 11. v0.51.0: workout time on the notification card, rest-over sound choice, "What's new" with earlier updates, block-proof address | Doing | 22 Oct: built, two independent reviews (one must-fix found and fixed before anything went live), 3,070 tests green; both cloud phones and the journeys are running now. Found on the way: Drive backup hidden until your Google setup (#42). |
| 12. Research you asked for: Google login, new brand name | Done | 22 Oct: two ways to sign in (#43) and 5 names with free domains (#44), for your pick. |
| 13. Block-proof server address | Done | 22 Oct: live for the admin app (forgeai.aakashpahuja.in/sb); the member app gets it with v0.51.0. If our address ever fails, both apps switch to Supabase's own for 10 minutes by themselves, and never send a payment or check-in twice. |
| 14. Full GST tax invoices (admin app) | Done | 22 Oct, live: a gym with a GST number now prints a "Tax invoice" with the place of supply (its state), "Reverse charge: No" and a signature line. Not done: the paying company's own GST number (needs a live database change, your yes). |
| 15. Offline front desk (admin app) | Doing | 22 Oct: step 1 live (opens and shows everything without internet). Step 2 built and tested (desk check-ins kept offline and sent later, with their real time); goes live with the next admin deploy. Step 3 (payments offline) waits for your gym visit: needed only if the desk's internet really drops, and it carries money risk. |
| 16. Landing page: dedicated animated sections (your note, 22 Oct) | Doing | Built and design-reviewed: workout + new record, the shop order, free notices to every member, the lock screen with a watch. Goes live right after v0.51.0 is released (it shows v0.51.0 features). |
| 17. Missing-muscle suggestions (your note, 22 Oct) | Doing | Research running; the build follows the release. |
| 18. Trainer view of member progress; reps to beat (your notes, 22 Oct) | To do | After 17. The trainer view needs a live server change (your yes). |
| Pilot + data agreement | Blocked | D3: needs your answers to #30 (price) and #33 (support hours). Medium. |
| Crash reports and outage alerts wired in | Blocked | B1, B2: needs your free Sentry + Better Stack accounts (#34). Medium. |
| Staging server, backups check, restore drill | Blocked | A2, A3, A5: needs #27 (paid server) and #34. Medium. |
| GGMS column mapping and trial imports | Blocked | F3, F4: needs the GGMS export (#36). Large. |
| Play Store listing, data safety answers, internal test | Blocked | C2, C3: needs the Play account (#35). Medium. |
| In-app "Delete my data" for members | Blocked | "Leave gym" already erases the phone number; a full erase needs a new server rule = a LIVE database change (your yes). Until then by email. |
| "Claude's tasks" tab on the tracker page | Done | 19 Oct. This list. |
| Breach plan (first hour, 24 h, 72 h) | Done | 19 Oct: docs/launch/BREACH-PLAN.md (D7). |
| WhatsApp texts for members, Hindi + English | Done | 19 Oct: docs/launch/MEMBER-MESSAGES.md (G5). |
| Desk cheat sheet, Hindi + English | Done | 19 Oct: docs/launch/DESK-CHEAT-SHEET.md (G2); button names checked in the code. |
| Clean old notes that now say wrong things | Done | 19 Oct: admin README, old owner to-do list retired, U-A14 fixed (H5). |
| Confirm the app targets Android 16 (API 36) | Done | 20 Oct: targetSdk 36, minSdk 24 (C4). |
| Privacy notice (English + Hindi) | Done | 20 Oct FINAL after an independent legal check: docs/launch/PRIVACY-NOTICE.md (+ gym notice), PRIVACY-NOTICE-HI.md. Blanks: your name + email (#37) (D1). |
| Terms of use | Done | 20 Oct FINAL: docs/launch/TERMS.md (members + staff) (D2). |
| Remove the unused microphone permission | Done | 20 Oct in the code + approved-permissions list; reaches phones with task 4 (C5). |
---

## Feature backlog
Every feature, built and pending, in one line each; every feature not built yet also says how it will
work (owner, 22 Oct). On the page: the "Feature backlog" tab, with a Comment box on every feature. Status: Live · Next release (v0.49.0) · Planned · Waiting for you · Idea · Not doing.

### Member app
| Feature | Status | Details | How it will work |
|---|---|---|---|
| Workout logging | Live | Log sets of weight and reps, time or distance, with last time's numbers shown beside each set. |
| Set types and effort (RPE) | Live | Mark warm-up, drop and failure sets; one tap on RPE ticks the set and starts the rest. |
| Supersets and exercise notes | Live | Pair exercises into supersets and keep a note on any exercise. |
| Rest timer and rest alerts | Live | A rest timer starts after every set, and "Rest is over" sounds and buzzes on time, even with the screen off. |
| Live workout card in the notification shade | Live | Shows the exercise and next set, with a "Complete set" button, without opening the app. |
| Workout time on the notification card | Next release | v0.51.0: the live workout card's header shows how long the workout has run ("ForgeAI · Workout · 42:15"), ticking with the app closed; it stands still while the workout is paused. |
| Pick your rest-over sound | Next release | v0.51.0: Settings → Workouts → Rest-over sound: ForgeAI chime (default), Bell, Double beep or Whistle; tap one to hear it. The same sound with the app open and with the screen off. Vibrate only = Workout sounds off. |
| Changing the rest time also changes the running timer | Live | If a rest timer is running and you change that exercise's rest from 2:30 to 3:00, the 30 seconds are added to the running timer too. |
| "Machine in use" screen during rest | Live | One tap during rest shows a big "In use, back in 1:32" banner with the live timer, so others know the machine is taken while you walk around. |
| Save a free workout as a routine | Live | If you have no routines and start an empty workout, finishing it offers "Save these exercises as a routine". |
| "What's new" after each update | Live | The first time the app opens after an update, a short card says in plain words what changed. v0.51.0 adds "See earlier updates" (the 7 before it) and Settings → What's new (owner, 22 Oct). |
| Pause and forgotten-finish | Live | Pause a workout; after an hour with no sets the timer pauses itself and asks before counting that time. |
| Plate calculator, your gym's plates and bars | Live | Shows which plates to load, using only the plates and bars your gym really has. |
| Targets (progressive overload) | Live | Each exercise suggests the next weight and reps from your history, using your weight-jump and rep-range settings. |
| Kg to beat per exercise | Live | Start screen shows "1,125 kg to beat · +15%" and the planned weight × reps for each set. |
| Exercise library and your own exercises | Live | 402 exercises with steps and drawings; add your own and hide the ones you don't use. |
| Moving exercise demo clips | Waiting for you | Our own clip maker has made 2 clips; a paid ready-made set (about $405) needs your OK. | Each exercise page shows a short looping clip at the top: a grey 3D figure doing the move, with the worked muscles in red. A clip downloads the first time you open that exercise, then works offline. The 402 clips come from our own clip maker (free, made in batches) or the ready-made set (about $405, your yes). |
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
| Google Drive backup and restore | Waiting for you | Built, but hidden in the app until your one-time free Google setup (#42). | After #42: Settings → Backup shows "Back up to Google Drive"; the member signs in with Google once and backs up; on a new phone the same page offers "Restore". |
| Automatic workout backup | Waiting for you | Built in v0.50.0; it starts working once Drive backup is switched on (#42). | Once a member has linked Drive and backed up once on this phone, the app backs up by itself when they leave the finish screen, and the Workout tab warns after 3 days without a backup. |
| Export to Excel | Live | Save your workouts, and separately your measurements, as a spreadsheet. |
| Kg or pounds, km or miles | Live | Switch units anywhere; your saved numbers never change. |
| Health Connect | Live | Sends your workouts and calories burned to Android's Health Connect. |
| Home-screen widgets and app shortcuts | Live | Today's workout and weekly widgets, and long-press shortcuts to start or resume a workout. |
| Workout reminders | Live | Reminders on the days and times you pick. |
| Watch app (Wear OS) | Live | Rest countdown and buzz on the watch, plus heart rate during a workout. |
| Demo data | Live | An optional 3-month sample history to try the app; never loaded by itself. |
| Reps to beat for rep-only exercises | Planned | On the next-workout card and the exercise list, exercises without weight (push-ups, pull-ups, dips) show reps to beat, like weighted ones show kg to beat (owner, 22 Oct). | Where the app works out "kg to beat" today, a rep-only exercise instead adds up last time's reps: "45 reps to beat · +3", and each set's plan says the reps to beat for that set ("set 1: beat 15"). Timed exercises (plank) keep their time words. A new record shows when the total is beaten. |
| Missing-muscle suggestions | Planned | Spots muscles a member's routines leave out (for example no rear-shoulder or calf work all week) and suggests one exercise to add, gently, so it never feels like too much (owner, 22 Oct; built after the current batch). | Research comes first (every muscle group and how much weekly work each needs). The app already knows which muscles each of the 402 exercises works, so it checks the whole WEEK of routines, not one day (a push day is meant to skip the back). Where a group gets little or no work, the routine editor shows one quiet line with one exercise to add, for example "Your week has no rear-shoulder work: add Face Pull?" with Add or Not now. One suggestion at a time, never during a workout, and "Not now" is remembered. Then we trim it together. |
| AI coach chat | Planned | Built earlier but hidden from members until the AI phase is switched on. | A Coach tab where members ask in plain words ("why is my bench stuck?", "make me a 3-day plan"). It reads only the member's own history on the phone and can build a routine for them. It runs on a paid AI service, so before it goes on you decide who pays (for example, a premium add-on for the gym). |
| Food and calorie log | Planned | Built earlier but hidden from members until its own phase. | Members log meals with calories and protein, by typing or by telling the coach. Home shows two rings: today's calories and protein against the member's target. Everything stays on the phone, like workouts. |
| Hindi screens | Idea | Not built; the member app is in English today. | Settings gets a language choice, English or हिन्दी, and the app starts in the phone's language. Every button and message gets a Hindi version. Exercise names stay in English, because Indian gyms use the English names. |
| Body weight from Health Connect | Idea | Read your weight from other health apps instead of typing it. | With one permission, weigh-ins from a smart scale or another health app appear in Body weight by themselves, marked "From Health Connect". If you also typed a weight that day, your typed one wins. |
| Paid plan for people without a gym | Idea | The app is free, with every feature, for members of a gym on ForgeAI. People who train without a gym (or whose gym is not on ForgeAI) could pay for it themselves. To explore. | Without a gym code, a person gets a free trial, then a monthly or yearly plan paid through Google Play. Joining a gym on ForgeAI makes everything free again. You set the price; Google keeps 15% of each payment. |

### Admin app (gym owner and staff)
| Feature | Status | Details | How it will work |
|---|---|---|---|
| Quick action buttons on the dashboard | Live | Big icon buttons at the top of the dashboard (e.g. New member, Take payment, Check-in) that the owner can choose and reorder. |
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
| Offline front desk | Planned | Step 1 live 22 Oct: the admin app opens and shows everything without internet, with an "Offline mode" bar; saving waits for the internet. | Step 2: check-ins made offline are kept on the device and sent once the internet is back. Step 3: payments and new members offline, with a receipt-number series of their own per desk (a tax invoice's number must never change after it is printed). |
| Full GST tax invoices | Live | 22 Oct: a GST-registered gym's receipt is a tax invoice (GST number, service code, CGST + SGST, place of supply, reverse charge No, signature line). The paying company's own GST number waits for a live database change. |
| Entry machine (turnstile, face or fingerprint) | Planned | Matrix machine linked to us, blocking expired members; tripod turnstile is the standard offer, and the client buys it. | The gym buys the machine; it talks to our server over the internet. A new member added in the admin app goes to the machine by itself and the desk scans the finger or face once; an expired or frozen member is blocked even when the internet is down, and a renewal unblocks them at once. Every entry becomes a check-in in the attendance register, and the desk gets an "Open door" button. |
| Automatic SMS or WhatsApp reminders | Waiting for you | Reminders sent by themselves cost money per message, so a paid provider needs your OK. | The owner picks which reminders go out by themselves (plan ends in 3 days, fee due, birthday) and at what time. They go through a paid WhatsApp business provider under the gym's name, about ₹0.13 a message (about ₹200 a month for 500 members). The admin app lists every message sent and any that failed. |
| Trainer profiles and schedules | Idea | Trainers can already send plans; no trainer profile or schedule screen yet. | Each trainer gets a page: photo, what they teach, working hours, their personal-training members and sessions left. A weekly calendar shows the booked personal-training slots, so the desk can book a member with a free trainer. |
| AI import of a gym's old records | Planned | You confirmed it (22 Oct): gym owners bring their old member list and payments without your help, whatever the format. Research first; the answer is in the tracker. | The owner uploads what they have (Excel, CSV, a PDF or photos of a register). AI reads it and shows each column matched to ours, with any new kind of information kept as an extra field for that gym. The owner checks a preview, fixes anything wrong, and imports; one tap undoes the whole import. |
| Webcam photo at the desk | Idea | Take a new member's photo with the desk computer's camera. | On "New member", a "Take photo" button opens the desk computer's camera in the browser. The photo saves to the member and shows on the ID card and at check-in, so staff know who is who. |
| Body measurements taken by the gym | Idea | Let trainers record measurements; members already log their own. | Trainers record weight, body fat and measurements (waist, chest, arms) on the member's page, with dates and a chart. With the member's OK, the numbers also show in the member's own app beside the ones they log. |
| Trainer view of member progress | Planned | Trainers (their own login) and the owner see whether each member is progressing, so trainers can push them on and the gym can sell personal training with real numbers (owner 18 Oct, widened 22 Oct; built after the current batch). | Research comes first (Trainerize, TrueCoach, Hevy Coach). In the app the member turns on "Share my progress with my gym" (off until they choose; they see exactly what is shared and can turn it off). Shared: workout days, total kg lifted per workout, the best set on main lifts and new records; never body weight or photos. A trainer's "My members" shows each one going up, flat, down or stopped coming, flags a lift stuck for 3 weeks, and has one-tap WhatsApp praise or a nudge. The owner gets a list of members who are stalling and not on personal training (a sales list), and a monthly progress report a trainer can send a PT client. Needs a live server change (your yes). |
| AI assistant for the owner | Idea | Ask questions like "peak hours today?"; reports already show peak hours. | A question box in the admin app: "Who hasn't paid this month?", "Busiest hour this week?". It reads only this gym's records, answers in a sentence with the list, and never changes anything. Each question costs a little on a paid AI service, so it needs your yes on cost. |
| Staff and trainer salaries | Not doing | Left out on purpose; small gyms handle pay outside the software. | Not planned: small gyms pay staff outside the software. If you change your mind, the first step would be staff attendance from the entry machine. |
| Several branches | Planned | One owner runs 2 or more branches from one sign-in (owner, 22 Oct: even small gyms sometimes have 2). Pricing waits for your pick (#41). | The owner signs in once and switches branch at the top of the admin app. Each branch keeps its own members, plans, desk staff, receipt numbers, QR poster and shop stock; the owner also sees money and member reports for all branches together. A plan can allow a member into every branch, and check-in works at whichever branch they visit. Needs a live server change (your yes). |
| Hinglish in the admin app | Not doing | Removed on your word; the admin app is in plain English. | Not planned: the admin app stays in plain English. The desk cheat sheet is in Hindi and English. |

### Gym ↔ member links
| Feature | Status | Details | How it will work |
|---|---|---|---|
| Join a gym by code or invite link | Live | Members join with the gym's code, a WhatsApp invite link or the QR poster. |
| Join from the welcome screen | Live | "Have a gym code? Join your gym" on the very first screen. |
| Gym's colours and logo in the app | Live | After joining, the app takes on the gym's colours and shows its logo at start-up. |
| Gym logo on the home screen | Live | After joining, add a home-screen shortcut with the gym's logo that opens ForgeAI. |
| QR check-in | Live | Members scan the gym's poster and tap once; the desk sees the check-in and plan status. |
| Member data export by the gym, on request | Planned | When a member asks, the owner exports that member's workout history from the admin app as a readable report in our own format (not an import file for Hevy, Strong or other apps). | Catch: workouts live on the member's phone, not on our server. So I see it like this: the desk taps "Request workout report"; the member's app asks "Send your report to the gym?"; on yes, the phone makes a readable PDF or Excel report in our own layout (not a file Hevy or Strong can import) and the desk downloads it. Members can already save their own Excel today; whether that stays is your call. |
| A member's own history from before joining a gym | Waiting for you | Someone who used ForgeAI on their own and then joins a gym: their earlier workouts stay theirs, never tied to the membership. Rules to work out with you (export, leaving, what the gym sees). | Workouts logged before the join date stay the member's alone: the gym never sees them, even if the member shares progress. Leaving the gym keeps every workout on the phone; only the gym's plans stop updating. Still to settle with you: the exact cut-off, and what a gym export may include. |
| FitPass and other pass members | Planned | Members who come through FitPass (or a similar pass) and don't pay the gym: join without a plan, get workout plans and the shop, and the owner sees their visits apart from paying members. | The desk adds the person as a "Pass member" (FitPass, cultpass and so on): no plan, no dues, never on the renewal list. They join in the app with the gym code and get the gym's plans, shop and messages. Each check-in counts as a pass visit, and a monthly count per pass company lets the owner match that company's payment. Needs a live server change (your yes). |
| After check-in, start the workout | Live | "You're in ✓" then offers today's routine, or Push Pull Legs for a member with no routines. |
| QR scan opens the door | Waiting for you | The scan could open a networked door lock, but the client must buy the lock first. | The member scans the gate QR; our server checks the plan is active and tells a networked door lock to open for a few seconds. The QR on a small gate screen changes every 30 seconds, so a forwarded photo does not work. The desk button and a keypad PIN still work when the internet is down, and the lock opens on power loss (fire safety). |
| Gym shop | Live | Members order supplements and gear in the app and pay at the desk; the gym manages stock and orders. |
| Paying in the app | Idea | Shop orders are paid at the desk today; paying in the app may come later. | Members pay for shop orders, and later renewals, by UPI inside the app through a payment company (for example Razorpay). The money goes straight to the gym's bank account, and the desk sees "Paid online". The payment company keeps a small fee per payment (up to about 2%). |
| Gym messages inbox | Live | The gym sends offers and news to members' in-app inbox and sees who read them. |
| Messages in the phone's notification shade | Waiting for you | Needs your Firebase (Google) project set up before messages can pop up on phones. | When the gym sends a message, it also pops up on members' phones like a WhatsApp message; a tap opens it in the app's inbox. It uses Google's free Firebase messaging: you make the Firebase project once, and a live server change (your yes) lets the server remember each phone. Members can turn it off in Settings. |
| My membership | Live | Members see their plan, end date, days left, personal training used and visits this month. |
| Payments shown in the app | Not doing | Left out on purpose, because the app can't prove who is holding the phone. | Not planned: the app knows a member only by a typed phone number, so it can't prove who holds the phone. Members see their plan and end date in "My membership"; receipts go by WhatsApp from the desk. |
| Gym workout plans in Routines | Live | Plans the trainer sends appear in the member's Workout tab by themselves. |
| First-time starting weight from the trainer | Live | The first workout of a gym plan starts at the trainer's weight, e.g. "start at 20 kg × 8". |
| Busy times by exercise | Planned | With members' OK, show "others also plan this exercise at these hours" to help pick a quieter time. | Members choose to share "which exercise, at what hour" (no weights, no names; off until they agree). On an exercise or a routine, the app then shows "Other members also plan this between 6 and 8 pm", and members judge for themselves. It needs a few weeks of shared data before it shows anything, and a live server change (your yes). |
| Google login | Waiting for you | Research done: two ways to pick from (#43). | Your pick in #43 decides it. My pick: an optional "Continue with Google" on the first screen, with "Join with your gym code" and "Use without an account" below; the desk confirms each member once, so My membership can later show payments. |
| Class booking | Waiting for you | Timetable and spaces left; waits for your gym visit to learn whether gyms run classes. | The owner sets a weekly timetable: class, trainer, time, spaces. Members see it in the app, book or cancel with one tap, and join a waiting list when a class is full. The desk sees each class's list. Waits for your gym visit to learn if the gym runs classes. |
| Diet plans from the trainer | Idea | Workout plans came first; diet plans come next if gyms ask for them. | Like workout plans: the trainer builds a simple day plan (meals, times, a protein target) or picks a ready one, and sends it to a member or a whole membership plan. It shows in the member's app to read; the member can't change it. |
| Separate app per gym | Not doing | One ForgeAI app for every gym; a separate app per gym is unworkable for small gyms. | Not planned: one ForgeAI app takes on each gym's colours and logo, and the home-screen shortcut shows the gym's logo. |

### Platform and quality
| Feature | Status | Details | How it will work |
|---|---|---|---|
| New brand name with a free domain | Waiting for you | Research done: 136 names checked, 5 with .com, .in and .app free at the normal price; your pick (#44). | You pick a name and buy its .com and .in the same day (about ₹1,700-3,100 a year); then a trademark check, then I rename the app, the website and the store listing. |
| Block-proof server address | Next release | Live for the admin app since 22 Oct; the member app gets it in v0.51.0. A block of Supabase's own address (as in Feb 2026) can no longer stop the apps. |
| Automatic tests on every change | Live | Thousands of checks run on both apps before anything can ship. |
| Cloud phone tests | Live | Every release is tried on a cloud phone set up like yours, in about 2 hours, at no cost. |
| Release gate | Live | A new app version can't be published unless every test, phone run and review is green. |
| Server safety checks | Live | Tests prove one gym can never see another gym's records, on the live server too. |
| Private signing key | Live | The app's signing key is kept only on your PC, never in the public code. |
| Workouts stay on the phone | Live | Workouts never go to our server; the gym only gets check-ins, orders and messages. |
| Works without internet | Live | The member app logs workouts fully offline. |
| Owner inbox page | Live | A private page where you read answers, mark them read and send your picks. |
| Feature backlog with comments | Live | This list in your inbox, with a way to comment on any feature. |
| Play Store release | Planned | Google's pre-launch tests and the Play Store listing are not started yet. | After you open the Play account (#28, #35): first an internal test for the gym's staff, then a closed test with 12 testers for 14 days (gym members can be the testers), then public. Members then get updates by themselves. The GitHub download link stays as a backup. |
| Landing page, leads and new-gym onboarding | Live | Live since 22 Oct at https://forgeai.aakashpahuja.in/home/ (Hindi + English): a gym owner types their gym's name and sees the member app in their colours, then asks for a free demo (saved privately in Cloudflare; I tell you each one). "Open the demo gym" and "Sign in" lead to the admin app; new gyms get a "Get started" checklist. |
| Paid server with daily backups | Waiting for you | Supabase Pro: no pausing after a quiet week, daily backups, a restore drill before real data goes in (#27). | You upgrade Supabase to Pro (about ₹2,100 a month, spend cap on). The server then never pauses and keeps daily backups for 7 days. I practise a restore on the test server before the gym's real data goes in. |
| Test server before live | Planned | A second server where every change is tried before it reaches the gym. | A second, free Supabase project, "forgeai-staging", with the same tables. Every database change goes there first and runs all the server checks; only then does it go live, with your yes. You make the project (Supabase lets only the owner do it); I fill it. |
| Crash and outage alerts | Planned | Crash reports from both apps and a "site is down" alert to your phone, so we hear before the gym calls. | Crash reports from both apps (Sentry, free) tell me the screen, the app version and the error, with no member names. A check every minute (Better Stack, free) tries the admin app and the database and alerts your phone if either is down. You make the two free accounts; I wire them in. |
| Real-phone tests on Google's lab | Waiting for you | Built: Google's robot tries each release on 5 real phones; needs your free setup (#25). | Built. After each release, the cloud build sends the app to Google's Test Lab, where a robot taps through it on 5 real phones (Samsung, Xiaomi, vivo, OPPO, OnePlus) and reports crashes and broken screens; I read the report. Free; it starts once you do the 10-minute setup (#25). |
| "New version ready" in the app | Live | Members are told when an update is ready. |
| Privacy notice, terms and consent | Planned | Plain-English (and Hindi) notice in both apps, a consent screen when joining a gym, a named complaints contact. | Mostly done: the notice (English + Hindi) and the terms are final, and the "I'm 18 or older and I agree" tick is in the app since v0.49.0. The pages go live on the website, linked from both apps, once you give the complaints contact (#37). |
| Gym data export and delete | Live | A gym can download all its data in one tap (Excel), and ask to be deleted if it leaves. |
| Feedback by text or voice, sorted and fixed by Claude | Live | A "Send feedback" button in both apps; Claude sorts it every few hours, adds ideas to this list, fixes bugs through the full tests, and replies to the sender (#39). |
| Launch plan for the client gym | Planned | 8-week trial: gym visit, data move from GGMS, training, side-by-side run, switch-over, go/no-go (docs/LAUNCH-PLAN.md). | Over 8 weeks: your gym visit and the GGMS export, two trial imports until the totals match, staff training, 10 days of entering everything in both systems, then switch-over mid-week. A go / no-go review in week 6; paid from week 8. GGMS stays paid until then. |

---

## 44. Pick a new brand name (its domains are free today) — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**You asked (20 Oct, backlog):** research a new product name whose .com (or .in / .app) is still free at a
normal price; forge.ai and forgeai.com are taken and too expensive.
**My answer:** I checked 136 names on 22 Oct. Most short English names are taken; most free .com names are
Hindi-English blends. Five have .com, .in and .app all free at the normal price (no premium):
- **Repghar** (रेपघर, "home of your reps"): progress plus the gym as a place you come back to. No clash found.
- **Kilojeet** (किलोजीत, "win the kilos"): ties to "kg to beat"; sounds like a Punjabi first name, so it can be a mascot. Some owners may take it as a joke.
- **RepAhead**: plain English; similar trademarks exist, so it is harder to protect.
- **AglaSet** ("next set"): perfect in Hindi; English readers may stumble.
- **IronAdda**: warm, but a Kolkata gym chain is called "Iron Addict", and "adda" can mean a den.
Cost: about ₹3,100 a year for all three endings (.com about ₹990, .in about ₹740, .app about ₹1,350).
Two cautions: two names on my list were registered by someone else in the last four months, so buy the
.com and .in the day you pick; and the official trademark search (IP India) needs a person (it has a
captcha), so do it, or ask a lawyer, before paying for a logo. Say both top names to 3-4 Jaipur gym owners
first if you can.
**Decide:** Which name?
- A: Repghar (recommended): one word for the whole pitch, members see their reps and treat the gym as home
- B: Kilojeet: the most memorable, a ready mascot; a little playful for some owners
**Details and all 136 names checked:** https://github.com/aucksy/ForgeAI/blob/main/docs/overhaul/research/R-brand-name.md

## 43. How should members sign in: Google, or a phone code? — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**You asked (17 Oct, #11):** "log in with Google etc., with 'join via your gym membership' right below;
the app must also work with no gym." You chose: research it properly first, then come back with options.
**My answer:** Google sign-in is free and the app already has the Google sign-in part (used by Drive
backup). One catch decides the design: Google tells us a member's email, never their phone number, and
the gym's member list is matched by phone. So a Google sign-in alone cannot prove "this is Rahul from the
list". One more check is needed before "My membership" can safely show payments.
- **What others do:** Hevy and Strong make you sign in (both have help pages for members who signed in a
  second way and found an empty account). cult.fit and FITPASS sign in by phone number and a code.
- **Rules that come with accounts:** Google Play asks for "Delete my account" inside the app and on a web
  page; India's data law (full from 13 May 2027) asks for consent words and answers to delete requests.
- **Workouts do not move:** they stay on the phone and in the member's own Drive in both options.
**Decide:** How should members sign in?
- A: "Continue with Google" on the first screen (optional; "Join with your gym code" and "Use without an account" stay). The desk confirms each member once with one tap in the admin app. Free; the Google part is the same setup as task #42. Unlocks one sign-in for backup and a new phone, and later payments in My membership (recommended)
- B: Phone number and a one-time code by WhatsApp or SMS. Matches the gym's list by itself, no desk step. About ₹0.12 a WhatsApp code or ₹0.30 an SMS (₹60–130 a year for a 300-member gym), plus ₹5,900 + ₹1,250 once for India's SMS registration, and business paperwork that takes days
**Details and sources:** https://github.com/aucksy/ForgeAI/blob/main/docs/overhaul/research/R-google-login.md

## 42. Your task: switch on Google Drive backup (free, about 30 minutes) — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Your task:** Open https://console.cloud.google.com/projectcreate with your Google account and make a project named ForgeAI (free, no card).
**Your task:** In that project, open https://console.cloud.google.com/apis/library/drive.googleapis.com and press Enable.
**Your task:** Open https://console.cloud.google.com/auth/branding and fill in: app name ForgeAI, your email as the support and contact email, audience External. Then on the Audience page press "Publish app". (The app only asks for its own files in the member's Drive, which Google does not review.)
**Your task:** Open https://console.cloud.google.com/auth/clients, press Create client, pick Android, and fill in: package name com.forgeai.app and SHA-1 97:F8:15:53:15:41:CF:71:D4:22:69:8F:5B:6B:84:69:AC:6F:93:88 (the app's public signing fingerprint). Press Create.
**Your task:** Press Create client again, pick Web application, name it "ForgeAI app", press Create. Copy its Client ID (it ends in .apps.googleusercontent.com) and send it to Claude. It is not a secret.
**Why:** found on 22 Oct: Drive backup and the automatic backup after every workout are built, but hidden
in the app, because this one-time Google setup was never done. Today members have only Android's own
phone backup, so a lost or reset phone can lose their history (your rule: members must not lose
workouts). With the ID, I switch it on in the next app version. The cloud test phone has no Google
account, so the first real backup will be on your phone; I will tell you exactly what to tap.

## 41. How do we price an owner with 2 or more branches? — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**You asked (comment on the feature backlog, 22 Oct):** "We need to plan it. Even small GYMs have 2
branches sometimes - But I need your input on how the pricing should work. per GYM per XX members or just
XX members across any number of GYMs". (You wrote it on "Separate app per gym"; I read it as being about
branches: one owner, 2 or more places. "Several branches" is now Planned.)
**My answer:** I would not count members at all. Price per branch, and make the 2nd branch cheaper.
- **What the market does:** most gym software charges per location (for example, Mindbody about $99 a
  month per location). Indian tools move a multi-branch gym into a higher plan. Some charge by member
  count, and their own reviewers point out the catch: the bill grows every time the gym grows.
- **Why members are the wrong thing to count for us:** our selling point is the member app. We want the
  owner to put EVERY member on it. A member limit makes him do the opposite: keep members off, or argue
  about who counts. Our cost per member is also tiny, because workouts stay on members' phones.
- **What a branch really costs us:** a second desk to set up, train and support, a second QR poster,
  maybe a second entry machine. That is per branch, so the price should be per branch too.
- **Members across all branches (your second idea)** is simple for a chain of small branches, but a
  2-branch owner with 300 members in total would pay the same as a 1-branch gym, while we do double the
  setup and support.
- Numbers follow your pick on #30 (the price for one gym). Example with ₹1,499 a month: 2nd and later
  branches ₹999 a month each.
**Decide:** How do we price an owner with 2 or more branches?
- A: Per branch, with no member limit: each branch pays the normal price, and the 2nd and later branches pay less (for example ₹999 a month each, if one gym pays ₹1,499) (recommended)
- B: By the total number of members across all branches, any number of branches (for example up to 300 members ₹1,499 a month, up to 700 members ₹2,499)
**Sources:** dupple.com, "Best gym management software in 2026" (Mindbody per location, Gymdesk by member
count); houseofgrapplers.com, gym software pricing (per-member pricing grows with the gym);
codingclave.com, gym software cost India 2026 (branch count moves the price); Easy Gym Software (multi-branch
plans). Reviews and vendor pages, not price sheets.

## 40. Launch decision: put the new-gym landing page live — 21 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**READ (22 Oct, 08:04 am, via the page)**
**DECIDED (22 Oct, on the page):** A: yes, now. **Live since 22 Oct:** https://forgeai.aakashpahuja.in/home/
(the admin app keeps its address). Checked on the live site: the page and its pictures open, no errors,
the security rules on, and the demo form refuses a wrong number with plain words. The save of a real
request is proven by its tests; I did not send a fake one into your list.
**What it is (rebuilt 21 Oct on your note "our USP is the member app"):** a page for gym owners
who don't use ForgeAI yet, designed like a supplement tub label (the thing every owner sells from his
own shelf). It leads with "Keeps members coming back": the visitor types their gym's name and picks
its colour, and the member app on the page turns into theirs. Then a member's workout plays (sets
tick, "kg to beat" counts down, NEW RECORD), a "Member Facts" panel (live features ticked, planned
ones marked "Coming"), your shop inside the app, messages to every member, the desk work in one
line, and a "Free demo" form. Three real, sourced numbers on why progress keeps members. English and
Hindi. No prices (you have not picked one, #30).
**Where:** forgeai.aakashpahuja.in/home/; the admin app keeps its address.
New demo requests reach me; I tell you each one so you or I can call back.

## 39. Is an automatic feedback loop (send feedback, Claude sorts it, fixes it, releases it) in the plan? — 19 Oct 2026
**Chat:** ForgeAI Local Chat
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
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Your task:** When Claude says the draft is ready (it follows your answers to #30, #31 and #33), read it: one pilot agreement with the data agreement inside (dates, success measures, the gym owns its data, export in 7 days and deletion in 30 if they leave, breach notice to the gym in 24 hours, support hours, price after the pilot, it is a beta).
**Your task:** Sign it with the gym owner (2 copies, or both sign a PDF), and send Claude a photo of the signed page.
**Why:** India's data law makes the gym responsible for its members' data and needs a written contract with us (we handle it for the gym). It also stops the trial turning into a free service with no end date. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (D3).

## 37. Launch task: name the complaints contact for members — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Your task:** Tell Claude one name and one email address that members can write to about their data (it can be you and a new address such as privacy.forgeai@gmail.com; one you will check weekly).
**Why:** India's data law requires a named contact on the website and in the app, with an answer within 90 days. Claude puts it into the privacy notice and both apps. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (D4).

## 36. Launch task: the gym visit and the GGMS export — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Your task:** Visit the gym with the one-page question sheet (about 45 minutes): https://github.com/aucksy/ForgeAI/blob/main/docs/launch/GYM-VISIT.md
**Your task:** Ask the desk to export from GGMS whatever it can (members, plans, dues, payment history, attendance; Excel best) and get a copy, plus photos of 2 receipts.
**Your task:** Send Claude the answers (typed, voice note text, or photos of your notes) and the export files.
**Why:** everything after this depends on it: the data move, the training plan, whether the desk needs the offline mode, FitPass, receipts with GST. We have never asked the gym these questions. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (F1, F2).

## 35. Launch task: open the Google Play developer account ($25 once) — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Your task:** After you answer #28: go to https://play.google.com/console/signup and make the account type you picked. It needs your government ID, a card in your name and an Android phone. Pay the $25 once.
**Your task:** Tell Claude "Play account ready". Claude then prepares the store listing, the data safety answers and the internal test for you to submit.
**Why:** members get updates by themselves from the Play Store; the GitHub download link will be blocked by Google for unregistered apps from 2027. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (C1-C3).

## 34. Launch task: accounts and safety switches only you can turn on — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Your task:** If you say yes in #27: in Supabase (https://supabase.com/dashboard), open the project → Billing → upgrade the organisation to Pro. Leave "Spend cap" ON.
**Your task:** In Supabase, create a second, free project named `forgeai-staging`, region Mumbai (Claude fills it with the same tables, for testing changes before they reach the gym).
**Your task:** Turn on two-step sign-in (an authenticator app) on Supabase, GitHub, Cloudflare and your Google account.
**Your task:** Make a free Sentry account (https://sentry.io/signup) and a free Better Stack account (https://betterstack.com/users/sign-up); then tell Claude. Claude wires crash reports into both apps and sets the "site is down" alerts to your phone.
**Your task:** Check that your 2 offline copies of the app's signing key still open (the folder from docs/RELEASE-SIGNING.md). If that key is lost, every member must reinstall and loses their data.
**Why:** today the server pauses after a quiet week, has no backups, and nobody hears about a crash or an outage until the gym calls. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (A1-A7, B1-B2).

## 33. Launch decision: your support hours during the trial — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Decide:** When will you answer the gym's WhatsApp support group during the 8-week trial?
- A: Gym rush hours (about 6-10 am and 5-9 pm) on gym days: payment problems answered within 15 minutes, everything else the same day (recommended)
- B: Evenings only, within 2 hours; the desk uses paper or GGMS for anything urgent
**Why it matters:** this promise goes into the pilot agreement (#38). A desk that cannot take a payment and gets no answer is the most common reason a gym gives up on new software. Claude watches the alerts all day; you are the human the gym talks to.

## 32. Launch decision: should ForgeAI register for GST now? — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Decide:** Register ForgeAI for GST now?
- A: Not now: registration is required only above ₹20 lakh a year; gyms cannot claim back GST since Sep 2025, so our 18% GST would be a straight extra cost to the gym (recommended)
- B: Register now (needed only if you want to bill GST from day one, for example as a company)
**Why it matters:** it changes the price the gym pays by 18%. Check with your accountant before the second or third gym. The gym's own receipts already use 5% GST and number by financial year.

## 31. Launch decision: lawyer check of the privacy notice and the agreement — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**DECIDED (20 Oct):** A: Claude's checked documents for the trial; a lawyer before the second gym (you left the legal calls to Claude, R-45, 20 Oct).
**Why it matters:** the law (DPDP) applies in full from May 2027; penalties are large, but the risk in a one-gym, 8-week trial with a signed agreement is low. Legal wording is your decision.

## 30. Launch decision: the price after the trial — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Decide:** What does the gym pay after a free 8-week trial? (It goes into the agreement before the trial starts.)
- A: ₹1,499 a month, or ₹14,999 a year (about GGMS's price, with the member app included) (recommended)
- B: A first-client price of ₹999 a month for the first year, in return for a testimonial and feedback
**Why it matters:** small Indian gyms pay ₹1,000-3,500 a month for software; GGMS costs them about ₹12,000 a year. Writing the price down now means the trial ends with a decision, not a negotiation. Our running cost: about ₹2,100 a month (server).

## 29. Launch decision: members under 18 — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**DECIDED (20 Oct):** A: the member app is for 18 and over during the trial (you left the legal calls to Claude, R-45, 20 Oct).
**Why it matters:** India's data law needs a parent's verified consent for anyone under 18, and bans tracking them. A builds in a day; B takes about a week and slows joining for everyone.

## 28. Launch decision: which Google Play account — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Decide:** Which kind of Google Play developer account?
- A: Personal account ($25 once, ready in days). Before going public, the app needs 12 testers using it for 14 days in a row: the gym's members can be those testers (recommended)
- B: Organisation account: no 12-tester rule, but needs a registered company and a free D-U-N-S number (can take up to 30 days)
**Why it matters:** the Play Store gives members automatic updates and keeps the app installable after Google's 2027 rule against unregistered downloads. You can move to an organisation account later when you form a company.

## 27. Launch decision: paid server plan (Supabase Pro, about ₹2,100 a month) — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Decide:** When do we move the live server to the paid plan (Supabase Pro, $25 a month, about ₹2,100)?
- A: Now, before the gym's real data goes in (recommended)
- B: In the switch-over week
**Why it matters:** the free plan pauses after 7 quiet days (the app and the admin app stop working until someone wakes it) and keeps no backups we can restore. With the gym's real data, one bad day without a backup could lose their records. A means real data is safe from the first import.

## 26. Try v0.48.0 on your phone with one real workout — 18 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Your task:** Install v0.48.0 on your phone: https://github.com/aucksy/ForgeAI/releases/download/v0.48.0/forgeai-v0.48.0.apk
**Your task:** Do one real workout with it, and tell me anything that looks or feels wrong (a screenshot helps).
**Why:** every automatic test passed, but you are the first real person in a real gym on this
version (new: gym workout plans, kg to beat per exercise, My membership, check-in offers the workout).

## 25. Set up Google Test Lab (free, about 10 minutes) — 18 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Your task:** Follow the 5 short steps in `docs/uat/TEST-LAB-SETUP.md` (on GitHub: https://github.com/aucksy/ForgeAI/blob/main/docs/uat/TEST-LAB-SETUP.md): make a free Firebase project `forgeai-testlab`, turn on 2 services, make a key, and add `TEST_LAB_PROJECT` and `TEST_LAB_KEY` to the GitHub secrets.
**Your task:** Then tap "I have done it" here (or tell me "Test Lab is set up").
**Why:** after that, every release is tried by Google's robot on 5 real phones (Samsung, Xiaomi,
vivo, OPPO, OnePlus or Pixel) and 2 virtual ones, free. Only you can make the project and the key.
Then I run the first test on v0.48.0 and tell you what it found.

## 24. Is Google Test Lab free, and will it use many tokens? — 18 Oct 2026
**Chat:** ForgeAI Local Chat
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
**Chat:** ForgeAI Local Chat
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
**Chat:** ForgeAI Local Chat
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
**Chat:** ForgeAI Local Chat
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
