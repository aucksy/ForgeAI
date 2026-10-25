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

---

## Priority (pending items only)
R-96 (owner, 24 Oct 2026). **Impact** = how much it matters to the gym and its members. **Effort** = the time and
tokens it takes to build (for a decision: the build after it; for your own task: your time). High / Medium / Low.
Done, built and "Not doing" items have no rating. The page sorts by these (Best first = high impact, low effort).

| Item | Impact | Effort |
|---|---|---|
| Feature: Monthly gym challenge with a ranking | High | Low |
| Feature: How busy the gym is right now | High | Low |
| Feature: Gym's logo on share pictures and a before/after share | High | Low |
| Feature: Bring a friend | High | Low |
| Feature: The gym's own form videos | Medium | Low |
| Feature: Ask your trainer | High | High |
| Feature: Ask the desk to freeze or renew | Medium | Low |
| Feature: The gym's workout of the day | Medium | Low |
| Feature: Strength level for each main lift | Medium | Low |
| Feature: Badge shelf | Medium | Low |
| Feature: Which muscles are ready today | Medium | Low |
| Feature: Quick workout: "I have 30 minutes" | High | Medium |
| Feature: Ask your own AI | Medium | Low |
| Feature: Steps and water each day | Low | Medium |
| Feature: 1-rep max and % calculator | Medium | Low |
| Feature: Treadmill and cycle details | Medium | Medium |
| Feature: Log sets on the watch | Low | High |
| Feature: "Stronger than X% of your gym" | Medium | Medium |
| Feature: Follow gym mates (a feed of your gym) | Medium | High |
| Feature: Compare with a friend | Low | Medium |
| #65 | High | Low |
| Task: Play Store pictures, redone (R-126) | High | Low |
| Task: Test server and crash alerts (#34) | High | Medium |
| Task: The 14 new features (#58) | High | High |
| Task: Privacy and gym-terms words for the server copy (#59) | High | Low |
| #56 | High | Low |
| Task: Multi-branch gyms, end to end (#41) | High | High |
| Task: AI import that never fails (#41, #36) | High | High |
| Task: Members' workouts on our server (#50, #27) | High | High |
| Task: Online terms acceptance for gyms (#38) | High | Low |
| Task: Trainer view without a tick box (#46) | High | Medium |
| Task: Free vs gym-member limits + Google sign-in (#43) | Medium | Medium |
| Task: Play Store internal test (#28) | High | Medium |
| Task: Automated support and fixes: a plan (#33) | Medium | Low |
| #55 | High | Low |
| #54 | Medium | Low |
| #50 | Medium | High |
| #46 | High | Medium |
| #45 | Low | High |
| #44 | High | Medium |
| #43 | Medium | Medium |
| #42 | Medium | Low |
| #41 | Low | High |
| #38 | High | Low |
| #37 | Medium | Low |
| #36 | High | Medium |
| #35 | High | Low |
| #34 | High | Low |
| #33 | Medium | Low |
| #32 | Medium | Low |
| #30 | High | Low |
| #28 | High | Low |
| #27 | High | Low |
| #26 | High | Medium |
| #25 | Medium | Low |
| Feature: Moving exercise demo clips | Medium | Medium |
| Feature: Google Drive backup and restore | Medium | Low |
| Feature: Automatic workout backup | Medium | Low |
| Feature: AI coach chat | Medium | Medium |
| Feature: Food and calorie log | Low | Medium |
| Feature: Calorie tracking from a food photo (AI) | High | High |
| Feature: Hindi screens | Medium | High |
| Feature: Body weight from Health Connect | Low | Medium |
| Feature: Paid plan for people without a gym | Medium | High |
| Feature: Offline front desk | Medium | Medium |
| Feature: Entry machine (turnstile, face or fingerprint) | High | Medium |
| Feature: Automatic SMS or WhatsApp reminders | High | Medium |
| Feature: Trainer profiles and schedules | Low | Medium |
| Feature: Webcam photo at the desk | Low | Low |
| Feature: Body measurements taken by the gym | Low | Low |
| Feature: Trainer view of member progress | High | Medium |
| Feature: AI assistant for the owner | Low | High |
| Feature: Several branches | Low | High |
| Feature: Member data export by the gym, on request | Medium | Medium |
| Feature: A member's own history from before joining a gym | Medium | Medium |
| Feature: FitPass and other pass members | Medium | Medium |
| Feature: QR scan opens the door | Medium | Medium |
| Feature: Paying in the app | High | High |
| Feature: Free 3-month trial (HQ can extend to 6) | High | Low |
| Feature: Messages in the phone's notification shade | High | Medium |
| Feature: Busy times by exercise | Low | Medium |
| Feature: Google login | Medium | Medium |
| Feature: Class booking | Medium | High |
| Feature: Diet plans from the trainer | Medium | Medium |
| Feature: New brand name with a free domain | High | Medium |
| Feature: Play Store release | High | Medium |
| Feature: Paid server with daily backups | High | Low |
| Feature: Test server before live | Medium | Medium |
| Feature: Crash and outage alerts | High | Low |
| Feature: Real-phone tests on Google's lab | Medium | Low |
| Feature: Privacy notice, terms and consent | High | Low |
| Feature: Launch plan for the client gym | High | High |
| Task: 15. Offline front desk (admin app) | Medium | Medium |
| Task: 18. Trainer view of member progress; reps to beat (your notes, 22 Oct) | High | Medium |
| Task: 21. Imported names with a title ("Mr. Ramesh") | Low | Low |
| Task: Pilot + data agreement | High | Medium |
| Task: Crash reports and outage alerts wired in | High | Medium |
| Task: Staging server, backups check, restore drill | High | Medium |
| Task: GGMS column mapping and trial imports | High | High |
| Task: Play Store listing, data safety answers, internal test | High | Medium |
| Task: In-app "Delete my data" for members | Medium | Medium |

---

## Claude's tasks
What I do myself, in the order I do them (re-prioritised 21 Oct: safety and legal before real
members, then what the trial needs, then marketing; owner, 21 Oct: "you can decide the sequence").
On the page: the "Claude's tasks" tab. Status: Done / Doing / To do / Blocked (waits for you).

| Task | Status | Details |
|---|---|---|
| Multi-branch gyms, end to end (#41) | Done | Live 24 Oct after your yes in #59 (server 0031 + admin app). |
| AI import that never fails (#41, #36) | Done | 24 Oct: built and reviewed; goes live with #59 (no server change). Branch column, extra columns kept, a list of rows to fix instead of stopping; tested on 10+ sheet shapes incl. GGMS. Large. |
| Members' workouts on our server (#50, #27) | Doing | Server part live since #59 (24 Oct); your Google setup done (#60, 25 Oct). I am switching on "Continue with Google" so it works; ships in 0.57.0. |
| Online terms acceptance for gyms (#38) | Done | Live 24 Oct after your yes in #59. |
| Simpler app layout (4 fixed tabs, 6 settings groups) | Done | Shipped in 0.56.0 (Workout, Progress, Gym, Profile tabs; Settings in 6 groups). |
| Play Store pictures, redone (R-126) | Doing | You found layout and symmetry faults (25 Oct). New frames (centred, whole phone), fresh screens on a normal-size phone, and a design review of every picture before upload. |
| Test server and crash alerts (#34) | To do | After 0.57.0: the free test server in your Chrome, then crash notes and "site is down" emails on Cloudflare and GitHub (no new accounts). |
| Health Connect switching on and off | Done | 24 Oct: two causes fixed (the calories switch blocked every workout; a slow reply showed "Off"). Ships in the next release with a phone test. |
| The 14 new features (#58) | To do | After the layout: phone-only ones first, then the gym ones, then bigger logging. |
| Privacy and gym-terms words for the server copy (#59) | Done | You approved them (#64, A); live 25 Oct. |
| Trainer view without a tick box (#46) | To do | 24 Oct: you picked A (join-screen line + off switch). Built after the MettleUp release. Waits for your pick in #46 and your OK on the words. Medium. |
| Free vs gym-member limits + Google sign-in (#43) | Doing | Your Google setup is done (#60). Google sign-in ships in 0.57.0; the limits stay OFF until you switch them on in your owner panel. |
| Play Store internal test (#28) | Done | 0.56.1 is on the internal and closed tests (25 Oct). New versions now go up by themselves after each release. |
| Automated support and fixes: a plan (#33) | To do | Research, then a plan for your OK. Small. |
| 1. Re-check the two old open server refusals | Done | 21 Oct: both (U-A4, U-G3) already covered by the server test suites, which passed on the LIVE server 18 Oct: 438 permission checks (66 cross-gym attempts all refused) + 66 shop-order checks. Closed in FINDINGS (H1). |
| 2. "I agree" + 18+ check + privacy link when joining a gym | Done | 21 Oct: one tick box above Join on the Shop tab and the invite-link screen ("I'm 18 or older, and I agree to ForgeAI's terms and privacy notice", links to both); wrong codes are still told first; 13 phone-test steps tick it (qa/sub-agree.yaml); 3021 tests + typecheck green. Pages privacy.html + terms.html built by scripts/legal_pages.py; they go live with the admin deploy once #37 fills the contact. Ships in v0.49.0 (D5, D6). |
| 3. "New version ready" prompt in the app | Done | 21 Oct: a card on the Workout tab when a newer release exists ("Get it" / "Later"); checks at most every 6 hours. The release now stops if its number differs from the app's own (review find). Ships in v0.49.0 (C6). |
| 4. Next release (v0.49.0) with 2 + 3 + microphone removed | Done | 21 Oct: released. The phone tests caught a real bug coming back (no tab bar after resuming a workout from the app-icon shortcut) and it was fixed before release. APK: https://github.com/aucksy/ForgeAI/releases/download/v0.49.0/forgeai-v0.49.0.apk |
| 5. Admin app security header + rollback note | Done | 21 Oct: live. The admin app runs only its own scripts and talks only to the gym server; every admin journey runs under that rule (J29). Rollback = one command, written in the admin README (A6). |
| 6. Feedback button + automatic sorting | Done | 21 Oct: More → Send feedback in the admin app (live) and Settings → Send feedback in the member app (v0.49.0). Kept in Cloudflare's free database, not the gym server; no name or number; 20 a day per phone. How Claude sorts it: docs/launch/FEEDBACK.md. The twice-a-day schedule starts with trial week 3 (H7). |
| 7. Gym data export and delete | Done | 21 Oct, live: Settings → Your data → "Download all your gym's data" (Excel, one sheet per record type, + full copy). Online gyms: "Delete our gym from ForgeAI" sends a request; the real delete is a checked step with your yes each time (docs/launch/GYM-DELETE.md) (D8). |
| 8. Landing page + lead form + /app sign-in + "Get started" checklist | Done | 22 Oct, live on your yes (#40): https://forgeai.aakashpahuja.in/home/ with the demo form; "Get started" list live since 21 Oct. Changed from the plan: the page sits at /home/ and the admin app keeps its address (no move behind /app). Later: an email to you for each new request, once the contact email is set (#37). |
| 9. Keep access logs for 1 year | Done | 23 Oct, live on the server (part of #51): every admin-app sign-in, sign-out, failed code, save and full download is written down; kept 7 days now and 1 year from 13 May 2027, as the privacy notice says. The nightly clean-up starts when the HQ app is set up (#52). |
| 10. Night build (21 Oct, you asleep): backlog features | Done | 22 Oct: v0.50.0 released (https://github.com/aucksy/ForgeAI/releases/download/v0.50.0/forgeai-v0.50.0.apk): "Machine in use", rest change moves the running timer, "Save as routine" after a first free workout, automatic Google Drive backup, "What's new" (shows from v0.51). Admin app: quick buttons on Today (live). Two reviews; one real backup risk caught and fixed before release. |
| 11. v0.51.0: workout time on the notification card, rest-over sound choice, "What's new" with earlier updates, block-proof address | Done | 22 Oct: released inside v0.54.0 (https://github.com/aucksy/ForgeAI/releases/download/v0.54.0/forgeai-v0.54.0.apk). |
| 12. Research you asked for: Google login, new brand name | Done | 22 Oct: two ways to sign in (#43) and 5 names with free domains (#44), for your pick. |
| 13. Block-proof server address | Done | 22 Oct: live for the admin app (forgeai.aakashpahuja.in/sb); the member app gets it with v0.51.0. If our address ever fails, both apps switch to Supabase's own for 10 minutes by themselves, and never send a payment or check-in twice. |
| 14. Full GST tax invoices (admin app) | Done | 22 Oct, live: a gym with a GST number now prints a "Tax invoice" with the place of supply (its state), "Reverse charge: No" and a signature line. Not done: the paying company's own GST number (needs a live database change, your yes). |
| 15. Offline front desk (admin app) | Blocked | Steps 1 and 2 live 22 Oct (opens without internet; desk check-ins kept offline and sent later, with their real time). Step 3 (payments offline) waits for your gym visit: needed only if the desk's internet really drops, and it carries money risk. |
| 16. Landing page: dedicated animated sections (your note, 22 Oct) | Done | 22 Oct, live: workout + new record, the shop order, free notices to every member, the lock screen with a watch. |
| 17. Missing-muscle suggestions (your note, 22 Oct) | Done | 22 Oct: released in v0.54.0. Now and then Up next suggests a few sets for a muscle group your last 3 weeks left out (never in an easy week); "Not now" waits 4 weeks; Settings → Workouts has the switch and "Bring back". |
| 18. Trainer view of member progress; reps to beat (your notes, 22 Oct) | To do | Reps to beat: live in v0.54.0. Trainer view: #46 decided A (24 Oct); built after the MettleUp release. |
| 19. v0.52.0: your gym notes of 22 Oct | Done | 22 Oct: released inside v0.54.0: warm-ups keep last time's numbers; dumbbell pairs; newest workout anywhere; the box shows kilos/reps done and turns green; "Last" beside the rest timer; pop-ups longer; "In use" after each set; Health Connect asks first. |
| 20. Offers and messages for gym owners, with the workout reward (your note, 22 Oct) | Done | 24 Oct: all live. Step 1 live 22 Oct; step 2 server and admin 23 Oct; the member app card released in v0.55.0 (https://github.com/aucksy/ForgeAI/releases/download/v0.55.0/forgeai-v0.55.0.apk). |
| 21. Imported names with a title ("Mr. Ramesh") | Blocked | New imports leave titles out (admin app, live 22 Oct). Names already on the server need a small live server change: waits for your yes, which I will ask with the next live change. |
| 22. Join screen: Terms and Privacy opened the admin app (your report, 22 Oct) | Done | 22 Oct, live: both links open a short "being finished" page, never the admin app; a test stops it coming back. The full pages need #37 (your contact name and email). |
| 23. After joining: the gym's welcome, its icon pop-up, Shop only when on (your note, 22 Oct) | Done | 22 Oct: released in v0.54.0. The gym's welcome screen after joining, then a pop-up to add its logo to the home screen and how to take the ForgeAI icon off (Android lets no app remove its own icon). No gym = no Shop tab; a gym = "Gym" tab; its shop on = "Shop". "Leave gym" on its own row in Settings. |
| 24. AI import of old records (#47) | Done | 23 Oct: live (Gemini first, Claude Haiku 5.5 as backup); reviewed, all fixes in. The AI part waits for your two keys (#47). |
| 25. System owner panel ("ForgeAI HQ", #51) | Done | 23 Oct, live at https://forgeai-hq.aakashpahuja.in: you sign in with Google and see every gym (counts only). All 3 server parts live and tested (64 + 49 checks); the gym owner's "ForgeAI access" list is live in the admin app. |
| 26. Swipe that starts on a weight or reps box (found 22 Oct) | Done | 23 Oct: fixed and released in v0.54.1 (https://github.com/aucksy/ForgeAI/releases/download/v0.54.1/forgeai-v0.54.1.apk). A phone test swipes from a box and checks the page moved. |
| 27. Automatic reminders to members (your note, 23 Oct) | Done | 24 Oct: released in v0.55.0 (https://github.com/aucksy/ForgeAI/releases/download/v0.55.0/forgeai-v0.55.0.apk); server part live 23 Oct (#53). Owners switch each one on or off in Messages & offers. |
| Pilot + data agreement | Blocked | D3: the price is set (#30, decided 24 Oct); needs your answer to #33 (support hours). Medium. |
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
| Workout time on the notification card | Live | v0.54.0: the live workout card's header shows how long the workout has run ("ForgeAI · Workout · 42:15"), ticking with the app closed; it stands still while the workout is paused. |
| Pick your rest-over sound | Live | v0.54.0: Settings → Workouts → Rest-over sound: ForgeAI chime (default), Bell, Double beep or Whistle; tap one to hear it. The same sound with the app open and with the screen off. Vibrate only = Workout sounds off. |
| Changing the rest time also changes the running timer | Live | If a rest timer is running and you change that exercise's rest from 2:30 to 3:00, the 30 seconds are added to the running timer too. |
| Fluid tab bar | Live | v0.54.0: when you tap another tab at the bottom, its highlight slides across to it instead of jumping, stretching a little as it moves (your note, 22 Oct). With the phone's "Remove animations" on, it simply jumps. |
| "Machine in use" screen during rest | Live | One tap during rest shows a big "In use, back in 1:32" banner with the live timer, so others know the machine is taken while you walk around. |
| "In use" after each set (a setting) | Live | v0.54.0: Settings → Workouts → Show In use after each set. The big IN USE screen with your rest clock opens by itself after each set (owner, 22 Oct). |
| Each exercise compared after a workout | Live | v0.54.0: on the finish screen, tap the comparison line to see each exercise up, same or down, and why ("2 sets fewer", "lighter"). It compares with this routine's last time first (owner, 22 Oct). |
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
| Google Drive backup and restore | Planned | Your Google setup is done (#60, 25 Oct). I am finishing the Google side and testing it; it ships in 0.57.0. | Settings → Backup shows "Back up to Google Drive": the member picks a Google account once, and the app saves the full backup file to their own Drive. On a new phone, "Restore from Google Drive" brings everything back. Only the member can open the file. |
| Automatic workout backup | Planned | Built in v0.50.0; it starts working with Drive backup in 0.57.0 (#60 done). | Once a member has linked Drive and backed up once on this phone, the app backs up by itself when they leave the app after a workout. |
| Full backup file you can keep | Next release | One file with workouts, routines in their order, every setting, profile and photos; restore on a new phone, with or without a gym (R-123). Ships in 0.57.0. |  |
| Gym opening hours in the app | Next release | The gym sets its hours per day in the admin app (live 25 Oct); members see them in the app from 0.57.0 (R-124). |  |
| Export to Excel | Live | Save your workouts, and separately your measurements, as a spreadsheet. |
| Kg or pounds, km or miles | Live | Switch units anywhere; your saved numbers never change. |
| Health Connect | Live | Sends your workouts and calories burned to Android's Health Connect. 24 Oct fix (next release): it no longer switches itself off, and workouts go even when the calories switch is off. |
| Home-screen widgets and app shortcuts | Live | Today's workout and weekly widgets, and long-press shortcuts to start or resume a workout. |
| Workout reminders | Live | Reminders on the days and times you pick. |
| Watch app (Wear OS) | Live | Rest countdown and buzz on the watch, plus heart rate during a workout. |
| Demo data | Live | An optional 3-month sample history to try the app; never loaded by itself. |
| Reps to beat for rep-only exercises | Live | v0.54.0: push-ups, pull-ups, dips and other moves with no weight show reps to beat ("45 reps to beat · +3"), set by set (owner, 22 Oct). | Where the app works out "kg to beat" today, a rep-only exercise instead adds up last time's reps: "45 reps to beat · +3", and each set's plan says the reps to beat for that set ("set 1: beat 15"). Timed exercises (plank) keep their time words. A new record shows when the total is beaten. |
| Missing-muscle suggestions | Live | v0.54.0: now and then Up next suggests a few sets for a muscle group your last 3 weeks left out (never in an easy week). "Not now" waits 4 weeks; Settings → Workouts has the switch and "Bring back" (owner, 22 Oct). | Research comes first (every muscle group and how much weekly work each needs). The app already knows which muscles each of the 402 exercises works, so it checks the whole WEEK of routines, not one day (a push day is meant to skip the back). Where a group gets little or no work, the routine editor shows one quiet line with one exercise to add, for example "Your week has no rear-shoulder work: add Face Pull?" with Add or Not now. One suggestion at a time, never during a workout, and "Not now" is remembered. Then we trim it together. |
| AI coach chat | Waiting for you | On hold (owner, 22 Oct: not now). Built earlier but hidden from members. Before it goes on, you decide who pays for the AI service. | A Coach tab where members ask in plain words ("why is my bench stuck?", "make me a 3-day plan"). It reads only the member's own history on the phone and can build a routine for them. It runs on a paid AI service, so before it goes on you decide who pays (for example, a premium add-on for the gym). |
| Food and calorie log | Waiting for you | On hold (owner, 22 Oct: not now). Built earlier but hidden from members until its own phase. | Members log meals with calories and protein, by typing or by telling the coach. Home shows two rings: today's calories and protein against the member's target. Everything stays on the phone, like workouts. |
| Calorie tracking from a food photo (AI) | Idea | Your bigger vision (24 Oct): click a picture of the plate and the app estimates calories; manual logging with Indian foods too. Later. Research of free food data and photo methods: docs/research/R-calorie-tracking.md. | The member takes a photo of the meal; AI names the foods and guesses portions; the member checks and fixes them, then the calories and protein count toward the day. Manual search with Indian dishes and katori/roti portions works without a photo. Builds on the hidden food log. |
| Hindi screens | Idea | Not built; the member app is in English today. | Settings gets a language choice, English or हिन्दी, and the app starts in the phone's language. Every button and message gets a Hindi version. Exercise names stay in English, because Indian gyms use the English names. |
| Body weight from Health Connect | Idea | Read your weight from other health apps instead of typing it. | With one permission, weigh-ins from a smart scale or another health app appear in Body weight by themselves, marked "From Health Connect". If you also typed a weight that day, your typed one wins. |
| Paid plan for people without a gym | Idea | The app is free, with every feature, for members of a gym on ForgeAI. People who train without a gym (or whose gym is not on ForgeAI) could pay for it themselves. To explore. | Without a gym code, a person gets a free trial, then a monthly or yearly plan paid through Google Play. Joining a gym on ForgeAI makes everything free again. You set the price; Google keeps 15% of each payment. |
| Strength level for each main lift | Planned | Shows Beginner, Intermediate or Advanced for squat, bench, deadlift and other main lifts, from #58. | Each main lift's chart shows a level worked out from your best set and your body weight, with our own formula. Body weight is never shown. Works offline. |
| Badge shelf | Planned | Badges for first 100 kg lift, 4 weeks in a row, 50 workouts and more, from #58. | Profile shows a shelf of badges earned from records and milestones the app already counts. The gym can give a real prize for a badge. |
| Which muscles are ready today | Planned | A body map that shows which muscles rested enough to train again, from #58. | Colours each muscle on the body drawing from the workouts you logged. Free here; Fitbod charges for it. The words say it is worked out from logged workouts only. |
| Quick workout: "I have 30 minutes" | Planned | Builds a workout for the time and equipment you have today, from #58. | Pick the time and the muscles; the app picks exercises with the plan builder's rules (no AI) and your history, ready to start. |
| Ask your own AI | Planned | One tap sends your workout history as text to ChatGPT or Gemini, from #58. | Settings → Export shows "Ask an AI": it makes a short text of your recent workouts and opens the phone's share sheet. You use your own free AI. |
| Steps and water each day | Planned | Steps from Health Connect and a water tap on Today, from #58. | Reads today's steps from Health Connect (one new permission), shown on Today with a water tap. Stays on the phone. A gym-wide step challenge is parked (owner, 24 Oct: nothing that costs server space). |
| 1-rep max and % calculator | Planned | Type a weight and reps to see your 1-rep max, then 50-95% of it in plate-ready weights, from #58. | Opens from an exercise's chart and from the plate calculator. Uses the same formula as the estimated 1-rep max chart. On the phone only. |
| Treadmill and cycle details | Planned | Log speed, incline, level and intervals for cardio machines, from #58. | Cardio exercises get extra fields (speed, incline or level) added without changing old workouts. History and charts show them. |
| Log sets on the watch | Idea | Parked (Claude, 24 Oct): few members wear Wear OS watches; from #58. | The watch would show the current set with a Done button. Waits until members ask. |

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
| Messages & offers | Live | 22 Oct: admin app More → Messages & offers: ready messages in English and Hindi (closures, fee offers, festivals, renewals...), who gets it, WhatsApp one by one, Today nudges. Step 2 waits for your pick in #49. |
| Workout offer in the app (step 2) | Live | 24 Oct: released in v0.55.0; server and admin live 23 Oct. | The owner makes an offer (10 workouts in 30 days → 3 extra days). Members tap "Join the offer"; only the dates of counted workouts leave the phone. A workout counts only on a day the gym saw a check-in, 20+ minutes and 6+ sets. When a member reaches 10, the days are added by themselves, or the desk taps Give, as the owner chose. |
| Automatic reminders to members | Live | 24 Oct: released in v0.55.0; server live. Owners switch each reminder on or off. | The member's phone sets each reminder itself from what it already knows (plan end date, birthday, visits, offer progress), at a good time of day and never more than one a day, so it works without internet and costs nothing. In the admin app, Messages & offers gets an "Automatic reminders" list with an on/off switch for each and the number of days where it matters. Members can turn gym reminders off in Settings. |
| Home screen tiles | Live | Live, expired and expiring members, today's collection and dues, each opening its matching list. |
| "Expiring in 1-3 / 4-7 / 8-15 days" tiles | Live | On the Today screen since 15 Oct: Ending today, in 1-3, 4-7 and 8-15 days; each opens its list. |
| Staff logins and roles | Live | Owner and front-desk logins; staff can give at most 10% off and every receipt shows who took it. |
| Personal training packs | Live | Sell personal training packs with a sessions-used counter and the trainer's name. |
| Member ID card | Live | Print a member card, save it as a picture, or send it on WhatsApp. |
| Import members from Excel | Live | Bring in members and payments from old sheets, with "Undo this import". |
| Gym branding | Live | Upload the gym's logo and colours, which members' apps then use. |
| Gym workout plans | Live | Trainers build or pick a plan, add starting weights, and send it to members or a whole membership plan. |
| Works on phone and computer | Live | One website that installs like an app, with dark and light looks. |
| Offline front desk | Waiting for you | Steps 1 and 2 live 22 Oct: the admin app opens and shows everything without internet, and desk check-ins made offline are sent later with their real time. Step 3 (payments and new members offline) waits for your gym visit. Waits for your gym visit (is the desk internet really unreliable?). | Step 2: check-ins made offline are kept on the device and sent once the internet is back. Step 3: payments and new members offline, with a receipt-number series of their own per desk (a tax invoice's number must never change after it is printed). |
| Full GST tax invoices | Live | 22 Oct: a GST-registered gym's receipt is a tax invoice (GST number, service code, CGST + SGST, place of supply, reverse charge No, signature line). The paying company's own GST number waits for a live database change. |
| Entry machine (turnstile, face or fingerprint) | Waiting for you | Matrix machine linked to us, blocking expired members; tripod turnstile is the standard offer, and the client buys it. Waits for the client to buy the machine. | The gym buys the machine; it talks to our server over the internet. A new member added in the admin app goes to the machine by itself and the desk scans the finger or face once; an expired or frozen member is blocked even when the internet is down, and a renewal unblocks them at once. Every entry becomes a check-in in the attendance register, and the desk gets an "Open door" button. |
| Automatic SMS or WhatsApp reminders | Waiting for you | Reminders sent by themselves cost money per message, so a paid provider needs your OK. | The owner picks which reminders go out by themselves (plan ends in 3 days, fee due, birthday) and at what time. They go through a paid WhatsApp business provider under the gym's name, about ₹0.13 a message (about ₹200 a month for 500 members). The admin app lists every message sent and any that failed. |
| Trainer profiles and schedules | Idea | Trainers can already send plans; no trainer profile or schedule screen yet. | Each trainer gets a page: photo, what they teach, working hours, their personal-training members and sessions left. A weekly calendar shows the booked personal-training slots, so the desk can book a member with a free trainer. |
| AI import of a gym's old records | Live | 23 Oct: Import asks "Ask AI to match the columns?"; AI fills only the columns our rules could not match, extra columns are kept as extra details, Aadhaar and PAN never imported. The AI switches on when you add the two keys (#47); until then the owner matches by hand. |
| Webcam photo at the desk | Idea | Take a new member's photo with the desk computer's camera. | On "New member", a "Take photo" button opens the desk computer's camera in the browser. The photo saves to the member and shows on the ID card and at check-in, so staff know who is who. |
| Body measurements taken by the gym | Live | 25 Oct: the trainer records weight, body fat and tape measurements on the member's profile in the admin app; the member sees them in Progress → Body, marked "From <gym>" (server 0035 live, #64). |  |
| Trainer view of member progress | Waiting for you | Trainers and the owner see whether each member is progressing (owner 18 Oct, widened 22 Oct). Research done; the plan waits for your pick in #46. | Research comes first (Trainerize, TrueCoach, Hevy Coach). In the app the member turns on "Share my progress with my gym" (off until they choose; they see exactly what is shared and can turn it off). Shared: workout days, total kg lifted per workout, the best set on main lifts and new records; never body weight or photos. A trainer's "My members" shows each one going up, flat, down or stopped coming, flags a lift stuck for 3 weeks, and has one-tap WhatsApp praise or a nudge. The owner gets a list of members who are stalling and not on personal training (a sales list), and a monthly progress report a trainer can send a PT client. Needs a live server change (your yes). |
| AI assistant for the owner | Idea | Ask questions like "peak hours today?"; reports already show peak hours. | A question box in the admin app: "Who hasn't paid this month?", "Busiest hour this week?". It reads only this gym's records, answers in a sentence with the list, and never changes anything. Each question costs a little on a paid AI service, so it needs your yes on cost. |
| Staff and trainer salaries | Not doing | Left out on purpose; small gyms handle pay outside the software. | Not planned: small gyms pay staff outside the software. If you change your mind, the first step would be staff attendance from the entry machine. |
| Several branches | Live | One owner runs 2 or more branches from one sign-in. Server live 24 Oct (0031, your yes in #59); admin app live 24 Oct. |  |
| Own sign-in PIN for owners and staff | Live | Your pick A (24 Oct): sign in with mobile + your own 6-digit PIN every time; chosen at "Create my gym"; 5 wrong tries lock it for 15 minutes. Server 0034 live with your yes (68 checks pass). |  |
| Hinglish in the admin app | Not doing | Removed on your word; the admin app is in plain English. | Not planned: the admin app stays in plain English. The desk cheat sheet is in Hindi and English. |

### Gym ↔ member links
| Feature | Status | Details | How it will work |
|---|---|---|---|
| Join a gym by code or invite link | Live | Members join with the gym's code, a WhatsApp invite link or the QR poster. |
| Join from the welcome screen | Live | "Have a gym code? Join your gym" on the very first screen. |
| Gym's colours and logo in the app | Live | After joining, the app takes on the gym's colours and shows its logo at start-up. |
| Gym logo on the home screen | Live | After joining, add a home-screen shortcut with the gym's logo that opens ForgeAI. |
| QR check-in | Live | Members scan the gym's poster and tap once; the desk sees the check-in and plan status. |
| Member data export by the gym, on request | Waiting for you | When a member asks, the owner exports that member's workout history from the admin app as a readable report in our own format (not an import file for Hevy, Strong or other apps). Waits for your yes: it needs a live server change. | Catch: workouts live on the member's phone, not on our server. So I see it like this: the desk taps "Request workout report"; the member's app asks "Send your report to the gym?"; on yes, the phone makes a readable PDF or Excel report in our own layout (not a file Hevy or Strong can import) and the desk downloads it. Members can already save their own Excel today; whether that stays is your call. |
| A member's own history from before joining a gym | Waiting for you | Someone who used ForgeAI on their own and then joins a gym: their earlier workouts stay theirs, never tied to the membership. Rules to work out with you (export, leaving, what the gym sees). | Workouts logged before the join date stay the member's alone: the gym never sees them, even if the member shares progress. Leaving the gym keeps every workout on the phone; only the gym's plans stop updating. Still to settle with you: the exact cut-off, and what a gym export may include. |
| FitPass and other pass members | Waiting for you | Members who come through FitPass (or a similar pass) and don't pay the gym: join without a plan, get workout plans and the shop, and the owner sees their visits apart from paying members. Waits for your yes: it needs a live server change. | The desk adds the person as a "Pass member" (FitPass, cultpass and so on): no plan, no dues, never on the renewal list. They join in the app with the gym code and get the gym's plans, shop and messages. Each check-in counts as a pass visit, and a monthly count per pass company lets the owner match that company's payment. Needs a live server change (your yes). |
| After check-in, start the workout | Live | "You're in ✓" then offers today's routine, or Push Pull Legs for a member with no routines. |
| QR scan opens the door | Waiting for you | The scan could open a networked door lock, but the client must buy the lock first. | The member scans the gate QR; our server checks the plan is active and tells a networked door lock to open for a few seconds. The QR on a small gate screen changes every 30 seconds, so a forwarded photo does not work. The desk button and a keypad PIN still work when the internet is down, and the lock opens on power loss (fire safety). |
| Gym shop | Live | Members order supplements and gear in the app and pay at the desk; the gym manages stock and orders. |
| Paying in the app | Waiting for you | Part of the Pro pack (your plan, 24 Oct, R-97). Shop orders are paid at the desk today. Needs a payment company account (for example Razorpay) that only you can open. | Members pay for shop orders, and later renewals, by UPI inside the app through a payment company (for example Razorpay). The money goes straight to the gym's bank account, and the desk sees "Paid online". The payment company keeps a small fee per payment (up to about 2%). |
| Gym messages inbox | Live | The gym sends offers and news to members' in-app inbox and sees who read them. |
| Gym welcome and logo after joining | Live | v0.54.0: after joining, the app restarts in the gym's look with "Welcome to <gym>", then offers the gym's logo for the home screen and shows how to take the ForgeAI icon off (owner, 22 Oct). |
| Shop tab only when the gym's shop is on | Live | v0.54.0: no gym = no Shop tab; a gym = a "Gym" tab; it becomes "Shop" once the gym lists a product. "Leave gym" is its own row in Settings → Your gym (owner, 22 Oct). |
| Workout reward (trial) | Live | 22 Oct: the member shows "Show my workouts to the desk" (v0.54.0), the desk types the code into "Check workout code" in the admin app and gives the free days. Nothing is sent to the server (#49, step 1). |
| Messages in the phone's notification shade | Waiting for you | Needs your Firebase (Google) project set up before messages can pop up on phones. | When the gym sends a message, it also pops up on members' phones like a WhatsApp message; a tap opens it in the app's inbox. It uses Google's free Firebase messaging: you make the Firebase project once, and a live server change (your yes) lets the server remember each phone. Members can turn it off in Settings. |
| My membership | Live | Members see their plan, end date, days left, personal training used and visits this month. |
| Payments shown in the app | Not doing | Left out on purpose, because the app can't prove who is holding the phone. | Not planned: the app knows a member only by a typed phone number, so it can't prove who holds the phone. Members see their plan and end date in "My membership"; receipts go by WhatsApp from the desk. |
| Gym workout plans in Routines | Live | Plans the trainer sends appear in the member's Workout tab by themselves. |
| First-time starting weight from the trainer | Live | The first workout of a gym plan starts at the trainer's weight, e.g. "start at 20 kg × 8". |
| Busy times by exercise | Waiting for you | With members' OK, show "others also plan this exercise at these hours" to help pick a quieter time. Waits for your yes: it needs a live server change. | Members choose to share "which exercise, at what hour" (no weights, no names; off until they agree). On an exercise or a routine, the app then shows "Other members also plan this between 6 and 8 pm", and members judge for themselves. It needs a few weeks of shared data before it shows anything, and a live server change (your yes). |
| Google login | Planned | Your Google setup is done (#60, 25 Oct). I am finishing it; ships in 0.57.0. | An optional "Continue with Google" on the first screen, next to "Join with your gym code" and "Use without an account". Signing in keeps a copy of the member's workouts on our server, readable only by them, so a new phone gets everything back. |
| Class booking | Waiting for you | Timetable and spaces left; waits for your gym visit to learn whether gyms run classes. | The owner sets a weekly timetable: class, trainer, time, spaces. Members see it in the app, book or cancel with one tap, and join a waiting list when a class is full. The desk sees each class's list. Waits for your gym visit to learn if the gym runs classes. |
| Diet plans from the trainer | Live | 25 Oct: admin app Diet plans page (3 starter plans), sent to a member or a whole membership plan; the member sees it under Gym → Diet plan (server 0035 live, #64). |  |
| Separate app per gym | Not doing | One ForgeAI app for every gym; a separate app per gym is unworkable for small gyms. | Not planned: one ForgeAI app takes on each gym's colours and logo, and the home-screen shortcut shows the gym's logo. |
| Monthly gym challenge with a ranking | Planned | "Most workouts in November": a progress bar, the top 10 of your gym, a prize of free days, from #58. | The owner makes a challenge in the admin app (goal, dates, prize). Members see their place among their own gym. The workout reward already counts workouts and adds free days. |
| How busy the gym is right now | Planned | Members see how busy the gym is now and the quietest times, from the QR check-ins, from #58. | The server counts check-ins per hour (the admin app already shows busy hours). The member app shows "Quiet now" or "Busy" and a weekly best-time chart. |
| Gym's logo on share pictures and a before/after share | Planned | Every shared workout picture carries the gym's name and logo; a before/after photo picture too, from #58. | Share pictures add the gym's logo and name. Progress photos get a "Share before/after" button. Photos leave the phone only when you tap share; body weight never shows. |
| Bring a friend | Planned | A member's invite link; the friend lands in the owner's enquiries list; free days when they join, from #58. | The member shares a link from the app. The friend fills a short form, which shows up in the owner's enquiries. When the friend joins, the member gets the free days the owner set. |
| The gym's own form videos | Planned | The trainer adds a YouTube link to an exercise; members see their own trainer, from #58. | Admin app: a video link field on any exercise in the gym's plans. The member's exercise page shows "Watch your trainer". |
| Ask your trainer | Idea | Parked (owner, 24 Oct). A chat between a member and the gym's trainer, from #58. | A message box in the member app and an inbox in the admin app, with phone alerts. Waits for the phone alerts setup (Firebase). |
| Ask the desk to freeze or renew | Planned | A member asks to freeze or renew from the app; the desk approves, from #58. | A request button on the membership card. The admin app shows the request; one tap freezes or renews with the tools it already has. |
| The gym's workout of the day | Planned | One workout from the trainer for everyone today, from #58. | The trainer picks or builds today's workout in the admin app. Members see it on Today and start it with one tap. |
| "Stronger than X% of your gym" | Idea | Parked (owner, 24 Oct: server space): compare your best lifts with your own gym, opt-in, from #58. | Needs every member's best lifts on our server. Waits for the paid server plan. |
| Follow gym mates (a feed of your gym) | Idea | Parked (owner, 24 Oct: server space and moderation), from #58. | See gym mates' workouts, with likes. Needs workouts on our server, a privacy choice and reports. Waits for the paid server plan. |
| Compare with a friend | Idea | Parked (owner, 24 Oct), from #58. | Pick a gym mate and compare the same lifts side by side. Comes after the feed. |

### Platform and quality
| Feature | Status | Details | How it will work |
|---|---|---|---|
| Free 3-month trial (HQ can extend to 6) | Waiting for you | Built. Switches on with your yes to one live server change (#55). | Every new gym gets 3 months free, no card. Your owner panel shows days left and extends a trial up to 6 months, with a reason. The gym owner sees the days left on Today. Nothing locks when it ends; members keep their app. |
| Prices and packs on the landing page | Live | Starter ₹999, Pro ₹1,999, AI ₹2,999 (coming) a month, yearly prices, and a founding-gym lifetime pack (₹29,999, first 50 gyms). Live 24 Oct. |
| Start the free trial from the landing page | Live | "Start free" buttons open the gym sign-up straight away (forgeai.aakashpahuja.in/start). Live 24 Oct. |
| Owner panel: search, filters, export, trial controls | Live | Search, sort, filters (on trial, ending soon, ended, paying), a summary, a gym list export (gym facts only) and confirm questions. Trial controls switch on with #55. Live 24 Oct. |
| "What's new" with a button to try each change | Live | v0.55.1: every note rewritten in plain words; a button opens the screen or setting it talks about; Settings shows the last 3 updates. |
| System owner panel (for you) | Live | 23 Oct: https://forgeai-hq.aakashpahuja.in, your Google sign-in only. Counts per gym, approve or pause gyms, delete requests, support access the gym owner can see, and a log nobody can edit. | Research first: what platform owners of gym software see, and what India's privacy law lets you see. The plan says what you see by default (counts and health, not members' personal data), how you open one gym's data when needed (with a reason, logged, the gym owner can see it), and a 3-step build order. |
| New brand name with a free domain | Live | MettleUp (#44): mettleup.fit is live, mettleup.in sends people there, E Forged logo; admin app at app.mettleup.fit, HQ at hq.mettleup.fit (24 Oct). |  |
| Block-proof server address | Live | Admin app since 22 Oct; member app since v0.54.0. A block of Supabase's own address (as in Feb 2026) can no longer stop the apps. |
| Automatic tests on every change | Live | Thousands of checks run on both apps before anything can ship. |
| Cloud phone tests | Live | Every release is tried on a cloud phone set up like yours, in about 2 hours, at no cost. |
| Release gate | Live | A new app version can't be published unless every test, phone run and review is green. |
| Server safety checks | Live | Tests prove one gym can never see another gym's records, on the live server too. |
| Private signing key | Live | The app's signing key is kept only on your PC, never in the public code. |
| Workouts stay on the phone | Live | Workouts never go to our server; the gym only gets check-ins, orders and messages. Changes when members' workouts on our server is switched on (#59, #60): then a copy is kept for members who sign in with Google, readable only by them. |
| Works without internet | Live | The member app logs workouts fully offline. |
| Owner inbox page | Live | A private page where you read answers, mark them read and send your picks. |
| Feature backlog with comments | Live | This list in your inbox, with a way to comment on any feature. |
| Play Store release | Live | 25 Oct: MettleUp 0.56.1 is in the Play internal test (testers on your two lists join at https://play.google.com/apps/internaltest/4701674448333062164) and the closed test with mettleup-testers@googlegroups.com is in Google's review. Store listing, icon, banner, 6 screenshots done. |  |
| Landing page, leads and new-gym onboarding | Live | Live since 22 Oct at https://forgeai.aakashpahuja.in/home/ (Hindi + English): a gym owner types their gym's name and sees the member app in their colours, then asks for a free demo (saved privately in Cloudflare; I tell you each one). "Open the demo gym" and "Sign in" lead to the admin app; new gyms get a "Get started" checklist. |
| Paid server with daily backups | Waiting for you | Supabase Pro: no pausing after a quiet week, daily backups, a restore drill before real data goes in (#27). | You upgrade Supabase to Pro (about ₹2,100 a month, spend cap on). The server then never pauses and keeps daily backups for 7 days. I practise a restore on the test server before the gym's real data goes in. |
| Test server before live | Planned | You asked why I cannot make it (#34): I can. I make the free second Supabase project in your Chrome and copy the tables into it. | A second, free Supabase project, "mettleup-staging", Mumbai. Every server change runs there first, with the same tests, before it reaches the gym. |
| Crash and outage alerts | Planned | Changed 25 Oct (#34): no new accounts needed. I build it on what we already have (Cloudflare and GitHub). | Both apps send a short crash note (screen, app version, error; never member data) to our own server, and HQ shows them. A check every 10 minutes opens the website, admin app and HQ; if one is down, you get an email and a GitHub phone alert. |
| Real-phone tests on Google's lab | Waiting for you | Built: Google's robot tries each release on 5 real phones; needs your free setup (#25). | Built. After each release, the cloud build sends the app to Google's Test Lab, where a robot taps through it on 5 real phones (Samsung, Xiaomi, vivo, OPPO, OnePlus) and reports crashes and broken screens; I read the report. Free; it starts once you do the 10-minute setup (#25). |
| "New version ready" in the app | Live | Members are told when an update is ready. |
| Privacy notice, terms and consent | Live | Notice, terms and gym data agreement complete (English + Hindi), contact@mettleup.fit; owners accept with a tick at "Create my gym" (0033 live 24 Oct). |  |
| Gym data export and delete | Live | A gym can download all its data in one tap (Excel), and ask to be deleted if it leaves. |
| Feedback by text or voice, sorted and fixed by Claude | Live | A "Send feedback" button in both apps; Claude sorts it every few hours, adds ideas to this list, fixes bugs through the full tests, and replies to the sender (#39). |
| Launch plan for the client gym | Waiting for you | 8-week trial: gym visit, data move from GGMS, training, side-by-side run, switch-over, go/no-go (docs/LAUNCH-PLAN.md). Starts with your gym visit and the GGMS export (#36). | Over 8 weeks: your gym visit and the GGMS export, two trial imports until the totals match, staff training, 10 days of entering everything in both systems, then switch-over mid-week. A go / no-go review in week 6; paid from week 8. GGMS stays paid until then. |

---

## 65. Your task: 1 minute so Google sign-in also works on the GitHub copy of the app — 25 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE (25 Oct)
**TASK DONE (25 Oct, 12:41 pm, via the page)**
**Why:** Google sign-in and Drive backup are now switched on (#60). They work on the Play Store copy. On the copy installed from GitHub they fail, because an old test entry in your personal Google project "GmailAPI" already holds the app's name and fingerprint. Google lets only one entry hold them. A safety check stopped me from changing your personal project without your word.
**YOUR REPLY (25 Oct):** yes, move the MettleUp Android client
**My answer:** I tried in your Chrome. The safety check blocked typing into your personal Google project, even with your yes. Nothing was changed. This one step is yours (1 minute); I do the rest the moment you tap "I have done it".
**Your task:** in Chrome, signed in as aakashpahuja1990, open https://console.cloud.google.com/auth/clients/240978491498-aoc7fplm0oilsev1nu5ujojqjcdhe7c3.apps.googleusercontent.com?project=gmailapi-491903. In the "Package name" box, replace com.mettleup.app with com.mettleup.app.retired. Press Save at the bottom. Then tap "I have done it".
**TASK DONE (25 Oct)**: you renamed the old entry. I made the GitHub-copy entry in the MettleUp project (301992813103-apaj51v12678arflaa0tg6i9aapbihu1) and typed it into Supabase. Saving a live server setting needs your word: say "yes, save the Google client in Supabase" in chat, or press Save on the Supabase Google page open in your Chrome (the secret box stays empty). **DONE:** you said yes; saved 25 Oct.

## 64. Privacy notice: 3 small lines so trainer measurements and diet plans can go live — 25 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DECIDED (25 Oct)
**What is ready:** trainer measurements and diet plans are built and tested (your pick A, from the GGMS menu). They are held because the privacy notice says measurements stay on the member's phone and the gym never sees them. That stays true for what a member logs. It is not true for what the trainer records at the desk, so the notice must say so before the feature goes live.
**The 3 changes (English and Hindi):**
1. The gym's records also include "body measurements your trainer takes at the gym, and diet plans your trainer sends you".
2. "The workouts and measurements **you log yourself** stay on your phone" (adds "you log yourself").
3. A new row: what is kept (date, weight, body fat, tape measurements, who measured, the desk's note), why (so the trainer follows progress and the member sees it in the app), who sees it (only that gym's staff and the member), how long (as long as the gym keeps its records).
**DECIDED (25 Oct, chat):** A. The notice (English + Hindi) now has the 3 lines and is live; server change 0035 is live (54 checks + safety 9 pass on the live server); the admin app has the Measurements card and the Diet plans page. Members see them in MettleUp 0.56.1 (Progress → Body, Gym → Diet plan).

## 63. Members under 18: add teen accounts (13 to 17) with a parent's OK? — 24 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DECIDED (24 Oct)
**READ (24 Oct, 05:36 pm, via the page)**
**You asked (24 Oct, chat):** "Why is the target age on play submission is 18 and above.. kids below 18 dont workout?"
**My answer:** they do, and many Indian gyms have teen members. It is 18+ only because of the law, from #29 (20 Oct):
- India's data law (DPDP Act) counts everyone under 18 as a child. Before keeping a child's data, an app needs a parent's checked OK, and it may not track or monitor a child's behaviour. A workout tracker keeps fitness and body data, so it counts. Its main duties start around 13 May 2027.
- Google Play: if we list 13 to 17, Play's teen rules apply (no ads aimed at them, safe content); we already meet these. Under 13 brings Play's stricter Families rules; not worth it for a gym app.
- The Play setting can be changed at any time; nothing is locked by choosing 18+ now.
**What teen accounts would mean:** at "Join your gym", a member under 18 enters a parent's mobile or email; the parent gets a one-time code and taps "I agree"; we keep the date and the parent's contact. No public sharing for teens (no rankings with their name, no share pictures with the gym logo by default). The gym owner sees the teen flag. About a week of work, plus a cost of about ₹0.2 per SMS code (email codes are free).
**DECIDED (24 Oct, 5:36 pm, via the page):** A: 18+ for the trial; teen accounts (13-17) with a parent's OK are built before the public launch.

## 62. Your task: tick "I'm not a robot" to finish the tester group (10 seconds) — 24 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**READ (24 Oct, 05:04 pm, via the page)**
**Why:** I filled in the Google group "MettleUp testers" (mettleup-testers@googlegroups.com; only people you add can join; you add emails directly) in your simpleapps108 Chrome window. Google asks for a robot check before it creates the group, and I am not allowed to do robot checks.
**Your task:** in the simpleapps108 Chrome window, open the tab "My groups" (groups.google.com). The "Create group" box shows "Captcha required": tick "I'm not a robot", then press "Create group". If the box is gone, open https://groups.google.com/my-groups and press "Create group" again: name MettleUp testers, email mettleup-testers.
**TASK DONE (24 Oct, chat)**
the group mettleup-testers@googlegroups.com exists. Add testers at groups.google.com → MettleUp testers → Members → Add members.

## 61. Pick the MettleUp logo — 24 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DECIDED (24 Oct)
**READ (24 Oct, 04:48 pm, via the page)**
**Why:** the logo goes on the app icon, the Play Store listing, the website and the gym owner app, so it is the one thing I should not choose for you. All six are drawn as clean shapes, tested at the size of a phone icon, on white and on black. Pictures: sent in the chat on 24 Oct; the page is in the project at branding/logo-options/index.html.
- **A · Ascent:** an M whose second peak stands higher: "this week beats last week". Ember orange, the colour the app already uses, so nothing else in the app changes colour.
- **B · Loaded:** a barbell loaded light to heavy. Pine green and brass. Blurs when very small.
- **C · Unbroken:** M and U as one line climbing from the floor. Volt yellow-green on graphite.
- **D · Up Arrow:** the U of "Up" becomes an arrow. Red. Can read like a U-turn road sign.
- **E · Forged:** a hex dumbbell head with an M struck through it. Molten orange.
- **F · Hidden Up:** a solid M with an up-arrow cut into its base. Cobalt blue, close to Hevy's blue.
**DECIDED (24 Oct, chat):** E · Forged. Your words: "love the dumbell feel".

## 60. Your task: switch on "Continue with Google" for members (about 20 minutes, free) — 24 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**TASK DONE (25 Oct, 11:44 am, via the page)**
**Why:** members sign in with Google so their workouts come back on a new phone (#43, #50). The app part is built and hidden; it shows only after these steps. The Play Store ID is com.mettleup.app (#57). This one setup also switches on Google Drive backup (it replaces #42).
**Your task:** open https://console.cloud.google.com/projectcreate and make a project named ForgeAI (skip if you already made one for Drive backup, #42). Then open https://console.cloud.google.com/auth/branding: app name ForgeAI (or the new name), your email as support and contact email, audience External; then Audience → "Publish app".
**Your task:** open https://console.cloud.google.com/apis/library/drive.googleapis.com and press Enable (for Drive backup).
**Your task:** open https://console.cloud.google.com/auth/clients → Create client → Android. Package name: com.mettleup.app. SHA-1: 97:F8:15:53:15:41:CF:71:D4:22:69:8F:5B:6B:84:69:AC:6F:93:88 (the app's public fingerprint, not a secret) → Create.
**Your task:** same page → Create client → Web application, name "ForgeAI app" → Create. Send me its Client ID in chat (it ends in .apps.googleusercontent.com; it is not a secret). Keep its Client secret for the next step only: never paste it in chat or a file.
**Your task:** open https://supabase.com/dashboard/project/hdxzqbdiokjklnypfisq/auth/providers → Google → turn on "Enable Sign in with Google". Client IDs: the Web client ID, a comma, then the Android client ID. Client Secret: the Web client secret. Leave "Skip nonce checks" off → Save.

## 59. Switch on branches, online terms and members' workouts on our server: three live server changes — 24 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE (24 Oct)
**READ (24 Oct, 03:35 pm, via the page)**
**What is built (24 Oct), tested and checked by a second reviewer; nothing is live yet:**
- **Branches (0031):** one owner runs several branches; each branch has its own members, money, staff and receipt numbers (B2/2026-27/0001); members can train at another branch; an "All branches" page.
- **Online terms (0033):** a gym owner must tick "I agree" before a gym is created; owners of existing gyms see it once; the date and terms version are kept and can't be changed.
- **Members' workouts on our server (0032):** each member's workouts, routines and body records are saved on our server, so a new phone gets them back after "Continue with Google". Only the member can read their own; the gym sees nothing. It stays hidden until you finish #60. About 1 KB a workout: the free plan holds about 1,500 members for 1.5 years.
- **Member import fixes** (no server change): a "Paid" column of Yes/No or dates is read correctly; a branch column; extra columns kept; bad rows listed to fix.
**What goes live with your yes:** I paste the three changes into the Supabase SQL Editor (in the Chrome window already signed in), run each one's test (each must say PASS), then put the new admin app, owner panel (HQ) and AI-matching server live. If a test fails I stop and change nothing more.
**Risk:** low. Each change only adds; gyms with one branch work exactly as before; a gym can always be checked in HQ.
**The privacy words (drafts ready, 24 Oct):** full text at https://github.com/aucksy/ForgeAI/blob/main/docs/launch/DRAFT-2026-10-24-server-copy-and-gym-terms.md (English and Hindi; every claim checked against the app; spots for a lawyer marked [LAWYER CHECK]).
- **Privacy notice, new part:** when a member signs in with Google, their workouts, routines, body weight, measurements, progress-photo dates (not the photos) and profile are saved on our server in Mumbai. Never the phone number. Only the member can see it; the gym cannot. "Delete my account" removes it at once.
- **Gym data agreement (about 1 page):** the gym owns its member records; ForgeAI only keeps them to run the service; no selling, no ads; the outside companies we use are named; we tell the gym of a breach within 24 hours; the gym can download everything any time; deleted within 30 days of a request; backups gone within 7 days (as the live notice already says); 30 days' notice before either side ends it; a member's own saved workouts belong to the member.
- **Two fixes I will make with it:** the "data agreement" link at "Create my gym" gets its own page (today it opens the privacy page); the old line "if we ever add AI features that use your data, we ask you first" is replaced by the truth about the AI import (below).
- **The AI import today:** it shows the AI the column names and 5 example rows, with phone numbers, emails and ID numbers hidden, but names and addresses visible. My pick: hide names and addresses too (the AI only needs the column names and a hint of the shape), so no member's name ever leaves the gym's computer.
**DECIDED (24 Oct, 3:35 pm, via the page):** switch them on: A; the privacy and agreement words: A (approve, and hide names and addresses from the AI import too).
**DONE (24 Oct):** 0031, 0033 and 0032 are live; every test passed (branches 115 checks, terms 27, workouts 58, security 9). The privacy notice and the gym data agreement are written into the app; the public pages go live when your complaints contact is filled in (#37). The AI import now hides names and addresses.

## 58. What other workout apps have that we don't, and what to build next — 24 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DECIDED (24 Oct) — build queued
**READ (24 Oct, 05:04 pm, via the page)**
**You asked (24 Oct, chat):** research the members' workout apps, find features we can build ourselves that would be valuable, and add them to the tracker.
**My answer:** I compared Hevy, Strong, Fitbod, JEFIT, Boostcamp, Alpha Progression, Gravl, Gymshark, MacroFactor, Fittr, cult.fit, HealthifyMe, FITPASS and gym-software member apps (Virtuagym, Trainerize, Glofox, Wellyx) with what ForgeAI already has. **For logging workouts we already match them** (rest timer, notification card, supersets, plates, warm-ups, swap, targets, charts, records, body map, Hevy/Strong import, Health Connect, Wear OS, offline, and no free-tier limits). The gaps are mostly things only a gym-linked app can do well, which is our edge. None needs a paid service.

| # | Feature | Who has it | Member | Gym | Effort |
|---|---|---|---|---|---|
| 1 | Monthly gym challenge with a ranking (top 10 of your gym, prize = free days) | Virtuagym, Trainerize, FITPASS, Fittr | High | High | Low-Medium |
| 2 | "How busy is the gym now" + best time to go (from QR check-ins) | PureGym, Planet Fitness | High | Medium-High | Low |
| 3 | Gym's logo on share pictures + before/after photo share | Hevy, Fittr (without the gym) | Medium-High | High | Low |
| 4 | Bring a friend: invite link, the friend lands in the owner's enquiries, free days when they join | cult.fit, PureGym, Glofox | Medium | High | Low-Medium |
| 5 | Strength level for each main lift (Beginner to Advanced) | Hevy, Boostcamp, Gravl | Medium-High | Medium | Low |
| 6 | Badge shelf (first 100 kg, 4 weeks in a row, 50 workouts) | Alpha Progression, Hevy, Trainerize | Medium | Medium | Low |
| 7 | "Which muscles are ready today" map | Fitbod ($15.99 a month) | Medium | Low-Medium | Low |
| 8 | Quick workout: "I have 30 minutes" | Fitbod, Alpha Progression, Hevy (paid) | High | Medium | Medium |
| 9 | The gym's own form videos (the trainer adds a YouTube link) | Trainerize, Virtuagym | Medium-High | Medium | Low-Medium |
| 10 | Ask your trainer (chat with the gym's trainer) | Trainerize, Hevy Coach, Fittr | High | High | Medium-High |
| 11 | Ask your own AI: one tap sends your workout history to ChatGPT or Gemini | Hevy | Medium | Low | Low |
| 12 | Ask the desk to freeze or renew from the app | Glofox, Mindbody | Medium | Medium | Low-Medium |
| 13 | Steps and water each day, and a step challenge | Fittr, FITPASS, Trainerize | Medium | Low-Medium | Low-Medium |
| 14 | The gym's workout of the day | Virtuagym | Medium | Medium | Low |
| 15 | Treadmill and cycle details (speed, incline, intervals) | Asked for on Hevy and Strong | Medium | Low | Medium |
| 16 | "Stronger than X% of your gym" (opt-in) | Hevy | Medium | Medium | Medium |
| 17 | 1-rep max and % calculator | Strong, Alpha Progression | Low-Medium | Low | Low |
| 18 | Follow gym mates: a feed of your gym only | Hevy, Fittr | Medium | Medium-High | High |
| 19 | Compare with a friend, train together | Hevy | Low-Medium | Medium | Medium-High |
| 20 | Log sets on the watch | Hevy, Strong | Low | Low | Medium-High |

**What members hate in the others (we win by not doing it):** basics locked behind payment (Hevy allows 4 free routines, Strong 3), rest timers that cut off, silly weight suggestions, weak cardio logging, sales pop-ups and refund fights, crashes after updates, broken imports, forced sign-up.
**Not proven:** the member and gym values and India-specific points (evening rush, treadmill use) are my judgement. Reddit blocked automated reading, so complaints come from review sites.
Items 1-14 are now in the Feature backlog as **Idea**, each with a Comment box. Items 15-20 stay here.
**YOUR REPLY (24 Oct, chat):** "I really like all these 20 features ... plan and start working on them. You can decide the priority ... park, chat with your trainer, and the rest seems fine to me." Then: "also park the feed things.. anything that will cost us more server space or money.. lets park". And: keep the app simple; organise every feature so it is easy to find, even if we reorganise what we built.
**DECIDED (24 Oct):** build 14, park 6.
- **Parked (they need more server space, or cost money, or few members would use them):** Ask your trainer (chat) · Follow gym mates (feed) · Compare with a friend · "Stronger than X% of your gym" (it needs everyone's best lifts on our server) · Log sets on the watch · Steps challenge across the gym (steps on your own phone still comes).
- **First:** a full map of the member app by a design review (every screen and setting, what to merge, move or rename), so the new features land in the right place and the app stays simple. The moves ship first.
- **Then, in this order (my call):**
  1. On your phone only, no server: strength level per lift · 1-rep max and % calculator · badge shelf · which muscles are ready today · ask your own AI · gym logo on share pictures + before/after.
  2. With the gym (uses data the server already has; tiny extra rows): how busy the gym is now · monthly gym challenge · bring a friend · the gym's workout of the day · the gym's form videos · ask the desk to freeze or renew.
  3. Bigger logging: quick workout ("I have 30 minutes") · treadmill and cycle details · steps and water.

## 57. The app needs a new Play Store ID — 24 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DECIDED (24 Oct)
**READ (24 Oct, 05:04 pm, via the page)**
**What happened:** creating the app in your Play Console (simpleapps108), Google said "com.forgeai.app is already in use". Another developer owns that ID, and every Play app needs its own one. The ID can never change after the first upload. Members almost never see it; it only shows in the Play Store web link.
**What changes for testers:** the new ID makes it a new app on phones. Before switching, move your own workouts with Settings → Export & import in the old app, then import them in the new one. I will write the steps.
**NEWS (24 Oct):** you are leaning to the name MettleUp (#44). The ID can never change, so it should match the brand. No public Play app uses com.mettleup.app or com.simpleapps.mettleup.
**DECIDED (24 Oct, Claude, as you asked: "disturb only when I am needed"):** com.mettleup.app. It works under any Play account, now or later.

## 56. Your task: put your Gemini key on this computer, so Claude's member-facing English gets a second opinion (5 minutes) — 24 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**READ (24 Oct, 10:58 pm, via the page)**
**TASK DONE (24 Oct 2026, 1:40 pm)**
**Why:** you asked that every word members read gets checked by Gemini, with the full context. The check is built: before any member-facing text ships, Claude sends the draft and its context to Gemini, compares the two versions and checks the facts. It runs only with your own Gemini key, and only you can make that key.
**Your task:** Open https://aistudio.google.com/apikey, press "Create API key", pick any project, and copy the key.
**Your task:** Open PowerShell on this computer and run this one line, with your key between the quotes: setx GEMINI_API_KEY "your-key-here"
**Your task:** Close the Claude app and open it again, so it can see the key. Then tell me "Gemini key is in" and I run a test.
**Done (24 Oct, 1:40 pm):** the key works; Gemini's free model (3.8 Flash) answered the first test. **Earlier note (1:20 pm):** I checked this computer and there is no GEMINI_API_KEY yet. Most likely the setx line ran in a different window or with a typo. Run it again in PowerShell (a normal window, not as admin), then close and reopen the Claude app.

## 55. Switch on free trials: one live server change (part 4 of your owner panel) — 24 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**READ (24 Oct, 10:58 pm, via the page)**
**What it does:** every gym gets 3 months free, with no card. Your owner panel shows how many days each gym has left. You can extend a trial up to 6 months, with a reason that is logged. The gym owner sees "Free trial: 41 days left" on the Today screen. When a trial ends, nothing locks: members keep their app, and the owner sees "Pick a ForgeAI pack to keep going". Your panel can also record each gym's pack (Starter, Pro, AI), monthly, yearly or lifetime, and paid until when.
**What is already live without it:** the new landing page with prices, the "Start free" sign-up, and the new owner panel (search, filters, export). Until you say yes, the panel shows "Trials need the database update".
**Safe:** it only adds new columns and two new owner-panel actions. It changes no member data. It was tested on a copy (41 checks pass). Existing gyms start their 3 months on the day it goes in.
**DECIDED (24 Oct 2026):** A: yes. Applied 24 Oct; the live test passed all 41 checks. Free trials are on: every gym has 3 months, and your owner panel can extend a trial to 6 months.

## 54. How much of a gym's data should you see in your owner panel? — 24 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**READ (24 Oct, 10:58 pm, via the page)**
**You asked:** in your owner panel (ForgeAI HQ), will you see each gym's member data? Do you need it? Should you have it?
**My answer:** No, not by default. Your panel shows each gym's own facts: name, owner, mobile, plan, trial, how many members, last activity. It never shows member names, phones or payments. Four reasons:
1. **The law.** Under India's data law (DPDP Act 2023), the gym owns its members' data and ForgeAI only keeps it for the gym. Looking at it without the gym's OK is a risk for you, not a feature.
2. **Trust sells.** The new landing page promises: "ForgeAI staff can't open your member list unless you let them in." That promise is what makes a nervous owner import his Excel.
3. **Safety.** If your Google account were ever stolen, a panel that shows every member's phone would leak thousands of people. Counts leak nothing.
4. **You don't need it.** Support works without it, and this is already live (built 23 Oct): the gym taps "Let ForgeAI support look (1 hour)" in Settings, or in an emergency you open a 15 to 60 minute window with a written reason. Both are read-only and logged, and the gym owner sees every look.
**DECIDED (24 Oct 2026):** A: your owner panel shows gym facts and counts only. Member records open only through support access (the gym's OK, or an emergency reason), logged and shown to the gym owner. That is how it works today; nothing to build.

## 53. Switch on the owner's reminder switches (one live server change) — 23 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** Done (live 23 Oct)
**You asked (23 Oct):** automatic app reminders to members (plan ends in N days, and every other useful case), each one switched on or off by the gym owner, the common ones on.
**My answer:** Built. The member's phone sets each reminder itself (at most one a day, 9:30 am), so it works without internet and costs nothing. The phone part ships in v0.55.0 and uses the default switches (common ones on). The owner's own on/off list in the admin app needs one live server change (supabase/migrations/0029_auto_reminders.sql). It only adds: a new table and 3 new functions; it changes no existing function and no member data. Its server tests passed.
**YOUR REPLY (23 Oct):** "yes to #53"
**DECIDED (23 Oct 2026):** A: applied to the live server the same day; its live test passed (60 checks) and the full security test passed.

## 52. Your task: two keys to unlock your owner panel (ForgeAI HQ), about 20 minutes — 23 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** Done
**READ (24 Oct, 10:59 pm, via the page)**
**Why:** your owner panel (#51) is built and online at https://forgeai-hq.aakashpahuja.in. All its server parts are live and tested. It stays locked ("not set up yet") until it has a gym-server key and a Google sign-in client. Only you can make these. Only your Google account (aakashpahuja1990@gmail.com) can sign in.
**Your task:** Make the gym-server key: open https://supabase.com/dashboard/project/hdxzqbdiokjklnypfisq/settings/api-keys, open "Secret keys", press "New secret key", name it hq, and copy it.
**Your task:** Make the Google sign-in client: open https://console.cloud.google.com/auth/clients (in your ForgeAI project; if you have no project yet, first make one at https://console.cloud.google.com/projectcreate named ForgeAI, then fill https://console.cloud.google.com/auth/branding with app name ForgeAI, your email, audience External, and press "Publish app"). Press Create client, pick Web application, name it ForgeAI HQ, and under "Authorized redirect URIs" add https://forgeai-hq.aakashpahuja.in/auth/callback. Press Create. Copy the Client ID and the Client secret.
**Your task:** Paste all three into Cloudflare: open dash.cloudflare.com → Workers & Pages → forgeai-hq → Settings → Variables and Secrets → Add. Type "Secret" each time. Name SUPABASE_HQ_KEY with the Supabase key, GOOGLE_CLIENT_ID with the Client ID, GOOGLE_CLIENT_SECRET with the Client secret. Save. Then tell me "HQ keys are in" and I test the sign-in.
**TASK DONE (23 Oct 2026)**
Keys in; you signed in to https://forgeai-hq.aakashpahuja.in (both your Google accounts are allowed) and it lists every gym.

## 51. Your own panel for the whole system ("ForgeAI HQ"): the plan — 23 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** Done: live 23 Oct at https://forgeai-hq.aakashpahuja.in
**READ (23 Oct, 08:32 am, via the page)**
**You asked:** do you need an admin panel as the owner of the whole system? Think about data control and
governance; maybe you log in and see most of the data. Decide the correct implementation.
**My answer:** Yes, before the second gym. I decided the shape:
- **A separate small app, "ForgeAI HQ"**, on its own address. Only your Google account gets in (with a passkey
  and 2-step). Not a "super owner" login inside the gym admin app: that app signs in with a 6-digit code and
  keeps a copy of a gym on each desk computer, so one mistake there must never open every gym.
- **By default you see counts and health per gym, never people:** members, check-ins, shop orders, money
  totals, last activity, failed sign-ins, feedback, leads, AI use and cost, app versions.
- **Opening one gym's records = "break-glass":** the gym grants support access for an hour, or you open it in
  an emergency with a typed reason. Read-only, 60 minutes, logged, and the gym owner always sees when you
  looked and why.
- **Actions:** approve or pause a new gym, create a gym from a lead, reset an owner's sign-in, delete requests
  with a 30-day countdown, export a gym's data, AI limits and cost.
- **Why the law matters:** each gym is responsible for its members' records; ForgeAI handles them for the gym.
  Looking at members' personal data for your own reasons would give ForgeAI its own legal duties, so counts
  are the default. Every HQ action goes into a log nobody can edit, kept 2 years in Mumbai.
- **Found on the way:** today anyone on the internet can create a gym (up to 5 an hour from one address) and
  nothing tells you. Step 2 adds "approve new gyms".
- **Build in 3 steps, about 5 working days, ₹0 a month:** 1) Look (about 1 day), 2) Act (1.5-2 days),
  3) Break-glass and logs (2-3 days). Each step needs your yes for one live server change (it only adds).
  Step 1 also needs a 10-minute free Cloudflare sign-in setup and a new Supabase key that you make.
**YOUR REPLY (23 Oct, 08:32):** A. "you make the best decisions and make it all LIVE"
**DECIDED (23 Oct 2026):** A: all 3 steps, built and taken live by me; I tell you what I changed on the live server each time.
**Details and sources:** https://github.com/aucksy/ForgeAI/blob/main/docs/overhaul/research/R-owner-panel.md

## 50. Members' workouts on our own server: how many fit in the free plan? — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** PLANNED
**You asked:** if we store every member's workouts in our own database (Supabase), how many members fit in the
free plan, and for how long, if they start today?
**My answer:** Many more than we will have for a long time, if we store them the compact way.
- **Measured on your real history** (487 workouts): about 18 sets and 4.4 exercises a workout. Packed as one
  record per workout, a workout takes about 450 bytes, about 1 KB with the database's own overhead. Stored the
  simple way (one record per set) it takes about 4 KB.
- **The free plan** (supabase.com/pricing, read today): 500 MB database, 5 GB of downloads a month. I keep 100 MB
  for the gym records (members, payments, check-ins, shop, messages), so 400 MB is for workouts.
- **A typical member** trains 3 times a week (about 13 workouts a month): about 13 KB a month, 0.16 MB a year.

| Members starting today | Compact way: full after | Simple way: full after |
|---|---|---|
| 100 | about 26 years | about 6.5 years |
| 300 | about 9 years | about 2 years |
| 1,000 | about 2.5 years | about 8 months |
| 3,000 | about 10 months | about 2.5 months |
| 10,000 | about 3 months | under 1 month |

- **Downloads are not the limit:** a member sends only each new workout (about 1 KB); a new phone downloads a
  year of history in about 160 KB. Even 1,000 new phones in a month use about 160 MB of the 5 GB.
- **The paid plan** (about ₹2,100 a month, #27) has 8 GB: 20 times more (1,000 members for decades, 10,000 for
  about 5 years), plus daily backups. **The free plan keeps no daily backups** and pauses after 7 days unused, so
  members' history there could be lost in one bad day. If workouts go to the server, the paid plan comes first.
- **Three things come with it:**
  - Each member needs a sign-in (#43), so their workouts are theirs on any phone.
  - The app's promise "your workouts stay on your phone" changes: a clear consent screen and new privacy
    notice lines, in your approved words.
  - Workouts count as health-related data under India's privacy law: we must protect and delete them on request.
- **What it unlocks:** a new phone gets everything back without Google Drive, the trainer view (#46) and owner
  reports can use real workouts, and the web admin could show a member's progress.
**DECIDED (24 Oct 2026):** A, changed by your note: members' workouts go to OUR server from the start, the way Hevy does it, on the free plan we have now. Google Drive becomes an extra copy only for people who want one.
**YOUR REPLY (24 Oct):** Apps like Hevy keep data in their own database; we should not depend on Google Drive; use the free Supabase now (it fits about 1,500 members), try 10-20 members, decide later. "You decide."
**My answer:** Agreed, and that is what I will build. Every workout a member saves goes to our server too, so a new phone or a reinstall brings everything back after sign-in. The free plan holds about 1,500 members' workouts. Before it goes live I will ask your yes for the new server tables (one live server change).

## 49. Offers and messages for gym owners, with the workout reward: the plan — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** Done
**READ (23 Oct, 08:49 am, via the page)**
**You asked:** a full offers and messages section for the gym owner: holiday closures to everyone, fee offers,
and a reward that nudges members to track workouts ("track 10 workouts, get 3 extra days"). You do Firebase.
**My answer:** Building it in three steps. Step 1 needs nothing from you, and I have started it.
- **Step 1 (building now, no live server change):** 26 ready messages in English and Hindi (gym closed, new
  timings, fee offer, festival, renewal, birthday, welcome, "haven't seen you"...), blanks filled with boxes
  instead of typing into brackets; a "who gets it" picker (plans ending this week, ended, stopped coming, a plan,
  a batch, birthdays); a WhatsApp "send to next" list from your phone for members without the app; "Messages &
  offers" as its own menu item; Today nudges ("5 plans end this week").
- **The workout reward, first as a trial with nothing sent to the server:** the member app shows "Show my
  workouts to the desk" with a short code; the desk types it in, the admin app checks the dates against its own
  check-in register ("9 of 10 match"), and you give the days with the existing gift button.
- **Stopping cheating:** a workout counts only on a day the gym's register shows a check-in, and only if it ran
  20+ minutes with 6+ sets. A sofa workout earns nothing; the worst a cheat wins is coming to the gym 10 times.
- **Evidence:** rewards raise gym visits while they run; a small part lasts, mostly in people who were not
  regulars. So the reward stays small and repeatable.
- **No GST and no receipt for the free days** (a free extension is not a sale). I found and am fixing a related
  bug: a reprinted old receipt showed the longer end date as if the days were paid for. It will print the dates as
  sold, plus "Extended free by 3 days (reward)".
- **Step 2 (needs your yes to a live server change):** members join the offer in the app, progress "6 of 10",
  only the DATES of counted workouts leave the phone (after "Join the offer"), the desk's one-tap Give button,
  in-app messages to a group (not only everyone), messages at a chosen time.
- **Step 3 (after your Firebase setup):** pop-up notifications, and automatic birthday / plan-ending / welcome
  messages at 9 am, never more than one a day per member.
**DECIDED (23 Oct 2026):** A, plus your addition: each offer has a setting "Give the days by themselves" or "I give them" (the desk taps Give). Building now; before members see it you approve the consent words and the privacy lines.
**BUILT (23 Oct):** step 2 is built, reviewed (1 must-fix and 4 smaller fixes, all done) and tested. The admin part is live: Messages & offers → Workout offer says "not switched on for your gym yet" until the server change. The member app card stays hidden until then too.
**What the member sees before joining (consent words):**
> Join: 10 workouts, 3 extra days. How it works: on a day you check in at <gym>, log a workout of at least 20 minutes with 6 or more sets in ForgeAI. Log 10 of them within 30 days of joining, and 3 days are added to your membership. What the gym gets: only the dates of those workouts. Never your exercises, weights, sets, body weight or photos. Who sees it: the owner and front desk of <gym>. Stop any time: Gym tab → Workout offer → Leave the offer. The dates are deleted and nothing more is sent. Questions or complaints: ask at <gym>'s front desk. If it is not solved, you can complain to the Data Protection Board of India. Not joining changes nothing about your membership. [Join the offer] [Not now]
**New lines for the privacy notice** (English and Hindi, full text in docs/overhaul/offers-step2-words-for-approval.md): 1) if you join, the app sends your gym only the dates of the workouts that count, only while you are in the offer; 2) what we keep and for how long: dates deleted when you leave, or 90 days after the offer ends; 3) how to stop: Gym tab → Workout offer → Leave the offer; 4) "Last updated" with what changed.
**YOUR REPLY (23 Oct, 08:49):** A. "I will setup firebase but I think we need to think about changing branding first.. where is the answer to branding related question. I think we need a search box also in this tracker"
**DECIDED (23 Oct 2026):** A: the words as written. Next: the live server change (needs you to sign in to Supabase once in my browser), the privacy notice lines, the member app release. The branding answer is #44 (5 names to pick from); a search box is being built into this page.
**TASK DONE (23 Oct, you signed in)**
**LIVE (23 Oct):** the server change is on the live database (its own test: RESULT PASS, 71 checks; the security test: RESULT PASS, 9 checks). The privacy notice has the 4 approved lines (English and Hindi, "Last updated: 23 Oct 2026"). The member app with the offer card is v0.55.0, in its phone tests now; owners can start an offer in Messages & offers → Workout offer.
**Details and sources:** https://github.com/aucksy/ForgeAI/blob/main/docs/overhaul/research/R-offers-notices.md

## 48. One extra rep on every set, or the app's targets? — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** Answered
**You asked:** you aim for one extra rep on every set. Is that better for long-run progress, or should you
follow the app's targets?
**My answer:** Both work. Keep your habit, with one rule from the app.
- **Why both work:** muscle and strength grow when you keep doing a little more over time. More reps at the
  same weight counts just as much as more weight. A 2022 study (Plotkin and others) had two groups train for
  8 weeks: one added weight, the other added reps. Both gained about the same muscle and strength.
- **The catch with +1 on every set:** it cannot go on for ever. Each set gets longer, the last sets fail
  first, and you end up grinding every set to the limit. That tires you more and slows you down over months.
- **What the app does:** set 1 aims for one more rep than last time; the other sets aim to match last time.
  When your sets reach the top of the rep range, the app adds weight and starts the reps lower again. That
  is the same idea as yours (called "double progression"), paced so it lasts.
- **My advice:** treat the app's number as the floor. If a set feels easy (you could do 2 or more reps
  more), take the extra rep. Stop a set when you have about 1 rep left, not at total failure. When the app
  says "Up", take the weight, even if it means fewer reps that day.

## 47. AI import of a gym's old records: the plan — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** Done
**TASK DONE (23 Oct, 08:54 am, via the page)**
**KEYS IN (23 Oct):** both keys are saved as secrets; the AI address now answers "sign in first" instead of "not switched on". Proved 23 Oct: a real test-gym register with odd column names (Hindi words) was matched by the live AI in 6 seconds (live run 39895450334, step XJ7).
**READ (23 Oct, 08:55 am, via the page)**
**You asked:** gym owners must bring their old data in without your help. Use AI in the admin app's
import, with a database that can take new kinds of fields for each gym, and think through the problems.
**My answer:** Yes, build it. Others do the column matching with AI too (HubSpot, Flatfile). Indian gym
software only offers a fixed upload template, and nobody reads a photo of a paper register.
- **What the owner does:** upload the file (Excel or CSV first; photos of a register later). The AI says
  which column is which ("Mobile No." is the phone, "Pkg" is the plan). The owner sees a preview with
  every problem marked, fixes it, presses Import. One tap undoes the whole import.
- **New kinds of information** (locker number, blood group, referred by) become that gym's own extra
  fields, shown on the member's page. They are stored as data, not as new database columns: instant,
  safe, and no change to the live database. Adding real columns for each gym would lock a table every
  gym shares; real products do not do it.
- **The AI only points; our tested code reads.** For a spreadsheet the AI sees only the column names and
  5 example rows, with mobile numbers hidden. Our own code reads every date, phone and rupee amount, so
  the AI cannot invent a member or a payment.
- **Problems and fixes:** the same member twice (matched by phone, the owner picks); plans that don't
  match ours (the owner maps each one once); dates like 05/06 (read the whole column to tell DD/MM from
  MM/DD); dues and part payments (kept as dues, never as paid); a file imported twice (found and skipped);
  very large files (done in parts).
- **Cost:** about ₹0.40 per spreadsheet, about ₹2.50 per photo of a register page. The photo price at
  Google roughly doubles on 1 January 2027.
- **A bug I found on the way:** a member imported as "Mr. Ramesh Gupta" is refused when he later joins the
  member app as "Ramesh" (the check reads his first name as "Mr"). I am fixing that now; it affects
  today's import too.
**DECIDED (23 Oct 2026):** A, with your addition: the cheapest AI first (Google Gemini, on your Google AI Pro developer credit), then Claude Haiku 5.5 (the cheapest Claude) if Gemini fails. Building now without keys; the import works by hand until the keys are in.
**BUILT (23 Oct):** live in the admin app. Import → pick a file → "Ask AI to match the columns?" appears when a column is left unmatched. Until the keys are in, it says AI is not switched on and the owner matches by hand. Each gym gets 20 AI reads a day.
**Your task:** Make a Gemini key: open aistudio.google.com, tap "Get API key", then "Create API key". Use a Google Cloud project with billing switched on (your Google AI Pro developer credit pays it): on the free tier Google may use what is sent to improve its products.
**Your task:** Make a Claude key: open console.anthropic.com, then API keys → Create key. Check that the Console shows credit (the Claude chat plan and the Console are billed separately).
**Your task:** Paste both into Cloudflare: dash.cloudflare.com → Workers & Pages → forgeai-panel → Settings → Variables and Secrets → Add. Type "Secret", name GEMINI_API_KEY, paste the Gemini key, Save. Again with the name ANTHROPIC_API_KEY for the Claude key. Then tell me "keys are in" and I test one import.
**Details and sources:** https://github.com/aucksy/ForgeAI/blob/main/docs/overhaul/research/R-ai-import.md

## 46. Trainers see their members' progress: the plan — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DECIDED (24 Oct) — build queued
**READ (24 Oct, 04:54 pm, via the page)**
**You asked:** trainers should see if members are progressing, encourage them, and help the gym sell
personal training. Research it and decide the best way.
**My answer:** Build it as a tool that tells a trainer who to talk to today and what to say, not a sales list.
- **The member chooses.** Sharing is off until the member turns it on, picks one named trainer and taps
  "Share". The trainer accepts them in person at the gym.
- **Only a weekly summary leaves the phone:** workouts a week, total kg lifted a week, the best set on their
  5 most-done exercises, and new records. Body weight, photos, notes and food never leave the phone.
  Stopping deletes the shared copy at once.
- **The trainer sees "My members":** one plain line each, like "New best: Leg press 120 kg × 10", with
  ready WhatsApp messages ("well done", "how's it going?"). You see all of it.
- **Why:** no Indian gym software does this. Hevy Coach shares everything once linked, body weight and photos
  too, so keeping those private is our edge. Members whom staff speak to regularly cancel less (UK gym
  studies). Chasing struggling members with offers backfired elsewhere (10% left against 6% left alone), so
  version 1 has an "Ask my trainer for help" button instead: the member asks.
- **A safety point I found:** trainers sign in as front desk today. A "Trainer" tick on a person is the safe
  way to add them; a new role done the quick way would give trainers owner powers (money totals, cancelling
  receipts).
- **India's privacy law** needs separate consent for coaching and for sales; its main duties start in May 2027.
**Details and sources:** https://github.com/aucksy/ForgeAI/blob/main/docs/overhaul/research/R-trainer-view.md
**DECIDED (24 Oct 2026):** A, with your change: no consent tick for members.
**YOUR REPLY (24 Oct):** Skip member consent; the gym gives the app free as part of the membership; mention it in the terms with a positive spin, unless there is a legal risk.
**My answer:** We can skip the tick box, with one small safety net. India's data law (DPDP Act 2023) allows this without a tick when the member is told clearly and keeps the right to say no. So:
1. **When a member joins a gym**, one line on the join screen: "Your gym's trainers see your workouts, so they can help you progress."
2. **An off switch** in Settings → Your gym: "Share my workouts with my gym" (on). Very few will turn it off, and having it protects you and the gym.
3. **The terms and the privacy notice** say the same, in the positive way you asked.
Without the off switch, a member could complain that a "no" was ignored, and that is the one real legal risk. Before it goes live, you approve the exact words.
**DECIDED (24 Oct, 4:54 pm, via the page):** A: a line on the join screen + an off switch in Settings; no tick box. Claude builds the trainer view next, after the MettleUp release.

## 45. Count reps by listening: the plan — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**You asked:** in a hard set people lose count. Could the app listen to the member counting (earbud mic)
and log the set by itself? Or is there a better way?
**My answer:** Build the listening idea, with one change: use the phone's own microphone, not the earbuds'.
- **Why not the earbud mic:** on most budget Bluetooth earbuds, opening the earbud mic turns the member's
  music into phone-call sound for as long as it listens. Android's own guide confirms this. With the phone's
  mic the music stays perfect; the phone must be within about 1-2 m (on the bench or the floor, not in a
  pocket). The earbuds still carry the app's voice back: "ten, logged".
- **The other ways are worse:** watch counting gets 44-67% wrong on some exercises and fails on legs and
  machines (your Pixel Watch 4 has no rep counting). Camera counting double-counts when people walk past.
  Earbud-button counting takes over the music buttons. No big app (Hevy, Strong, Fitbod, cult.fit) counts
  by listening; the few small ones that try have poor reviews.
- **First version:** with the app open and the screen on. It hears numbers in English or Hindi ("ek, do,
  teen") and shows the count large on the set row. "Done", "ho gaya" or "bas" ticks the set, with Undo. It
  never ticks on silence and only takes the next number in order, so a trainer counting nearby is ignored.
  Everything runs on the phone; nothing is sent anywhere. About 3-5 days of work, no money.
- **Test first on your phone:** if it gets 9 of 10 sets right over 3 workouts at your gym, I finish it
  (screen-locked listening, a "Count for me" voice for people who count silently).
**Details and sources:** https://github.com/aucksy/ForgeAI/blob/main/docs/overhaul/research/R-voice-rep-count.md
**DECIDED (24 Oct 2026):** B: not now.

## 44. Pick a new brand name (its domains are free today) — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DECIDED (24 Oct)
**TASK DONE (24 Oct, 05:00 pm, via the page)**
**READ (24 Oct, 04:03 pm, via the page)**
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
**YOUR REPLY (23 Oct, 09:46):** "Nah I want something in English"
**NEW ANSWER (23 Oct): English names only.** I checked 625 more. Every plain English word is taken as a .com (Uptick, Regulars, Mainstay, Topset...). What is still free is two words joined: "lift" or "rep" plus a progress word. All five below have .com, .in and .app free at the normal price (GoDaddy India: none premium):
- **Liftchase**: "chase your next lift". Names the "kg to beat" screen and the reason to come back. 2 syllables; nothing anywhere uses it. Nearest Indian trademark: "The Fit Chase" (the official search must clear it).
- **RepAhead**: "stay a rep ahead". The plainest English; no app uses it, but similar marks exist ("Stepahead", "Getahead"), so it is harder to protect.
- **Repnotch**: "notch up one more rep". But "Notch – Gym & Fitness Tracker" is on Google Play.
- **Kilonest** and **Kilostreak**: risky: a US company called Kilo already sells gym software with a member app.
Cost: about ₹3,100 a year for .com + .in + .app. Before paying for a logo, the official trademark search (needs a person, it has a captcha) or a lawyer. Buy the .com and .in the day you pick: 9 names I tried were taken in the last 30 days.
**YOUR REPLY (23 Oct, chat):** "suggest me more brand names... not feeling it"
**ROUND 3 (23 Oct): new styles, no more lift/rep/kilo pairs.** I checked about 315 more. Every short real English word is taken (Stride, Tempo, Ember, Vigour, Encore, Outdo, Summit...): .com always, .in and .app usually. What is left is made-up words built from real words, and short phrases:
- **Habitsmith**: "we forge the gym habit" (keeps the "forge" story). .in, .app and gethabitsmith.com free; habitsmith.com is for sale at about ₹2.8 lakh.
- **Still Not Out**: cricket's "still in the game". .com, .in and .app all free at the normal price. "Not Out" is crowded in the trademark register.
- **Strongsmith**: "the smith who makes you strong". .in, .app and the "get" .com free; close to the big "Strong" gym-log app.
- **Better Than Last**: "beat your last session". All three free; two small apps have a similar name.
- **Push Through**: what members do on a hard day. .in, .app and the "get" .com free; a game called "Push Through 3D" exists.
- **Gritwell**: "doing well through grit". .in and .app free; a US leather brand owns the .com.
- **Back Tomorrow**: the retention goal in two words. .in and .app free; the .com costs about ₹94,000 and it reads like a "shop closed" sign.
- **Fortwell**: "the strong place you come back to". .in and .app free; Sun Pharma uses "Fortwell" for a medicine.
The official trademark search still needs a person (it has a captcha) before you pay for a logo.
**YOUR QUESTION (23 Oct, chat):** one name that works for both the members' app and the gym software, or two separate brands?
**My answer:** one brand, with plain labels: "<Name>" for the members' app, and "<Name> for Gyms" for the admin app and website. Why:
- Gyms are how members find us: every member who installs from a gym poster spreads the same name, and "your members already use <Name>" sells the next gym. Two brands throw that away.
- Half the work and money: one set of domains, one trademark, one Play listing and one logo, for one person to run.
- Members already see their own gym's logo and colours inside the app, so our name stays quiet next to theirs.
- This is what Hevy (Hevy and Hevy Coach), Virtuagym and Trainerize do. Two brands mostly happen after one company buys another (Mindbody and ClassPass).
- The catch: the name must sound right both on a member's home screen and on a gym owner's bill. That rules out Still Not Out (fun, cricket) and makes Liftchase lean to members. Habitsmith passes both: "habit" is what owners pay for (members who keep coming) and what members want.
**YOUR REPLY (23 Oct, chat):** "you're not ... giving me a good name ... ForgeAI is something I loved immediately ... none of this ... connects with weightlifting and workout. Give me at least 10 to 20 options."
**ROUND 4 (23 Oct): names that feel like ForgeAI and like lifting.** 379 more names checked; every "free" domain below confirmed at the normal price.
- **Can ForgeAI stay? No, not as the public name.** forgeai.com is a live US AI company; .in, .app and getforgeai.com are taken; Google Play India already has "Forge AI Workout Tracker" and "ForgeFit: AI Fitness Coach" (10,000+ downloads each) and 10+ other Forge gym apps; "Forge Fitness" is a registered trademark for gyms. It stays our internal project name.
- **Forge family:** **Liftforged** (made strong by lifting, like hand-forged steel; .com/.in/.app free; low risk) · **ForgeKG** (ForgeAI with KG for AI; all free; medium) · **Forgeyard** (.in/.app/getforgeyard.com; .com for sale ₹3.5 lakh) · **Barforge** (the barbell is the forge) · **Forgehall** · **Strongforge** · **Forgeiron** (all .in/.app + a "get" .com). Any "Forge" name sits among the Forge apps in store search.
- **Smithing words:** **AnvilKG** (all free) · **Foundrylift** (all free) · **Ironsmithy** (all free) · **Temperiron** (all free; "temper" can read as anger) · **Anvilstrong** (.in/.app + "get" .com).
- **Lifting words:** **IronKG** (iron and kilos, the words every lifter uses; all free; many "Iron" apps) · **Chalkiron** (chalk on the hands, iron in them; all free; low risk) · **Heavyiron** (.in/.app + "get" .com; low-medium) · **Ironrack** · **Ironhall** (close to "Ironhill" beer).
- **Hero names:** none survived (Atlas: "Iron Atlas" gym software; Titan: Tata; Hercules: Indian bicycles; Milo: a new strength app).
Buy the .com and .in the day you pick: 12 names checked were registered by someone in the last 3 months.
**YOUR 40 NAMES (23 Oct, from other AI tools):** every .com is taken; 25 have the .in free; 8 of those dropped for a same-name gym app or a strong clash (Knurl, Outlift, Grindset, Beatlast, Heavier, Stepweight, Moreweight, Passlast). The clean ones, cheapest .com first (.in about ₹899 a year for all): **Castrep** (.com expires about 24 Oct: normal price if caught), **Sleevelock** (.com ₹2.2 lakh), **Upweight** (₹3.4 lakh), **Platecast** (₹3.9 lakh), **Gainset** (₹6.6 lakh). With a catch: Plusplate (₹3.3 lakh; a dishwashing brand), Pinload (₹4.2 lakh; a Pinterest downloader), Addiron (₹4.5 lakh; reads like iron tablets), Pushpast (₹11.4 lakh), Mettled (₹31 lakh), and Smelt, Barcast, Barweld, Nextplate, Hardset, Climbset, Peakrep (.com not for sale; .in only). Full table: the research file, round 5.
**YOUR 80 NAMES (24 Oct, chat):** "research the list of names I just shared ... give me a table of the shortlisted ones with the prices and details."
**ROUND 6 (24 Oct): your 80 "-Book / -Log / -Journal" names.** I checked all 80 for .com, .in and .app at the official registries, then searched Google Play, the App Store and the US trademark register for the best 20.
- **No strong name has a free .com.** The 6 with a free .com are weak (MettleBook sounds like "metal" on a call; RackJournal and LoadJournal are long).
- **Top pick: SetBook.** Every member knows "set"; "set hai" means "all good"; "Book" reads like a register for owners, the way Khatabook does for shops. setbook.in is free. setbook.com belongs to someone with no website and is not for sale; it expires 21 Dec 2026. Meanwhile setbookgym.com and usesetbook.com are free. No trademark found; only a small music setlist app shares the name.
- **Backup: RackBook.** The only good name with .in and .app free and a .com you can buy today ($3,495, about ₹3.3 lakh). No clash. On a call it can sound like "rock book".
- **Keeps "Forge": ForgeBook.** No clash; .in free; forgebookapp.com free; forgebook.com is parked with no price.

| Rank | Name | .com | .in | .app | Clashes | Score /10 |
|---|---|---|---|---|---|---|
| 1 | SetBook | Taken, no site, not for sale (expires 21 Dec 2026) | Free | Taken | Small setlist app; no trademark | 8 |
| 2 | RackBook | For sale, about ₹3.3 lakh | Free | Free | None | 7.5 |
| 3 | ForgeBook | Parked, no price | Free | Taken | None | 7.5 |
| 4 | LiftBook | Taken (live) | Free | Taken | 4 tiny LiftBook apps; "lift" = elevator or a ride in India | 6.5 |
| 5 | AnvilBook | For sale, about ₹56,500 | Free | Free | None; few members know "anvil" | 6.5 |
| 6 | IronCard | Held by a reseller | Free | Free | A metal bank card in Kazakhstan | 6 |
| 7 | MettleBook | Free (about ₹1,000 a year) | Free | Free | None; heard as "metal" | 6 |
| 8 | LiftDiary | Taken (live) | Free | Free | 3 LiftDiary apps | 5.5 |
| 9 | RackJournal | Free | Free | Free | None; long, member-only feel | 5.5 |
| 10 | HeavyBook | For sale, $2,695 | Free | Taken | None; sounds like a textbook | 5.5 |

**Dropped:** "Cast" (sounds like "caste"), "Bar" (a liquor bar), "Steel" (a live STEELBOOK trademark; utensils in India), Ledger/Chronicle/Folio (hard words), names whose .com is a live business or app (RepLog, SetLog, RepCard, IronDiary, Lift Card...), Weld/Grind/Press/Stack (factory feel), "Sheet" (sounds like the owner's import sheet), PRBook ("PR" is a banned word), MaxBook (Max Healthcare), most "Rep" names (crowded with small apps).
**Cost:** .in about ₹750-950 a year. A free .com about ₹1,000-1,600 a year (Porkbun or Cloudflare about ₹1,050 every year; GoDaddy/Hostinger ₹1 only with 3 years paid, then about ₹1,500-1,600). Cloudflare does not sell .in. Namecheap says .com prices go up on 1 Nov.
**Not proven:** the official Indian trademark search has a captcha, so I used a copy of the register (top 30 matches). Ask a lawyer, or search ipindia.gov.in yourself, before paying for a logo.
**YOUR REPLY (24 Oct, chat):** "I like MettleBook - can we have MettleLogs, MettleTracker, MettleUp, MettleBooks - think of more around Mettle that gives a feel of progressive overload"
**ROUND 7 (24 Oct): Mettle names.** "Mettle" means the courage to keep going when it gets hard; "test your mettle" is a common phrase. I checked 60 Mettle names at the official registries (.com, .in, .app).
- **Your 4:** **MettleUp**: .in and .app free; the .com is parked at GoDaddy (bought 2023, renewed to 2027, no price shown; an offer may work). **MettleLogs**: all three free. **MettleTracker**: .in and .app free; the .com is a live app, "Mettle - The Private Gym for Social Confidence". **MettleBooks**: .in and .app free; the .com is a live online shop.
- **New ones with an "add a little more each week" feel, all 3 endings free at the normal price:** **MoreMettle** ("one more rep" = more mettle) · **MettleStep** (one step up each week) · **MettleClimb** · **MettleNotch** (notch it up) · **AddMettle** · **MettleRaise** · **MettleLadder** · **MettleNext** · **MettleBuild** · **MettleKG** · and your **MettleBook**.
- **Taken .com:** MettleGain, MettleRise (a software company), MettleSet (coming soon page), MettleOn, MettlePlus, MettleProof, BuildMettle, ProveMettle, MettleGym, MettleFit, MettleClub, MettleForge, Mettlesmith, MettleTrack and others.

| Name | .com | .in | .app | Overload feel | Note |
|---|---|---|---|---|---|
| MettleUp | Parked (GoDaddy, no price) | Free | Free | Best: "level up" | Your pick; try an offer, or start on mettleup.in |
| MoreMettle | Free | Free | Free | Strong: "one more" | Reads like a slogan |
| MettleStep | Free | Free | Free | Strong: step up | Plain and clear |
| MettleNotch | Free | Free | Free | Strong: notch up | "Notch" is a less common word |
| MettleClimb | Free | Free | Free | Good | Longer to say |
| AddMettle | Free | Free | Free | Good | Sounds like an advert |
| MettleBook | Free | Free | Free | Weak: a log, not growth | Fits owners' records best |
| MettleLogs | Free | Free | Free | Weak | Fits members' logging |

**Cautions about "Mettle" itself:**
- On a phone call it sounds like "metal"; spell it once: M-E-T-T-L-E.
- Other brands use the word: "Mettle: Mental Fitness for Men" (Bear Grylls' app, on Play and the App Store); NatWest's "Mettle" business bank app (UK); a "Mettle Fitness" gym in Hyderabad; "MettleMingle", a gym booking app. A two-word name (MettleUp, MoreMettle) keeps us apart, but a plain "Mettle" logo would not.
- The official Indian trademark search still needs a person (captcha); search "Mettle" in classes 9, 41 and 42 at ipindia.gov.in, or ask a lawyer, before paying for a logo.
**YOUR QUESTION (24 Oct, chat):** "I am really feeling MettleUp.in - do we need even more in-depth research before finalize?"
**My answer:** No more big research. Three small checks are left, and two of them only you can do:
- **Done by me (24 Oct):** no app called MettleUp on Google Play India; no company or product called MettleUp found on the web. mettleup.in, mettleup.app, getmettleup.com and mettleupapp.com are all free. Five apps called just "Mettle" are on Play (a men's mind app, a quiz, a walking game, a gym booking app), so in store search we must always show the full name "MettleUp".
- **Your task, trademark (15 minutes, free):** search India's official register yourself (it has a captcha). If nothing close shows in classes 9, 41 or 42, you are clear to file.
- **Your task, domains (about ₹2,500 for the first year):** buy mettleup.in and mettleup.app the same day; add getmettleup.com (about ₹1,000) so a .com points to us until mettleup.com can be bought.
- **Optional:** say "MettleUp" to 3 gym owners on the phone and ask them to spell it back.
- **Play ID:** if you pick MettleUp, the Play Store ID in #57 should be com.mettleup.app (it matches the domain you will own); no public app uses it today.
**Your task:** open https://tmrsearch.ipindia.gov.in/tmrpublicsearch/ (or ipindia.gov.in → Trade Marks → Public Search), choose "Wordmark", type METTLEUP, search "Contains", and repeat for METTLE UP. Look at classes 9 (apps), 41 (fitness training) and 42 (software). Tell me what you see, or send a screenshot.
**Details and all 136 names checked:** https://github.com/aucksy/ForgeAI/blob/main/docs/overhaul/research/R-brand-name.md
**DECIDED (24 Oct, 4:03 pm, via the page):** one brand, with "for Gyms" on the business side; the name is **MettleUp**. You bought mettleup.fit (the address we market) and mettleup.in (it will send people to mettleup.fit); no .app for now.
**YOUR QUESTION (24 Oct, on the page):** "Will these be two separate mobile apps like mettleup and mettleup for GYMS? Because I was thinking it would be just one app with consumer and B2B logins, not sure."
**My answer:** one name, and only ONE app on the Play Store: the members' MettleUp app. Gym owners and their desk staff use MettleUp in the browser at app.mettleup.fit (on the desk computer or a phone; it can be added to the phone's home screen like an app, and it works offline). "MettleUp for Gyms" is just the label on that website and on the price page, not a second app. Why not put the owner screens inside the phone app: the desk works on a big screen all day, and one web app updates for every gym the moment we fix something, with no Play review. Later, if owners ask, the phone app can get an "I run a gym" button that opens the owner app.
**Done (24 Oct):** both domains now point to Cloudflare (where your other sites live); the switch finishes within a few hours.

## 43. How should members sign in: Google, or a phone code? — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** PLANNED
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
**Details and sources:** https://github.com/aucksy/ForgeAI/blob/main/docs/overhaul/research/R-google-login.md
**DECIDED (24 Oct 2026):** A: "Continue with Google" sign-in, plus your plan for members without a gym.
**YOUR REPLY (24 Oct):** Why join through a gym rather than alone? Members without a gym (or whose gym is not on ForgeAI) get limited features, like Hevy's routine limit; gym members get everything; say "join through your gym to unlock everything". WhatsApp codes later, once it makes money.
**My plan (from research):** Hevy's free plan allows 4 routines, 7 custom exercises and 3 months of charts. Strong allows 3 routines. So:
- **With a gym on ForgeAI:** everything, free.
- **Without one:** 4 routines, 7 custom exercises and 3 months of charts, the same as Hevy. A line in the app says "Join through your gym to unlock everything, free", with a button to tell their gym about ForgeAI.
- **At launch the limits stay OFF** (everything free for everyone), so the first users love it. You switch them on from your owner panel, with no app update, when you decide.
- **Sign-in:** "Continue with Google", "Join with your gym code", or "Use without an account". WhatsApp codes come later, as you said.

## 42. Your task: switch on Google Drive backup (free, about 30 minutes) — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
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
**TASK DONE (24 Oct)**
merged into #60: one Google Cloud setup now covers both Drive backup and "Continue with Google", with the new Play ID com.mettleup.app. Nothing to do here.

## 41. How do we price an owner with 2 or more branches? — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** PLANNED
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
**Sources:** dupple.com, "Best gym management software in 2026" (Mindbody per location, Gymdesk by member
count); houseofgrapplers.com, gym software pricing (per-member pricing grows with the gym);
codingclave.com, gym software cost India 2026 (branch count moves the price); Easy Gym Software (multi-branch
plans). Reviews and vendor pages, not price sheets.
**DECIDED (24 Oct 2026):** A: per branch, no member limit; the 2nd and later branches pay less.
**YOUR REPLY (24 Oct):** Build multi-branch from the beginning, complete; test the AI import with every kind of data, extra fields, one central sheet with a branch column; it must adapt and have a failure path.
**My answer:** I am building it now, in this order: one owner sign-in for all branches, a branch switch at the top of the admin app, members, plans, payments, check-ins, staff and reports per branch, plus an "All branches" view for the owner. The AI import gets a branch column (one sheet for all branches, or one sheet per branch), keeps every extra column, and never stops halfway: rows it cannot read are listed for you to fix, and everything else goes in. I test it with at least 10 different real-world sheet shapes. It needs one live server change, and I will ask your yes first.

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
**Status:** DONE
**Your task:** When Claude says the draft is ready (it follows your answers to #30, #31 and #33), read it: one pilot agreement with the data agreement inside (dates, success measures, the gym owns its data, export in 7 days and deletion in 30 if they leave, breach notice to the gym in 24 hours, support hours, price after the pilot, it is a beta).
**Your task:** Sign it with the gym owner (2 copies, or both sign a PDF), and send Claude a photo of the signed page.
**Why:** India's data law makes the gym responsible for its members' data and needs a written contract with us (we handle it for the gym). It also stops the trial turning into a free service with no end date. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (D3).
**YOUR REPLY (24 Oct):** No physical signing; a scalable digital way for gyms anywhere.
**My answer:** Yes. Online acceptance is legal in India (IT Act 2000) and is how all software is sold. When an owner taps "Create my gym", a tick box says "I agree to the ForgeAI terms and the data agreement", with links to both. We store the date, time and version of the terms they accepted, and the owner can see it in Settings. No paper, no visit. I am building it now.
**TASK DONE (24 Oct)**
no paper signing needed. As you asked, gym owners now accept the terms and the data agreement online with a tick box at "Create my gym" (live on the server 24 Oct); the date and version are kept.

## 37. Launch task: name the complaints contact for members — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**Your task:** Tell Claude one name and one email address that members can write to about their data (it can be you and a new address such as privacy.forgeai@gmail.com; one you will check weekly).
**Why:** India's data law requires a named contact on the website and in the app, with an answer within 90 days. Claude puts it into the privacy notice and both apps. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (D4).
**TASK DONE (24 Oct, chat)**
Contact: contact@mettleup.fit, shown with your name Aakash Pahuja as Grievance Officer. Emails forward to simpleapps108@gmail.com until your new Gmail exists. The privacy, terms and data agreement pages are now complete.

## 36. Launch task: the gym visit and the GGMS export — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** PLANNED
**Your task:** Visit the gym with the one-page question sheet (about 45 minutes): https://github.com/aucksy/ForgeAI/blob/main/docs/launch/GYM-VISIT.md
**Your task:** Ask the desk to export from GGMS whatever it can (members, plans, dues, payment history, attendance; Excel best) and get a copy, plus photos of 2 receipts.
**Your task:** Send Claude the answers (typed, voice note text, or photos of your notes) and the export files.
**Why:** everything after this depends on it: the data move, the training plan, whether the desk needs the offline mode, FitPass, receipts with GST. We have never asked the gym these questions. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (F1, F2).
**YOUR REPLY (24 Oct):** You will onboard RAM'S FITNESS CLUB IMPACT yourself, end to end (create the account, export from GGMS, AI import), in 1-2 weeks, once the planned features are built.
**My answer:** Noted. Before then I test the AI import on GGMS-style sheets and at least 10 other sheet shapes, and I write you a one-page "how to move a gym in" guide.

## 35. Launch task: open the Google Play developer account ($25 once) — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**TASK DONE (24 Oct, 04:55 pm, via the page)**
**Your task:** After you answer #28: go to https://play.google.com/console/signup and make the account type you picked. It needs your government ID, a card in your name and an Android phone. Pay the $25 once.
**Your task:** Tell Claude "Play account ready". Claude then prepares the store listing, the data safety answers and the internal test for you to submit.
**Why:** members get updates by themselves from the Play Store; the GitHub download link will be blocked by Google for unregistered apps from 2027. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (C1-C3).
**TASK DONE (24 Oct)**
the Play account exists (SimpleApps108, a personal account). Claude prepares the MettleUp listing and internal test there.

## 34. Launch task: accounts and safety switches only you can turn on — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** WAITING FOR YOU
**Your task:** Turn on two-step sign-in (an authenticator app) on Supabase, GitHub, Cloudflare and your Google account.
**Your task:** Check that your 2 offline copies of the app's signing key still open (the folder from docs/RELEASE-SIGNING.md). If that key is lost, every member must reinstall and loses their data.
**Why:** today the server pauses after a quiet week, has no backups, and nobody hears about a crash or an outage until the gym calls. Plan: https://github.com/aucksy/ForgeAI/blob/main/docs/LAUNCH-PLAN.md (A1-A7, B1-B2).
**YOUR REPLY (24 Oct):** How big a deal is the 7-day pause of the free server? Data is not lost, and members will keep it active.
**My answer:** Small. You are right: a pause loses no data. While it is paused, the apps cannot save or load anything online until you press "Restore" in Supabase (a few minutes). Once members use the app daily, it never pauses. The bigger gap on the free plan is backups; my nightly backup (see #27) covers that.
**YOUR REPLY (25 Oct):** Why cant you do this?
**My answer:** You are right to push. Here is each one:
- **Test server:** I can make it myself in your Chrome. I do it after 0.57.0.
- **Crash and "site is down" alerts:** I changed the plan so no new accounts are needed. I build them on Cloudflare and GitHub, which we already have. My safety rules do not let me create new accounts, so this route is better anyway.
- **Two-step sign-in:** this one stays yours. It changes the security of your own accounts and needs the authenticator app on your phone; my safety rules stop me from changing security settings.
- **Signing key copies:** this one stays yours. The 2 copies are on your offline drives, which I cannot reach.

## 33. Launch decision: your support hours during the trial — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**Why it matters:** this promise goes into the pilot agreement (#38). A desk that cannot take a payment and gets no answer is the most common reason a gym gives up on new software. Claude watches the alerts all day; you are the human the gym talks to.
**DECIDED (24 Oct 2026):** B, changed by your note: no fixed hours. The trial terms say "We reply as soon as we can."
**YOUR REPLY (24 Oct):** No fixed time; say "as soon as possible". Research and set up the automated support and fixes system. Let me undo a pick in the tracker.
**My answer:** Done: the tracker now lets you undo a pick (tap the picked answer again). The automated support system is on my list: an AI that answers gym owners and members, logs every problem, and turns repeat problems into fixes I build, test and release. I will bring you a plan first.

## 32. Launch decision: should ForgeAI register for GST now? — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**Why it matters:** it changes the price the gym pays by 18%. Check with your accountant before the second or third gym. The gym's own receipts already use 5% GST and number by financial year.
**DECIDED (24 Oct 2026):** A: not now. ForgeAI registers for GST once yearly sales near ₹20 lakh.

## 31. Launch decision: lawyer check of the privacy notice and the agreement — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**DECIDED (20 Oct):** A: Claude's checked documents for the trial; a lawyer before the second gym (you left the legal calls to Claude, R-45, 20 Oct).
**Why it matters:** the law (DPDP) applies in full from May 2027; penalties are large, but the risk in a one-gym, 8-week trial with a signed agreement is low. Legal wording is your decision.

## 30. Launch decision: the price after the trial — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**DECIDED (24 Oct 2026, R-97: you left the prices to me):** the free trial is 3 months, not 8 weeks, and ForgeAI HQ can extend it to 6. After it: Starter ₹999 a month or ₹9,990 a year; Pro (adds the shop, and soon online payments and the entry gate) ₹1,999 a month or ₹19,990 a year; AI (coming) ₹2,999 a month; a founding-gym lifetime Pro pack, ₹29,999 once, for the first 50 gyms. Prices are per branch and shown on the landing page. Market check, 24 Oct: Indian gym software costs ₹500-3,000 a month, trials run 7-30 days, and nobody sells a lifetime pack.
**Why it matters:** small Indian gyms pay ₹1,000-3,500 a month for software; GGMS costs them about ₹12,000 a year. Writing the price down now means the trial ends with a decision, not a negotiation. Our running cost: about ₹2,100 a month (server).

## 29. Launch decision: members under 18 — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**DECIDED (20 Oct):** A: the member app is for 18 and over during the trial (you left the legal calls to Claude, R-45, 20 Oct).
**Why it matters:** India's data law needs a parent's verified consent for anyone under 18, and bans tracking them. A builds in a day; B takes about a week and slows joining for everyone.

## 28. Launch decision: which Google Play account — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**Why it matters:** the Play Store gives members automatic updates and keeps the app installable after Google's 2027 rule against unregistered downloads. You can move to an organisation account later when you form a company.
**DECIDED (24 Oct 2026):** A: your existing Google Play account (simpleapps108@gmail.com).
**YOUR REPLY (24 Oct):** Submit the app for internal testing so you can add testers' emails. Testing with your first client for a few months and rebranding later is fine.
**My answer:** Agreed: test now, rebrand later. One thing to know: the app's Play Store ID (com.forgeai.app) can never change, even after a new name. Nobody sees it, so that is fine. I will set up the internal test in your open Play Console. I stop and ask you at every "I agree" box, because those are your agreements to accept.
**Your task:** In your Chrome window signed in as simpleapps108@gmail.com, turn on the Claude extension: open chrome://extensions, find "Claude" (or add it from the Chrome Web Store), switch it on, and sign in to Claude. Then tell me "Play is connected". Right now only your other Chrome profile (pahuja.aakash108) is connected to me, so I cannot see the Play Console window.
**TASK DONE (24 Oct, chat)**
the Claude extension is on in the simpleapps108 Chrome window; Claude works there.

## 27. Launch decision: paid server plan (Supabase Pro, about ₹2,100 a month) — 19 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** PARKED (stays here)
**Why it matters:** the free plan pauses after 7 quiet days (the app and the admin app stop working until someone wakes it) and keeps no backups we can restore. With the gym's real data, one bad day without a backup could lose their records. A means real data is safe from the first import.
**DECIDED (24 Oct 2026):** B: no paid plan until the testing and the market check are done.
**YOUR REPLY (24 Oct):** Is our own database better than Drive backups, long term? Can the trial start on the free plan for 50-100 members?
**My answer:** Yes to both. Our own database is the right long-term choice (it is how Hevy and Strong work, and members need nothing set up). The free plan is fine for 50-100 members: 500 MB of space is enough for about 1,500 members' workouts. Two limits to know, and what I do about them:
- **No backups on the free plan.** I will add our own nightly backup to Cloudflare's free storage (10 GB, which you already have), so one bad day never loses data.
- **It pauses after 7 days with no use** (see #34). Daily members keep it awake; a pause loses nothing and is undone in a few minutes.

## 26. Try v0.48.0 on your phone with one real workout — 18 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**TASK DONE (24 Oct, 01:05 pm, via the page)**
**Your task:** Install v0.48.0 on your phone: https://github.com/aucksy/ForgeAI/releases/download/v0.48.0/forgeai-v0.48.0.apk
**Your task:** Do one real workout with it, and tell me anything that looks or feels wrong (a screenshot helps).
**Why:** every automatic test passed, but you are the first real person in a real gym on this
version (new: gym workout plans, kg to beat per exercise, My membership, check-in offers the workout).

## 25. Set up Google Test Lab (free, about 10 minutes) — 18 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**TASK DONE (24 Oct, 01:15 pm, via the page)**
**READ (24 Oct, 01:15 pm, via the page)**
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
