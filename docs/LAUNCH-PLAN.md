# ForgeAI production beta at the client gym — launch plan

Owner request R-32 (19 Oct 2026). Research: 5 helpers on 19 Oct (our code; servers and app stores;
India law and money; how gym-software pilots run). Sources are listed at the end.

**Who does what.** **You** = the owner (Aakash). **Gym** = the client gym's owner / desk.
**Claude** = me. Every "You" item is also a task or a decision in the owner inbox
(`docs/OWNER-INBOX.md`, "Waiting for you"), so nothing lives only in this file.

**Status keys:** TODO · DOING · DONE · LATER (after the beta starts).

---

## 1. The verdict in one paragraph

The product is ready to be tried; the **business around it is not**. The apps passed every
automatic test (v0.48.0). What is missing for real people and real money: a paid server that
does not pause and has backups; a way for us to learn about crashes and outages before the gym
does; a privacy notice, terms and a data agreement with the gym; the gym visit (we have never
asked the gym its questions); moving the gym's real data out of GGMS; and training. None of it is
large. With your tasks done in the first week, the gym can start a **side-by-side run in about
3 weeks** and **switch over in about 5 weeks**. The trial lasts 8 weeks in total.

## 2. The 8-week pilot at a glance

| Week | What happens | Gate to pass |
|---|---|---|
| 0 (now) | Accounts, paid server, monitoring, legal drafts, gym visit, GGMS export | Gym visit done; export received; agreement signed |
| 1 | Trial import of the gym's data; fix duplicates, dates, plans; totals match | Totals match GGMS |
| 2 | Second trial import; train each shift; desk cheat sheet; WhatsApp support group; practise going back to GGMS | Staff can do the 8 desk jobs alone |
| 3-4 | **Side-by-side run**: every renewal and payment goes into BOTH systems; daily cash match. Members get the app (poster + WhatsApp). Freeze changes 3 days before switch-over | 10 days with no mismatch |
| 5 | **Switch-over** (a Tuesday or Wednesday mid-month): ForgeAI is the record; GGMS read-only. You or I on call at both rush hours on days 1-2 | No lost payment |
| 6 | **Go / no-go review** against the measures in §4 | Signed yes, or go back to GGMS |
| 7-8 | First full renewal month on ForgeAI; case study; switch to paid | Month closes clean |

GGMS stays paid and usable **until week 8**. Rule for the gym owner: do not cancel GGMS early.

## 3. Workstreams

### A. Servers that stay up, and backups (Claude + You)

| # | Item | Who | Status |
|---|---|---|---|
| A1 | Move the live database to **Supabase Pro** (about $25 a month). The free plan pauses after 7 quiet days and has no downloadable backups. Pro: no pausing, daily backups kept 7 days, spend cap on | You pay (inbox decision) | TODO |
| A2 | A second, free **staging** project; every database change goes to staging first, then live | Claude (you create the project: Supabase allows the owner only) | TODO |
| A3 | **Restore drill**: restore a daily backup into staging and check the gym's totals; repeat once mid-pilot | Claude | TODO |
| A4 | Two-step sign-in on the Supabase, GitHub, Cloudflare and Google accounts (one person losing a password must not lose the business) | You | TODO |
| A5 | Supabase security check: the built-in Security Advisor, SSL enforced, rate limits reviewed | Claude | TODO |
| A6 | Admin app: add a content security policy header; write down how to roll back a deploy (Cloudflare keeps old versions) | Claude | TODO |
| A7 | Release signing key: confirm the 2 offline copies still open (losing it means every member reinstalls and loses data) | You (5 min) | TODO |
| A8 | Point-in-time restore ($100 a month) | LATER: when the data passes about 4 GB or a second gym joins | LATER |

### B. Knowing about problems before the gym does (Claude + You)

