# R — Offers and notices for the gym, and a reward for logging workouts (22 Oct 2026)

**The owner asked (his words):** "We need to build a versatile offers and notification section for
the gym owner and the admin panel. I'll do the Firebase thingy, but you can at least build that
thing in which they can ... research all the use cases, like sending holiday message that gym is
closed to everyone, or new offers about the fees. One of the offers that I do want to build, and gym
owner nudged toward it, is incentive for users to actually track their workouts. Something like
track 10 workouts to get 3 extra days in your membership, something like that."

Research and design only. Nothing is built, and no server was touched.

## The short answer
- **Most of this can start now with no live server change.** Ready messages in English and Hindi, a
  "who is it for" picker, and a WhatsApp "send to next" queue for any group of members. All of it
  runs on what the admin app already holds.
- **One limit today.** A message inside the member app goes to **every** app member. Sending it in
  the app only to "plans ending this week" needs a live server change.
- **The workout reward works, with care.** Paying people to come raises visits while it runs. Only a
  small part lasts afterwards, and it lasts mostly in people who were not regulars. So keep the
  reward small, repeatable and aimed at building a habit.
- **The main anti-cheat:** a workout counts only on a day the gym's own register shows a check-in.
  A member logging on the sofa gets nothing. The worst a cheat can win is a reward for coming to
  the gym 10 times, which is what the owner wants anyway.
- **Privacy:** the phone sends only the **dates** of workouts that count, and only after the member
  taps "Join the offer". No exercises, weights, sets or body weight. The privacy notice already
  allows this ("unless you turn on a feature that clearly asks you first"). It needs a few added
  lines, which the owner must approve.
- **The reward:** the desk taps "Give 3 days". The plan's last day moves 3 days later, with a note.
  No receipt and no GST: a free extension is not a sale.
- **Push to the phone's notification shade** waits for Firebase. Firebase messaging itself is free.

Web search ran out partway through this research. Competitor details come from their own home
pages (read today) and from the earlier India research (`Audit/crm-research/RESEARCH.md`). Study
numbers were read from the papers' own pages today unless marked otherwise.

---

## 1. What exists today (read from the code)

**Messages inside the member app (live since 14 Oct).**
- The owner writes a message in the admin app under Shop → Messages. There are 6 types:
  announcement, gym closed, new timings, offer, event, reminder. Each type starts with ready words in
  English, and blanks in [brackets] must be filled before it can go.
- It goes to **every** app member of the gym. There is no way to pick a group.
- Limits on the server: at most 1 offer or event a day and 3 a week per gym. At most 20 messages a
  day in all. Gym closed, timings and reminders are never held back by the offer limit.
- The member sees it in the Messages inbox (the bell on the Shop tab, with an unread count). A new
  member also sees messages from the 14 days before they joined.
- The owner sees "Seen by 12 of 40" and can take a message back.
- **How the phone gets it:** there is no push. The app asks the server when it opens, when the Shop
  tab opens, and when it comes back to the screen after an hour or more. So a member who never opens
  the app never sees the message.
- Title up to 60 letters, message up to 300.

**WhatsApp from the owner's own phone (live).** Ready messages for one member at a time: fees due,
plan ending, plan ended, birthday, welcome, and the receipt. English only. They open the owner's
WhatsApp with the words typed in, so they cost nothing.

**What the admin app already knows** (it keeps the whole gym in memory): every member, plan,
membership, payment, check-in, batch and date of birth. It already works out "plan ends within 7
days", the "Away" list (members who stopped coming, from their own usual rhythm, 10 to 21 days),
and birthdays. **So any group of members can be picked in the admin app without a server change.**

**Gift days already exist.** "Freeze / extra days" has a "Gift – Extra days" reason. It moves the
plan's last day later and writes a note like `+3 days (Gift - extra days): 2026-11-30 -> 2026-12-03`.
On the server only the **owner** can do this. The front desk cannot move a plan's last day (a
safety rule from the 16 Oct review, so staff cannot hand out free months).

**Linking an app member to the gym's list.** An app member is tied to the gym's member record only
after one QR check-in (by mobile number, and the first name must match). "My membership" and gym
workout plans already use this. A member who never scanned the QR cannot be matched.

**Workouts stay on the phone.** They are never sent. The privacy notice says so and adds: "Nothing
about your body or health leaves your phone unless you turn on a feature that clearly asks you
first." An old switched-off summary upload (workouts per week, body weight, calories) still sits in
the app's code, turned off. It must stay off and should be removed; this design does not use it.

**A finding on receipts.** A reprinted receipt prints the plan's dates as they are **now**. After a
gift or reward, an old receipt shows the longer end date, as if those days were paid for. That
breaks the rule that a receipt never changes after it is issued. Fix (no server change): print the
dates as sold, plus a line "Extended free by 3 days (reward) to 3 Dec".

---

## 2. Every message a gym sends, and who it goes to

"In the app" means the inbox now and a push later. "WhatsApp" means from the owner's own phone.

