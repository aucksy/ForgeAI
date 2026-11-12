# Find my gym by my phone number (members) and open my gym (owners)

Owner request, 12 Nov 2026 (R-458): "detecting user's phone number, and if it's in one of the gym's database and
the membership is active, then automatically ... give the user the option to enable or unlock all app features ...
Similarly, if owner is logging in using their phone number, then automatically their gym's colors and branding and
features will be unlocked."

## In plain English (read this part)

- **Today a member links the app to their gym by hand**: they type the gym's 6-letter code, scan the poster at the
  desk, or tap the gym's invite link. Nothing looks up their phone number across gyms.
- **Nothing in the member app is locked today.** The paid plan for people without a gym (F56) is planned, not built,
  and the gym-plan limits are switched off. So "unlock" really means **"join your gym in the app"**: the gym's
  colours and logo, your plan and days left, check-in, your trainer's plans, the gym's shop. When F56 is built, a
  member of a MettleUp gym gets everything free (that is already in F56's plan).
- **The risk.** If the app searched every gym by a number someone TYPES, anybody could type a friend's or an ex's
  number and learn which gym they go to and whether their plan is running. So the search must only answer the
  person who PROVES the number is theirs.
- **The good news: we already have a free way to prove a number.** "Verify with WhatsApp" is live since 8 Nov for the
  admin app: the person sends one WhatsApp message to MettleUp's number, WhatsApp tells us who sent it, and that
  is the proof. A message sent TO us costs nothing. Meta's block (error 131042) only stops messages WE send.
- **My pick:** use that same free WhatsApp check in the member app. Cost: ₹0 a month at 100 or 1,000 members.
  SMS codes are the paid back-up if WhatsApp ever stops working (about ₹40 a month at 100 members, ₹380 at 1,000,
  plus about ₹5,900 once to register as an SMS sender).
- **Owners: built today, no server change.** On the member app's Gym tab (when no gym is joined), a new card
  "Do you run a gym on MettleUp?" lets the owner or desk staff sign in with the same mobile number and PIN as the
  admin app. The app then opens their own gym's "Join" screen; one tap and the app takes their gym's colours and
  logo. The PIN is only checked, never saved on the phone. It goes out with the next app release, after its test.
- **What needs your yes** (nothing is live yet for members): (1) apply server change 0068 (the search), (2) put the
  new member check on the MettleUp web server, (3) one new privacy line (below), and (4) your OK on the pick.

## What exists today (checked in the code, 12 Nov 2026)

| Piece | What it does | Where |
|---|---|---|
| Join by code, poster QR, invite link | The member links the app to ONE gym they name | `apps/mobile/src/shop/InviteScreen.tsx`, `member_join` |
| Check-in number | The member types their number once at the gym; it is NOT proven, so the desk confirms it before the app is linked to the gym's list | supabase 0015, 0016, 0048 (`gym_phone_links`) |
| My membership | Plan, end date, days left, visits; never money, because the number is not proven | supabase 0023, 0055 |
| Staff sign-in | Owners and desk staff sign in to the admin app with mobile + 6-digit PIN or a one-time code; 5 wrong tries lock the PIN | supabase 0010, 0034, 0048 |
| Verify with WhatsApp | A person proves a number by sending us a code on WhatsApp; the web server turns that into a signed one-use proof that the gym server checks itself | `deploy/panel/phoneInbound.js`, supabase 0061 (live) |
| Gym branding | Joining paints the app in the gym's colours and logo | `apps/mobile/src/theme/gymTheme.ts` |
| Locked features | None. `PLAN_GATE_ON = false`; F56 (paid plan for solo users) is Planned | `packages/theme/src/plans.ts`, OWNER-INBOX F56 |
| Member account | Optional "Continue with Google" for backup; it does not know the phone number | `apps/mobile/src/cloud/account.ts` |
| Owner identity | Mobile number + PIN (not Google). The member app had no way to know who the owner is | `apps/dashboard/src/crm/auth/*` |

## What is missing

1. Members: no search across gyms by a proven number, and no screen for it.
2. Owners: no way for the member app to know "this is the owner of gym X" (built now, see below).

## Privacy (DPDP Act 2023 and the 2025 Rules)

- **Purpose.** The gym collected the number to run the membership. Using it to tell the SAME person "your gym is on
  MettleUp, join it here" is the same purpose, done for the gym. MettleUp acts for the gym (processor), so the gym
  data agreement should say we do this. **New words = your yes.**
- **Notice and consent.** Before the check, the screen says in one line what happens: "We check this number against
  the member lists of gyms on MettleUp, only to find your own gym. We do not keep the number." The DPDP Rules' notice
  rule applies from about 13 May 2027, but we do it from day 1.
- **Only the owner of the number gets an answer**, only for their own first name (a recycled number never shows
  the old holder's gym), at most 5 searches per proof, proof valid 15 minutes, used once to link.
- **Least data.** The answer is the gym's name, its join code, and the plan's end date. Never price, dues, visits.
- **Nothing new is stored about the search**: only a one-use code id and the time, deleted after a day.
- **Proposed privacy notice line** (needs your yes): "Find my gym: if you check your mobile number in the app, we look
  for it on the member lists of gyms that use MettleUp, only to show you your own gym. The number is checked once and
  is not kept for this."

## Decisions (2 options each; my pick marked)

**D1. How a member proves the number**

| | A. Verify with WhatsApp (recommended) | B. SMS code (DLT-registered provider, e.g. MSG91) |
|---|---|---|
| How | Member taps "Check with WhatsApp", sends the prepared message, comes back | We text a 6-digit code; Android can fill it in by itself |
| Cost a month, 100 members | ₹0 | about ₹40 (₹0.25 a text + 18% GST, about 1.3 texts each) |
| Cost a month, 1,000 members | ₹0 | about ₹380 |
| One-time | ₹0 (live since 8 Nov) | about ₹5,900 DLT sender registration, a new account and key (yours) |
| Weak spot | Needs WhatsApp on the same phone; one tap away and back | Costs money; DLT paperwork; SMS can be slow |

Not picked, and why: **Firebase phone sign-in** costs $0.07 a text to India (about ₹6; first 10 a day free), so about
₹6,200 a month at 1,000 members, and needs a Google billing account. **Truecaller** is free but proves only
Truecaller users; for others it uses a missed call that needs the call-log permission, which Google Play no longer
allows for sign-in checks (July 2026). **Google's phone-number hint** only fills the box; it proves nothing.
**WhatsApp codes we send** (₹0.115 + GST each) stay blocked by Meta's 131042 until GST is sorted.
iPhone: WhatsApp check and SMS both work the same; Truecaller's iPhone kit only covers Truecaller users.

**D2. What happens when a gym is found**

| | A. Show it and ask (recommended) | B. Join automatically |
|---|---|---|
| Screen | "We found your membership at Iron Temple (ends 6 Dec). Join it in the app?" then the usual Join screen | The app joins at once |
| Why | Same as every join today (asks first, owner rule of 17 Oct); handles 2 gyms | Surprises people; wrong when a number sits at 2 gyms |

After joining, the app hands the proof in once more, so the gym's list and the app are linked at once: no desk
check needed (the number is proven, unlike a typed one).

## What was built now (no money, no new account, no live change)

1. **Owner and staff, member app** (works with today's live server; ships in the next app release after UAT):
   Gym tab, when no gym is joined: "Do you run a gym on MettleUp?" → "Sign in as gym staff" → mobile number and PIN
   (or a one-time sign-in code) → the gym's own "Join <gym>" screen → Join = the app in the gym's colours.
   The same checks, tries and locks as the admin app; the sign-in is ended at once and nothing is kept on the phone.
   Files: `apps/mobile/src/shop/staffDoor.ts`, `StaffDoorCard.tsx`, `gymApi.ts` (`apiStaffGymCode`), `ShopScreen.tsx`.
   Android and iPhone (shared code; no native part).
2. **Members, server side only, NOT applied**: `supabase/migrations/0068_member_find_gym.sql`
   (`member_find_gyms(proof, name)`, `member_claim_phone(key, proof)`), its test `supabase/tests/0068_member_find_gym.sql`
   (CI runs it on a throw-away database), and the web server's "member" check (`deploy/panel/phoneInbound.js`, purpose
   `member`, not deployed; only checks people SEND us, never a paid send).
3. **Not built yet**: the member app's "Find my gym with my number" screen, because it cannot work or be tested until
   0068 is applied and the web server is deployed (a screen that cannot work must not ship).

## Build steps after your yes

1. Apply 0068 on the gym server (SQL Editor, the file as in git); run its test there (always ends in an error, changes nothing).
2. Deploy the web server (`deploy/panel`), so "member" checks work.
3. Member app: on the Gym tab's no-gym screen, above "Join your gym": "Find my gym with my number" → number (pre-filled
   from the profile) → "Check with WhatsApp" → back in the app: the gyms found → "Join" → join → link. Also offered
   once on the welcome screen when the member typed a number there. Words through the member-words check.
4. Privacy notice line + gym data agreement line (your yes on the words), What's new line, admin What's new line.

## Tests and UAT

- Unit: `apps/mobile/test/shop/staffDoor.test.ts` (10), `deploy/panel/phoneInbound.test.mjs` (+1, 19 in all),
  `supabase/tests/0068_member_find_gym.sql` (34 checks: found, recycled number, cancelled or ended plan, archived,
  suspended gym, wrong purpose, bad signature, expired, a typed number, 5 searches, link once, desk request closed,
  name mismatch, not on the list, bad key, grants), `supabase/tests/security.sql` (the 2 new open functions listed).
- UAT owner door: part `u458` (`apps/mobile/qa/uat-rel-r458-staff-door.yaml`): fresh test gym, owner's own one-time
  code, wrong PIN first (nothing opens), then the right code opens "Join QA UAT Gym", Back, card closed. Pictures
  `rel-r458-*.png`. Still to run before release: his phone size and largest text, no internet, the app killed while
  signing in, a locked PIN, a desk person, an owner with 2 branches, iPhone (unit tests only).
- UAT members (after the yes): happy path (one gym, two gyms), negative (number not found, ended plan, someone
  else's first name, a wrong-number WhatsApp message), the app killed while waiting for WhatsApp, offline, the proof
  running out (15 min), installing over the old version, his phone size and largest text.

Sources (read 12 Nov 2026): Google Cloud Identity Platform pricing (India $0.07 a text, 10 a day free);
MSG91 and market OTP rates in India (₹0.13 to ₹0.25 a text + 18% GST, Message Central, Authgear, productgrowth.in);
DLT registration ₹5,900 (Exotel, SMSGatewayHub); Truecaller developer FAQ (free; missed call India and Android only);
Google Play SMS and Call Log policy (call-log verification not allowed from July 2026); WhatsApp authentication
India ₹0.115 (Meta pricing pages via baat.ai, instantdm.com); DPDP Rules 2025 (notified 13/14 Nov 2025; notice rules
from about 13 May 2027, Mondaq, SCC Online).
