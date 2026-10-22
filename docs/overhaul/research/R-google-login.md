# R — Google login for members (22 Oct 2026)

Owner ask (17 Oct): "New users: log in with Google etc., with 'join via your gym membership' right
below; the app must also work with no gym." Research only. Nothing built.

**Today:** members have no account. Workouts live only on the phone, with an optional backup to the
member's own Google Drive. To join a gym they type the gym code, name and phone number. Nobody checks
that number, so "My membership" hides money, and it shows nothing when two members share a number.
The Drive backup already signs in with Google, but its Google Cloud setup was never finished (the app
still holds a placeholder), so no member can use it yet.

## 1. What other apps do
| App | Sign-in | Login required? |
|---|---|---|
| Hevy | Email or username + password, Google, Apple (Facebook dropped) | Yes. Workouts live on Hevy's servers. |
| Strong | Email, Facebook, Apple. No Google listed. | Yes: "All users will be prompted to sign up" first. |
| cult.fit | Mobile number + OTP | Yes. The number cannot be changed in the app. |
| FITPASS | Mobile number or email + OTP | Yes. Works on one phone at a time. |
| FitNotes | None | No account, fully offline (from our earlier Hevy research). |

- Global apps lead with Google, Apple or email. Indian apps lead with mobile number + OTP (a one-time
  code sent by SMS), because the number is already the customer ID.
- Hevy and Strong both have a help page for "I signed in and my data is gone". People pick a
  different sign-in method the second time and get a new, empty account. Fewer methods, fewer losses.
- HealthifyMe: I could not reach an official page on how it signs in, so it is left out.

## 2. Google sign-in with our server (Supabase) on Android
**How it works:** the member taps "Continue with Google" and picks an account. Google gives the app
a signed note saying "this is rahul@gmail.com" (an "ID token"). The app passes it to our server
(`signInWithIdToken`), which checks it with Google and opens or creates the account. No password.
- **Library:** the app already has the free Google sign-in library used by Drive backup. Once our
  web client ID is set, the same sign-in returns the ID token. Supabase's own Expo guide uses exactly
  this library. Expo's Google guide lists only native libraries; the browser-based route
  (expo-auth-session) is not among them.
- **Catch:** the free version uses Google's old Android sign-in kit. Google calls it deprecated and
  says it "will be removed ... in a future release", with no date. The replacement, Credential
  Manager, is Google's one-tap bottom sheet. That version of the library costs $79 a year. It also
  adds the "nonce", an anti-replay check that Supabase's Expo example does without. A free option
  exists (react-native-nitro-google-signin), but it is small and unproven.
- **Cost:** Google has no fee for sign-in. Supabase includes social login: 50,000 monthly active
  users on Free, 100,000 on Pro, then $0.00325 each. A 300-member gym is nowhere near. **₹0.**
- **Reusing Drive sign-in:** yes, it is the same sign-in with the same client IDs. Ask only for name
  and email at login, and ask for Drive later when the member turns backup on (the library supports
  adding permissions later). One sign-in, one account, two uses.
- **Google review of the app:** not needed. Name, email and the Drive permission we use
  ("only files this app made") are all "non-sensitive", and Google reviews only sensitive ones. An
  optional free "brand check" (a few business days) puts the ForgeAI name and logo on Google's screen.
- **What the owner must do himself (one sitting, about 45 min; it also switches on Drive backup):**
  1. Google Cloud > Google Auth Platform: fill the consent screen (name, support email, privacy
     link, domain aakashpahuja.in). Set it to "In production"; in "Testing" only listed testers get in.
  2. Create a **Web** client ID. It goes into the app and into Supabase.
  3. Create two **Android** client IDs for com.forgeai.app. One uses the SHA-1 of our GitHub release
     key and one the SHA-1 from Play Console > App integrity. (A SHA-1 is the fingerprint of the key
     that signs the app.) Missing either one = sign-in fails on that copy of the app.
  4. Supabase > Authentication > Providers > Google: switch on, paste the client IDs.

