# MettleUp growth plan (R-414)

**Status: DRAFT, 9 Nov 2026. Waiting for the owner's yes.** Nothing is paid, posted or sent until he says so.
Research behind every line: `RESEARCH-2026-11.md`. Skill that applies it: `~/.claude/skills/mettleup-marketing`.

## The goal
Most paid gyms and most members still training on day 30. A lead, view or install is only a step.
Every report ends with: cost per paid gym, cost per active member.

## Step 0 — the brand Gmail move (first, free, no downtime)
Rule: add the new Gmail as a second owner, test, remove the old owner only after 30 days.
1. Him: create the brand Gmail, 2-step sign-in, backup codes offline.
2. Me: contact@mettleup.fit forwarding to the brand Gmail.
3. Me: Cloudflare, add as Super Administrator (he accepts the invite).
4. Me: Namecheap account email (he types the password).
5. Me: Supabase organisation, add as Owner.
6. Him then me: GitHub sign-up; a "mettleup" organisation; move the code after one green build.
7. Me: Firebase/Google Cloud Owner + Play Console admin (simpleapps108 window). The Play app does NOT move.
8. Him then me: new Claude, Gemini and Groq keys on the brand Gmail, swapped on the server BEFORE 17 Nov
   (3 Claude keys expire on 17, 22 and 24 Nov).
9. Me: HQ sign-in allows the brand Gmail.
10. Him: Razorpay or Cashfree on the brand Gmail when payments go live.
11. Me: Meta business renamed "MettleUp", brand Gmail as its business email. WhatsApp number stays where it is.
12. Marketing: a NEW business "MettleUp Marketing" under his ONE real Facebook profile, with a Page,
    Instagram and an ad account. Never a second Facebook profile (Meta bans it, and the ban spreads).
    Keep the WhatsApp number out of the business that holds the new ad account.
WhatsApp tax block: a new business is not proven to clear it, and moving the number can lose it.
Route: free card fixes first; then share the number with an Indian WhatsApp partner that bills
through its own account (costs a fee: his decision).

## Gym software (owners)
Where we stand out: rivals' 50 live Indian ads all sell reminders, fee alerts and "stop the register".
Nobody shows the gym's own branded app on the member's phone. Plus: setup done for him, reply in 5 minutes.
Hooks: (1) we keep members [needs pilot numbers], (2) "how much fee is pending right now?",
(3) "send a register photo, ready the same day", (4) "Cult has an app, now your gym does too",
(5) "trainer leaves, clients stay", (6) "one extra renewal pays for it".
Channels, in order: owner referrals; dealer and trainer-academy partners (no rival has this);
Click-to-WhatsApp ads in Hindi and English; Google Search on "gym software" and rival names;
field visits in one city; visit IHFF Mumbai 18-20 Dec 2026 as a visitor.
Follow-up: auto reply at 0 min, mock-up of HIS gym's app by 10 min, day 1 testimonial, day 3 register
photo, day 7 fee maths, day 14 close. Trial milestones: import day 1, reminder day 3, 10 members on the
app day 7, plan day 10, "Rs collected" day 30.

## Member app (members)
Main road: through the gym. Desk QR, the trainer installs it on visit 1, a plan within 3 days, a day-7
check-in, a gym challenge in week 1-2. Number to watch: first workout logged on the first visit.
Hooks: know what to lift today; never forget last week's weight; your trainer's plan with your gym's
name; muscles ready today; free with every routine and chart; watch yourself get stronger; beat your
gym's leaderboard. The watch is a side point (about 3% of Indian smartwatches can run it).
Also: Play Store listing with captioned Hindi + English screenshots, rating 4.5+, share cards for
Instagram Stories, later a small paid test judged on first workouts, not installs.

## Media, first batch (12 pieces)
Owners: founder-to-camera (Hindi, 20 s); "fees pending" screen recording (12 s); register-to-phone
(15 s); his-logo-in-the-app (10 s, our unique one); "trainer leaves" carousel; "one renewal" static;
owner testimonial (MISSING until a pilot gym); the per-lead mock-up image (made by the lead system).
Members: target-on-every-set demo (10 s); notebook-vs-app meme (15 s); muscle map carousel; desk
poster + QR + trainer video (15 s).
Made with: real app screens, Remotion, Kokoro Hindi voice, OBS, Canva. No invented people or reviews.
Testing: one broad ad set, 8-12 different ideas, about 2x target cost per idea, 3-5 days, weekly
HOLD / FIX / TEST / INVESTIGATE.

## The automated lead system (connected to HQ)
Sources: Meta forms, Click-to-WhatsApp chats, Google lead forms, the website (with ad tags).
One leads table on the gym server; a Cloudflare worker checks and stores each lead.
He gets: an instant alert per lead (HQ phone notification + email), a Leads page in HQ with stages
(new, contacted, demo, trial, paid, lost), a daily and weekly report (leads by ad, cost per lead,
lead to trial to paid, cost per paid gym, verdict per ad). Trial and paid go back to Meta and
Google every day so their ads find more owners like the ones who pay.
Needs: the marketing business + Page + ad account (step 12); Meta lead permissions (try with his admin
role first; App Review only if needed).

## Order
Week 1: Gmail move steps 1-11, new AI keys, first 3-5 pilot gyms measured, Play listing, media batch drafts.
Week 2-3: lead system build + UAT, marketing business and ad account, first media batch finished.
Week 4+: small ad tests, weekly report, kill or scale.

## His decisions
1. Trial: keep 3 months free, or 1 month that grows to 3 when setup steps are done (recommended).
2. WhatsApp block: try free card fixes only, or also a WhatsApp partner company if they fail (recommended).
3. Test budget for the first month (he names the amount).
