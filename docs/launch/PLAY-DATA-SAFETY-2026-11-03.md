# Play: Data safety, description line and account deletion (draft, 3 Nov 2026)

**Status: DRAFT. Nothing here is submitted. All wording needs the owner's yes** (privacy and store wording are his
call). Source: launch audit ops #7. Facts checked against the privacy notice (`apps/dashboard/public/privacy.html`),
migrations 0032 (members' saved workouts), 0035 (trainer measurements), 0050 (trainers' weekly summary), 0038 (push),
and the app's account screens (`apps/mobile/src/cloud/accountWords.ts`).

Already on Play (30 Oct 2026, from the notes): Voice or sound recordings (collected, not kept, optional, App
functionality) and Crash logs + Diagnostics (collected, kept, required, Analytics). The rest of the form as submitted on
24 Oct was "exactly as the privacy notice says" at that time, before members could save workouts on our server.

## 1. Data safety form: what to add or confirm

Play: App content -> Data safety -> Edit. Overview answers:
- Does your app collect or share any of the required user data types? **Yes**.
- Is all user data encrypted in transit? **Yes** (HTTPS everywhere).
- Which ways can users request data deletion? **Both**: in the app, and the web link below.
- Account creation: **Yes, with OAuth (Sign in with Google)**. Delete-account URL: **https://mettleup.fit/delete-account**
  (the page in section 3; it must be deployed before this is saved, or Play rejects the link).

Data types (new or changed rows in **bold**):

| Data type (Play's name) | Collected | Shared | Kept | Optional? | Purposes | Why it is true |
|---|---|---|---|---|---|---|
| **Personal info -> Email address** | Yes | No | Yes, until account deleted | Optional | App functionality, Account management | Google sign-in gives us the email |
| **Personal info -> Name** | Yes | No | Yes | Optional | App functionality, Account management | Google name; the name a member types when joining a gym |
| Personal info -> Phone number | Yes | No | Until they leave the gym | Optional | App functionality | Joining a gym (confirm it is already listed) |
| **Personal info -> User IDs** | Yes | No | Yes | Optional | App functionality, Account management | The MettleUp account id |
| **Health and fitness -> Fitness info** | Yes | **Yes (see note A)** | Yes, until deleted | Optional | App functionality | Saved workouts, sets, routines, body weight and measurements (0032); trainers' weekly summary (0050); trainer-taken measurements (0035) |
| Photos and videos -> Photos | **No** | No | - | - | - | Progress photos never leave the phone; only their dates are saved (count the dates under Fitness info) |
| **Messages -> Other in-app messages** | Yes | No | As long as the gym keeps records | Optional | App functionality | Messages with the gym's desk (confirm it is listed) |
| **Financial info -> Purchase history** | Yes | No | As long as the gym keeps records | Optional | App functionality | Shop orders from the gym (paid at the desk; no card data). Confirm it is listed |
| **Device or other IDs** | Yes | No | Until they leave the gym or turn pop-ups off | Optional | App functionality | The phone's push address for the gym's pop-ups (0038) |
| App activity -> Other user-generated content | Yes | No | 1 year | Optional | App functionality | Feedback and help questions (confirm it is listed) |
| Audio -> Voice or sound recordings | Yes | No | Not kept | Optional | App functionality | Already on Play (30 Oct) |
| App info and performance -> Crash logs, Diagnostics | Yes | No | 90 days | Required | Analytics | Already on Play (30 Oct) |

**Note A, "shared" for Fitness info.** Play counts sending data to a third party as sharing, unless the user starts it
and expects it. The trainers' weekly summary goes to the member's gym, which is a separate business, and it is ON by
default (an off switch in the app). Declaring "shared" is the safe answer; declaring more than needed is allowed,
declaring less is a policy breach. **Owner decides** (recommended: Yes, shared, purpose App functionality).

Service providers (Supabase, Cloudflare, Google sign-in, Groq, Anthropic) are NOT "sharing" in Play's terms: they
process data for us.

## 2. The Play description line

`branding/mettleup/store/listing-draft.txt`, line FULL5 (not changed in the file; the play-listing workflow would push it):

- Now: "Works without internet: no signal in the gym, no problem. Your workouts stay on your phone."
- **Proposed:** "Works without internet: no signal in the gym, no problem. Sign in with Google to save your workouts on MettleUp, so they come back on a new phone."

When he says yes: change FULL5, then run the "Play store listing" workflow with the description option.

## 3. Account-deletion web page

Written, not deployed: `apps/dashboard/public/delete-account.html`. Address after the next admin-site deploy:
https://mettleup.fit/delete-account (and app.mettleup.fit/delete-account.html; `deploy/panel/hosts.js` keeps the path on
both sites). It says: who has an account, the steps in the app (Settings -> Backup -> "Delete my account" -> "Delete
account"), the email route (contact@mettleup.fit, within 30 days), what is deleted, and what is kept and for how long.
UAT pictures: CI artifact "dashboard-uat-pictures" (`apps/dashboard/e2e/gyms-site-uat.spec.mjs`).

## 4. Other words that are now wrong (found while checking; owner's yes needed)

1. **Terms, point 7** ("Your workouts stay on your phone, so keep your phone backed up") and **point 9** ("not liable ... for
   workout data kept only on your phone"): true only for members who never sign in. Proposed 7: "Your data. See the privacy
   notice. If you do not sign in, your workouts are only on your phone, so keep your phone backed up."
2. **Privacy notice, trainers' weekly summary (F109, live since 0.70.0):** the notice does not list it. A row is needed:
   what (weekly workout count, kg lifted, top 5 exercises, new records, last workout date; never body weight, photos,
   notes or food), who sees it (the gym's trainers and owner), how long (replaced weekly; deleted at once when the member
   turns off "Share my workouts with my trainers" or leaves the gym; after 90 days without an update).
3. **Privacy notice, backups, ONLY when the nightly backup is switched on** (docs/BACKUP-RESTORE.md): "Backup copies at our
   provider expire within 7 more days" becomes "within 15 more days", and Cloudflare must be named as also **keeping** a
   nightly backup copy of the gym data and saved workouts (today it is named only as passing requests on). Change the
   notice before or with the switch-on, never after.
