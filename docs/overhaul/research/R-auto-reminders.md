# R — Automatic reminders to members (23 Oct 2026, R-86)

**The owner asked:** "for Plans and offers - plan and implement automated app notifications for things
like membership expiring in XX days... think of all possible use cases... let the owner switch them On
or Off - leave some of the most common use cases on by default".

## The short answer
- **Every gym system sends these.** Plan ending, plan ended, birthday and welcome are the four that
  every product has, from Mindbody and Gymdesk to the Indian ones (GymPilot, Easy Gym, OKFit,
  FitnessForce). They are the common ones, so they start **on**.
- **"We haven't seen you" is common but the touchiest one.** Wodify's ready recipe waits 14 days with
  no check-in. It annoys members when it is wrong, and ours can be wrong (see below), so it starts
  **off**. It never carries an offer: an unasked money offer made customers leave more, not less
  (Ascarza and others, 2016; R-offers-notices.md).
- **No Firebase, no cost.** The member's phone sets each reminder itself, as a phone notification,
  from what it already knows (plan end date, birthday, visits, offer progress). It works with no
  internet and costs nothing per message.
- **One a day at most, at 9:30 in the morning, never at night.** Fitness-app pushes are opened most
  in the morning; a gym reminder is not urgent, so 9:30 am avoids waking anyone. If two fall on the
  same day, the more important one wins.
- **The limit of doing it on the phone:** the phone knows only what it learned the last time the app
  was open. A member who renewed at the desk and has not opened the app since can still get "your
  plan ends in 3 days". Opening the app (or tapping the reminder) fixes it at once. Exact reminders
  for members who never open the app need push from the server (Firebase, later).

## The cases we build
Title of every notification: the gym's name (e.g. "RAM'S FITNESS"). Tapping opens the gym tab, where
"My membership" and the workout offer sit at the top.

| # | Case | Default | Owner sets | When it comes | The words (example) |
|---|---|---|---|---|---|
| 1 | Plan ends in N days | **On** | N: up to 3 values, 1-30 (default 7 and 3) | N days before the last day | "Your plan ends in 3 days, on 30 Nov. Renew at the desk to keep training." |
| 2 | Plan ends today | **On** | - | The last day | "Your plan ends today. Renew at the desk to keep training." |
| 3 | Plan ended | **On** | N: up to 3 values, 1-60 (default 1 and 7) | N days after the last day | "Your plan ended on 30 Nov. Renew at the desk to keep your progress going." |
| 4 | Birthday wish | **On** | - | The birthday | "Happy birthday, Asha! Best wishes from all of us at RAM'S FITNESS." |
| 5 | Welcome | **On** | - | The first morning after joining (a new member: joined in the last 7 days) | "Welcome to RAM'S FITNESS, Asha! Your plan and the gym's news are in ForgeAI." |
| 6 | Workout offer: days added | **On** | - | The morning after the days are added | "3 extra days added to your plan for your workouts. It now ends on 3 Dec." |
| 7 | Workout offer: ending soon | Off | N: 1-14 (default 3) | N days before the member's 30 days run out, if not done | "3 days left in the workout offer: 4 more workouts for 3 extra days." |
| 8 | Workout offer: almost there | Off | - | The morning after the count reaches 2 left, and again at 1 left | "1 more workout for your 3 extra days. Check in and train today." |
| 9 | Personal training running low | Off | N left: 1-5 (default 2) | The morning after the count reaches N | "Personal training: 2 of 12 left. Ask the desk to add more." |
| 10 | We haven't seen you | Off | N days: 5-60 (default 14) | N days after the last check-in, once per absence, only while a plan is running | "We haven't seen you for 14 days, Asha. Come in when you can." |
| 11 | One year with us | Off | - | Each joining anniversary | "1 year with RAM'S FITNESS today. Thank you for training with us!" |

**Which wins on a crowded day (first wins):** birthday, plan ends today, plan ends in N days, plan
ended, days added, offer ending, almost there, personal training, welcome, we haven't seen you, one
year. Date-bound reminders (1, 2, 3, 4, 7, 11) keep their day or are dropped; one-off news (5, 6, 8,
9, 10) moves to the next free morning (within a week).

