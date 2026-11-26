### Two privacy fixes may not be in the Google Play app yet

**How bad:** Serious. Privacy: members may still run an app that keeps data it should not.
**What you would see:** The newest app version, 0.80.0, fixes two privacy faults. First, Delete my account now waits for a copy that is still being sent, so the delete cannot be undone by it. Second, nothing of a member under 18 is saved on MettleUp's server. On 26 Nov Google Play still showed 0.79.0, which has both faults. The release notes leave both fixes out on purpose, so nothing on screen says whether they are live.
**Who it hurts and how often:** Every member, every time, for as long as Google Play gives out 0.79.0. A later check found the app's own news page now says 0.80.0, so this may already be fixed.
**Proof:** Found by reading the code and the public Google Play page. Open Google Play Console and read which version is live in production: if it is 0.79.0, both faults are still with members.
**Fix:** Make sure 0.80.0 is live on Google Play, then re-check both faults on a phone. Size: small.
**Your decision:** Yes. My view: confirm in Google Play Console which version is live; if it is still 0.79.0, release 0.80.0 soon, because both are privacy faults. Option 1: release 0.80.0 now. Option 2: wait for the next planned release and accept the gap.
Finding: FN-H5-phone-cloud-backup-ai-01

### Under-18 members who saved before the fix stay on the server

**How bad:** Serious. Privacy: children's data is kept against our own privacy notice.
**What you would see:** The new under-18 rule only stops new saving. A member aged 10 to 17 who signed in before the fix already has their age, body weight and workouts on MettleUp's server. After the update nothing removes that copy. It goes only if the member presses Delete my account, while the privacy notice says such data is deleted once MettleUp learns the member is under 18, and the phone does learn it.
**Who it hurts and how often:** Members under 18 who signed in before the fix. Few people, but their copy stays for ever.
**Proof:** Found by reading the code. Sign in as an under-18 member on the old app, save a workout, update the app, and the server copy is still there.
**Fix:** When the phone sees an under-18 profile, delete the server copy once and tell the member their workouts now stay on this phone only. Size: small.
**Your decision:** Yes. My view: delete the old copy and show the one-line note; this is what our notice already promises. Option 1: delete once and tell the member. Option 2: delete quietly with no message.
Finding: FN-B-time-phone-cloud-backup-ai-02

### Spoken AI Assistant requests may go to an unnamed company

**How bad:** Serious. Privacy: member names and amounts can reach a company we never told anyone about.
**What you would see:** When an owner speaks to the AI Assistant, the recording goes first to Sarvam, an Indian speech-to-text company, whenever a Sarvam key is saved on our server. Groq is only the second choice. The privacy notice, in English and Hindi, says spoken requests go to Groq and never names Sarvam. A spoken request can hold member names, amounts and other gym details.
**Who it hurts and how often:** Gym owners who speak to the AI Assistant, and the members they name. Every spoken request, but only while a Sarvam key is saved on the live server; nobody could check that from the code.
**Proof:** Found by reading the code. Check whether a Sarvam key is saved on the live server; if it is, every spoken request goes to Sarvam first.
**Fix:** Add Sarvam to the privacy notice in both languages and in the list of outside companies, or drop Sarvam and use Groq only. Size: small.
**Your decision:** Yes. My view: use Groq only until the notice is updated, because a privacy notice must name every company first. Option 1: add Sarvam to the notice and keep it. Option 2: drop Sarvam and use Groq only.
Finding: FN-L4-server-panel-worker-01

### A real gym whose name starts with "QA " is deleted overnight

**How bad:** Serious. Data lost: a whole gym, with its members and money records, disappears without warning.
**What you would see:** Every night MettleUp clears out the test gyms made by the phone tests. It picks them only by name: any gym whose name starts with capital QA and a space, and is more than a day old, is deleted with all its members and payments. Nothing stops a real owner from naming a gym that way, for example "QA Fitness".
**Who it hurts and how often:** Gym owners. Rare: only a gym whose name starts with "QA " and a space. When it happens, the loss is total and silent.
**Proof:** Found by reading the code. Make a gym called "QA Test Gym", wait two nights, and it is gone.
**Fix:** Mark test gyms as test gyms when they are made, and delete only marked ones. Size: medium.
**Your decision:** Yes. My view: mark test gyms when they are made, because a name is never a safe way to pick what to delete. Option 1: mark test gyms and delete only those. Option 2: as a quick stop-gap, refuse new gym names starting with "QA ".
Finding: FN-A5-server-database-3-1-01

