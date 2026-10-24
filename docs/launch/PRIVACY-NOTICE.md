# ForgeAI privacy notice — FINAL for the trial (launch plan D1)

Finalized 20 Oct 2026 by Claude after an independent legal check against the DPDP Act 2023, the
DPDP Rules 2025 and the IT (SPDI) Rules 2011 (in force until the DPDP Rules fully start, 13 May
2027). Every promise below was checked against what the system really does today. Two blanks only
the owner can fill: **[OWNER NAME]** and **[CONTACT EMAIL]** (inbox #37), and the gym's details.
A lawyer check is still advised before the second gym (open risks at the end).
Updated 24 Oct 2026 (tracker #59, owner approved the draft "as written"): saved workouts with Google
sign-in, the AI import named under "Where it is kept" (names and addresses now hidden from it too).

---

## ForgeAI privacy notice

**Who we are.** ForgeAI is a workout app for members and a desk app for gyms, run by
[OWNER NAME], Jaipur, India.
**Grievance Officer:** [OWNER NAME], [CONTACT EMAIL]. We reply within 30 days, usually within a week.

### Who is responsible for what
- **Your gym's records about you** (membership, payments, receipts, visits, shop orders, messages
  with the desk): your **gym** is responsible (its name and contact are in the app under Settings → Your gym, and at its desk). ForgeAI stores and
  processes them for the gym, under a written agreement.
- **Your ForgeAI account and our technical logs:** **ForgeAI** is responsible.
- **Your workouts** (exercises, sets, weights, body weight, measurements, progress photos) stay
  **on your phone** unless you sign in with Google. Your gym does not see them either way.
- **If you sign in with Google**, ForgeAI saves a copy of your workouts on our server so you can
  get them back on a new phone. **ForgeAI** is responsible for that copy, not your gym. Only you
  can see it. See "Your saved workouts" below.
- If you join your gym's workout offer, the app sends your gym only the dates of the workouts
  that count, and only while you are in the offer. Your gym is responsible for its offers and
  rewards; ForgeAI keeps the dates for the gym.

### What we keep on our server, why, and for how long

| Data | Why | How long |
|---|---|---|
| When you join a gym in the app: your name, mobile number, the gym, the date you joined, when you last used the app, the date you left | So the gym knows who checked in, ordered or wrote | Until you leave the gym (your mobile number is then erased); the rest stays with the gym's records |
| Check-ins (date and time), shop orders, messages with the desk | To run your membership and the gym's shop | As long as the gym keeps its records |
| The gym's records listed above | So the gym can run memberships, receipts and check-ins | While the gym uses ForgeAI; deleted within 30 days after it leaves (backups expire within 7 more days) |
| Gym staff: name and mobile | Staff sign-in | While they work there |
| Workout offers you join: the offer, when you joined or left, the words you agreed to, the dates of workouts that counted (only days you checked in), and the reward | To give you the reward | Dates: deleted when you leave the offer or the gym, or 90 days after the offer ends. The reward stays on your membership record. When you joined and left: 1 year after the offer ends |
| Feedback you choose to send (Settings → Send feedback): your message, the app version, the phone model, your gym's code, a random number for this install, and a scrambled (one-way) form of your network address. No name or mobile number | To fix problems and decide what to build next | 1 year |
| Only if you sign in with Google: your saved workouts and the other items listed under "Your saved workouts" | So you can get them back on a new phone | Until you delete your account. Deleted from our server at once when you do; backup copies expire within 7 more days |
| Only if you sign in with Google: your ForgeAI account (your Google email address, and the name and picture link Google shares) | So only you can open your saved workouts | Until you delete your account (one exception, explained below) |
| Technical logs (sign-ins, errors, the network address of requests) | To keep the service working and safe | Up to 7 days today (our provider's limit); from May 2027, 1 year, as the law then requires |

We do not sell your data, show ads, or use your data to profile you. The only AI feature today is
your gym owner's optional member-list import (see "Where it is kept"). It only works out which
column is which; the AI sends back no member details. If we ever add an AI feature that uses your
own workouts, we ask you first.

### Your saved workouts (only if you sign in with Google)
Signing in is your choice. If you never tap **Continue with Google**, none of this is sent and
your workouts stay only on your phone.

**What we save.** When you sign in (on the welcome screen, or in Settings → Backup → Keep your
workouts on ForgeAI), the app saves these on our server:
- your workouts, with each exercise and set (weight, reps, time);
- your routine folders and routines, and the exercises you made yourself;
- your rest-timer lengths and where your personal records start;
- your body weight and body measurements, with their dates;
- the **dates** of your progress photos. The photos themselves stay on your phone;
- your profile: name, age, height, goal, experience, gym name, member-since date, food targets,
  units, language, bio and link. **Never your phone number.**

From Google we get your email address and, if Google shares them, your name and picture link.

**Why.** Only so you can get your workouts back on a new phone, or after reinstalling the app,
by signing in again. We do not sell it, show ads with it, or use it to profile you.

**Who can see it.** Only you, when you are signed in. **Your gym cannot**: not the owner, the
trainers or the desk. Other members cannot. ForgeAI's people do not look at it, except when
needed to keep the service running or fix a fault, or when the law makes us.

**Where.** In our main database in Mumbai, India (Supabase). Google handles the sign-in.

**How long.** Until you delete your account. When you delete a workout or another item in the
app, it is deleted on our server too. We keep only an empty marker (no workout details) so
another phone of yours does not bring it back.

**Sign out** (Settings → Backup → Sign out): the app stops saving new workouts. What is already
saved stays until you delete your account.

**Delete it** (Settings → Backup → **Delete my account**): this deletes everything saved on our
server and your ForgeAI account, at once. The workouts on your phone stay. One exception: if
you also use the same Google account to sign in for a gym (for example as a trainer or owner),
we delete your saved workouts but keep that sign-in, so the gym's app keeps working. Backup
copies at our provider expire within 7 more days. You can also ask us by email
([CONTACT EMAIL]); we do it within 30 days.

**Google Drive backup** (Settings → Backup) is separate and also optional. Your phone puts a
backup file in your own Google Drive. It does not go through our server, and we cannot open it.
Google's own privacy terms apply to it.

### Where it is kept
Our main database is in **Mumbai, India** (Supabase). Some service providers may process limited
data outside India: Cloudflare (delivers the desk app and passes both apps' requests on to our
database), Google (sign-in with Google, and Google Drive if you turn on that backup), Google Play
and GitHub (app downloads), and, only when your gym's owner imports an old member list and
presses **Ask AI**, Google Gemini or Anthropic Claude (they see the list's column names and 5
example rows, with names, addresses, mobile numbers, emails and ID numbers hidden) [and Sentry
(crash reports), once added]. They
process it only to provide their service to us. So that the desk can keep working when the internet
drops, the desk app keeps a copy of the gym's records on each device a staff member signs in on;
signing that device out deletes the copy.

### Your rights
You can:
- ask for a **summary** of the data we hold about you and who we shared it with;
- ask us to **correct** or **complete** it;
- ask us to **erase** it, where the law allows (your gym may have to keep payment records);
- **delete your saved workouts and account** yourself at any time: Settings → Backup → Delete
  my account;
- **withdraw consent**: tap **Leave gym** in the app, or email [CONTACT EMAIL]. It is as easy as
  giving it. It stops future use only; some features then stop working. To stop sharing workout
  dates, open the Gym tab, then Workout offer, then Leave the offer. Leaving the gym in the app does
  the same;
- **name another person** to use these rights for you if you die or cannot act;
- **complain** to our Grievance Officer above. If we do not resolve it, you can complain to the
  **Data Protection Board of India**.

### Under 18
The member app is only for people aged **18 or over**. If we learn we hold data of someone under
18 without a parent's consent, we delete it.

### Security and breaches
Data travels encrypted; each gym can only reach its own records; staff sign in with single-use
codes; every receipt records who took the money. If your data is exposed, we tell your gym within
24 hours and report it to the Data Protection Board as the law requires, and you are told directly
(in the app or by message) what happened, what it means and what to do.
For your saved workouts, ForgeAI is responsible, so we report a breach to the Data Protection
Board ourselves and tell you directly.

### Changes
We tell you in the app before a change that affects you. The date below is the latest version.

Last updated: 24 Oct 2026. What changed: you can now sign in with Google to save your
workouts on our server (optional; only you can see them); the AI import and Google sign-in are
now listed under "Where it is kept".

---

## Short notice for the gym to give its members (the gym is responsible for its records)

[GYM NAME] keeps your membership, payments, receipts and visits in ForgeAI, a gym software whose
servers are in Mumbai, India. We use them only to run your membership. You can ask the desk to see,
correct or erase your details (we must keep payment records as the law requires). Questions:
[gym contact]. ForgeAI's privacy notice: [link].

---

## Open risks (for the lawyer check before the second gym)
1. Shop orders and desk messages may bring e-commerce or intermediary rules; the Grievance Officer
   above would serve for those too.
2. The Board's complaint portal address is not linked yet (to be taken from its official site).
3. The 30-day reply and the one-year log rule come from the 2011 rules and DPDP Rule 6; the exact
   DPDP Rules start date (13 or 14 May 2027) varies by source.
4. (Added 24 Oct 2026 with the saved-workouts lines, tracker #59.) "Your saved workouts": is
   "except when needed to keep the service running" narrow enough? Is "until you delete it" enough,
   with no automatic deletion of accounts nobody uses?
5. The AI import sends the plan names, amounts and dates of up to 5 rows to a US company (names,
   addresses, mobile numbers, emails and ID numbers are hidden first, in the browser and again on our
   server). The gym decides to do this; is the gym's own notice enough for its members?
6. Have a native Hindi reader check the Hindi before it goes live.
