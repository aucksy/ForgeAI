# ForgeAI member app: map of every screen, and a new map for the next ~17 features

*Information-architecture review, 24 Oct 2026. Read-only on code: nothing in the app was changed.
Method: every screen and settings row read from the app as it is on `main` today (v0.55.x), then
judged with the impeccable critique heuristics (Nielsen's 10, the cognitive-load checklist,
first-timer and power-user walk-throughs). Hevy and Strong are compared from what I know of them, plus a
quick check of Hevy's help pages.*

**How to read tap counts:** the app opens on the Workout tab. Tapping a tab = 1 tap. "Profile → gear →
Workouts" = 3 taps. "+scroll" means the thing is below the first screen.

---

## 1. Today's map

### 1.1 The tabs

| Tab | Shows when | What it holds |
|---|---|---|
| **Workout** | always (opens first) | Up next, Start empty workout, Routines, New routine, Explore |
| **Profile** | always | You, the history chart, 4 tiles (Statistics, Exercises, Measures, Calendar), every past workout |
| **Gym** / **Shop** / *(none)* | no gym = no tab; a gym = "Gym"; once the gym's shop has a product it becomes "Shop" | Workout offer, membership, orders, products, messages bell, Leave |
| Coach | hidden (on hold) | — |

### 1.2 Workout tab (0 taps: it is the first screen)

```
Workout
├─ Cards that can stack ABOVE Up next (up to 6): gym logo line · "New version" · What's new ·
│  backup reminder · "That link didn't work" · one-time "where the tabs went" note
├─ Up next card ......................................... 0
│  ├─ Start <routine> .................................. 1   ← the main job: 1 tap. Good.
│  ├─ See exercises → Today preview → Start ............ 1 / 2
│  │                  └─ Change this routine ............ 2
│  ├─ Resume workout / Discard workout ................. 1
│  ├─ week-of-plan line, easy-week note, "Train normally this week"
│  ├─ muscle tip (Add / Not now / Skip)
│  └─ "Take an easy week now" offer
├─ Moving from Hevy or Strong? (empty app only) → Import  1
├─ Start empty workout .................................. 1 (+scroll when cards stack)
├─ Routines  [+ new folder]
│  ├─ New routine → routine editor → Add exercise ...... 1 / 2
│  ├─ Explore → "A plan built for you, or a ready program"  1
│  │  ├─ Build a plan → Leave out (sore joints) ......... 2 / 3
│  │  ├─ Push Pull Legs / Upper Lower / Full Body ....... 2
│  │  └─ Bring routines in: Import a routine file · Import routines from Hevy  2
│  └─ each folder (open/close)
│     ├─ routine card → routine preview → Edit / Start . 1 / 2
│     ├─ routine ⋯: Share · Duplicate · Edit · Move up/down · Move to folder… · Delete   2
│     └─ folder ⋯: Rename · Add new routine · Share · Move up/down · Easy weeks… ·
│                  Follow this plan / Stop following · Delete folder   2 (Easy weeks = 3)
└─ Live workout (full screen over the tabs)
   ├─ each exercise ⋯: Rest timer · Add warm-up sets · Counting · Plate calculator ·
   │                   Superset · Swap exercise · Remove exercise
   ├─ set row: set type, RPE, tick; "In use" screen during rest
   ├─ Add exercise · Discard workout
   └─ Finish → "Finish workout?" → Workout complete: Done · Picture · Text · View history
```

### 1.3 Profile tab (1 tap)

```
Profile  [pencil = Edit profile · share = this month's picture · gear = Settings]
├─ Edit profile: photo, name, bio, link ........................ 2
├─ Share this month as a picture ............................... 2
├─ Workouts · Streak · Records (numbers only, not tappable)
├─ History chart: Duration / Kg lifted / Reps; 12 weeks / 12 months / All time
├─ Tiles
│  ├─ Statistics ............................................... 2
│  │  ├─ Last 7 days (body map) · Sets per muscle group · Muscle distribution ·
│  │  │  Main exercises · Records · Strength score · Reports
│  │  ├─ Records → See all ..................................... 3 (+scroll)
│  │  └─ Reports → Monthly report / Year in review ............. 3 (+long scroll; last thing on the page)
│  ├─ Exercises → search, filters, Create, Hidden exercises ..... 2
│  │  └─ an exercise: Summary · History · How to; ⋯ Your photo or video · Hide from my lists ·
│  │     Edit exercise · Merge into… · Count all records again · Start records fresh…   3
│  ├─ Measures: progress photos strip, chart, Body weight / Waist / Body fat chips, History, "+"  2
│  │  ├─ + → one form: body weight, measurements, a picture ..... 3
│  │  └─ Progress photos → See all → Compare two photos ......... 3 / 4
│  └─ Calendar: Streak · Rest days · Log a past workout · search · Year view   2
└─ Every past workout (feed) → workout page; ⋯ Save as routine · Repeat · Edit · Share · Delete   2 / 3
```