## 3. Phone number + OTP instead
- **Supabase** supports phone login and does not charge for it. Built-in senders: Twilio,
  MessageBird, Vonage, Textlocal. WhatsApp only through Twilio. A "Send SMS hook" (on the Free plan)
  lets us use any sender, such as MSG91 (Indian).
- **SMS price:** Twilio is $0.083 (about ₹7) per SMS to India. MSG91 is ₹0.25 per SMS plus 18% GST,
  sold in packs of at least 5,000 (₹1,250).
- **India's DLT rules (TRAI):** DLT is the telecom operators' register of who may send business
  SMS. We must register the business (₹5,900 once, needs business documents), a 6-letter sender
  name, and every message wording. Since Sept 2024 the operators drop SMS whose wording is not
  registered.
- **WhatsApp OTP:** Meta charges per delivered code. India rate is about ₹0.115 (Oct 2026 rate card,
  per a reseller's summary; Meta's own page gives the method, not the number). It must come from a
  WhatsApp Business account registered in India; from abroad it is about ₹2.50. There is no free tier
  for codes. It needs a Meta business account and an approved code template, usually through a
  provider such as MSG91. No DLT needed.
- **Firebase phone login:** not free. Only on its paid plan, billed per SMS. It would also add a
  second login system beside Supabase. Not worth it.
- **Money for a 300-member gym:** about 450 codes a year (first login, new phones, retries), so
  roughly ₹130 by SMS or ₹60 by WhatsApp. The money is small. The paperwork, and bots that trigger
  paid codes (Supabase advises rate limits and a captcha), are the real cost.

## 4. What a login changes
- **Server accounts:** each signed-in member gets an entry in Supabase's user list (name, email,
  photo link, Google ID, last sign-in). Our member record points to it.
- **Gym link, the key fact:** **Google gives us an email, never a phone number.** The gym's list is
  by phone. So Google alone cannot prove "this is Rahul from the list". One more step is needed:
  the desk confirms the member once, or the phone is checked with a code. After that, "My membership"
  can safely show payments and dues. A phone code proves the number but still cannot tell apart two
  members who share it.
- **Workouts:** no change. They stay on the phone, backed up to the member's own Drive. A new phone
  gets simpler: one sign-in restores everything. A ForgeAI cloud copy could come later. It is not
  needed now, and it would mean holding everyone's training history, which adds risk and storage cost.
- **Privacy notice:** add what we get (name, email, photo, or the checked number), why (sign in,
  link the gym), how long we keep it, and how to delete it.
- **Google Play rule:** an app that creates accounts must offer account deletion inside the app
  and on a web page, and declare it in the Data safety form.