| Use | Type | Who gets it (default) | When | Channel |
|---|---|---|---|---|
| Gym closed for a festival or holiday | Gym closed | Everyone | 2 days before, plus the morning of | App + WhatsApp to members without the app |
| Gym closed today (power cut, water, repair, election day) | Gym closed | Everyone | At once | App (push later) |
| New timings (summer, winter, Ramzan, Sunday half day) | New timings | Everyone | 3 days before | App + WhatsApp |
| Festival timings (Diwali, Holi half day) | New timings | Everyone | 2 days before | App |
| Machine under repair, steam room closed | Announcement | Everyone | When it happens | App only |
| A rule (shoes, towel, put weights back) | Announcement | Everyone | Rarely | App only |
| New batch or class (yoga, Zumba, ladies' batch) | Announcement | Everyone, or one batch | A week before | App + WhatsApp |
| New trainer | Announcement | Everyone | First day | App |
| Festival discount (Diwali, New Year, Holi, Independence Day, Women's Day, wedding season) | Offer | Everyone + members whose plan ended in the last 90 days | 7–10 days before | App + WhatsApp to the ended ones |
| Renew early, get days free | Offer | Plan ends within 15 days | 15 and 5 days before the end | App + WhatsApp |
| Bring a friend | Offer | Active members | Once a quarter | App |
| Couple and family offer | Offer | Everyone | Seasonal | App |
| Student offer | Offer | Everyone | Before college terms | App + WhatsApp to enquiries |
| Longer plan saves money (monthly → 6 or 12 months) | Offer | Members on a monthly plan | Near their renewal | App |
| **Workout reward** (log 10 workouts, get 3 days) | Offer | Active app members | When the owner starts it | App |
| Event (deadlift day, Yoga Day 21 June, a talk) | Event | Everyone | A week before | App + WhatsApp |
| Challenge (30-day challenge with a prize) | Event | Active members | A week before | App |
| Welcome | Personal | One new member | On joining | WhatsApp now; app automatic later |
| Birthday | Personal | Birthday today | Morning | WhatsApp now; app automatic later |
| Plan ending | Personal | Plan ends in 7 days, and in 1 day | Morning | WhatsApp now; app automatic later |
| Plan ended (come back) | Personal | Ended 7 days ago, then 30 days ago, then stop | Morning | WhatsApp |
| Haven't seen you (no sales words) | Personal | "Away" list | Once per absence | WhatsApp, from the trainer or desk |
| Fees due | Personal | Part paid | When due | **WhatsApp only, never in the app** (the app cannot prove who holds the phone) |
| One year with us | Personal | Joining anniversary | Morning | App automatic later |
| Reward earned / days added | Personal | That member | At once | App |

**Ready templates:** every row except "fees due" gets ready words in English and Hindi (section 7).
Owners write their own only for odd cases.

**The groups the owner can pick:** everyone · active (a plan covers today) · plan ends within N days
(3, 7, 15) · plan ended in the last N days (30, 90) · away N or more days (the Away list) · on one
plan · in one batch · birthday today · joined in the last 30 days.

**Frequency rules** (keep what the server does today, and add these later):
- Offers and events: at most 1 a day and 3 a week per gym (today's rule, keep it).
- Gym closed and timings: never capped. These are the messages members want.
- Personal automatic messages (step 3): at most 1 a day per member, never 9 pm to 8 am India time.
  Plan ending: only 7 days and 1 day before. Plan ended: 7 and 30 days after, then stop.
- **Never put an offer in a "haven't seen you" message.** In a telecom field study, customers sent
  an unasked money-saving offer left more often (10%) than those left alone (6%) (Ascarza and
  others, 2016, from the earlier trainer research). Talk about their training, not a price.
- Members can turn off offers and events in the app (step 3). Gym closed and timings stay on.

---

## 3. How other gym software does it

| Product | How it messages | Groups and automatic messages | Rewards or challenges |
|---|---|---|---|
| Mindbody | Email and text campaigns | Win-back for clients who haven't visited; welcome templates; groups like new, regulars, haven't booked; tracks opt-outs | Thank-you messages at milestones, perks for loyal clients; no points |
| Glofox | Email, SMS and push | "Churn alerts" for falling attendance; milestone messages and birthday wishes sent automatically | Not on its pages |
| PushPress | Two-way SMS, email, push (in its workflow builder) | Automatic follow-ups; groups by interests, purchases and activity level | Not on its pages |
| Wellyx (UK) | Email, SMS, WhatsApp and push campaigns | AI groups; automatic fee reminders | Loyalty program in its top plan |
| GymMaster | Email, SMS, newsletters | "Set and forget" retention tools; mass messages to the right members | Not on its pages |
| Trainerize | In-app 1-to-1 and group messages | Automatic personal messages | Leaderboard challenges, and "threshold" challenges "where everybody wins"; badges for workouts and streaks |
| FitnessForce (India, now Daxko) | Two-way SMS, email, WhatsApp | Automatic reminders and renewals | Promotions; detail not public |
| GoGym4U (Jaipur) | SMS credits; an "auto WhatsApp" switch | Expiry lists (today, 1–5, 6–10, 11–15 days), birthday today | A **"Gift Day"** button on every member |
| GymBook, OkGym, My Gym (India) | SMS credits or the owner's own WhatsApp with ready words | Expiry and due lists, birthday today | Not seen |

**What owners like and hate (India reviews, earlier research):**
- Hate paying for SMS credits on top of the subscription, and price jumps at renewal.
- Hate SMS they cannot edit (GymBook) and WhatsApp sending that breaks.
- Asked for: "a message to all live members at once" and "one click WhatsApp to pending members"
  (OkGym reviews). That is the "send to next" queue below.
- Gift days and freeze are expected. Owners complain when they are missing.

**What members dislike:**
- Too many messages, and offers that are not for them. Android 13 and newer turns an app's
  notifications **off** until the member allows them, and members can switch them off any time.
  Google's advice: ask in context, after an action that shows the value, never at first launch.
- On WhatsApp, members can block a business. Meta now charges per message: marketing messages cost
  the most (the India rate went up on 1 Jan 2026), and from 1 Oct 2026 even utility messages are
  charged. The owner's own WhatsApp, as today, stays free.

**Lessons for ForgeAI:**
1. Groups and ready words are standard. Push, SMS and WhatsApp automation are the paid tiers.
2. Our edge: no SMS credits. The app inbox, and later push, are free. WhatsApp goes from the
   owner's own number.
3. Indian owners think in lists: "expiring in 1–5 days", "birthday today". Use the same words.
4. "Gift days" is a known habit in Indian gyms. The workout reward is a gift day with a rule.

---

## 4. The workout reward ("log 10 workouts, get 3 extra days")

### 4.1 What the evidence says
- **Paying people to go to the gym works while it runs, and some of it lasts.** Charness and
  Gneezy (2009) paid students to go to the gym during one month. Visits rose clearly **after** the
  month, compared with control groups. The rise came **entirely from people who were not regulars
  before**. Weight, waist and pulse improved too.
- **The biggest test: 61,293 members of a US gym chain, 54 four-week programs** (Milkman and
  others, Nature 2021, the "StepUp" megastudy with 24 Hour Fitness). 45% of the programs raised
  weekly visits, by 9% to 27%. The best one: **small rewards for coming back after a missed
  workout**. But only **8%** of the programs still showed a measurable change after the four weeks.
- **Workers at a Fortune-500 company** (Royer, Stehr and Sydnor, 2015): a four-week reward to use
  the company gym had only small lasting effects. Those who then chose a self-funded promise
  ("I lose money if I stop") kept the change for years.
- **Audiobooks only at the gym** (Milkman, Minson and Volpp, 2014; 226 members): visits rose 51% at
  first, then faded, mostly after a holiday break. 61% then paid to keep the "only at the gym" rule.
- **People overestimate how often they will go.** Members on a flat monthly fee went about 4.3
  times a month, paying over $17 a visit when a 10-visit pass cost about $10 (DellaVigna and
  Malmendier, 2006). Acland and Levy (2015) found the same overconfidence, plus a real
  after-reward rise that people did not predict.
- **Coming more goes with staying longer** (UK gyms, earlier research, a link and not proof of
  cause): coaxing an inactive member back went with 45% fewer cancellations. Only 67% of members
  are still there after 12 months, and month-to-month members cancel about 4 times as often as
  those on 12-month terms (One Million Strong study).
- **Tracking can spoil the fun** for some people (Etkin, 2016), and leaderboards with fixed targets
  made teenagers feel guilty (Fitbit study, 2017). Both from the earlier trainer research.

### 4.2 What that means for the design
1. **Expect a bump while it runs and a small lasting gain.** Sell it to the owner as "more visits
   this month, a few new regulars", not as a cure for members leaving.
2. **Aim at habit-building:** a short window (30 days), reachable for an irregular member (10 in
   30 days is about 2–3 a week), and repeatable (the owner can run it again).
3. **Keep it small and kind.** 3 days is a thank-you. No leaderboard, no ranking, no countdown.
4. **Later idea from the megastudy's winner:** a "welcome back" version, where the first workout
   after a 7-day gap counts double. Not in version 1.
5. **Regulars will earn it too.** That costs a few days and thanks the loyal members. Accept it.

### 4.3 What counts as a workout
A workout counts when **all** of these are true:
- **The gym's register shows a check-in for this member that day** (desk, QR poster, or a future
  entry machine). The server checks this; the phone cannot fake it.
- At most one a day.
- Done inside the member's 30-day window, which starts when they tap "Join the offer".
- Checked on the phone (the server never sees the workout):
  - finished and saved, not discarded;
  - logged live in the app, so not "log a past workout", not imported from Hevy or Strong, not demo
    data, and its date not moved later;
  - at least **20 minutes** long;
  - at least **6 completed sets** (warm-ups don't count).

### 4.4 Stopping cheating

| Cheat | Answer |
|---|---|
| Logging workouts at home on the sofa | Counts only on a day with a check-in in the gym's register |
| A fake or edited workout on a check-in day | The phone checks it was logged live, 20+ minutes, 6+ sets. A changed phone could skip this, but the member still came to the gym that day, which is the owner's real goal |
| Scanning a photo of the QR poster from home | The register shows app check-ins with an "App" tag. The reward list shows each member's desk and app check-ins side by side. The owner can choose "desk check-ins only". A QR that changes every 30 seconds, or an entry machine, closes this later (see R-qr-entry.md) |
| Leaving and re-joining the app to earn twice | The reward is tied to the gym's member record, not the phone. Once per member per offer |
| Using someone else's number | The same checks as "My membership": the number matched at a check-in, the first name must match, and never for a number two members share |
| A member with no running plan | Can join only with a plan that covers today. Days are added to a running plan |

### 4.5 What leaves the phone, and the consent screen
**What is sent, exactly:**

| When | Sent to the server | Never sent |
|---|---|---|
| Member taps "Join the offer" | The offer, "joined", the version of the words they saw | — |
| After a counted workout, when online | The list of dates in the window, for example `2026-11-04` | Exercises, sets, weights, reps, how long, start time, body weight, photos, notes |
| Member taps "Leave the offer", or leaves the gym | "Left" | — |

The server keeps a date **only if** the register shows a check-in that day, and drops the rest. So
the gym learns one new fact: "on this day you came, you also logged a workout in the app". The
phone sends the whole list each time, so a check-in the desk adds late still counts on the next
send, and no unmatched date is ever stored.

**Why dates and not just a count:** a count would have to be trusted. Dates can be checked against
the register.

**The law (India, not legal advice).** The DPDP Act 2023 says consent must be "free, specific,
informed, unconditional and unambiguous with a clear affirmative action", limited to the data
needed for the purpose (section 6(1)). It must be as easy to withdraw as to give (6(4)). The notice
must say what data, why, how to withdraw, and how to complain to the Board (section 5). The gym must
be able to prove consent was given (6(10)), so keep a log. Under today's 2011 rules a "physical
condition" is sensitive. A workout date is probably not, but treat it as sensitive anyway, as the
trainer research did. The app is already 18+ only.

**Consent screen (English):**
> **Join: 10 workouts, 3 extra days**
> **How it works:** on a day you check in at RAM'S FITNESS, log a workout of at least 20 minutes
> in ForgeAI. Log 10 of them within 30 days, and 3 days are added to your membership.
> **What the gym gets:** only the dates of those workouts. Never your exercises, weights, sets,
> body weight or photos.
> **Who sees it:** the owner and front desk of RAM'S FITNESS.
> **Stop any time:** Offers → Leave the offer. The dates are deleted.
> [ Join the offer ]  [ Not now ]
> Questions or complaints: [contact]. If not solved: the Data Protection Board of India.

**Consent screen (Hindi):**
> **ऑफ़र से जुड़ें: 10 वर्कआउट, 3 दिन ज़्यादा**
> **कैसे:** जिस दिन आप RAM'S FITNESS में चेक-इन करें, उस दिन ForgeAI में कम से कम 20 मिनट का
> वर्कआउट लॉग करें। 30 दिन में ऐसे 10 वर्कआउट होने पर आपकी मेंबरशिप में 3 दिन जुड़ जाएँगे।
> **जिम को क्या मिलेगा:** सिर्फ़ उन वर्कआउट की तारीख़ें। आपकी एक्सरसाइज़, वज़न, सेट, बॉडी वेट या
> फ़ोटो कभी नहीं।
> **कौन देखेगा:** RAM'S FITNESS के मालिक और फ़्रंट डेस्क।
> **कभी भी बंद करें:** Offers → ऑफ़र छोड़ें। तारीख़ें मिटा दी जाएँगी।
> [ ऑफ़र से जुड़ें ]  [ अभी नहीं ]
> सवाल या शिकायत: [contact]। हल न हो तो: Data Protection Board of India.

No ticked box. "Not now" is remembered. Not joining changes nothing about the membership.

### 4.6 Privacy notice changes (the owner approves the words)
1. **"Your workouts" bullet**, add: "If you join a gym's workout offer, the app sends your gym only
   the dates of the workouts that count, and only while you are in the offer."
2. **New row in "What we keep on our server":** "Workout offers you join: the offer, when you
   joined or left, the dates of workouts that counted (only days you checked in), and the reward |
   To give you the reward | Dates: deleted when you leave the offer or the gym, or 90 days after
   the offer ends. The reward stays on your membership record. When you joined and left: 1 year."
3. **"Who is responsible":** the gym is responsible for its offers and rewards. ForgeAI handles
   the dates for the gym.
4. **"Last updated"** date, and an in-app note before the change applies ("We tell you in the app
   before a change that affects you").

### 4.7 How the reward is given
- **Recommended: the desk gives it with one tap.** When a member reaches 10, the admin app shows
  "Rewards to give: Rahul Sharma — 10 of 10 — Give 3 days". The desk taps it and tells the member
  in person. A personal word from staff is itself linked to members staying (earlier research).
- **What the tap does:** the server finds the member's gym plan that ends last (not a PT pack, not
  cancelled), moves its last day 3 days later, and writes a note: `+3 days (Reward - Workout offer
  Nov): 2026-11-30 -> 2026-12-03`. The member's "My membership" shows the new date. The Offers card
  says "Added: your plan now ends on 3 Dec".
- **No running plan** (it ended): the button says "Give when they renew", and the reward waits.
- **The front desk may give an earned reward** through this one server function, exactly the
  offer's days, once. They still cannot move a plan's date any other way.
- **Automatic giving** can be a switch for the owner later (default off).
- **Receipt and tax:** no new receipt and no money. A free extension with no payment is not a
  "supply" under GST (CBIC circular 92/11/2019, para A: goods or services given free, without
  consideration, are not a supply). The original receipt stays as issued and, with the fix in
  section 1, prints its sold dates plus "Extended free by 3 days (reward)". A GST-registered gym
  should confirm with its CA once.

### 4.8 Limits
- Once per member per offer. One workout offer running at a time per gym.
- The owner sets: workouts 4–30 (default 10), window 7–60 days (default 30), reward 1–7 days
  (default 3), last day to join.
- Stopping an offer: no new joins. Members already in keep their window.
- The owner pays nothing in money. The real cost is that the member's renewal falls 3 days later.

### 4.9 What it costs the owner (an estimate, not evidence)
A ₹1,200-a-month member who earns it once pushes the next renewal 3 days later: about ₹120 of
timing, once. If the offer keeps one extra member in ten for one more month, it pays for itself
many times. Measure it at the first gym: who joined, who earned, and visits before, during and
after, against members who did not join.

---

## 5. What the member sees

**Words:** "workouts", "gym days", "check in", "extra days", "membership". Never "volume", "PR" or
"session". No "hurry", "last chance", "don't miss" or "you'll lose".

**A. The inbox message** (Offer): "Log 10 workouts, get 3 extra days". A button: "See the offer".

**B. The Offers card** on the Shop tab, above "My membership", only while an offer runs:
```
┌──────────────────────────────────────────┐
│ From RAM'S FITNESS · Offer               │
│ Log 10 workouts, get 3 extra days        │
│ Check in, log a workout of 20+ min.      │
│ 10 of them within 30 days.               │
│                         [ How it works ] │
└──────────────────────────────────────────┘
```
A member not yet matched to the gym's list sees: "Check in once with the gym's QR poster to join."

**C. The consent screen** (section 4.5).

**D. After joining:**
```
┌──────────────────────────────────────────┐
│ Workout offer                            │
│ 6 of 10 workouts                         │
│ ● ● ● ● ● ● ○ ○ ○ ○                      │
│ Until 21 Nov                             │
│ Counts on days you check in at the gym.  │
│                       Leave the offer ›  │
└──────────────────────────────────────────┘
```
Quiet colours: the gym's accent, no red, no ticking clock.

**E. On the finish-workout screen**, one small line only when it counted: "Counts for the gym's
offer: 7 of 10." If they logged but did not check in that day, once: "This one didn't count: no
check-in at the gym today."

**F. Done:** "10 of 10. The desk will add 3 days to your membership." Then "Added: your plan now
ends on 3 Dec."

**G. Window over short of 10:** "The offer ended at 7 of 10. You came 7 times in 30 days. Nice
work." No shame words.

**H. Settings → Your gym:** "Offers you joined" with "Leave". Leaving the gym leaves every offer.

**Notifications (after Firebase):** one when the reward is earned, one when the days are added.
No reminders to log more.

---

## 6. Recommended design: the owner's screens and steps

**Move Messages out of Shop** into its own item for the owner: **"Messages & offers"**, with tabs
**New message · Offers · Sent** (and **Automatic** in step 3).

**Sending a message, step by step:**
1. **Pick a ready message.** Cards in four groups: Gym news, Offers, Events, Personal. Or "Write
   my own".
2. **Language:** English · हिन्दी · Both. "Both" puts the Hindi under the English. Most templates
   fit the 300-letter limit in both languages; the letter count warns when one does not.
3. **Fill the blanks** with boxes and pickers (day, date, time, festival from a list), not typing
   into [brackets].
4. **Who gets it:** a default per template (section 2), changeable. The panel shows:
   "In the app: 34 members. Not in the app: 52. **Send them on WhatsApp →**"
5. **When:** now (step 1), or a chosen day and time (step 2).
6. **Preview** on a phone picture, then "Goes to 34 in the app and 52 on WhatsApp. Send?"
7. **WhatsApp "send to next":** "1 of 52: Rahul Sharma [Open WhatsApp] [Skip]". Each opens the
   owner's WhatsApp with the words typed in. Coming back moves to the next. The list remembers who
   was done.

In step 1 a message in the app still goes to everyone with the app. For a smaller group, the screen
says "In the app this goes to everyone; for just this group, use WhatsApp."

**Today screen nudges** (step 1, from data the panel has): "3 birthdays today", "5 plans end this
week", "2 rewards to give". Each opens the right ready message or list.

**Offers tab (step 2):**
- "Start a workout offer": workouts [10], within [30] days of joining, reward [3] days, joining open
  until [date], minimum workout 20 minutes. Count check-ins from: desk and app (default) or desk
  only. Preview what members see. "Start offer" also sends the announcement (it counts as that
  day's offer).
- While it runs: joined 23 · earned 4 · given 2. "Rewards to give" with a Give button on each. Each
  member row shows their count and desk/app check-ins.
- "Stop offer".

**Automatic tab (step 3, after Firebase):** switches for birthday, plan ending (7 days and 1 day),
welcome, plan ended (7 and 30 days), one year with us. Each shows its words and can be edited. Sent
at 9 am India time. Never more than one a day per member.

---

## 7. Templates (English and Hindi)

Blanks in [brackets] are filled by the owner. All titles fit 60 letters and all messages fit 300,
in each language (counted with the blanks still empty; the admin app's letter count checks the
filled-in version). "Both" fits for every template except the workout offer, which goes in one
language.

**Gym news**
1. **Gym closed (festival)** — Gym closed · everyone
   - EN: **Gym closed on [day]** — The gym is closed on [day] for [festival]. We open again on [day] at [time]. Happy [festival]!
   - HI: **[day] को जिम बंद रहेगा** — [festival] के कारण [day] को जिम बंद रहेगा। [day] को [time] बजे से फिर खुलेगा। [festival] की शुभकामनाएँ!
2. **Gym closed today** — Gym closed · everyone
   - EN: **Gym closed today** — Sorry, the gym is closed today because of [reason]. We open again [when].
   - HI: **आज जिम बंद है** — माफ़ कीजिए, [reason] के कारण आज जिम बंद है। [when] फिर खुलेगा।
3. **New timings** — New timings · everyone
   - EN: **New gym timings from [date]** — From [date] the gym is open [time] to [time]. Sunday: [time] to [time].
   - HI: **[date] से जिम का नया समय** — [date] से जिम [time] से [time] तक खुलेगा। रविवार: [time] से [time] तक।
4. **Festival timings** — New timings · everyone
   - EN: **[Festival] timings** — On [day] the gym is open only [time] to [time].
   - HI: **[festival] पर जिम का समय** — [day] को जिम सिर्फ़ [time] से [time] तक खुला रहेगा।
5. **Machine under repair** — Announcement · everyone
   - EN: **[Machine] under repair** — The [machine] is under repair till [date]. Sorry for the trouble. Ask a trainer for another exercise.
   - HI: **[machine] की मरम्मत चल रही है** — [date] तक [machine] की मरम्मत चल रही है। असुविधा के लिए माफ़ी। ट्रेनर से दूसरी एक्सरसाइज़ पूछें।
6. **New batch** — Announcement · everyone or one batch
   - EN: **New [batch] batch** — A new [batch] batch starts on [date], [time] to [time]. Ask at the desk to join.
   - HI: **नया [batch] बैच** — [date] से नया [batch] बैच शुरू, [time] से [time] तक। जुड़ने के लिए डेस्क पर पूछें।
7. **New trainer** — Announcement · everyone
   - EN: **Meet our new trainer, [name]** — [name] joins us from [date] and trains [what]. Say hello at the gym!
   - HI: **हमारे नए ट्रेनर [name]** — [date] से [name] हमारे साथ हैं। वे [what] सिखाते हैं। जिम में मिलिए!
8. **A request to everyone** — Announcement · everyone
   - EN: **A request to everyone** — Please [rule]. It keeps the gym clean and safe for all. Thank you!
   - HI: **सबसे एक निवेदन** — कृपया [rule]। इससे जिम सबके लिए साफ़ और सुरक्षित रहता है। धन्यवाद!

**Offers** (each counts toward 1 a day, 3 a week)

9. **Festival offer** — everyone + ended in the last 90 days
   - EN: **[Festival] offer: [discount] off** — Join or renew by [date] and get [discount] off the [plan] plan. Ask at the desk.
   - HI: **[festival] ऑफ़र: [discount] की छूट** — [date] तक जॉइन या रिन्यू करें और [plan] प्लान पर [discount] की छूट पाएँ। डेस्क पर पूछें।
10. **Renew early** — plan ends within 15 days
    - EN: **Renew early, get [days] days free** — Renew before your plan ends and get [days] extra days free. Offer till [date].
    - HI: **जल्दी रिन्यू करें, [days] दिन मुफ़्त** — प्लान ख़त्म होने से पहले रिन्यू करें और [days] दिन मुफ़्त पाएँ। ऑफ़र [date] तक।
11. **Bring a friend** — active members
    - EN: **Bring a friend, get [days] days free** — When a friend joins and names you, you get [days] extra days and your friend gets [discount] off. Till [date].
    - HI: **दोस्त को लाएँ, [days] दिन मुफ़्त** — आपका नाम लेकर दोस्त जॉइन करे तो आपको [days] दिन ज़्यादा और दोस्त को [discount] की छूट। [date] तक।
12. **Couple and family** — everyone
    - EN: **Couple and family offer** — Join together and save: [discount] off each for 2 or more family members, any plan. Till [date].
    - HI: **कपल और फ़ैमिली ऑफ़र** — साथ जॉइन करें: परिवार के 2 या ज़्यादा लोगों को किसी भी प्लान पर [discount] की छूट। [date] तक।
13. **Student** — everyone
    - EN: **Student offer: [price] a month** — Students get the [plan] plan for [price] a month. Show your college ID at the desk.
    - HI: **स्टूडेंट ऑफ़र: [price] प्रति महीना** — स्टूडेंट्स को [plan] प्लान [price] प्रति महीना। डेस्क पर कॉलेज आईडी दिखाएँ।
14. **Longer plan** — members on a monthly plan
    - EN: **Save with a [months]-month plan** — Take the [months]-month plan for [price] and save [saving] over paying monthly. Till [date].
    - HI: **[months] महीने के प्लान पर बचत** — [months] महीने का प्लान [price] में लें। हर महीने फ़ीस देने से [saving] की बचत। [date] तक।
15. **Workout offer** — active app members (one language per message)
    - EN: **Log [n] workouts, get [days] extra days** — Check in and log [n] workouts in ForgeAI within [window] days. Get [days] extra days on your membership. Open Offers in the app to join.
    - HI: **[n] वर्कआउट लॉग करें, [days] दिन ज़्यादा पाएँ** — जिम में चेक-इन करके [window] दिन में ForgeAI में [n] वर्कआउट लॉग करें। मेंबरशिप में [days] दिन ज़्यादा पाएँ। जुड़ने के लिए ऐप में Offers खोलें।

**Events**

16. **Event** — everyone
    - EN: **[Event] on [date]** — Join us for [event] on [date] at [time]. Free for members. Bring a friend!
    - HI: **[date] को [event]** — [date] को [time] बजे [event] में आइए। मेंबर्स के लिए मुफ़्त। दोस्त को भी लाएँ!
17. **Challenge** — active members
    - EN: **[Challenge] starts on [date]** — Our [challenge] starts on [date]. Sign up at the desk. Prize: [prize].
    - HI: **[date] से [challenge] शुरू** — [date] से हमारा [challenge] शुरू। डेस्क पर नाम लिखवाएँ। इनाम: [prize]।

**Personal** (WhatsApp now; automatic in the app in step 3, except fees). The English ones already
exist in the admin app; these add Hindi and three new ones.

18. **Fees due** (WhatsApp only) — HI: नमस्ते [name] जी, आपकी ₹[amount] फ़ीस बाक़ी है। कृपया डेस्क पर या UPI से जमा करें। – [gym]
19. **Plan ending** — HI: नमस्ते [name] जी, आपका [plan] प्लान [date] को ख़त्म हो रहा है। बिना ब्रेक ट्रेनिंग जारी रखने के लिए डेस्क पर रिन्यू करें। – [gym]
20. **Plan ended** — HI: नमस्ते [name] जी, आपका [plan] प्लान [date] को ख़त्म हो गया। जिम में आपकी कमी महसूस हो रही है। कभी भी रिन्यू करके वापस आइए। – [gym]
21. **Birthday** — HI: जन्मदिन की बहुत-बहुत शुभकामनाएँ, [name] जी! आपका साल शानदार रहे। – [gym]
22. **Welcome** — HI: नमस्ते [name] जी, [gym] में आपका स्वागत है! आपका [plan] प्लान [date] तक है। जिम में मिलते हैं।
23. **Haven't seen you** (new; no offer in it)
    - EN: Hi [name], we haven't seen you in [n] days. All well? Your plan runs till [date]. See you soon.
    - HI: नमस्ते [name] जी, [n] दिन से आप जिम नहीं आए। सब ठीक है? आपका प्लान [date] तक है। जल्द मिलते हैं।
24. **One year with us** (new)
    - EN: Hi [name], today you complete [n] year with [gym]. Thank you for training with us!
    - HI: नमस्ते [name] जी, आज [gym] के साथ आपका [n] साल पूरा हुआ। हमारे साथ ट्रेनिंग के लिए शुक्रिया!
25. **Reward earned** (new, automatic in the app)
    - EN: **You earned [days] extra days** — [n] of [n] workouts done. The desk will add [days] days to your membership.
    - HI: **आपने [days] दिन ज़्यादा कमाए** — [n] में से [n] वर्कआउट पूरे। डेस्क आपकी मेंबरशिप में [days] दिन जोड़ देगा।
26. **Days added** (new, automatic in the app)
    - EN: **[days] days added** — Your membership now ends on [date]. Thanks for training with us!
    - HI: **[days] दिन जोड़ दिए गए** — अब आपकी मेंबरशिप [date] तक है। हमारे साथ ट्रेनिंग के लिए शुक्रिया!

Festival list for the picker (names only; the owner picks the date): Diwali, Holi, Eid, Christmas,
New Year, Makar Sankranti, Raksha Bandhan, Navratri, Independence Day, Republic Day, Women's Day,
Yoga Day. No festival dates are typed into the app, because they move every year.

The member app is in English, but it shows Hindi text sent by the gym. Check a Hindi message on a
cloud phone once while building (the app's fonts must fall back to a Hindi font).

---

## 8. Build order

### Step 1 — buildable now, no live server change
1. **Templates** (section 7) in the admin app, with English · हिन्दी · Both, and boxes for the blanks.
2. **"Who gets it" picker + WhatsApp "send to next" queue** for any group (expiring, ended, away,
   plan, batch, birthday). Built from the data the admin app already has. In the app the message
   still goes to everyone.
3. **Hindi** for the five existing WhatsApp messages, plus "haven't seen you" and "one year".
4. **Messages & offers** as its own item for the owner; Today screen nudges.
5. **Receipt fix:** print the dates as sold, plus "Extended free by N days" (section 1).
6. **Workout offer pilot, no data sent:**
   - The owner announces it with template 15.
   - The member app gets a card: **"Show my workouts to the desk"**. It lists the member's counted
     workouts in the last 30 days (the same phone rules: live, 20+ minutes, 6+ sets) and shows a
     short **claim code** that holds those dates, like `K3Q9-PX2M`.
   - The desk types the code into the member's page. The admin app reads the dates and matches them
     against its own register: "9 of 10 match check-ins". Then the owner gives the days with the
     existing gift button, reason "Reward".
   - Nothing goes to the server. The member shows the code by choice. This also works for gyms that
     keep their records only on the desk device, where step 2 cannot work, so it stays useful.
   - Limit: on the server only the owner can add gift days today, so the owner gives it.

### Step 2 — needs the owner's yes to a live server change
1. The offer tables and functions (section 9).
2. Member app: Offers card, consent screen, progress, dates sent automatically, Leave the offer.
3. Admin app: Offers tab, progress list, the desk's Give button, "rewards to give" on Today.
4. **In-app messages to a group** (plan ending, a batch, away and so on), and **messages sent at a
   chosen time**.
5. "Reward earned" and "days added" messages in the member's inbox.
6. The privacy notice change (section 4.6) goes live with the release, in the owner's approved words.

### Step 3 — after the owner sets up Firebase
1. The server remembers each phone's push address (with the member's OK), and sends pushes.
2. The app asks to allow notifications in context: after the first gym message or after joining an
   offer ("Want a ping when the gym is closed or your days are added?"). Never at first launch.
3. Settings: "Offers and events: on/off". Gym closed and timings stay on.
4. Pushes: gym closed and timings at once; offers at most 2 a week per member; reward earned and
   days added.
5. The Automatic tab (birthday, plan ending, welcome, plan ended, one year), quiet hours 9 pm–8 am,
   at most one a day per member. Free through Firebase for app members. The paid WhatsApp provider
   (already in the backlog) stays a separate decision for members without the app.

---

## 9. Exact server changes (step 2, then step 3)

Same pattern as every table so far: row security on, no direct table access for anyone, every read
and write through a checked server function (SECURITY DEFINER with a fixed search_path). Nothing
about offers goes into the gym's records (`crm_records`), which every staff device downloads. The
only exception is the membership's new last day and its note. Each new function gets a test in
`supabase/tests/`, and the phone and admin app keep working against a server without the change
(the "call again without the new argument" pattern already in use).

### Tables (step 2)
| Table | Columns | Kept for |
|---|---|---|
| `gym_offers` | `offer_id` uuid key; `gym_id`; `kind` ('workout'); `title` (1–60); `workouts` (4–30, default 10); `window_days` (7–60, default 30); `reward_days` (1–7, default 3); `min_minutes` (default 20) and `min_sets` (default 6), told to the phone and checked there; `starts_on`; `join_until`; `count_app_checkins` (default true); `auto_give` (default false); `created_at`, `created_by`, `created_by_name`; `stopped_at` | While the gym uses ForgeAI |
| `offer_members` | `offer_id`; `roster_id` (the gym's member record id); `member_id` (the app member, cleared when they leave); `joined_at`; `window_ends_on`; `notice_version`; `left_at`; `earned_at`; `given_at`, `given_by`, `given_by_name`, `given_membership_id`, `given_days`, `old_end`, `new_end`. Key: (`offer_id`, `roster_id`), so once per member per offer | 1 year after the offer ends (proof of consent and of the reward) |
| `offer_days` | `offer_id`; `roster_id`; `day`; `source` (desk / app / import, copied from the check-in). Key: (`offer_id`, `roster_id`, `day`) | Deleted on Leave the offer, on leaving the gym, or 90 days after the offer ends |
| `offer_log` | `at`; `gym_id`; `offer_id`; `roster_id`; `event` (joined, left, earned, given, progress viewed); `by` (staff id); `notice_version` | 1 year (the DPDP log rule) |
| `gym_messages` (change) | add `audience` jsonb (null = everyone; else a group like `{"type":"ending","days":7}` or `{"type":"batch","name":"Morning 6-8"}`); add `send_at` (null = now) | As today |
| `gym_message_to` | `message_id`; `member_id` (app member). Who a group message went to, worked out at send time, so "Seen by x of y" stays right | As its message |

### Functions (step 2)
**Owner only** (an owner's sign-in or the old owner key; the front desk gets OWNER_ONLY):
- `owner_save_offer(key, offer)`: checks every number's range; only one running workout offer.
- `owner_stop_offer(key, offer)`.

**Owner and front desk** (any signed-in person of that gym):
- `owner_offers(key)`: offers with joined / earned / given counts, and for the running one each
  member's count, desk and app check-ins, window end, earned and given.
- `staff_give_reward(key, offer, roster_id)`: only when earned and not yet given. Takes the gym's row
  lock, finds the gym plan ending last (not PT, not cancelled, ending today or later), adds
  `reward_days` to its last day, writes the note, moves the records version on by one (as check-in
  does), stamps who gave it. Answers NOT_EARNED, ALREADY_GIVEN or NO_PLAN otherwise. This is the
  only way the front desk can move a plan's last day.
- `owner_audience_count(key, audience)`: how many app members a group reaches, for "Goes to N".
- `owner_send_message(...)` gains `audience` and `send_at` (optional, so older admin apps still work).

**Member app** (member key, with "My membership"'s checks: the number matched at a check-in, the
first name matches, never a shared number):
- `member_offers(key)`: the running offer, if any, and the member's own status (joined, counted,
  needed, window end, earned, given, new last day). Never anyone else's.
- `member_join_offer(key, offer, notice_version)`: needs a plan covering today. Writes the consent
  row and the log.
- `member_offer_days(key, offer, days)`: at most 60 dates. Keeps only dates inside the window, not
  in the future, with a check-in that day in the register (app check-ins only when the offer counts
  them). Drops the rest. Marks earned at the target, and gives at once if `auto_give` is on. Rate
  limit: 20 calls a day.
- `member_leave_offer(key, offer)`: sets `left_at`, deletes that member's `offer_days`. An earned or
  given reward stays.
- `member_leave` (exists): also leaves every offer.
- `member_messages` (exists): also returns group messages the member is in, and only once
  `send_at` has passed.

**Scheduled sends:** a job every 5 minutes (Supabase's pg_cron) releases messages whose time has
come (and in step 3 pushes them).

### Step 3 (after Firebase)
| Table | Columns | Kept for |
|---|---|---|
| `member_devices` | `member_id`; `token` (unique); `platform`; `created_at`; `last_seen_at`; `offers_muted` (default false) | Deleted on Leave, Erase all data, or 60 days unused |
| `push_log` | `message_id`; `member_id`; `sent_at`; `result` | 30 days |

Functions: `member_set_device`, `member_forget_device`, `member_set_mute`. A small server program
(a Supabase Edge Function) sends through Firebase's free messaging, using a Firebase key kept as a
server secret, never in the app. The app needs a new release with Firebase's file in it.

### Who can read what
| Who | Can see | Can do |
|---|---|---|
| Member's app | Its own offer status and its own messages | Join, send its dates, leave |
| Front desk | Offer progress (names, counts, desk/app check-ins, earned, given) | Give an earned reward; send nothing |
| Owner | Everything the desk sees, plus all offers and the Sent list | Create and stop offers, send messages, give rewards |
| Nobody | Exercises, weights, sets, workout length, body weight, photos (never on the server) | — |

---

## 10. The owner's decisions

1. **Live server change** for step 2 (offer tables, group messages, timed messages), and later
   step 3 (phone push addresses). Recommended: yes to step 2 after step 1 ships.
2. **Default reward numbers** (a promise the gym makes to members): 10 workouts within 30 days of
   joining the offer, 3 extra days, a workout counts at 20+ minutes with 6+ sets, once per member
   per offer. Recommended as written.
3. **Who gives the days:** the desk with one tap (recommended) or automatic.
4. **May the front desk give an earned reward?** Recommended: yes, only through the reward button.
5. **Do app (QR poster) check-ins count?** Recommended: yes, with desk and app counts shown side by
   side. The other choice is desk check-ins only, until an entry machine or a changing QR exists.
6. **Who can join:** every member with a running plan (recommended), or only new members and
   members coming back after a break.
7. **The consent words** in English and Hindi (section 4.5), and **the privacy notice changes**
   (section 4.6). The [contact] blank is the same one still open in inbox #37.
8. **When to set up Firebase** (his task, already in the backlog).

Claude's own calls (he can overrule): the build order; one language per message for the workout
offer; no leaderboard; no reminders to log more; the claim-code pilot in step 1; removing the old
switched-off workout summary upload.

---

## Where things are (for the builder)
- Admin messages: `apps/dashboard/src/crm/shop/MessagesSection.tsx`, `messages.ts`; WhatsApp words:
  `crm/logic/whatsapp.ts`; gift days: `crm/ui/forms/ExtendMembershipSheet.tsx`,
  `crm/data/local.ts` (`extendMembership`); receipt dates: `crm/logic/receiptDoc.ts`; Away list:
  `crm/logic/attendance.ts`.
- Member inbox: `apps/mobile/src/shop/inbox.ts`, `inboxStore.ts`, `InboxScreen.tsx`,
  `gymActions.ts` (`refreshInbox`), `gymApi.ts`; My membership: `shop/MembershipCard.tsx`.
- Workouts on the phone: SQLite `workout_sessions` / `set_entries` (`src/db/schema.ts`,
  `src/tracker/db/trackerSchema.ts`); "log a past workout": `tracker/components/LogPastSheet.tsx`.
  A "logged live" mark needs an additive phone schema step (never an edit to `schema.ts`).
- Old switched-off summary upload: `apps/mobile/src/cloud/` (`FEATURES.gymSync` is false).
- Server: `supabase/migrations/0008`, `0009`, `0015`, `0016`, `0018`, `0023`, `0024`.
- Privacy notice: `docs/launch/PRIVACY-NOTICE.md`.

## Sources

**Studies (read today unless marked)**
- Milkman and others, "Megastudies improve the impact of applied behavioural science", Nature 2021: https://www.nature.com/articles/s41586-021-04128-4
- Charness and Gneezy, "Incentives to Exercise", Econometrica 2009 (abstract): https://www.econometricsociety.org/publications/econometrica/2009/05/01/incentives-exercise and https://ideas.repec.org/a/ecm/emetrp/v77y2009i3p909-931.html
- Royer, Stehr and Sydnor, "Incentives, Commitments, and Habit Formation in Exercise", AEJ Applied 2015 (abstract): https://ideas.repec.org/a/aea/aejapp/v7y2015i3p51-84.html
- Milkman, Minson and Volpp, "Holding the Hunger Games Hostage at the Gym", Management Science 2014: https://pmc.ncbi.nlm.nih.gov/articles/PMC4381662/
- Acland and Levy, "Naiveté, Projection Bias, and Habit Formation in Gym Attendance", Management Science 2015 (abstract): https://ideas.repec.org/a/inm/ormnsc/v61y2015i1p146-160.html
- DellaVigna and Malmendier, "Paying Not to Go to the Gym", AER 2006 (abstract): https://www.aeaweb.org/articles?id=10.1257/aer.96.3.694
- One Million Strong (UK retention): https://www.healthclubmanagement.co.uk/health-club-management-features/One-million-strong/30115
- From the earlier trainer research (`R-trainer-view.md`, not re-read today): Ascarza and others 2016, https://drupalgsb-test.paas.cc.columbia.edu/sites/default/files-efs/pubfiles/12782/Perils_Ascarza.pdf ; staff contact and retention, https://www.healthclubmanagement.co.uk/health-club-management-features/Interaction-progress-retention/29486 ; Fitbit teen study, https://techcrunch.com/2017/08/02/fitbit-turns-teens-off-exercising-study-finds/ ; Etkin 2016 (cited there without a link).

**Gym software (home pages read today)**
- Mindbody marketing: https://www.mindbodyonline.com/business/marketing
- Glofox: https://www.glofox.com/ and https://www.glofox.com/solutions/engage-my-members/
- PushPress Grow: https://www.pushpress.com/products/grow
- Wellyx: https://www.wellyx.com/
- GymMaster: https://www.gymmaster.com/
- FitnessForce: https://fitnessforce.com/
- Trainerize features: https://www.trainerize.com/features/
- India (from `Audit/crm-research/RESEARCH.md`, Oct 2026): GoGym4U https://play.google.com/store/apps/details?id=com.threeclick.gogym ; GymBook https://play.google.com/store/apps/details?id=com.gymhelper.gymmanager ; OkGym https://play.google.com/store/apps/details?id=in.arkapps.okgymapp ; My Gym https://play.google.com/store/apps/details?id=in.studycafe.gymbook ; MyGymDesk https://mygymdesk.com

**Platforms, law and tax (read today)**
- WhatsApp Business pricing (per message since 1 Jul 2025; utility charged from 1 Oct 2026): https://developers.facebook.com/docs/whatsapp/pricing/
- Android notification permission (Android 13+): https://developer.android.com/develop/ui/views/notifications/notification-permission
- Firebase pricing (Cloud Messaging is no-cost): https://firebase.google.com/pricing
- DPDP Act 2023, sections 5 and 6 (Gazette copy): https://prsindia.org/files/bills_acts/acts_parliament/2023/Digital_Personal_Data_Protection_Act,_2023.pdf
- CBIC circular 92/11/2019-GST, sales promotion schemes: https://cbic-gst.gov.in/pdf/circular-cgst-92.pdf

**Not reached:** web search ran out partway. Wellyx's sub-pages were down (503). GymMaster's and
Trainerize's detail pages moved (404). Zenoti was not re-checked (the earlier research found it
serves mainly salons and spas in India).
