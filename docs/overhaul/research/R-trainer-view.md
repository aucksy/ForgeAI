# Trainer view of member progress: research, 22 Oct 2026

Owner's idea (R-59, widens R-25): gym trainers should see whether members are progressing, so they can
encourage them, and the gym can sell personal training (PT) using the data. "Research and decide the
best implementation."

## The answer in short
- **Build it, but as a conversation tool for the gym floor, not a sales tool.** The trainer's main
  screen is "who to talk to today, and what to say". It is not a table of numbers.
- **The member picks one named trainer and taps "Share".** It is off by default. The trainer then
  accepts in person. Either side can end it, and the shared copy is deleted at once.
- **Only a small weekly summary leaves the phone.** It covers workouts per week, total kg lifted per
  week, the best set on the member's 5 most-done exercises, and new records. Body weight, photos,
  measurements, notes, food and health never leave the phone. The full log stays on the phone too.
- **The PT money comes from the member asking, not from the gym chasing.** First version: an "Ask
  my trainer for help" button. Later, and only with a second, separate tick: an owner list of
  members who might want a trainer.
- **The draft plan was mostly right. Five things change** (section 8). The biggest: there is no
  trainer login today, and adding one the obvious way would hand trainers owner powers.

## 1. What we have today (from the code)
- **Who signs in to the admin app.** People sign in with a mobile number and a code. There are only
  two roles: **owner** and **staff** (the front desk). A trainer signs in as staff. Staff can already
  make and send workout plans. The draft said "the trainer role exists". It does not in the current
  sign-in. It exists only in an older, switched-off email login.
- **A trap.** The server's main save function treats any role that is not exactly "staff" as the
  owner, and so does the admin app. So adding a new role called "trainer" would give every trainer owner powers: money
  totals, voiding receipts, prices. The safe way is a **"Trainer" tick on a person**, whose role
  stays staff, or owner, since in many small gyms the owner is the trainer.
- **How plans reach members.** A trainer's plan shows in the member's app as "From <gym> · <trainer>".
  The member's app proves who it is by the mobile number matched at a check-in, plus a first-name
  match. That number is **not verified**. Anyone can type someone else's number at their first
  check-in. So a share must be confirmed by a human: the trainer accepts the member in person.
- **Check-ins already reach the server**, and the admin app already has an **"Away" list**. It judges
  each member against their own usual rhythm. It deliberately never mentions money or renewal when
  staff call someone. So "stopped coming" needs no workout data and no new consent. Reuse it.
- **PT packs already exist.** A plan can carry a number of PT sessions and a trainer's name, and the
  desk marks each session used. The trainer's name is typed text. It is not linked to the trainer's
  sign-in, so "PT sold per trainer" needs that link later.
- **Every staff device downloads the whole gym's records.** The code itself says a determined staff
  member could read anything in them. So shared workout data **must not go into the gym's records**.
  It needs its own table, which a person can only read through a server function that checks who
  they are.
- **The privacy promise.** The notice says workouts stay on the phone, that "your gym does not see
  them", and that nothing about the body leaves the phone "unless you turn on a feature that clearly
  asks you first". So the door is open for an opt-in. But two more lines must change: "we do not
  ... use your data to profile you", and the table of what the server keeps.
- **Old code to retire.** The member app still contains a switched-off "connect to your gym" card
  from July 2026. It would send body weight, calories, protein and streaks to a table that trainers
  could read. It must never be switched back on. The new feature should replace it, and the old
  card and table can then be deleted.

## 2. How other products do it