### 1.4 Gym / Shop tab (1 tap; only with a gym)

```
Gym (or "Shop", or the gym's name)  [bell = gym messages · bag = basket]
├─ Workout offer card ("Join the offer") ........................ 1
├─ My membership: plan, end date, days left, personal training, visits
│  └─ Show my workouts to the desk ............................. 2
├─ My orders .................................................... 2
├─ Products (when the shop is on) → product → bag ............... 2 / 3
├─ Messages (bell) .............................................. 2
└─ "Gym: <name>  Leave" at the very bottom ...................... 1 (+scroll)
Check in: NO button in the app. Only by pointing the phone's camera at the poster.
```

### 1.5 Settings (Profile → gear = 2 taps). One flat list of 11–13 rows; every row opens its own page (3 taps)

| Row as the app shows it | What's inside (labels as shown) | Taps to change one thing |
|---|---|---|
| Your details | Your name · Mobile number, optional · Your gym, optional · Goal · Experience · Age in years, optional | 3 |
| Workouts | Weekly goal (− +) · Default rest · Workout sounds · Rest-over sound · Ring through Do Not Disturb · rest-alert status line · Show In use after each set · Muscle tips · Put-away tips · Track RPE · Weight jumps · Rep range · Plates and bars (own page) · Previous values. **13–14 rows on one page** | 3–5 (Rest-over sound = 5: Profile → gear → Workouts → Rest-over sound → pick) |
| Units | Units (kg, km / lb, miles) · **Body figure (Male / Female)** | 3 |
| Notifications | Workout reminders · Turn on notifications · Reminder time / Set time | 3 |
| Health Connect | Connect · Turn on · Open Health Connect (row hidden on phones without it) | 3 |
| Widgets | Home-screen widgets: Add Today · Add This week | 3 |
| Your gym | *No gym:* the typed gym name or "Not added yet" · Join your gym (code → Next). *A gym:* Your gym card · My membership · Reminders from my gym · Add to your home screen · Leave &lt;gym&gt; | 3 (joining a gym = 3 taps + typing) |
| Backup | Continue with Google · Bring back my workouts · Sign out · Delete my account · Link Google Drive · Back up now · Restore from Drive · Undo the last restore · Unlink Google · Include photos in my backup (Drive parts hidden until setup #42) | 3 |
| Export & import | Save my history · Save my measurements · Import from Hevy · Import from Strong · Import routines | 3 |
| Your data | Remove demo data (only with demo) · **Erase all data** | 3 |
| What's new | the last 3 updates | 3 |
| Send feedback | text or voice, Send | 3 |
| About | Credits · ForgeAI version | 3 / 4 |

Plates and bars (2 doors): Settings → Workouts → Plates and bars (4), or live workout → exercise ⋯ → Plate calculator → set up.

Old screens still alive behind redirects: a separate Body weight page and a separate Measurements
page (both replaced by Measures, still reachable from old links and the body-weight shortcut).
They are a second copy of the same job; retire them once nothing links there.

### 1.6 Problems marked on the map

| Kind | Where |
|---|---|
| **Hard to find** | Joining a gym (3 deep in Settings unless done on the welcome screen) · Check in (no button at all) · Records list and the monthly/year reports (bottom of Statistics) · Easy weeks (folder ⋯ only) · Plates and bars (4 deep) · per-exercise rest (exercise ⋯) · "Show my workouts to the desk" (inside the membership card) |
| **Duplicates / two places** | Two profile editors (Edit profile and Your details both edit your name) · a typed "Your gym, optional" next to the real joined gym · My membership in the Gym tab AND Settings → Your gym · Leave gym in the Gym tab footer AND Settings · reminders split (Notifications vs Your gym → Reminders from my gym) · 3 doors to import (empty-app card, Explore → Bring routines in, Settings → Export & import) · 2 body-weight screens |
| **Jargon** | Track RPE · Rep range · Weight jumps · Previous values · Put-away tips · Counting · Merge into… · Count all records again · Start records fresh… · Follow this plan · Easy weeks… · Explore · Measures · Sets per muscle group · Muscle distribution · Main exercises · Strength score · Show In use after each set |
| **Overcrowded** | Settings → Workouts (14 rows, 4 different jobs) · the Settings list (13 rows, no groups) · top of the Workout tab (up to 6 cards above Up next, up to 4 extras inside it) · Profile (identity + chart + 4 tiles + full history, no room left) · Statistics (7 sections in one scroll) |
| **Dead ends / odd homes** | Body figure under Units · Erase all data under a vague "Your data" · the third tab vanishes and renames itself · demo data only by a hidden 2-second press (on purpose) |
| **Likely never discovered** | Year in review · Records "See all" · Compare two photos · Easy weeks · Muscle tips switch · Widgets · Add gym logo to home screen (after the first pop-up) · Log a past workout (inside Calendar) |

### 1.7 The 10 worst, ranked

| # | Problem | What a member feels | Heuristic hit |
|---|---|---|---|
| 1 | **The third tab is unstable**: missing with no gym, "Gym" with a gym, "Shop" once a product is listed. The 9 gym features we're adding have no fixed home. | "Where did that tab go?" Gym features would get scattered across the app. | Consistency (4), Recognition (6) |
| 2 | **Joining your gym, the action the whole business depends on, is 3 taps deep in Settings** for anyone who skipped it on the first screen. No in-app Check in button either. | A member told "join with code FORGE12" can't find where to type it. | Visibility (1), Recognition (6) |
| 3 | **Settings is one flat list of 13 rows**, and **Workouts holds 14 rows** mixing rest timer, sounds, next-weight rules, display and tips. | Changing the rest sound takes 5 taps and a hunt. | Minimalist design (8), chunking (≤4–7 per group) |
| 4 | **Gym things live in two places**: membership in both, Leave in both, gym reminders away from the other reminders. | Two half-pages. Which one is "the gym"? | Consistency (4) |
| 5 | **Profile is full**: you + chart + 4 tiles + all history. Badges, strength levels and muscles-ready have nowhere to go without overcrowding it. Progress tools sit 2–4 taps down behind generic tiles. | Statistics, Records and Reports feel hidden. | Recognition (6), Flexibility (7) |
| 6 | **Two profile editors** (pencil and Settings → Your details), both with your name; a typed "Your gym" next to the gym you really joined. | Edits the name in one, wonders why the other exists. | Consistency (4), Error prevention (5) |
| 7 | **Jargon labels** (RPE, Rep range, Weight jumps, Previous values, Counting, Merge into…, Start records fresh…, Strength score, Muscle distribution, Explore, Measures). | A first-time gym member skips them or guesses wrong. | Match with the real world (2) |
| 8 | **The top of the Workout tab can stack 6 cards above Up next**, and Up next itself can carry 4 extras. Workout of the day, Quick workout and the challenge can't be added on top. | On a busy day, Start sits below the fold on his large-font phone. | Minimalist design (8), single focus |
| 9 | **Three doors to import**, and history import only in Settings or on an empty app. | A Hevy switcher who skipped the first card can't find it again. | Consistency (4) |
| 10 | **Power settings with no path**: Easy weeks only in a folder menu, Plates and bars 4 deep, Body figure under Units, Erase all data under "Your data". | Never found, or found by accident (Erase). | Recognition (6), Error prevention (5) |

**Cognitive-load checklist (whole app):** fails *chunking* (Settings, Workouts page), *minimal choices*
(folder ⋯ menu = 8 options, exercise ⋯ = 7), *progressive disclosure* (power settings sit beside basic
ones) and *single focus* (Workout tab top). 4 of 8 failed = high. The live workout screen itself passes.

**Rough heuristic score for navigation only:** about 25/40. The workout flow is strong (1 tap,
Hevy-familiar). Gym, settings and progress pull the score down.

**What's working, keep it:** Start is 1 tap from launch. The Hevy-shaped Workout tab and live workout
are familiar to switchers. Settings rows already show their current value in grey ("Rest 2:00",
"kg, km"), which is better than Hevy.

---

## 2. Benchmark: Hevy and Strong

*Hevy's tab and settings layout is confirmed by its help pages (gear on Profile; Workouts under
Preferences; Units; Privacy & Social; Manage subscription). Strong's layout is from my own knowledge of the app: the
search found no official page listing its tabs, so treat Strong's details as likely, not proven.*