| # | Item | Who | Status |
|---|---|---|---|
| B1 | **Crash reporting** in the member app and the admin app (Sentry, free plan: 5,000 errors a month) | You make the free account; Claude wires it | TODO |
| B2 | **Uptime check** every minute on the admin app and the database, alert to your phone and email (Better Stack, free plan) | You make the free account; Claude sets the checks | TODO |
| B3 | Google Play's own crash numbers (once on Play) | Claude reads weekly | LATER |
| B4 | A daily "is everything fine" summary in the admin app for us (last check-ins, payments, errors) | Claude | TODO |
| B5 | Firebase Test Lab on real phones after each release (built; waits for inbox task #25). It closes 30 Sep 2027; move to its successor before then | You (#25), then Claude | TODO |

### C. Getting the app onto members' phones (Claude + You)

| # | Item | Who | Status |
|---|---|---|---|
| C1 | **Google Play Console account** ($25 once). A new personal account must run a closed test with **12 testers for 14 days** before it can go public: the gym's own members can be the testers | You (inbox decision + task) | TODO |
| C2 | Play **internal testing** track for the first weeks (up to 100 people, updates in minutes, no review wait) | Claude after C1 | TODO |
| C3 | Store listing, screenshots, data safety form, privacy policy link | Claude drafts; you submit (your account) | TODO |
| C4 | App targets **Android 16 (API 36)** (Play rule since 31 Aug 2026): confirm from the built app and fix if not | Claude | TODO |
| C5 | Remove unused permissions and old wording (microphone, speech, camera text still say "AI coach" though the coach is off) | Claude | TODO |
| C6 | "A new version is ready" prompt inside the app (today members never hear of an update) | Claude | TODO |
| C7 | The GitHub APK link stays as a backup. Google will start blocking unregistered APK installs worldwide in 2027 (India's date not announced); being on Play with Play App Signing registers us for free | Claude watches | LATER |

### D. Privacy, law and paperwork (Claude drafts, You decide and sign)

India's data law (DPDP Act 2023 + Rules of Nov 2025) applies fully from about **13 May 2027**
(a cut to Nov 2026 was proposed, not made). We follow it from day one anyway: it is cheap now and
expensive later. The **gym** is responsible for its members' records; **we** process them for
the gym. For workout data members enter in our app, we are responsible ourselves.

| # | Item | Who | Status |
|---|---|---|---|
| D1 | **Privacy notice** (plain English + Hindi): what we keep, why, where, for how long, how to withdraw, who to complain to. On the website and in both apps | Claude drafts; you approve | TODO |
| D2 | **Terms of use** for members and for gym staff | Claude drafts; you approve | TODO |
| D3 | **Pilot agreement + data agreement with the gym**: dates and success measures; the gym owns its data; full export within 7 days and deletion within 30 if they leave; our security duties; we tell the gym of a breach within 24 hours; support hours; liability cap; it is a beta | Claude drafts; you and the gym owner sign | TODO |
| D4 | **Complaints contact** (a "grievance officer"): a named person and email, answered within 90 days | You (inbox task) | TODO |
| D5 | **Consent screen** when a member joins the gym in the app: itemised data, purpose, "withdraw any time" | Claude builds | TODO |
| D6 | **Members under 18**: the law needs a parent's verified consent | You decide (inbox) | TODO |
| D7 | **Breach plan** (1 page): who does what in the first hour, tell the gym in 24 hours, the gym tells the Board and members | Claude writes | TODO |
| D8 | **Gym leaves = export + delete**: one-tap full export of the gym's data, and a delete path (today an online gym cannot be erased) | Claude builds | TODO |
| D9 | List of the services that hold data for us (Supabase Mumbai, Cloudflare, GitHub, Google Play, Sentry) in the privacy notice | Claude | TODO |
| D10 | A lawyer's read of D1-D3 | You decide (inbox): free drafts for the beta, lawyer before the 2nd gym | TODO |

### E. Money (You decide)

| # | Item | Who | Status |
|---|---|---|---|
| E1 | **Price after the pilot**, written into the pilot agreement before it starts. Market: small Indian gyms pay ₹1,000-3,500 a month; GGMS about ₹12,000 a year; our earlier draft ₹1,499 a month | You decide (inbox) | TODO |
| E2 | **Our GST registration**: needed only above ₹20 lakh a year. Gyms cannot claim back GST since Sep 2025, so our 18% would be a straight extra cost to them. Recommended: not now | You decide (inbox) | TODO |
| E3 | The gym's receipts already use **5% GST** from 22 Sep 2025 and number by financial year (checked 19 Oct). Ask the gym whether it is GST-registered (gym visit) | Claude (done) / gym visit | DONE |
| E4 | Full GST tax invoices (planned) | LATER, if the gym needs them | LATER |

### F. The gym visit and the gym's data (You + Gym, Claude prepares)

| # | Item | Who | Status |
|---|---|---|---|
| F1 | **Gym visit** with a one-page question sheet (Claude writes it): desk computer or phone, internet at the desk, printer, member count, staff names and shifts, GST status, cash/UPI split, group classes, FitPass members, the #1 daily headache, will members install an app | You (inbox task) | TODO |
| F2 | **Export from GGMS**: members, plans, dues, payment history, attendance (whatever GGMS can export: Excel, PDF report, or the database backup) + 2 sample receipts | You ask the gym (inbox task) | TODO |
| F3 | Map the GGMS columns into our import (our import takes Excel / CSV and has "Undo this import") | Claude | TODO |
| F4 | Trial import 1 and 2 into a test gym; totals match (active members, dues, payments per month); 20 members checked by hand | Claude + gym champion | TODO |
| F5 | Freeze day, final import into the real gym, totals match | Claude + gym | TODO |
| F6 | Make the gym's real online gym and the owner's first sign-in (the old seeded "RAMS01" has no owner key) | Claude + gym owner | TODO |

### G. People: training, support, members (You + Gym, Claude prepares)

| # | Item | Who | Status |
|---|---|---|---|
| G1 | Name the gym's **champion** (usually the head of the desk) | Gym, you ask | TODO |
| G2 | **Desk cheat sheet**, one laminated page, Hindi + English: check-in, new member, renewal, part payment, dues, cancel a receipt, shop order, print | Claude makes | TODO |
| G3 | **Training**: 60-90 min per shift, on the desk computer and phones | You run it with Claude's script | TODO |
| G4 | **WhatsApp support group**: gym owner, champion, you. Reply within 15 minutes in gym hours for "cannot take payments"; same-day fix | You (decide your support hours, inbox) | TODO |
| G5 | **Member messages**: 2 WhatsApp texts before go-live ("your plan, price and dues stay the same; get the app") + the QR poster (built: Invite & QR poster) | Claude drafts; gym sends | TODO |
| G6 | Staff help members install at check-in during weeks 3-5 | Gym | TODO |

### H. Product work before go-live (Claude)

| # | Item | Status |
|---|---|---|
| H1 | Re-check the two old open server refusals (other gyms' shop and messages kept apart) and close them | TODO |
| H2 | Fix the open rest-card item (U-C1, low) | TODO |
| H3 | Offline front desk (decided #7): needed only if the gym's internet is unreliable; decide after the gym visit | TODO after F1 |
| H4 | FitPass / pass members (planned): needed only if the gym has many; decide after the gym visit | TODO after F1 |
| H5 | Clean old notes that now say wrong things (old README, old to-do list, old phase table) | TODO |
| H6 | Release freeze 3 days before switch-over and the week after; then weekly releases, never on Monday or month-end | TODO |

## 4. Success measures (signed with the gym before week 3)

1. Every staff member on every shift uses ForgeAI every day.
2. 100% of renewals and payments are recorded in it.
3. Each day's receipts match the cash and UPI taken, to the rupee.
4. At least 30% of active members open the app at least once by week 6.
5. Crash-free: fewer than 1 in 100 app sessions crash; no admin outage longer than 15 minutes in gym hours.
6. Support requests fall week by week.

**Go / no-go in week 6:** you and the gym owner decide. If no: go back to GGMS (practised in
week 2), write down what must change, and try again later.

## 5. Running costs

| Item | Cost |
|---|---|
| Supabase Pro | about $25 a month (about ₹2,100) |
| Google Play account | $25 once |
| Sentry, Better Stack, Cloudflare, GitHub | free plans |
| WhatsApp automatic reminders (LATER, optional) | about ₹0.13 a message: about ₹200 a month for 500 members |
| Point-in-time restore (LATER) | $100 a month |

## 6. Future-proofing (after the beta)

- **Play public release** after the 14-day closed test; the APK then only as a backup.
- **DPDP full duties by 13 May 2027** (maybe earlier): consent records, yearly security review, access logs kept 1 year.
- **Test Lab successor** before 30 Sep 2027.
- **Automatic renewal reminders** by WhatsApp (Meta business verification under the gym's name).
- **A company** (needed for an organisation Play account, contracts at scale and GST later).
- **Second gym**: self-serve setup, pricing page, a lawyer-checked contract, point-in-time restore.
- **Entry machine** (planned P8), FitPass members, class booking: after the gym visit says which matter.

## 7. Sources (read 19 Oct 2026)

Supabase pricing and production checklist (supabase.com/pricing, /docs/guides/deployment/going-into-prod);
Google Play account and testing rules (support.google.com/googleplay/android-developer 14151465, 9845334, 10787469);
Android target API (developer.android.com/google/play/requirements/target-sdk);
Android developer verification (developer.android.com/developer-verification/guides);
Cloudflare Workers limits; Firebase Test Lab migration FAQ;
DPDP Rules 2025 (KPMG guidance; indiadatalaw.org deadlines);
gym GST 5% from 22 Sep 2025 (TaxClue, TaxAj); GST Rule 46 invoices;
WhatsApp Business pricing (Meta pricing doc; Gallabox rate card); TRAI DLT SMS;
pilot and migration practice (LegitFit, PushPress, Club Automation, Causo); Android versions in India (StatCounter, Aug 2026).