| Product | What the trainer sees | How the member agrees, and leaves |
|---|---|---|
| Hevy Coach | Every saved workout, sets per muscle, volume and duration graphs, who was active this week, an activity feed, alerts per client that can be turned off | Coach invites by link, email or username. Client must accept. Client removes the coach in two taps and keeps all history. **All or nothing**: measurements and photos are shared too, with no way to hide them |
| TrueCoach | Completion of assigned workouts over 7, 30 and 90 days. A "Needs attention" list (completion down 20%, missed workouts). "Due soon" when a programme ends. Message straight from the flag | Not documented |
| Trainerize | Completion counts **only trainer-assigned** workouts. Fixed "not signed in for 4 weeks" tag | Body weight is required at sign-up. No setting to hide stats from the trainer |
| Everfit | Groups clients: On track, Needs attention, At risk (under 60% consistency), No activity in 14 days, Programme ending. Coach sets the limits. One tap sends a message to everyone who missed | Public invite link. No consent step described |
| PT Distinction | Missed workouts on the home feed. Fewer widgets, to cut clutter | Coach controls what the **client** sees (the reverse of what we want) |
| EGYM (gym equipment + app) | Training frequency, analyses, notes, and a task list for the trainer | **Consent form**: trainers can view training data, it is displayed not copied, withdraw any time from your profile |
| BTWB (gym-linked tracker) | Gym coaches see results | Member chooses everyone, only my gym, or only me |
| Glofox, Mindbody, GymMaster | Trainer role sees only assigned classes and members by default. Glofox has a separate owner "members at risk" report | Not applicable (no workout data) |
| Technogym Mywellness | "Drop-out risk" score per client | Pro app rated 1.8 stars |
| Indian software (Fitness Force, Wellyx, FITPASS, Cult) | **No trainer view of member progress found.** FITPASS uses an AI coach instead of a human trainer view | Not applicable |

**What this tells us.** No Indian gym software does this. The coaching apps are sold to individual
trainers, not gyms. And none of them lets the member share workouts while keeping body weight and
photos private. That combination is open for us.

## 3. What people complain about
- **Members don't know who sees their data.** A Trainerize member asked whether any employee could see
  their body weight. Others called forcing body weight entry rude.
- **Record alerts without the number.** Coaches asked for this 28 times: told "client hit a best" but
  not what the best was.
- **Missing alerts, not too many.** Coaches asked to be told about yesterday's missed workout. The
  4-week inactivity tag fires far too late. I found no coach complaining of too many alerts.
- **Counting only what the trainer assigned.** Our members mostly train on their own, so measure them
  against their own usual, not against a plan.
- **Shame and nagging.** A UCL and Loughborough study of about 60,000 posts about the top five fitness
  apps found blame, shame and irritation at notifications.
- **Pushy PT selling in India.** A Talwalkars member complained staff pressed him hard to extend PT.
- **Weak phone apps for coaches.** Indian floor trainers live on their phones, so the trainer screen
  must work well on a phone.
- **Blocked:** Reddit (search and pages), Capterra, Hevy's app help centre, Glofox support, Mindbody,
  My PT Hub, Gymdesk, PubMed. Nothing from Reddit is in this note.

## 4. Will members share? Does it pay?
**Will members share? No direct survey exists.** I found nothing that asks gym members about a
trainer specifically. The closest evidence:
- Trust depends on **who** asks. In the US, 64% would share health data with a doctor, but only 7%
  with a tech company (Rock Health, 2023). A named trainer they see every week sits nearer the doctor
  end, provided the gym and app stay in the background.
- 34% of wearable users shared data with a trainer, doctor or similar professional (Harris Poll, 2014;
  old, and trainers are not counted separately).
- People worry most about how they look to others, and they pick and choose what to share (small
  studies, 2019–2020). That is why body weight and photos are out.
- India: 56% feel vulnerable about companies holding health data from their devices (Capgemini, 2024).
- **Expect a minority to share.** Say 20–40% of app members. That is my guess, not evidence. Measure
  it at the first gym.

**Does staff contact keep members?** Yes, strongly linked, but this comes from UK gyms in 2013–2016
and shows a link, not proof of cause.
- Over 90% of members regularly spoken to by staff stayed, against 80% of those never spoken to.
  Only 37% were spoken to by fitness staff on their last visit (10,062 members).
- Members reporting low progress who were always spoken to cancelled about half as often. Each goal
  showing progress cut next month's cancellation risk by about 10%.
- Coaxing an inactive member back went with 45% fewer cancellations.

**Does PT pay?**
- **Revenue.** In India, PT was about 14% of the gym market in 2024 (about ₹2,450 crore of ₹16,200
  crore). It is projected to reach about 20% by 2030, so it is growing faster than memberships
  (Deloitte and the Health & Fitness Association, 2025).
- **Members who buy.** 10–15% of members at mid-range Indian clubs hire a trainer (2019).
- **Prices.** Chain gyms charge ₹12,000–30,000 a month or ₹1,500–3,000 a session (a promotional
  blog, unverified). Jaipur prices are unknown; ask at the first gym.
- **Who stays.** **Regular** PT went with 30% lower cancellation. **Occasional** PT went with *more*
  cancellations. So a free one-off session that leads nowhere may hurt. The free step should lead to
  something regular.