### Whoever gets an owner's old mobile number can take over the gym

**How bad:** Serious. Privacy and trust: a stranger can sign in as the owner and see every member and payment.
**What you would see:** Forgot PIN sets a new PIN for every owner or staff login with the mobile number a WhatsApp code was sent to. A person's sign-in number can never be changed, so an owner who moves to a new number keeps the old one on file. Indian phone companies give unused numbers to new customers after a few months. The new holder can ask for a Forgot PIN code, set a PIN and sign in as the owner, with every member's name, phone and payments.
**Who it hurts and how often:** Owners and staff who change their mobile number. Rare: only after the old number is given to someone new. When it happens, the whole gym is open to a stranger.
**Proof:** Found by reading the code. With an owner's old number on a new SIM, tap Forgot PIN, enter the WhatsApp code, set a PIN, and the owner's gym opens.
**Fix:** Let people change their sign-in number, and ask for a second check on Forgot PIN for a login nobody has used for months. Size: medium.
**Your decision:** Yes. My view: do both, because changing the number alone does not help an owner who forgets to. Option 1: both changes. Option 2: only let people change their number, and remind owners to do it.
Finding: FN-B-time-server-database-2-03

### A workout in progress can be lost silently when the app reopens

**How bad:** Serious. Data lost: a member's workout disappears with no message.
**What you would see:** When the app opens, it reads back the workout that was still going. If that read fails for any reason, the app quietly treats it as no workout and shows nothing. If the member then starts a new workout, the saved one is written over and is gone. The app keeps no note of why, so MettleUp never hears about it.
**Who it hurts and how often:** Members. Rare: only when the phone fails to read the saved workout back.
**Proof:** Found by reading the code. It cannot be shown with normal taps; it needs the phone's read of the saved workout to fail at start-up.
**Fix:** Try the read again, keep the saved workout until it is read, tell the member if it still fails, and send a note of why to MettleUp. Size: small.
**Your decision:** No.
Finding: FN-B-run-phone-tracker-data-a-01; also FN-L16-phone-tracker-data-01

### Privacy notice says photos never leave the phone; photo backup copies them

**How bad:** Serious. Trust: our privacy notice says something untrue about progress photos.
**What you would see:** In the member app, the setting "Include photos in my backup" copies the newest progress photos into the member's own Google account backup. The privacy notice says the photos never leave the phone. MettleUp itself never gets the photos, and the setting's own caption says so, so this is a wrong sentence, not a leak to MettleUp.
**Who it hurts and how often:** Members who turn on photo backup, every time it runs.
**Proof:** Found by reading the code. Turn on "Include photos in my backup", then read the privacy notice: it says the photos never leave the phone.
**Fix:** Add one line to the privacy notice: photos stay on the phone unless the member turns on photo backup, which copies them to their own Google account. Size: small.
**Your decision:** Yes. My view: add the one line; the setting is useful and only the wording is wrong. Option 1: add the line to the notice. Option 2: remove the photo backup setting.
Finding: FN-A5-phone-screens-2-1b-01

### A member's mobile number stays with the gym after they leave

**How bad:** Serious. Privacy: a number the member gave stays on file after they leave, against what we promise.
**What you would see:** When a member types a mobile number at check-in, it waits for the desk to confirm. If the member then leaves the gym in the app, the number is cleared from their app record but stays in that waiting request. The owner and front desk still see the request with the number. Approved or declined requests also keep the number with no clean-up.
**Who it hurts and how often:** Members who typed a number and then left, every time. The number stays only with the same gym they gave it to.
**Proof:** Found by reading the code. As a member, type a number at check-in, leave the gym in the app, then open the desk's waiting requests: the number is still there.
**Fix:** When a member leaves, clear every number request they made, waiting or done, as the delete-account page promises. Size: small.
**Your decision:** No.
Finding: FN-A5-server-database-1-2-01

