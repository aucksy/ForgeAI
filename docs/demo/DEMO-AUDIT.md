# Demo gym audit (R-540, 14 Nov 2026)

The owner asked for a demo gym full enough to show every part of the admin panel at a gym visit, with numbers that
show more money or less work. This is what each screen of **app.mettleup.fit/demo** showed before this change and
what it shows now.

How it works now: the demo opens the usual sample gym (Iron Temple Fitness, 129 made-up members) with a showcase
layer on top (`apps/dashboard/src/crm/demo/showcase.ts`). A pretend gym server inside the page
(`apps/dashboard/src/crm/demo/demoServer.ts`) answers the screens that normally need the internet. Nothing leaves the
page, a reload starts it over, and the orange "Demo gym: made-up data" strip stays on every screen. Every date is
counted back from the day the demo opens, so nothing goes stale. `/demo?as=desk` opens the same gym as the front desk.

Words used: **empty** = nothing on it, or a "This works in your own gym" card instead of the page. **Thin** = the
page opens but has too little on it to show what it does. **Good** = enough to demo.

| Screen | Before | Now | What is on it now |
|---|---|---|---|
| Today | Thin (1 plan ending this week, no birthday, no app requests) | Good | Money in today (2 early renewals, a balance paid in cash, a walk-in who joined), 8 plans ending this week (2 of them today), dues, 1 birthday today, app requests waiting (1 renew, 1 pause), new shop orders, member messages and questions waiting |
| Set up your gym | Good | Good | Plans, members and app link done; staff, logo, timings, poster left to tick |
| Members (all filters) | Thin ("Ending this week" had 1 name) | Good | 129 members: active, ending today / 1-3 / 4-7 / 8-15 days (8 this week), expired, birthdays, visited today |
| Member detail: plans, payments, receipts, visits, notes | Good | Good | As before, plus PT packs with sessions used |
| Member detail: measurements | Empty (needs internet) | Good | 6 members with 4 monthly check-ins each (weight, body fat, waist going down) |
| Member detail: diet plan | Empty | Good | The member's assigned diet plan |
| Member detail: training progress | Empty | Good | 12 weeks of workouts for 9 app members |
| Enquiries | **Empty** (no enquiries at all) | Good | 6 to call today or late, 5 later, 1 with no date, 12 joined (walk-in, Instagram, Google, JustDial, friends), 5 lost with reasons |
| Enquiries: friend referrals | Empty | Good | 2 open, 2 joined, one with the 7 free days already given |
| Enquiries: joined online / web page questions | Empty | Good | 2 "Become a member" sign-ups to collect at the desk, 2 questions from the web page |
| Bring a friend | Empty | Good | Invite links shared, friends asked, friends joined |
| Plans | Good | Good | Monthly, Quarterly, Half-yearly, Annual, Day pass, and Personal training (12 sessions, Rs 6,000) |
| Money: payments, dues, collections | Good | Good | Today's money by UPI and cash; receipts numbered in date order |
| Renewals | Good | Good | Plans ending this week on Today and in Members; 2 already renewed early today |
| Expenses | **Empty** | Good | 8 months: rent, 4 salaries, electricity (higher in summer), shop stock, repairs, a new dumbbell rack |
| Your growth (reports) | Thin (no expenses) | Good | Income against expenses month by month |
| Shop and orders | Empty (card) | Good | 12 products with stock; 2 new orders, 1 ready, 7 collected, 1 cancelled. Marking an order ready works |
| Messages & offers | Empty (card) | Good | 5 sent messages over 5 weeks with how many read each; sending a new one works |
| Workout offer | Empty | Good | "Train 12 days in 30 days, get 3 free days": 14 joined, 3 earned, 1 given |
| Automatic reminders | Empty | Good | Plan ending, plan ended, birthday, welcome, miss you, PT running low switched on |
| Member questions | Empty (hidden) | Good | 2 waiting (back pain, protein for a vegetarian), 2 answered by trainers |
| Member messages | Empty (hidden) | Good | A complaint (AC not working), a question, an anonymous note, 2 answered |
| Training progress | Empty (hidden) | Good | 9 members: getting stronger, steady, dropping (no workout for 9 days), new; one asked for help |
| Diet plans | Empty (needs internet) | Good | 3 plans by the trainers, from the ready-made Indian plans, given to members |
| Workout plans | Empty (card) | Good | Push Pull Legs, First month full body, Ladies batch, and one taken back |
| Trainers and PT bookings | Empty (card) | Good | Arjun and Kavita with what they teach and their hours; PT bookings across this week |
| Challenges | Empty (card) | Good | "20 workouts this month" running, last month's ended with 7 winners, leaderboard |
| Staff & sign-in | Empty (card) | Good | Owner, front desk, 2 trainers, a manager ("Other job") |
| Gym timings | Empty (card) | Good | Mon-Sat 5-11 am and 4-10 pm, Sunday 6-11 am, ladies batch note |
| Members in the app | Empty (card) | Good | 42 members on the MettleUp app, with shop orders and spend |
| AI Assistant | Hidden | Hidden | Kept out of the demo on purpose: every answer spends real AI credits |
| All branches | Empty (card) | Empty (card) | Needs two real gyms; the card says what it does |
| Branding, entry machines, busy machines, invite link, importing, Pay MettleUp, Settings | Empty (card) | Empty (card) | These change the real gym or need real devices; each card says what it does |

What was not added: no "time saved" number (no screen works one out), no claims on any real gym's screens. The money
story is the gym's own numbers on its own screens: renewals and balances collected today, enquiries turned into
members, friends who joined, and income against expenses on Your growth.

Checked by: `apps/dashboard/test/crm/demoShowcase.test.ts` (every server answer read through the screens' own code;
the three training stories come out as "Getting stronger", "Steady" and "Dropping") and
`apps/dashboard/e2e/demo-showcase-uat.spec.mjs` (pictures of every screen on a phone and a computer, owner and desk,
no errors, nothing sent to the server).