**Two warnings from the evidence.**
- **Chasing at-risk people can backfire.** In a field experiment, customers proactively sent a
  money-saving offer churned more: 10% against 6% who were left alone (Ascarza and others, 2016,
  telecom). So never send a sales pitch to a struggling member. Talk about their training. Our
  "Away" list already follows this rule.
- **Tracking can hurt.** It can cut enjoyment (Etkin, 2016). Leaderboards and fixed targets made
  teenagers feel guilty (Fitbit study, 2017). Certified trainers showed strong hidden bias against
  heavier people (2018). That is one more reason trainers never see body weight.

**Progress feedback helps.** Monitoring progress improves goal success, and more so when progress is
reported to someone else (Harkin, 138 trials, 2016). Do not cite the 2019 "trackers only work with
coaching" paper: it was retracted.

## 5. The law, in practice (not legal advice)
**Which law applies when.**
- **Today (Oct 2026) the old IT Act rules (SPDI 2011) still apply.** They treat a "physical condition"
  as sensitive. Weights and reps alone are probably not, but treat this as sensitive anyway.
- **The DPDP Act's duties on consent, notice, rights and security start on 13 May 2027.** In January
  MeitY proposed moving that to Nov 2026. No change had been published by Oct 2026. Re-check before
  launch.
- **Build to the DPDP standard now.** It is stricter and costs us nothing extra.

**What the member must get.**
1. **A real choice.** Off by default, no pre-ticked box, and membership never depends on it. A tap
   on "Share with Rohit" counts as the clear action the law asks for.
2. **One tick per purpose.** "Help me train" (trainer follows progress) and "tell me about PT"
   (marketing) are different purposes. They need separate ticks, and the second is off by default.
3. **A plain notice on the same screen.** It must list exactly what is shared, why, who sees it, how
   to stop, and how to complain (the Grievance Officer, then the Data Protection Board). It must be
   in English or Hindi; we already have a Hindi privacy notice.
4. **Stopping as easy as starting.** The same switch. Then the server copy is deleted. Stopping also
   happens on "Leave gym".
5. **The right to a summary of what is held and who saw it.** Keep a log of each trainer view.
6. **A one-year log.** Keep when sharing started and stopped, and who viewed, for one year (DPDP Rule
   6 and Rule 8(3)). Keep the log, not the workout data.
7. **Security.** Access only through checked server functions, logs of views, and a breach notice to
   members and to the Board (72-hour report). The existing breach plan covers this.
8. **Under 18.** The app is already 18+ only. Keep it that way for this feature. The law bans
   "behavioural monitoring" of children even with a parent's consent.
- **Not needed for a small gym:** a consent manager, or the "erase after 3 years of no use" rule
  (that applies only to very large platforms).
- **Penalties** go up to ₹250 crore. The Board must weigh the size of the business. There is no
  small-business exemption.

## 6. What a trainer should see in 10 seconds (and what never)
**The list (on the phone, in the admin app).** One row per member. Each row has the name, **one line
in plain words**, and 8 small dots showing workouts each week. It is sorted so the people worth a
word come first:
1. **In the gym right now** (checked in today), with their line.
2. **Asked for help.** For example: "Asked for help: form check".
3. **Worth a well done.** For example: "New best: Leg press 120 kg × 10 (Tue)".
4. **Back after a break.** For example: "Back after 12 days". Positive, never "you were missing".
5. **Same best for a while.** For example: "Bench press: same best for 6 weeks".
6. **Everyone else.** For example: "3 workouts this week, as usual".

**Tap a member** to see:
- workouts per week for 12 weeks;
- total kg lifted per week;
- the 5 most-done exercises, each with its best set now, 4 weeks ago and the change;
- records this month;
- three buttons: **"Well done" on WhatsApp**, **"How's it going?" on WhatsApp**, **"Send a plan"**
  (this one exists already).

The WhatsApp words come pre-filled. The trainer edits them and sends from his own phone. Nothing is
sent automatically.

**How "stuck" is judged.** One exercise only, done at least 4 times in 6 weeks, with no better set in
6 weeks. Never in a member's first 8 weeks, when beginners improve fast anyway. At most one flag per
member.