### HQ can open a gym's records without the owner saying yes

**How bad:** Serious. Trust: the owner's screen promises MettleUp looks only when the gym lets it.
**What you would see:** HQ has an "Open in an emergency" button. It opens read-only access to a gym's members, payments and staff without the gym asking. The gym owner's own screen says MettleUp support can look only when the gym lets them. The use is recorded, and the privacy notice does mention it, but the owner's screen does not.
**Who it hurts and how often:** Gym owners and their members, every time HQ presses the emergency button. Nobody checked the pilot agreement's wording yet.
**Proof:** Found by reading the code. In HQ, press "Open in an emergency" on a gym; access opens with no request from the owner.
**Fix:** Make the owner's screen and the emergency button say the same thing. Size: small.
**Your decision:** Yes. My view: keep the button, but change the owner's screen and the pilot agreement to say MettleUp may open it in an emergency, and tell the owner each time with the reason. Option 1: keep the button and change the words. Option 2: remove the emergency button.
Finding: FN-A5-server-hq-gate-workers-3-01

### A member back after 3 months loses workouts over name spelling

**How bad:** Serious. Data lost: old workouts can no longer be reached from the app.
**What you would see:** The phone-number backup finds a member's saved workouts by their number. If that account was not used for 90 days, it opens only if the first name typed now matches the old one exactly ("Rahul" and "rahul" match). "Raahul", "Dr. Rahul" or a Hindi spelling does not match: the server quietly makes a new, empty account. The member sees "0 workouts brought back", and every later sign-in opens the empty account. Nothing near the name box says the name must match.
**Who it hurts and how often:** Members who return after 3 months on a new or reset phone and type their first name differently, every time. The old copy still sits on the server, so support could recover it.
**Proof:** Found by reading the code. Sign in by phone as "Rahul", save workouts, leave it unused for 90 days, then sign in on a new phone as "Raahul": 0 workouts come back.
**Fix:** Before making a new account, ask once more for the first name used before, and say why. Size: medium.
**Your decision:** Yes. My view: ask once more with a clear reason, because gym members often come back after a break. Option 1: ask again before making a new account. Option 2: keep it as it is and let support recover old workouts on request.
Finding: FN-B-switch-phone-cloud-backup-ai-02

### Undo after a restore or import does not stick for signed-in members

**How bad:** Serious. Trust: the app says the phone is back to how it was, but it is not.
**What you would see:** A member signed in to MettleUp restores a backup file, or brings in workouts from Hevy or Strong. The screen offers Undo, also in Settings for 24 hours, and promises everything goes back as it was. About 8 seconds after the restore or import, the app has already copied the new workouts to the member's MettleUp account. When the member taps Undo, the phone is put back, then the app brings back from the account the very workouts that were undone. The member ends with the old and new workouts mixed.
**Who it hurts and how often:** Members signed in to MettleUp who restore a backup or import from Hevy or Strong and then tap Undo. Every Undo made more than about 8 seconds later while online.
**Proof:** Found by reading the code. Sign in, import from Hevy with Replace, wait 10 seconds online, tap Undo: the imported workouts reappear.
**Fix:** Pause the background copy while Undo is possible, or make Undo also remove the restored or imported workouts from the account. Size: medium.
**Your decision:** No.
Finding: FN-B-truth-phone-cloud-backup-ai-a-01; also FN-B-truth-phone-screens-1-a-01

### Members cannot find the privacy contact in the app after joining

**How bad:** Serious. Trust and legal: we promised a data complaints contact in both apps.
**What you would see:** The launch plan put the named contact for data complaints in the privacy notice and in both apps. In the member app, the privacy notice is linked only inside the tick box shown once at sign-in or when joining a gym. Settings and About show only credits and the app version: no privacy notice, no terms, no contact. A member who wants to complain about their data later has nowhere in the app to find who to write to.
**Who it hurts and how often:** Every member, every time they look for the privacy notice or the contact.
**Proof:** Found by reading the code. Open the member app, go to Settings, then About: there is no privacy notice and no contact.
**Fix:** Add a "Privacy and terms" row to the member app's About page that shows the contact's name and address. Size: small.
**Your decision:** No.
Finding: FN-A3-inbox-4-06