**Words:** never "volume", "PR" or "session"; no prices, no dues, no sales words in "we haven't seen
you".

## The rules
- **Renewal cancels.** A plan already paid after the current one (the "next" plan in My membership)
  means no "ends soon", "ends today" or "ended" reminders. Every refresh of the plan re-sets them.
- **Leaving cancels.** Leave the gym, the gym removing the member, or Erase all data: every gym
  reminder is cancelled at once.
- **Member's own switch:** Settings → Your gym → "Reminders from my gym" (on by default). Android's
  own notification permission and a new channel, "Gym reminders", are respected: switched off there,
  nothing arrives.
- **Owner's switches:** admin app → Messages & offers → "Automatic reminders": one switch per case
  with a one-line description, the days where they matter. Owner only; the front desk can look.
  Saved on the gym's server; members' phones pick them up the next time the app checks the gym (on
  opening, and about once an hour while it is used).
- **Server not updated yet:** the phones use the defaults above (cases 1-3, 5 and 6 work from what
  they already know; birthday, "we haven't seen you" and "one year" need the server's new data). The
  admin app says "Automatic reminders are not switched on for your gym yet".
- **Refresh:** whenever the phone reads the gym (launch, return after an hour, the gym tab, a QR
  check-in, the offer card). Up to 60 days ahead are set; nothing more is set for a phone left
  unopened longer than that.

## What the phone needs from the server (migration 0029)
- The owner's switches (one row per gym).
- The member's **birthday (day and month only, never the year)**, **joining date** and **last
  check-in date**, given only after the same checks "My membership" uses (the number matched at a
  QR check-in, the first name matches, no shared number).

## Left out, and why
- **Dues / part payment left:** never in the app. The member's number is not verified, so the app
  shows no money (0023's rule; R-offers-notices.md says fees go by WhatsApp only).
- **Membership freeze ending:** the admin app has no "frozen until" state; a freeze just moves the
  plan's last day, which "plan ends in N days" already follows.
- **Gym closed / holiday / new timings:** these are one-off messages the owner writes. They reach the
  inbox when the app opens; as a pop-up they need push from the server (Firebase).
- **Exact reminders for members who never open the app** (renewed at the desk, came back without
  scanning): needs push from the server (Firebase).
- **Class booking reminders, payment failed, trial ending:** ForgeAI has no class bookings, online
  payments or trials.
- **Members without the app:** WhatsApp from the owner's phone (already built) or paid SMS/WhatsApp
  (needs the owner's OK on a provider).

## Sources
- Gymdesk automations (welcome and onboarding sequences, expiration follow-ups, push in sequences):
  https://gymdesk.com/features/automations
- Glofox CRM and marketing (automated email, SMS and push for members and win-backs):
  https://www.glofox.com/features/crm-marketing/
- PushPress features and workflows (expiring memberships and birthdays; automated birthday texts):
  https://www.pushpress.com/features , https://pushpress.com/blog/pushpress-grow-revenue-driving-workflows
- Wodify workflow recipes ("Client without recent sign-ins in 14 days", lost-client win-back):
  https://help.wodify.com/hc/en-us/articles/20946146922903
- Mindbody marketing suite (birthday campaign, first-visit welcome, win-back):
  https://www.mindbodyonline.com/sites/default/files/public/education/learning-assets/8_Features_You_Missed_in_2019_0.pdf
- OKFit (India: birthday, anniversary, renewal and payment reminders by push):
  https://okfit.in/gym-retention-software
- PerfectGym help (welcome and contract-expiry messages by SMS, email or push):
  https://help.perfectgym.com/hc/en-001/articles/39315661618705
- GymPilot (India; WhatsApp expiry reminders and welcome): https://www.capterra.in/software/1094875/GymPilot
- Easy Gym Software (India; expiry alerts, renewal reminders): https://easygymsoftware.com/gym-management-app
- Push timing (health and fitness apps opened most in the early morning; frequency caps):
  https://clevertap.com/blog/best-time-to-send-push-notifications/ ,
  https://mobiloud.com/blog/best-time-to-send-push-notifications
- Ascarza, Iyengar and Schleicher (2016), "The perils of proactive churn prevention" (an unasked offer
  raised leaving from 6% to 10%), via docs/overhaul/research/R-offers-notices.md.
