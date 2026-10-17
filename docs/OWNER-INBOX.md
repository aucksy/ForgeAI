# Owner inbox — your ideas, my answers, your decisions

**What this is:** every idea, suggestion or question you send in chat is written here FIRST
(before any work), with my answer under it. Chat can be cut short when a long session is
compacted; this file is not. Download it to your PC whenever you like; it is the one place to
catch up.

**How to read it:** newest at the top. Each entry has
- **You asked**: your idea in short;
- **Status**: one of DONE / BUILT, NOT RELEASED / PLANNED / RESEARCHED: WAITING FOR YOU / ANSWERED;
- **My answer**: plain English, with the details;
- **Needs you**: the decision I am waiting for (if any). Reply with the entry number and your pick,
  e.g. "#11: A".

Full research lives in the linked docs; this file is the short version.

---

## Waiting for your decision (all in one place)

| # | Decision | My pick |
|---|---|---|
| 12 | Gate QR: build Step 1 now (after check-in: "Start Push day", or "Add Push Pull Legs" for no routines)? | Yes, build Step 1 |
| 11 | Gym icon after joining: A home-screen shortcut with the gym logo, or B icons built into the app | A |
| 11 | Welcome screen: add "Have a gym code? Join your gym" (small)? Google login is a bigger, separate project | Yes to the small one; research Google login later |
| 7 | Offline front desk for the admin app: 1 build it, or 2 leave it (paper during outages) | 1 |
| 9 | kg target per exercise, decision 1: A follow the Targets / Weight jumps setting, or B a fixed % the member picks (max 10%) | A |
| 9 | kg target per exercise, decision 2: A next sets show what is left to hit the target, or B only show "kg so far" | A |
| 2 | Entry machine: which of the 3 Matrix setups to offer the client | 2 (tripod turnstile) as standard |

---

## 12. QR code at the entry gate instead of a fingerprint machine — 17 Oct 2026
**You asked:** members open our app and scan a QR at the gate to get in. That marks attendance,
then nudges them to start their workout; with no saved routines, give them a research-based
Push Pull Legs plan. Don't build yet; does it work, and how?
**Status:** RESEARCHED: WAITING FOR YOU
**My answer:** Yes, it works, and gym apps abroad already do it (PerfectGym, GymMaster; BETA and
ButaGYM use a QR that changes every few seconds). Most of it already exists in our app:
- the gym's QR poster already opens ForgeAI on "Check in": one tap marks attendance and checks
  the membership;
- a ready Push Pull Legs plan already exists (plus Upper/Lower and Full Body).

Missing, in two steps:
- **Step 1 (app only, no hardware):** after check-in, "You're in ✓ — Start Push day"; for a
  member with no routines, "Add Push Pull Legs".
- **Step 2 (the door):** the scan tells our server to open a networked door lock for a few
  seconds. This needs hardware at the gate. Wi-Fi door kits are roughly USD 95–360 abroad (not an
  Indian price; get an installer's quote). Many cheap kits can't be opened by our server, so pick
  one that can; ask Matrix (local in Jaipur) first.

Risks: a forwarded photo of the QR (fix: a QR that changes every 30 s on a small screen at the
gate, or open only near the gym); no internet means nobody gets in (keep the desk button and a
keypad PIN); fire safety (lock must open on power loss, plus an exit button).
**Needs you:** build Step 1 now? Step 2 waits until the client agrees to buy a lock.
**Details:** `docs/overhaul/research/R-qr-entry.md`

## 11. I couldn't join RAMS01 from my app; gym icon and theme after joining — 17 Oct 2026
**You asked:** Settings → Your gym gave no way to join. After joining with a valid membership, the
theme should change and the app icon should become the gym's (or a mix). New users: log in with
Google etc., with "join via your gym membership" right below; the app must also work with no gym.
**Status:** join fix BUILT, NOT RELEASED (commit b146cf7, in v0.47.0); the rest WAITING FOR YOU
**My answer:**
- **Why it failed:** Settings → Your gym only showed the name typed at setup; the join box was on
  the Shop tab. Fixed: Settings → Your gym now has "Join your gym" with a code box.
- **Test today in your current app:** Shop tab → type RAMS01 → your name → Join. The colours change.
- **Theme on joining:** already works.
- **Icon:** Android does not let an app use a downloaded logo as its icon. A) after joining, offer
  "Add RAM'S FITNESS to your home screen" (a shortcut with the gym's logo; ForgeAI stays in the app
  list; works for every gym, no new release). B) icons built into the app: a new release per gym,
  and some phones close the app once when it switches. My pick: A.
- **Works with no gym:** already true; everything is on the phone, no account needed.
- **Welcome screen:** it has no gym option today. Adding "Have a gym code? Join your gym" is small.
  Google login is a bigger accounts project (server accounts, privacy policy, moving phone data):
  research first.
**Needs you:** icon A or B; the small welcome-screen join (yes/no); research Google login (yes/no).