**Never shown to the trainer.**
- Body weight, photos, measurements, notes, food, sleep, or the time of day they train.
- Any ranking of members against each other, or a leaderboard.
- Red colours, "falling behind", "down 30%", or a "risk score".
- Money and dues (the front desk already handles those).

**Words.**
- **Member app:** "workouts", "best set", "records", "total kg lifted". Never "volume", "PR" or
  "session".
- **Admin app:** the same words, so the trainer can say them out loud to the member.

## 7. How it makes the owner money without feeling pushy
1. **Keeping members is the bigger money.** Members a trainer speaks to stay longer (section 4). The
   owner sees, for each trainer: members sharing, "well done" messages sent this month, and how many
   of those members renewed.
2. **"Ask my trainer for help" (member pull).** One button in the member app, with reasons to tap:
   form check, new plan, stuck on an exercise, something else. It lands at the top of the trainer's
   list. This is the cleanest PT lead there is: the member asked. The trainer offers a free
   10-minute form check. A PT pack comes up only if the member wants more.
3. **Later (version 2), with the second tick only:** "Tell me about personal training when it could
   help me". The owner then gets a **"Might want a trainer"** list. A member appears only when they
   (a) ticked it and (b) are at a good moment: same best for 6 weeks, finished their first 3 months,
   or a run of records. Never someone who is "Away" or behind on fees. Never more than one offer a
   month per member.
4. **A monthly report for PT clients (version 2).** One picture the trainer sends on WhatsApp: "Your
   month with Rohit: 14 workouts, leg press 100 → 120 kg, 3 records". It helps PT clients renew,
   which matters because only **regular** PT is linked to members staying. Keep it free. The money
   is in the PT packs, not in a report fee.
5. **Rough sum (assumption, not evidence).** A 300-member gym where 120 use the app and 30 share.
   Two extra PT packs a month at ₹3,000 to ₹6,000 each is ₹6,000 to ₹12,000 a month to the gym,
   before the trainer's cut (30–50% in India). One extra pack covers a ₹2,999 Growth plan.

## 8. The draft plan: kept, changed, dropped
- **Kept:** opt-in and off by default. Never body weight or photos. A trend per member. A stuck-lift
  flag. One-tap WhatsApp. A PT list for the owner. A monthly report for PT clients.
- **Changed: share with one named trainer, who accepts in person.** Not "the gym's trainers". This is
  what makes members agree, and the accept step covers the unverified phone number.
- **Changed: a weekly summary, not per-workout rows or exact dates.** Less data. It still answers "is
  he progressing?".
- **Changed: "best set on the 5 exercises *this member* does most"**, not a fixed list of main lifts.
  Indian gyms are machine-heavy: leg press and lat pulldown matter as much as squat.
- **Changed: "down" and "stopped coming" are not trend labels.** "Stopped coming" already comes from
  check-ins (the "Away" list). "Down" becomes the neutral "fewer workouts than usual".
- **Changed: the PT list needs the member's own second tick, and moves to version 2.** Version 1
  gets the member's "Ask for help" button instead. Reason: the 10% versus 6% backfire, the separate
  legal purpose, and India's pushy-PT complaints.
- **Fixed: a "Trainer" tick on a person, not a new role** (the owner-powers trap in section 1).

## 9. Recommended design
**The member (ForgeAI app, Settings → Your gym, plus one prompt):**
- The prompt appears once, when a plan arrives from a trainer: "Want Rohit to see how this plan
  goes?" Tapping "Not now" is remembered.
- Screen "Share your progress with a trainer":
  - Pick the trainer: the gym's people who have the Trainer tick.
  - **They will see:** how many days you worked out each week, total kg you lifted each week, your
    best set on your 5 most-done exercises, and new records.
  - **They will never see:** body weight, photos, measurements, notes, food or health details. Your
    full workout history stays on your phone.
  - **Who:** "Rohit and the gym's owner" (the owner decides this; see section 12).
  - Button **"Share with Rohit"**. Also "Not now".
  - Line: "Stop any time here. Their copy is deleted straight away."
- After that, the card says "Waiting for Rohit to accept", then "Shared with Rohit since 3 Nov ·
  Stop sharing · Change trainer".
- An "Ask Rohit for help" button sits on the same card.
- The summary is worked out on the phone and sent after each workout when online. It is never sent
  while the app is showing demo data.