### Member website still promises backup to your own Google Drive

**How bad:** Serious. Trust: the website promises a backup the app stopped making.
**What you would see:** The member website says in two places, in English and Hindi, that the app backs up to the member's own Google Drive and brings it all back on a new phone. The app stopped making Google Drive backups on 4 Nov 2026. Backups now go to a MettleUp account on MettleUp's server; Drive is only used to bring back an old backup. No workouts are lost, but the promise is wrong.
**Who it hurts and how often:** Every visitor of the member website, and new members who look for the Drive backup, every time.
**Proof:** Found by reading the code. Open the member website and read the backup lines, then look for a Drive backup in the app: there is none.
**Fix:** Change the two Google Drive lines, English and Hindi, to say the backup goes to a MettleUp account. Size: small.
**Your decision:** Yes. My view: change the website words, because the MettleUp account backup is the one we want people to use. Option 1: change the words. Option 2: bring Drive backup back.
Finding: FN-A3-website-2-01

### Start-up error screen tells members to send private data to the gym

**How bad:** Serious. Privacy: the gym would get body weight and notes we promise it never sees.
**What you would see:** When the app cannot start, a screen offers "Save my data file". That file holds all the member's phone data: workouts, body weight, notes, profile and mobile number. The line under the button says to send the file to the gym, who passes it on to MettleUp. Elsewhere the app promises the gym never gets body weight, photos or notes.
**Who it hurts and how often:** Members whose app cannot start, every time they follow that line.
**Proof:** Found by reading the code. Read the help line under "Save my data file" on the start-up error screen: it says to send the file to the gym.
**Fix:** Change the line to send the file straight to MettleUp support, and say the file holds private data. Size: small.
**Your decision:** Yes. My view: point it to MettleUp support only; a member's private data should never pass through the gym. Option 1: MettleUp support only. Option 2: keep the gym route but warn that the file is private.
Finding: FN-A5-phone-onboarding-db-1-01

### A member's progress summary is saved again after they leave the gym

**How bad:** Serious. Privacy: we keep data the privacy notice says is deleted when a member leaves.
**What you would see:** When a member leaves a gym, the progress summary they shared with trainers is deleted at once. But the member's app may still have sharing on and send the summary again, and the server takes it without checking that the member left. Nobody at the gym can see it, but it stays on MettleUp's server for up to 90 days. Sharing with gym mates already refuses members who left.
**Who it hurts and how often:** Members who leave a gym with sharing still on, every time their app sends after leaving.
**Proof:** Found by reading the code. With trainer sharing on, leave the gym in the app, then do a workout: a new summary is stored for a gym the member left.
**Fix:** Refuse summaries from members who have left, as gym-mate sharing already does. Size: small.
**Your decision:** No.
Finding: FN-A5-server-database-2-2-01

### "Send to their app" says Sent when the member gets nothing

**How bad:** Serious. Money: the desk waits for a payment that was never asked for.
**What you would see:** On Collect payment, the desk can press "Send to their app" for any member. It always answers "Sent. They see it under My membership in the MettleUp app." The please-pay pop-up only reaches a member who joined the app with the same mobile as on the gym list, has not left, shares that number with no other active member, and allows notifications. For everyone else nothing arrives. At Crispy Curves, at the last count, 0 of 2 members were linked to the app.
**Who it hurts and how often:** Front desk and members, every time the member is not on the app.
**Proof:** Found by reading the code. At Crispy Curves, open Collect payment for a member not on the app and press "Send to their app": it says Sent, and the member's phone gets nothing.
**Fix:** Show on the sheet whether this member can get the app pop-up, say Sent only when they can, and offer the QR or a WhatsApp link otherwise. Size: small.
**Your decision:** No.
Finding: FN-B-alerts-panel-forms-a-01

### Members are told only in Settings when their workout backup stops