## 10. RPE tap: let me SEE the ✓ get ticked — 16/17 Oct 2026
**Status:** BUILT, NOT RELEASED (commit c54923f, in v0.47.0)
**My answer:** after an RPE tap the sheet closes, then the ✓ on that set pops and ticks in front
of you, then the rest timer starts.

## 9. Progressive overload: a kg target per exercise on the Workout tab — 16/17 Oct 2026
**You asked:** under Resume workout, each exercise shows the total kg to beat (not the whole
day's total), based on research or the member's setting; during the workout, suggest the next
reps/weight that add up to it.
**Status:** PLANNED (not built) — WAITING FOR YOU
**Needs you:** decision 1 (A follow the existing Targets / Weight jumps setting, recommended; or
B a fixed "aim for N% more" the member picks, max 10%) and decision 2 (A the next sets show what
is left to hit the target, never more than one weight step or 2 reps above plan, recommended; or
B only show "kg so far").
**Details:** `docs/TRACKER-PRD.md` §11

## 8. A drag-handle bar on exercise and routine cards — 16 Oct 2026
**Status:** BUILT, NOT RELEASED (commit c1c2d5e, in v0.47.0)
**My answer:** a small grey bar at the top of each card shows "press, hold and drag". Only shown when
there are 2 or more cards to reorder.

## 7. Offline mode: can the gym use the admin app without internet? — 16 Oct 2026
**Status:** ANSWERED — WAITING FOR YOU
**My answer:** Partly. A gym kept "in this browser only" works offline but lives on one device.
An online gym: if the internet drops, the desk can still SEE members and dues, but can't save
(add member, take payment, check in). A payment cut off mid-save is resent once the internet is back,
never twice. Opening or refreshing the app with no internet: it won't open. The member phone app
works fully offline for workouts. The planned entry machine would keep letting paid members in.
**Needs you:** 1) build "offline front desk" (saved copy on the desk device; offline check-ins
and payments queued and sent once each when back online), recommended; or 2) leave it.

## 6. GGMS member app: what members get there — 16 Oct 2026
**Status:** ANSWERED
**My answer:** GGMS is one app for owners and members ("I'm Member" tick at login). Members see
their plan end date, payments and attendance, book classes, check in by QR, get reminders and
the gym's diet/workout plans. No workout logging or progress, where we are far ahead. Gaps for us
(members): own plan end date / payments / attendance in the app; class booking; trainer-sent
diet and workout plans; gym-recorded body measurements.
**Details:** `docs/overhaul/research/R-ggms-competitor.md`

## 5. Use the admin app's icon for the mobile app — 16 Oct 2026
**Status:** BUILT, NOT RELEASED (commit abe5745, in v0.47.0)

## 4. GGMS (the client's current CRM): features and prices — 16 Oct 2026
**Status:** ANSWERED
**My answer:** GGMS (Gayatri Software, Jaipur, since 2017, claims 1,000+ gyms). Offline Plan from
₹11,999/year (no member app); Online Plan from ₹14,999/year (with app). These are starting prices
from listing sites; GGMS doesn't publish prices. Ask the client what they really pay. Owner gaps
for us: entry machine (planned P8), automatic SMS/email reminders, an AI business chat, "expiring
soon" split by days, class booking, trainer section, staff salaries, several branches, webcam
photo, birthday wishes. Their users complain about bugs, so reliability is a point we can win on.
**Details:** `docs/overhaul/research/R-ggms-competitor.md`

## 3. Entry machines: don't build, add to plan — 16 Oct 2026
**Status:** PLANNED (P8 in `docs/overhaul/CRM-BUILD.md`)

## 2. Matrix's connection kit: does it really work? Top 3 at different prices — 16 Oct 2026
**Status:** ANSWERED — WAITING FOR YOU (which setup to offer)
**My answer:** Yes. Matrix's own guide covers everything we need: the machine connects to our
server by itself (no PC at the gym); add/remove members; block an expired member by itself even
when offline; face/finger sign-up; every entry sent to us with a reason; open-door commands; no
licence fee mentioned. To confirm with the dealer in writing: the exact model supports "Third Party
Server", their latest guide, and one real machine to test.
1. Budget smart door (face reader + magnetic lock): about ₹25,000–40,000.
2. Tripod turnstile: about ₹80,000–1.6 lakh. **My pick as the standard offer.**
3. Flap barrier: about ₹2.5–4 lakh+.
(Online prices outside Jaipur, before GST and fitting.)
**Details:** `docs/overhaul/research/R-entry-machines.md`

## 1. Physical entry / attendance machines in Jaipur that connect to our CRM — 16 Oct 2026
**Status:** ANSWERED
**My answer:** No brand has its own Jaipur office; all sell through local dealers. Two options
connect: Matrix COSEC (Indian, official connection kit, gym case study; recommended) and
ZKTeco/eSSL (cheaper, "push" to our server, more for us to build).
**Details:** `docs/overhaul/research/R-entry-machines.md`