**The trainer (admin app, signed in as a person with the Trainer tick):**
- "My members" with the list from section 6, requests to accept ("Rahul Sharma wants to share his
  progress. Usually trains around 7 am." with Accept or Not now), the member detail and the
  WhatsApp buttons.
- He sees only the members who picked him. Front desk staff without the tick see nothing new.

**The owner:**
- Everything every trainer sees, across all trainers.
- On each member's page: "Shares progress with Rohit".
- A small "Trainers" summary: members sharing, well-done messages this month, help requests,
  answered or not.
- Version 2: the "Might want a trainer" list (second tick only) and the monthly PT report.

## 10. Smallest first version
1. A **Trainer tick** on a person (owner only).
2. **Member app:** the share screen (one trainer, one button), the status card, Stop sharing, Change
   trainer, and "Ask for help". Stop sharing also runs on Leave gym.
3. **Phone summary:** workouts per week (12 weeks), total kg per week, best set on the top 5
   exercises now and 4 weeks ago, records in the last 30 days, and the last workout date.
4. **Admin app:** "My members" (accept requests, the sorted list with one line each, the detail
   screen, the two WhatsApp buttons). The owner sees all of it.
5. **Privacy notice and consent words**, in English and Hindi.
6. **Test at the first gym for 4 weeks.** Measure the share of app members who turn it on, how often
   trainers open it, the WhatsApp taps, help requests, and PT packs sold to sharing members.

**Not in version 1:** the second tick and the owner's PT list, the monthly PT report, alerts to
trainers, and linking PT packs to the trainer's sign-in.

## 11. What changes on the server
**New tables.** None can be read directly. Every read and write goes through a server function that
checks who is asking, the same pattern as staff sign-in.

| Table | What it holds | Kept for |
|---|---|---|
| `progress_shares` | One row per member who shares: the member, the trainer chosen, waiting or accepted, whether PT offers are allowed (version 2, off by default), and the notice version they agreed to | Until they stop, leave, or the trainer leaves |
| `progress_summaries` | One row per member: the weekly numbers and top-5 best sets as a small checked bundle (size-capped, like workout plans) | Deleted at once when sharing stops. Weeks older than 12 are dropped on every update. Deleted if nothing arrives for 90 days |
| `progress_log` | Shared on and off, trainer accepted, and each time a trainer or owner opened the list (who, when, which members) | 1 year, then purged (the DPDP log rule) |
| `gym_staff` gets an `is_trainer` tick | Who can be picked as a trainer | As the person |

**Who can do what.**
- **The member's app** (its member key, with the same identity checks as "My membership", the
  number matched at check-in and the first name):
  - turn sharing on and pick a trainer;
  - send its summary, accepted only while sharing is on;
  - stop sharing, which deletes the summary;
  - ask for help;
  - read its own status.
- **A trainer**, signed in with the Trainer tick, can read **only** the members who picked him and
  were accepted, and accept or decline requests.
- **The owner** can read all members who share in his gym, and turn the Trainer tick on or off.
- **The front desk** (staff without the tick): no access.

**Never** in the gym's records, which every staff device downloads.

**Removing a trainer from the gym** ends his shares and deletes their summaries. Each of those members
sees "Pick another trainer to keep sharing".

**Afterwards:** retire the switched-off July 2026 member table and app card that carry body weight
and calories. This is Claude's call, not a decision for the owner.

## 12. Decisions only the owner can make
1. **The consent words in the member app**, in English and Hindi. Suggested words are in section 9.
   In particular: does the owner see shared progress too, or only the chosen trainer? Recommended:
   both, named on the screen.
2. **The privacy notice changes.** Four places:
   - the "Your workouts" bullet: add "unless you turn on Share with a trainer";
   - a new row in the "What we keep on our server" table;
   - "we do not ... profile you": add "except the progress summary you choose to share";
   - "Who is responsible": the gym is responsible for progress shared with its trainers.
3. **The live server change:** the new tables, the Trainer tick and the new functions. They are
   applied to the live database only with his yes.
4. **Whether version 2 adds the PT-offer tick and the owner's "Might want a trainer" list.** And the
   limit of at most one offer a month per member.
5. **Price.** Is the trainer view part of the ₹2,999 Growth plan, which already lists "staff roles ·
   multi-trainer", or a separate add-on? Is the monthly PT report free (recommended) or charged?
6. **At the first gym:** will its trainers use a phone browser for this, and what does a PT pack cost
   there? These questions are already on the fieldwork list.

