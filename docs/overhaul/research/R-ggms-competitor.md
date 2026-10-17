# GGMS (ggms.in) — the client gym's current software, 17 Oct 2026

**Who:** GGMS by Gayatri Software Services Pvt Ltd, SF 1B, 2nd Floor, JTM Mall, opp. Jagatpura
Railway Station, Jaipur 302017. +91 96949 99998 / +91 95882 62428, info@gayatrisoft.co. Since
2017; claims 1,000+ gyms. Member app "GGMS Member" / "Go GYM4u" (Android + iOS, site says 4.5 stars,
10K+ downloads). Same city as us; they also sell biometric integration.

## Prices (no public price list; ggms.in says "monthly and yearly subscription, no setup or hidden
costs", "not free", pricing by demo / sales call)
| Source | Plan | Price | Includes |
|---|---|---|---|
| Techjockey listing | Offline Plan | from Rs 11,999 / year | everything below, no mobile app |
| Techjockey listing | Online Plan | from Rs 14,999 / year | + mobile app |
| SoftwareSuggest (old, conflicting) | Basic / Premium / Advanced | $22 / $28 / $278 one-time (its FAQ says $28 / $35 / $347) | Basic includes 1,000 SMS |
| TrustRadius | - | $1,999 / month (almost certainly wrong) | - |
Both Techjockey plans say "request for price": the real price depends on features, deployment and
users. **Best guess: Rs 12,000-15,000 a year (about Rs 1,000-1,250 a month) + GST.** Ask the client
what they actually pay. Refund: cancel within a month of purchase, pro-rata; none after.

## Everything they offer (ggms.in, Techjockey, SoftwareSuggest)
Members: profiles, plans (monthly / quarterly / half-yearly / yearly / PT / custom), renewals,
payment history, status, Excel bulk upload, webcam photo. Member login / app: plan validity,
attendance, payments. Attendance: several ways, check-in / out log, QR check-in, biometric
(ZKTeco, eSSL, Realtime, BioMax; fingerprint / face), access control by membership status,
cloud-synced biometric across branches. Money: fees, dues, partial payments, discounts, receipts,
invoices, transactions, expenses, cash-flow reports. Reminders: expiry / renewal / PT / birthday /
anniversary by SMS and in-app, auto SMS / email, campaigns and announcements. Classes: class
booking with capacity, batches and schedules, trainer profiles, assignments and schedules.
Staff: separate logins, role-based access, staff / trainer payroll. Leads: enquiry to member.
Diet and workout plans for members. Inventory. Dashboard and reports with export. Multi-branch.
Cloud and offline (Windows) versions; backups. Not mentioned anywhere: WhatsApp messaging, online
payment / UPI collection.

## Their app (Play Store "GGMS", com.gayatrisoft.ggms; read 17 Oct 2026)
10K+ downloads, 4.2 stars from 169 ratings, updated 2 Oct 2026. ONE app for owners, staff,
trainers and members: the login asks Gym ID + username + password and has an "I'm Member" tick.
The 7 store screenshots are copied locally for the owner (not committed: the repo is public and
they are GGMS's own images); what they show:
1. Splash "Perfect Gym Solution".
2. Owner dashboard tiles: Live / Total / Expired memberships; Expiring in 1-3, 4-7, 8-15 days;
   Today's / 7-day / this month's / this year's collection; Due amount; Total expense. Header
   counters for SMS and WhatsApp, a banner carousel, a "Remote" side tab.
3. "Smart login": the same app for members and admins (Gym ID, Gym name, username, password,
   "I'm Member").
4. Menu: AI Assistant (new), Master, Manage Member, My Classes, Invoice, Attendance, Enquiry,
   Expense; the gym's own subscription "Valid Till".
5. Member list: tabs Live / Expired / Expiring; card with join and end date, plan, final amount,
   paid, due; buttons Profile, Sync (to the machine), Bio Enroll (fingerprint / face sign-up from
   the phone), ID-Card, Edit, Add On, Add pay.
6. "Remote control" of the entry machine from the phone: Open door, Reboot, Sync time, Clear admin,
   device status.
7. "GGMS AI" business assistant: ask in words ("today's peak gym hours") and get answers
   (busiest / least busy slot, hourly check-in trend).

**What a member gets** (store text, ggms.in, the screenshots): log in to the gym's app; see plan
validity, attendance, payments and account details; book classes (capacity limits); check in by
QR; receive expiry / renewal / payment reminders; diet and workout plans from the gym (in their
plans). Nothing about a workout logger, exercise history or progress charts. One review (owner):
"updates are frequent and full of bugs ... I have to enter client measurements through the app",
so body measurements are recorded by the gym. Note: the GGMS FAQ also names a "Go GYM4u" app; the
"GoGym4U" app on Play (com.threeclick.gogym) belongs to another company, so it is not counted here.

## Compared with ForgeAI today
| GGMS feature | ForgeAI |
|---|---|
| Members, plans, sell / renew, dues, receipts, expenses, enquiries, reports + Excel, staff roles, QR check-in, at-risk members | Have |
| Biometric / turnstile entry | Missing (planned P8, research/R-entry-machines.md) |
| Automatic reminders (SMS / email, birthday, expiry) | Partly: ready-typed WhatsApp messages the owner sends by hand; nothing automatic (P4) |
| Class booking with capacity; class / batch timetable | Missing (batches are a name on the member only) |
| Trainer profiles, schedules, trainer login | Partly: PT packs with session counter and trainer name; no trainer screens |
| Staff / trainer payroll | Missing |
| Multi-branch | Missing |
| Member sees plan end date and payments in the app | Missing (member app only says "not active, see the desk" at check-in) |
| Diet / workout plan given by the gym or trainer | Missing (members log their own workouts and food) |
| Webcam member photo | Missing |
| Inventory | Partly: shop products with stock |
| Desktop offline version | Have in a different form: the admin app works in the browser without internet |
| Birthday / anniversary wishes | Missing |
| Owner app on the phone | Have: the admin app installs on a phone (web app) |
| Expiring-soon buckets on the home screen (1-3 / 4-7 / 8-15 days) | Partly: Today shows renewals due; no 3-bucket view |
| AI assistant for the owner ("peak hours today?") | Missing (we show peak hours and at-risk members as reports, no chat) |
| Entry machine from the phone: fingerprint / face sign-up, sync, open door, reboot | Missing (part of P8) |
| Member: book a class from the app | Missing |
| Member: see plan end date, payments and attendance in the app | Missing |
| Member: diet / workout plan from the trainer | Missing |
| Body measurements recorded by the gym | Missing (members log their own in the app) |
| Member ID card | Have (print, picture, WhatsApp) |

What ForgeAI has that GGMS does not advertise: a full workout tracker for members (Hevy-level),
shop with orders, gym messages to members' phones, a watch app, WhatsApp from the gym's own number
at no SMS cost, GST receipts with financial-year numbering, import with undo.

Sources: ggms.in (home, faq.php, refundpolicy.php); techjockey.com/detail/gayatri-gym-management-software;
softwaresuggest.com/ggms-gym-management; trustradius (pricing + compare pages).