| | Hevy | Strong | ForgeAI today |
|---|---|---|---|
| Tabs | 3: **Home** (social feed + Discover), **Workout**, **Profile** | 5: Profile, History, **Workout** (middle), Exercises, Measure | 2–3: Workout, Profile, Gym/Shop (unstable) |
| Opens on | Home feed | Workout | Workout ✓ |
| Past workouts | Profile feed + Calendar | own **History** tab (1 tap) | Profile feed (1) + Calendar (2) |
| Progress | Profile → Statistics / Exercises / Measures / Calendar tiles | Exercises tab charts, Profile charts | same as Hevy (2 taps) |
| Settings | Profile gear → **headed groups**: Account (Profile, Account, Subscription, Notifications), Preferences (Workouts, Privacy & Social, Units, Language, Integrations, Theme), Guides, Help, Export & import | Profile gear → short list: profile, units, general (timer, sounds, plates), watch, export, help | Profile gear → **13 rows, no groups** |
| Social | Home tab, followers, likes, comments | none | none yet |

**What they do better**
- Hevy **groups settings under headings** (Account / Preferences / Help). We copied Hevy's rows but not its groups.
- Hevy gives social its **own tab** (Home), so the Profile stays about you. We need the same for the gym: one tab.
- Strong gives **History and Exercises one tap each**. Its members say finding past numbers is the main reason they open the app between workouts.
- Both keep **workout preferences on one short page**. Hevy's has about 8 rows, ours has 14.