## Sources
**Products**
- Hevy Coach, invite clients: https://help.hevycoach.com/en/articles/8460760-invite-clients
- Hevy Coach, the app for clients: https://help.hevycoach.com/en/articles/8460770-hevy-app-for-clients
- Hevy, strength coach features: https://www.hevyapp.com/features/strength-coach/
- Hevy, trainer platform: https://www.hevyapp.com/features/trainer-platform/
- Hevy Coach, removing a coach: https://help.hevycoach.com/en/articles/8537243-delete-access-to-your-clients
- Hevy Coach, dashboard: https://help.hevycoach.com/en/articles/8460727-dashboard
- Hevy Coach, notifications: https://help.hevycoach.com/en/articles/9088295-receive-notifications
- Hevy Coach on the App Store: https://apps.apple.com/app/id6502961756
- TrueCoach, compliance: https://truecoach.co/features/compliance/
- TrueCoach, dashboard: https://truecoach.co/features/dashboard/
- Trainerize, counting client-scheduled workouts: https://ideas.abcfitness.com/forums/167887-coach-trainer-abc-trainerize/suggestions/36782527-please-allow-us-to-count-client-scheduled-workouts
- Trainerize, custom auto tags: https://ideas.abcfitness.com/forums/167887-coach-trainer-abc-trainerize/suggestions/40122802-the-ability-to-customize-auto-client-tags
- Trainerize, personal best alerts: https://ideas.abcfitness.com/forums/167887-coach-trainer-abc-trainerize/suggestions/46580929--client-achieved-personal-best-great-but-what
- Trainerize, missed-workout alerts: https://ideas.abcfitness.com/forums/167887-coach-trainer-abc-trainerize/suggestions/48126740-get-notified-when-a-client-misses-a-workout
- ABC Ignite, the body weight complaint: https://ideas.abcfitness.com/forums/940792-member-abc-ignite-engagement/suggestions/48134084-remove-requirement-for-users-to-enter-their-body-w
- Trainerize reviews: https://justuseapp.com/en/app/516851502/fitness-app-by-trainerize/reviews
- Everfit, check-in dashboard: https://help.everfit.io/en/articles/15999847-configure-your-check-in-dashboard
- Everfit, workout analytics: https://help.everfit.io/en/articles/8579405-workout-analytics
- Everfit, public invite link: https://help.everfit.io/en/articles/5369004-public-client-invite-link
- Everfit reviews on G2: https://www.g2.com/products/everfit/reviews
- PT Distinction, missed client activity: https://www-webflow.ptdistinction.com/blog/instantly-see-missed-client-activity
- PT Distinction, client dashboard setup: https://www-webflow.ptdistinction.com/learning-centre/ptd-flow/view-client-dashboard-setup
- My PT Hub, automated check-ins (search snippet only): https://www.mypthub.net/features/automated-client-check-ins/
- Glofox, churn prediction: https://www.glofox.com/blog/ai-churn-prediction/
- EGYM, trainer app: https://us.egym.com/en-us/digital/trainer
- EGYM, consent form: https://uk.egym.com/en-gb/node/7126
- Technogym Mywellness for Professionals: https://apps.apple.com/app/id1339114132
- GymMaster, staff permissions: https://www.gymmaster.com/user-manual/manual_staffmembers_add_staff_details_permissions
- Virtuagym, 2020 product review: https://business.virtuagym.com/blog/virtuagym-product-rewind-looking-back-at-the-best-of-2020/
- Zenoti, AI workout builder: https://www.zenoti.com/ai-workforce/ai-workout-builder
- BTWB, privacy settings: https://support.btwb.com/en/support/solutions/articles/35000172829-how-can-i-keep-my-information-private-
- FITPASS, the ARIA coach: https://fitpass.co.in/blog/personalized-fitness-for-workaholic-fitster
- Fitness app shame study (UCL and Loughborough): https://www.breakingnews.ie/world/your-fitness-app-could-be-making-you-feel-ashamed-1822405.html
- Talwalkars PT complaint: https://www.consumercomplaints.in/talwalkar-gym-yogi-nagar-cheating-by-making-false-promises-and-shutting-down-the-branch-c896647

