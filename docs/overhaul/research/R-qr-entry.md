# R — QR entry at the gate, and the gym's icon after joining (17 Oct 2026)

Owner ideas, research only (no build until he decides).

## 1. QR at the entry gate instead of a fingerprint machine

**Idea:** the member opens ForgeAI and scans a QR code at the gate. That marks attendance, opens
the door, then nudges them to start today's workout. If they have no routines, give them a ready
Push Pull Legs plan.

### What already exists in the app (fact, from the code)
- **QR self check-in** (15 Oct 2026, `src/shop/CheckInScreen.tsx`, server `member_check_in`
  0015/0016). The gym's poster QR (`https://forgeai.aakashpahuja.in/c/RAMS01`) opens the app
  straight to the check-in screen. One tap marks attendance. If no plan covers today, it still checks
  them in and says "Please see the desk". A member who isn't in the gym gets "Join this gym".
- **Ready programs** (`src/tracker/plans/programs.ts`): Push Pull Legs (3 days), PPL x2, Upper / Lower,
  Full Body. Rep ranges come from the progressive-overload research table.

So **attendance by QR already works today**. What is missing: (a) the door opening, (b) the
"start your workout" nudge after check-in, (c) offering PPL when there are no routines.

### Does the market do this? (research)
- Mainstream in gym software abroad. PerfectGym GO: the member opens the app and scans the QR on the
  turnstile. GymMaster: the member scans a QR shown near the door and the visit is recorded.
  BETA and ButaGYM use QR codes that change every few seconds, so a code can't be shared.
- Cult.fit (India) does the reverse: the app SHOWS a QR and the member scans it at the
  reception/entry device. Check-in there is mandatory.
- The owner's direction (member scans the gate) has one real plus: it **forces the app open**, which
  is the moment to nudge the workout. Cult's direction needs a reader at the gate.

### How the door part would work
1. A QR is stuck at the gate (or shown on a cheap screen there).
2. The member scans it, and the app calls our server with their key.
3. The server checks: in this gym, membership active today, not already in.
4. The server tells a **networked door controller** to open for about 5 s. The controller is a
   Wi-Fi/LAN relay wired to a magnetic lock or turnstile. A Matrix COSEC door is the same idea
   through its PUSH API (see R-entry-machines.md). Whether COSEC takes an "open the door now"
   command is NOT yet confirmed.
5. Attendance is saved. The app shows "You're in ✓" and **"Start Push day"**, or **"Add Push Pull
   Legs"** for a member with no routines.

### Risks and answers
| Risk | Answer |
|---|---|
| The poster is photographed and forwarded on WhatsApp, so someone opens the door from outside or checks in from home | For the door: a QR that changes every 30 s on a small screen at the gate (the BETA/ButaGYM way), or the door only opens on the gym Wi-Fi / near the gym (GPS). Attendance alone is already guarded by "one tap, not automatic" |
| Internet or our server is down, so nobody gets in | Keep the desk's exit/unlock button and a keypad PIN as a fallback. Never make the app the only way in |
| Phone dead or forgotten | Desk lets them in and marks attendance in the admin app (already possible) |
| Fire safety | Use a fail-safe magnetic lock (opens when power is lost) plus an exit push button. The installer must confirm local rules |
| Member without a smartphone | Desk check-in, as today |

### Cost (estimates, NOT verified Indian prices)
- **Attendance only (today):** ₹0 hardware. Print the poster.
- **Door opening:** a Wi-Fi door controller kit with a magnetic lock is roughly USD 95–360 abroad
  (Tuya-type kits). An Indian installer quote is needed. Add a small Android tablet if we use the
  changing QR. Much cheaper than a fingerprint/face terminal, but a cheap Wi-Fi kit usually has
  no documented server API. We'd need one that does, or a small controller we program ourselves.

### Recommendation
Two steps:
- **Step 1, app only, cheap, mainstream:** after a QR check-in, show "Start <today's routine>".
  With no routines, show "Add Push Pull Legs" (the existing program). This needs no hardware.
- **Step 2, the door:** only after the owner's client agrees to buy hardware. Pick a controller with
  a real server API (ask Matrix about an "open door" command first, since they are local in Jaipur).
  Use the changing QR or a near-the-gym check.

## 2. The gym's icon on the phone after joining

- **The colours already change** on joining (part BR, tested with RAMS01).
- **Android does not let an app set a downloaded picture as its home-screen icon.** Only two real
  ways exist:
  - **A. A home-screen shortcut with the gym's logo** (Android's "pin shortcut"). After joining, the app
    asks "Add RAM'S FITNESS to your home screen?" and Android shows its own confirm box. The ForgeAI
    icon stays in the app drawer. This works for any gym with no new release, and it is how many white-label
    apps do it.
  - **B. Swap the real app icon** between icons built into the app (an Android trick called activity-alias).
    Every new gym needs a new app release. On some phones the app closes once when the icon swaps and
    old shortcuts vanish. It doesn't scale to many gyms.
  - Recommendation: **A**.

## 3. "Log in with Google" and "Join with your gym" on the first screen
- Today the app works fully without any gym or account (all data on the phone). The first screen
  has **no** gym option.
- Small, no-account step: add "Have a gym code? Join your gym" on the welcome screen. It goes to the
  same join screen.
- Google login is a bigger accounts feature: server accounts, a privacy policy update, and moving
  phone-only data. It needs its own research and the owner's decision.

Sources: PerfectGym help (mobile check-in by QR), GymMaster help (QR access), BETA (sendmoregetbeta.com),
ButaGYM (Product Hunt), cure.fit support (gym check-in), StudioMatrx guide (QR access in India),
Evo Tech / Newegg listings (Tuya kits).