**How bad:** Serious. Data lost: a member can lose weeks of workouts with their phone.
**What you would see:** If a member's MettleUp sign-in runs out, or their saved copy is full, the backup stops and the workouts stay only on the phone. The app writes one line on the account card in Settings and nowhere else. There is no pop-up, no banner on the Workout tab and no note after a workout. A member who never opens Settings keeps training believing everything is saved.
**Who it hurts and how often:** Members signed in to MettleUp, every time a sign-in runs out or the copy fills up.
**Proof:** Found by reading the code. Let a member's sign-in run out, save a workout, and look anywhere but Settings: nothing says the backup stopped.
**Fix:** After a member saves a workout while the backup is stopped, show a short note with a "Sign in again" button. Size: small.
**Your decision:** No.
Finding: FN-B-alerts-phone-cloud-backup-ai-a-01

### Changing plans on the assistant's add-member card keeps the old joining fee

**How bad:** Serious. Money: a member can be saved owing the wrong joining fee.
**What you would see:** When an owner asks the AI Assistant to add a member, a card fills in the plan's price and joining fee. If the owner picks a different plan on the card, only the price changes; the joining fee stays at the first plan's amount. If the assistant found no plan and the owner picks one, the joining fee stays at zero. The card shows one total with no fee line, so the owner cannot spot it.
**Who it hurts and how often:** Owners and members, every time the plan is changed on that card.
**Proof:** Found by reading the code. Ask the AI Assistant to add a member, switch to a plan with a different joining fee, save, and the old fee is kept.
**Fix:** When the plan changes on the card, set that plan's joining fee too, as the normal Add member screen does. Size: small.
**Your decision:** Yes. My view: fix it to match Add member, and show the joining fee as its own line on the card. Option 1: fix the fee only. Option 2: fix the fee and show a fee line.
Finding: FN-B-run-panel-assistant-b-02

### Websites say data stays in India, but a nightly copy may not

**How bad:** Serious. Trust and legal: a promise to owners and members about where data lives may be untrue.
**What you would see:** The gym-owner website says "Your member data is stored in India" and "Data kept in India (Mumbai)". The short notice gyms copy for their members says MettleUp has servers in Mumbai, India. But every night a full, readable copy of the gym data is kept with Cloudflare for 7 days. Our own privacy notice lists Cloudflare's location as "many countries, including India". The website's own small store of payment records and form questions is not set to India either.
**Who it hurts and how often:** Gym owners and their members. Every time someone reads the page; the copy is made every night.
**Proof:** Found by reading the code. Read the gym-owner website's India lines, then the Cloudflare row in our privacy notice: they do not agree.
**Fix:** Either say plainly that a backup copy is kept with Cloudflare, which may store it outside India, or keep the backup in an India-only store. Size: small.
**Your decision:** Yes. My view: keep the backup in an India-only store, because "kept in India" is a strong selling point for gym owners. Option 1: move the backup to India. Option 2: change the words to name the Cloudflare copy.
Finding: FN-B-words-web-pages-01

### Phone-number backup is marked released, but members may not have it

**How bad:** Serious. Data lost and trust: members may think their workouts are backed up when they are not.
**What you would see:** The newest "What's new" note says that from 25 Nov, phone-number sign-in also keeps your workouts safe. The server half is live, but on 26 Nov Google Play, the app's news file and the newest GitHub release all still showed version 0.79.0, which does not have it. Phone number is the main way members sign in. On that version, members who signed in by phone have no copy of their workouts on MettleUp's server and lose them with the phone.
**Who it hurts and how often:** Members who sign in by phone number, every time, while Google Play gives out 0.79.0. A check on 27 Nov found the app's news page now says 0.80.0, so this may already be fixed.
**Proof:** Found by reading the code and the public Google Play page. Open Google Play Console and read which version is live in production: if it is 0.79.0, the backup is not with members.
**Fix:** Make sure 0.80.0 is live on Google Play, or mark the 25 Nov note as waiting for release. Size: small.
**Your decision:** Yes. My view: check Google Play Console first; if it is still 0.79.0, release 0.80.0, because members are told they are safe when they are not. Option 1: release 0.80.0. Option 2: change the note to "coming soon" until you release.
Finding: FN-H5-phone-components-2-01