**What they do worse (we win by not copying)**
- Hevy opens on a social feed, not on your workout. Ours opens on Up next, so keep that.
- Strong's 5 tabs include a Measure tab most members rarely use.
- Both hide basics behind payment (Hevy: 4 free routines, Strong: 3) and show sales pop-ups. We have none.
- Hevy's Profile is getting crowded too (feed + chart + tiles). We should not add 5 more things to ours.

---

## 3. Proposed map

### 3.1 Tabs: 4, always the same 4

| Tab | Opens on | Lives here |
|---|---|---|
| **Workout** (opens first) | Up next with **Start**, 1 tap | Up next (gym's workout of the day shows here when set) · **Quick workout** ("I have 30 minutes") · Start empty workout · Routines and folders · **Find a plan** (was Explore) |
| **Progress** (new) | "Ready today" body drawing | Ready today (which muscles rested enough + last 7 days) · Your lifts (strength level per lift, records, all exercises) · Badges · Body (weight, measurements, photos, steps and water) · Reports (month, year) · Charts (today's Statistics, one level down) |
| **Gym** (always, never renamed) | *No gym:* one **Join your gym** door. *A gym:* the gym's home | Membership (with "Ask to freeze or renew") · Check in · Today at the gym (how busy now, best time, workout of the day) · This month's challenge and ranking · Offers and messages · Shop · Gym mates (follow, compare) · Bring a friend |
| **Profile** | You | Photo, name, Workouts · Streak · Records · **badge strip** (3 newest, "See all") · history chart · Calendar · every past workout · pencil (one editor) · share · gear (Settings) |

Why 4 and not 3: Hevy's third tab is its social feed. Our third is the gym, and with ~9 gym features
coming it has to be a real tab. Progress gets its own tab because 6 new progress features
(strength level, badges, muscles ready, 1-rep max, steps and water, "stronger than X%") would bury
Profile. Profile goes back to being about you and your past workouts.

**The no-gym door (Gym tab, no gym):** one screen. "Join your gym" with the code box and "Scan the
poster", then three plain lines of what you get (your plan from your trainer, your membership and
days left, monthly challenges). One quiet "No gym? Everything else works without one." No locked items, no greyed rows.

### 3.2 What sits where on each tab (first screen only; everything else one level down)

- **Workout:** at most **one** notice card above Up next at a time, in this order: update → What's new → backup.
  The rest wait for the next day. Inside Up next, at most one extra line (easy week OR muscle tip OR
  the easy-week offer), never all three.
- **Progress:** 5 headed blocks, each with "See all". Statistics' 7 sections move one level down under "Charts".
- **Gym:** membership card first (most-used), then Check in, then whatever is live today (challenge, workout of the day,
  busy now). Shop is a row, or a grid only when the gym has products. Messages bell stays top right.
- **Profile:** 3 numbers, badge strip, chart, Calendar button, past workouts. Exercises and Measures leave for Progress.

### 3.3 Settings: 6 headed groups on one page (like Hevy), each row one tap to its own page

| Group | Rows (as they'd show) | Max rows |
|---|---|---|
| **You** | Your profile (photo, name, bio, link, mobile, goal, experience, age, body figure: **one editor**, the pencil opens the same page) · Units | 2 |
| **Workouts** | Weekly goal · Rest timer and sounds · How the app picks your next weight · Plates and bars · Last time's numbers · Rate how hard each set felt · Muscle tips | 7 |
| **Reminders and phone** | Reminders (workout reminders + reminders from my gym, one page) · Health Connect · Widgets · Watch | 4 |
| **Your gym** | *A gym:* What my gym can see · Gym logo on my home screen · Leave &lt;gym&gt;. *No gym:* Join your gym | 3 |
| **Your data** | Back up · Save as a spreadsheet · Ask your own AI · Bring in from Hevy or Strong · Erase or start over | 5 |
| **Help** | What's new · Send feedback · About | 3 |

**One level down (power settings):**
- *Rest timer and sounds* → Default rest · Workout sounds · Rest-over sound · Ring through Do Not Disturb · Show the "In use" screen after each set · rest-alert check.
- *How the app picks your next weight* → Weight step (was Weight jumps) · Reps to aim for (was Rep range) · Easy weeks (was only in the folder menu; the folder menu keeps a shortcut).
- *Muscle tips* → the switch and "Put-away tips" (renamed "Muscles you asked to skip").
- *What my gym can see* → my place in the gym ranking · "stronger than X% of my gym" · gym mates can follow me. **All off by default**. This one page answers "what does my gym see?".

### 3.4 Where each new feature goes

| Feature | Home | Why there |
|---|---|---|
| Monthly gym challenge with ranking | Gym → "This month's challenge" card; your progress bar also on Up next while it runs | The gym owns it; Up next keeps it in view during the workout habit |
| How busy the gym is now + best time | Gym → top line under the gym name ("Quiet now · best after 8 pm") | Checked before leaving home, not during a workout |
| Gym logo on share pictures + before/after | Automatic on every share picture (no setting); "Share before/after" in Progress → Body → Photos | No new place to learn; before/after lives with the photos |
| Bring a friend | Gym → "Bring a friend" row | It's a gym benefit (free days); Profile has no gym |
| Strength level per lift | Progress → Your lifts (a level beside each main lift) + each exercise's Summary | Where members already look at a lift's progress |
| Badge shelf | Profile → badge strip (3 newest) → Progress → Badges (all) | Identity on Profile, the full shelf with progress |
| Which muscles are ready today | Progress → first block, "Ready today" (replaces "Last 7 days") | The first answer of the Progress tab: what can I train today |
| Quick workout ("I have 30 minutes") | Workout → button under Up next | Must be 1 tap from launch, beside Start |
| Gym's own form videos | Exercise page → "How to" → "Watch your trainer" at the top | Where the member already looks for how to do it |
| Ask your own AI | Settings → Your data → Ask your own AI; also a small link at the end of Reports | It sends your data out, so it belongs with your data. Reports is where the question comes up |
| Ask the desk to freeze or renew | Gym → membership card → "Ask to freeze or renew" | Next to the end date it is about |
| Steps and water | Progress → Body → today's steps and a water tap; switch-on in Settings → Health Connect | Body numbers live together. Not on Workout, keep it calm |
| Gym's workout of the day | Workout → Up next offers it ("Today at your gym: Leg day"), and Gym → Today | Starting it must be 1 tap like any routine |
| Treadmill / cycle details | Inside the live workout's set row (speed, incline, intervals columns for cardio) | Logging stays in logging; no new screen |
| "Stronger than X% of your gym" | Progress → Your lifts, under the strength level, only after opt-in (Settings → What my gym can see) | Same place as the strength level; opt-in kept in one privacy page |
| 1-rep max and % calculator | Exercise page → Summary → "Your 1-rep max" → % table; also in the live workout exercise ⋯ beside Plate calculator | A lift tool, used mid-workout like the plate calculator |
| Follow gym mates (gym-only feed) | Gym → Gym mates | Social stays in the gym tab, like Hevy's Home, and never on Workout |
| Compare with a friend | Gym → Gym mates → a mate → Compare | Needs a mate first |
| Log sets on the watch | The watch app; one row "Watch" in Settings → Reminders and phone | Settings only for pairing |
| *(Ask your trainer: parked)* | When it comes: Gym → membership card → "Message your trainer" | — |

---

## 4. Migration list

Effort: **L** = a day or less, **M** = a few days, **H** = a week or more. Risk = breaks a habit? Needs a one-time "moved" hint?

### Release A: make room (before any new feature)

| # | Change | Effort | Risk / hint |
|---|---|---|---|
| A1 | Gym tab **always shown, always named "Gym"**; Shop becomes a section inside it | L | Low: members with a shop see "Gym" instead of "Shop". One-line hint: "Shop is inside Gym now" |
| A2 | **No-gym door** in the Gym tab (code box + scan the poster + what you get); Settings → Your gym only links to it | M | None (new). Remove the typed "Your gym, optional" field |
| A3 | **Check in button** on the Gym tab (scans the poster in-app) | M | None (new). Needs a camera scanner in the app |
| A4 | **Membership only in the Gym tab**; Leave only in Settings → Your gym (remove the footer Leave) | L | Low. No hint needed |
| A5 | **New Progress tab**: Statistics (as "Charts"), Exercises, Measures (as "Body"), Records, Reports move off Profile's tiles | M | **High** for him and early testers: the tiles disappear. One-time hint on Profile: "Your charts, lifts and body numbers are in the new Progress tab." |
| A6 | Profile keeps: 3 numbers, chart, **Calendar** button, past workouts | L | Low |
| A7 | **Settings in 6 headed groups** (3.3) | M | Medium: rows move. Keep the grey "current value" lines. No hint; headings explain themselves |
| A8 | **Split Settings → Workouts**: "Rest timer and sounds" and "How the app picks your next weight" become their own pages | M | Medium: Rest-over sound moves 1 level down (still 4 taps, now findable). Rest-over sound note in What's new gets a `go` button to the new page |
| A9 | **One profile editor**: merge Edit profile and Your details; the pencil and Settings → Your profile open the same page; Body figure moves in from Units | M | Low |
| A10 | **One reminders page** (workout + gym reminders) | L | Low |
| A11 | **One import door**: Settings → Your data → "Bring in from Hevy or Strong" (history + routines); Find a plan keeps a link to the same page; the empty-app card stays | L | Low |
| A12 | **One notice card at a time** above Up next; one extra line inside Up next | M | Low. Members see less clutter |
| A13 | Retire the old Body weight and Measurements pages (send old links to Body) | L | None |

### Release B: the first new features, in their new homes

| # | Change | Effort | Risk / hint |
|---|---|---|---|
| B1 | **Plain-word labels** (table below) across the app | M | Low. Words change, places don't. Goes through the member-words check |
| B2 | "Last 7 days" becomes **Ready today** at the top of Progress | M | Low |
| B3 | Badge strip on Profile + Badges in Progress | M | None |
| B4 | Strength level + 1-rep max on exercise pages and Your lifts; **Strength score** retires into it | M | Low: Strength score disappears. Say so in What's new |
| B5 | Gym → challenge card, how busy now, workout of the day (also on Up next) | M | None |
| B6 | Settings → **What my gym can see** (all off) | L | None. Needed before any ranking or feed |
| B7 | Quick workout button on Workout | M | None |
| B8 | Bring a friend, Ask to freeze or renew, Watch your trainer | M | None |

**Label changes (B1)**

| Today | New |
|---|---|
| Track RPE / RPE | Rate how hard each set felt / Effort |
| Rep range | Reps to aim for |
| Weight jumps | Weight step |
| Previous values | Last time's numbers |
| Put-away tips | Muscles you asked to skip |
| Counting (exercise menu) | How the weight is counted |
| Merge into… | Join with another exercise… |
| Count all records again / Start records fresh… | Recount my bests / Clear my bests… |
| Follow this plan / Stop following | Make this my plan / Stop using as my plan |
| Explore | Find a plan |
| Measures | Body |
| Statistics | Charts |
| Sets per muscle group / Muscle distribution / Main exercises | Sets for each muscle / Which muscles you trained / Your main lifts |
| Show In use after each set | Show "In use" screen after each set |
| Your data (with Erase inside) | Your data; erase row named **Erase or start over** |

### Release C: the social and device features

| # | Change | Effort | Risk / hint |
|---|---|---|---|
| C1 | Gym mates (follow, gym-only feed) in Gym | H | Privacy: opt-in via B6 |
| C2 | Compare with a friend, "stronger than X% of your gym" | M | Opt-in via B6 |
| C3 | Steps and water in Progress → Body | M | One new Health Connect permission |
| C4 | Treadmill / cycle columns in the live workout | M | Medium: the cardio set row changes. Test on his phone width |
| C5 | Log sets on the watch + Settings → Watch | H | None in the phone app |

---

## 5. Admin app (gym owner): lighter pass

**Today:** a computer shows a flat sidebar of up to 13 items: (All branches) · Today · Members · Shop ·
Messages & offers · (Workout offer, staff only) · Visits · Money · Plans · Enquiries · Expenses ·
Workout plans · Settings · Send feedback. A phone shows Today · Members · Money · Visits · More, with 9 rows under More.
Settings is one long page: Staff & sign-in card · Install card · Gym details (name, phone,
GSTIN, address) · Branches · Member app (join code) · Your look in the app → Open branding ·
Your data (counts, Import members from Excel, export, delete, Load demo gym, Erase and start fresh).

**Top 5 findability problems**

| # | Problem | Cost to the owner |
|---|---|---|
| 1 | **Flat 13-item sidebar**, daily desk work mixed with rare setup (Plans and Expenses sit between Money and Workout plans) | Scans the whole list every time; new items (Challenges, Branches) make it 15+ |
| 2 | **Staff & sign-in and Invite members (QR poster, invite link) have no menu entry on a computer.** They're only buttons inside Settings cards, but they're rows under More on a phone | "Where do I add my trainer's login?" The two devices teach different maps |
| 3 | **Member-app setup is scattered across 5 places**: Settings → Member app (code), Settings → Open branding, Visits → check-in poster, Messages & offers (with Automatic reminders hidden inside), Workout plans | Setting up the member app means a tour. Automatic reminders are found by chance |
| 4 | **Settings is one long page** where "Erase and start fresh" sits on the same page as the gym name, and Branches is about to add more | Danger next to everyday edits. The page keeps growing |
| 5 | **Ambiguous labels**: "Plans" (membership plans) next to "Workout plans", "Visits" (page titled Attendance), "Messages & offers" hiding "Automatic reminders" | Opens the wrong one first |

**Proposed grouping**

Branch picker at the very top (All branches / one branch), then 3 headed groups:

| Group | Items |
|---|---|
| **Front desk** (daily) | Today · Members · Attendance · Money · Enquiries |
| **Member app** | Workout plans (+ workout of the day, trainer videos) · Messages and reminders · Challenges and offers (+ workout offer) · Shop orders |
| **Business** | Membership plans · Expenses and profit · Settings · Send feedback |

**Settings becomes 6 sections in a side list** (one page each): Gym details (name, phone, address,
GSTIN, receipts) · **Branches** (new) · Staff and sign-in · Member app (join code, invite link and
QR poster, your logo and colours) · Install the app · Your data (import, export, delete, demo and
erase, at the bottom, behind a confirm).

**Phone bottom bar:** Today · Members · Money · Attendance · More, with More using the same headings.

**New gym features on the admin side:** challenges → Challenges and offers · workout of the day and
form videos → Workout plans · bring a friend → lands in Enquiries, marked "Friend of &lt;member&gt;" ·
freeze/renew requests → a to-do on Today plus a badge on Members · how busy → Attendance (peak hours are already there).

---

## Appendix for the builder: route names behind the labels

Workout tab = `(tabs)/workout`; Profile = `(tabs)/profile`; Gym/Shop = `(tabs)/shop` (ShopScreen);
Settings rows come from `SETTINGS_PAGES` (settingsLines.ts) → `settings/<key>`; Workouts rows are
`WorkoutPrefsCard`; tiles are `DashboardTiles`; folder/routine menus are `tracker/lib/workoutTab.ts`;
the third-tab rule is `shop/gymTab.ts` + `TrackerTabBar`. Admin nav is built in `CrmApp.tsx`
(`nav`, `phoneNav`), More in `ui/screens/More.tsx`, Settings in `ui/screens/Settings.tsx`.
Legacy pages still routed: `bodyweight`, `measurements/*`, `nutrition` (hidden), `(tabs)/coach` (hidden).