- **DPDP Act (India's data law):** the main duties start **13 May 2027**. Then we need: a separate,
  plain consent notice; consent that can be withdrawn at any time; answers to see, correct or
  delete requests within 90 days; telling members quickly after a data leak; and checked parent
  consent for under-18s (our notice already says we delete under-18 data without it). Build these
  into the login screen now.

## 5. Risks and member friction
- **Forcing login:** Hevy and Strong force it, but their users came for a tracker. Ours came
  because the gym said so, and many are not tech-savvy. Common advice is to let people in first and
  ask for an account when it gives them something. Plan: never force. "Use without an account"
  always works, with or without a gym.
- **No Google account:** rare. Every Android phone that installs apps from the Play Store has one.
  If a phone has none, Google's screen offers to add one.
- **Shared family phone:** Google offers the accounts already on the phone, often the son's or the
  husband's. A quick tap links the wrong person. Show "Signed in as Rohit S. Not you? Switch". The
  desk check also catches it. Phone codes have the same problem when a family shares one number.

## Two options

### Option A: "Continue with Google", the desk confirms once (recommended)
- **Members see:** a big "Continue with Google", then "Join with your gym code" right below, then a
  small "Use without an account". Google is pick an account, agree once, done. "My membership"
  shows the plan at once. Money shows after the desk confirms them.
- **Desk confirms:** the desk app asks "Rahul Sharma (rahul.s@gmail.com) wants to link. Is this
  Rahul, 98xxx x1234?" and the desk taps Yes. Or the desk sends a one-time personal link from the
  gym's own WhatsApp (the desk app already opens WhatsApp for invites). Tapping it proves the member
  owns that number, free.
- **Costs:** ₹0 a month. His setup: one Google Cloud sitting (section 2), which also switches on
  Drive backup. Later, maybe $79 a year when Google retires the old kit.
- **Unlocks:** a real account per member; one sign-in for backup and new-phone restore; payments in
  "My membership" once confirmed; later features that need to know who the member is.
- **Risks:** one small chore per new member for the desk; wrong account on shared phones (the desk
  check catches it).

### Option B: phone number + code (WhatsApp first, SMS if that fails)
- **Members see:** type mobile number, get a 6-digit code on WhatsApp or SMS, done. The number
  matches the gym's list by itself, so money shows straight away. This is how cult.fit and FITPASS work.
- **Costs:** about ₹0.12 per WhatsApp code or ₹0.30 per SMS with GST, so ₹60-130 a year for a
  300-member gym. Once: DLT ₹5,900, plus a ₹1,250 SMS pack. His setup takes days: business papers for
  DLT, sender name and wording approval, a Meta business account, a WhatsApp number and an approved
  code template, then keys into Supabase.
- **Unlocks:** automatic gym match with no desk work; works without a Google account.
- **Risks:** paperwork before launch; we pay per login, and bots can run up the bill; changing the
  wording means re-approval; shared family numbers still unsolved; a member who changes number
  needs support; Drive backup still needs a separate Google sign-in.

**Pick: Option A.** It is what the owner asked for, costs nothing per member, and needs no
business paperwork. The same Google sitting also switches on the Drive backup that is already
built. Google cannot prove the phone number, but the desk can confirm it once for free. If that
becomes a chore, phone codes can be added later as a second way in.

## Sources
- Supabase: https://supabase.com/docs/guides/auth/social-login/auth-google · https://supabase.com/docs/guides/auth/phone-login · https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook · https://supabase.com/docs/guides/auth/auth-hooks · https://supabase.com/pricing
- Google and Expo: https://docs.expo.dev/guides/google-authentication/ · https://developer.android.com/identity/sign-in/legacy-gsi-migration · https://developer.android.com/identity/sign-in/credential-manager-siwg · https://support.google.com/cloud/answer/13463073 · https://developers.google.com/workspace/drive/api/guides/api-specific-auth · https://support.google.com/googleplay/android-developer/answer/13327111
- Sign-in library: https://react-native-google-signin.github.io/docs/install · https://react-native-google-signin.github.io/docs/original · https://react-native-google-signin.github.io/docs/one-tap · https://universal-sign-in.com/ · https://www.jsdelivr.com/package/npm/react-native-nitro-google-signin
- Other apps: https://help.hevyapp.com/hc/en-us/articles/34462203494679 (also 34467606455319, 38223672272791) · https://help.strongapp.io/article/143-strong-account · https://help.strongapp.io/article/214-account-issues · https://support.cure.fit/support/solutions/folders/25000031007 · https://fitpass.co.in/sweatiquette-faq/how-can-i-buy-fitpass-subscription · https://fitpass.co.in/sweatiquette-faq/can-i-access-my-fitpass-id-on-multiple-devices
- SMS and WhatsApp: https://www.twilio.com/en-us/sms/pricing/in · https://msg91.com/in/pricing/sms · https://www.infobip.com/docs/essentials/asia-registration/dlt-registration · https://telecomtalk.info/?p=980584 · https://developers.facebook.com/docs/whatsapp/pricing · https://whautomate.com/whatsapp-business-api-pricing-india · https://firebase.google.com/pricing
- Data law: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf · https://www.azbpartners.com/bank/update-indias-digital-personal-data-protection-framework-comes-into-effect/