**Sharing, retention and PT**
- Rock Health 2023 survey: https://www.healthcaredive.com/news/consumer-health-data-sharing-survey-rock-health/710774/
- Alqhatani, SOUPS 2019: https://www.usenix.org/conference/soups2019/presentation/alqhatani
- Vitak and others, Fitbit privacy, 2018: https://pearl.umd.edu/wp-content/uploads/2017/08/Vitak_etal-2018-iconf-fitbit-privacy.pdf
- Capgemini India, 2024: https://morungexpress.com/more-than-6-in-10-indians-worried-about-data-being-shared-with-3rd-parties
- What 10,000 members say: https://www.healthclubmanagement.co.uk/health-club-management-features/What-do-10000-members-say/29553
- Interaction, progress and retention: https://www.healthclubmanagement.co.uk/health-club-management-features/Interaction-progress-retention/29486
- IHRSA/TRP retention report, 2016: https://www.leisureopportunities.co.uk/news/Fitness-retention-IHRSA/325741
- One Million Strong: https://www.healthclubmanagement.co.uk/health-club-management-features/One-million-strong/30115
- The personal touch (PT and retention): https://www.healthclubmanagement.co.uk/health-club-management-features/The-personal-touch/29765
- IHRSA, PT use: https://www.healthandfitness.org/?p=556
- India emerges, 2019: https://www.healthclubmanagement.co.uk/health-club-management-features/Research-India-emerges/33560
- Deloitte and HFA, India Fitness Market 2025: https://www.healthandfitness.org/wp-content/uploads/India-Fitness-Market-2025_FINAL_Print.pdf
- magicpin, trainer fees (promotional): https://magicpin.com/blog/personal-trainer-fees-savings/
- Ascarza, Iyengar and Schleicher, "Perils of proactive churn prevention", 2016: https://drupalgsb-test.paas.cc.columbia.edu/sites/default/files-efs/pubfiles/12782/Perils_Ascarza.pdf
- Ascarza, "Retention futility", 2018: https://www.ama.org/2019/04/24/escarzas-retention-futility-targeting-high-risk-customers-might-be-ineffective-wins-2018-award/
- Harkin and others, 2016: https://eprints.whiterose.ac.uk/91437/
- Hodkinson 2019 (retracted): https://pmc.ncbi.nlm.nih.gov/articles/PMC6802237
- Ellingson 2019: https://pmc.ncbi.nlm.nih.gov/articles/PMC6393778
- Fitbit teen study: https://techcrunch.com/2017/08/02/fitbit-turns-teens-off-exercising-study-finds/
- Trainers' weight bias: https://pmc.ncbi.nlm.nih.gov/articles/PMC5955305

**Law**
- PIB backgrounder, Nov 2025: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf
- DPDP Act 2023 (Gazette copy on PRS): https://prsindia.org/files/bills_acts/acts_parliament/2023/Digital_Personal_Data_Protection_Act,_2023.pdf
- DPDP Rule 3 (secondary copy): https://dpdpa.com/dpdparules/rule3.html
- Third Schedule: https://dpdpa.com/schedule/schedule3.html
- AZB, phased rollout: https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/
- Mondaq, 2026 milestones: https://www.mondaq.com/dpdp-act-and-rules-2025-the-2026-compliance-milestones-businesses-cant-afford-to-miss/1830402
- Privacy Labs, 13 Nov 2026: https://theprivacylabs.com/blogs/dpdp-13-november-2026-what-starts
- DPDP timeline: https://dpdprules.org/timeline
- The proposal to shorten the timeline: https://ssrana.in/articles/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs/
- NALSAR, retention under DPDP: https://techlawforum.nalsar.ac.in/privacy-with-a-footnote-data-retention-under-the-dpdp-framework/
- SPDI Rules 2011 (CIS copy): https://cis-india.org/internet-governance/files/it-reasonable-security-practices-and-procedures-and-sensitive-personal-data-or-information-rules-2011.pdf/at_download/file
- KSK, SPDI after DPDP: https://ksandk.com/data-protection-and-data-privacy/what-happens-spdi-rules-after-dpdp-enforcement/
- KSK, DPDP for startups and small businesses: https://ksandk.com/data-protection-and-data-privacy/dpdp-compliance-for-startups-msmes/

**Blocked while researching:** Reddit, Capterra, Hevy app help centre, Glofox support, Mindbody blog,
My PT Hub, Gymdesk, PubMed (captcha), meity.gov.in, egazette.gov.in. The Rules text came from
secondary copies, not the Gazette.
