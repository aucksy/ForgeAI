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
**READ (28 Oct, 11:34 pm, via the page)**
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
**READ (29 Oct, 12:50 am, via the page)**
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
**READ (29 Oct, 12:51 am, via the page)**
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
**READ (29 Oct, 01:00 am, via the page)**
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
**Status:** DONE (cancelled 29 Oct)
**READ (29 Oct, 12:40 am, via the page)**
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
**YOUR REPLY (29 Oct):** Cancel this idea.
**My answer (29 Oct):** Cancelled. Counting reps by listening is not in the plan any more.

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
**READ (29 Oct, 01:00 am, via the page)**
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
**YOUR REPLY (29 Oct):** two ideas. (1) Should members think the app is free forever, or should we say "6 months (or 1 year) free with every feature, no card"? How many users can we support? Free forever for early users and paying for later ones feels wrong. (2) Gym owners collect members' email; members sign in with Google (later Apple on iPhone); if the email matches, the gym links by itself. Keep code and link too; suggest or require email when the owner adds a member.
**My answer (29 Oct):**
**1. Free forever or a trial?** My pick: never promise "free forever" for everything. Split it:
- **The basic workout log stays free for everyone, always.** Hevy and Strong do this, so members expect it, and it costs us very little: about 330 KB per member, so the free server holds about 1,500 members, and the $25 plan about 24,000. Past that, each extra 3,000 members costs about ₹10 a month.
- **The extras** (AI coach, deep charts and similar) come with "6 months free, every feature, no card". A clear end date is honest, and nobody feels tricked later.
- **Early users get a thank-you, not a different deal:** for example 3 extra free months or a lifetime discount as "founding members". Everyone sees the same rules; early users just get a bonus.
- **Members of a MettleUp gym get the extras through their gym,** so they never see a paywall. That is our main sales story to owners.
- Numbers to keep in mind: trials convert far better than free tiers (about 18% when no card is asked, against 3-4% for a free tier), so a time-limited trial for extras is the stronger choice.
**2. Link to the gym by email:** good idea, with 3 safety rules:
- **Always ask first.** The app says "Iron Paradise has you as a member. Join?" and links only after the member taps Yes. A typo in the gym's records must never put a stranger in someone's gym.
- **Optional, but suggested.** The add-member form shows the email field with a hint ("lets the member join in one tap"). Making it required would slow the desk, and many Indian gyms do not ask for email.
- **iPhone catch:** Apple's "Hide my email" gives each app a fake address, so those members will not match. The code, the link and the QR stay.
- Later, matching by **mobile number** would work for almost every member, because gyms already keep numbers. That needs a phone check by SMS (paid), so it waits.
- The email the gym keeps is the gym's record and is already covered by the privacy notice. One line about the join match goes in when we build it, for your OK.
Sources: https://fungies.io/saas-free-trial-vs-freemium-2026 , https://www.airbridge.io/en/blog/how-to-choose-free-trial-vs-freemium , https://help.zoho.com/portal/en/kb/accounts/faqs-troubleshooting/faqs/sign-in/articles/why-does-my-zoho-account-shows-a-different-email-address-when-i-sign-in-with-apple

## 42. Your task: switch on Google Drive backup (free, about 30 minutes) — 22 Oct 2026
**Chat:** ForgeAI Local Chat
**Status:** DONE
**READ (29 Oct, 01:00 am, via the page)**
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
**Status:** BUILDING (29 Oct)
**READ (29 Oct, 12:50 am, via the page)**
**You asked:** whether the plan has an end-to-end feedback system: the gym owner or members send
feedback by typing or voice; Claude understands and cleans it, adds real issues and features to the
plan, starts fixing real issues and pushes the releases.
**My answer:** No, not yet. Today feedback reaches us only through you. It can be built, and most of
it can run by itself:
1. **Send:** a "Send feedback" button in the member app and the admin app. Type or speak (Hindi or
   English); it attaches the screen, app version and phone model by itself. Voice is turned into text
   on our side (free speech-to-text).
