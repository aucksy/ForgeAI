# MettleUp audit report

Finished 27 Nov 2026. Analysis only: nothing in the apps was changed.

## Summary

**Findings:** 2463 problems found, 479 confirmed, 4 could not be confirmed (1980 small ones were not re-checked one by one; 42 more findings were checked and turned out wrong, so they are left out).

**Report cards:** 180 problems get a full card: 141 Serious and 39 Medium. 89 of them need your decision. Every other problem (2283) is one line, grouped by app part. 336 improvement ideas are on a second list.

**Blind check:** the audit found 1 of your 7 own problems, partly found 2, and missed 4 (29%). It is strong at promises against what the app does (privacy, payments, words, missing tests). It is weak at wrong training numbers, how the main workout screen looks, and taps that stopped working after a change.

**Change 360 check:** its questions, asked before a build, would clearly have caught about half of the serious problems (69 of 141). The biggest gaps: nobody re-reads old promises, nobody asks where a person's data goes when they leave, and "built" is not the same as "in members' hands".

### The 5 that matter most

1. **Two privacy fixes may not be in the Google Play app yet.** The newest app version, 0.80.0, fixes two privacy faults.
2. **Under-18 members who saved before the fix stay on the server.** The new under-18 rule only stops new saving.
3. **Spoken AI Assistant requests may go to an unnamed company.** When an owner speaks to the AI Assistant, the recording goes first to Sarvam, an Indian speech-to-text company, whenever a Sarvam key is saved on our server.
4. **A real gym whose name starts with "QA " is deleted overnight.** Every night MettleUp clears out the test gyms made by the phone tests.
5. **Whoever gets an owner's old mobile number can take over the gym.** Forgot PIN sets a new PIN for every owner or staff login with the mobile number a WhatsApp code was sent to.

## Serious problems (141)

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

### Outage alarm checks every 6 hours or so, not every 10 minutes

**How bad:** Serious. Trust: an outage of the gym panel can run for hours before anyone hears of it.
**What you would see:** The alarm that should warn you when the website, the gym panel, HQ or the gym server stops answering is set to run every 10 minutes, and our notes say it does. In real life GitHub starts it only about 4 times a day. Over 17 to 26 November the checks were 4 to almost 12 hours apart, 7.5 hours in the middle case. If the gym panel goes down in the evening rush, desks and members can be stuck for hours before you are told.
**Who it hurts and how often:** Owners, desk staff and members during any outage, and you, every day.
**Proof:** Found by reading the code and the record of the last 30 alarm runs. Open the alarm's run history on GitHub and look at the times: the runs are hours apart, not 10 minutes.
**Fix:** Run the check from a timer that really fires every few minutes (our HQ server's every-minute timer, or a free uptime service) and keep GitHub only as a backup. Size: medium.
**Your decision:** No.
Finding: FN-H5-server-ci-workflows-01

### Desk can add a child member, though our notice says no under-18s

**How bad:** Serious. Privacy and legal: India's data law asks for a parent's yes before a child's data is handled.
**What you would see:** On Add member, the desk can type any birthday that is a real day and not in the future. So a 12 or 15 year old can be added with a desk photo, mobile, address and emergency contact. Nothing warns the desk, asks for a parent's yes, or marks the member as a child. These records sit on MettleUp's server, while the privacy notice says MettleUp is only for people 18 or over and deletes under-18 data once known.
**Who it hurts and how often:** Gyms with members under 18, and those members' parents, every time the desk adds someone under 18. The gym, not MettleUp, is in charge of these records, so this is a gap in the notice and the joining step, not misuse by MettleUp.
**Proof:** Found by reading the code. On Add member, enter a birthday 14 years ago and save: the member is added with no warning or parent step.
**Fix:** When a birthday shows under 18, ask the desk to record a parent's yes, and make the notice's under-18 line say whether it covers the gym's own records. Size: medium.
**Your decision:** Yes. My view: add the parent's-yes step and name gym records of children in the notice, since many gyms train teenagers. Option 1: parent's-yes step plus notice change. Option 2: only change the notice to say the under-18 line covers the member app, not gym records.
Finding: FN-L4-panel-forms-01

### Turning the shop off leaves members' names and orders on our server

**How bad:** Serious. Privacy: member names and orders stay on our server for ever, with no way to delete them.
**What you would see:** A gym kept only in the browser can turn on the shop. That creates a real gym on MettleUp's server with a gym code, and members join it with their name and place shop orders. When the owner taps Disconnect the shop, or Start over on a demo gym, only this browser forgets the gym. The gym, its members and their orders stay on our server, and the screen does not say so. The owner has no button left to delete them, because Delete the gym only shows for gyms that are online.
**Who it hurts and how often:** Members of a browser-only gym that turned the shop on, and its owner, every time the owner disconnects the shop or starts a demo over. The nightly clean-up only removes our own test gyms, so nothing removes these later.
**Proof:** Found by reading the code. On a browser-only gym, turn the shop on, join it as a member and order something, then tap Disconnect the shop: the gym and order are still on our server.
**Fix:** When the shop is turned off, delete the gym's server copy, or tell the owner it stays and give a way to delete it; clean up abandoned demo gyms too. Size: medium.
**Your decision:** Yes. My view: delete the server copy when the shop is turned off, because the privacy notice promises deletion when a gym leaves. Option 1: delete it, after a clear warning on screen. Option 2: keep it, tell the owner it stays, and add a delete button.
Finding: FN-L4-panel-screens-2-01

### Under a hundred open gym panels can use up everyone's daily limit

**How bad:** Serious. Trust: when the limit is hit, every gym panel and member app stops answering until the day resets.
**What you would see:** While the gym panel is on screen, its Needs you check asks the server once a minute, and its other lists every five minutes. A desk that keeps the panel open for a 16-hour day makes over a thousand requests. The free Cloudflare plan allows 100,000 a day for all gyms together. So about 80 to 90 such desks fill it, and then every gym and member is locked out for the rest of the day.
**Who it hurts and how often:** All gyms and members, every day once about 80 desks keep the panel open. Not today at the current number of gyms.
**Proof:** Found by reading the code. Keep one gym panel open for a full day and count its requests in the Cloudflare dashboard: it passes a thousand.
**Fix:** Slow the minute check or have the server push alerts to the panel, and decide when to move to a paid plan before growth reaches the limit. Size: medium.
**Your decision:** Yes. My view: slow the check now (cheap) and set a point, say 50 active gyms, to move to the paid Cloudflare plan. Option 1: slow the check and plan the paid move. Option 2: move to the paid plan now and leave the check as it is.
Finding: FN-L8-panel-logic-2-01

### Owner's screen says support needs permission, but MettleUp can look alone

**How bad:** Serious. Trust and privacy wording: the owner's own screen promises more than is true.
**What you would see:** The owner's MettleUp access card and the Settings page say MettleUp support can look at the gym's records only when the owner lets them. But MettleUp also has an emergency door. It opens member names, mobiles, receipts and staff for up to an hour without asking the owner.
**Who it hurts and how often:** Gym owners, every time an owner reads the card. Softened: the emergency door only reads, closes after 60 minutes, is logged and shown to the owner, and the privacy page already mentions it. Only the owner's screens leave it out.
**Proof:** Found by reading the code. Open Settings in the gym panel and read the MettleUp access words, then compare with the privacy page's line about emergency access.
**Fix:** Add one line about emergency access to the owner's words on both screens. Size: small.
**Your decision:** Yes. My view: add the line, because the door is useful and the privacy page already admits it. Option 1: add the emergency line to both screens. Option 2: make the emergency door ask the owner first.
Finding: FN-A5-server-database-1-3-01

### AI counts a member who renewed today as "not seen for months"

**How bad:** Serious. Trust: the owner may send "we miss you" to someone who paid today.
**What you would see:** The owner asks the AI Assistant who has not come for 10 days, or taps the "Not seen for 10+ days" idea. A member who came back today after two months off is listed as "no visit in 60 days". The count starts from the last visit before the break, not from the new plan. The owner taps See all and gets the Losing the habit list, which leaves that member out, and also leaves out members whose plan ends within 7 days, whom the AI count keeps. One number on the AI card, a different list one tap later.
**Who it hurts and how often:** Owners, whenever a member comes back after a break of more than 10 days. Two days after rejoining, a member can show as "no visit in 190 days".
**Proof:** Found by reading the code. Take a member whose last visit was two months ago, renew their plan today, then ask the AI Assistant who has not come for 10 days: they are on the list.
**Fix:** Count days away from the start of the new plan when that is later than the last visit, and make See all show the same group. Size: small.
**Your decision:** No.
Finding: FN-B-truth-panel-logic-1-b-01; also FN-B-truth-panel-assistant-b-02

### Help's "Your questions" shows one person's questions to the next person

**How bad:** Serious. Privacy: staff, or even another gym, can read the owner's questions and MettleUp's replies.
**What you would see:** In Help, the "Your questions" list keeps every question, the AI's answers and MettleUp's replies on that computer, not per person or per gym. Signing out does not clear it. On a shared desk computer, staff see what the owner asked. The owner's "delete our gym" request, with the gym's name, code and phone, shows in the same list. A different gym signing in on that computer sees it too.
**Who it hurts and how often:** Owners and staff who share a computer, every time two people use the same browser.
**Proof:** Found by reading the code. Sign in as the owner, send a Help question, sign out, sign in as a staff member on the same computer, and open Help: the owner's question is there.
**Fix:** Keep the list per gym and per person, and hide it at sign-out. Size: small.
**Your decision:** No.
Finding: FN-A5-panel-logic-1-3-03

### Owners can add a door machine, but it never comes online

**How bad:** Serious. Trust and money: an owner may buy a machine that cannot work, and nothing says why.
**What you would see:** In Settings, Entry machines is open to every gym. The owner adds a finger or face machine by serial number and is told to set the machine's server address to gate.mettleup.fit, with "It shows Online within a minute". That address does not exist: the door service was never put live. The machine stays "not seen yet" for good and lets no member in. The "not ready for your gym yet" message never shows, because it only appears in a case that no longer happens.
**Who it hurts and how often:** Gym owners who buy or own an eSSL or ZKTeco door machine, every time they add one.
**Proof:** Found by reading the code, and the address was looked up on 27 Nov: it does not exist. In Settings, Entry machines, add any serial number: it never turns Online.
**Fix:** Show "coming soon" and hide the add button until the door service is live, or put the door service live first. Size: small.
**Your decision:** Yes. My view: hide adding a machine now and show "coming soon", so no owner buys a machine on a false promise. Option 1: hide it until the door service is live. Option 2: put the door service live first, then keep the screen open.
Finding: FN-H5-panel-pay-machines-01

### An owner who paid by UPI or bank cannot see the receipt

**How bad:** Serious. Money and trust: an owner who paid has no receipt to show their accountant.
**What you would see:** When MettleUp confirms an owner's UPI or bank payment, the server makes a numbered receipt. The only list that shows receipts sits inside the Pay online part of the Pay MettleUp screen. Online paying is switched off, so that part loads nothing. The owner sees Confirmed and the paid-until date, but no receipt anywhere. The receipt page itself says to open it from Your receipts, which the owner cannot see.
**Who it hurts and how often:** Every owner who pays by UPI or bank transfer, every time.
**Proof:** Found by reading the code. Confirm a UPI payment for a gym in HQ, then open Pay MettleUp in that gym's panel: there is no receipt list.
**Fix:** Show the gym's receipts on Pay MettleUp even while online paying is off. Size: small.
**Your decision:** No.
Finding: FN-L5-panel-screens-2-01

### No test checks that voice feedback keeps the microphone private

**How bad:** Serious. Privacy: a later change could record before the member taps Speak, and no test would catch it.
**What you would see:** Nothing on screen is wrong today. Members can speak their feedback from the floating sheet or the Settings page. The app records only after Speak and deletes the clip after sending. But no test checks that the microphone starts only after Speak, that the clip is removed from the phone after sending, or that the words stay in the box until Send. The Settings page version has no test at all.
**Who it hurts and how often:** Members, at risk with every new release. The app works correctly today, and the clip lives only briefly on the phone.
**Proof:** Found by reading the code and its tests: the tests cover only the typed text, the clock and the upload.
**Fix:** Add tests that fail if recording starts before Speak, the clip is left behind, or words are sent before Send, on both screens. Size: medium.
**Your decision:** No.
Finding: FN-A8-phone-lib-core-1-01

### No test checks that Health Connect weight, steps and sleep stay private

**How bad:** Serious. Privacy: a later change could send them out, and every test would still pass.
**What you would see:** Nothing on screen is wrong today. The app promises that body weight, steps and sleep read from Health Connect never leave the phone. But no test checks that they stay out of what is sent to the gym, a trainer, our server or the AI, or that sleep stays out of muscle readiness.
**Who it hurts and how often:** Members who link Health Connect, at risk with every new release.
**Proof:** Found by reading the tests: they check only reading from Health Connect and the switches; the nearest check covers the trainer summary's weight, with no Health Connect data and nothing for steps or sleep.
**Fix:** Add one test that fails if any weight, step or sleep value from Health Connect is in anything the app sends. Size: small.
**Your decision:** No.
Finding: FN-A8-phone-native-2-01

### Loading the demo can wipe a member's routines and body records

**How bad:** Serious. Data lost: a member's own routines, weight, measurements and photos can vanish without warning.
**What you would see:** A member taps Remove demo data; their own routines, body weight, measurements and photos stay on the phone. Later, on the welcome screen, they tap Load demo data instead. If they have no workout of their own, the sheet says only "You can remove it any time." and the load erases all of it. If they do have workouts, the warning names only the workouts.
**Who it hurts and how often:** Members who removed the demo and then load it again. Rare: it only happens on that path.
**Proof:** Found by reading the code. Remove the demo, add a body weight and a routine, then tap Load demo data instead on the welcome screen: both are gone.
**Fix:** Use the Settings demo wording on the welcome sheet, naming everything that will go, and warn whenever any of the member's own data is on the phone. Size: small.
**Your decision:** No.
Finding: FN-A5-phone-onboarding-db-2-01

### The workout share picture's "+N kg" line can count body weight

**How bad:** Serious. Privacy: a public picture that promises no body weight can include it.
**What you would see:** A member finishes a workout with pull-ups or dips and shares the picture. The "kg lifted" box leaves body weight out, as promised. But the line "Workout complete · +N kg more than previous" uses the full workout total, which counts body weight on pull-ups and dips. When only body-weight reps went up, that number is the extra reps times the member's body weight.
**Who it hurts and how often:** Members who share a workout that beat last time and has pull-ups or dips in it. Softened: to work out the body weight, a stranger would also need the rep difference, which the picture does not show.
**Proof:** Found by reading the code. Do a pull-up-only workout with 2 more reps than last time and open the share picture: the line shows about 2 times your body weight in kg.
**Fix:** Work the line out from the same body-weight-free kilos the picture's box shows. Size: small.
**Your decision:** No.
Finding: FN-A5-phone-tracker-lib-4-02

### HQ's English helper sends help questions to Google, unlike our notice

**How bad:** Serious. Privacy wording: a company gets help messages that our notice never says it gets.
**What you would see:** In HQ, when you tap the English helper on a reply, the person's whole help question, the earlier AI answer and earlier team replies go to Google Gemini with your draft. The privacy notice says help questions are read by Anthropic's Claude. Its list for Google names only sign-in, pop-ups, Google Play and the member-list import.
**Who it hurts and how often:** Members and gym staff who send a help question, each time you use the English helper on a reply. Only when the helper's Google key is saved on our server; whether it is could not be checked. Softened: Google is already named in the notice, and the paid key means Google does not train on the text.
**Proof:** Found by reading the code. Open the privacy notice and read who reads help questions, then use the English helper in HQ: the question goes to Google.
**Fix:** Name Google Gemini for help questions in the privacy notice, in English and Hindi, or move the helper to Anthropic, which the notice already names. Size: small.
**Your decision:** Yes. My view: add Google to the notice's help line in both languages; it is one sentence and keeps a helper you use. Option 1: update the notice. Option 2: switch the helper to Anthropic.
Finding: FN-L4-hq-app-01

### Help promises member messages go after 180 days; they may stay

**How bad:** Serious. Privacy: a written promise about deleting messages is not kept in one case.
**What you would see:** The help tells owners that member messages are deleted 180 days after the last one. No daily clean-up does this. Old messages are removed only when the member opens their messages or someone at the gym opens Member messages. If nobody opens either, the old messages stay. Messages are deleted when a member leaves the gym, as the help says.
**Who it hurts and how often:** Members and owners of a gym where nobody opens the messages for a while. Only at such gyms.
**Proof:** Found by reading the code: the only 180-day delete runs when one of the two message lists is opened.
**Fix:** Add the 180-day clean-up to a daily job (a change to how our server stores data, which needs your yes), or soften the help line. Size: small.
**Your decision:** Yes. My view: add the daily clean-up, so the promise is kept as written. Option 1: daily clean-up on the server. Option 2: change the help line to say old messages are removed when the list is next opened.
Finding: FN-A3-help-02

### Gym panel says a member gets the birthday wish; it may fail

**How bad:** Serious. Trust: a member's birthday goes unwished, while the owner thinks the app handled it.
**What you would see:** With the automatic birthday wish on, the AI Assistant and Today stop asking the owner to wish a member whose mobile and first name match an app member. They say that member "Gets the automatic wish at 9:30 am". But the wish is a notification the member's own phone sets for itself. It does not show if the member turned off reminders from the gym, has notifications off, or has not opened the app lately. In all these cases nobody wishes the member.
**Who it hurts and how often:** Members whose phone has gym reminders or notifications off, and their gym owner, on each such member's birthday.
**Proof:** Found by reading the code. On a member's phone, turn off reminders from the gym; on their birthday Today says they get the wish, and the phone shows nothing.
**Fix:** Change the words to say the wish is sent on the member's phone and may be switched off there, or have the phone tell our server whether gym reminders are on. Size: medium.
**Your decision:** Yes. My view: soften the words now, so owners keep wishing members who may not get it; it is quick. Option 1: soften the words. Option 2: have the phone report its reminder setting, so the count is exact.
Finding: FN-A3-notes-claude-1-02

### Editing a pass member changes their past pass visits

**How bad:** Serious. Money: the gym claims too little, or from the wrong company, for an unpaid month.
**What you would see:** A pass member checks in by scanning the gym's QR. That visit does not record which pass company it was for; the gym panel works it out from the member as they are today. The desk unticks the pass box: every past QR visit of that member drops out of the monthly count. Tick it again, and the start day becomes today, so the old visits stay lost. Change the company, and the old QR visits move to the new company.
**Who it hurts and how often:** Owners and desk staff of gyms whose pass members check in by QR, each time a pass member stops, restarts or changes company before the month is matched.
**Proof:** Found by reading the code. Give a pass member 5 QR visits this month, untick the pass box, and open the monthly pass count: the 5 visits are gone.
**Fix:** Save the pass company on each QR visit when it is made, or keep the member's pass history with dates. Size: medium.
**Your decision:** No.
Finding: FN-A5-panel-logic-2-2-01

### Erase all data can leave reminders and Health Connect on

**How bad:** Serious. Privacy and trust: a member who erased everything still gets reminders and may still send workouts out.
**What you would see:** A member taps Erase all data. The phone's clean-up (reminders off, sending to Health Connect off, widgets blank, shortcuts gone) only runs after three unrelated screen refreshes. If any of those fails, the clean-up is skipped with no record. "Time to train" keeps arriving, new workouts can still go to Health Connect, and old workout names can stay on the widget.
**Who it hurts and how often:** Members who erase the phone, only when one of the refreshes before the clean-up fails. Rare.
**Proof:** Found by reading the code: the clean-up shares one safety net with the screen refreshes, and that net ignores any failure silently.
**Fix:** Run the phone clean-up first, on its own, so it always happens. Size: small.
**Your decision:** No.
Finding: FN-A5-phone-native-4-01

### Join screen says workouts stay on the phone, then gym sees them

**How bad:** Serious. Privacy wording: the member is told two opposite things on one card.
**What you would see:** A member joins a gym that has trainers set up. The join card says "Your workouts stay on this phone." Two lines later it says "Your gym and your trainer see your workouts". Joining then switches sharing with the trainer on. Even at a gym without trainers, another line says the gym sees workout counts.
**Who it hurts and how often:** Members, every join at a gym with trainers.
**Proof:** Found by reading the code. Open a gym's invite on the phone at a gym with trainers and read the join card: both lines are there.
**Fix:** Drop "Your workouts stay on this phone" when the trainer line shows, and keep one true line about what the gym and trainer see. Size: small.
**Your decision:** Yes. My view: drop the line; the trainer line is the true one. Option 1: drop "stay on this phone" whenever sharing starts at join. Option 2: rewrite the card as one line that names exactly what the gym and trainer see.
Finding: FN-A5-phone-screens-1-2-01

### Tapping the birthday idea sends members' full names to the AI

**How bad:** Serious. Privacy: member names leave the gym, against what the AI Assistant promises.
**What you would see:** With the automatic birthday wish on, the AI Assistant shows a birthday idea. Tapping it sends "Send birthday wishes to" plus the members' full names to the AI. The owner never typed those names. The privacy notice says a member's name goes to the AI only if the owner says it. The app hides only phone numbers and emails.
**Who it hurts and how often:** Members with a birthday, each time the owner taps a birthday idea.
**Proof:** Found by reading the code. Turn the automatic wish on and tap the birthday idea on a day a member has a birthday: the request sent to the AI holds the member's full name.
**Fix:** Send a general sentence to the AI and fill in the names on the owner's own screen; add a test that no name goes out. Size: medium.
**Your decision:** No.
Finding: FN-A8-panel-assistant-1-12

### No test checks a sign-in code works once and expires

**How bad:** Serious. Trust: a code that works twice, or after 30 minutes, lets the wrong person into the gym's panel.
**What you would see:** Today nothing looks wrong. The owner's screens promise that a sign-in code for staff works once, for 30 minutes. The automatic tests check wrong tries, a cancelled code and a fresh code, but none uses the same code twice or waits past 30 minutes. If a later change broke either rule, every test would still pass and the app would go out.
**Who it hurts and how often:** Owners and staff, at every release. Nothing is known to be broken now; the gap is that nobody would notice.
**Proof:** Found by reading the code. Read the sign-in tests: none signs in with a used code a second time, and none tries a code older than 30 minutes.
**Fix:** Add two checks to the sign-in tests: the same code twice, and a 31-minute-old code, both refused. Size: small.
**Your decision:** No.
Finding: FN-A8-panel-auth-data-1-01

### No test proves gym records leave a shared computer after sign-out

**How bad:** Serious. Privacy: members' names and payments could stay on a shared desk computer.
**What you would see:** Today nothing looks wrong. When someone signs out, or the owner removes a staff person, the panel is meant to wipe its saved copy of the gym from that computer. The tests only check the welcome page and its words afterwards. None checks that members, payments and the gym name are really gone, or what happens to desk work that had not been sent yet.
**Who it hurts and how often:** Owners, front desk, and members whose details sit on a shared computer, at every sign-out. Nothing is known to be broken now; a future break would go unnoticed.
**Proof:** Found by reading the code. Read the sign-out tests: they check only the welcome page words, never the copy left on the computer.
**Fix:** Add a test that signs out, and one that removes a person, then checks the computer's copy of the gym is gone and unsent work is not dropped silently. Size: small.
**Your decision:** No.
Finding: FN-A8-panel-auth-data-2-03

### The Workout plans page is never driven by any test

**How bad:** Serious. Trust: a broken button on Workout plans would reach owners and trainers unseen.
**What you would see:** Today nothing looks wrong. No automatic test makes a plan, sends one to a member, taps Undo, sets the workout of the day, edits, copies or withdraws a plan. One demo test only opens the page and checks its heading fits a phone. A broken sheet or button would still pass every test.
**Who it hurts and how often:** Owners, desk staff and trainers, at every release. Nothing is known to be broken now.
**Proof:** Found by reading the code. Read the screen tests: the only one that opens Workout plans checks the heading and nothing else.
**Fix:** Add one test that uses the page as owner and as desk: make and send a plan, send to a member and undo, set and remove the workout of the day, withdraw a plan, and see the Pro page. Size: medium.
**Your decision:** No.
Finding: FN-A8-panel-brand-shell-3-01

### No screen test stops desk cash for a just-paid online link

**How bad:** Serious. Money: the desk could take cash from a member who already paid online.
**What you would see:** Today the guard exists. When the desk taps Save payment for cash while a payment link is open, the sheet should close the link first. If the member paid that link a moment ago, it should stay open with a "just paid online" line and save no cash. This is checked on the server and as words only. No test taps through it on screen, and the case with no internet, where the check is skipped, is not tested at all.
**Who it hurts and how often:** Owners and front desk, at every release. Nothing is known to be broken now; a break would not be caught.
**Proof:** Found by reading the code. Read the screen tests: none opens Collect payment with a payment link still open.
**Fix:** Add a phone-size test: make a link, mark it paid, try to save cash and see the just-paid line; then repeat with the link unpaid and see the cash saved. Size: small.
**Your decision:** No.
Finding: FN-A8-panel-forms-1-04

### The Joined online card is never tested as the front desk

**How bad:** Serious. Trust: the desk usually approves online joiners, and that path is untested.
**What you would see:** Today nothing is known to look wrong. Every test of the Joined online card signs in as the owner. No test approves a joiner as desk staff, or checks the receipt names the desk person. Of the card's five problem lines, only the refunded one is ever shown in a test. The lines for "someone else already approved", "details could not be saved", "plan no longer exists" and "no internet" are never checked.
**Who it hurts and how often:** Front desk staff, at every release. A break would reach them unseen.
**Proof:** Found by reading the code. Read the Joined online tests: all three sign in as the owner, and only the refunded line appears.
**Fix:** Add a test that signs in as desk staff, approves a joiner into a member, and shows each problem line. Size: medium.
**Your decision:** No.
Finding: FN-A8-panel-logic-2-3-03

### Adding, editing and retiring plans is barely tested

**How bad:** Serious. Money: plans set what every member is charged.
**What you would see:** Today nothing is known to look wrong. Tests only ever add a plan by filling four boxes and saving. Nothing checks the wrong-input lines (no name, an odd duration, a bad price or joining fee, bad personal training sessions). Nothing checks the personal training switch, editing a price, marking a plan "Not for sale" and back, or "Use a starter price list".
**Who it hurts and how often:** Owners, at every release. A broken plan sheet could charge members wrongly and still pass.
**Proof:** Found by reading the code. Read the tests: "Not for sale", the starter price list and the plan sheet's error lines appear in none of them.
**Fix:** Add a screen test for the plan sheet's error lines, the personal training plan, editing a price without changing old sales, retiring a plan and the starter list. Size: medium.
**Your decision:** No.
Finding: FN-A8-panel-screens-2-2-02

### Risky steps on the gym records card are never tested

**How bad:** Serious. Data lost: unsent desk payments could be wiped without a warning, unseen.
**What you would see:** Today nothing is known to look wrong. In Settings, the gym records card can clear this computer's copy, make a backup file, or erase everything. Tests check the calm "Clear offline copy" question only when nothing is waiting. The red warning that names unsent desk work is checked as words but never shown with work waiting. A failed backup ("Could not make the file"), Cancel on "Erase everything?" and the demo's "never put online" line are never tested. The backup test checks members and payments in the file, not check-ins.
**Who it hurts and how often:** Owners, at every release. A break would reach them unseen.
**Proof:** Found by reading the code. Read the records tests: none clears with money waiting, makes a backup fail, or presses Cancel on erase.
**Fix:** Add tests for clearing with unsent money waiting, a failed backup, Cancel on erase, and check-ins in the backup file. Size: medium.
**Your decision:** No.
Finding: FN-A8-panel-screens-2-3-02

### Restoring a Google Drive backup on a new phone is untested

**How bad:** Serious. Data lost: a member moving phones could fail to get their workouts back.
**What you would see:** Today nothing is known to look wrong. A member on a new phone signs in with Google on the welcome screen to bring back their Drive backup. No test does this: finding a backup, asking before replacing the phone's workouts, restoring, cancelling, or finding none. Only the "we found your backup" line, the replace warning and the 18+ tick are checked. Nothing checks that the app reads only its own backup file in the member's Drive. Restoring from a file is tested; Drive is not.
**Who it hurts and how often:** Members, each time they set up a new phone with a backup. A break would reach them unseen.
**Proof:** Found by reading the code. Read the phone tests: none signs in with Google on the welcome screen.
**Fix:** Add a phone test with a test Drive backup covering restore, replace, none and cancel, and check Drive access stays limited to the app's own file. Size: medium.
**Your decision:** No.
Finding: FN-A8-phone-onboarding-db-1-02

### Tests of phone sign-in privacy promises look in the wrong place

**How bad:** Serious. Privacy: the tests pass while a promise to members may be broken.
**What you would see:** When a member signs in with their mobile number, the screen says "You pay nothing, and we never message you." The test only checks that Profile shows no mobile number after joining. But the number is saved on the member's link to their gym on our server, and no test looks there. Nothing checks the "never message you" line, or that no WhatsApp ever goes to that number later.
**Who it hurts and how often:** Members, at every phone sign-in. Their number is kept on the server today, whatever our words suggest.
**Proof:** Found by reading the code. Sign in a test member by phone, join a gym, then look at that member's gym link on the server: the mobile number is there.
**Fix:** Point the sign-in test at the gym link and the server, and add a check of the never-message promise. Size: small.
**Your decision:** Yes. My view: first decide whether keeping the number on the gym link is fine; if yes, make our words say so, if no, stop keeping it. Option 1: keep the number and say so plainly on the sign-in screen. Option 2: stop saving the number on the gym link.
Finding: FN-A8-phone-onboarding-db-1-03

### Some app members get neither the app message nor WhatsApp

**How bad:** Serious. Trust: members silently miss a gym message and the owner thinks it went out.
**What you would see:** The owner asks the AI Assistant to send a message to a group. A member whose record is linked to the app but whose mobile number has since changed, or whose app account has no number, counts as "has the app", so they are left off the WhatsApp list. But the app message goes only to members matched by mobile number, so they miss that too. The card does not say anyone was missed. If the whole group is like this, it says "Send it on WhatsApp below" with no WhatsApp button.
**Who it hurts and how often:** Members whose app link and mobile number disagree, and their owner, on each group message that includes them. Rare, but silent.
**Proof:** Found by reading the code. Link a member to the app, change their number on the record, then send a group message through the AI Assistant: they are on neither list.
**Fix:** Use one rule for "has the app" and for who gets the app message, and put anyone not matched on the WhatsApp list. Size: small.
**Your decision:** No.
Finding: FN-B-alerts-panel-assistant-a-01

### Approving an old renew request sells the member a second plan

**How bad:** Serious. Money: the member is charged a second plan as a due.
**What you would see:** A member asks in the app to renew. The desk renews them the usual way, from the member's page. The request does not notice: it stays in Needs you, the bell and the Today card. When someone later taps Approve, it sells the plan again, starting after the one just sold, with the full price left as a due. There is no warning.
**Who it hurts and how often:** Members who ask to renew in the app and are then renewed at the desk, and the desk, every time this happens.
**Proof:** Found by reading the code. Have a member ask to renew in the app, renew them from their member page, then tap Approve on the request: a second plan with a full due appears.
**Fix:** Before Approve sells, check for any plan sold after the request; close the request, or ask the desk first. Size: small.
**Your decision:** Yes. My view: close the request on its own when a newer plan exists, because the desk should never sell twice by accident. Option 1: close it on its own and say "already renewed". Option 2: keep it, but warn before Approve sells.
Finding: FN-B-alerts-panel-logic-2-b-02

### Google-backed members get an empty backup after WhatsApp sign-in

**How bad:** Serious. Trust: the member thinks their workouts are gone, and the app blocks the way back.
**What you would see:** Since 25 Nov, proving your number by WhatsApp on the welcome screen also signs you in to a backup for that number. That backup is separate from Google. A member whose workouts were saved with Google, the only way before 25 Nov, proves their number on a new phone and is told nothing is saved yet. Nothing tells them to use Google. Once they log one workout, "Use Google instead" is refused with "This phone has another person's workouts". The only way out is to erase the phone. The Google copy is not lost.
**Who it hurts and how often:** Members who saved with Google, each time they set up a new phone or reinstall.
**Proof:** Found by reading the code. Save workouts with Google, then on a fresh install prove the number by WhatsApp, log one workout and tap Use Google instead: it is refused.
**Fix:** Join the number and the Google sign-in to one saved copy, or ask "Saved with Google before?" first. Size: medium.
**Your decision:** Yes. My view: ask "Saved with Google before?" on the welcome screen now, because it is quick, and join the two accounts later. Option 1: add the question now. Option 2: join the two sign-ins into one saved copy.
Finding: FN-B-alerts-phone-cloud-backup-ai-b-01

### Backup can stop for days while Settings still says saved

**How bad:** Serious. Data lost: new workouts stay unsaved while the member believes they are backed up.
**What you would see:** After a sign-in, a restore, an Undo, or an edit on another phone, the app must first fetch the saved copy before sending new workouts. If that keeps failing (sign-in ran out, or our server is down or refusing), nothing new is sent. Settings is never told. It keeps saying "saved automatically, last saved" with an old time, "will be saved in a moment" or "waiting for the internet", and never "sign in again".
**Who it hurts and how often:** Members signed in to a MettleUp account, for as long as the fetch keeps failing. A lost phone in that time loses those workouts.
**Proof:** Found by reading the code. Sign in, make the server refuse the fetch, log workouts for a few days, and Settings still shows the old "saved" line.
**Fix:** Treat a failed fetch like a failed send, so Settings says the backup is stuck and what to do. Size: small.
**Your decision:** No.
Finding: FN-B-alerts-phone-cloud-backup-ai-b-02

### Nobody at the gym sees when a member pays twice online

**How bad:** Serious. Money: the member's extra payment stays with the gym, unseen.
**What you would see:** A member pays a payment request online, then a second, different payment lands on the same request. Our server notes the second payment in a hidden log line saying to check the payment company and refund it. The desk, the owner and MettleUp HQ never see it. The gym's books show one payment, and the member's extra money is not returned.
**Who it hurts and how often:** Members who pay twice, and the gym owner. Rare: only when a payment page takes a second payment.
**Proof:** Found by reading the code. Pay one test request twice through the payment company's test mode: Today and the payment list show one payment, and no "paid twice" line appears anywhere.
**Fix:** Mark the request "paid twice, refund one" and show it to the owner until it is refunded. Size: medium.
**Your decision:** Yes. My view: show it on Today for the owner and also count it for HQ, so refunds are never missed. Option 1: show to the owner only. Option 2: show to the owner and HQ.
Finding: FN-B-alerts-server-panel-worker-b-01

### MettleUp never hears when members' workout backups stop saving

**How bad:** Serious. Data lost: backups could be stuck for weeks before anyone knows.
**What you would see:** The app reports crashes to MettleUp. But a backup that fails without crashing is written only to the phone's own hidden log, which nobody reads. A server change that breaks saving, a backup refused as full or too big, members needing to sign in again, or a fetch that keeps failing all stay on the phone. MettleUp would learn of it only when someone loses a phone and complains.
**Who it hurts and how often:** Every signed-in member, and MettleUp support, at every backup failure.
**Proof:** Found by reading the code. Make the server refuse backups for a test member: the phone keeps failing, and MettleUp's error report shows nothing.
**Fix:** Send stuck-backup failures to the same error report as crashes, once per kind per day, with no personal data. Size: medium.
**Your decision:** Yes. My view: do it, sending only the kind of failure and the app version, and check our privacy notice covers error reports. Option 1: failure kind and app version only. Option 2: also a daily count of backups saved.
Finding: FN-B-run-phone-cloud-backup-ai-a-04

### Outage alarm never checks WhatsApp codes or the AI service

**How bad:** Serious. Trust: owners locked out, or AI down, and MettleUp hears it from a gym.
**What you would see:** The 10-minute outage alarm checks only the websites, HQ, the gym server and the backup. Nothing regular checks that WhatsApp still delivers codes or that the AI service still answers. The WhatsApp check is only a run started by hand to the owner's own phone. These codes are for owner and desk Forgot PIN and new-gym sign-up. If WhatsApp refuses MettleUp's number or message format, those people cannot get in.
**Who it hurts and how often:** Owners and desk staff who forget their PIN, new gyms signing up, and gyms using AI, during every outage of those services.
**Proof:** Found by reading the code. Read the outage alarm's list of checks: WhatsApp and the AI service are not on it.
**Fix:** Add WhatsApp and AI health to the 10-minute check, using a count of failed sends on the server. Size: medium.
**Your decision:** No.
Finding: FN-B-run-server-ci-workflows-a-02

### Returning member added by Excel import stays hidden as archived

**How bad:** Serious. Trust: a paying member vanishes from every list and message.
**What you would see:** The owner imports an Excel list. One row is a member the gym archived earlier. The import screen says "Already a member (name, archived)". The plan and payment on that row are still saved to him, but he is never brought back, whatever duplicate choice the owner picks. So he has a paid, running plan, yet he is missing from Members, the Active members and ending-soon tiles, and every message group. His money still shows in Collections.
**Who it hurts and how often:** Owners bringing back members who left, through an import, on every such row.
**Proof:** Found by reading the code. Archive a member, then import a row for him with a current plan: the plan is saved, but he stays out of Members.
**Fix:** When an imported plan is still running, bring the member back from the archive and say so on the import screen. Size: small.
**Your decision:** Yes. My view: bring him back on his own and say so, because a paid member should always be visible. Option 1: bring him back on his own and say so. Option 2: hold the plan and ask the owner first.
Finding: FN-B-time-panel-logic-1-01

### Members' app shows the training pack's end as their plan's end

**How bad:** Serious. Trust and money: members miss "renew soon" and the gym loses renewals.
**What you would see:** The desk sells a personal training pack beside the gym plan. The panel keeps them apart. The member's app does not: it shows whichever ends last. A member whose gym plan ends in 5 days but whose 3-month pack runs on sees the pack's name and far-off last day. They get no "renew soon" line and no "plan ends soon" reminders, while the panel lists them as ending. When the gym plan ends last, the app hides the pack's sessions left. A pack sold to start later counts as a plan paid ahead and turns off all plan-ending reminders.
**Who it hurts and how often:** Members with a personal training pack, and their gym, whenever the pack and gym plan end on different days.
**Proof:** Found by reading the code. Sell a member a gym plan ending in 5 days and a 3-month training pack, then open the member's app: it shows the pack's end date and no renew line.
**Fix:** Have the member's app show the gym plan's last day, with the training pack as its own line. Size: medium.
**Your decision:** Yes. My view: show the pack as its own line with sessions left, so members see both. Option 1: gym plan plus a separate pack line. Option 2: show the gym plan only.
Finding: FN-B-truth-panel-forms-b-01

### Training packs push back the plan end on members' phones

**How bad:** Serious. Trust and money: phone and panel show different end dates, and reminders stop.
**What you would see:** The panel never lets a personal training pack decide when a gym plan ends. The member's phone does. A member whose gym plan ends on 30 Nov but who has a training pack to 31 Dec sees "ends 31 Dec" on the phone and gets no plan-ending reminder. The panel shows "Ending in 1-3 days". A training pack bought to start next week also counts on the phone as a renewal already paid, so every plan-ending reminder is skipped.
**Who it hurts and how often:** Members with a personal training pack that ends after, or starts after, their gym plan, and their gym, every time.
**Proof:** Found by reading the code. Give a member a gym plan ending 30 Nov and a training pack to 31 Dec, then compare the phone and the panel: the dates differ.
**Fix:** Leave training packs out when our server picks the member's current and next plan. Size: small.
**Your decision:** No.
Finding: FN-B-truth-panel-logic-1-b-02

### Members renewed or checked in at the desk still get reminders

**How bad:** Serious. Trust: members get wrong "plan ends" and "we miss you" notes.
**What you would see:** The gym's automatic reminders are set on the phone days ahead, from what the phone knew when the app was last opened. The 15-minute background check does not refresh them. A member who renews at the desk, or is checked in by the desk, and does not open the app, still gets "Your plan ends tomorrow", then "Your plan ended on ...", or "We haven't seen you for 14 days". The panel meanwhile shows a paid renewal and a recent visit. The test gym has desk check-ins, so this happens for real.
**Who it hurts and how often:** Gym members with reminders on, whenever the app stays closed across a desk renewal or desk check-in.
**Proof:** Found by reading the code. Open the app, close it, renew the member at the desk the day before the plan ends, and leave the app closed: "Your plan ends tomorrow" still shows.
**Fix:** Refresh the gym reminders in the background check, or re-check the plan just before each plan or visit reminder shows. Size: medium.
**Your decision:** No.
Finding: FN-B-truth-phone-shop-1-b-01

### Member app can show a personal training pack as the gym plan

**How bad:** Serious. Trust and money: members lose their renewal line and reminders, so renewals can slip.
**What you would see:** A member has a gym plan ending on 30 Nov and a personal training pack ending on 15 Dec. On My membership in the member app they see the training pack, "Ends 15 Dec", and no "Renew at the desk" line, while the owner's admin app puts them on the renewals list. A training pack bought to start later also hides the renew line and stops every plan-ends reminder on the phone. The other way round, a gym plan that ends after the training pack hides the sessions left and the "PT running low" reminder.
**Who it hurts and how often:** Members with a personal training pack next to a gym plan, every time. The test gym has no training packs, so no real member has been seen hitting it yet.
**Proof:** Found by reading the code. Give a test member a gym plan ending this month and a training pack ending next month, then open My membership in the member app.
**Fix:** Leave training packs out when the member app picks the current and next gym plan, and show the pack as its own line. Size: small.
**Your decision:** No.
Finding: FN-B-truth-server-database-1-b-01

### Add member says only staff see photos; nightly copy holds them too

**How bad:** Serious. Privacy: the screen makes a promise the backup breaks.
**What you would see:** Under the photo on Add member, the desk reads that only the gym's staff can see it. But every night MettleUp's backup copies member photos too, and keeps them for 7 days in MettleUp's own storage. Anyone with MettleUp's cloud login can open them there, and no look is recorded. The backup's own note wrongly says photos are not copied.
**Who it hurts and how often:** Members whose photo the desk takes, every night. The first reading said member photos were not switched on live yet; a second check found the photo store is live and Add member shows the photo whenever the server keeps photos, so photos may already be in the copy today.
**Proof:** Found by reading the code. Take a member photo on Add member, let the nightly backup run, then look inside that night's copy: the photo is there.
**Fix:** Keep member photos out of the nightly copy, or lock them there and change the words to say MettleUp also holds a locked backup. Size: small.
**Your decision:** Yes. My view: keep the photos but lock them in the copy, and add one line saying so; losing photos in a disaster is worse than one honest line. Option 1: leave photos out of the nightly copy and keep today's words. Option 2: lock them in the copy and change the words.
Finding: FN-B-words-panel-forms-01

### Install on watch is offered to all, but watch app is test-only

**How bad:** Serious. Trust: members tap a button that leads nowhere, and a paid feature they cannot get is listed.
**What you would see:** In Settings, Phone and watch, Your watch, any member whose watch lacks MettleUp sees "Install on watch". It opens the watch's Play Store on MettleUp. On Google Play the watch app is only on test tracks, with nothing for the public. So a normal member who taps Install, or searches the watch Play Store, finds nothing, while the MettleUp Plus page lists "MettleUp on your watch" as a paid feature.
**Who it hurts and how often:** Members with a Wear OS watch, every time they tap Install. Google Play was last read on 21 Nov; if the watch app has gone public since, this is already fixed.
**Proof:** Found by reading the code and the 21 Nov Google Play report. Open Google Play Console and check whether the watch app has a production release; if not, tap Install on watch on a normal member's phone and nothing can be installed.
**Fix:** Hide the install offer and the paid-feature line from members outside the test groups until the watch app is public, or publish the watch app. Size: small.
**Your decision:** Yes. My view: hide both until the watch app is public; a dead button and an unreachable paid feature cost more trust than a missing one. Option 1: hide them for now. Option 2: release the watch app to everyone on Google Play.
Finding: FN-L12-phone-screens-2-01

### Both websites promise the free watch app, which is not public

**How bad:** Serious. Trust and legal: a public claim an ad regulator could call misleading.
**What you would see:** The member website says "Free on Wear OS watches", and the gym-owner website says the same. On Google Play the watch app has no public release: it is only on internal and closed testing, and the open testing version is waiting to be published. A visitor who reads either site and looks for the watch app on Google Play cannot get it.
**Who it hurts and how often:** Every member and gym owner who reads either site, on every visit. Google Play was last read on 21 Nov.
**Proof:** Found by reading the websites and the 21 Nov Google Play report. Open Google Play Console and look at the watch app's production track, then search the watch Play Store for MettleUp.
**Fix:** Publish the watch app to the public on Google Play, or change the two lines to say it is in testing. Size: small.
**Your decision:** Yes. My view: change the two lines today to say the watch app is in testing, and put the old words back once it is public. Option 1: change the website words now. Option 2: release the watch app to everyone first.
Finding: FN-L12-web-pages-02

### After a gym disconnects its shop, members can still place orders

**How bad:** Serious. Money: members can order, and pay where paying online is on, into a shop nobody watches.
**What you would see:** An owner presses Disconnect on the shop. This only makes that browser forget the gym. On MettleUp's server the gym, its code and its products stay on, so members who joined can keep ordering, and paying online where that is on. The owner has no screen left that shows those orders, and the screen says only that members and payments are still here.
**Who it hurts and how often:** Members and owners of a gym that ran its shop in one browser and then disconnected it; every order placed after the disconnect.
**Proof:** Found by reading the code. Disconnect the shop in a test gym, then place an order from a member's phone: it goes through, and no owner screen shows it.
**Fix:** Make Disconnect close the shop on the server too, so members are told the shop is closed and cannot order. Size: medium.
**Your decision:** Yes. My view: close the shop for members on Disconnect; a warning alone still lets members pay into a shop nobody runs. Option 1: Disconnect closes the shop for members. Option 2: keep the shop open and warn the owner plainly before Disconnect.
Finding: FN-L14-panel-shop-01

### Nightly backup never copies member photos, workout report files or logos

**How bad:** Serious. Data lost: if MettleUp's database were lost, these files would be gone for good.
**What you would see:** The nightly copy holds every record but none of the stored files. If MettleUp's database were lost, every member photo taken at the desk, every workout report file and every gym logo would be gone. The restore guide says so, but nothing else copies them, and owners are not told.
**Who it hurts and how often:** Owners and members, only if MettleUp's database is lost. Rare, but nothing could bring the files back.
**Proof:** Found by reading the code. Look at what the nightly backup holds: records only, no photos, report files or logos.
**Fix:** Add a weekly copy of the stored files to a second place, or tell owners plainly that photos have no backup. Size: medium.
**Your decision:** Yes. My view: add the weekly copy; owners expect photos to be safe, and a second store costs little. Option 1: add a weekly copy of stored files. Option 2: tell owners on screen that photos are not backed up.
Finding: FN-L14-server-database-2-03

### A new gym with the same mobile gets another 3-month free trial

**How bad:** Serious. Money: an owner can use Pro free for as long as he likes.
**What you would see:** Create my gym gives every new gym 3 free months unless a WhatsApp-checked number comes with it. The WhatsApp number check is switched off, and the admin app then makes the gym without it. So an owner whose trial ended can make a fresh gym with the same number, import his members again, and use Pro free for 3 more months. He can repeat this, up to 5 gyms an hour from one internet connection.
**Who it hurts and how often:** MettleUp, in lost plan money, every time an owner does this on purpose. Whether the WhatsApp check is still off live was not re-read; if it was turned on since, the gap is closed for now.
**Proof:** Found by reading the code. Make a test gym with one mobile number, then make a second gym with the same number: the second also gets 3 free months.
**Fix:** Give the free months only to a number that has never owned a gym or had a trial, even without the WhatsApp check. Size: small.
**Your decision:** Yes. My view: one free trial per mobile number, always; it is simple to explain and stops the loop. Option 1: one trial per number, whatever the WhatsApp check says. Option 2: turn the WhatsApp check on and rely on it alone.
Finding: FN-L19-panel-auth-data-01

### Stranger typing a member's mobile at joining gets that member's gym messages

**How bad:** Serious. Privacy: a member's gym messages can reach a stranger.
**What you would see:** When someone joins a gym in the member app, MettleUp keeps whatever mobile number comes with the join, unchecked. The admin app then trusts that number. In App members, the stranger opens the real member's page, and a message sent to that member or a group, from Messages or the AI Assistant, also arrives in the stranger's app. The real member is marked as already on the app, so the WhatsApp list leaves them out.
**Who it hurts and how often:** Members and owners, only when someone does it on purpose. Today's member app sends no number at joining, so it needs someone who knows the gym code and contacts MettleUp's server directly, outside the app.
**Proof:** Found by reading the code. Join a test gym from outside the app with a member's mobile number, then send that member a message from Messages: it shows in the stranger's app.
**Fix:** Match app members to the member list only by the number the desk confirmed at check-in, and stop keeping a number at joining. Size: small.
**Your decision:** No.
Finding: FN-L19-panel-shop-01

### HQ cannot erase one member; its step relies on read-only access

**How bad:** Serious. Privacy and legal: a member's erase request can be closed with nothing erased.
**What you would see:** When a member asks MettleUp to erase their details, the HQ step says to open support access, find the member and erase them by hand. Support access can only look, not change. HQ has no erase button for a member. The only thing HQ can do is tick the request as done, and the tick does not check that anything was erased.
**Who it hurts and how often:** Every member who asks MettleUp to erase their details, on every request.
**Proof:** Found by reading the code. Open a member erase request in HQ and follow its step into support access: there is no way to change or delete the member, yet the request can be ticked done.
**Fix:** Give HQ a real erase action, or a step that asks the gym owner to erase and confirms it, and let the done tick check the member is gone. Size: medium.
**Your decision:** Yes. My view: build one erase action in the admin app, and have HQ ask the owner and then check it is done; one tool serves both. Option 1: HQ erases the member directly. Option 2: HQ asks the gym owner, who erases from the admin app.
Finding: FN-L4-hq-app-02

### A gym cannot erase a member, though the data agreement promises it

**How bad:** Serious. Legal: the gym is told it handles erase requests, but it has no tool to do it.
**What you would see:** A member asks their gym to erase their details. The admin app has no way to delete or blank out a member: undo exists for an import, a check-in and an expense, but not for a member. MettleUp's server also refuses to delete any member, plan or receipt typed in by hand; only imported ones can be taken back. The data agreement tells the gym it handles erase requests, and HQ has no erase tool either. The only way round is for the desk to overwrite each detail by hand.
**Who it hurts and how often:** Members who ask their gym to erase their details, and the gym owners; every erase request.
**Proof:** Found by reading the code. Open a member added by hand in the admin app and look for delete or erase: there is none.
**Fix:** Add an owner-only erase action that blanks the member's name, mobile, photo and notes on the server and every desk, and keeps receipts without the name. Size: medium.
**Your decision:** Yes. My view: build the owner-only erase; the data agreement already promises it, and receipts can stay for tax with the name removed. Option 1: owner-only erase in the admin app. Option 2: change the data agreement so MettleUp does erasing for the gym.
Finding: FN-L4-panel-auth-data-01

### A deleted record keeps all its details on the server for ever

**How bad:** Serious. Privacy: people the owner deleted stay on MettleUp's server and in its backups.
**What you would see:** An owner undoes a wrong import of members and receipts, or deletes a check-in or an expense. The record disappears from the screen. On MettleUp's server it is only marked deleted, with the member's name and mobile still inside, and it goes into the backups too. The first version of this step blanked the record; a later version dropped that, and nothing cleans these up later.
**Who it hurts and how often:** Members whose records a gym deletes, mostly after an undone import; every delete from the admin app.
**Proof:** Found by reading the code. Import a test member file, undo it, then look on the server: the rows are still there with names and mobiles.
**Fix:** Blank a record's details when it is marked deleted, and blank the ones already marked. Size: small.
**Your decision:** No.
Finding: FN-L4-panel-auth-data-02

### Old browser copy of every member stays after sign out

**How bad:** Serious. Privacy: a full member list stays behind on a shared desk computer, against the privacy notice.
**What you would see:** A gym first kept in one browser is then put online. The browser's own copy of the gym, with every member, mobile, plan, payment and check-in, is moved aside under a dated name and never deleted. Signing out clears the online copy but not this one. The privacy notice says signing a device out deletes the copy the admin app keeps on it.
**Who it hurts and how often:** Members of every gym that started in one browser and then went online. On a shared front-desk computer the list stays after the staff member or the gym has gone.
**Proof:** Found by reading the code. Put a browser-only test gym online, sign out, then look in the browser's saved data: the full member list is still there.
**Fix:** Delete the old browser copy once the upload is confirmed, or at the latest on sign out, and say so on screen. Size: small.
**Your decision:** No.
Finding: FN-L4-panel-auth-data-03

### Member-list import can send real names and health notes to Google's AI

**How bad:** Serious. Privacy: names and health notes go out, while the privacy notice says names are hidden.
**What you would see:** When a gym imports its old member file, up to 5 example rows go to Google Gemini (or Claude) to work out the columns. Name and address columns are hidden first. But a column whose heading has a word like trainer, coach, no, number, ID, code or from is sent as it is. So "Trainer", "Father / Guardian name and contact no" or "Emergency contact name (mobile no)" sends real names, though mobiles stay hidden, and a remarks column such as "BP patient since 2020" is sent word for word.
**Who it hurts and how often:** Members, their family contacts and trainers named in the file; each import of a file with such a column. At most 5 rows go each time, and the privacy notice already names Google and Anthropic.
**Proof:** Found by reading the code. Import a test file with a "Trainer" column of names and a remarks column, and look at what is sent to the AI: both go as they are.
**Fix:** Hide every column that is not a plan, amount, date or batch column, whatever its heading says. Size: small.
**Your decision:** Yes. My view: hide them; the import works from plan, amount and date columns, and the other way means admitting health notes go out. Option 1: hide every other column. Option 2: keep it and change the privacy notice to say which columns are sent.
Finding: FN-L4-panel-logic-1-01

### Delete my account says everything goes, but gym-shared workouts stay

**How bad:** Serious. Privacy and trust: the app tells members more is deleted than really is.
**What you would see:** Before and after Delete my account, the app says the account and everything saved on MettleUp's server is deleted. It only deletes the saved copy, the account and its profile. For a gym member, the trainer summary of their workouts, leaderboard totals, machine use, shared workouts and questions to a trainer all stay. When the account is kept because the gym also uses that sign-in, the older activity summary and profile stay too. The privacy notice gets this right (leave the gym to delete those), but the app's own words do not.
**Who it hurts and how often:** Every gym member who deletes their MettleUp account.
**Proof:** Found by reading the code. As a test gym member, share workouts with trainers, delete the account, then open that member in the admin app: the workout summary is still there.
**Fix:** Clear what the member shared with the gym as part of the delete, or change the words to say the gym's copies stay until you leave the gym. Size: small.
**Your decision:** Yes. My view: clear the gym-shared copies as part of the delete; a member who presses Delete expects it all gone. Option 1: the delete also clears what was shared with the gym. Option 2: change the words to say the gym's copies stay until you leave the gym.
Finding: FN-L4-phone-cloud-backup-ai-01

### Members who turned on photo backup cannot find the switch

**How bad:** Serious. Privacy: progress photos keep going to the member's Google backup with no way to stop.
**What you would see:** The "Include photos in my backup" switch now sits on a page no Settings row opens. A member who turned it on earlier keeps it on. At every app start and after every new photo, the newest progress photos are copied into Android's backup on their Google account, and the Progress photos page says so. The only way to stop it in the app is to erase everything.
**Who it hurts and how often:** Members who turned photo backup on before the switch was hidden; every new progress photo, for as long as they use the app.
**Proof:** Found by reading the code. On a phone with photo backup on, go through every Settings row: none opens the switch.
**Fix:** Put the photo backup switch back where members can reach it, or turn it off for everyone and delete the copies. Size: small.
**Your decision:** Yes. My view: put the switch back in Settings; members chose it, and quietly deleting their backups would surprise them. Option 1: put the switch back. Option 2: turn it off for everyone and delete the copies.
Finding: FN-L4-phone-components-2-01

### Phone sign-in says the number is not kept, but it is

**How bad:** Serious. Privacy wording: the screen promises something the app does not do.
**What you would see:** The phone sign-in screen says "Your number is checked once and is not kept for this", and the privacy notice says the same. When the member then joins the gym the search found, MettleUp saves the checked number on the member's link to that gym, with the time it was checked. It stays there until the member leaves, and leaving does not clear the check-in copy.
**Who it hurts and how often:** Members who sign in by phone and join the gym found for them, every time. The gym already has the same number on its member list, so no new person sees it; the harm is a broken promise.
**Proof:** Found by reading the code. Sign in a test member by phone, join the gym, then look at that member's gym link on the server: the number is saved with a time.
**Fix:** Change the screen and privacy notice words to say the checked number is saved on your gym link until you leave, or stop saving it there. Size: small.
**Your decision:** Yes. My view: change the words; the gym needs the number for check-in anyway, and the honest line costs nothing. Option 1: change the screen and notice words. Option 2: stop saving the number at sign-in.
Finding: FN-L4-phone-onboarding-db-01

### Privacy notice says trainers get 3 months; app sends a year

**How bad:** Serious. Privacy wording: the notice understates what the gym receives.
**What you would see:** With sharing with trainers on, the app sends the gym every workout since the member joined, up to the last 12 months and 400 workouts. Each one has its name, every exercise's heaviest set and the number of sets. The app's own caption says 12 months. The privacy notice, in English and Hindi, still says up to 30 workouts from the last 3 months.
**Who it hurts and how often:** Members of a gym that takes the 12-month progress, on every trainer share.
**Proof:** Found by reading the code. Turn on sharing with trainers, read the caption (12 months), then read the trainer summary line in the privacy notice (3 months).
**Fix:** Update the trainer summary line of the privacy notice in both languages to 12 months since joining. Size: small.
**Your decision:** Yes. My view: update the notice in English and Hindi; the app is right and the notice is out of date. Option 1: change the notice to 12 months. Option 2: cut the share back to 3 months.
Finding: FN-L4-phone-shop-2-01

### Sharing switched on at joining lacks a basis in Indian law

**How bad:** Serious. Legal: the privacy notice gives a reason India's data law does not have.
**What you would see:** Joining a gym switches on three kinds of sharing without asking: workouts for trainers, which machines are used, and the pop-up code. The privacy notice says "legitimate interest" is the reason and that the member can object. India's data protection law allows using personal data with consent or for a short list of allowed uses; it has no general "legitimate interest". The workout sharing lets the gym see up to a year of a member's training.
**Who it hurts and how often:** Every member who joins a gym, on every join. A lawyer still needs to confirm the legal reading.
**Proof:** Found by reading the code and the privacy notice. Join a gym as a new test member and open the sharing settings: all three are on without a yes.
**Fix:** Ask a lawyer; most likely make trainer and machine sharing a tick box at joining. Size: medium.
**Your decision:** Yes. My view: add a clear tick box at joining now; it is safe under any reading of the law and costs little. Option 1: ask for a yes at joining. Option 2: keep sharing on and have a lawyer name a reason the law accepts.
Finding: FN-L4-phone-shop-2-03

### Left members' names and orders stay on the server with no erase

**How bad:** Serious. Legal and privacy: the notice tells members to ask the gym to erase, and nothing can.
**What you would see:** The privacy notice tells a member who left to ask the gym to erase the rest of their details. MettleUp's server refuses to delete any member, plan, membership or receipt the gym typed in by hand; imported ones and check-ins can be deleted, but even then the details stay with a deleted mark. A member who leaves the app keeps their name, join date and leave date in the gym's app list for good; only the mobile number is cleared. Their shop orders keep their name too, and HQ has no erase tool either.
**Who it hurts and how often:** Members who ask their gym to erase their details, on every request, for as long as the gym stays on MettleUp.
**Proof:** Found by reading the code. Have a test member leave the app, then look at the gym's app member list and shop orders: the name is still there.
**Fix:** Add an owner-only erase that blanks the member's details everywhere the gym keeps them, and blank the details whenever a record is deleted. Size: medium.
**Your decision:** Yes. My view: build one owner-only erase that also covers the app member list and shop orders; the same tool closes the admin app gap. Option 1: owner-only erase, run by the gym. Option 2: MettleUp erases on the gym's behalf when asked.
Finding: FN-L4-server-database-1-01

### Workout offer records are only deleted when the owner opens offers

**How bad:** Serious. Privacy: the notice promises deletion dates that may never come.
**What you would see:** The privacy notice promises workout offer dates go 90 days after the offer ends, and the record of who joined and left goes 1 year after. That deleting only runs when the owner opens the workout offer page or saves an offer. The nightly clean-up never touches them. A gym that stops using offers keeps every member's counted workout dates and offer history with no end.
**Who it hurts and how often:** Members who joined a workout offer, in every gym that stops opening its offers page.
**Proof:** Found by reading the code. End an offer in a test gym, leave the offers page unopened past 90 days, then look: the dates are still there.
**Fix:** Run the offer clean-up for every gym in the nightly clean-up. Size: small.
**Your decision:** No.
Finding: FN-L4-server-database-1-02

### Joining a gym keeps no record of the member's consent or age

**How bad:** Serious. Legal and privacy: MettleUp cannot prove a member agreed to the notice or said they are 18 or over.
**What you would see:** The privacy notice says a member ticks that they are 18 or older and agrees to the notice and terms before joining a gym. When they join with the gym code, our server saves only the code, their name and an optional phone number. It saves no tick, no time and no notice version. If a parent or a regulator later asks "did this member agree, and to which version?", there is nothing to show. The workout offer and the owner's own terms do keep such a record; the member join does not.
**Who it hurts and how often:** Every member who joins a gym in the app, on every join. It hurts MettleUp most, the day someone asks for proof.
**Proof:** Found by reading the code. Join a test gym in the member app, then look at that member's saved details on the server: there is no agreed time, notice version or 18+ answer.
**Fix:** Send the notice version and the 18+ tick with the join, and keep them with the member. Size: medium.
**Your decision:** Yes. My view: record it, the same way the owner's terms are recorded; it is cheap now and impossible to add for past joins later. Option 1: record version, time and the 18+ tick from now on. Option 2: also ask existing members to tick again so they have a record.
Finding: FN-L4-server-database-1-03

### Privacy notice time limits only run when someone opens that screen

**How bad:** Serious. Privacy: the notice promises data is deleted after a set time, but in a quiet gym it is kept forever.
**What you would see:** The privacy notice promises that leaderboard numbers go after 62 days, machine use after 63, workouts shared with gym mates after 60, the trainer summary after 90 days without an update, questions to a trainer after 180 days, and a sent workout report after 30. Nothing deletes these on a timer. Each clean-up runs for one gym only, and only when a member or staff person of that gym opens the matching screen. The nightly clean-up does not touch any of them. So in a gym that stops using a feature, or stops using MettleUp, the data never goes. Machine use is also skipped while the gym is paused.
**Who it hurts and how often:** Members who stay in a gym that stops using a feature or stops using MettleUp, for as long as nobody opens that screen. Members who leave a gym are not hit: leaving still deletes their rows at once.
**Proof:** Found by reading the code. Share a workout with gym mates in a test gym, then let nobody open that screen for more than 60 days: the workout is still there.
**Fix:** Add one nightly clean-up that applies every time limit in the notice to all gyms. Size: small.
**Your decision:** No.
Finding: FN-L4-server-database-2-01

### Deleting a member keeps their photo and body measurements, unseen

**How bad:** Serious. Privacy: a face photo and body figures stay on our server forever after the gym deletes the member.
**What you would see:** The desk takes a member's photo and saves body measurements on their page. Later the gym deletes that member from Members. The photo and the measurements are not deleted. Because the screens only open members still on the list, the gym can no longer see them, so it thinks they are gone. Only deleting the whole gym removes them.
**Who it hurts and how often:** Every member a gym deletes who had a photo or measurements saved, every time.
**Proof:** Found by reading the code. Add a test member with a photo and one measurement, delete the member, then look at the gym's saved photos and measurements on the server: both are still there.
**Fix:** When a member is deleted from the list, delete their photo and measurements too. Size: small.
**Your decision:** No.
Finding: FN-L4-server-database-2-03

### Trainers now get a year of workouts; notice still says 3 months

**How bad:** Serious. Privacy and trust: members agree to a much smaller share than the one that really happens.
**What you would see:** Since 14 Nov, a member's phone shares up to 400 workouts from the last 12 months with the gym's trainers. Each workout carries the best weight, reps and sets for up to 20 exercises. The privacy notice still tells members the trainer summary holds up to 30 workouts from the last 3 months. Sharing with trainers is switched on by default when a member joins a gym.
**Who it hurts and how often:** Every member of every gym with trainer sharing on, from 14 Nov onwards.
**Proof:** Found by reading the code and the privacy notice. Join a test gym with a member who has a year of workouts, then open that member as a trainer: workouts older than 3 months show, while the notice says 3 months.
**Fix:** Change the trainer summary line in the privacy notice to 12 months and up to 400 workouts, in English and Hindi. Size: small.
**Your decision:** Yes. My view: update the notice to match, because a year of history is what makes the trainer view useful. Option 1: change the notice to 12 months and 400 workouts. Option 2: cut the share back to 30 workouts from 3 months.
Finding: FN-L4-server-database-3-01

### Delete-account page tells gym and phone members nothing is saved

**How bad:** Serious. Privacy and Google Play: members with data on our server are told there is nothing to delete, and cannot ask.
**What you would see:** Google Play sends members to our delete-account page. It says you only have an account if you tapped Continue with Google, and that otherwise nothing is saved on our server. But a member who only joined a gym with its code has their name, leaderboard numbers, trainer summary, machine use and pop-up code on our server. A member who signs in with a phone number (added 15 Nov) never touches Google at all. The page also only takes requests from a Google email, so such a member has no way to ask. The privacy notice was already fixed to accept a mobile number; the delete page was last changed on 10 Nov and was not.
**Who it hurts and how often:** Members who joined a gym or signed in with their phone number but never used Google, every time they read the page.
**Proof:** Found by reading the code and the page. Open the delete-account page: it says nothing is saved without Google and asks only for a Google email.
**Fix:** Rewrite the start of the delete-account page to cover gym members and phone sign-in, say how to remove the data (leave the gym, or email us), and accept a mobile number. Size: small.
**Your decision:** Yes. My view: rewrite it now, since Google Play checks this page and the words are plainly wrong. Option 1: rewrite the page and accept a mobile number. Option 2: also add a delete button inside the app so members need no email.
Finding: FN-L4-web-pages-02

### Refused offline cash vanishes from the member's dues and money counts

**How bad:** Serious. Money and trust: a member who paid and holds a receipt shows as still owing, and can be charged again.
**What you would see:** The desk takes cash with no internet and prints a receipt. When the internet returns, the server refuses that payment. The admin app then keeps it only in the warning bar at the top of the screen. The member's page goes back to showing the full amount owed. The "payment still being sent" block no longer stops the desk taking a second payment. The Today line of money waiting to send leaves it out, and the warning before clearing the offline copy does not name it as money.
**Who it hurts and how often:** Members and desk staff, only when a payment taken offline is later refused by the server. This is rare.
**Proof:** Found by reading the code. Take a payment with the internet off, make the server refuse it when it is sent, then open that member's page: the full amount shows as owed again.
**Fix:** Show refused money on the member's page as taken but not saved, block a second payment, and count it in the waiting money and the clear warning. Size: medium.
**Your decision:** Yes. My view: show it everywhere until the owner settles it; a printed receipt the app then forgets is the worst kind of money mistake. Option 1: show it as taken but not saved, everywhere. Option 2: only block the second payment, and leave the counts as they are.
Finding: FN-L5-panel-auth-data-01

### If an open payment link cannot be closed, desk cash saves silently

**How bad:** Serious. Money: a member can pay the same due twice, once in cash and once online.
**What you would see:** On Collect payment, before saving cash or UPI, the admin app asks the server to close any open online payment link for that due. If that ask fails (no internet, or the server or payment company does not answer), the app saves the desk payment anyway and says nothing. The link the member already has on their phone stays open. They can still pay it, and pay the same due a second time.
**Who it hurts and how often:** Members and desk staff, on each desk payment made while that check fails and a link is open. Today payment links are in test mode only, so no real money moves yet; it bites once live payments are switched on.
**Proof:** Found by reading the code. Send a member a payment link, turn the internet off, take cash for that due on Collect payment: it saves with no warning, and the link still opens.
**Fix:** When the link check fails, warn the desk on the sheet and keep the warning on the member's page until the link is closed. Size: small.
**Your decision:** Yes. My view: warn and let the cash save, because blocking the desk when the internet is down is worse. Option 1: save the cash and show a warning until the link is closed. Option 2: refuse to save the cash until the link can be closed.
Finding: FN-L5-panel-forms-01

### Member who paid twice shows "more than due", no refund prompt

**How bad:** Serious. Money and trust: the gym keeps a double payment without knowing it owes money back.
**What you would see:** The desk takes cash for a due. Later the member pays an old online link for the same due. On Today, under Paid online, a card says the payment is more than what is due and asks the desk to save it by hand and tap I saved it. It does not say the member has paid twice or is owed a refund. The app does know the link was paid after it was closed.
**Who it hurts and how often:** Members who pay twice, and desk staff, each time an old link is paid after the desk took the money. It needs live payments, which are switched off today.
**Proof:** Found by reading the code. Take cash for a due that has an open link, then pay the old link in test mode: the Paid online card says only "more than what is due".
**Fix:** Name it a double payment on the card, show both payments, and ask the desk to refund one at the payment company instead of I saved it. Size: small.
**Your decision:** Yes. My view: say "paid twice, refund one" plainly; members who notice a double charge first will lose trust in the gym. Option 1: name the double payment and ask for a refund. Option 2: also add the refund owed to the owner's money counts until it is done.
Finding: FN-L5-panel-pay-machines-05

### Online-paid joiners show "Not paid yet" on Enquiries and can be recharged

**How bad:** Serious. Money: the desk can take the joining fee in cash from someone who already paid online.
**What you would see:** On the Enquiries page, every online join request says "Not paid yet.", even when the person paid online. Add as member on that page opens Sell membership with the whole fee due, does not close the person's open payment link, and gives no warning. Only the Joined online card on Today checks the payment and offers Approve. So the desk can take cash from someone who already paid, and the person can still pay online after paying at the desk. The money check later says "They may have paid twice".
**Who it hurts and how often:** Owners, desk staff and members who join online, every time the desk opens an online-paid join from Enquiries instead of Today. It needs online join payments to be live, which they are not today.
**Proof:** Found by reading the code. Join a test gym online and pay in test mode, then open Enquiries: the row says "Not paid yet." and Add as member asks for the full fee.
**Fix:** Show Paid online on the Enquiries row, and make Add as member do what Today's card does: close open links and send a paid request to Approve. Size: medium.
**Your decision:** Yes. My view: make Enquiries behave exactly like Today's card, so the desk cannot pick the wrong door. Option 1: fix Enquiries to check the payment. Option 2: hide online join requests from Enquiries and handle them only on Today.
Finding: FN-L5-panel-screens-1-01

### Shop order paid online looks unpaid, and Collected says cash taken

**How bad:** Serious. Money: the desk can take cash for a shop order the member already paid for in the app.
**What you would see:** A member pays for a shop order in the member app. Our server notes it as paid online, but the admin app never reads that note. On the Shop page the order card looks exactly like an unpaid one and still offers the pay-by-QR or link box. When the desk taps Collected (paid), it shows "Order N collected, Rs X taken", as if the money was just taken at the desk.
**Who it hurts and how often:** Members and desk staff, every shop order paid in the member app. It needs live payments, which are switched off today.
**Proof:** Found by reading the code. Pay for a shop order in the member app in test mode, then open the Shop page: the order shows no Paid online mark.
**Fix:** Show Paid online with the amount on each order card, hide the pay box, and say "paid online" when the desk taps Collected. Size: small.
**Your decision:** Yes. My view: show the paid mark; it is a small change that stops a double charge at the counter. Option 1: show Paid online and change the Collected words. Option 2: also block the desk from marking cash on an order paid online.
Finding: FN-L5-panel-shop-01

### Paid shop orders can be cancelled with no refund prompt

**How bad:** Serious. Money and trust: the member's money stays with the gym and nobody knows it is owed back.
**What you would see:** On the Shop page, the Cancel order sheet says the items go back into stock and the member sees Cancelled. It never checks whether the member already paid online, and says nothing about a refund. The member can also cancel their own new order in the app, even after paying. Cancelling does not close the order's payment link either, so a saved link can still be paid for a cancelled order. The money stays at the gym's payment company with no record that it is owed back.
**Who it hurts and how often:** Members and owners, each time a shop order paid online is cancelled. It needs live payments, which are switched off today.
**Proof:** Found by reading the code. Pay for a shop order in the member app in test mode, then cancel it on the Shop page: no refund words appear, and the payment link still opens.
**Fix:** Check for an online payment before cancelling, close open links, and tell the owner the money must be refunded. Size: medium.
**Your decision:** Yes. My view: stop members cancelling a paid order on their own, and make the gym's cancel ask for a refund; the gym should own every refund. Option 1: members cannot cancel a paid order; the gym's cancel asks for a refund. Option 2: members can cancel, and the gym gets a "refund owed" item on Today.
Finding: FN-L5-panel-shop-02

### Members who bought MettleUp Plus can be charged a second time

**How bad:** Serious. Money and trust: Google Play can charge a member twice, or keep charging monthly after they "switched" to yearly.
**What you would see:** The member app decides whether to show the buy buttons only from what it remembers on the phone. After Erase all data, or when Google Play did not answer when the app started, it forgets the purchase until the next fresh start. In that gap the member sees the monthly, yearly and for-life buttons again. A for-life member who taps monthly, or a monthly member who taps for life, is charged again with no warning. A monthly member who taps yearly is told Thank you and shown "you pay every year", while Google Play keeps charging every month.
**Who it hurts and how often:** Members who bought MettleUp Plus, only after Erase all data or when Google Play did not answer at app start. Nobody today, because buying Plus is switched off in the app.
**Proof:** Found by reading the code. With buying switched on in a test build, buy Plus, tap Erase all data, then open the Plus screen: the buy buttons show again.
**Fix:** Ask Google Play what the account owns each time the Plus screen opens, hide the buy buttons for an owner, and keep the plan Google Play reports. Size: small.
**Your decision:** Yes. My view: fix it before buying is switched on; a double charge on Google Play brings refunds and one-star reviews. Option 1: fix now, before paid Plus goes live. Option 2: fix later, and only switch buying on once it is done.
Finding: FN-L5-phone-lib-core-01

### Members still see the old UPI ID after the owner changes it

**How bad:** Serious. Money: members can send fees to an account the gym no longer uses.
**What you would see:** The owner saves a new UPI ID for the gym. A member's open fee and any open shop order keep showing the old QR, the old Pay by UPI link and the old ID to copy, for up to 30 days. A shop order reuses that same old request each time the member taps pay. Money sent that way goes to an account the gym may no longer use, or to a staff member's old ID.
**Who it hurts and how often:** Members and owners, each time a gym changes its UPI ID while payments are still open.
**Proof:** Found by reading the code. Ask a test member to pay a fee, change the gym's UPI ID, then open the fee in the member app: the QR still carries the old ID.
**Fix:** Always show the gym's current UPI ID when a member opens a payment. Size: small.
**Your decision:** Yes. My view: always use the current ID; an owner who changes it means money must stop going to the old one. Option 1: show the current ID on every open payment. Option 2: also tell members with an open payment that the gym's UPI ID changed.
Finding: FN-L5-phone-shop-1-01

### Test-mode payments are announced to members and owners as real

**How bad:** Serious. Trust: members get a real-looking "pay your fee" pop-up and owners see "paid" when no money moved.
**What you would see:** While payments are still in test mode (no real money), a payment request goes out like a real one. The member's phone shows a pop-up saying their gym asked them to pay their fee, tap to pay. When a test payment is made, the gym's bell says the member paid online, see it on Money. Neither says it is a test, though each payment request knows whether it was test or live.
**Who it hurts and how often:** Members and owners, on every payment request or payment while payments are in test mode, which is every gym today.
**Proof:** Found by reading the code. In a test gym, send a member a fee request in test mode: the member gets the normal "pay your fee" pop-up with no test label.
**Fix:** Send no pop-up to members for test requests, and label test payments "test, no real money" on the bell. Size: small.
**Your decision:** Yes. My view: send no member pop-up for test requests, and label the owner's bell alert as a test; members should never meet our tests. Option 1: no member pop-up, owner alert labelled test. Option 2: keep both, labelled test.
Finding: FN-L5-server-database-3-04

### Member app shows test payments as paid; the gym records nothing

**How bad:** Serious. Money and trust: a member thinks they paid, but the due stays open at the desk.
**What you would see:** Payments are in test mode for every gym today. Yet any gym that connects Razorpay or Cashfree has member app payments switched on by default. Members then get test payment pages for their dues and shop orders. A member who finishes one sees "Paid, thank you" (or "Paid. The gym can see it." for a shop order), while no money moved. The gym's Shop page does not show the order as paid, and the due stays open at the desk. The join page and the gym's web page already keep test payments away from members; the member app does not.
**Who it hurts and how often:** Members of gyms that connected a payment company, on every member payment while payments are in test mode.
**Proof:** Found by reading the code. Connect a payment company to a test gym, pay a fee from the member app: it says Paid, and the desk still shows the fee as owed.
**Fix:** Offer payment company links in the member app only when payments are live, the same rule as the join page. Size: small.
**Your decision:** Yes. My view: use the join page's rule; in test mode members should see the UPI QR or "pay at the desk". Option 1: hide company links until payments are live. Option 2: keep them, but label the page as a test with no real money.
Finding: FN-L5-server-panel-worker-01

### Cloudflare free-limit warning comes weekly, after the busy day is over

**How bad:** Serious. Trust: on a busy day every MettleUp app stops, and HQ only says so days later.
**What you would see:** HQ checks Cloudflare's daily request count only on Monday night, for the week before. If a Tuesday runs past the free daily limit, every MettleUp app stops working until 05:30 the next morning. HQ only warns about it the following Monday. Only requests are watched; other free Cloudflare limits are not. Keeping the check light was your earlier ask, so this is a trade-off, but a busy day still goes unseen for up to a week.
**Who it hurts and how often:** Every gym and member, on any day the apps get unusually busy.
**Proof:** Found by reading the code. Look at HQ's usage check: it runs only on Mondays and reads only the request count.
**Fix:** Check the day's count every few hours and warn on Needs you the same day it passes 60%, or move to Cloudflare's paid plan once gyms rely on it. Size: small.
**Your decision:** Yes. My view: add the same-day warning now, and move to the paid plan when the first paying gyms are live. Option 1: same-day warning at 60%. Option 2: move to the paid plan now.
Finding: FN-L8-hq-app-01

### One member account can fill the whole shared database

**How bad:** Serious. Trust: one broken or misused phone could stop every gym's desk from saving.
**What you would see:** Anyone who signs in with Google gets a workout copy on our server. It is capped only by count (30,000 items) and by size per item (32 KB). Together that is close to 1 GB for one account, while the whole free database is 500 MB and is shared by every gym. Nothing limits the total size per member or how fast one account can write. If one account fills the database, desks in every gym stop saving.
**Who it hurts and how often:** Every gym, through any one member account. It needs a damaged or misused phone; a normal member never comes close.
**Proof:** Found by reading the code. The server checks only the item count and the size of each item, never the total for one account.
**Fix:** Add a total size cap per member copy (a few MB is years of real training) and a write speed limit on the server. Size: small.
**Your decision:** No.
Finding: FN-L8-phone-cloud-backup-ai-01

### Very long workouts are silently left out of the backup

**How bad:** Serious. Data lost: a member moves to a new phone and one workout is missing, though Settings said all was saved.
**What you would see:** A workout bigger than the backup's size limit per item is skipped. It is noted only in a log no member can see. It never joins the waiting count, so the backup line in Settings says the workouts are saved. On a new phone, that workout is missing.
**Who it hurts and how often:** Members with very long workouts, which is rare.
**Proof:** Found by reading the code. Save a test workout bigger than the size limit, let the backup run, then check Settings: it says everything is saved, and the workout is not on the server.
**Fix:** Show a "not saved" line for a workout over the size limit, or split it so it fits. Size: small.
**Your decision:** No.
Finding: FN-L8-phone-cloud-backup-ai-02

### After 1,000 help messages a day, every member's message is refused

**How bad:** Serious. Trust: a member reporting a real problem is turned away, and the team never hears of it.
**What you would see:** The help and feedback box takes at most 1,000 messages a day from everyone together. After that, every member who writes in reads "Too many messages today", and the message is thrown away. The phone does not keep it to send later. Nobody at MettleUp is warned before or when the limit is hit.
**Who it hurts and how often:** Members, on any day the shared limit is reached. Messages are few today, but spam from many addresses could hit it.
**Proof:** Found by reading the code. Send 1,000 help messages in one day from test phones, then send one more: it is refused and no alert reaches the team.
**Fix:** Warn the team when the day's count nears the limit, and let the phone keep a refused message and send it again later. Size: medium.
**Your decision:** No.
Finding: FN-L8-phone-components-2-03

### Aadhaar in Hindi digits or with dots slips through member import

**How bad:** Serious. Privacy: a member's full Aadhaar number can be saved even though the import promises to cut it.
**What you would see:** When an owner imports members from a file, the app cuts out any Aadhaar number it finds. It only spots one written in English digits with spaces or dashes. An Aadhaar written in Hindi digits, or with dots between the groups, comes in whole. No test checks this, nor a row fixed under "Rows to check", importing the same file twice, or the skipped-rows download. The import screen's promise line about ID numbers is never tested either.
**Who it hurts and how often:** Gym members, on any import where an ID number is written in Hindi digits or with dots. The first reading called this only a missing test; a second check found the real gap.
**Proof:** Found by reading the code. Import a file with an Aadhaar number written in Hindi digits, then open that member: the full number is there.
**Fix:** Make the cut read Hindi digits and dots, and add tests for those, the fixed row, the second import and the skipped-rows file. Size: small.
**Your decision:** No.
Finding: FN-A8-panel-logic-1-4-07

### Online joiner who paid shows "pay at the desk" after 45 days

**How bad:** Serious. Money: the desk can take the joining fee a second time in cash.
**What you would see:** A person joins online and pays the fee in the app. The request sits on Today's "Joined online" card for more than 45 days without anyone approving it. The card then forgets the online payment: it shows "pay at the desk" and Make member instead of "Paid online" and Approve. The warning that normally stops a second charge cannot see the payment either.
**Who it hurts and how often:** Desk staff and people who join online and pay, but only when a paid request is left waiting more than 45 days. The test gym has no open join requests, so nobody has been seen hitting it.
**Proof:** Found by reading the code. Leave a paid online join request unapproved for 46 days, then open Today: the card says "pay at the desk".
**Fix:** Look up the payment for each open join request, however old, instead of only the last 45 days. Size: small.
**Your decision:** No.
Finding: FN-B-truth-server-panel-worker-b-02

### A new branch gets the first branch's paid plan for free

**How bad:** Serious. Money: MettleUp loses the fee for every branch added after a gym has paid.
**What you would see:** An owner who has paid MettleUp for a year adds a second branch. The new branch gets the same plan and the same paid-until date, so it is paid for the year without paying anything. A founding gym (Pro for life, meant for one branch) gets Pro for life on every new branch, and each of those branches also uses up one of the 25 founding places. The add-branch sheet only talks about the free trial.
**Who it hurts and how often:** MettleUp, every time a paid or founding gym adds a branch. HQ can correct a branch's plan by hand once someone notices.
**Proof:** Found by reading the code. In a test gym on a paid yearly plan, add a branch, then look at that branch's plan in HQ: it shows the same plan and paid-until date.
**Fix:** Give a new branch only the trial dates, its own unpaid plan after that, and keep the founding offer to the first branch. Size: medium.
**Your decision:** Yes. My view: new branches share only the trial, then pay their own price; founding stays one branch, one place. Option 1: that change. Option 2: let founding gyms keep Pro for life on all branches, but stop them using up extra founding places.
Finding: FN-L5-panel-pay-machines-01

### Extra branches are asked full price; the website promises half

**How bad:** Serious. Money and trust: owners are asked more than the website promised.
**What you would see:** The website home page and the About page say each extra branch pays half price. When a second or third branch buys or renews its MettleUp plan, the price is worked out from the plan and monthly or yearly only. So the extra branch is asked for the full price.
**Who it hurts and how often:** Owners with more than one branch, on every payment an extra branch makes. Online plan payment is switched off today and HQ checks each hand-entered payment, so nobody has been overcharged without someone seeing it yet.
**Proof:** Found by reading the code. In a test gym with two branches, start a plan payment from the second branch: the price shown is the full plan price.
**Fix:** Halve the price for any branch that is not the gym's first, or change the website words. Size: medium.
**Your decision:** Yes. My view: keep the half-price promise and fix the price; it is already public and a good reason to add branches. Option 1: charge half for extra branches. Option 2: change the website and About page to full price per branch.
Finding: FN-L5-panel-pay-machines-02

### Data agreement promises every look is listed; direct looks are hidden

**How bad:** Serious. Privacy and legal: the signed agreement says more than the product does.
**What you would see:** The data agreement for gyms, and the MettleUp access card in the admin app, both tell the owner that every look at their records is recorded and listed there. The admin app only lists looks made through a support window the owner opened. Looks made straight in the database with MettleUp's own login are sent to the admin app but never shown. Some may not be recorded at all: the record stays off until a logs key is saved in HQ, and looks made with the master server key are never recorded.
**Who it hurts and how often:** Every gym owner who accepted the data agreement, for every direct look MettleUp makes at their data.
**Proof:** Found by reading the code. Open the MettleUp access card in the admin app after a direct database look at a test gym: only support-window looks appear.
**Fix:** Show direct looks on the MettleUp access card and make sure the logs key is saved, or narrow the sentence in the agreement and the card. Size: medium.
**Your decision:** Yes. My view: show the direct looks and turn the record on; the promise is a selling point and narrowing it reads badly. Option 1: show every look on the card. Option 2: change the agreement and card to say which looks are listed.
Finding: FN-A3-notes-claude-1-01

### Website says staff need the owner's yes; HQ emergency button skips it

**How bad:** Serious. Privacy and trust: the home page makes a promise that HQ can break.
**What you would see:** On the gym-owner home page, under "Closed to our staff", MettleUp says its staff cannot open the member list unless the owner lets them in for 1 hour. HQ has an "Open in an emergency" button. MettleUp picks a reason, types a sentence, picks 15, 30 or 60 minutes, and the gym's records open read-only with no yes from the owner. The owner does see it afterwards, with the reason. The privacy page and the data agreement already mention emergency access; only the home page leaves it out.
**Who it hurts and how often:** Gym owners reading the home page, on every visit; it matters the first time MettleUp uses the emergency button.
**Proof:** Found by reading the code. Read the "Closed to our staff" line on the home page, then look at the "Open in an emergency" button in HQ.
**Fix:** Change the home page line to say MettleUp can open read-only access in an emergency and the owner sees every look, or remove the button. Size: small.
**Your decision:** Yes. My view: change the home page line; emergency access is useful and already in the agreement. Option 1: reword the home page. Option 2: make the emergency button wait for the owner's yes.
Finding: FN-A3-website-1-01

### Website says AI sees column names only; it also sees 5 rows

**How bad:** Serious. Privacy: the home page says less goes to the AI company than really does.
**What you would see:** On the home page, the "Import members with AI" card has the tag "AI never sees member details", and the demo says "AI · columns only". When an owner imports a member file, the AI is sent the column names and up to 5 example rows. Mobile numbers, emails and ID numbers are hidden, and names and addresses are swapped for a placeholder. But the other cells in those rows, such as plan, fees paid, dates and any extra columns, do go to the AI company. The privacy page already says this correctly.
**Who it hurts and how often:** Gym owners reading the home page, on every visit, and every member file imported with AI.
**Proof:** Found by reading the code. Read the tag on the home page card, then compare it with the privacy page, which describes the example rows.
**Fix:** Reword the tag to "AI never sees phone numbers or names", or send the column names only. Size: small.
**Your decision:** Yes. My view: reword the tag; the example rows make the matching work better and the privacy page already admits them. Option 1: reword the home page tag. Option 2: send only column names to the AI.
Finding: FN-A3-website-1-02

### Members' AI answers use credits; website says only Assistant tasks do

**How bad:** Serious. Money and trust: owners lose credits in a way the price pages never mention.
**What you would see:** The home page says a credit is used only when the AI Assistant sends or saves something. The About page says credits are used only when the AI finishes a task for the owner. But when members ask the AI a question in the app, their answers also use the gym's credits: 10 answers use 1 credit, up to the owner's monthly limit. That charge is switched on in the code; whether it is on in the live settings could not be checked.
**Who it hurts and how often:** Gym owners, on every visit to the price pages, and every time members ask the AI.
**Proof:** Found by reading the code. Have a test member ask the AI 10 questions, then look at the gym's credit count: it drops by 1.
**Fix:** Add one line to the home page and one row to the About page: members' AI answers, 10 answers = 1 credit, owner can switch it off. Size: small.
**Your decision:** Yes. My view: add the line; the charge is fair but only if owners are told. Option 1: add the line to both pages. Option 2: stop charging credits for members' answers.
Finding: FN-A3-website-1-03

### No test checks signing out with a refused payment kept

**How bad:** Serious. Money: a broken change here could lose a payment and the cloud tests would not catch it.
**What you would see:** Nothing changes on screen today. The risk is that a future change breaks it unseen. When the server refuses a payment the desk saved, the admin app keeps it and warns on sign out. The only automatic test of signing out with waiting items uses one waiting check-in. No test keeps a refused payment, signs out, signs back in with a PIN and checks the payment is still named at the top. No test covers a gym with branches or the wording for many waiting items.
**Who it hurts and how often:** Owners and desk staff, on every sign out with an unsent item, if a later change breaks it.
**Proof:** Found by reading the code. Search the automatic tests for the refused-payment sign-out warning words: none contains them.
**Fix:** Add a test that keeps a refused payment, signs out, signs in again with a PIN, in a gym with branches. Size: medium.
**Your decision:** No.
Finding: FN-A8-panel-auth-data-1-06

### No test sells or renews a training pack on screen

**How bad:** Serious. Money: training-pack sales could break and the cloud tests would not catch it.
**What you would see:** Nothing changes on screen today. The risk is that a future change breaks it unseen. No automatic test sells a personal training pack on screen. The pack's line and its one-session wording, the start date jumping to today, the emptied boxes, Renew PT on the training card, Renew PT hidden for a plan no longer on sale, and a second pack next to the first are only checked as data or not at all.
**Who it hurts and how often:** Owners and front desk selling personal training, on every sale, if a later change breaks it.
**Proof:** Found by reading the code. Search the screen tests for "Renew PT": none uses it, and the only training test puts a pack in by hand instead of selling one.
**Fix:** Add a screen test that sells and renews a training pack beside a gym plan, as owner and as desk. Size: medium.
**Your decision:** No.
Finding: FN-A8-panel-forms-3-02

### Refused or lost desk saves stay hidden on that one computer

**How bad:** Serious. Money and data lost: cash or a new member can go missing and nobody at MettleUp or the owner hears.
**What you would see:** A desk computer saves a payment, a new member or a check-in without internet. Later the gym's server refuses it, or the desk cannot keep it at all. The reason is written only into the browser's hidden log on that one computer. Automatic crash reports never pick it up, so MettleUp is not told. An owner looking on another phone does not see the held cash either.
**Who it hurts and how often:** Owners and front desk, every time an offline save is refused or gets stuck.
**Proof:** Found by reading the code. Save a payment at a test desk with internet off, make the server refuse it, then check MettleUp's crash reports and the owner's phone: neither shows it.
**Fix:** Send MettleUp a short note with no member details for each held or lost desk save, and show held items to the owner on every device. Size: medium.
**Your decision:** No.
Finding: FN-B-run-panel-auth-data-a-01

### "Try again" on a slow import can drop members' plans and payments

**How bad:** Serious. Data lost: members' money history from the old software silently goes missing.
**What you would see:** An owner imports members from old software. A batch is sent, but on a slow connection the answer never comes back, so the import marks those rows as not saved and offers Try again. In fact the save had landed. Try again now finds those members already in the gym and calls them "Already a member". Their plans and payments are then not sent at all, and the rows stop showing as waiting, so nothing tells the owner the money history is missing.
**Who it hurts and how often:** Owners importing from old software, only when a save times out but still lands.
**Proof:** Found by reading the code. Import a file on a connection slowed until a batch times out, tap Try again, then open one of those members: no plan or payments.
**Fix:** On Try again, count members the earlier save already brought in as added and still send their plans and payments. Size: small.
**Your decision:** No.
Finding: FN-B-run-panel-logic-1-a-01

### If WhatsApp codes stop, owners are locked out and nobody is alerted

**How bad:** Serious. Trust: owners cannot reset a PIN or start a gym, and MettleUp only hears when they call.
**What you would see:** Forgot PIN and the phone number check for a new gym both use a WhatsApp code. If WhatsApp's owner Meta stops delivering codes, or stops passing back the person's reply (a payment block, a paused message template, a changed password between the two), each failure is only a line in a log. Nothing counts the failures or warns anyone. Owners stay locked out until one of them calls MettleUp.
**Who it hurts and how often:** Owners, whenever WhatsApp delivery breaks.
**Proof:** Found by reading the code. Look at the outage watcher and the nightly checks: none counts or alerts on failed WhatsApp codes.
**Fix:** Count failed WhatsApp checks and alert MettleUp within the hour when they pass a limit. Size: medium.
**Your decision:** No.
Finding: FN-B-run-server-panel-worker-a-04

### AI Assistant shows lower monthly profit than Expenses; skips shop sales

**How bad:** Serious. Trust: two screens give the owner two different profits for the same month.
**What you would see:** The Expenses page counts shop orders handed over this month as money in, next to fees. When the owner asks the AI Assistant for this month's profit, it adds up fees only but still takes off the stock bought for the shop. A gym that sells supplements sees a smaller profit, or even a loss, in the assistant. Questions about a range that is not a whole month also count fees only.
**Who it hurts and how often:** Owners who sell in the shop, every time they ask the assistant about profit in a month with shop sales.
**Proof:** Found by reading the code. In a test gym, sell a shop item this month, then compare the Expenses page profit with the assistant's answer to "What is my profit this month?".
**Fix:** Count shop sales in the assistant's profit, as the Expenses page does. Size: small.
**Your decision:** No.
Finding: FN-B-switch-panel-screens-1-a-02

### Removed staff's unsent offline cash stays on their phone, unannounced

**How bad:** Serious. Money: payments taken at the desk never reach the gym's records.
**What you would see:** A staff member takes cash or sells a plan with no internet, and it waits on their phone. The owner then removes that person when they leave. The owner's Remove box says "Your members and payments stay as they are". The removed person's phone just says "You no longer have access". The waiting payments stay on that phone and are sent only if someone from the same gym signs in on that very phone again. Nobody is told, so the receipts are missing from dues and money totals.
**Who it hurts and how often:** Owners and desk staff, whenever a staff member leaves with unsent offline payments on their phone.
**Proof:** Found by reading the code. On a test staff phone, take a payment with internet off, remove that staff member from the owner's phone, then check the member's dues: the payment is not there.
**Fix:** Warn the owner in the Remove box, and show the removed phone how many payments still wait there and to hand it to the owner once. Size: medium.
**Your decision:** No.
Finding: FN-B-time-panel-auth-data-01

### Approving a member's pause can give free months after the plan ends

**How bad:** Serious. Money: a member can train for months without paying.
**What you would see:** A member can ask in the app to pause any days starting up to 90 days ahead, as long as their plan has not ended on the day they ask. When the desk taps Approve, all the paused days are added to the end of the plan, with no check that the plan still runs. So a member whose plan ends on 25 Nov can ask to pause 1 Dec to 28 Feb; Approve moves the end to late February and he trains three months free. A request left waiting until after the plan ended is approved the same way. The request card shows only the pause dates, not when the plan ends, so the desk cannot spot it.
**Who it hurts and how often:** Owners and front desk, whenever a member asks to pause near or after the end of a plan.
**Proof:** Found by reading the code. Give a test member a plan ending this week, ask in the app to pause next month, approve it, and see the plan end move out by the whole pause.
**Fix:** Add only the paused days that fall inside the plan, refuse a pause on an ended plan, and show the plan's end on the card. Size: small.
**Your decision:** Yes. My view: count only the days inside the plan; that matches what a gym means by a pause. Option 1: add only days inside the plan and refuse ended plans. Option 2: keep adding all days but show the plan's end so the desk decides.
Finding: FN-B-time-panel-logic-2-01

### Switching on the plan lock freezes long-expired trials with no warning

**How bad:** Serious. Trust: old gyms wake up read-only after being told nothing would lock.
**What you would see:** The plan lock gives a gym 7 grace days and then 30 basic days after its trial or paid time ends, and only then makes it read-only. It counts those days from the old end date, not from the day the lock is switched on. Gyms made before billing existed were told nothing locks when a trial ends. Any such gym whose trial ended more than 37 days before the switch wakes up read-only: no new members, nothing saved, only looking and downloading, without ever seeing a warning.
**Who it hurts and how often:** Owners of gyms whose trial ended before the lock goes on, once, on the day it is switched on. The lock is switched off today, so nobody is hurt yet.
**Proof:** Found by reading the code. In a test copy, switch the plan lock on for a gym whose trial ended two months ago, then open its admin app: it is read-only with no grace or basic days shown.
**Fix:** Count the warning days from the later of the trial end and the day the lock is switched on. Size: small.
**Your decision:** Yes. My view: give every existing gym the full 37 warning days from switch-on day; that keeps the old "nothing locks" promise fair. Option 1: count from switch-on day. Option 2: tell those owners by WhatsApp and give them a fixed date before switching on.
Finding: FN-B-time-server-database-2-01

### Undoing a second import file leaves members owing money they never owed

**How bad:** Serious. Money and trust: members are chased for dues they do not owe.
**What you would see:** An owner imports a payments list in two files. When the second file adds payments to a plan the first file made, the plan's price goes up to match. If the owner then taps Undo this import on the second file, its receipts are removed but the raised price stays. The member's page and the dues list then show money owed equal to the removed receipts, though the member owes nothing.
**Who it hurts and how often:** Owners, whenever a payments list is imported in two files and the second is undone.
**Proof:** Found by reading the code. Import a member with a plan, import a second file with that member's payment, undo the second file, then open the member: dues show the removed amount.
**Fix:** Remember the old price when an import raises it, and put it back on undo. Size: medium.
**Your decision:** No.
Finding: FN-B-truth-panel-auth-data-a-01

### Paid online joiner marked lost gets wrong "may have paid twice" advice

**How bad:** Serious. Money: the gym keeps a person's money without making them a member, and the screen does not say to refund.
**What you would see:** Joining and paying online is live. If the desk taps "Not interested" on Enquiries for a person who already paid online, instead of Approve, the gym holds their money but they are not a member. The "Paid online, receipt not made" card then says they were made a member without Approve and may have paid twice, and tells the desk to save the payment on their member page. There is no member page and no Open member button, and nothing says to refund.
**Who it hurts and how often:** Desk staff and owners using online joining with payment, each time a paid joiner is marked lost.
**Proof:** Found by reading the code. In a test gym, join and pay online, mark the enquiry "Not interested", then read the card on Today.
**Fix:** Give a paid joiner who did not join their own message that says to refund them. Size: small.
**Your decision:** Yes. My view: show a clear "paid but did not join, refund them" message; blocking "Not interested" would trap the desk when someone truly backs out. Option 1: the refund message. Option 2: stop the desk closing a paid joiner until they choose Approve or refund.
Finding: FN-B-truth-panel-pay-machines-a-02

### Undo import deletes members already using the app or measured

**How bad:** Serious. Data lost: real members and their measurements vanish, though the screen says nothing of yours is removed.
**What you would see:** When the owner undoes a past import, a member is kept only if they have since checked in, paid at the desk, got extra days, been edited or had a training session. A member who has linked the member app, had weight and body fat measured, got a door-machine number, or been sent a workout or diet plan is still removed. Their app link, measurements and door number are left pointing at a member who no longer exists. The confirm screen says "Nothing you added yourself is removed."
**Who it hurts and how often:** Owners who undo an import some days later, each time members have started using the app or been measured.
**Proof:** Found by reading the code. Import a test member, measure them at the desk, then undo the import: the member is gone.
**Fix:** Keep any imported member who has used the app, been measured, been given a door number or been sent a plan. Size: medium.
**Your decision:** No.
Finding: FN-B-truth-panel-screens-1-a-01

### If the AI key goes missing, the AI Assistant silently vanishes

**How bad:** Serious. Trust: a paid feature disappears for every owner and MettleUp is not told.
**What you would see:** If the key MettleUp uses to reach the AI is removed or expires, or one usage record cannot be read, the server says the assistant is switched off. The admin app then hides the AI Assistant with no word to the owner. A missing key is not even logged, so nobody at MettleUp hears. The assistant also borrows the help box's key when its own is missing, so one lost key can stop both.
**Who it hurts and how often:** All owners and MettleUp, whenever a key is removed or expires, or the usage record cannot be read.
**Proof:** Found by reading the code. In a test copy, remove the assistant's AI key and open the admin app: the AI Assistant is gone and no alert is raised.
**Fix:** Hide the assistant only when it is switched off on purpose; otherwise alert MettleUp and show the owner a calm "not working right now" line. Size: medium.
**Your decision:** No.
Finding: FN-L14-panel-assistant-04

### Visitor reports of a scam gym page reach nobody at MettleUp

**How bad:** Serious. Trust: a scam or offensive gym page can stay up because nobody at MettleUp ever hears about it.
**What you would see:** A visitor opens a gym's web page, taps "Report this page" and picks scam, offensive or closed. They get a thank-you and the report is saved. But no screen in HQ, and nothing in Needs you, ever lists those reports. HQ does have a "Switch the web page off" button on each gym, so a page can be taken down, but only if someone hears about it some other way.
**Who it hurts and how often:** Visitors who report a page, and every honest gym whose name sits next to a bad page. Every report goes unread today.
**Proof:** Found by reading the code. Report a test gym's web page, then look through HQ and Needs you: the report shows up nowhere.
**Fix:** Add a list of reports to HQ, count new ones in Needs you, and put the take-down button next to each report. Size: medium.
**Your decision:** No.
Finding: FN-L14-server-database-3-01

### Gym paying for Starter while on Pro stays on Pro for ever

**How bad:** Serious. Money: the gym gets Pro at the Starter price, and its screen shows a wrong date.
**What you would see:** A gym on Pro, or in its free trial, pays for Starter and HQ confirms the payment by hand. The gym is told Starter starts the day Pro ends. That day comes and goes, and the gym is still on Pro. Its admin app keeps showing a Starter start date that has already passed. The switch is only made by the nightly billing run, and that run only works when online buying is switched on. Online buying is switched off today.
**Who it hurts and how often:** MettleUp, which loses the Pro price, and owners, who see a date that makes no sense. Every Starter payment HQ confirms for a gym still on Pro or trial.
**Proof:** Found by reading the code. Confirm a Starter payment in HQ for a test gym on its trial, wait past the trial's last day, and the gym is still on Pro.
**Fix:** Make the planned plan switch run every night on its own, whether online buying is on or off. Size: small.
**Your decision:** Yes. My view: fix it, and move any gym already caught to Starter only after telling its owner; a silent drop of Pro features looks like a fault. Option 1: move caught gyms to Starter with a short message first. Option 2: let caught gyms keep Pro until their Starter time runs out.
Finding: FN-L14-server-hq-gate-workers-01

### Deleting a gym keeps its payment keys and payment records

**How bad:** Serious. Privacy and trust: a gym that leaves keeps its payment company keys and member payment records with us.
**What you would see:** HQ deletes a gym that has left. The gym's data and files are cleared. But a second, smaller MettleUp database still holds that gym's locked Razorpay or Cashfree keys and sign-in passes, every payment link it made with member ids and amounts, and its AI limits. The keys are only wiped if the desk pressed Disconnect first, which a leaving gym may never do. Nothing ever removes the payment link records. The data agreement promises all of it is gone within 30 days.
**Who it hurts and how often:** Owners and their members, every time a gym leaves.
**Proof:** Found by reading the code. Connect a payment company on a test gym, make one payment link, delete the gym in HQ, then look in the small web database: the keys and the link record are still there.
**Fix:** Make deleting a gym also clear everything about it in the small web database, and record that it was done. Size: medium.
**Your decision:** No.
Finding: FN-L14-server-panel-worker-01

### Desk staff can make any member free for ever with one tick

**How bad:** Serious. Money: a desk person can give free gym time with no owner approval and no alert.
**What you would see:** On the add or edit member form, a desk login can tick "Comes with a pass" and type any company name. That member then never shows as expired. They drop off the renewal list and the expiring numbers, and the entry machine lets them in with no end date. The owner only finds out by reading the Pass visits page and spotting a company that pays nothing.
**Who it hurts and how often:** Owners whose desk staff cheat, whenever a desk person chooses to. The server already refuses a desk discount above 10%, but it does not check this tick.
**Proof:** Found by reading the code. Sign in with a desk login, edit a lapsed member, tick "Comes with a pass", type any name and save: the member turns active with no end date.
**Fix:** Show the pass tick only to the owner, and have the server refuse it from a desk login. Size: small.
**Your decision:** Yes. My view: owner-only; a pass member is a money choice, and the desk rarely needs it. Option 1: only the owner can tick it. Option 2: the desk can tick it, but it waits for the owner's okay.
Finding: FN-L19-panel-forms-01

### Strangers can lock owners out, and new gym sign-ups get refused

**How bad:** Serious. Trust: a real owner can be locked out of sign-in, and new gyms can be turned away.
**What you would see:** Both apps reach the gym server through MettleUp's own address, so a block on the server's usual address in India cannot stop them. But because of this, the gym server sees every person as the same sender. Anyone who knows an owner's or desk person's mobile number can type 5 wrong PINs and lock that person out for 15 minutes, again and again. And once 5 new gyms sign up in any one hour, every further new gym that hour is told the system is busy.
**Who it hurts and how often:** Owners and desk staff signing in, and new gyms signing up. The lock-out happens only if someone does it on purpose. The sign-up refusal happens whenever more than 5 gyms sign up in one hour.
**Proof:** Found by reading the code; the shared address was not tried live. Type 5 wrong PINs for a test owner's number from one phone, then sign in with the right PIN from another phone: it is refused.
**Fix:** Have MettleUp's own server pass each person's real address to the gym server, so limits count each person on their own. Size: medium.
**Your decision:** No.
Finding: FN-L3-server-panel-worker-01

### People who only enquired can never be erased from a gym's list

**How bad:** Serious. Privacy and legal: the gym cannot erase someone's details when asked, as India's data law expects.
**What you would see:** On the Enquiries page, the owner or desk can mark someone "Not interested", but there is no delete. The server refuses to delete any enquiry. So the person's name, mobile, question, follow-up notes and reason stay with MettleUp, and in its backups, for as long as the gym uses MettleUp. These people never joined. If one asks the gym to erase their details, the gym cannot, though the data agreement says the gym handles erase requests.
**Who it hurts and how often:** People who asked a gym about joining, and owners who get an erase request. Every enquiry, for ever.
**Proof:** Found by reading the code. Open Enquiries, pick any enquiry and look for a delete: there is only "Not interested".
**Fix:** Add a real delete for an enquiry, and clear old not-interested enquiries after a set time that the privacy notice states. Size: medium.
**Your decision:** Yes. My view: add the delete now and clear not-interested enquiries after 12 months; that covers erase requests and a long sales follow-up. Option 1: delete button plus a 12-month clear-out. Option 2: delete button only, no automatic clear-out.
Finding: FN-L4-panel-screens-1-01

### Plan set by hand in HQ can drop back to Starter overnight

**How bad:** Serious. Money and trust: an owner who paid for Pro can wake up on Starter.
**What you would see:** A gym pays for Starter while its Pro or free trial is still running, so a switch to Starter is planned for later. Then HQ sets the gym's plan by hand, for example to Pro yearly after the owner paid for it. The planned switch is not cancelled. On the planned day, the nightly run moves the gym to Starter anyway. HQ never shows that a switch was planned, so nobody can spot it coming.
**Who it hurts and how often:** Owners who paid for Pro, only when an earlier Starter payment came in while Pro or the trial was running and HQ then set the plan by hand.
**Proof:** Found by reading the code. Confirm a Starter payment for a test gym in its trial, then set Pro yearly by hand in HQ, and wait for the trial's end date: the gym moves to Starter.
**Fix:** Cancel any planned switch when HQ sets a plan by hand, and show planned switches on the gym's page in HQ. Size: small.
**Your decision:** No.
Finding: FN-L5-hq-app-01

### Old test payment connection still says Connected after payments go live

**How bad:** Serious. Money: the desk cannot collect online payments and is not told why.
**What you would see:** A gym connected Razorpay or Cashfree while payments were in test mode. Once MettleUp switches live payments on, the green Connected badge stays and the Test mode label disappears. The desk taps Make a payment link and only reads that the link could not be made, try again. Nothing tells the owner to connect again with live keys, and the Paste keys button is hidden while it says Connected.
**Who it hurts and how often:** Owners and desk staff of gyms that connected in test mode, on every payment link from the day live payments start. Live payments are switched off today, so nobody meets it yet.
**Proof:** Found by reading the code. Connect a test gym with test keys, switch live payments on, then tap Make a payment link: it fails with only the general message.
**Fix:** Once payments are live, show a test connection as needing live keys, bring back Paste keys, and tell the desk why no link can be made. Size: small.
**Your decision:** No.
Finding: FN-L5-panel-pay-machines-03

### Owner whose payment got stuck is told nothing

**How bad:** Serious. Money and trust: the owner paid, but their screen looks as if nothing happened.
**What you would see:** An owner pays MettleUp online, but the money cannot become a plan. For example, the amount was not what was asked, or the gym went Pro for life on another link in between. The money is held for MettleUp to refund or set by hand. The owner's billing screen still shows the old plan and end date, no receipt, and no word that the payment arrived. Only MettleUp's office list shows it.
**Who it hurts and how often:** Owners, rarely: only when a paid link cannot be applied. Online buying is switched off today.
**Proof:** Found by reading the code. In test mode, pay a link for a test gym after changing its plan another way, then open the owner's billing screen: it shows nothing about the payment.
**Fix:** Show held payments on the owner's billing screen, with what MettleUp will do and the outcome once done. Size: small.
**Your decision:** Yes. My view: say "Payment received, we are checking it; we will refund or set your plan within 2 working days", since it promises the owner a time. Option 1: that line with a 2-day promise. Option 2: the same line with no time promise.
Finding: FN-L5-server-database-3-02

### Offline payments can vanish when the desk device runs low on space

**How bad:** Serious. Data lost: unsent receipts, check-ins and new members can disappear with no warning.
**What you would see:** With no internet, the desk keeps taking payments, check-ins and new members. These wait inside the browser until the internet is back. The panel never asks the browser to keep them for good and never checks free space. If the device runs low on space, the browser may clear them, receipts included, and the desk gets no warning.
**Who it hurts and how often:** Desk staff and owners, rarely: only when the desk device is low on space while offline records are still waiting.
**Proof:** Found by reading the code. The panel never asks the browser to keep its stored records; a browser in low space can clear them.
**Fix:** Ask the browser to keep the stored records, check free space, and warn the desk early when space is low and records are waiting. Size: small.
**Your decision:** No.
Finding: FN-L8-panel-auth-data-03

### Member photos can fill the free database every gym shares

**How bad:** Serious. Data and money: once the database is full, saving members and payments can stop for every gym at once.
**What you would see:** Each photo taken on Add member is saved, up to 100 KB, inside the same database that holds every gym's members and receipts. No gym has a photo limit, and photos of deleted members are never cleared. About 8,000 photos across all gyms would fill the free 500 MB on their own. Every screen that shows faces also pulls photos through that database, using up the free download allowance.
**Who it hurts and how often:** All gyms, owners and desk staff. It grows with every photo and becomes a risk once many gyms use photos.
**Proof:** Found by reading the code. Delete a member who has a photo: the photo stays stored, and nothing caps how many photos one gym keeps.
**Fix:** Show photo space in HQ, set a per-gym photo limit, clear photos of removed members, and plan a move to separate file storage before the limit. Size: medium.
**Your decision:** Yes. My view: move photos to separate file storage soon; it costs little and removes the risk to every gym. Option 1: move photos out now. Option 2: add the limit and clean-up now, and move photos later.
Finding: FN-L8-panel-forms-01

### Google Play listing draft offers a Google Drive backup that is gone

**How bad:** Serious. Trust: the listing promises a feature members cannot find.
**What you would see:** The draft Google Play listing says members can back up to Google Drive or save one backup file. Since 4 Nov 2026 the app has one backup, the MettleUp account. No screen starts a new Google Drive backup. Only bringing back an old Drive backup remains, and that card is due to go around Feb 2027.
**Who it hurts and how often:** Everyone reading the Google Play listing, if this draft is what is live. The live listing text was not checked.
**Proof:** Found by reading the code and the listing draft. Open the MettleUp listing in Google Play Console and look for "Back up to Google Drive".
**Fix:** Change the line to "Back up to your MettleUp account, or save one backup file you can keep". Size: small.
**Your decision:** Yes. My view: use that line; it says what the app really does. Option 1: that line. Option 2: drop the backup line from the listing.
Finding: FN-A3-website-1-04

### Imported "3 days a week" plan becomes a 3-day plan

**How bad:** Serious. Data and money: imported members show as expired after 3 days.
**What you would see:** A gym imports a sheet from its old software where plans are named by visits, like "3 Days a Week Monthly" or "5 days/week 3 months". The import reads the first number and word as the plan's length. The new plan is saved as 3 or 5 days long. A row with a start date but no end date gets a membership that ends after 3 days and shows as expired.
**Who it hurts and how often:** Gyms moving from other software, every import with plan names like these.
**Proof:** Found by reading the code. Import a sheet with one plan named "3 Days a Week Monthly" and a start date but no end date: the member ends after 3 days.
**Fix:** Ignore a number that counts days per week when reading a plan's length from its name. Size: small.
**Your decision:** No.
Finding: FN-A5-panel-logic-2-1-01

### Imported plan with its price in the name runs for decades

**How bad:** Serious. Money: imported members never come up for renewal.
**What you would see:** A gym imports a sheet where plan names carry the price, like "999 Monthly", "Rs 1500 monthly" or "1200 Yearly". The import reads the price's last three digits as the length: 999 months, 500 months or 200 years. A row with a start date but no end date gets a membership that runs for decades, so the member never shows as due. The new plan is also saved with that length for future sales.
**Who it hurts and how often:** Gyms moving from other software, every import whose plan names carry a price and whose rows have no end date.
**Proof:** Found by reading the code; a second check ran the name reading on these examples and got 999 months, 500 months and 200 years. Import a sheet with a plan named "999 Monthly" and no end date to see it.
**Fix:** Only read a length from a number standing alone right before a month, year, week or day word. Size: small.
**Your decision:** No.
Finding: FN-B-truth-panel-logic-2-a-01

### Any free Google account can store about 1 GB with us

**How bad:** Serious. Money and data: a few fake accounts could fill the database every gym shares.
**What you would see:** Anyone can sign in with Google, gym member or not. The saved copy of workouts lets each account store up to 30,000 pieces of up to 32 KB each, about 1 GB, at 200 pieces at a time with no daily limit. A real member's copy is a few MB. A few throwaway Google accounts and a small program could fill the shared database or run up the storage bill.
**Who it hurts and how often:** All gyms, whose saving would stop if the database filled, and MettleUp, which pays. Only if someone abuses it.
**Proof:** Found by reading the code. The server accepts any signed-in Google account and allows 30,000 pieces of 32 KB each, with no daily limit.
**Fix:** Lower the per-account size to what a heavy real member uses, add a daily limit, and alert MettleUp when one account grows fast. Size: small.
**Your decision:** No.
Finding: FN-L19-phone-cloud-backup-ai-01

### Privacy notice skips the join-online form and gym web page

**How bad:** Serious. Privacy and legal: people give their details without being told what is kept or who reads it.
**What you would see:** People who are not yet members can fill a gym's join-online form (name, mobile, gender, plan, a health tick). They can ask the gym a question from its web page, and chat with the page's AI helper. Their details go into the gym's enquiry list. They tick a consent, but MettleUp's privacy notice only covers MettleUp's own demo form and the friend invite page. Nothing tells them what is kept, for how long, or which outside AI company reads a chat.
**Who it hurts and how often:** Every person who uses the join-online form or asks a gym from its web page. Whether MettleUp also keeps its own copy of their number was not checked a second time.
**Proof:** Found by reading the code. Open the privacy notice and search for the join-online form or the gym web page: neither is mentioned.
**Fix:** Add a part to the privacy notice on these forms: what is collected, that it goes to that gym, what MettleUp keeps and for how long, and which AI company reads chats. Size: small.
**Your decision:** Yes. My view: add the part now, before these forms reach more gyms; it is a small change that closes a legal gap. Option 1: add it now. Option 2: pause the web page chat until the notice is updated.
Finding: FN-L4-server-database-3-02

### Test payment would give a real gym a real paid plan

**How bad:** Serious. Money: any owner could get a year of Pro with a test card.
**What you would see:** Buying a MettleUp plan online works only with the payment company's test keys today. But a test payment is treated as real money. The gym's paid-until date moves on, the plan changes, and a numbered MettleUp receipt is made. The billing screen and receipt never say test mode. The switch that opens Pay online is one switch for all gyms, so opening it to try with the test gym opens it for every gym.
**Who it hurts and how often:** MettleUp, only if Pay online is switched on while payments are still in test mode. Both are switched off today.
**Proof:** Found by reading the code. With Pay online switched on in test mode, pay with a test card on any gym: it gets paid time and a numbered receipt.
**Fix:** Mark test payments as test, with no paid time and no numbered receipt, or open Pay online one gym at a time for testing. Size: medium.
**Your decision:** Yes. My view: open Pay online one gym at a time; it lets you test with the test gym and later roll out gym by gym. Option 1: per-gym opening. Option 2: test payments give no paid time and no receipt number.
Finding: FN-L5-server-database-3-01

### Nightly backup will stop working once the data grows big

**How bad:** Serious. Data lost: if the backup fails every night, there is nothing fresh to restore.
**What you would see:** The nightly backup reads everything in the database into one single answer and sends it in one go. One such answer has a hard size limit, and the whole copy must fit in memory and in one call's time. Workout copies and check-ins grow every day, so one day the backup will fail every night, and there is no way to take it in pieces. The backup watch would show a missed night, so it would not fail silently.
**Who it hurts and how often:** Every gym, if a restore is ever needed. Every night once the data passes the limit.
**Proof:** Found by reading the code. The backup takes the whole database in one single read; nothing splits it before that read.
**Fix:** Read the backup in pieces, part by part, and store each piece as it comes, with a test on a large copy. Size: medium.
**Your decision:** No.
Finding: FN-L7-server-database-2-03

### Anyone can start demo gyms and upload photos without limit

**How bad:** Serious. Money and data: one person could fill the shared storage every real gym uses.
**What you would see:** Starting a demo gym needs no sign-in. Up to 300 new demo gyms an hour are allowed across all of MettleUp, each with a ready-made shop. Each gym can hold 50 upload passes at once, and one pass lets in any number of 3 MB photos for 15 minutes. Nothing limits how much one gym stores in total. Demo gyms are never cleared unless their name starts with "QA ".
**Who it hurts and how often:** All gyms, whose saving would stop if storage filled, and MettleUp, which pays. Only if someone abuses it.
**Proof:** Found by reading the code. Start a demo gym with no sign-in and upload photos again and again with one pass: nothing stops it.
**Fix:** Allow one file per upload pass, cap space per gym, slow demo starts per visitor, and clear untouched demo gyms each night. Size: medium.
**Your decision:** Yes. My view: clear demo gyms left untouched for 7 days; real prospects decide within a week. Option 1: clear after 7 days. Option 2: clear after 30 days.
Finding: FN-L8-panel-shop-02

### One gym can fill the shared database with no size limit

**How bad:** Serious. Data: if one gym fills the database, every desk stops saving.
**What you would see:** Each save of gym records can carry up to 1,000 records of up to 20 KB each, about 20 MB at once. Nothing limits how often a gym saves or how much one gym keeps in total. Removed records also stay on the server. Any owner login can do this, including the one a demo gym gets with no sign-up. A broken device or a misuser could fill the free 500 MB database every gym shares.
**Who it hurts and how often:** Every gym, once one gym, device or person misuses it.
**Proof:** Found by reading the code. The server accepts 1,000 records of 20 KB per save, with no limit per minute and no total per gym.
**Fix:** Give each gym a size budget and a limit on saves per minute, and warn MettleUp as a gym nears its budget. Size: medium.
**Your decision:** No.
Finding: FN-L8-server-database-1-01

### Website promises staff cannot see member lists, but emergencies can

**How bad:** Serious. Privacy and trust: a public security promise on the sales page is wider than the truth.
**What you would see:** The gym-owner website says our staff cannot open your member list unless you let them in for 1 hour. In fact MettleUp HQ has an emergency action that opens read-only access to any gym for 15 to 60 minutes. It needs a typed reason but no OK from the gym. It is logged, and the owner sees it afterwards. The privacy notice does mention emergency access; the website line does not.
**Who it hurts and how often:** Gym owners reading the website, every time. No member data is exposed by the words themselves; the risk is an owner feeling misled after seeing an emergency visit in their log.
**Proof:** Found by reading the code. Compare the website's staff-access line with the privacy notice's emergency-access section, and with the emergency button on the HQ panel.
**Fix:** Add the logged emergency case to the website line, in words you approve. Size: small.
**Your decision:** Yes. My view: change the website words to name the logged emergency access; it is honest and still reassuring. Option 1: change the website words. Option 2: make emergency access wait for the gym's OK.
Finding: FN-A3-inbox-3-06

## Medium problems (39)

### Member website promises Apple Watch and iPhone apps nobody is building

**How bad:** Medium. Trust: a soft "coming soon" line, but no money or data at stake.
**What you would see:** On the member website, Apple Watch carries a "Coming soon" tag and the words "We are working on them". iPhone visitors are also told the iPhone app is coming soon. No Apple Watch app exists at all, and you paused iPhone work on 5 Nov to put Android first, so nothing for iPhone is published.
**Who it hurts and how often:** iPhone and Apple Watch owners who visit the member website, every visit.
**Proof:** Found by reading the code. Open the member website on any device and read the watch and iPhone lines.
**Fix:** Change both lines to "Not on iPhone or Apple Watch yet", or plan the apps. Size: small.
**Your decision:** Yes. My view: change the words to "not available yet"; a promise with no date and no work behind it costs trust when people come back and find nothing. Option 1: soften both lines now. Option 2: keep them and put iPhone and Apple Watch on the plan.
Finding: FN-A3-website-2-02; also FN-A3-website-2-03

### Free members would still see paid weight suggestions outside the workout

**How bad:** Medium. Money: a paid MettleUp Plus feature leaks to free members, once Plus limits are on.
**What you would see:** MettleUp Plus lists suggested weight and reps as paid. Inside a workout a free member gets a locked line instead. But one screen earlier, on Up next (Start or Resume a routine), the same member sees each exercise's Target line, the kg to beat and each set's weight. The Today widget on the phone's home screen also shows up to two "what to beat" lines ending with the suggested weight and reps.
**Who it hurts and how often:** Free members, every time Up next opens or the widget redraws. Nothing happens today, because the Plus limits are switched off; it starts the day you switch them on.
**Proof:** Found by reading the code. Switch the Plus limits on for a test gym, sign in as a free member, open Up next and look at the home-screen widget: the suggested weights show.
**Fix:** Give Up next and the widget the same Plus check the workout uses. Size: small.
**Your decision:** Yes. My view: show free members last time's numbers on both, so the paid line sits in one place; a lock that works on one screen only makes the paywall look broken. Option 1: show last time's numbers only. Option 2: show the same locked line as the workout.
Finding: FN-B-switch-phone-lib-core-01; also FN-B-switch-phone-native-01

### Backlog says Google Drive backup is live, but it stopped 4 Nov

**How bad:** Medium. Trust: an inside note only, but public words copied from it would promise a backup that no longer runs.
**What you would see:** The backlog marks "Google Drive backup and restore" and "Automatic workout backup" as Live, with a "Back up to Google Drive" row in Settings. Since 4 Nov the app no longer backs up to Google Drive. A phone with Drive linked is told backups now go to the MettleUp account. Only bringing back an old Drive backup still works.
**Who it hurts and how often:** Nobody on screen today. It hurts members only if someone writes the Play listing, help or website from those two backlog rows.
**Proof:** Found by reading the code. Open Settings in the member app: there is no way to start a Drive backup, only to restore an old one.
**Fix:** Rewrite the two backlog rows: backups go to the MettleUp account, Drive is restore-only. Size: small.
**Your decision:** No.
Finding: FN-A3-inbox-1-15

### Trainers' long history marked live, but waits on your database yes

**How bad:** Medium. Trust: trainers see short charts for long-time members, while the backlog says it is fixed.
**What you would see:** The backlog marks "Trainers' charts keep the long-time members' history" as Live and released. The phone part is in the app, but it needs a database change that is still waiting for your yes; a 25 Nov look at the live database confirmed it is not there. Until then, members who joined before 23 Oct share workouts only from the update day, so their trainers' charts stay short.
**Who it hurts and how often:** Trainers and members who joined before 23 Oct, every time a trainer opens their charts.
**Proof:** Found by reading the code and the 25 Nov look at the live database. A trainer opens the charts of a member who joined before 23 Oct: history starts at the update day, not the join day.
**Fix:** Say yes to the database change, or mark the row "Waiting for you". Size: small.
**Your decision:** Yes. My view: say yes to the database change; the phone part is already out, so this is the last step to give trainers the full history. Option 1: approve the change. Option 2: leave it and mark the backlog row "Waiting for you".
Finding: FN-A3-inbox-1-16

### Busy machines tip has no one-tap "Move it", only "Not now"

**How bad:** Medium. Trust: you were promised a feature that was built smaller; members were never told.
**What you would see:** You were told a member would see a line such as "Leg day is quieter on Tuesday" with "Move it", where one tap moves the routine to the quieter day. The card in the member app shows the line and one button, "Not now", which hides it for 30 days. Nothing moves the routine.
**Who it hurts and how often:** Members of gyms with busy machines switched on, every time the tip shows. They get advice but must move the routine by hand.
**Proof:** Found by reading the code. Turn on busy machines for a test gym, wait for the tip on a member's phone: only "Not now" is there.
**Fix:** Add a "Move it" button to the tip, or accept the tip as advice only. Size: medium.
**Your decision:** Yes. My view: add "Move it"; advice the member has to act on by hand is easy to ignore, and the one tap was the point. Option 1: build the button. Option 2: keep it as advice only.
Finding: FN-A3-inbox-2-04

### Join page says renew in the app, which only asks the desk

**How bad:** Medium. Trust: the page overpromises; the request still reaches the desk.
**What you would see:** When a phone number already belongs to a member, the online join page says "Renew at the gym desk, or in the MettleUp app: Gym, My gym, Renew my plan". In the app that button only sends a request; the member still pays and renews at the desk. The button is also missing for pass members, when the app shows a saved offline copy of the plan, and at gyms whose server cannot take plan requests yet.
**Who it hurts and how often:** Existing members who try to join again online, every time.
**Proof:** Found by reading the code. Enter an existing member's number on the join page, then follow its steps in the app: the button sends a request, it does not renew.
**Fix:** Reword to "Ask the desk to renew from the MettleUp app; you pay at the desk". Size: small.
**Your decision:** Yes. My view: change the words; a real in-app renewal means taking money in the app, a much bigger choice. Option 1: reword the page. Option 2: let members really renew and pay in the app.
Finding: FN-A3-website-2-07

### Help sends members to a "Muscles ready today" card that is gone

**How bad:** Medium. Trust: the help box points to something members cannot find.
**What you would see:** A member asks the help box about quick workouts or which muscles are ready. Help tells them to open the Workout tab, tap the "Muscles ready today" card, then "Quick workout" for the time they have. That card was taken off the Workout tab on 5 Nov, and nothing in the app opens either page. The member hunts for a card that is not there.
**Who it hurts and how often:** Members who ask help about quick workouts or rested muscles, every time help answers from that page.
**Proof:** Found by reading the code. Ask the help box "how do I do a quick workout?" and then look for the card on the Workout tab.
**Fix:** Hold that help page back until the card returns, the way the MettleUp Plus help pages are held back. Size: small.
**Your decision:** No.
Finding: FN-A4b-2-01

### Workouts restored from the MettleUp account lose their long-rest marks

**How bad:** Medium. Data: the next weight target comes out wrong after a restore.
**What you would see:** The MettleUp account copy of a workout leaves out the rest taken before each set and the rest planned. When a member brings workouts back on a new phone, those marks are gone. So a set done after a long rest now counts as a normal set, and the next Target goes up when it should not. The old Google Drive backup kept these values.
**Who it hurts and how often:** Members who restore on a second or new phone, for every workout brought back.
**Proof:** Found by reading the code. Do a set after a long rest, sign in on a second phone, let the workouts come back, and compare the next Target on both phones.
**Fix:** Save the rest taken and rest planned for each set in the MettleUp account copy. Size: small.
**Your decision:** No.
Finding: FN-A5-phone-tracker-engine-3-01

### Privacy switches page can vanish when the leaderboard does not answer

**How bad:** Medium. Privacy: once paid plans are on, some members cannot turn off sharing.
**What you would see:** In Settings, the "What my gym can see" row shows only after the gym's leaderboard has answered in that app session. The page also hides the gym mates and machine switches until then. The leaderboard counts as missing when the phone was offline at first ask, after a server error, or when the gym's plan has no monthly challenge. Then a member cannot turn off "Share which machines I use", and at some gyms not "Share my workouts with my trainers" either, which is on by default.
**Who it hurts and how often:** Today every gym has the challenge because paid plans are switched off, so it bites only when the phone is offline or the server errs. Once paid plans are on, members at gyms without the monthly challenge, every time.
**Proof:** Found by reading the code. Open the member app offline, go to Settings, and look for "What my gym can see": the row is missing.
**Fix:** Show the row whenever any sharing switch applies, and show each switch on its own rule, not on the leaderboard. Size: small.
**Your decision:** No.
Finding: FN-B-switch-phone-screens-2-a-03

### An older second phone wipes treadmill speed and incline from saved workouts

**How bad:** Medium. Data lost: workout details disappear on both phones with no warning.
**What you would see:** A member is signed in on two phones, one updated and one not. They log a treadmill set with speed, incline or level on the new phone. The older phone brings that workout in but cannot hold those details. On its next save it thinks its copy changed and sends it up as the newest edit, so the MettleUp account copy, and then the new phone, lose the speed, incline and level. A backup file from the newer app restored on an older app also drops them silently.
**Who it hurts and how often:** Members signed in on two phones with different app versions, each time new workout details are added and one phone is not updated.
**Proof:** Found by reading the code. Log a treadmill set with speed on an updated phone, let an older-version phone sign in and sync, then look at the set on the updated phone.
**Fix:** Make an older phone never send back less than it received, and refuse records it cannot read with an "update the app" message. Size: medium.
**Your decision:** No.
Finding: FN-B-time-phone-cloud-backup-ai-01

### Under-18 member is still told workouts save automatically

**How bad:** Medium. Trust and data: the member thinks workouts are safe when nothing is being saved.
**What you would see:** Saving to the MettleUp account quietly stops once the profile age is 10 to 17. A member who is already signed in and edits their age below 18 keeps seeing "Your workouts are saved to your MettleUp account automatically. Last saved:" with an old date, or "N changes are waiting for the internet", for ever. Nothing new is saved, and the line never says why.
**Who it hurts and how often:** Signed-in members whose age is changed to under 18, every time they open Settings afterwards. Rare: it needs an already signed-in profile changed to under 18.
**Proof:** Found by reading the code. Sign in as an adult, change the profile age to 16, do a workout, then read the backup line in Settings.
**Fix:** Have the backup line follow the same age rule and say saving is off for under-18s. Size: small.
**Your decision:** Yes. My view: show a plain line, "Saving to MettleUp is off for members under 18. Your workouts stay on this phone only."; it is privacy wording for minors, so you should sign it off. Option 1: use that line. Option 2: also hide the saved date and waiting count for under-18s.
Finding: FN-B-truth-phone-cloud-backup-ai-b-01

### Cancelling a gym delete request is never tested

**How bad:** Medium. Data: a gym could be wrongly erased or stuck if cancel breaks unseen.
**What you would see:** Nothing on screen today. When an owner asks MettleUp to delete their gym and then changes their mind, HQ cancels the request. No cloud test checks that cancel needs a reason, that a cancelled request cannot be reopened, that the gym keeps working, or that a new request can be made later. The day-30 due date is never checked either.
**Who it hurts and how often:** Gym owners who change their mind, and MettleUp HQ; the risk comes back with every release.
**Proof:** Found by reading the code. The delete request test runs add, called, reminded and delete, but never cancel.
**Fix:** Add cloud tests for cancel with and without a reason, reopen, a new request, and the due date. Size: small.
**Your decision:** No.
Finding: FN-A8-server-database-1-3-09; also FN-A8-server-hq-gate-workers-2-05

### Help box cannot answer about updates, save errors and newer Charts cards

**How bad:** Medium. Trust: members asking for help get no answer or half an answer.
**What you would see:** The help box answers only from the help articles. None mention the full-screen "A new MettleUp is here" with Update now, the watch app update pop-up, the "Couldn't save" line, or the crash screen. The progress article lists only the last 7 days, sets per muscle and main exercises, not the body map's 7, 30 or 90 day switch, Balance check or Strength score. Nothing covers Swap an exercise, Demo data, Easy weeks, strength level or trainer videos, and the Hevy or Strong import help stops before the routine steps and does not say a signed-in member's imported workouts are copied to their MettleUp account.
**Who it hurts and how often:** Members who ask help about any of these, every time. The help check looks only at whole screens, so missing parts never warn anyone.
**Proof:** Found by reading the code. Ask the help box "what is Balance check?" or "how do I swap an exercise?".
**Fix:** Add short help lines for each part, and make the help check cover the parts screens are built from. Size: medium.
**Your decision:** No.
Finding: FN-L14-phone-components-1-02; also FN-L14-phone-tracker-components-2-02

### Routine rest picker says "Default 1:30" even when member changed it

**How bad:** Medium. Looks: the chip names a rest length the exercise will not use.
**What you would see:** A member sets a different default rest in Settings, say 2:00. In the routine editor the rest picker still offers "Default · 1:30". The exercise will really use 2:00. The workout screen shows the member's own default correctly.
**Who it hurts and how often:** Members who changed their default rest, every time they edit a routine's rest.
**Proof:** Found by reading the code. Set default rest to 2:00 in Settings, then open a routine and tap an exercise's rest.
**Fix:** Show the member's own default rest on the routine picker. Size: small.
**Your decision:** No.
Finding: FN-A5-phone-tracker-components-2-1-01

### What workout alerts show on a locked phone is never tested

**How bad:** Medium. Privacy: a change could leak notes onto the lock screen unseen.
**What you would see:** Nothing wrong on screen today. The rest card, "Rest is over" and the live workout card are set to show in full on a locked phone. Six member journeys promise the lock screen shows only the exercise, set and numbers, and that the workout note is not sent to the watch. No test checks that setting or what those alerts say.
**Who it hurts and how often:** Members who train with the phone locked; the risk comes back with every release.
**Proof:** Found by reading the code. The tests only check that alerts stay off the watch, not what the lock screen shows.
**Fix:** Add a test that checks each workout alert's lock-screen setting and text. Size: small.
**Your decision:** No.
Finding: FN-A8-phone-native-1-03

### No test checks reminders and lock-screen card around an open workout

**How bad:** Medium. Trust: a wrong reminder or a stuck card could ship unseen.
**What you would see:** Nothing wrong on screen today. The widget saying "Resume" while a workout is open is already tested on a real phone. But no test checks that the day's workout reminder stays quiet while a workout is open. None checks that the widget, the reminder and the lock-screen card go back to normal once the workout ends.
**Who it hurts and how often:** Members, every workout; the risk comes back with every release.
**Proof:** Found by reading the code. The reminder tests only cover days already trained, not a workout still open.
**Fix:** Add a test that opens a workout, checks no reminder fires, ends it, and checks all three are back to normal. Size: small.
**Your decision:** No.
Finding: FN-A8-phone-tracker-components-2-3-02

### Pressing Back after finishing a workout is never tested

**How bad:** Medium. Trust: a finished workout could reopen as still running, unseen.
**What you would see:** Nothing wrong on screen today. Paused time on the summary and first-workout records are already tested. But no phone test presses Back after Finish to check the workout does not open again as still running. None checks the summary shows only once, or where "Done" really lands; the test just presses Back until Profile shows.
**Who it hurts and how often:** Members, every workout; the risk comes back with every release.
**Proof:** Found by reading the code. The phone test reaches "Workout complete" and taps Done, but never checks the Workout tab after.
**Fix:** Add a phone test that finishes, presses Back, and checks the Workout tab has no open workout. Size: small.
**Your decision:** No.
Finding: FN-A8-phone-tracker-services-1-2-06

### Gym's workout of the day still says Start after it is done

**How bad:** Medium. Looks: members may start the same workout twice by mistake.
**What you would see:** The "Today at your gym" card on the Workout tab hides only while a workout is open. Once the member finishes the gym's workout of the day, the card comes straight back with "Start this workout", as if it were still to do.
**Who it hurts and how often:** Members of gyms that set a workout of the day, every day they do it.
**Proof:** Found by reading the code. Set a workout of the day for a test gym, do it on a member's phone, finish, and look at the Workout tab.
**Fix:** Mark the card "Done for today" or hide it once today's gym workout is finished. Size: small.
**Your decision:** No.
Finding: FN-B-alerts-phone-tracker-components-1-b-01

### Member who asked to renew is still told to renew at desk

**How bad:** Medium. Trust: the app keeps nagging for something the member already did.
**What you would see:** A member taps Renew my plan, picks a plan and sees "Request sent. The desk will confirm." The plan card shows the request. But the "Your plan ends on Friday. Renew at the front desk." card on the Workout tab and the plan-ending reminders ignore it, so they keep asking until the desk approves.
**Who it hurts and how often:** Members whose plan ends soon and who asked to renew in the app, every day until the desk answers.
**Proof:** Found by reading the code. With a plan ending this week, send a renew request from the app, then look at the Workout tab.
**Fix:** Let the plan-ends card and reminders see a waiting request and say "Renewal asked, waiting for the desk". Size: small.
**Your decision:** No.
Finding: FN-B-switch-phone-shop-1-a-03

### Returning member renewed from his page stays hidden as archived

**How bad:** Medium. Data: a paying member drops out of lists, counts and messages.
**What you would see:** An archived member comes back. The desk opens his page and taps Renew or Sell membership. The plan and payment save, but he stays archived with only a small Archived tag as a hint. He is missing from Members, the active and ending-soon counts and message groups, while his money shows in Collections. Check in also works on him without a word. Add member and Make member on Enquiries already bring such members back.
**Who it hurts and how often:** Owners and desk staff, every time a returning member is renewed from his own page.
**Proof:** Found by reading the code. Archive a test member, open his page, sell a plan, then search the Members list.
**Fix:** When a plan is sold to an archived member, bring him back to the list and say so. Size: small.
**Your decision:** No.
Finding: FN-B-time-panel-screens-1-01

### Branding preview shows only the dark look; light phones look different

**How bad:** Medium. Looks: members on a light phone see a gym colour the owner never chose or saw.
**What you would see:** The owner picks a gym colour and a background tone on Branding. The phone picture and its words show only the dark look. A member whose phone is set to light mode gets a darker shade of that colour, made easier to read, and no background tone at all. A background tone picked on its own changes nothing for them.
**Who it hurts and how often:** Owners who pick a colour or background tone, and every member whose phone is in light mode, every time.
**Proof:** Found by reading the code. Pick a bright colour and a background tone on Branding, then open the member app on a phone set to light mode and compare.
**Fix:** Add a light or dark switch to the Branding phone picture, and say the background tone shows on dark phones only. Size: medium.
**Your decision:** No.
Finding: FN-B-truth-panel-brand-shell-b-01

### Statistics sets total is far lower than its bars added up

**How bad:** Medium. Trust: a member who adds up the bars gets a different total and doubts the app.
**What you would see:** On Statistics in the member app, the line over the sets chart reads like "412 sets since 7 Sep". That line counts each set once. Each bar counts a set once for every body group it works. One bench press set is 1 set in the line but 2 in the bars (chest, shoulders, arms), and nothing on screen explains it.
**Who it hurts and how often:** Members, every time they open Statistics, unless only one body group is picked. All six groups are picked by default.
**Proof:** Found by reading the code. Log a workout of bench presses, open Statistics with all groups picked, and add up the bars: the sum is above the headline.
**Fix:** Count the line and the bars the same way, or add a short line saying the bars count a set for each group. Size: small.
**Your decision:** Yes. My view: add the short explaining line; a set really does work several groups, so the bars are useful as they are. Option 1: add the line. Option 2: change the bars so they add up to the total.
Finding: FN-B-truth-phone-tracker-engine-b-02

### "Send to their app" claims success for members without the app

**How bad:** Medium. Money: the desk waits for a fee that was never asked for.
**What you would see:** On a money sheet in the admin app, the desk taps "Send to their app" for a member who owes a fee. The screen says "Sent. They see it under My membership in the MettleUp app." But a member who does not have the app, or is not linked to this gym, gets nothing anywhere. Even members on the app get no notification about it.
**Who it hurts and how often:** Front desk and members, every time a fee is sent to a member who is not on the app.
**Proof:** Found by reading the code. Pick a member who has never used the member app, tap "Send to their app" on a fee, and see the "Sent" line while nothing reaches them.
**Fix:** Show the button only for members linked to the app; for others, say why and offer the payment link or UPI QR. Size: small.
**Your decision:** No.
Finding: FN-B-words-panel-pay-machines-01

### "Take back" on a waiting request looks like faint text

**How bad:** Medium. Looks: members cannot tell they can cancel a request they sent by mistake.
**What you would see:** A member asks to pause or renew their plan in the member app. While the desk has not answered, the only way to take the request back is a short line in the smallest, faintest grey text. It has no button shape, no colour and no underline, and it is hard to hit with a finger. The Pause and Renew buttons next to it look like proper buttons.
**Who it hurts and how often:** Members, every time a pause or renew request is waiting.
**Proof:** Found by reading the code. Send a pause request from the member app and look at the waiting request card.
**Fix:** Show "Take back" as a small normal button, the same style as "Pause my plan", with a full finger-sized tap area. Size: small.
**Your decision:** No.
Finding: FN-L9-phone-shop-1-01

### Help says payment links pay owners, but all are test-only

**How bad:** Medium. Money and trust: owners are told real money will arrive when none can.
**What you would see:** The help article on online payments tells owners to paste their Razorpay or Cashfree keys, make a payment link, and that the money goes straight to their account. Today the live-payments switch is off for every gym, so no real money moves through a payment link. The article mentions test mode only as a side note. The Payments screen itself does show a "Test mode" label and says no real money moves.
**Who it hurts and how often:** Owners who read the help, or ask the AI help, about online payments, every time while payments stay in test mode. The Payments screen warns them at the point of use, which keeps this from being worse.
**Proof:** Found by reading the code. Open Help, read the online payments article, then open Payments and see the "Test mode" label.
**Fix:** Hide the payment-link half of the article until live payments are on, or say plainly at the top that payment links are test-only for now. Size: small.
**Your decision:** Yes. My view: say plainly that payment links are test-only for now, and keep the UPI QR part as it is; owners still learn the feature is coming. Option 1: add the plain test-only line. Option 2: hide the payment-link half until live payments switch on.
Finding: FN-A3-help-01

### Our notes say the paid trial is built; trials are free only

**How bad:** Medium. Trust: our own records claim a feature that does not exist yet.
**What you would see:** You chose a small trial fee, for example Rs 199 for 7 days, taken off the plan when the person joins. Our notes say it was built with the free trial. In the product, the owner's trial card offers only Off, 1, 3 or 7 free days, and the fee is always zero. The fee waits for online joining payments, which are switched off.
**Who it hurts and how often:** Nobody outside the team today: this is an inside note and no gym is told the fee exists. It would mislead anyone who plans or sells from the notes.
**Proof:** Found by reading the code. Open the free trial card in the admin app: there is no fee box, only free-day choices.
**Fix:** Correct the note to say the trial fee waits for online joining payments. Size: small.
**Your decision:** No.
Finding: FN-A3-inbox-2-03

### Desk can ask for a workout code members no longer have

**How bad:** Medium. Looks: a dead button wastes staff time; no data or money is lost.
**What you would see:** On a member's page in the admin app, staff still see "Check workout code". It asks for a short code the member was meant to show from the member app. That code screen was removed from the member app on 2 Nov 2026. So staff ask for a code that no member can produce.
**Who it hurts and how often:** Desk staff and owners, every time they open a member page and try the button.
**Proof:** Found by reading the code. Open any member page in the admin app and see the button, then look for "Show my workouts to the desk" in the member app: it is gone.
**Fix:** Remove the "Check workout code" button and its sheet from the admin app. Size: small.
**Your decision:** No.
Finding: FN-A3-inbox-3-07

### Hindi privacy notice leaves out the AI Assistant

**How bad:** Medium. Privacy wording: Hindi readers are not told where their AI Assistant words go.
**What you would see:** The English privacy notice tells gym owners that what they type or say to the AI Assistant goes to Claude and Groq. The Hindi version on the same page says nothing of the AI Assistant. Its list of outside companies still says Claude only answers help questions and Groq only handles spoken feedback. The Hindi page does say the English version wins.
**Who it hurts and how often:** Owners who read the privacy notice in Hindi, every time.
**Proof:** Found by reading the code. Open the privacy notice, switch to Hindi, and compare its outside-companies list with the English one.
**Fix:** Add the AI Assistant paragraph and the two company lines to the Hindi version, once you approve the Hindi words. Size: small.
**Your decision:** Yes. My view: approve a Hindi version of the AI Assistant part now; a privacy notice should say the same in both languages. Option 1: approve the Hindi words I draft. Option 2: leave it, relying on "English wins".
Finding: FN-A3-notes-claude-2-01

### Four live features are marked "not applied" in our server records

**How bad:** Medium. Trust in our records: the team may think live features are hidden.
**What you would see:** The update notes tell owners that the bell to-do list, the AI Assistant, paying MettleUp by UPI or bank transfer, and keeping free trial days are live. A second check of the live server confirmed they are live, so owners are told the truth. But our own server change records still say "not applied" at the top, and the feature list marks the bell's server part as hidden because of that.
**Who it hurts and how often:** Only the team, whenever someone uses those records to judge what is live. Owners are not affected.
**Proof:** Found by reading the code and a read of the live server's list of features. Compare the top line of each of the four change records with the live server.
**Fix:** Correct the "not applied" line on each of those records and the bell entry in the feature list. Size: small.
**Your decision:** No.
Finding: FN-A3-whats-new-panel-02

### AI Assistant "Which one?" card hides members beyond five

**How bad:** Medium. Trust: the owner cannot reach the member they meant, and the count is wrong.
**What you would see:** The owner asks the AI Assistant about a member by first name, for example "Rahul". When more than five members share that name, the "Which one?" card lists only five and says five members are called Rahul. The rest cannot be picked, and nothing says there are more. A member with a running plan can be among those cut off.
**Who it hurts and how often:** Owners, every time six or more members share the name they ask for.
**Proof:** Found by reading the code. In a test gym with six members called Rahul, ask the AI Assistant about "Rahul" and count the choices.
**Fix:** Show the true number and let the owner see the rest or type the surname. Size: small.
**Your decision:** No.
Finding: FN-A5-panel-assistant-1-01

### No test checks Today for a gym with two branches

**How bad:** Medium. Privacy and money, if it ever broke: one branch could see another's members or takings.
**What you would see:** Nothing wrong today. No automatic test opens Today on one branch of a two-branch gym, as owner or as a desk of one branch. So nobody checks that the other branch's members, money and birthdays stay out. A second check found each branch works as its own separate gym, so a leak is unlikely; the gap is in the safety net.
**Who it hurts and how often:** Owners with branches, every day, only if a future change breaks the split without anyone noticing.
**Proof:** Found by reading the code. Look through the cloud tests: the branch test checks only the member list and the "All branches" page.
**Fix:** Add a two-branch Today test for the owner and for a desk of one branch. Size: small.
**Your decision:** No.
Finding: FN-A8-panel-logic-1-4-04

### No test checks the desk cannot see shop takings

**How bad:** Medium. Money privacy, if it ever broke: desk staff could see the day's shop takings.
**What you would see:** Nothing wrong today. The Shop today card on Today hides the "sold today" amount from desk staff, and the rule that desk staff cannot see totals is tested on its own. But no test opens the card signed in as desk staff. When the shop is off, the card does not show at all.
**Who it hurts and how often:** Gyms with front-desk staff and a shop, every day, only if a future change shows the amount without anyone noticing. The worst case is the desk seeing their own gym's shop takings.
**Proof:** Found by reading the code. Look through the cloud tests: none opens the Shop today card as desk staff.
**Fix:** Add a desk test of the Shop today card that checks no rupee amount shows. Size: small.
**Your decision:** No.
Finding: FN-A8-panel-shop-2-01

### Owner cannot see who got an automatic reminder, or who missed

**How bad:** Medium. Money: an owner who thinks a reminder went may not chase a renewal.
**What you would see:** Automatic reminders (plan ends soon, plan ended, birthday wish, welcome and others) are on by default. Each member's phone shows them itself, and nothing reports back. The Automatic reminders page shows only the switches and "N of 11 on". The owner cannot see that Asha was reminded, or that she was not because she has no app, turned reminders off, or her phone blocks notifications. The same page does say reminders reach only members with the app who have not turned them off.
**Who it hurts and how often:** Owners, every day, for every gym using automatic reminders.
**Proof:** Found by reading the code. Open Automatic reminders in the admin app: there is no list or count of who was reached.
**Fix:** Have the member app report each reminder it shows, and show reached and not-reached counts with a list to message by hand. Size: large.
**Your decision:** Yes. My view: build it, starting with a simple "could not reach" list; renewals are where the money is. Option 1: build the reached and not-reached report. Option 2: leave it, since the page already states the limit.
Finding: FN-B-alerts-panel-logic-1-b-02

### "Not seen for 10+ days" message goes to different people

**How bad:** Medium. Trust: the owner messages a different set of members from the list they read.
**What you would see:** On Today, the AI Assistant idea says "Not seen for 10+ days: N". Its See who list shows every member with a running plan and no visit for 10 days. The button under it, "Send them a we miss you message", sends to "members who stopped coming", a different list. That list uses each member's usual rhythm and leaves out anyone whose plan ends within 7 days. So a member whose plan ends in 3 days and who has not come for a month is listed but not messaged, while someone who trains every 3 weeks is listed after 10 days.
**Who it hurts and how often:** Owners, every day the idea shows on Today.
**Proof:** Found by reading the code. Tap See who on the "Not seen for 10+ days" idea, then the message button, and compare the names in the list with the people the message goes to.
**Fix:** Use one rule for "not coming" across Today, the AI Assistant, Messages and Visits, and send to exactly the names on the list. Size: small.
**Your decision:** Yes. My view: use each member's own rhythm everywhere; it is smarter and Messages and Visits already use it. Option 1: the rhythm rule everywhere. Option 2: the plain 10-day rule everywhere.
Finding: FN-B-truth-panel-assistant-b-01

### Owner told "The owner gives the extra days" with no reason

**How bad:** Medium. Looks: the owner gets words meant for the desk and no way forward.
**What you would see:** After checking a member's workout code, the owner normally gets a "Give extra days" button. If the member has no gym plan that can take days, for example only a personal training pack or every plan cancelled, the button is missing. Instead the owner reads "The owner gives the extra days.", the line meant for desk staff. Nothing says that a plan is missing.
**Who it hurts and how often:** Owners, each time a workout code is checked for a member with no gym plan that is not cancelled.
**Proof:** Found by reading the code. Give a test member only a personal training pack, then check their workout code as the owner.
**Fix:** Give the owner their own line saying the member has no plan to add days to, and to sell or restore one first. Size: small.
**Your decision:** No.
Finding: FN-A5-panel-forms-1-03; also FN-A5-panel-screens-1-4-01

### Failed saves leave no record of why, in both apps

**How bad:** Medium. Trust: when someone says "it would not save", support cannot find out why.
**What you would see:** In the admin app, saving a plan, the gym's details or a workout plan can fail. The screen shows the error words, but the real reason is written down nowhere. In the member app, Finish on a live workout, saving an edited workout or a built plan, and routine edits show "Could not save, try again" and also keep no record. Renaming a routine on the way out is dropped without a word. A few nearby screens do keep a record, so the gap is uneven.
**Who it hurts and how often:** Owners and members, each time one of these saves fails.
**Proof:** Found by reading the code. Turn the internet off, try to save a plan in the admin app and finish a workout in the member app, then look in the app's own error log: nothing is there.
**Fix:** Write the real reason to the log on every one of these failed saves, as the other screens already do. Size: small.
**Your decision:** No.
Finding: FN-B-run-panel-screens-2-a-01; also FN-B-run-phone-screens-2-a-01

### Update note gets the workout report alert backwards

**How bad:** Medium. Trust: owners reading the update history are told the opposite of what happens.
**What you would see:** The 9 Nov update note in Settings, What's new, says members get a notification when the gym sends the workout report they asked for. In the product it is the other way round. The gym asks the member for their workout report, and the member is told "Your gym asked to see your workout report". Members do not ask the gym for a report.
**Who it hurts and how often:** Owners and desk staff who read the update history, every time.
**Proof:** Found by reading the code. Open Settings, What's new, find the 9 Nov note, and compare it with asking a member for their report from the admin app.
**Fix:** Reword the line to say members are notified when the gym asks for their workout report. Size: small.
**Your decision:** Yes. My view: approve the corrected line; it is one sentence and it matches what really happens. Option 1: approve the reworded line. Option 2: remove the line from the note.
Finding: FN-A3-whats-new-panel-03

### MettleUp receipt says "not found" when the internet drops

**How bad:** Medium. Trust: an owner is told a paid receipt does not exist.
**What you would see:** The owner opens a receipt for a payment to MettleUp while the internet is off or the server is not answering. The page says "Receipt not found. Open it again from Settings, Pay MettleUp, Your receipts." There is no "Try again", and nothing says the problem is the connection. Opening it again later works.
**Who it hurts and how often:** Owners, every time they open a receipt with no internet or while the server is failing.
**Proof:** Found by reading the code. Turn the internet off and open a receipt from Settings, Pay MettleUp, Your receipts.
**Fix:** Show "Could not load the receipt" with a Try again button, and keep "not found" for receipts that really do not exist. Size: small.
**Your decision:** No.
Finding: FN-A5-panel-screens-2-1-01

### Join cards say "pay at the desk" even with online paying on

**How bad:** Medium. Trust: the screen and the WhatsApp message tell people different things about paying.
**What you would see:** The gym-code card and the Invite members page always say people who join online pay at the desk. The WhatsApp invite they send drops that sentence when the gym has turned on paying online when joining. So the owner reads one thing on screen while the person invited reads another.
**Who it hurts and how often:** Owners and staff of gyms that take payment online when people join, every time. Online joining payments are switched off for now, so no gym meets this today.
**Proof:** Found by reading the code. Turn on paying online when joining for a test gym, then compare the gym-code card's words with the WhatsApp invite text.
**Fix:** Make the card words follow the same paying-online setting as the WhatsApp message. Size: small.
**Your decision:** No.
Finding: FN-A5-panel-shop-1-02

## Every other problem (2283)

One line each: what you would see, how bad, fix size, finding id.

### Member app (phone) (869)

- Swapping the two photos puts the newer one as Before (Medium, small fix, FN-A5-phone-tracker-components-1-1-01)
- The plan's week number and easy weeks keep counting the weeks a member was away (Medium, medium fix, FN-B-truth-phone-tracker-components-2-b-01)
- The watch screen log says it holds only screen times and settings, but it also sends when a workout was open and the watch app version (Medium, small fix, FN-A5-phone-lib-core-3-01)
- The member app measures nothing: no sign-up, first-workout, day-30 or free-month-to-Plus numbers (Medium, medium fix, FN-B-run-phone-lib-core-a-06)
- Ask an AI is never tested empty, after a change, or with a double tap (Medium, small fix, FN-A8-phone-screens-2-2-02)
- The strength level sheet and the compare choice are never tested on screen (Medium, small fix, FN-A8-phone-tracker-services-2-2-05)
- Saving changes to a past workout that fails has no test (Medium, small fix, FN-A8-phone-components-2-1-05)
- A server outage or server fault is shown to the member as no internet (Medium, small fix, FN-B-run-phone-cloud-backup-ai-a-03)
- Several 'try again' messages leave no note of why it failed, including a workout that will not save (Medium, small fix, FN-B-run-phone-components-2-a-03)
- A workout that will not delete says try again but keeps no note of why (Medium, small fix, FN-B-run-phone-tracker-lib-a-01)
- The notes treat the staff sign-in card in the member app as a live screen, but it is switched off (Medium, small fix, FN-A3-notes-claude-2-04)
- "Download my data" says the file is saved even when the member closed the share sheet without saving it (Medium, small fix, FN-A5-phone-cloud-backup-ai-1-01)
- Drive sign-in message names two buttons that do not exist (Medium, small fix, FN-A5-phone-cloud-backup-ai-2-01)
- Help and feedback sends more than the privacy notice says (Medium, small fix, FN-A5-phone-lib-core-1-02)
- Save stays spinning after the free exercise limit message (Medium, small fix, FN-A5-phone-screens-1-2-02)
- Add measures says a picture stays on the phone even when photo backup is on (Medium, small fix, FN-A5-phone-screens-2-1b-02)
- My membership says 'No internet' while it is still loading (Medium, small fix, FN-A5-phone-shop-2-1-01)
- The exercise chart can open on a year or on all time without the free-plan check (Medium, small fix, FN-A5-phone-tracker-components-1-2-01)
- 'Skip for now' on the first-routine card hides it for good (Medium, small fix, FN-A5-phone-tracker-components-1-2-02)
- Save stays stuck after the own-exercise limit pop-up (Medium, small fix, FN-A5-phone-tracker-components-2-4-01)
- The 'Rest alerts' warning row is tested only as data, never on screen (Medium, medium fix, FN-A8-phone-native-1-02)
- The watch's Plus lock, the trusted-sender check and a phone without Wear OS are never tested (Medium, medium fix, FN-A8-phone-native-1-04)
- No test checks what a member sees after the gym removes them (Medium, small fix, FN-A8-phone-screens-1-1-01)
- No test checks what a finished workout sends off the phone (Medium, medium fix, FN-A8-phone-screens-2-1-10)
- Machine step setting says it works for pound users but does nothing (Medium, small fix, FN-A8-phone-tracker-engine-2-01)
- What sets off the forgotten-workout pause is never tested, including the hold timer (Medium, medium fix, FN-A8-phone-tracker-services-1-2-02)
- Ticking a set from the workout card or the watch is never tested end to end (Medium, medium fix, FN-A8-phone-tracker-services-1-2-03)
- Saying Not now to a weak muscle on one screen does not quiet the same advice on the other (Medium, small fix, FN-B-alerts-phone-components-1-b-01)
- Settings says 'Reminders on, 6:00 pm' even when the phone blocks MettleUp's notifications, so no reminder ever arrives (Medium, small fix, FN-B-alerts-phone-screens-2-a-01)
- Saying 'Not now' or 'I skip this on purpose' to one muscle suggestion does not quiet the other one (Medium, small fix, FN-B-alerts-phone-tracker-services-1-b-01)
- Once Plus is on, a paying member whose phone cannot reach Google Play's payment part is told their account has no Plus (Medium, small fix, FN-B-run-phone-lib-core-b-01)
- Turning off 'Share which machines I use' keeps what was already sent at the gym (Medium, small fix, FN-B-switch-phone-screens-2-a-01)
- Ask an AI always asks how to get stronger, and leaves out the member's sore areas and goal (Medium, small fix, FN-B-switch-phone-screens-2-a-02)
- Once the Pro lock is on, a Starter gym's old diet plans stay on the member's phone as if current and never update (Medium, small fix, FN-B-switch-phone-shop-2-a-02)
- Every member starts on the male body figure, and only Profile ever asks (Medium, small fix, FN-B-switch-phone-tracker-lib-02)
- 'Save my measurements' leaves out the measurements the gym's trainer took (Medium, small fix, FN-B-switch-phone-tracker-services-1-a-01)
- Anyone still on the old ForgeAI app is never told to move to MettleUp, and stays on it for good (Medium, medium fix, FN-B-time-phone-screens-1-01)
- The Strength score counts curls, flyes, triceps work and heavy machines as the big five lifts (Medium, small fix, FN-B-truth-phone-components-1-a-01)
- Changing your mobile number in Edit profile never reaches your gym, though the screen says your gym will use it (Medium, small fix, FN-B-truth-phone-components-2-a-02)
- The workout-complete card says 'Lighter than previous' while every exercise under it says 'same' and no reason is given (Medium, small fix, FN-B-truth-phone-tracker-components-1-b-01)
- A short workout is 'not compared' in the big card, then compared anyway in the line right under it (Medium, small fix, FN-B-truth-phone-tracker-components-1-b-02)
- Ask your own AI tells the AI a new member trains far less often than they do (Medium, small fix, FN-B-truth-phone-tracker-engine-a-02)
- The sign-in card says only you can see the saved copy and that it holds workouts, routines and body weight, but MettleUp can look and it also holds your name, age, height and measurements (Medium, small fix, FN-B-words-phone-cloud-backup-ai-01)
- The 'Gym right now' widget tells the member to open the Gym tab, but a tap opens the check-in scanner (Medium, small fix, FN-B-words-phone-native-01)
- After the first tick, the app has no way to open the privacy notice or the terms again (Medium, small fix, FN-B-words-phone-screens-2-02)
- The 'held back in the background' rest-alert row says 'Allow it' but opens the app's general Android page (Medium, small fix, FN-B-words-phone-tracker-components-1-01)
- The muscle tip's 'Why' sheet sends members to a Settings row that is not there (Medium, small fix, FN-B-words-phone-tracker-engine-01)
- When Drive backup is broken in a build, the member is told to tell their gym, who cannot fix it (Medium, small fix, FN-L14-phone-cloud-backup-ai-02)
- A reply from the MettleUp team reaches only the phone the question was sent from (Medium, medium fix, FN-L14-phone-lib-core-01)
- The MettleUp Plus help page says gym members always get every feature free, but they lose them after their plan ends (Medium, small fix, FN-L14-phone-lib-core-04)
- A member on the GitHub copy of the app gets a watch app from Google Play that can never talk to their phone (Medium, small fix, FN-L14-phone-native-02)
- Member help still describes the old first screen and the old erase, and says nothing about phone number sign-in (Medium, small fix, FN-L14-phone-onboarding-db-01)
- A gym link or code that finds no gym leaves the member with nobody to ask (Medium, small fix, FN-L14-phone-shop-1-01)
- Bringing routines in from a Hevy link depends on Hevy's web page, and nobody is told when Hevy changes it (Medium, small fix, FN-L14-phone-tracker-components-1-01)
- A second, older streak rule (days in a row) still feeds the coach and the gym summary (Medium, small fix, FN-L16-phone-lib-core-01)
- The privacy notice says everything you log stays on your phone, but Android's backup copies it to the member's Google account (Medium, small fix, FN-L4-phone-components-2-02)
- Every app open and every leave re-reads the member's whole workout history for the cloud copy (Medium, medium fix, FN-L7-phone-cloud-backup-ai-01)
- The gym sync sign-in form cannot be filled in reliably with a screen reader (Medium, small fix, FN-L9-phone-components-2-03)
- On the Body page, your own entries can be tapped to fix or delete but look exactly like the trainer's entries, which cannot (Medium, small fix, FN-L9-phone-screens-1-01)
- Undo for a deleted set in a live workout is hidden from screen readers and vanishes after 4 seconds (Medium, small fix, FN-L9-phone-screens-2-01)
- A screen reader user cannot move through the points on an exercise chart (Medium, medium fix, FN-L9-phone-tracker-components-1-01)
- Once MettleUp Plus is switched on, a gym owner, trainer or desk person found by phone number keeps every paid feature free for ever, even after leaving the gym (Medium, medium fix, FN-L5-phone-onboarding-db-01)
- The backlog still says workouts never go to our server, but a copy does (Medium, small fix, FN-A3-inbox-2-05)
- The member app counts nothing about use, so backup, restore, account and help decisions are made blind (Medium, medium fix, FN-B-run-phone-components-2-a-05)
- A set ticked from the notification with the app closed can go unsaved with no word (Medium, small fix, FN-B-alerts-phone-native-b-01)
- A 'your plan ends' reminder can still pop up after the member has renewed at the desk (Medium, medium fix, FN-B-alerts-phone-shop-1-a-02)
- Saved changes can wait up to 6 hours after the internet comes back (Medium, small fix, FN-B-run-phone-cloud-backup-ai-a-02)
- An updated phone can be taken for a fresh install, so the member misses the new-feature dots and the 'it moved' hints (Medium, small fix, FN-B-time-phone-components-1-02)
- The Strength score can fall though no lift got weaker, and the Charts page never says why (Medium, medium fix, FN-B-truth-phone-components-1-b-02)
- Personal records are worked out by two different rules, so the coach and the screens can disagree (Medium, medium fix, FN-L16-phone-tracker-services-2-01)
- The Play Store update path is never tested: download, ready sheet and restart (Medium, medium fix, FN-A8-phone-components-1-2-01)
- The start-up error test insists on telling members to send their whole data file to the gym (Medium, small fix, FN-A8-phone-onboarding-db-1-01)
- The backup page's privacy promises are never checked by any test (Medium, small fix, FN-A8-phone-screens-2-2-01)
- No test checks what a phone sends to the new gym when it switches gyms (Medium, small fix, FN-A8-phone-shop-2-1-03)
- No test checks the crash screen's Go back and Go to Workout, or a crash of the whole app frame (Medium, medium fix, FN-A8-phone-components-1-1-03)
- No test taps 'Update now' or the line's 'Update' (Medium, small fix, FN-A8-phone-components-1-2-02)
- The watch install card is never shown on screen in any test (Medium, medium fix, FN-A8-phone-components-1-2-03)
- The Balance check card is never shown on screen; its save failure and 'Go back' flow are untested (Medium, medium fix, FN-A8-phone-components-1-2-04)
- The body map's empty words and its 30 and 90 day chips are never tested (Medium, small fix, FN-A8-phone-components-1-2-05)
- The Strength score chart is never shown in any test (Medium, small fix, FN-A8-phone-components-1-2-06)
- Exercise History paging, the open workout row and deleted workouts are never tested (Medium, small fix, FN-A8-phone-components-1-2-08)
- No test checks these phone checks and cards send no workout or health data (Medium, small fix, FN-A8-phone-components-1-2-11)
- No test opens the Help and feedback sheet from the round button (Medium, small fix, FN-A8-phone-components-2-1-01)
- The help questions test passes even when no AI answer and no 'Sending' line ever show (Medium, small fix, FN-A8-phone-components-2-1-02)
- Speaking a message: cancel, the 2-minute stop, too short and microphone refused have no test (Medium, small fix, FN-A8-phone-components-2-1-03)
- Save a backup: the empty, demo and full-phone cases are never seen, and no test checks the gym key stays out of the file (Medium, small fix, FN-A8-phone-components-2-2-02)
- Erasing a signed-in phone is checked only by reading the code, never by running it (Medium, small fix, FN-A8-phone-components-2-2-03)
- After a member leaves, no test checks their phone number, shared workouts and messages are gone from the gym (Medium, small fix, FN-A8-phone-components-2-2-05)
- The wrong-code line on the Gym tab's join card is never tested (Medium, small fix, FN-A8-phone-components-2-3-01)
- The 'Couldn't load' screens are never tested (Medium, small fix, FN-A8-phone-components-2-3-02)
- The 'Your profile' page is never used in a test (Medium, small fix, FN-A8-phone-components-2-3-03)
- No test proves a member's number and name stay private until they choose (Medium, small fix, FN-A8-phone-components-2-3-04)
- A question opened just as another sheet closes is never tested on screen (Medium, small fix, FN-A8-phone-components-2-3-06)
- Back on a screen with steps has no test (Medium, small fix, FN-A8-phone-lib-core-1-02)
- The help box's member messages are almost never checked word for word (Medium, small fix, FN-A8-phone-lib-core-1-03)
- No test checks who gets suggested weights locked (Medium, small fix, FN-A8-phone-lib-core-1-05)
- Charts are never tested empty, failing, or after a workout is added or deleted (Medium, medium fix, FN-A8-phone-lib-core-2-03)
- Erasing all data is never tested to clear the app icon shortcuts and home-screen widgets (Medium, small fix, FN-A8-phone-lib-core-2-04)
- Opening MettleUp by sharing a Hevy or Strong file is never tested (Medium, medium fix, FN-A8-phone-lib-core-2-05)
- After Erase all data, no test checks reminders, Health Connect, widgets or shortcuts (Medium, small fix, FN-A8-phone-native-2-02)
- The workout reminder's own words and what it shows on a locked phone are never tested (Medium, small fix, FN-A8-phone-native-2-03)
- The weight and steps rows on the Health Connect page are never opened in a test (Medium, medium fix, FN-A8-phone-native-2-04)
- Health Connect sending: Stop, a refused or missing Health Connect, Not now and a second tap are never tested on screen (Medium, medium fix, FN-A8-phone-native-2-05)
- The 'What my gym can see' switches are never flipped in a test, and Busy machines is never checked (Medium, medium fix, FN-A8-phone-native-2-06)
- Changing reminder days or time, switching reminders off, and the Try again buttons are never tested (Medium, medium fix, FN-A8-phone-native-2-07)
- The phone number sign-in's waiting screens and backing out are never tested (Medium, small fix, FN-A8-phone-onboarding-db-2-01)
- Going back after 'Try another way' is never tested (Medium, small fix, FN-A8-phone-onboarding-db-2-02)
- No test checks gym staff using the member app are told before joining as a member (Medium, small fix, FN-A8-phone-onboarding-db-2-03)
- The setup questions' own words and the failed-save message are never checked (Medium, small fix, FN-A8-phone-onboarding-db-2-04)
- The demo's badge, its question words and its failure message are never checked (Medium, small fix, FN-A8-phone-onboarding-db-2-05)
- Removing the demo: the caption, the Workout tab way in, cancel and failure words are never tested (Medium, small fix, FN-A8-phone-onboarding-db-2-06)
- Import replace failures, the undo window and Health Connect timing are never tested (Medium, small fix, FN-A8-phone-onboarding-db-2-07)
- Making an exercise with a name already in the library is never tested (Medium, small fix, FN-A8-phone-onboarding-db-2-08)
- The straight-in note's buttons and the no-internet join are never tested on screen (Medium, small fix, FN-A8-phone-onboarding-db-2-09)
- Erase's busy, failure and gym-told-later steps are never seen, and a named cover test does not exist (Medium, small fix, FN-A8-phone-onboarding-db-2-10)
- Setup answers surviving the app closing are never tested on a phone (Medium, small fix, FN-A8-phone-onboarding-db-3-01)
- The start-up error screen is seen on a phone only for a file that will not open, never for a full phone or a failed read or update (Medium, small fix, FN-A8-phone-onboarding-db-3-02)
- Light or dark is never tested with a workout open, or for the first frame after a restart (Medium, small fix, FN-A8-phone-onboarding-db-3-06)
- No test checks the Hevy and Strong import stays on the phone (Medium, medium fix, FN-A8-phone-screens-1-2-01)
- The import result, date question and error words are never checked on screen (Medium, medium fix, FN-A8-phone-screens-1-2-02)
- The join screen's line on what the gym sees is never tested (Medium, small fix, FN-A8-phone-screens-1-2-03)
- The invite screen's not-found card, Try again and the fresh-phone path are never driven (Medium, medium fix, FN-A8-phone-screens-1-2-04)
- The own-exercise form's warnings are never tested (Medium, medium fix, FN-A8-phone-screens-1-2-05)
- The Add measures refusals and the replace question are never tested (Medium, medium fix, FN-A8-phone-screens-1-2-06)
- The 1-rep max screen is never opened in a test (Medium, medium fix, FN-A8-phone-screens-1-2-07)
- Deleting, comparing and the backup line on Progress photos are never tested (Medium, medium fix, FN-A8-phone-screens-1-2-08)
- Saving a plan without following it, and a failed save, are never tested (Medium, medium fix, FN-A8-phone-screens-1-2-09)
- No test checks a plan or a shared routine file carries no personal data (Medium, small fix, FN-A8-phone-screens-1-2-10)
- Routine file updates and program errors are never seen on screen (Medium, medium fix, FN-A8-phone-screens-1-2-11)
- The Records page is never tested empty, failing, or tapped (Medium, small fix, FN-A8-phone-screens-1-3-01)
- The month report's arrows, its load error and its gym switch are never tested (Medium, small fix, FN-A8-phone-screens-1-3-02)
- Renaming, copying and deleting a routine, and the routine editor's errors, are never tested (Medium, medium fix, FN-A8-phone-screens-1-3-03)
- The finish summary's photo, share and error words are never tested (Medium, medium fix, FN-A8-phone-screens-1-3-05)
- No test proves records, routines, workouts and Ask an AI send nothing to the gym or an AI (Medium, medium fix, FN-A8-phone-screens-1-3-07)
- No test double-taps the buttons that save, start or share on these screens (Medium, small fix, FN-A8-phone-screens-1-3-08)
- The iPhone Settings check can never fail (Medium, small fix, FN-A8-phone-screens-1-4-01)
- The gym's news page, the diet plan page and taking back a trainer question are never shown in a test (Medium, medium fix, FN-A8-phone-screens-1-4-02)
- The Profile tab is never tested after a workout is added or deleted, or past one page of workouts (Medium, medium fix, FN-A8-phone-screens-1-4-06)
- The month report's error and its stepping between months have no test (Medium, small fix, FN-A8-phone-screens-2-1-02)
- The routine editor's guards and its failed save are never tested (Medium, medium fix, FN-A8-phone-screens-2-1-04)
- The guided first routine is never driven on a phone (Medium, small fix, FN-A8-phone-screens-2-1-06)
- The routine preview's empty, missing and failed states have no test (Medium, small fix, FN-A8-phone-screens-2-1-07)
- The saved workout page's failures have no test (Medium, small fix, FN-A8-phone-screens-2-1-08)
- The workout summary's failures have no test (Medium, small fix, FN-A8-phone-screens-2-1-09)
- Asking a trainer for help is never tested on the phone (Medium, small fix, FN-A8-phone-screens-2-2-03)
- The Settings page is checked as data, never on screen, and never after coming back to the app (Medium, small fix, FN-A8-phone-screens-2-2-05)
- Changing the default rest or the rest-over sound is never tested (Medium, small fix, FN-A8-phone-screens-2-3-01)
- The phone's Gym timings page is never opened in a test (Medium, medium fix, FN-A8-phone-screens-2-3-02)
- Workout reminders: changing days or time, and the no-gym page, are never tested (Medium, small fix, FN-A8-phone-screens-2-3-05)
- Message your gym: failures and later states are checked only as words (Medium, medium fix, FN-A8-phone-screens-2-3-06)
- The open-on-watch switch, the watch install message and the gym widget are never tested (Medium, small fix, FN-A8-phone-screens-2-3-07)
- No test proves that opening a check-in link alone records no visit (Medium, small fix, FN-A8-phone-shop-1-1-01)
- The ask to send workouts to the gym is never tested on a screen (Medium, medium fix, FN-A8-phone-shop-1-1-03)
- The gym Messages page is never tested offline or while a new message arrives (Medium, small fix, FN-A8-phone-shop-1-1-04)
- Cancelling from My orders and its empty and offline states are never checked on screen (Medium, small fix, FN-A8-phone-shop-1-2-04)
- The Pause my plan and Renew my plan sheets are never opened in a test (Medium, medium fix, FN-A8-phone-shop-1-2-05)
- The limit of 15 shop orders an hour is never tested on the server (Medium, small fix, FN-A8-phone-shop-2-1-01)
- The gym messages page with no internet is never tested (Medium, small fix, FN-A8-phone-shop-2-1-02)
- Starting the gym's workout of the day, and taking in a trainer's changed plan, are never run in a test (Medium, medium fix, FN-A8-phone-shop-2-1-04)
- The 'how busy is the gym' card is never shown on a phone in any test (Medium, medium fix, FN-A8-phone-shop-2-2-02)
- The leaderboard card and the challenge goal line are never shown on a phone in any test (Medium, medium fix, FN-A8-phone-shop-2-2-03)
- Pause my plan and Renew my plan are never used on a phone in any test (Medium, medium fix, FN-A8-phone-shop-2-2-04)
- The 'Send your report to the gym?' card is never shown on a phone, and a failed upload is never tried (Medium, medium fix, FN-A8-phone-shop-2-2-05)
- The workout offer card and its consent screen are never used on a phone, and the offer pop-up is never tapped (Medium, medium fix, FN-A8-phone-shop-2-2-06)
- After leaving a gym, no test checks the kept gym hours are forgotten, or a new gym joined while an old leave still waits (Medium, small fix, FN-A8-phone-shop-2-2-07)
- The phone tests pass even if the 'put your gym on the home screen' pop-up never appears (Medium, small fix, FN-A8-phone-shop-2-3-01)
- The trainer's video row is never shown or tapped in any test (Medium, medium fix, FN-A8-phone-shop-2-3-02)
- No test proves the Gym tab home shows only this gym's data and sends nothing extra (Medium, small fix, FN-A8-phone-shop-2-3-05)
- The plank timer's countdown is never tested (Medium, small fix, FN-A8-phone-tracker-components-1-2-01)
- The import privacy promises are never tested (Medium, medium fix, FN-A8-phone-tracker-components-1-2-03)
- Swapping an exercise in a routine, and a failed swap, are never tested (Medium, small fix, FN-A8-phone-tracker-components-2-2-03)
- Old trainer videos after a link is removed or the member changes gym are never tested (Medium, small fix, FN-A8-phone-tracker-components-2-2-07)
- Photos on the finish screen and in the cloud copy are never tested (Medium, small fix, FN-A8-phone-tracker-components-2-2-09)
- The AI coach notes switch is never tested, so workouts could reach the AI with it off (Medium, small fix, FN-A8-phone-tracker-components-2-2-12)
- A test says body measurements have no top, so 150 % body fat passes (Medium, small fix, FN-A8-phone-tracker-engine-1-01)
- No test proves weigh-ins and measurements stay private from the gym (Medium, small fix, FN-A8-phone-tracker-engine-1-02)
- Adding your own photo or video to an exercise is never tested (Medium, medium fix, FN-A8-phone-tracker-services-1-1-02)
- No test checks who gets the plate and warm-up calculators, or that the rest timer stays free (Medium, medium fix, FN-A8-phone-tracker-services-2-1-01)
- The plate calculator sheet and the warm-up button are never opened in a test (Medium, medium fix, FN-A8-phone-tracker-services-2-1-02)
- Adding, changing and removing the profile photo is never tested on screen (Medium, medium fix, FN-A8-phone-tracker-services-2-1-03)
- A wrong, dead or half-read Hevy link is never tested on screen (Medium, medium fix, FN-A8-phone-tracker-services-2-1-06)
- A Strong file, a renamed folder and the empty or failed routine steps are never tested (Medium, medium fix, FN-A8-phone-tracker-services-2-1-07)
- The 'Update routine?' question is never tested for a failed save, a second ask or a deleted routine (Medium, small fix, FN-A8-phone-tracker-services-2-1-08)
- Moving a saved workout to another day is tested only as clock maths (Medium, medium fix, FN-A8-phone-tracker-services-2-1-10)
- No test makes the routines list fail to load (Medium, small fix, FN-A8-phone-tracker-services-2-2-01)
- The workout card is never tested with notifications blocked or after the app is swiped away (Medium, medium fix, FN-A8-phone-tracker-services-2-2-02)
- No test proves heart rate stays on the phone and watch (Medium, small fix, FN-A8-phone-tracker-services-2-2-04)
- Deleting a workout from its Profile feed card is never tested (Medium, small fix, FN-A8-phone-tracker-services-2-2-07)
- Resuming a workout after Android closed the app, and rest sounds off on a locked phone, are checked only by reading code (Medium, medium fix, FN-A8-phone-tracker-services-2-2-08)
- The phone says the watch app has an update before any watch update is out on Google Play (Medium, medium fix, FN-B-time-phone-components-1-01)
- New exercises added to the library reach only new installs unless someone remembers to raise one number by hand (Medium, small fix, FN-B-time-phone-tracker-lib-01)
- Logging a set from the notification or the watch with the app closed is only checked by reading the code as text (Medium, medium fix, FN-L16-phone-native-01)
- Most of the phone's own native parts have no test at all, and some phone tests never run before a release (Medium, large fix, FN-L16-phone-native-02)
- 33 workout-tab parts have no test that loads them, and no test draws any of them (Medium, large fix, FN-L16-phone-tracker-components-2-04)
- What's new tells members silent gym messages and Rest is over now make a sound, but this was never proven on a real phone of that kind (Medium, small fix, FN-A3-notes-claude-1-03)
- Dragging an exercise up in a live workout sometimes drops it at the bottom of the list (Medium, fix size not known, FN-A3-notes-claude-1-04)
- What's new says the missing alert sound is fixed, but it was never proven on the phone that had the problem (Medium, small fix, FN-A3-whats-new-phone-01)
- Erase says nothing was deleted after the account was deleted (Medium, small fix, FN-A5-phone-components-2-2-01)
- Bringing a running rest back after a phone restart or an app update is never tested (Medium, medium fix, FN-A8-phone-native-1-01)
- A member who once deleted a gym plan folder is still told 'Your gym changed your workout plan, tap to see it', but the changed plan never comes back to the phone (Medium, small fix, FN-B-alerts-phone-tracker-lib-b-01)
- If Google sign-in breaks for a new app build, every member silently loses their only backup and MettleUp is never told (Medium, medium fix, FN-L14-phone-cloud-backup-ai-03)
- A reply from the MettleUp team reaches only the phone that asked, and only for 30 days (Medium, medium fix, FN-L14-phone-components-2-01)
- When the phone cannot count its own workouts, a restore treats the phone as empty and can replace everything without asking (Medium, small fix, FN-L16-phone-components-2-01)
- Stats tells a member to add body weight or do a bench press when it simply could not read their numbers (Medium, small fix, FN-L16-phone-screens-2-03)
- What my gym can see says the app never sends which exercises you did, even while gym-mate sharing sends them (Medium, small fix, FN-L4-phone-screens-2-01)
- The workout offer's consent screen says the gym never gets your exercises, weights or sets, but other sharing already sends them (Medium, small fix, FN-L4-phone-shop-2-02)
- Teen accounts were decided for before the public launch, but none exist (Medium, medium fix, FN-A3-inbox-2-02)
- Class booking is on the backlog as waiting for the gym visit, and is still not built (Medium, large fix, FN-A3-inbox-4-02)
- The phone offers to install the watch app on old Wear OS watches that cannot install it (Medium, small fix, FN-A3-notes-claude-1-06)
- A watch update is easy to miss: the pop-up hides for a day on the back button and leaves no lasting sign (Medium, small fix, FN-A3-notes-claude-1-07)
- The rest alert still decides 'does the watch have our app' from the one signal that was proven broken (Medium, small fix, FN-A3-notes-claude-2-02)
- The feature list says Muscles ready today and Quick workout are live, but the app switched them off (Medium, small fix, FN-A3-whats-new-phone-02)
- Backup line blames the internet for an item the server refused (Medium, small fix, FN-A5-phone-cloud-backup-ai-2-02)
- The body map says nothing was trained when the 30 or 90 day read fails (Medium, small fix, FN-A5-phone-components-1-2-01)
- The privacy notice's list of what Help and feedback sends leaves out the phone's push address and the gym member key (Medium, small fix, FN-A5-phone-components-2-1-01)
- The new-version check can stop for a long time after the phone clock goes back (Medium, small fix, FN-A5-phone-lib-core-1-01)
- Gym messages may stay silent on OPPO and OnePlus phones (Medium, small fix, FN-A5-phone-native-1-01)
- With workout sounds off, the alert check-up asks the member to turn a sound back on (Medium, small fix, FN-A5-phone-native-2-02)
- A workout delete that fails half-way leaves the workout without its records (Medium, small fix, FN-A5-phone-onboarding-db-1-02)
- The home summary has no screen: its numbers and its 'Couldn't load' line are never shown (Medium, small fix, FN-A5-phone-onboarding-db-3-01)
- In Calendar, a day with workouts can say 'No workout that day' when reading it fails (Medium, small fix, FN-A5-phone-screens-1-1-01)
- If 'Your profile' cannot be read, the page stays empty with no way to try again (Medium, small fix, FN-A5-phone-screens-1-1-02)
- A diet plan sent late at night shows the day before (Medium, small fix, FN-A5-phone-screens-1-4-01)
- A routine reorder that fails to save is undone with no word (Medium, small fix, FN-A5-phone-screens-2-2-01)
- A routine rename saved on leaving can fail with no word (Medium, small fix, FN-A5-phone-screens-2-2-02)
- Gym timings blames the gym when the phone is only offline (Medium, small fix, FN-A5-phone-screens-2-4-01)
- Taking back a plan request with weak signal makes the whole pause and renew area vanish with no word (Medium, small fix, FN-A5-phone-shop-1-2-01)
- A treadmill speed above the top is shown but not saved (Medium, small fix, FN-A5-phone-tracker-components-1-3-01)
- Strength level comparison choice can fail to save without a word (Medium, small fix, FN-A5-phone-tracker-components-2-2-01)
- Undo on the Body screen can fail without a word (Medium, small fix, FN-A5-phone-tracker-data-1-01)
- Fixing a wrong weigh-in for today asks 'Keep it?' against the wrong number (Medium, small fix, FN-A5-phone-tracker-engine-1-01)
- Body map says 'Nothing trained' when the 30 or 90 days could not be read (Medium, small fix, FN-A5-phone-tracker-engine-1-02)
- A treadmill box keeps showing a number it did not save (Medium, small fix, FN-A5-phone-tracker-engine-1-03)
- Body fat can be saved above 100 percent (Medium, small fix, FN-A5-phone-tracker-engine-2-01)
- Muscle map says 'Nothing trained' when the 30 or 90 day read fails (Medium, small fix, FN-A5-phone-tracker-lib-1-01)
- Weekly goal line counts days but says workouts (Medium, small fix, FN-A5-phone-tracker-lib-3-01)
- A hold timer left open but never started stops the forgotten workout from pausing (Medium, small fix, FN-A5-phone-tracker-services-1-3-01)
- A set logged from the watch while the app is closed can be dropped without a word (Medium, small fix, FN-A5-phone-tracker-services-2-1-01)
- Help still tells members to tap a card that was removed (Medium, small fix, FN-A5-phone-tracker-services-2-1-02)
- The phone test for Download my data expects the Saved line after the share sheet is closed without saving (Medium, small fix, FN-A8-phone-cloud-backup-ai-1-01)
- The Drive words test locks in a message that names buttons the card does not have (Medium, small fix, FN-A8-phone-cloud-backup-ai-1-02)
- No test checks the restore screen steps or its undo button (Medium, medium fix, FN-A8-phone-cloud-backup-ai-1-03)
- Download my data refusals and the daily file replacement have no test (Medium, small fix, FN-A8-phone-cloud-backup-ai-1-04)
- The packed-again backup message is never tested (Medium, small fix, FN-A8-phone-cloud-backup-ai-1-05)
- Delete my account is tested only on the server, never on the phone (Medium, medium fix, FN-A8-phone-cloud-backup-ai-1-06)
- Nothing tests that the cloud copy starts by itself (Medium, medium fix, FN-A8-phone-cloud-backup-ai-1-07)
- The Drive bring-back card guards and words are mostly untested (Medium, small fix, FN-A8-phone-cloud-backup-ai-1-08)
- Bring back my workouts has no test of its button, words or refusals (Medium, small fix, FN-A8-phone-cloud-backup-ai-1-09)
- No test checks the account card when signed in or signing out (Medium, medium fix, FN-A8-phone-cloud-backup-ai-1-10)
- New-feature dots come back a year later on the same date (Medium, small fix, FN-A8-phone-components-1-1-01)
- The crash screen says "Your workout is safe" even while saving is failing (Medium, small fix, FN-A8-phone-components-1-1-02)
- Sending the watch screen log with a message has no test of the order or the result lines (Medium, small fix, FN-A8-phone-components-2-1-04)
- The 'Which routine?' question on Log a past workout is never tested (Medium, small fix, FN-A8-phone-onboarding-db-1-04)
- The weigh-in and measures checks are never tested: bad numbers, an empty entry, the replace warning (Medium, small fix, FN-A8-phone-onboarding-db-1-05)
- Settings kept by an older version, or damaged, are never tested to keep the member's choices (Medium, small fix, FN-A8-phone-onboarding-db-3-04)
- No test taps Start, See exercises or New routine twice, or starts a workout while the phone is busy (Medium, medium fix, FN-A8-phone-screens-1-1-02)
- The month picture's body weight rule is tested only with no body weight in the data (Medium, small fix, FN-A8-phone-screens-2-1-03)
- The import's privacy line, left-out rows and result counts are never checked (Medium, small fix, FN-A8-phone-screens-2-2-04)
- Switching from one gym to another is never tested for the old gym's logo (Medium, small fix, FN-A8-phone-shop-1-1-02)
- A test requires that a member can leave the gym with a ready order still at the desk (Medium, small fix, FN-A8-phone-shop-1-2-01)
- The poster scanner screen is never opened in a test (Medium, medium fix, FN-A8-phone-shop-1-2-02)
- No test proves the plan kept for no-signal days belongs to this member and gym (Medium, small fix, FN-A8-phone-shop-1-2-03)
- No test checks the day calendar refuses future days or keeps the picked day (Medium, small fix, FN-A8-phone-tracker-components-1-1-02)
- Undo of a deleted set and the 'Remove exercise?' question are never tested (Medium, small fix, FN-A8-phone-tracker-components-1-1-03)
- The finish sheet's empty-workout and only-unticked cases are never tested (Medium, small fix, FN-A8-phone-tracker-components-1-1-04)
- The chart's free-plan limit and its empty range are never tested (Medium, small fix, FN-A8-phone-tracker-components-1-1-07)
- When saving a routine change fails, no test checks what the member sees (Medium, small fix, FN-A8-phone-tracker-components-1-2-04)
- No test checks that a backdated workout stays out of the gym's numbers (Medium, medium fix, FN-A8-phone-tracker-components-1-2-07)
- No test makes a Workout tab save fail (Medium, small fix, FN-A8-phone-tracker-components-2-3-01)
- No test covers what goes wrong on the New exercise screen (Medium, medium fix, FN-A8-phone-tracker-components-2-3-03)
- No test covers Repeat, Edit or a failure on the Profile feed (Medium, medium fix, FN-A8-phone-tracker-components-2-3-04)
- No screen test of merging or hiding exercises (Medium, small fix, FN-A8-phone-tracker-components-2-3-05)
- The import's progress, done counts and replace-with-undo are never shown (Medium, small fix, FN-A8-phone-tracker-components-2-3-06)
- The library update after a restore, and its once-only stamp, are never tested (Medium, small fix, FN-A8-phone-tracker-lib-1-01)
- Two gym plan syncs at once, and a gym switch during a sync, are never tested (Medium, small fix, FN-A8-phone-tracker-lib-1-04)
- The one-time time repair failing half-way, and start-up not waiting for it, are never tested (Medium, small fix, FN-A8-phone-tracker-services-1-2-05)
- A restored backup switches workout reminders and gym alerts back on, but on a new phone they may silently never arrive (Medium, small fix, FN-B-alerts-phone-cloud-backup-ai-a-02)
- On a new or erased phone, every old trainer reply shows as unread again (Medium, small fix, FN-B-alerts-phone-cloud-backup-ai-b-03)
- The watch update pop-up never shows while the member has put off a phone update (Medium, small fix, FN-B-alerts-phone-components-1-a-01)
- Gym reminders and gym messages can be switched on and still never arrive, with no warning (Medium, small fix, FN-B-alerts-phone-components-2-a-01)
- MettleUp cannot see whether a member ever read the team's reply to a help question (Medium, medium fix, FN-B-alerts-phone-components-2-b-01)
- A help question MettleUp closed without a reply still says the team will reply (Medium, small fix, FN-B-alerts-phone-components-2-b-02)
- A second or corrected reply from the MettleUp team reaches the member only when they next open the app (Medium, small fix, FN-B-alerts-phone-lib-core-a-01)
- On OPPO and OnePlus phones the 'Time to train' reminder can arrive with no sound and no banner, and nothing warns the member (Medium, medium fix, FN-B-alerts-phone-native-a-01)
- A workout deleted in MettleUp can stay in Health Connect for good, with no retry and no word (Medium, small fix, FN-B-alerts-phone-native-b-02)
- After a member found by number joins the gym, linking them to the gym's member list can fail silently and is never tried again (Medium, medium fix, FN-B-alerts-phone-onboarding-db-b-01)
- On OPPO and OnePlus phones the gym's automatic reminders can arrive with no sound, and the app's own rescue sound never plays for them (Medium, medium fix, FN-B-alerts-phone-shop-1-a-01)
- Turning off gym news also silently stops pop-ups for the member's own requests and orders (Medium, medium fix, FN-B-alerts-phone-shop-2-a-01)
- When the gym's reply or a pause answer misses its pop-up, the phone never pops it up later (Medium, small fix, FN-B-alerts-phone-shop-2-b-01)
- The 'Rest alerts' warning stays hidden on OPPO, Xiaomi and similar phones whose own battery rules hold the alert back (Medium, medium fix, FN-B-alerts-phone-tracker-components-1-a-01)
- During a workout the 'Alerts off' warning shows only when all notifications are off, not when just the rest sound is muted or held back (Medium, small fix, FN-B-alerts-phone-tracker-components-2-a-01)
- A gym reply pops up with the app open, but the Gym tab's red count stays at zero (Medium, small fix, FN-B-alerts-phone-tracker-components-2-b-01)
- Deleting a workout does not update the gym's workout offer count straight away (Medium, small fix, FN-B-alerts-phone-tracker-data-b-01)
- 'Your gym changed your workout plan' leads nowhere if the member once deleted that plan's folder (Medium, small fix, FN-B-alerts-phone-tracker-lib-a-01)
- Tapping the gym's 'changed your workout plan' or 'saved your measurements' pop-up can open the old copy (Medium, small fix, FN-B-alerts-phone-tracker-services-1-a-01)
- A forgotten workout keeps a running clock in the notification shade for hours or days while the app is closed (Medium, medium fix, FN-B-alerts-phone-tracker-services-1-a-02)
- The record chime and the plank countdown bell ring out loud even with the phone on silent (Medium, small fix, FN-B-alerts-phone-tracker-services-2-a-01)
- When a trainer changes a plan, any exercise the member once changed silently keeps the member's old version, and neither side is told (Medium, medium fix, FN-B-alerts-phone-tracker-services-2-b-01)
- A workout that keeps failing to save leaves no note of why, and MettleUp never hears of it (Medium, small fix, FN-B-run-phone-components-1-a-01)
- On a slow line a help question is saved but the member is told it was not, and its reply never shows (Medium, medium fix, FN-B-run-phone-components-2-a-01)
- When a workout will not save, a restore fails or an account will not delete, MettleUp never hears of it (Medium, small fix, FN-B-run-phone-components-2-a-04)
- Crash reports miss crashes on the Android side and any crash on a phone with no internet (Medium, medium fix, FN-B-run-phone-lib-core-a-04)
- When the phone app crashes in its own Android parts, MettleUp is never told (Medium, medium fix, FN-B-run-phone-native-a-01)
- A finished workout can quietly skip Health Connect when the sample-data check fails (Medium, small fix, FN-B-run-phone-native-b-01)
- When the home-screen widgets cannot be updated they keep old facts and nothing records why (Medium, small fix, FN-B-run-phone-native-b-02)
- If the phone refuses the rest timer's alarm, 'Rest is over' can come late or not at all with the app closed, and nothing records it (Medium, small fix, FN-B-run-phone-native-b-03)
- Setup, demo and home summary failures say Try again but keep no note of why (Medium, small fix, FN-B-run-phone-onboarding-db-a-01)
- While waiting for the WhatsApp check, losing the internet or a MettleUp outage shows nothing (Medium, small fix, FN-B-run-phone-onboarding-db-a-02)
- Erase all data says it worked even when saved data copies in the phone's temporary folder could not be deleted (Medium, small fix, FN-B-run-phone-onboarding-db-b-01)
- If the copy kept before a restore cannot be read, Undo restore disappears with no word (Medium, small fix, FN-B-run-phone-onboarding-db-b-02)
- After a reinstall, bringing progress photos back can fail with no word and no note (Medium, small fix, FN-B-run-phone-screens-1-a-03)
- Tapping Undo after deleting a body weight or measurement can fail with no word (Medium, small fix, FN-B-run-phone-screens-1-b-02)
- On a slow line a message or complaint to the gym can arrive twice (Medium, medium fix, FN-B-run-phone-shop-1-a-01)
- A failed gym join, order, cancel or shop refresh says try again but keeps no note of why (Medium, small fix, FN-B-run-phone-shop-1-a-03)
- Message your gym can say 'You have not sent a message yet' when the messages simply failed to load (Medium, small fix, FN-B-run-phone-shop-1-b-01)
- If member pop-ups stop going out, no member gets gym messages or trainer replies and nobody is told (Medium, small fix, FN-B-run-phone-shop-2-a-01)
- When MettleUp's payment server has a fault, the member's Pay your gym card just disappears with no word and no note (Medium, small fix, FN-B-run-phone-shop-2-a-02)
- A plank countdown does not ring at zero if the screen is switched off or the member leaves the app (Medium, medium fix, FN-B-run-phone-tracker-components-1-a-01)
- A fast double tap on New routine makes two empty routines (Medium, small fix, FN-B-run-phone-tracker-components-2-a-01)
- A Hevy link import can add every unknown exercise as new without asking (Medium, small fix, FN-B-run-phone-tracker-components-2-b-01)
- When records cannot be worked out again after an edit or a past workout, no note is kept of why (Medium, small fix, FN-B-run-phone-tracker-data-a-02)
- If an exercise's details cannot be read when a workout starts, a timed or distance exercise shows as weight and reps (Medium, small fix, FN-B-run-phone-tracker-data-b-01)
- On a stalled line the exercise demo shows an empty box for good, and the how-to drawings never appear (Medium, small fix, FN-B-run-phone-tracker-engine-a-01)
- The exercise library update can fail at every app start, or after a restore, with no trace (Medium, small fix, FN-B-run-phone-tracker-lib-a-02)
- If the 'Rest is over' alert cannot be set, the member is not told and no note is kept (Medium, small fix, FN-B-run-phone-tracker-services-2-a-02)
- A deleted workout can leave its personal records behind, with no note (Medium, small fix, FN-B-run-phone-tracker-services-2-b-01)
- The Charts page Balance check ignores the Muscle tips switch and the muscles a member put away (Medium, small fix, FN-B-switch-phone-components-1-a-01)
- Edit profile saves a half-typed mobile number as if it were complete (Medium, small fix, FN-B-switch-phone-components-2-b-01)
- When the free month ends, a gym member not yet linked to the gym in the app is only told to buy MettleUp Plus (Medium, small fix, FN-B-switch-phone-lib-core-02)
- A member who chose pounds sees kilos again on a new phone after signing in (Medium, small fix, FN-B-switch-phone-onboarding-db-a-01)
- The body weight and measurement graph would show all history free once MettleUp Plus is on (Medium, small fix, FN-B-switch-phone-screens-1-a-01)
- Following a plan with no own weekly goal: the home-screen widget shows a goal, the Workout tab does not (Medium, small fix, FN-B-switch-phone-screens-1-a-02)
- A bio changed or removed on Edit profile stays visible to gym mates for hours (Medium, small fix, FN-B-switch-phone-screens-1-a-03)
- Workout offer reminders can keep coming after the gym's plan stops including workout offers (Medium, small fix, FN-B-switch-phone-shop-1-a-01)
- Reminders that say 'Check in and train today' can arrive on a day the gym is closed (Medium, small fix, FN-B-switch-phone-shop-1-a-02)
- A member who joins from the invite link sees no plan, no plan reminders and no diet plan until they scan the check-in poster at the gym (Medium, medium fix, FN-B-switch-phone-shop-1-b-01)
- A member on a pause the desk approved still gets 'We haven't seen you, come in when you can' (Medium, small fix, FN-B-switch-phone-shop-2-a-01)
- The plus and minus buttons and the watch dial ignore the member's machine steps and plates (Medium, small fix, FN-B-switch-phone-tracker-components-1-a-01)
- Trainers and gym mates see half the kg lifted for 'kg each' dumbbell exercises (Medium, small fix, FN-B-switch-phone-tracker-data-01)
- A muscle tip can suggest an exercise the member's plan rules out (Medium, small fix, FN-B-switch-phone-tracker-engine-01)
- The AI coach knows how many workouts the member did this week, but not the member's own weekly goal (Medium, small fix, FN-B-switch-phone-tracker-lib-01)
- 'Save my history' and 'Ask your own AI' include the sample workouts as the member's own (Medium, small fix, FN-B-switch-phone-tracker-services-1-a-02)
- A shared routine shows different rep ranges from the ones the member sees (Medium, small fix, FN-B-switch-phone-tracker-services-2-a-02)
- The age a member types never grows, so a 17-year-old's workouts are never backed up even after they turn 18 (Medium, medium fix, FN-B-time-phone-components-2-01)
- A year after a feature came out, its 'new' dots light up again (Medium, small fix, FN-B-time-phone-lib-core-01)
- Once MettleUp Plus is on, a gym member's free month runs out while the gym is already giving them everything (Medium, small fix, FN-B-time-phone-lib-core-02)
- A member who stays away for a few months can stop getting 'Time to train' reminders, and nothing tells them (Medium, small fix, FN-B-time-phone-native-01)
- A member who moves to a new phone and joins the gym again becomes a second member, and the old one stays (Medium, medium fix, FN-B-time-phone-shop-1-01)
- Members already in a gym are never asked the 18+ and terms tick, not even when the terms change (Medium, small fix, FN-B-time-phone-shop-2-01)
- Members who joined before 'busy times by exercise' start sharing which machines they use when their gym turns it on, with no word (Medium, small fix, FN-B-time-phone-shop-2-02)
- An update's one-time records repair can wipe a lift's records for good if the app closes mid-way (Medium, small fix, FN-B-time-phone-tracker-services-2-01)
- Replace everything on this phone brings the old workouts straight back for a signed-in member (Medium, small fix, FN-B-truth-phone-cloud-backup-ai-a-02)
- Signing in on a new phone loses hidden exercises and changes made to how a library exercise is logged (Medium, medium fix, FN-B-truth-phone-cloud-backup-ai-a-04)
- If the coach comes back, its "this week" counts the last 7 days while Home counts from Monday (Medium, small fix, FN-B-truth-phone-cloud-backup-ai-b-02)
- If the coach comes back, "am I improving" says weight lifted is up 0% for a new member and shows a drop early in each week (Medium, small fix, FN-B-truth-phone-cloud-backup-ai-b-03)
- The body map lights the rear and front shoulders for side raises, then says those shoulders were not trained (Medium, small fix, FN-B-truth-phone-components-1-b-01)
- A restore that leaves out damaged workouts still says it restored everything, and after Replace those workouts are gone from the phone (Medium, small fix, FN-B-truth-phone-components-2-a-01)
- The share picture rounds a 11.25 kg set to 11.3 kg, though the workout shows 11.25 kg (Medium, small fix, FN-B-truth-phone-lib-core-a-01)
- The home-screen week widget and the Progress tab give different counts for the same week (Medium, small fix, FN-B-truth-phone-native-a-01)
- After a long break the Today widget still tells the member to lift heavier than last time (Medium, small fix, FN-B-truth-phone-native-b-01)
- A workout the member logs through the coach on the day the demo was loaded, or earlier, is treated as the demo's and deleted with it (Medium, small fix, FN-B-truth-phone-onboarding-db-b-01)
- Profile's 'Records' number never matches the Records page or the Charts page (Medium, small fix, FN-B-truth-phone-screens-1-b-01)
- Muscles ready today can say 'your last workout' but show the sets of an older, heavier workout (Medium, small fix, FN-B-truth-phone-screens-2-b-01)
- How busy the gym is can keep showing an old 'people in the last 90 minutes' count (Medium, small fix, FN-B-truth-phone-shop-1-b-02)
- With no signal, My membership shows the days left and visits as they were on the day it was saved (Medium, small fix, FN-B-truth-phone-shop-2-a-01)
- The gym leaderboard and the trainer's chart count 'kg lifted' differently for the same workouts (Medium, small fix, FN-B-truth-phone-shop-2-a-02)
- A member who renews after a long break gets 'We haven't seen you for 60 days' the next morning (Medium, small fix, FN-B-truth-phone-shop-2-b-01)
- The same routine workout has a different name on different screens and for the gym's trainer (Medium, small fix, FN-B-truth-phone-tracker-data-a-01)
- Renaming a saved workout does not change its name in Health Connect (Medium, small fix, FN-B-truth-phone-tracker-data-a-02)
- Last time's numbers differ between logging a workout and editing it later (Medium, small fix, FN-B-truth-phone-tracker-data-b-01)
- A member who uses pounds sees the wrong body-weight change (Medium, small fix, FN-B-truth-phone-tracker-engine-a-01)
- The monthly report compares a new member's first full month with the few days they trained the month before (Medium, small fix, FN-B-truth-phone-tracker-engine-b-03)
- Profile and Statistics give different workout counts for "the last 3 months" (Medium, small fix, FN-B-truth-phone-tracker-engine-b-05)
- A gym plan the phone cannot read is marked 'No longer sent', though the gym still sends it (Medium, small fix, FN-B-truth-phone-tracker-lib-a-01)
- After 6 weeks off, the Profile's 'kg to lift' goal still asks for at least the old total, while each exercise card plans a lighter start (Medium, small fix, FN-B-truth-phone-tracker-lib-b-01)
- The AI coach can delete a saved workout with no on-screen check and no undo (Medium, small fix, FN-B-truth-phone-tracker-services-2-a-01)
- After a Drive restore that did not fully finish, the member is told to tap Restore again, but no button has that name (Medium, small fix, FN-B-words-phone-cloud-backup-ai-02)
- Tapping a point on the Strength score chart opens one end-of-month day, which usually has no workout (Medium, small fix, FN-B-words-phone-components-1-01)
- The help box promises an answer at once, but often the member gets only a thank-you and no word on when a person will answer (Medium, small fix, FN-B-words-phone-components-2-01)
- Setup says kilograms or pounds can be changed in Profile, but that choice is only in Settings (Medium, small fix, FN-B-words-phone-onboarding-db-01)
- Bringing in Hevy or Strong workouts says nothing is uploaded, but the workouts then go to the gym's leaderboard and the saved copy (Medium, small fix, FN-B-words-phone-screens-1-01)
- A new challenge notification says 'tap to see it on the leaderboard' but opens the My gym part instead (Medium, small fix, FN-B-words-phone-shop-1-01)
- 'Send your report to the gym?' lists less than the report holds, and more people than it names can open it (Medium, small fix, FN-B-words-phone-shop-2-02)
- 'A file another MettleUp member can open' is sent with no way to open it by tapping (Medium, small fix, FN-B-words-phone-tracker-components-2-01)
- Bringing in Hevy or Strong workouts promises routines, but a member with few repeated workouts gets none and no word why (Medium, small fix, FN-B-words-phone-tracker-services-1-02)
- If the AI coach comes back, it has no health safety rules and no way to report a bad reply, which Google Play asks of AI apps (Medium, medium fix, FN-L12-phone-cloud-backup-ai-01)
- The copy uploaded to Google Play still carries the 'download the new version file from GitHub' update path (Medium, small fix, FN-L12-phone-components-1-01)
- On an iPhone the update screen would tell members to download an Android app file (Medium, small fix, FN-L12-phone-components-1-02)
- The AI coach's replies have no way to report a bad or offensive answer (Medium, medium fix, FN-L12-phone-components-1-03)
- On iPhone the permission questions talk about the hidden AI coach, not what the app really uses (Medium, small fix, FN-L12-phone-components-2-01)
- Once MettleUp Plus is switched on, an iPhone member would lose the paid features with no way to buy them, and be told to pay through Google Play (Medium, medium fix, FN-L12-phone-lib-core-01)
- Importing routines from a Hevy link copies Hevy's pages through a hidden browser without Hevy's permission (Medium, medium fix, FN-L12-phone-screens-1-01)
- Google Play wants MettleUp's EU trader status declared by 1 February 2027 (Medium, small fix, FN-L12-phone-screens-1-03)
- The MettleUp Plus page does not say the monthly and yearly plans renew by themselves, and has no link to cancel (Medium, small fix, FN-L12-phone-screens-2-02)
- Our own exercise pictures are made to copy the paid picture supplier's character exactly, and are called ours with no credit (Medium, small fix, FN-L12-phone-tracker-lib-01)
- On an iPhone, progress photos and exercise clips would go to the member's iCloud backup even with photo backup left off (Medium, small fix, FN-L12-phone-tracker-services-1-01)
- A damaged or full Drive backup tells the member to tap Back up now, a button that no longer exists (Medium, small fix, FN-L14-phone-cloud-backup-ai-01)
- When a help message cannot be sent, the member app gives no other way to reach MettleUp (Medium, small fix, FN-L14-phone-lib-core-02)
- Failures the member app catches itself never reach MettleUp (Medium, medium fix, FN-L14-phone-lib-core-03)
- The member app is hard-wired to the founder's personal GitHub account and personal web address (Medium, medium fix, FN-L14-phone-lib-core-05)
- When the rest alert, the watch link, Health Connect or a Plus payment fails on a member's phone, MettleUp never hears of it (Medium, medium fix, FN-L14-phone-native-01)
- When the app cannot open a member's data, MettleUp is never told (Medium, small fix, FN-L14-phone-onboarding-db-02)
- When bringing in Hevy or Strong workouts fails, or undoing it fails, nothing records why and the member has nowhere to turn (Medium, small fix, FN-L14-phone-screens-1-01)
- A member who paid for MettleUp Plus but is told 'this Google account has no Plus' is given no next step (Medium, small fix, FN-L14-phone-screens-2-01)
- A member who pays the gym straight by UPI cannot tell the gym, and the fee keeps showing as owed (Medium, medium fix, FN-L14-phone-shop-2-01)
- When bringing routines in from Hevy or Strong fails, nothing records why and the member has nowhere to turn (Medium, small fix, FN-L14-phone-tracker-components-2-01)
- Moving to a new phone silently leaves workout photos, the profile photo and own exercise pictures behind (Medium, small fix, FN-L14-phone-tracker-data-01)
- Two separate ways of wiping and refilling the phone on a restore, kept in step by hand (Medium, medium fix, FN-L16-phone-cloud-backup-ai-01)
- Restore screen can say this phone has 0 workouts when it simply could not count them (Medium, small fix, FN-L16-phone-cloud-backup-ai-02)
- Tests meant to guard the Charts page check old parts the page no longer shows (Medium, small fix, FN-L16-phone-components-1-02)
- The 'finish your workout first' guard before a restore lets the restore go ahead if the open workout cannot be read (Medium, small fix, FN-L16-phone-components-2-02)
- If the profile cannot be read, Edit profile shows blank locked boxes with no message (Medium, small fix, FN-L16-phone-components-2-03)
- The MettleUp Plus wiring and the shared screen-loading helpers have no test at all (Medium, medium fix, FN-L16-phone-lib-core-03)
- Going straight into the gym after phone sign-in is only tested by looking for words in the code (Medium, small fix, FN-L16-phone-onboarding-db-01)
- A home-screen widget Start whose routine could not be read drops the member on the Workout tab with no message (Medium, small fix, FN-L16-phone-screens-2-01)
- Failed saves on several screens show 'try again' but leave no record of what went wrong (Medium, small fix, FN-L16-phone-screens-2-02)
- The quick tests of the live workout screen only look for words in its code; no quick test opens any of these screens (Medium, medium fix, FN-L16-phone-screens-2-06)
- Some gym tab tests check rules the app no longer uses, so they pass whatever the screens do (Medium, small fix, FN-L16-phone-shop-1-01)
- With weak signal, Pay for this order says the gym has no online payment (Medium, small fix, FN-L16-phone-shop-2-01)
- Eleven gym helpers, including paying the gym and saving the push address, have no test at all (Medium, medium fix, FN-L16-phone-shop-2-02)
- A failed exercise swap or a failed past-workout start says 'try again' but leaves no record of why (Medium, small fix, FN-L16-phone-tracker-components-1-01)
- The rest alerts warning stays hidden, with no trace, when the phone's alert settings cannot be read (Medium, small fix, FN-L16-phone-tracker-components-1-02)
- No workout screen part in this group is ever run by a quick test; tests only look for words in its code (Medium, large fix, FN-L16-phone-tracker-components-1-05)
- Changing how an exercise's weight is counted can fail to be kept without a word (Medium, small fix, FN-L16-phone-tracker-data-02)
- When the rest card or the workout-in-progress card fails to show, nothing records why (Medium, small fix, FN-L16-phone-tracker-services-2-02)
- When the coach comes back, words a trainer types into a gym plan could steer it into deleting a member's workouts (Medium, medium fix, FN-L19-phone-cloud-backup-ai-02)
- One outsider can use up the day's spoken messages for every member, and get free voice-to-text (Medium, small fix, FN-L19-phone-components-2-01)
- Whether a member has paid for MettleUp Plus is known only to the phone, so a changed phone or a blocked Google Play keeps Plus open (Medium, large fix, FN-L19-phone-lib-core-01)
- One person can stop every member from speaking a help message for the rest of the day (Medium, medium fix, FN-L19-phone-lib-core-02)
- A member can top the gym leaderboard with workouts typed in after the fact or imported from another app (Medium, medium fix, FN-L19-phone-screens-1-01)
- Words a member types in the app are shown to everyone in the gym, and the owner cannot take them down (Medium, medium fix, FN-L19-phone-tracker-data-01)
- A member can top the gym's kg board with made-up sets (Medium, small fix, FN-L19-phone-tracker-engine-01)
- The phone app reads Hevy and Strong export files with a spreadsheet library that has two known serious flaws (Medium, small fix, FN-L3-phone-tracker-components-1-01)
- Erase all data says it worked even when progress photos or the profile photo could not be deleted (Medium, small fix, FN-L4-phone-components-2-03)
- The 'Your workouts are only on this phone' card is not true for gym members or phones with Android backup on (Medium, small fix, FN-L4-phone-lib-core-01)
- The Health Connect page says only workouts logged in MettleUp are sent, but imported workouts are sent too (Medium, small fix, FN-L4-phone-native-01)
- Weigh-ins from Health Connect would reach the gym and an AI if two switched-off features came back (Medium, medium fix, FN-L4-phone-native-02)
- Phone sign-in says 'we never message you', but MettleUp replies on WhatsApp after the check (Medium, small fix, FN-L4-phone-onboarding-db-02)
- Bringing back a Google Drive backup on the welcome screen warns only about workouts, but also deletes routines and body records (Medium, small fix, FN-L4-phone-onboarding-db-03)
- The 'What my gym can see' page says MettleUp never sends which exercises you did, even while the member shares workouts with gym mates (Medium, small fix, FN-L4-phone-shop-1-01)
- Find my gym says we never message you, but MettleUp's WhatsApp number writes back after the check (Medium, small fix, FN-L4-phone-shop-1-02)
- Exercise demo films are fetched from GitHub, which the privacy notice does not list for that (Medium, small fix, FN-L4-phone-tracker-engine-01)
- Importing routines from a Hevy share link opens Hevy's web page inside the app, and the privacy notice does not name Hevy (Medium, small fix, FN-L4-phone-tracker-services-2-01)
- A member who pays for MettleUp Plus and then joins a gym or works at one is never told the Google Play plan keeps charging (Medium, small fix, FN-L5-phone-screens-1-01)
- A Plus payment that is waiting, or a plan that is cancelled or refunded, is only noticed when the app is fully restarted (Medium, small fix, FN-L5-phone-screens-1-02)
- A MettleUp Plus payment that was waiting does not open Plus when Google Play confirms it, until the app is closed and opened again (Medium, small fix, FN-L5-phone-screens-2-01)
- MettleUp Plus purchases are kept only on the member's phone, so MettleUp never sees who paid, how much, or a refund (Medium, medium fix, FN-L5-phone-screens-2-02)
- The refunds page says members never pay MettleUp, but the app is ready to sell MettleUp Plus to members, with no refund rule for it (Medium, small fix, FN-L5-phone-screens-2-03)
- A shop order paid in the app still says pay at the desk (Medium, small fix, FN-L5-phone-shop-1-02)
- After paying for a shop order online, the order still shows the pay buttons (Medium, small fix, FN-L5-phone-shop-1-03)
- When the gym's payment link runs out, the Pay your gym box disappears with no word (Medium, small fix, FN-L5-phone-shop-1-04)
- A fee the gym asked a member to pay quietly disappears from the member app after 7 days, though it is still owed (Medium, small fix, FN-L5-phone-shop-2-01)
- Renew my plan asks the member to pick a plan without showing what any plan costs (Medium, small fix, FN-L5-phone-shop-2-02)
- A member who buys MettleUp Plus during a workout still gets no suggested weights in that workout (Medium, small fix, FN-L5-phone-tracker-data-01)
- A member learns the phone is out of space only after a workout save has already failed (Medium, small fix, FN-L8-phone-components-1-01)
- Nobody is warned before the help box AI answers stop for the month (Medium, small fix, FN-L8-phone-components-2-01)
- When all members together reach the day's speaking limit, each member is told he spoke too much, and nobody at MettleUp is warned (Medium, small fix, FN-L8-phone-components-2-02)
- Members who installed the app from GitHub may never hear of a new version when GitHub's free hourly limit is used up (Medium, small fix, FN-L8-phone-lib-core-01)
- The phone number check keeps asking the server every 3 seconds even after it has run out of time (Medium, small fix, FN-L8-phone-onboarding-db-01)
- When a member's workout data alone grows past Android's 25 MB backup limit, the phone's backup silently stops and nobody is told (Medium, small fix, FN-L8-phone-tracker-services-1-01)
- The Undo bar runs out after 6 seconds even for a member using a screen reader (Medium, small fix, FN-L9-phone-components-2-02)
- When a backup, restore, gym connect or erase fails, a screen reader says nothing (Medium, small fix, FN-L9-phone-components-2-04)
- After the WhatsApp check, a screen reader is not told whether the gym was found (Medium, small fix, FN-L9-phone-onboarding-db-01)
- On the start-up error screen, a failed Save my data file is not read out (Medium, small fix, FN-L9-phone-onboarding-db-02)
- On the month report calendar, the days trained are shown by colour only (Medium, small fix, FN-L9-phone-tracker-components-1-02)
- Tapping Not now a second time on a muscle tip stops it for good without saying so on screen (Medium, small fix, FN-L9-phone-tracker-components-1-05)
- A screen reader says nothing about the share picture before it is shared (Medium, small fix, FN-L9-phone-tracker-lib-01)
- Closing the Update routine question loses the change for good (Medium, small fix, FN-L9-phone-tracker-services-2-01)
- A script with no phone number can use up the day's demo requests, so real gym owners are turned away (Medium, small fix, FN-L19-phone-shop-1-01)
- The backlog calls a location check at the QR scan worth building, but nothing of it exists (Medium, medium fix, FN-A3-inbox-4-01)
- A member who turns off 'Reminders from my gym' still looks reached to the owner (Medium, medium fix, FN-B-alerts-phone-native-a-03)
- A crash that comes back after a fix, or spreads to many phones, raises no new alert (Medium, small fix, FN-B-run-phone-lib-core-a-05)
- Find my gym is tested only with a made-up answer, never with the WhatsApp step (Medium, medium fix, FN-A8-phone-shop-2-3-06)
- Four older What's new lines describe things the app has since removed or changed (Medium, small fix, FN-A3-whats-new-phone-03)
- Each member who shares with trainers keeps up to a year of workouts in the shared free database, with no total budget (Medium, medium fix, FN-L8-phone-shop-2-01)
- Workout reports of up to 3 MB each are stored in the shared database with no total cap per gym (Medium, medium fix, FN-L8-phone-shop-2-02)
- When the AI-written finish note fails, no note is kept of why (Small, small fix, FN-B-run-phone-tracker-services-1-a-03)
- Backlog says "Steps and water each day" is live, but only steps exist (Small, small fix, FN-A3-inbox-1-14)
- Gym sync sign-in has no way back for a forgotten password (Small, small fix, FN-L14-phone-components-2-02)
- When MettleUp's help server is down, the member is told to check their own internet (Small, small fix, FN-B-run-phone-components-2-a-02)
- The sign-in-not-open message calls the gym code a 6-letter code, but codes also hold numbers (Small, small fix, FN-B-words-phone-onboarding-db-02)
- Two notices still say 'OK' though the app's rule is never 'OK' (Small, small fix, FN-A5-phone-components-2-3-01)
- No test checks the body map or the kg to beat change after a new or deleted workout (Small, small fix, FN-A8-phone-tracker-components-1-1-09)
- The 'Try a lighter weight' card is described as live, but the tests say it was removed (Small, small fix, FN-A8-phone-tracker-lib-2-01)
- Once MettleUp Plus limits are on, the body weight and measurement charts still show every entry ever (Small, small fix, FN-B-switch-phone-cloud-backup-ai-01)
- The 1-rep max calculator throws away a weight or reps typed or pasted in Hindi digits (Small, small fix, FN-B-switch-phone-screens-1-b-01)
- Workout time, length, machine and weigh-in fix boxes drop or refuse numbers in Hindi digits (Small, small fix, FN-B-switch-phone-tracker-components-1-b-01)
- While the demo is loaded, the home-screen widget shows the demo's workouts with no word that they are the demo (Small, small fix, FN-B-switch-phone-tracker-components-2-a-01)
- The 'Gym right now' widget says 'Last checked' with a time but no day (Small, small fix, FN-B-time-phone-native-02)
- The day calendar for a workout or weigh-in reads each day out as '2026-11-03' to a blind member (Small, small fix, FN-B-truth-phone-tracker-components-1-a-01)
- The easy week's end date shows on the Workout tab and Start screen but not during the workout (Small, small fix, FN-B-truth-phone-tracker-components-1-b-03)
- One step has three names: Sign in, Turn on backup, and Confirm your phone number (Small, small fix, FN-B-words-phone-components-1-03)
- The same action is called 'bring back' on one button and 'restore' on the next (Small, small fix, FN-B-words-phone-components-2-02)
- With bigger text on a small phone, the title of the 'delete your account' question is cut off (Small, small fix, FN-B-words-phone-components-2-03)
- The same 'tick my next set' button is called 'Done' on the rest card and 'Complete set' on the workout card (Small, small fix, FN-B-words-phone-native-02)
- The app-icon shortcut pictures are a flat orange disc, not the shape the launcher expects (Small, small fix, FN-B-words-phone-native-03)
- The same thing gets two names on one path: 'picture' and 'progress photo' on Body, 'the demo' and 'the sample member' on import (Small, small fix, FN-B-words-phone-screens-1-02)
- The same things go by different names on the Gym tab: Ranking or leaderboard, poster or check-in QR (Small, small fix, FN-B-words-phone-shop-1-02)
- Workout sounds says 'a bell when rest is over', but the rest-over sound is the MettleUp chime unless you pick Bell (Small, small fix, FN-B-words-phone-tracker-components-2-02)
- The body-weight moves switch says 'moves with no weight', but it also covers moves done with added weight or assistance (Small, small fix, FN-B-words-phone-tracker-data-01)
- Two badge 'how to earn' lines describe a rule the app does not use (Small, small fix, FN-B-words-phone-tracker-engine-02)
- Two home programs need more gear, or a different number of days, than their description says (Small, small fix, FN-B-words-phone-tracker-engine-03)
- The Strength score names three lifts in one line and five in the next (Small, small fix, FN-B-words-phone-tracker-engine-04)
- The Target line uses other words than the rest of the app for body weight and machine help (Small, small fix, FN-B-words-phone-tracker-engine-05)
- The In use tick says 'after every set', but it never opens after an exercise's last set (Small, small fix, FN-B-words-phone-tracker-lib-02)
- The same record goes by two or three names across the workout, the exercise page and the finish screen (Small, small fix, FN-B-words-phone-tracker-services-1-01)
- "It opens on your watch too" is said even when the member turned that off (Small, small fix, FN-B-words-phone-tracker-services-2-01)
- The pause buttons use Title Case while every other button uses sentence case (Small, small fix, FN-B-words-phone-tracker-services-2-04)
- Ask a trainer is listed as behind a switch, but live it is no longer offered at all (Small, small fix, FN-H5-phone-shop-1-01)
- Find my gym on the Gym tab and the Plus lock are listed as live or switchable, but the member paid-plan switch keeps both off (Small, small fix, FN-H5-phone-shop-2-01)
- The feature list says sharing workouts with trainers is on by default, but it starts off (Small, small fix, FN-H5-phone-shop-2-02)
- On an iPhone the gym message, trainer reply and reminder switches would do nothing (Small, medium fix, FN-L12-phone-shop-2-01)
- Android's notification settings say workout reminders are set in Profile, but they are set in Settings, Reminders (Small, small fix, FN-L14-phone-native-03)
- A timed hold is written by two different rules: '1 min 30 s' in the routine preview, '90 s' in the Hevy import check (Small, small fix, FN-L16-phone-screens-2-05)
- The warm-up, drop and failure set letters are worked out separately in four places (Small, small fix, FN-L16-phone-tracker-components-2-02)
- The Charts page reads weekly volume and the training calendar twice on every visit and throws one copy away (Small, small fix, FN-L7-phone-components-1-01)
- The Workout tab reads every workout ever saved just to count them, each time the tab opens (Small, small fix, FN-L7-phone-lib-core-01)
- Opening the app starts about nine background jobs at the same moment as the first screen (Small, small fix, FN-L7-phone-native-01)
- The Body page draws every weigh-in ever logged at once (Small, small fix, FN-L7-phone-screens-1-01)
- The Progress photos page checks every photo's file on the phone each time it opens, before showing any photo (Small, small fix, FN-L7-phone-screens-2-01)
- The phone screen never turns off while a workout is open, and there is no setting to let it sleep (Small, small fix, FN-L7-phone-screens-2-02)
- Every switch to the Gym tab asks the gym server about seven questions again, even seconds after the last time (Small, small fix, FN-L7-phone-shop-1-01)
- Workout photos in the Profile feed are drawn from the full-size camera pictures (Small, small fix, FN-L7-phone-tracker-components-2-01)
- The body map's 'last trained' line and the Statistics 'Main exercises' go through every set ever logged each time they load (Small, medium fix, FN-L7-phone-tracker-services-2-01)
- A screen reader user cannot speak to the coach: the mic only works while held (Small, small fix, FN-L9-phone-components-1-01)
- In an exercise's history, the best set is marked only by colour, and drop and failure sets only by a letter (Small, small fix, FN-L9-phone-components-1-03)
- Each record row on the Charts page opens the exercise but shows no arrow (Small, small fix, FN-L9-phone-components-1-04)
- Only half of the round help button is on screen, so the part you can tap is about half the finger size (Small, small fix, FN-L9-phone-components-2-01)
- The AI key box and its Edit button do not say what they are for (Small, small fix, FN-L9-phone-components-2-06)
- The Stop control on the Health Connect rows does not look like a button (Small, small fix, FN-L9-phone-native-02)
- When importing from Hevy or Strong, a screen reader does not say which choice (add to or replace) is picked (Small, small fix, FN-L9-phone-screens-1-03)
- A few buttons on these screens are smaller than a finger (Small, small fix, FN-L9-phone-screens-2-02)
- In the routine editor, a screen reader is not told when Move up, Move down, minus or plus cannot be used, or what the number is (Small, small fix, FN-L9-phone-screens-2-03)
- In the pause calendar a screen reader reads each day as a computer date, and the day circles are small (Small, small fix, FN-L9-phone-shop-1-02)
- The minus 5 s, Stopwatch and plus 5 s buttons on the hold timer are small to tap (Small, small fix, FN-L9-phone-tracker-components-1-03)
- The minimised workout bar does not say the rest time left or the workout time (Small, small fix, FN-L9-phone-tracker-components-2-03)
- Backlog says phone-number sign-in is switched off, but it is switched on in the app code (Small, small fix, FN-A3-inbox-1-17)
- MettleUp cannot see how many members use the rest alert, watch app, widgets, reminders or Health Connect (Small, medium fix, FN-B-run-phone-native-a-02)
- A help question sent again after a lost answer reaches MettleUp twice and is paid twice (Small, small fix, FN-B-run-phone-lib-core-a-01)
- A 'Did this solve it?' tap made with no internet never reaches MettleUp (Small, small fix, FN-B-run-phone-lib-core-a-03)
- On a narrow phone the Swap list can cut off 'harder version' or 'easier version' (Small, small fix, FN-B-words-phone-tracker-components-2-04)
- A gym name typed on Find my gym is lost without a word when it cannot be sent (Small, small fix, FN-L14-phone-screens-1-02)
- Closing the feedback sheet while speaking throws away what was said (Small, medium fix, FN-L9-phone-components-2-05)
- A line chart's tap box and a range change on a picked bar are never tested (Small, small fix, FN-A8-phone-components-1-2-07)
- The Reports card row words and last year's review are never checked on screen (Small, small fix, FN-A8-phone-components-1-2-09)
- 'See earlier updates' and the What's new buttons are never tapped in a test (Small, small fix, FN-A8-phone-components-1-2-10)
- No test double-taps 'Update on watch' (Small, small fix, FN-A8-phone-components-1-2-12)
- Save my history and Save my measurements are never checked while busy, empty or blocked (Small, small fix, FN-A8-phone-components-2-2-01)
- The 'Notifications are off' row for gym reminders has no test at all (Small, small fix, FN-A8-phone-components-2-2-04)
- 'Remove animations' is never tested for the undo bars or for a switch made while the app is open (Small, small fix, FN-A8-phone-components-2-3-05)
- The coach's notes to the member are never checked (Small, small fix, FN-A8-phone-lib-core-1-06)
- The 'Your workouts are only on this phone' card is never shown or tapped in a test (Small, small fix, FN-A8-phone-lib-core-2-01)
- The 'Rest days' card and a deleted workout lowering the streak are never tested (Small, small fix, FN-A8-phone-lib-core-2-02)
- The Health Connect privacy link is checked only as text in the app's settings file (Small, small fix, FN-A8-phone-lib-core-2-06)
- The start-up screen is untested on older Android and when switching gyms back (Small, small fix, FN-A8-phone-lib-core-2-07)
- The gym logo shortcut is tested only for its words and drawing (Small, small fix, FN-A8-phone-lib-core-2-08)
- The Units page itself is never tested (Small, small fix, FN-A8-phone-lib-core-2-09)
- No test checks the first-opened time is written once and never moved (Small, small fix, FN-A8-phone-onboarding-db-3-03)
- No test checks an AI key stays out of the plain settings, or the coach choices hide when the coach is off (Small, small fix, FN-A8-phone-onboarding-db-3-05)
- Records, the month report and Ask an AI are never tested to update after a workout is added or deleted (Small, small fix, FN-A8-phone-screens-1-3-09)
- The Default rest sheet and its failed save are never tested (Small, small fix, FN-A8-phone-screens-1-4-03)
- Hiding an exercise and the Hidden exercises page are never used on screen (Small, small fix, FN-A8-phone-screens-1-4-04)
- The Badges and Credits pages are never opened in a test (Small, small fix, FN-A8-phone-screens-1-4-05)
- Supersets, sharing, swapping and use after the free month in the routine editor have no test (Small, medium fix, FN-A8-phone-screens-2-1-05)
- The light or dark switch is only photographed, never checked (Small, small fix, FN-A8-phone-screens-2-3-03)
- Bring a friend is never tested for a pull to refresh or a server without it (Small, small fix, FN-A8-phone-shop-1-1-07)
- The How busy the gym is card is never drawn in a test (Small, small fix, FN-A8-phone-shop-1-1-08)
- The empty bag, 'Cancelling…' and the busy order button are never checked (Small, small fix, FN-A8-phone-shop-2-1-05)
- The 'Ask about your workout' journeys describe a Gym tab row the phone test says must be gone (Small, small fix, FN-A8-phone-shop-2-2-01)
- The question box's 500-letter counter, the empty question line and a double tap are never tested (Small, small fix, FN-A8-phone-shop-2-2-08)
- A member moved to a pass while an old paid plan still runs is never tried on the phone (Small, small fix, FN-A8-phone-shop-2-2-09)
- 'Messaging your gym is not ready yet' is never tested (Small, small fix, FN-A8-phone-shop-2-3-03)
- Bring a friend's count is never checked to stay at 0 before a friend joins, or to go back down (Small, small fix, FN-A8-phone-shop-2-3-07)
- The folder and workout name sheet is barely tested (Small, small fix, FN-A8-phone-tracker-components-1-2-05)
- The month's 'Days you trained' calendar is only photographed (Small, small fix, FN-A8-phone-tracker-components-1-2-06)
- The 'Rest alerts' fix row is never tapped or read by a phone test (Small, small fix, FN-A8-phone-tracker-components-1-2-08)
- The exercise rest picker is never checked on screen (Small, small fix, FN-A8-phone-tracker-components-2-1-01)
- The rest bar's plus 15 and minus 15 buttons and 'Turn on' are never pressed in a test (Small, small fix, FN-A8-phone-tracker-components-2-1-02)
- The 'Keep it?' question is never required on screen and Fix is never tested (Small, small fix, FN-A8-phone-tracker-components-2-1-03)
- Warm-up and Failure set types are never chosen in a test (Small, small fix, FN-A8-phone-tracker-components-2-1-04)
- The workout recap's odd cases are never tested (Small, small fix, FN-A8-phone-tracker-components-2-1-05)
- When sharing fails or is cancelled, no test checks what the member sees (Small, small fix, FN-A8-phone-tracker-components-2-1-06)
- Parts of bringing routines in are never tested on screen (Small, small fix, FN-A8-phone-tracker-components-2-1-07)
- The sleep and protein line on the finish screen is never shown in a test (Small, small fix, FN-A8-phone-tracker-components-2-1-08)
- Timed, distance and target rows of a workout are barely tested (Small, small fix, FN-A8-phone-tracker-components-2-1-09)
- Making and joining a superset is only half tested (Small, small fix, FN-A8-phone-tracker-components-2-2-02)
- The 'Demo data · Remove' strip is never tested (Small, small fix, FN-A8-phone-tracker-components-2-2-05)
- The Gym tab badge and the tab bar over the keyboard are never tested (Small, small fix, FN-A8-phone-tracker-components-2-2-06)
- The workout bar above the tabs is barely tested (Small, small fix, FN-A8-phone-tracker-components-2-2-08)
- A deleted or unreadable saved workout page is never tested (Small, small fix, FN-A8-phone-tracker-components-2-2-10)
- The workout calendar and list updates are never tested (Small, small fix, FN-A8-phone-tracker-components-2-2-11)
- The body-weight moves switch on the Last time's numbers page is never tested on screen (Small, small fix, FN-A8-phone-tracker-components-2-2-13)
- Easy weeks in Settings is never tested (Small, small fix, FN-A8-phone-tracker-components-2-2-14)
- The weekly goal page's screen reader words and the widget count are never tested (Small, small fix, FN-A8-phone-tracker-components-2-2-15)
- The Recent exercises list is never tested after a workout is deleted (Small, small fix, FN-A8-phone-tracker-data-1-02)
- 'Start records fresh' is never tested for a never-logged exercise, its error, or its question words (Small, small fix, FN-A8-phone-tracker-data-1-03)
- The 'This week so far' card is checked only as numbers, never on screen (Small, small fix, FN-A8-phone-tracker-engine-1-03)
- Ready today is never tested empty, after a deleted workout, or with health data (Small, small fix, FN-A8-phone-tracker-engine-1-04)
- The treadmill and bike boxes are tested only as rules, never typed into (Small, small fix, FN-A8-phone-tracker-engine-1-05)
- The Counting sheet and its 'this workout only' choice are never opened in a test (Small, small fix, FN-A8-phone-tracker-engine-1-06)
- A muscle tip that fails to add or swap is never tested (Small, small fix, FN-A8-phone-tracker-engine-1-07)
- 'Start records fresh' is tested in the database but its words are never shown (Small, small fix, FN-A8-phone-tracker-engine-1-08)
- The exercise page's 'last time' test checks a helper the page no longer uses (Small, small fix, FN-A8-phone-tracker-services-1-1-01)
- Badges are never tested after a workout is deleted, or with help weight on an assisted lift (Small, small fix, FN-A8-phone-tracker-services-1-1-03)
- Logging a past workout while one is open is never tested (Small, small fix, FN-A8-phone-tracker-services-1-1-04)
- A broken photo in Share before and after, and the share copies left behind, are never tested (Small, small fix, FN-A8-phone-tracker-services-1-1-05)
- The lighter-weight offer for a stuck lift is never tested (Small, small fix, FN-A8-phone-tracker-services-1-1-06)
- The coach's numbers after a failed read are never tested (Small, small fix, FN-A8-phone-tracker-services-1-1-07)
- The exercise page of a timed or distance exercise is never tested (Small, small fix, FN-A8-phone-tracker-services-1-1-08)
- The Ask an AI text is never tested for leaving out warm-ups and old workouts (Small, small fix, FN-A8-phone-tracker-services-1-1-09)
- The 'Where should it go?' folder sheet is never tested empty, closed, or for a copy (Small, small fix, FN-A8-phone-tracker-services-1-2-01)
- The record pop-up, its sound and the medal are never seen in a test (Small, small fix, FN-A8-phone-tracker-services-1-2-04)
- No test checks History shows only the member's own workouts, never the demo's (Small, small fix, FN-A8-phone-tracker-services-1-2-07)
- Saving a PNG or HEIC progress photo, and photos never leaving the phone, are never tested (Small, small fix, FN-A8-phone-tracker-services-1-2-08)
- The Profile tab's three numbers and its empty state are never checked (Small, small fix, FN-A8-phone-tracker-services-2-1-04)
- Nothing checks the switched-off Ready today card stays off, and the page old links open is no longer tested (Small, small fix, FN-A8-phone-tracker-services-2-1-05)
- The 'Save as routine' card after a first workout is never seen on screen (Small, small fix, FN-A8-phone-tracker-services-2-1-09)
- The 'times your best' figure is tested only on round numbers (Small, small fix, FN-A8-phone-tracker-services-2-1-11)
- The 'Share Jaipur' sheet and the no-share-app message are never tested (Small, small fix, FN-A8-phone-tracker-services-2-1-12)
- Moving the top card up, and the pause sheet words, are never tested (Small, small fix, FN-A8-phone-tracker-services-2-2-06)
- Exercise demo clips are downloaded from the founder's personal GitHub account, fixed inside every installed copy (Small, small fix, FN-L14-phone-tracker-engine-01)
- Ten pieces of the workout tracker have no test at all, including the one that turns a gym's plans into routine folders (Small, medium fix, FN-L16-phone-tracker-services-1-01)
- Old copies of some rules are kept only because tests check them, while the app uses a different copy (Small, small fix, FN-L16-phone-tracker-services-1-02)
- The five-years-of-data speed check is never run automatically and has no time limit (Small, medium fix, FN-L7-phone-tracker-data-02)
- No automatic accessibility check ever runs on the phone app (Small, medium fix, FN-L9-phone-components-1-06)
- Switched-off "Muscles ready today" and "Quick workout" screens are still in the app with no gate (Small, small fix, FN-A3-inbox-1-18)
- The only way to bring back an old Google Drive backup is planned to be removed around February 2027 (Small, small fix, FN-B-time-phone-components-2-02)
- Find my gym also sends the member's first name, and its 'not kept' line clashes with the privacy notice (Small, small fix, FN-L4-phone-screens-1-01)
- The member app ships dozens of open-source packages but shows none of their licence notices (Small, small fix, FN-L12-phone-lib-core-02)
- My orders asks the gym server every 10 seconds even when no order is waiting (Small, small fix, FN-L8-phone-shop-1-01)
- The sample shop is listed as live but no screen can open it (Small, small fix, FN-A5-phone-shop-2-3-01)
- Home numbers are worked out after every save but no screen shows them (Small, small fix, FN-A5-phone-tracker-services-1-1-02)
- The "Backups now go to your MettleUp account" card is never shown or tapped in any test (Small, small fix, FN-A8-phone-components-1-1-04)
- No test moves a member from one branded gym to another (Small, small fix, FN-A8-phone-components-1-1-05)
- The Gym tab's bigger header is tested as different, but the journey says it must match the other tabs (Small, small fix, FN-A8-phone-components-1-1-06)
- The 'Open MettleUp to save this set' notes are never checked for their words (Small, small fix, FN-A8-phone-native-1-05)
- No phone test checks the gym's look for an owner, trainer or desk staff (Small, small fix, FN-A8-phone-onboarding-db-3-07)
- No test double-taps in the routine, workout or summary screens (Small, small fix, FN-A8-phone-screens-2-1-11)
- Tapping the gym's reply notification is never tested (Small, small fix, FN-A8-phone-shop-1-1-05)
- Joining from the check-in poster and landing back on check-in is never tested (Small, small fix, FN-A8-phone-shop-1-1-06)
- The first-routine test locks in the 'Skip for now' words that promise a return that never comes (Small, small fix, FN-A8-phone-tracker-components-1-1-01)
- The how-to sheet is never opened from a live workout, and the member's own photo or video in it is never checked (Small, small fix, FN-A8-phone-tracker-components-1-1-05)
- No test checks records stay away for a never-logged exercise or an impossible run time (Small, small fix, FN-A8-phone-tracker-components-1-1-06)
- The workout clock's m:ss form and its 0:00 before start are never checked (Small, small fix, FN-A8-phone-tracker-components-1-1-08)
- A test locks in the quiet fallback the Weight step journey forbids (Small, small fix, FN-A8-phone-tracker-components-1-2-02)
- A journey and a test still use the removed 'Same folder' choice (Small, small fix, FN-A8-phone-tracker-components-2-3-07)
- Quick workout has no screen test left (Small, small fix, FN-A8-phone-tracker-engine-2-02)
- The Exercises list's no-match words are never tested (Small, small fix, FN-A8-phone-tracker-lib-1-02)
- The exercise page's own-photo swap and its no-picture card are never seen in a test (Small, small fix, FN-A8-phone-tracker-lib-1-03)
- No test checks the In use screen keeps the member's name and body weight off it (Small, small fix, FN-A8-phone-tracker-lib-1-05)
- A member's own note loses its first line when it matches the workout name (Small, small fix, FN-A8-phone-tracker-lib-2-02)
- Picking how hard a set felt on a set with no weight is never tested (Small, small fix, FN-A8-phone-tracker-lib-2-03)
- No test checks the before and after photo copies are deleted when the sheet closes (Small, small fix, FN-A8-phone-tracker-lib-2-04)
- The first team reply to a help question can arrive with no pop-up at all (Small, small fix, FN-B-alerts-phone-components-2-a-02)
- The team-reply pop-up stays in the phone's notification list after the reply was read (Small, small fix, FN-B-alerts-phone-components-2-b-03)
- 'Time to train' stays in the notification list after the member has started or finished the workout (Small, small fix, FN-B-alerts-phone-native-a-02)
- 'Ring through Do Not Disturb' says on, but stays silent when the phone's Do Not Disturb also blocks alarms (Small, small fix, FN-B-alerts-phone-native-a-04)
- After Erase all data, a reply to an old help question still pops up on the phone (Small, small fix, FN-B-alerts-phone-onboarding-db-a-01)
- The free month's 'days left' or 'ended' pop-up can open under the 'Update MettleUp' screen and then never come back (Small, small fix, FN-B-alerts-phone-screens-1-a-01)
- A trainer's reply pop-up stays in the phone's notification list after the member has read the reply in the app (Small, small fix, FN-B-alerts-phone-screens-1-b-02)
- A gym news pop-up stays in the phone's notification list after the member has read it in Messages (Small, small fix, FN-B-alerts-phone-screens-2-b-01)
- The note that the gym was not yet told about a leave is not kept and never updates (Small, small fix, FN-B-alerts-phone-shop-1-b-01)
- A gym message can pop up with a sound in the middle of the night (Small, small fix, FN-B-alerts-phone-shop-2-a-02)
- Plan ending and birthday reminders never pop up on screen; they only sound and wait in the list (Small, small fix, FN-B-alerts-phone-shop-2-a-03)
- After switching gym messages off with no internet, pop-ups keep coming until the app is opened online (Small, small fix, FN-B-alerts-phone-shop-2-a-04)
- The end of a plank countdown never buzzes the watch, though the end of rest does (Small, small fix, FN-B-alerts-phone-tracker-components-1-a-02)
- With the app open, a rest can end with no bell, no buzz and no pop-up if the app was busy for a moment (Small, small fix, FN-B-alerts-phone-tracker-data-a-01)
- Tapping the new or changed workout plan pop-up can show the old plan for up to 10 minutes (Small, small fix, FN-B-alerts-phone-tracker-lib-a-02)
- Tapping 'Your gym saved your body measurements' or a new diet plan pop-up can show the old copy for up to 10 minutes (Small, small fix, FN-B-alerts-phone-tracker-services-1-b-02)
- The one-time repairs at app start change workout times and routines with no word to the member, and a failure leaves no trace (Small, small fix, FN-B-alerts-phone-tracker-services-1-b-03)
- When the phone cannot ask the watch to open at a workout start, nothing records it (Small, small fix, FN-B-alerts-phone-tracker-services-2-b-02)
- If the coach comes back, a slow AI company leaves it waiting for ever (Small, small fix, FN-B-run-phone-cloud-backup-ai-a-05)
- MettleUp cannot see how often members save, restore or undo a backup (Small, medium fix, FN-B-run-phone-cloud-backup-ai-a-06)
- If the coach comes back, a failed reply can vanish with no word to the member (Small, small fix, FN-B-run-phone-cloud-backup-ai-b-01)
- The Charts page says 'Couldn't load' with Try again but keeps no note of why (Small, small fix, FN-B-run-phone-components-1-a-02)
- The quiet install of a downloaded update probably never happens while the app is in the background (Small, small fix, FN-B-run-phone-components-1-a-03)
- MettleUp cannot see whether the Workout tab notices work (Small, medium fix, FN-B-run-phone-components-1-a-04)
- With 'Include photos in my backup' on, a failed photo copy shows no message (Small, small fix, FN-B-run-phone-components-2-b-01)
- A damaged saved list of help questions is quietly emptied and then overwritten, losing the MettleUp team's answers (Small, small fix, FN-B-run-phone-lib-core-b-02)
- Sharing a Hevy or Strong export to MettleUp can do nothing, with no message (Small, small fix, FN-B-run-phone-native-b-04)
- After Undo restore, Undo can come back after a restart if the old copy could not be removed (Small, small fix, FN-B-run-phone-onboarding-db-b-03)
- After removing the demo or undoing an import, records can stay wrong with no word if their rebuild fails (Small, small fix, FN-B-run-phone-onboarding-db-b-04)
- A profile change that fails to save as you leave the page is lost without a word (Small, small fix, FN-B-run-phone-screens-1-a-02)
- Merging an exercise does nothing when the app cannot read the two exercises (Small, small fix, FN-B-run-phone-screens-1-b-01)
- If progress photos cannot be read, the Body page invites you to add your first photo (Small, small fix, FN-B-run-phone-screens-1-b-03)
- If a routine's exercise details cannot be read, timed and distance exercises show as weight and reps and Swap disappears (Small, small fix, FN-B-run-phone-screens-2-b-01)
- If the 'Update your routine?' check fails at Finish, the question is simply never asked (Small, small fix, FN-B-run-phone-screens-2-b-02)
- When MettleUp's server fails, the gym message page and find-my-gym tell the member to check their internet (Small, small fix, FN-B-run-phone-shop-1-a-02)
- A moved imported workout can come back twice if one quiet read fails during a re-import (Small, small fix, FN-B-run-phone-tracker-data-a-03)
- Last time's numbers, the rest length, the carried note and record alerts can quietly go missing in a live workout (Small, small fix, FN-B-run-phone-tracker-data-b-02)
- Switching an exercise between kg each and as one can fail to save without a word (Small, small fix, FN-B-run-phone-tracker-data-b-03)
- If the plan cannot be read when a routine starts, an easy week starts as a full workout (Small, small fix, FN-B-run-phone-tracker-data-b-04)
- Back online, new gym plans and trainer measurements can take up to 10 minutes to appear (Small, small fix, FN-B-run-phone-tracker-services-1-a-01)
- When the gym server fails, the gym's workout of the day just disappears and gym plans stay old, with no word (Small, small fix, FN-B-run-phone-tracker-services-1-a-02)
- The one-time fix of imported workout times can run twice and move workouts by hours (Small, small fix, FN-B-run-phone-tracker-services-1-a-04)
- After a reinstall, a progress photo that fails to come back from the backup stays blank with no word (Small, small fix, FN-B-run-phone-tracker-services-1-b-01)
- Removing a progress photo or the profile photo can leave the picture on the phone, unnoticed (Small, small fix, FN-B-run-phone-tracker-services-2-b-02)
- What's new talks in kilos to members who chose pounds (Small, small fix, FN-B-switch-phone-components-1-a-02)
- Restoring a backup can turn 'Reminders from my gym' off while the gym's reminders stay set on the phone (Small, small fix, FN-B-switch-phone-components-2-a-01)
- Erase all data keeps the light or dark choice (Small, small fix, FN-B-switch-phone-onboarding-db-a-02)
- A foreign mobile number copied from WhatsApp or Contacts is refused in setup (Small, small fix, FN-B-switch-phone-onboarding-db-b-01)
- Join your gym promises a trainer's plan, but the test gym has no member with a trainer (Small, small fix, FN-B-switch-phone-onboarding-db-b-02)
- A hidden exercise comes back in swap choices and new plans (Small, small fix, FN-B-switch-phone-screens-1-a-04)
- A deleted workout still counts toward the gym's workout offer (Small, medium fix, FN-B-switch-phone-screens-2-a-04)
- A muscle tip can suggest adding an exercise the member hid (Small, small fix, FN-B-switch-phone-tracker-components-1-a-02)
- 'Start records fresh' does not reach the trainer's new-bests list (Small, small fix, FN-B-switch-phone-tracker-data-02)
- 'Add warm-up sets' ignores the member's machine and cable step (Small, small fix, FN-B-switch-phone-tracker-services-2-a-01)
- Reminders first suggest Monday, Wednesday and Friday even when the member set a weekly goal (Small, small fix, FN-B-switch-phone-tracker-services-2-a-03)
- The new-feature dot for phone-number backup lights for members already backed up with Google, and the page has nothing new for them (Small, small fix, FN-B-time-phone-components-2-03)
- With the watch app updated but the phone app not, the watch's minus 15 seconds button quietly does nothing (Small, small fix, FN-B-time-phone-native-03)
- A brand-new member can be told 'Home, History and Progress moved', though they never saw the old Home (Small, small fix, FN-B-time-phone-onboarding-db-01)
- A long-time member who reinstalls or changes phone gets 'Welcome to the gym' as if new (Small, small fix, FN-B-time-phone-shop-1-02)
- A long-time member with no routines is greeted as a beginner with 'Make your first routine' (Small, small fix, FN-B-time-phone-tracker-components-1-01)
- Imported workouts moved to another day before the duplicate fix still come back twice on a re-import (Small, small fix, FN-B-time-phone-tracker-data-01)
- A workout left open for weeks still says 'Workout in progress' with no date (Small, small fix, FN-B-time-phone-tracker-lib-02)
- Photos a year or more apart read as '400 days apart' or '104 weeks apart' (Small, small fix, FN-B-time-phone-tracker-lib-03)
- After the update, a long-time member's first empty workout still starts blank (Small, small fix, FN-B-time-phone-tracker-services-1-01)
- Bring back my workouts can give a wrong count (Small, small fix, FN-B-truth-phone-cloud-backup-ai-a-03)
- If the coach comes back, a made-up number in its reply reaches the member unchecked (Small, small fix, FN-B-truth-phone-cloud-backup-ai-a-05)
- A quick double tap on Save my history or Save my measurements makes the file twice and opens two share sheets (Small, small fix, FN-B-truth-phone-components-2-a-03)
- The coach's one-line summary compares a half-finished week with a full one, and calls three workouts 'three weeks' (Small, small fix, FN-B-truth-phone-lib-core-a-02)
- The strength score picks its key lifts by name, so an upright row or a bench-supported row can stand in for the main lifts (Small, small fix, FN-B-truth-phone-lib-core-a-03)
- A new member, or one back after weeks off, is told their volume is far above their usual week (Small, small fix, FN-B-truth-phone-lib-core-b-01)
- The coach's 'best 1-rep max' can be a lighter set that the records list never counts (Small, small fix, FN-B-truth-phone-lib-core-b-02)
- In the gap before a renewal starts, the phone says the gym gives every feature free while the membership card says the plan has not started (Small, small fix, FN-B-truth-phone-lib-core-b-03)
- The 'Gym right now' widget says 'Busy' where the Gym tab says 'Busier than usual' (Small, small fix, FN-B-truth-phone-native-a-02)
- A weight logged in pounds can show as a long, odd kilo number in the set box (Small, small fix, FN-B-truth-phone-tracker-components-2-a-01)
- After a long break the finish screen calls a planned lighter workout just 'lighter' and may blame sleep (Small, small fix, FN-B-truth-phone-tracker-components-2-b-02)
- If the counting rule cannot be read, History and the coach quietly show a different kg lifted (Small, small fix, FN-B-truth-phone-tracker-data-b-02)
- An exercise's 'Last' day can point at a workout its History tab does not list (Small, small fix, FN-B-truth-phone-tracker-data-b-03)
- A month with a planned easy week shows red drops in sets and kg lifted with no reason given (Small, small fix, FN-B-truth-phone-tracker-engine-b-04)
- 'Kg lifted' on a share picture is a different number from 'Kg lifted' in the app for the same workout or month (Small, small fix, FN-B-truth-phone-tracker-lib-b-02)
- When the trainer renames a workout plan, the member's phone keeps the old name (Small, small fix, FN-B-truth-phone-tracker-services-1-a-01)
- The Ask an AI text says a new member trains under once a week (Small, small fix, FN-B-truth-phone-tracker-services-1-b-02)
- A one-time records repair can skip its second half for good if the app closes mid-way (Small, small fix, FN-B-truth-phone-tracker-services-2-a-02)
- If the coach comes back, its messages use technical words and call the offline coach by a name the settings page does not use (Small, small fix, FN-B-words-phone-cloud-backup-ai-03)
- The old ForgeAI logo is still one of the app's shared pieces (Small, small fix, FN-B-words-phone-components-2-04)
- Open Profile on the straight-in note opens the Profile tab, not the place to change goal and experience (Small, small fix, FN-B-words-phone-onboarding-db-03)
- Build a plan shows each planned exercise on one line, so long names are cut off on a narrow phone (Small, small fix, FN-B-words-phone-screens-2-01)
- One group of routines is called a plan, a program, a folder and your routines on the same few screens (Small, small fix, FN-B-words-phone-screens-2-03)
- Message your gym calls the same people 'Gym admin' on the button and 'front desk' in the line under it (Small, small fix, FN-B-words-phone-shop-2-01)
- 'Ask my trainer for help' says your trainer will get in touch, but the trainer is never told (Small, small fix, FN-B-words-phone-shop-2-03)
- A failed read during 'try a harder or easier version' says the exercise is not in your library (Small, small fix, FN-B-words-phone-tracker-components-1-02)
- Workout photos are called private and 'stay on this phone', but every backup file carries them (Small, small fix, FN-B-words-phone-tracker-components-2-03)
- A shared routine file still carries the old app name inside it (Small, small fix, FN-B-words-phone-tracker-engine-06)
- 'Saved as a routine' can say it went to 'My routines' when it went to 'Other routines' (Small, small fix, FN-B-words-phone-tracker-lib-01)
- "Your phone and watch buzz when rest is over" is shown to members with no watch (Small, small fix, FN-B-words-phone-tracker-services-2-02)
- "Nothing was saved" can be cut off in the note after Done from the lock screen (Small, small fix, FN-B-words-phone-tracker-services-2-03)
- The Credits page leaves out the app's icon set and the free code it is built on (Small, small fix, FN-L12-phone-components-2-02)
- The record of where exercise pictures come from leaves out the main picture source, and the Credits page undersells what was changed (Small, small fix, FN-L12-phone-lib-core-03)
- The Play app asks for "display over other apps" though nothing in it uses that (Small, small fix, FN-L12-phone-native-01)
- Nobody wrote down where the main rest-over chime came from (Small, small fix, FN-L12-phone-native-03)
- On an iPhone the welcome would offer Continue with Google but no Sign in with Apple (Small, medium fix, FN-L12-phone-onboarding-db-01)
- Google Play asks for the app's top and bottom bar colours to be updated for Android 15, and the app has not done it (Small, medium fix, FN-L12-phone-screens-1-02)
- The coach's model names are fixed in the app and will stop working when the AI companies retire them (Small, small fix, FN-L14-phone-cloud-backup-ai-04)
- The crash screen and the Couldn't save line give no way to ask for help (Small, small fix, FN-L14-phone-components-1-01)
- A MettleUp Plus subscriber is told they can cancel in Google Play but the app gives no way to get there (Small, small fix, FN-L14-phone-native-04)
- The member help says renewals are paid at the desk, while the app can show Pay your gym (Small, small fix, FN-L14-phone-shop-2-02)
- Backup code uses its own date rules, one of them on world time instead of India time (Small, small fix, FN-L16-phone-cloud-backup-ai-03)
- Some Google Drive and gym-sync failures vanish without any trace (Small, small fix, FN-L16-phone-cloud-backup-ai-04)
- Many phone notice and Charts tests only look for words in the code (Small, medium fix, FN-L16-phone-components-1-03)
- An unused choice-chips piece is left in the Stats parts (Small, small fix, FN-L16-phone-components-2-04)
- Settings and backup tests mostly look for words in the code, and one passes while the photo backup switch cannot be reached (Small, medium fix, FN-L16-phone-components-2-05)
- The recovery score is worked out twice with two different muscle rules, and its scoring has no test of its own (Small, small fix, FN-L16-phone-lib-core-02)
- Sets logged with the app closed are quietly thrown away if their saved list cannot be read (Small, small fix, FN-L16-phone-native-03)
- The demo's personal records follow an older rule than a real workout's (Small, small fix, FN-L16-phone-onboarding-db-02)
- Two of the one-time record repairs fail at start-up without leaving any trace (Small, small fix, FN-L16-phone-onboarding-db-03)
- On the Workout tab, a failed plan read hides the plan's week line and easy-week offer without a word (Small, small fix, FN-L16-phone-screens-1-03)
- Pictures added on Add measures can stay on the wrong day without a word (Small, small fix, FN-L16-phone-screens-1-04)
- Switched-off sample shop and staff sign-in stay in the gym tab code, with unused leftovers (Small, small fix, FN-L16-phone-shop-1-02)
- The time words (like 5:42 pm) are written out three separate times in the gym tab (Small, small fix, FN-L16-phone-shop-1-03)
- A failed refresh of the gym messages bell leaves no trace (Small, small fix, FN-L16-phone-shop-1-04)
- Several workout-tab failures tell the member to try again but leave no trace of why (Small, small fix, FN-L16-phone-tracker-components-2-01)
- Three separate copies of the clock format for workout and rest times (Small, small fix, FN-L16-phone-tracker-components-2-03)
- Renaming a routine can quietly stop its imported workouts counting as its own (Small, small fix, FN-L16-phone-tracker-data-03)
- Two different rules decide whether two workout names are the same (Small, medium fix, FN-L16-phone-tracker-data-04)
- An old Undo for body entries is unused by the app but is the one the delete-Undo test checks (Small, small fix, FN-L16-phone-tracker-data-06)
- No test checks exercise lists refresh after a new exercise is made, or the Progress lift pick (Small, small fix, FN-L16-phone-tracker-data-07)
- A damaged saved focus block or set plan is thrown away without a trace (Small, small fix, FN-L16-phone-tracker-engine-04)
- No test ever shows the 'Try a lighter weight?' card appearing (Small, small fix, FN-L16-phone-tracker-lib-03)
- 'Save as routine' can fail with a message but leaves no record of why (Small, small fix, FN-L16-phone-tracker-lib-04)
- Several reads quietly fall back to a default with no log, so wrong numbers would have no trace (Small, small fix, FN-L16-phone-tracker-services-1-04)
- Four phone parts behind live screens have no test at all (Small, small fix, FN-L16-phone-tracker-services-2-04)
- A member's help message can step outside the box the AI is told to treat as only a question (Small, small fix, FN-L19-phone-lib-core-03)
- Once MettleUp Plus is on, a gym member whose plan ended can keep the paid extras by setting the phone's date back (Small, small fix, FN-L19-phone-shop-2-01)
- Once MettleUp Plus limits are on, a free member can still see a 12-month or all-time exercise chart (Small, small fix, FN-L19-phone-tracker-components-1-01)
- Exercise and routine names from someone else would go into the AI coach note as plain facts (Small, small fix, FN-L19-phone-tracker-components-2-02)
- A shared routine file's exercise names go straight into the 'Ask your own AI' text (Small, small fix, FN-L19-phone-tracker-engine-02)
- Exercise names from a shared routine file or a gym plan go into the AI text as plain facts, so a crafted name can steer the AI (Small, small fix, FN-L19-phone-tracker-services-1-01)
- The MettleUp sign-in is kept in plain app storage that Android copies into the phone's Google backup and onto a new phone (Small, small fix, FN-L3-phone-cloud-backup-ai-01)
- The workout import reads files with an old spreadsheet library that has two known high-rated flaws (Small, small fix, FN-L3-phone-screens-1-01)
- No test proves another gym's member cannot send a workout report, add workout dates, or leave a workout offer for this gym (Small, small fix, FN-L3-phone-shop-2-01)
- The phone app's screen-navigation library is flagged high by the dependency scan (Small, medium fix, FN-L3-phone-tracker-components-1-02)
- The library the phone uses to hand a picture or file to other apps is flagged by the dependency scan (Small, medium fix, FN-L3-phone-tracker-components-2-01)
- Save my history writes workout and exercise names into the spreadsheet file exactly as typed, so a name starting with = runs as a formula (Small, small fix, FN-L3-phone-tracker-services-1-01)
- If the hidden AI coach is switched back on, members' spoken messages go to the phone's speech service and their chat goes to an AI, and the privacy notice names neither (Small, small fix, FN-L4-phone-components-1-01)
- Loading the demo says the member's photos are deleted, but their own exercise photos and videos stay on the phone (Small, small fix, FN-L4-phone-components-2-04)
- Turning photo backup off deletes the copies on the phone, but the copy already in Google's backup stays until Android backs up again (Small, small fix, FN-L4-phone-components-2-05)
- Erase all data keeps the free month's start day and the first-run date, though the notice says everything on the phone is removed (Small, small fix, FN-L4-phone-onboarding-db-04)
- The gym news notification group also carries trainer replies, but its description says only news (Small, small fix, FN-L4-phone-shop-2-04)
- The gym messages switch says a pop-up can take a few minutes, but without instant push it takes 15 minutes or more (Small, small fix, FN-L4-phone-shop-2-05)
- 'Deleted for good' is not quite true for a removed workout photo (Small, small fix, FN-L4-phone-tracker-components-2-01)
- Erase all data leaves four workout settings behind on the phone (Small, small fix, FN-L4-phone-tracker-data-01)
- When the connection drops during a Plus payment, the app says nothing was charged and does not check again (Small, small fix, FN-L5-phone-native-01)
- A waiting Plus payment that Google approves while the app is closed is refunded and taken back if the app is not opened within 3 days (Small, medium fix, FN-L5-phone-native-02)
- Phone number sign-in tells trainers they get every MettleUp feature free, but the Plus page says only owners and desk staff do (Small, small fix, FN-L5-phone-onboarding-db-02)
- With no internet, Pay for this order says the gym has not set up online payment (Small, small fix, FN-L5-phone-shop-1-05)
- Renewal and plan-ending words always say pay at the desk, also at gyms that take payments in the member app (Small, small fix, FN-L5-phone-shop-2-03)
- When a gym membership ends, the gym's workout plan just says 'No longer sent', with no word on why or that renewing brings it back (Small, small fix, FN-L5-phone-tracker-components-2-01)
- When MettleUp Plus starts or stops in the middle of a workout, the watch keeps its old screen until the next set (Small, small fix, FN-L5-phone-tracker-services-2-01)
- After an app update, the first opening waits for one-time repair jobs before showing anything (Small, small fix, FN-L7-phone-onboarding-db-01)
- Every app opening re-sends up to a year of workouts to the gym's trainers, though the rule says once every 6 hours (Small, small fix, FN-L7-phone-shop-2-01)
- Choosing a before or after photo loads every progress photo at once (Small, small fix, FN-L7-phone-tracker-components-1-01)
- The Exercises list goes through every set ever logged each time it opens, to show when each exercise was last done (Small, small fix, FN-L7-phone-tracker-data-01)
- Routines and their exercises have no index for which folder or routine they belong to (Small, small fix, FN-L7-phone-tracker-data-03)
- After every workout, the new-badge line re-reads the member's whole lifting history (Small, small fix, FN-L7-phone-tracker-services-1-01)
- No early warning before a member's saved copy is full (Small, small fix, FN-L8-phone-cloud-backup-ai-03)
- Downloaded exercise clips are never cleared, so the phone's space use grows with every exercise opened (Small, small fix, FN-L8-phone-tracker-engine-01)
- In the coach chat a screen reader cannot tell who said what, and new replies are not read out (Small, small fix, FN-L9-phone-components-1-02)
- A screen reader is not told when a Balance check choice fails to save (Small, small fix, FN-L9-phone-components-1-05)
- Got it, Open Profile and Skip look like plain words, not buttons (Small, small fix, FN-L9-phone-onboarding-db-03)
- The note about a wrong link on the Workout tab can only be closed by tapping it, with nothing showing that (Small, small fix, FN-L9-phone-screens-1-02)
- The Got it button on the Profile tab note looks like plain grey text (Small, small fix, FN-L9-phone-screens-1-04)
- The 'Your plan ends on Friday' card on the Workout tab opens the Gym tab, but nothing shows it can be tapped (Small, small fix, FN-L9-phone-shop-1-03)
- The locked suggested-weight line can be tapped but looks like a grey note (Small, small fix, FN-L9-phone-tracker-components-1-04)
- The small "i" on a set that explains its target is hard to hit (Small, small fix, FN-L9-phone-tracker-components-2-01)
- A screen reader skips the explaining line under some workout settings (Small, small fix, FN-L9-phone-tracker-components-2-02)
- "Not now" on the watch install card looks like plain grey words (Small, small fix, FN-L9-phone-tracker-components-2-04)
- The "older names" fold in the routine import does not say if it is open (Small, small fix, FN-L9-phone-tracker-components-2-05)
- The gym's server records a trainer reply as seen before the member has opened it (Small, small fix, FN-B-alerts-phone-screens-1-b-01)
- A member's Tell my gym lead reaches MettleUp with only a gym name and city (Small, small fix, FN-L14-phone-shop-1-02)
- The exercise search speed test can fail on a slow cloud machine (Small, small fix, FN-L16-phone-tracker-services-1-05)
- Two past-workout tests quietly check nothing when run near midnight or a clock change (Small, small fix, FN-L16-phone-tracker-services-1-06)
- A member can pass the gym's own workout plans to anyone outside the gym (Small, small fix, FN-L19-phone-tracker-components-2-01)
- Workout tests wait a fixed few milliseconds of real time for a save to land (Small, small fix, FN-L16-phone-tracker-data-08)
- A Target-line test fails if the build machine is slow, not if the app is wrong (Small, small fix, FN-L16-phone-tracker-engine-06)
- The 'Recommend MettleUp to my gym' card is never checked to hide inside a gym or come back after leaving (Small, small fix, FN-A8-phone-shop-2-3-04)
- The profile history chart's tests check an old bar chart the screen no longer draws (Small, small fix, FN-L16-phone-tracker-engine-01)
- The retired 'swap an exercise' part of the Balance check is still in the app and still tested (Small, small fix, FN-L16-phone-tracker-engine-02)
- The weigh-in list's 'page at a time' rule is used only by its own test (Small, small fix, FN-L16-phone-tracker-engine-03)
- The same small sums are written out again in several places (Small, small fix, FN-L16-phone-tracker-engine-05)
- The "Muscles ready today" card is listed as live but nothing in the app shows it (Small, small fix, FN-A5-phone-tracker-components-1-4-01)
- The map says a member can hide their own exercise with workouts, but the app and its test refuse that (Small, small fix, FN-A8-phone-screens-1-1-03)
- The Any exercise picker cannot be reached, so its four journeys can never be tested (Small, small fix, FN-A8-phone-screens-2-1-01)
- Switched-off coach, old gym link and Drive upload code stays in the app with no tests (Small, medium fix, FN-L16-phone-cloud-backup-ai-05)
- About 1,400 lines of old Charts page parts are kept but shown nowhere (Small, small fix, FN-L16-phone-components-1-01)
- Two tests promise a behaviour but only look for words in the code (Small, small fix, FN-L16-phone-lib-core-04)
- A save-queue test relies on a real 0.4-second wait for a 0.3-second save (Small, small fix, FN-L16-phone-onboarding-db-04)
- The tests' copy of the app's start-up leaves out six of its steps (Small, small fix, FN-L16-phone-screens-1-01)
- The only tests of the Workout tab, import, exercise page, Body and photos pages look for words in the code (Small, medium fix, FN-L16-phone-screens-1-02)
- The list of old addresses and where they go is kept twice, and the test does not compare the two (Small, small fix, FN-L16-phone-screens-1-05)
- The switched-off nutrition page is kept in the app with no test (Small, small fix, FN-L16-phone-screens-1-06)
- The switched-off Muscles ready today and Quick workout pages are still kept in the app (Small, small fix, FN-L16-phone-screens-2-04)
- A leave-the-gym test fails if the test machine is slow (Small, small fix, FN-L16-phone-shop-1-06)
- Some gym tests wait a fixed 20 ms or read today's real date, so they can fail on a slow runner or at midnight (Small, small fix, FN-L16-phone-shop-2-03)
- The month calendar is written three separate times, on two sets of calendar maths (Small, medium fix, FN-L16-phone-tracker-components-1-03)
- Copies of locked shared parts are kept in step only by a few text checks, and the originals are no longer used (Small, small fix, FN-L16-phone-tracker-components-1-04)
- Some tests of the workout parts wait on real time and can fail on a slow build machine (Small, small fix, FN-L16-phone-tracker-components-2-05)
- The name of the saved in-progress workout is typed out separately in three places (Small, small fix, FN-L16-phone-tracker-data-05)
- Tests keep passing on helper pieces that no screen uses any more (Small, small fix, FN-L16-phone-tracker-lib-01)
- Three leftover pieces nothing uses: the step-back reason line, a progress mode list and a licence link (Small, small fix, FN-L16-phone-tracker-lib-02)
- An unused workout counter sits next to the one the app really uses (Small, small fix, FN-L16-phone-tracker-services-2-03)
- When MettleUp Plus limits go live, restoring a backup gets around the 7 own exercises limit (Small, small fix, FN-L19-phone-cloud-backup-ai-03)
- Once MettleUp Plus is on, a gym owner can give friends every paid feature free by listing them as staff (Small, small fix, FN-L19-phone-onboarding-db-01)
- The free month starts again after the app is removed and installed again (Small, medium fix, FN-L5-phone-screens-1-03)
- A yearly Plus buyer on a new phone is told they pay every month (Small, small fix, FN-L5-phone-screens-1-04)
- A member who bought the yearly plan is told they pay every month after moving to a new phone (Small, small fix, FN-L5-phone-screens-2-04)
- Each member who leaves makes the database read the busy-machines records of every gym (Small, small fix, FN-L7-phone-shop-2-02)
- Each visit to the Gym tab reloads the shop list, the orders and the gym with no pause (Small, small fix, FN-L8-phone-shop-1-02)

### Watch app (54)

- What's new names a watch text-size fix that has no row of its own in the feature list (Medium, small fix, FN-A3-whats-new-phone-04)
- With 'Open MettleUp on my watch' turned off, the watch still opens or pops up 'Workout started' with a buzz (Medium, small fix, FN-B-alerts-watch-app-a-01)
- With the watch's notifications off, the rest card, the 'Workout started' pop-up and the workout notice silently vanish (Medium, medium fix, FN-B-alerts-watch-app-a-02)
- The watch keeps no record of its own end-of-rest buzzes or workout-start pop-ups (Medium, small fix, FN-B-alerts-watch-app-b-01)
- When the watch app fails or crashes on a member's wrist, MettleUp never hears of it (Medium, medium fix, FN-L14-watch-app-01)
- Most watch screens ignore the member's larger text setting (Medium, medium fix, FN-L9-watch-app-03)
- The feature list calls 20 watch features live, but only testers can install the watch app (Medium, small fix, FN-H5-watch-app-03)
- The watch lets Done go on a set with no weight, then says 'Not saved' with a phone-off picture (Medium, small fix, FN-B-truth-watch-app-a-03)
- Getting a running rest back after a watch restart or app update is never tested (Medium, medium fix, FN-A8-watch-app-1-01)
- How the watch takes in what the phone sends is never tested (Medium, medium fix, FN-A8-watch-app-1-02)
- The Done, +15 s and Skip buttons on the watch's rest card are never tested (Medium, small fix, FN-A8-watch-app-1-03)
- The watch's own rest notifications and buzz pattern are never tested (Medium, medium fix, FN-A8-watch-app-1-04)
- The "one line when the numbers match" test checks a helper no watch screen uses (Medium, small fix, FN-A8-watch-app-2-01)
- The -15, +15 and Skip buttons on the watch rest timer have no test (Medium, small fix, FN-A8-watch-app-2-02)
- Only the bright countdown is size-checked at the largest text; weight, reps, the dim countdown and the smallest text are not (Medium, small fix, FN-A8-watch-app-2-03)
- The watch's workout notice is never checked: its words, that it is silent, that only one shows (Medium, small fix, FN-A8-watch-app-2-04)
- Nothing tests that the watch asks for permissions only once; a test even pins the ask over a running rest (Medium, small fix, FN-A8-watch-app-2-05)
- The "Phone not connected" screen's wait for two empty checks is never tested (Medium, small fix, FN-A8-watch-app-2-06)
- The automatic pictures of every watch screen are never compared with anything, so a blank or wrong screen still passes (Medium, medium fix, FN-L16-watch-app-01)
- A set can be saved that was never done, when the phone ticks the set while the watch asks how hard it was (Medium, small fix, FN-B-truth-watch-app-a-01)
- The phone's What's new tells every member about the watch app, but the watch app is only on Google Play's test tracks (Medium, small fix, FN-H5-watch-app-01)
- Member website says turning the watch dial changes the weight in 2.5 kg steps; the first turn changes the reps (Medium, small fix, FN-A3-website-2-05)
- Heart rate keeps the last number after the watch leaves the wrist (Medium, small fix, FN-A5-watch-app-1-01)
- The check for full-size watch numbers cannot catch the bug it was written for (Medium, small fix, FN-A5-watch-small-1-01)
- The end-of-rest buzz can come minutes late when MettleUp is not on the watch screen (Medium, small fix, FN-B-run-watch-app-a-01)
- A rest started by logging a set on the watch ignores 'Ring through Do Not Disturb' (Medium, small fix, FN-B-switch-watch-app-01)
- Once the watch has seen MettleUp on the phone, it never again says the phone app is missing (Medium, small fix, FN-B-switch-watch-app-02)
- After the phone's clock is moved back, the watch stops following the phone's workouts (Medium, small fix, FN-B-time-watch-app-01)
- The watch's Done button goes grey with no word why (Medium, small fix, FN-B-words-watch-app-03)
- A screen reader cannot name the watch's big Done and Go buttons, and a greyed Done is not read at all (Medium, small fix, FN-L9-watch-app-01)
- Several watch buttons are much smaller than a finger (Medium, small fix, FN-L9-watch-app-02)
- After 'Not now', the watch never offers heart rate or rest alerts again (Medium, medium fix, FN-L9-watch-app-05)
- HQ's view of a member's watch screen log is never tested (Medium, small fix, FN-A8-watch-app-1-06)
- Closed watch testers still get the old watch app that hides itself from the phone; the fixed one waits for Publish (Medium, small fix, FN-H5-watch-app-02)
- The watch's 'Rest is over' card stays up after the set is logged when no new rest starts (Small, small fix, FN-B-alerts-watch-app-a-03)
- The watch app ships an old helper library with a known high-rated security flaw (Small, small fix, FN-L3-watch-app-01)
- The watch's memory of its copy settings is never tested (Small, small fix, FN-A8-watch-app-1-05)
- The heart sensor starting and stopping on the watch is never tested (Small, small fix, FN-A8-watch-app-1-07)
- When the watch writes its version for the phone is never tested (Small, small fix, FN-A8-watch-app-2-07)
- No test taps the watch screen: the waking tap, the no-workout screen, the dim Open on phone button (Small, small fix, FN-A8-watch-app-2-08)
- A rest that ends seconds before a watch restart is left hanging (Small, small fix, FN-A5-watch-app-1-02)
- A workout started again within 10 minutes does not open the watch or pop up its card (Small, small fix, FN-B-alerts-watch-app-b-03)
- For a member who uses pounds, a set logged on the watch saves a slightly different weight than the same set ticked on the phone (Small, small fix, FN-B-truth-watch-app-a-02)
- The watch's effort choices leave out 9.5, which the phone offers (Small, small fix, FN-B-truth-watch-app-a-04)
- The rest countdown on the watch's card and watch face can read one second less than the app screen (Small, small fix, FN-B-truth-watch-app-b-01)
- A long exercise name is still cut off with '...' on the watch's rest timer, although What's new says long names fit (Small, small fix, FN-B-words-watch-app-01)
- The watch's tip says to tap a number before turning the dial, but the dial already works without a tap (Small, small fix, FN-B-words-watch-app-02)
- The feature list says the watch's 'Rest is over' card has a 'Complete set' button; it was removed (Small, small fix, FN-B-words-watch-app-04)
- The watch rest card's three buttons all carry the same MettleUp logo, and say '+15 s' where the screen says '+15' (Small, small fix, FN-B-words-watch-app-05)
- The watch keeps two separate sets of rest screens, so a fix to one can miss the other (Small, medium fix, FN-L16-watch-app-02)
- Erasing your data or deleting your account leaves the watch's copy behind (Small, small fix, FN-L4-watch-app-01)
- The dimmed watch keeps its processor awake for every whole rest (Small, small fix, FN-L7-watch-app-01)
- The bright rest screen redraws 4 to 5 times a second although its numbers change once a second (Small, small fix, FN-L7-watch-app-02)
- 'Not now' on the watch's first screens looks like plain words (Small, small fix, FN-L9-watch-app-04)

### Owner and desk panel (788)

- Staff help names a question and choices that are not on the Add a person form (Medium, small fix, FN-A3-help-04)
- Old update note still says the sign-in page has two tabs (Medium, small fix, FN-A3-whats-new-panel-04)
- A message set for later says 'Sent' at once, and its WhatsApp half is handed out straight away (Medium, small fix, FN-B-alerts-panel-assistant-b-03)
- A member who brings two friends with the same name gets the thank-you days only once (Medium, small fix, FN-B-run-panel-logic-2-a-01)
- On a new phone or laptop, a long-running gym is shown the Get started list again, with steps it finished long ago undone (Medium, medium fix, FN-B-time-panel-logic-1-02)
- Automatic reminders say members with the app get them, but many app members silently get none (Medium, medium fix, FN-B-alerts-panel-logic-1-a-01)
- Bringing back an archived member from Add member throws away everything the desk just typed (Medium, small fix, FN-B-truth-panel-forms-a-01)
- The member card says 'show it at the desk', but the desk cannot scan it or find the member by its number (Medium, small fix, FN-B-words-panel-ui-shell-02)
- Each door machine calls in every 30 seconds, and nothing watches what that adds up to (Medium, medium fix, FN-L8-panel-pay-machines-01)
- The "members by batch" answer shows the number of batches as its big figure under a heading about members (Medium, small fix, FN-A5-panel-assistant-1-03)
- The credits pill on Today's AI card tells screen readers it opens AI credits, but it opens the assistant (Medium, small fix, FN-A5-panel-assistant-2-01)
- A staff member's job name can be typed only while adding the person and never changed after (Medium, small fix, FN-A5-panel-auth-data-2-02)
- Front desk demo: the Member messages badge says 3 but only 2 messages wait (Medium, small fix, FN-A5-panel-demo-1-01)
- The desk sees an empty "Pay online" box when the gym has no UPI ID (Medium, small fix, FN-A5-panel-forms-1-02)
- In the quick buttons sheet the up and down arrows move nothing the owner can see in the list (Medium, small fix, FN-A5-panel-logic-2-3-03)
- A workout offer with a 1-day reward says "Give 1 days" and "1 days added" (Medium, small fix, FN-A5-panel-logic-2-4-01)
- Gym timings says 'Right now members see' for times that are not saved yet (Medium, small fix, FN-A5-panel-screens-1-3-01)
- The desk can never see whether the MettleUp Plus lock is on (Medium, small fix, FN-A5-panel-screens-2-2-01)
- Empty Shop page points members to a tab that no longer exists (Medium, small fix, FN-A5-panel-shop-1-01)
- Quick buttons the owner picks stay on his own device (Medium, medium fix, FN-A5-panel-ui-shell-3-01)
- Nothing checks what staff see of the owner's help questions and support access on a shared desk browser (Medium, small fix, FN-A8-panel-brand-shell-2-08)
- Today's Birthdays and Came in today tiles are never checked on screen (Medium, small fix, FN-A8-panel-logic-1-4-03)
- The Visits register is never used in a test signed in as the front desk (Medium, small fix, FN-A8-panel-screens-1-1-01)
- The Members list chips, the 'Has dues' list and its 'WhatsApp all, one by one' sheet are never tested on screen (Medium, medium fix, FN-A8-panel-screens-2-1-02)
- A past time for a timed message, sending when nobody has the app, and a failed send are never tested (Medium, small fix, FN-A8-panel-screens-2-1-04)
- The Shop today card's loading, shop-off and live update are never tested on screen (Medium, small fix, FN-A8-panel-shop-2-02)
- Checking in a member from another branch is never tested on screen as the front desk (Medium, small fix, FN-A8-panel-shop-2-08)
- All branches is never tested when one branch fails, after a new payment, or from More on a phone (Medium, small fix, FN-A8-panel-shop-2-10)
- An AI idea stays after the owner has acted on it, inviting the same reminder twice (Medium, medium fix, FN-B-alerts-panel-assistant-b-02)
- The owner cannot see which phones or computers get gym alerts with the admin app closed (Medium, medium fix, FN-B-alerts-panel-logic-2-a-02)
- Turning on 'Take payments in the member app' never says which members will see the Pay now button (Medium, medium fix, FN-B-alerts-panel-pay-machines-a-01)
- Today shows two different birthday counts, and the tile's 'Send a wish' includes members the automatic wish already reaches (Medium, small fix, FN-B-alerts-panel-screens-2-b-01)
- Messaging a member from Today's 'Talk to these members' leaves them on the list with no sign anyone did (Medium, small fix, FN-B-alerts-panel-screens-2-b-03)
- On a shared front-desk computer, gym alerts follow only the last person who turned them on, and go silent when that person signs out (Medium, medium fix, FN-B-alerts-panel-shop-a-01)
- Once the Pro lock is on, the AI assistant and the Get started list still send Starter gyms to Pro features (Medium, small fix, FN-B-switch-panel-pay-machines-01)
- A workout or kg challenge can be started when no member uses the app, and nobody can win it (Medium, small fix, FN-B-switch-panel-screens-1-b-01)
- Workout of the day says 'Members see it now' even when no member uses the app (Medium, small fix, FN-B-switch-panel-screens-2-b-01)
- Checking a workout code ignores the gym's own offer: app check-ins count, and it offers 3 days whatever the reward (Medium, small fix, FN-B-switch-panel-ui-shell-01)
- History and the credits list show what the AI first suggested, not what the owner changed and saved (Medium, small fix, FN-B-truth-panel-assistant-a-03)
- Tapping Shorter, More polite or Add Hindi throws away the owner's own edits to a message (Medium, small fix, FN-B-truth-panel-assistant-a-04)
- Cancelling a plan or a receipt rewrites the whole Fees due line, so a drop or rise never shows and no reason is given (Medium, medium fix, FN-B-truth-panel-logic-2-b-02)
- All branches and Today show different numbers for the same branch under the same words (Medium, small fix, FN-B-truth-panel-pay-machines-a-01)
- All branches lists people whose plan ended longest ago first, and cuts the newest off (Medium, small fix, FN-B-truth-panel-pay-machines-b-01)
- The 'find and join your gym online' set-up step says joiners pay at the desk and that paying online needs Razorpay or Cashfree, while live online joining already takes payment to the gym's UPI ID (Medium, small fix, FN-B-truth-panel-screens-2-a-01)
- 'Plan ended recently' means the last 45 days on Today but the last 30 days in Messages & offers and the assistant (Medium, small fix, FN-B-truth-panel-screens-2-b-01)
- In Hinglish, the numbers to confirm and app request cards, Member messages, alerts settings, desk photo and workout offer stay in English (Medium, medium fix, FN-B-words-panel-logic-2-04)
- A leftover test message from MettleUp sits in every gym's notification bell (Medium, small fix, FN-H5-panel-logic-1-01)
- An owner with no credits who asks MettleUp for more is sent back to the AI Assistant (Medium, small fix, FN-L14-panel-assistant-01)
- The week summary's main button promises to send it to the owner's WhatsApp, but nothing can (Medium, small fix, FN-L14-panel-assistant-02)
- When the gym is paused or its plan runs out, desk staff are told to download the data, which only an owner can do (Medium, small fix, FN-L14-panel-auth-data-01)
- A reply from the MettleUp team reaches only the browser the question was sent from (Medium, medium fix, FN-L14-panel-logic-1-01)
- Several screens say 'Message MettleUp' but give no way to do it (Medium, small fix, FN-L14-panel-logic-2-01)
- Settings says the gym is 'saved in this browser only' and 'a demo gym is never put online', while its shop part sits on our server (Medium, small fix, FN-L4-panel-screens-2-02)
- The admin app never shows what a pack of AI credits costs, so an owner asks MettleUp for credits without knowing the price (Medium, small fix, FN-L5-panel-assistant-01)
- Adding a GST number quietly turns every plan price into a price that already includes GST (Medium, small fix, FN-L5-panel-screens-2-04)
- Every time the panel opens, it downloads the gym's whole history again in one piece (Medium, medium fix, FN-L7-panel-auth-data-01)
- All branches downloads every other branch's whole history each time it is opened (Medium, medium fix, FN-L7-panel-pay-machines-01)
- The Shop page shows only the newest 300 orders, so its Collected, Cancelled and All counts stop growing (Medium, medium fix, FN-L7-panel-shop-01)
- On a computer, the AI side panel cannot be reached or closed well with the keyboard (Medium, small fix, FN-L9-panel-assistant-01)
- When today's questions are used up, the only reason shown is faint grey text inside a locked box (Medium, small fix, FN-L9-panel-assistant-04)
- On Staff & sign-in, a screen reader hears the same button names on every person, with no name (Medium, small fix, FN-L9-panel-auth-data-01)
- Forgot your PIN, Other ways back in and Sign out look like grey words, not buttons (Medium, small fix, FN-L9-panel-auth-data-02)
- When a payment link cannot be made, the message says show the UPI QR or try again, but neither button is there (Medium, small fix, FN-L9-panel-pay-machines-01)
- On Trainers, the keyboard ring vanishes on the booking grid, member picks, bookings and working days (Medium, small fix, FN-L9-panel-screens-2-01)
- On Today, a screen reader hears 'Message' on every person row with no name (Medium, small fix, FN-L9-panel-screens-2-03)
- On Today, a person's name opens their page but looks like plain text (Medium, small fix, FN-L9-panel-screens-2-04)
- A screen reader hears only 'Edit' or 'Open' on product and app member cards, not the price, stock or orders (Medium, small fix, FN-L9-panel-shop-01)
- On a workout offer, member names open the member's page but look like plain text (Medium, small fix, FN-L9-panel-shop-03)
- The number tiles on Today open a list, but look like plain number cards (Medium, small fix, FN-L9-panel-ui-shell-01)
- The WhatsApp receipt and the printed receipt can show different amounts still due (Medium, small fix, FN-L5-panel-screens-2-03)
- Taking back or cancelling a sent message is never tested (Medium, small fix, FN-A8-panel-brand-shell-3-05)
- Two privacy promises on the panel are never checked by any test (Medium, small fix, FN-A8-panel-demo-1-05)
- Sending a message to just one group in the app is never seen on screen (Medium, medium fix, FN-A8-panel-logic-1-1-05)
- No test checks that a trainer never gets a feedback line (Medium, small fix, FN-A8-panel-logic-1-1-09)
- The member WhatsApp sheet never checks the number it opens, a short number, or the desk (Medium, small fix, FN-A8-panel-logic-2-4-03)
- Archiving offline, a failed archive and reminders after archiving are never tested (Medium, small fix, FN-A8-panel-screens-1-3-07)
- No server test checks hiding a product, or saving over a member's newer order (Medium, small fix, FN-A8-panel-shop-1-05)
- What the desk and trainers must not see on member, trainer and workout pages is never tested (Medium, medium fix, FN-A8-panel-ui-shell-4-06)
- An idea tapped on Today is dropped with no word when the assistant is busy or today's questions are used up (Medium, small fix, FN-A5-panel-assistant-2-02)
- When the list of app members fails to load, a group message from the assistant still sends, skips the app and calls every member 'without the app' (Medium, small fix, FN-B-run-panel-assistant-b-01)
- An owner who reports paying MettleUp more or less than the price gets no word, and the extra is never marked to be paid back (Medium, small fix, FN-L5-panel-screens-2-02)
- A second friend with the same name gets the member a "Free days added" message but no days (Medium, small fix, FN-A5-panel-logic-2-3-01)
- A second friend with the same name earns the member no free days, yet the screen says they were added (Medium, small fix, FN-A5-panel-screens-1-2-01)
- No test opens the AI Assistant at the daily question limit (Medium, small fix, FN-A8-panel-assistant-1-01)
- Cancel, done-already and credit-given-back words on a card are never tested (Medium, medium fix, FN-A8-panel-assistant-1-03)
- Offline renewals, offline Dues-list payments and a device not ready for offline are never tested (Medium, small fix, FN-A8-panel-forms-1-02)
- The skipped-rows download copies Aadhaar numbers as they were, and no test notices (Medium, small fix, FN-A8-panel-screens-1-3-02)
- A renewal or cancel at the desk can fail to reach the door machine, and nobody is told (Medium, medium fix, FN-B-alerts-panel-pay-machines-b-01)
- Member numbers linked in the app before the 2 Nov desk check are never checked again, and the gym cannot see or undo them (Medium, medium fix, FN-B-time-panel-shop-01)
- On a basic door machine, a member whose plan ended keeps getting in until someone opens the admin app (Medium, medium fix, FN-B-truth-panel-pay-machines-a-03)
- A gym kept in the browser that turns on the shop can lose its shop for good with one cleared browser (Medium, medium fix, FN-L14-panel-shop-02)
- When the gym removes a member, the member's desk photo and body measurements stay on the server with no end (Medium, medium fix, FN-L4-panel-shop-01)
- Trainer questions, trainer summaries and sent workout reports are only deleted when someone opens them again (Medium, small fix, FN-L4-panel-shop-02)
- A help library is named in the notes but not found in code (Medium, fix size not known, FN-A3-help-03)
- Demo gym: two body measurements can be saved for the same day (Medium, small fix, FN-A5-panel-demo-2-01)
- With "Comes with a pass" ticked and no company picked, "Add member" can look as if it does nothing (Medium, small fix, FN-A5-panel-forms-2-01)
- The History tab is only checked for one done task (Medium, small fix, FN-A8-panel-assistant-1-02)
- The 'Which one?' and 'No member found' cards are never checked on screen (Medium, small fix, FN-A8-panel-assistant-1-05)
- The plan writer's waiting, reopening and rewriting are never tested (Medium, medium fix, FN-A8-panel-assistant-1-06)
- How the floating AI button moves and hides is never tested (Medium, small fix, FN-A8-panel-assistant-1-07)
- Most 'Today for you' rows are checked only as data (Medium, small fix, FN-A8-panel-assistant-1-08)
- The money and dues answer cards are checked only as data (Medium, small fix, FN-A8-panel-assistant-1-09)
- The ask box and message card error lines are never seen in a test (Medium, small fix, FN-A8-panel-assistant-1-10)
- A test requires a birthday group message to reach the member who already gets the automatic wish (Medium, small fix, FN-A8-panel-assistant-1-11)
- No test opens the History tab's loading, failed, empty or not-sent states (Medium, small fix, FN-A8-panel-assistant-2-01)
- The voice sheet's problem lines and Cancel are never seen by a test (Medium, small fix, FN-A8-panel-assistant-2-02)
- No test taps an idea's action button or the credits pill on Today (Medium, small fix, FN-A8-panel-assistant-2-03)
- A question-back card's choices and typed answer are never tested (Medium, small fix, FN-A8-panel-assistant-2-06)
- No assistant test taps twice or clears the chat (Medium, small fix, FN-A8-panel-assistant-2-07)
- The code sheet the owner hands to staff is barely tested (Medium, small fix, FN-A8-panel-auth-data-1-02)
- Add a person: most refusals are never tested (Medium, small fix, FN-A8-panel-auth-data-1-03)
- A locked PIN is never shown on screen in any test (Medium, small fix, FN-A8-panel-auth-data-1-04)
- The Trainer tick on a person’s row is never tapped in a test (Medium, small fix, FN-A8-panel-auth-data-1-05)
- Forgot PIN is tested only for the owner (Medium, small fix, FN-A8-panel-auth-data-1-08)
- A test requires a real gym to get 12 sample products when the shop is turned on (Medium, small fix, FN-A8-panel-brand-shell-1-01)
- No test opens the Shop screen and checks what the owner or desk sees (Medium, medium fix, FN-A8-panel-brand-shell-1-03)
- Going back to MettleUp's look, the save message and the member-app-off card are never tested (Medium, small fix, FN-A8-panel-brand-shell-1-04)
- The check-in poster page is never opened by a test (Medium, small fix, FN-A8-panel-brand-shell-1-05)
- Signing up with a number that already has a gym, or tapping Create twice, is never tested (Medium, small fix, FN-A8-panel-brand-shell-1-08)
- The owner's own challenge, its winners and the leaderboard hiding are never opened in a test (Medium, medium fix, FN-A8-panel-brand-shell-2-01)
- Diet plans and body measurements are tested only as the owner, though the desk and trainers use them (Medium, small fix, FN-A8-panel-brand-shell-2-02)
- The Busy machines settings page is never opened by a browser test (Medium, small fix, FN-A8-panel-brand-shell-2-03)
- Stopping a workout offer and the staff view of it are never seen in a test (Medium, small fix, FN-A8-panel-brand-shell-2-04)
- No test opens Enquiries as staff, and the quick add button is never tapped (Medium, small fix, FN-A8-panel-brand-shell-2-05)
- Importing members as staff is never tried on screen (Medium, small fix, FN-A8-panel-brand-shell-2-06)
- Three ways into Members are never opened in a test (Medium, small fix, FN-A8-panel-brand-shell-3-03)
- Restoring an archived member is never tested (Medium, small fix, FN-A8-panel-brand-shell-3-04)
- The desk opening the message writer by address is never tested (Medium, small fix, FN-A8-panel-brand-shell-3-06)
- Receipt not found and the date and amount error words are never tested (Medium, small fix, FN-A8-panel-brand-shell-3-07)
- The desk's renew and its blocked plan actions are never tested (Medium, small fix, FN-A8-panel-brand-shell-3-10)
- The Member app tab and the desk's own Settings page are never checked (Medium, small fix, FN-A8-panel-brand-shell-3-11)
- Several desk paths on Today and the frame are never tested (Medium, medium fix, FN-A8-panel-brand-shell-3-12)
- No test ever opens Change start date on screen (Medium, small fix, FN-A8-panel-forms-1-01)
- Pay online is tested only on Collect payment as the owner; Send to their app and the Sell sheet QR never (Medium, small fix, FN-A8-panel-forms-1-03)
- Freeze / extra days is tested on screen only once, for 7 days on a renewal (Medium, small fix, FN-A8-panel-forms-1-05)
- No test proves dues of a cancelled plan stop being chased (Medium, small fix, FN-A8-panel-forms-3-08)
- The Attendance page is never opened by a test (Medium, medium fix, FN-A8-panel-logic-1-1-01)
- The losing-the-habit file download has no test at all (Medium, small fix, FN-A8-panel-logic-1-1-02)
- The 'came in today with fees due' card is tested only once, as the owner, on the plan-ended message (Medium, small fix, FN-A8-panel-logic-1-2-01)
- Checking a workout code is tested only as the owner, and most of its messages only as data (Medium, small fix, FN-A8-panel-logic-1-2-04)
- Money's empty pages, the Dues link and the dues file are never tested (Medium, medium fix, FN-A8-panel-logic-1-2-05)
- No test saves a report file as the front desk, after a filter change, or with Hindi names (Medium, medium fix, FN-A8-panel-logic-1-2-06)
- The only screen test of Help and feedback runs in the demo gym, where that page is replaced (Medium, small fix, FN-A8-panel-logic-1-3-01)
- A failed or half-saved backup download, and staff being kept from it, are never tested (Medium, small fix, FN-A8-panel-logic-1-3-04)
- The member card is never opened on screen by any test (Medium, small fix, FN-A8-panel-logic-2-1-01)
- Taking a photo on a member's page is never tested on screen (Medium, medium fix, FN-A8-panel-logic-2-1-02)
- The 'Your gym is ready' card is only checked for its title and Done button (Medium, small fix, FN-A8-panel-logic-2-2-01)
- The Today cards for numbers to confirm and app plan requests are never used on screen (Medium, small fix, FN-A8-panel-logic-2-2-03)
- Marking and taking back a PT session is never done on screen (Medium, small fix, FN-A8-panel-logic-2-2-04)
- Printing a receipt is never tested (Medium, small fix, FN-A8-panel-logic-2-3-01)
- Ready-made challenge cards: saving, failures and blocked states are never seen in a test (Medium, small fix, FN-A8-panel-logic-2-3-02)
- The Android 'Install the admin app' button is never tested, and no test shows the card to staff (Medium, small fix, FN-A8-panel-logic-2-3-04)
- Quick buttons: the desk view, the six-button limit and an empty list are never seen on screen (Medium, small fix, FN-A8-panel-logic-2-3-05)
- Free days for a friend: refusals, failed save and the desk's view are never seen on screen (Medium, small fix, FN-A8-panel-logic-2-3-07)
- The Monday WhatsApp summary is never checked for privacy, an empty gym or the desk (Medium, small fix, FN-A8-panel-logic-2-4-01)
- The Workout offer card on Today, the offline card and the no-receipt promise are never tested (Medium, small fix, FN-A8-panel-logic-2-4-05)
- The owner-only rule and the number rules for entry machines are checked only by reading the server change's text (Medium, medium fix, FN-A8-panel-screens-1-2-02)
- The WhatsApp and Call buttons on Enquiries are never pressed in a test (Medium, small fix, FN-A8-panel-screens-1-2-04)
- Gym timings for a gym with two branches are never tested (Medium, small fix, FN-A8-panel-screens-1-3-03)
- Most of the member page is never checked by a test (Medium, small fix, FN-A8-panel-screens-1-3-04)
- The member page is never checked as the front desk, apart from the money buttons (Medium, small fix, FN-A8-panel-screens-1-3-05)
- A test requires a past start day to be saved; the journey says it never is (Medium, small fix, FN-A8-panel-screens-1-4-01)
- The WhatsApp sheet on a member page is barely tested, and never as the desk (Medium, medium fix, FN-A8-panel-screens-1-4-02)
- Sending a workout plan from a member page is never done on screen (Medium, medium fix, FN-A8-panel-screens-1-4-03)
- No screen test taps Save twice on the money sheets of a member page (Medium, small fix, FN-A8-panel-screens-1-4-05)
- The web page and one-link set-up step is only tested when everything works (Medium, small fix, FN-A8-panel-screens-2-2-01)
- The Member questions page is checked on the server but almost never on screen (Medium, small fix, FN-A8-panel-screens-2-2-03)
- Training progress is never tested when it cannot show, or for a trainer opening full progress (Medium, small fix, FN-A8-panel-screens-2-2-04)
- The paid-features lock card in Settings has no screen test at all (Medium, small fix, FN-A8-panel-screens-2-2-05)
- Saving gym details is only tested for the GSTIN (Medium, small fix, FN-A8-panel-screens-2-2-06)
- A receipt is never really tested as the front desk (Medium, small fix, FN-A8-panel-screens-2-2-08)
- Disconnect the shop, and the front desk's view of Settings, are never tested (Medium, small fix, FN-A8-panel-screens-2-3-01)
- Today for a brand-new gym, and the empty words of its three lists, are never tested (Medium, small fix, FN-A8-panel-screens-2-3-04)
- What the front desk sees on Today is only half tested: the weekly money card and the came-in card are never checked for the desk (Medium, small fix, FN-A8-panel-screens-2-3-05)
- Your numbers: the 'Part of the Pro pack' card and the no-check-ins lines are never tested (Medium, small fix, FN-A8-panel-screens-2-3-06)
- The 'Messages to send' card's buttons and its plans-ending row are never tested (Medium, small fix, FN-A8-panel-screens-2-3-07)
- The 'Workout offer' card on Today is never tested (Medium, small fix, FN-A8-panel-screens-2-3-08)
- The WhatsApp button on each Today row is never tested (Medium, small fix, FN-A8-panel-screens-2-3-09)
- Trainers: the week buttons, the load error, the gym-not-online state and a removed trainer are never tested (Medium, medium fix, FN-A8-panel-screens-2-3-10)
- Most booking-sheet refusals are checked only in the logic, never on screen; the other two ways in are never opened (Medium, medium fix, FN-A8-panel-screens-2-3-11)
- A booking that has started, opened by a non-owner, and a failed cancel are never tested on screen (Medium, small fix, FN-A8-panel-screens-2-3-12)
- The trainer page editor's photo, 80-letter limit, mixed-hours warning and a trainer editing their own page are never tested on screen (Medium, medium fix, FN-A8-panel-screens-2-3-13)
- No test ever opens the workout plan screens (Medium, medium fix, FN-A8-panel-screens-2-4-01)
- The web page's Copy link and Share on WhatsApp are never tested (Medium, small fix, FN-A8-panel-screens-2-4-02)
- Taking a published web page off is never tested (Medium, small fix, FN-A8-panel-screens-2-4-03)
- Photo location removal and the six-photo limit are never tested on screen (Medium, small fix, FN-A8-panel-screens-2-4-04)
- The Joined in the app list is barely tested, and never as staff (Medium, small fix, FN-A8-panel-shop-1-01)
- The app invite card on Invite members is never used in a test (Medium, small fix, FN-A8-panel-shop-1-02)
- The Fees due list and its download are never checked on screen (Medium, small fix, FN-A8-panel-ui-shell-1-03)
- No test checks that the add buttons on Enquiries, Expenses, Diet plans and Challenges are greyed while offline (Medium, small fix, FN-A8-panel-ui-shell-2-01)
- The Losing the habit tab on Visits is never opened in a screen test (Medium, small fix, FN-A8-panel-ui-shell-2-02)
- Changing a member's mobile number never warns that their app pop-ups will stop (Medium, small fix, FN-B-alerts-panel-forms-a-03)
- Add member never says the birthday wish needs a date of birth (Medium, small fix, FN-B-alerts-panel-forms-a-04)
- Messages offers 'Birthdays today' and 'Plans ending' groups with no word that the automatic wish and reminders already reach many of them (Medium, medium fix, FN-B-alerts-panel-logic-1-b-03)
- A member already sent the plan ending message from the one by one list is still offered it on Renewals due (Medium, medium fix, FN-B-alerts-panel-logic-2-b-04)
- Sending a diet plan, a workout plan or saving measurements never says who will not get the phone pop-up (Medium, medium fix, FN-B-alerts-panel-screens-1-a-01)
- Every small edit to a diet plan sends all its members another 'Your gym changed your diet plan' pop-up (Medium, medium fix, FN-B-alerts-panel-screens-1-a-03)
- A member's page offers a birthday WhatsApp to a member the automatic wish already reaches (Medium, small fix, FN-B-alerts-panel-screens-1-b-01)
- A member who stopped coming is offered a 'we miss you' message again in every place, with no sign anyone already sent one (Medium, medium fix, FN-B-alerts-panel-screens-1-b-04)
- Two 'Well done' notes to single members silence the phone pop-up of the gym's big notice later that day (Medium, small fix, FN-B-alerts-panel-screens-2-a-01)
- A booked or cancelled personal-training session is never told to the member (Medium, medium fix, FN-B-alerts-panel-screens-2-a-03)
- Today asks the owner to remind members whose plans end, with no word that the automatic reminder already does it (Medium, small fix, FN-B-alerts-panel-screens-2-b-02)
- On a slow line, a message sent from the assistant can go out twice (Medium, medium fix, FN-B-run-panel-assistant-a-01)
- On a slow line, a reply to a member's message can reach the member twice (Medium, small fix, FN-B-run-panel-screens-2-a-03)
- A member on a medical or travel freeze still shows up as 'stopped coming' and can get 'we miss you' (Medium, medium fix, FN-B-switch-panel-forms-01)
- The emergency number box refuses most landlines and two numbers, and saves a Bangalore landline as a wrong mobile (Medium, small fix, FN-B-switch-panel-forms-02)
- A member archived at the desk stays on the gym leaderboard and keeps getting the gym's app messages (Medium, medium fix, FN-B-switch-panel-screens-1-a-01)
- A member never hears from the app that a personal training session was booked or cancelled for them (Medium, medium fix, FN-B-switch-panel-screens-2-a-01)
- A price or discount typed with a decimal point becomes a figure 100 or 10 times bigger in a member message (Medium, small fix, FN-B-switch-panel-shop-01)
- Once plans can run out, a gym whose plan has ended keeps its look for members but cannot change it, and is told only 'That didn't save' (Medium, medium fix, FN-B-time-panel-brand-shell-01)
- A monthly plan started on the 29th, 30th or 31st, or a yearly plan started on 29 Feb, gives the member up to 3 fewer days (Medium, small fix, FN-B-time-panel-forms-01)
- Aadhaar and PAN numbers brought in before the 23 Oct rule are still kept (Medium, small fix, FN-B-time-panel-logic-1-03)
- A member who renews a day late, or leaves and comes back, is wiped from the finger machine and is refused at the door (Medium, medium fix, FN-B-time-panel-pay-machines-01)
- A desk worker who has been removed can still open the whole member list on his phone, for as long as he keeps it offline (Medium, small fix, FN-B-time-panel-ui-shell-01)
- A rewrite sends real phone numbers and emails to the AI company that the first request had hidden (Medium, small fix, FN-B-truth-panel-assistant-a-05)
- 'Fees due' and the fees reminder include plans that have not started, though the Dues page says those are not late (Medium, small fix, FN-B-truth-panel-screens-2-b-03)
- The assistant hands every member without the app to WhatsApp for offers, with no way to leave out someone who asked not to be messaged (Medium, medium fix, FN-L12-panel-assistant-01)
- An entry machine upload that could not be read is answered as received, so its check-ins can be lost (Medium, small fix, FN-L16-panel-pay-machines-01)
- One outsider can fill the daily help limit for every gym, and the AI import limit too (Medium, medium fix, FN-L19-panel-screens-1-01)
- Anyone with the gym's code can fill its shop and its member messages with fake app members, and the gym cannot remove them (Medium, medium fix, FN-L19-panel-shop-02)
- The AI Assistant's history keeps a member's name and typed mobile number for 400 days, out of reach of any member erase (Medium, medium fix, FN-L4-panel-assistant-01)
- The record of who asked the AI is deleted after 400 days only by chance (Medium, small fix, FN-L4-panel-assistant-02)
- Unsent desk work stays on a computer with no end date after the person is removed or signed out (Medium, small fix, FN-L4-panel-auth-data-04)
- Photos an owner takes off the gym web page are kept on our server for ever (Medium, small fix, FN-L4-panel-brand-shell-01)
- A diet plan sent to named members can never be deleted, though the gym terms say plans can be deleted at any time (Medium, medium fix, FN-L4-panel-logic-1-02)
- Ready offer messages send a hand-typed saving or family discount that nothing checks or gives (Medium, medium fix, FN-L4-panel-logic-2-02)
- The fees reminder tells members to pay "on UPI" when the gym has no UPI ID saved (Medium, small fix, FN-L4-panel-logic-2-04)
- The gym agreement says nothing about the public gym web page, which is on for every gym by default (Medium, small fix, FN-L4-panel-logic-2-p2-01)
- Entry machine records would be kept for ever, and erasing a member would not reach them (Medium, small fix, FN-L4-panel-pay-machines-01)
- The privacy notice says nothing about entry machine punches (Medium, small fix, FN-L4-panel-pay-machines-02)
- Cancelling a receipt that was paid online does not give the member's money back, and the sheet never says so (Medium, medium fix, FN-L5-panel-forms-02)
- Every receipt for a plan says it includes the joining fee, even a small later part payment (Medium, small fix, FN-L5-panel-logic-2-02)
- A person who asked to join online at one price is sold the plan at today's price when the desk taps Make member (Medium, small fix, FN-L5-panel-screens-1-02)
- Cancelling a receipt the member paid online says nothing about giving the money back (Medium, small fix, FN-L5-panel-screens-1-03)
- The Plan ending WhatsApp asks the member to pay for a plan the gym no longer sells (Medium, small fix, FN-L5-panel-screens-1-04)
- Filling in missing details for members already in the gym saves one member at a time (Medium, medium fix, FN-L7-panel-logic-1-02)
- Nobody at MettleUp is warned when AI column matching nears or hits its daily ceiling (Medium, small fix, FN-L8-panel-logic-1-01)
- When a save fails and the credit cannot be given back, the credit stays taken and the card can never try again (Medium, medium fix, FN-A5-panel-assistant-1-02)
- 'Download all your gym's data' leaves out much of the gym's data (Medium, medium fix, FN-A5-panel-logic-1-3-01)
- Times in the gym's data download are 5 and a half hours behind India time (Medium, small fix, FN-A5-panel-logic-1-3-02)
- A receipt number that is not sure yet can still be sent to the member on WhatsApp (Medium, small fix, FN-A5-panel-screens-2-2-02)
- Front desk can freeze a plan by approving a pause request (Medium, small fix, FN-A5-panel-ui-shell-1-01)
- The owner cannot see whether an alert or the daily summary reached any phone, or why not (Medium, medium fix, FN-B-alerts-panel-logic-2-b-01)
- When an assistant save fails or a credit cannot be given back, only the owner's own browser knows (Medium, small fix, FN-B-run-panel-assistant-a-02)
- When the server answers with an error (not a lost connection), the desk keeps showing old records with no warning (Medium, small fix, FN-B-run-panel-brand-shell-b-01)
- When an owner cannot report paying MettleUp, book a trainer session, reply to a member or save the web page, MettleUp never hears of it (Medium, medium fix, FN-B-run-panel-screens-2-a-02)
- If the payment company does not answer at Approve, a refunded online join payment is still saved as paid, and the desk is not told the check was skipped (Medium, small fix, FN-B-run-panel-ui-shell-b-01)
- An Aadhaar number written in Hindi digits or with dots is kept in the member notes after an import (Medium, small fix, FN-B-switch-panel-logic-1-b-01)
- A locked-out owner's last way back in is an email that only one person can act on, with no record in HQ (Medium, medium fix, FN-L14-panel-auth-data-02)
- A save that got no answer and is later refused freezes the desk until the page is reloaded (Medium, small fix, FN-L16-panel-auth-data-01)
- A removed staff member's name, mobile and every device they signed in on are kept for ever (Medium, small fix, FN-L4-panel-auth-data-05)
- The trial gyms' shared AI money pool runs out with no warning to MettleUp first (Medium, small fix, FN-L8-panel-assistant-01)
- A full device throws away the desk's offline copy of the gym with no word to the desk (Medium, small fix, FN-L8-panel-auth-data-02)
- Each 'Well done' sent from Training progress uses one of the gym's 10 member messages a day, with no warning (Medium, small fix, FN-L8-panel-screens-2-01)
- A new PIN that was saved can be followed by words saying the number check ran out (Medium, small fix, FN-A5-panel-auth-data-1-01)
- Sign out of this device tells everyone they need a new code to come back, even with a PIN (Medium, small fix, FN-A5-panel-auth-data-1-03)
- The "Choose a new PIN?" box can ask for the current PIN with nowhere to type it (Medium, small fix, FN-A5-panel-auth-data-2-01)
- A payment taken with no internet from the Dues list only says "Payment saved." (Medium, small fix, FN-A5-panel-forms-1-01)
- The "price is more than the plan price" question stays on screen after another plan is picked (Medium, small fix, FN-A5-panel-forms-3-01)
- Today's member news depends on the clock of the phone or laptop (Medium, small fix, FN-A5-panel-logic-1-1-01)
- The WhatsApp follow-up to a web-page enquiry carries the system note (Medium, small fix, FN-A5-panel-logic-1-2-01)
- The growth Excel file shows a renewal rate the page hides (Medium, small fix, FN-A5-panel-logic-1-2-02)
- Workout code check calls entry-machine check-ins "imported" (Medium, small fix, FN-A5-panel-logic-1-2-03)
- A special day with a past date vanishes without a word (Medium, small fix, FN-A5-panel-logic-1-4-02)
- The owner's quick buttons are kept on one device only, though the sheet reads as if staff get them (Medium, medium fix, FN-A5-panel-logic-2-3-02)
- On a trainer's page showing a past week, the booking sheet offers only a day that is already over (Medium, small fix, FN-A5-panel-screens-2-3-01)
- 'Copy link' on the web page says nothing when the copy fails (Medium, small fix, FN-A5-panel-screens-2-4-01)
- A real gym owner is told their demo gym is gone (Medium, small fix, FN-A5-panel-shop-2-01)
- "Open" on All branches switches branch while this branch's entries still wait to be sent (Medium, small fix, FN-A5-panel-small-1-01)
- All branches tells an owner who cannot open other branches that the gym has one branch (Medium, small fix, FN-A5-panel-small-1-02)
- Member search on All branches stops at 50 results without saying so (Medium, small fix, FN-A5-panel-small-1-03)
- A test locks in that an archived member is never found, so the assistant offers to add him again (Medium, medium fix, FN-A8-panel-assistant-1-04)
- No test shows the ask box locked when today's free questions are used up (Medium, small fix, FN-A8-panel-assistant-2-05)
- Staff & sign-in error states are never tested (Medium, small fix, FN-A8-panel-auth-data-1-07)
- Put your gym online: its refusals and last card are never tested (Medium, small fix, FN-A8-panel-auth-data-1-09)
- Removing a person is tested only on the happy path (Medium, small fix, FN-A8-panel-auth-data-2-02)
- The signed-out notice is never tested with no internet, a second tab, or a later sign-in (Medium, small fix, FN-A8-panel-auth-data-2-04)
- The Change my PIN sheet is tested only for the owner, and the locked words never (Medium, small fix, FN-A8-panel-auth-data-2-06)
- The Create my gym no-answer path is tested only as words (Medium, small fix, FN-A8-panel-auth-data-2-07)
- No test changes the number after it was checked, or uses a run-out check on Create my gym (Medium, small fix, FN-A8-panel-auth-data-2-08)
- No test proves the PIN, code or mobile stay out of the address bar and browser storage (Medium, small fix, FN-A8-panel-auth-data-2-09)
- Saving a PIN from the one-time 'Set your own PIN' sheet is never tested (Medium, small fix, FN-A8-panel-auth-data-3-01)
- Two desk safety messages are never tested: device out of space, and repeated save clashes (Medium, small fix, FN-A8-panel-auth-data-3-03)
- The refused-payment screens are tested only as data, never as what the desk sees (Medium, medium fix, FN-A8-panel-auth-data-3-04)
- The half-finished import and failed undo messages are never tested (Medium, medium fix, FN-A8-panel-brand-shell-2-07)
- The plan form's error words and the starter price list are never tested (Medium, small fix, FN-A8-panel-brand-shell-3-09)
- No test presses a button in the sales demo and checks what happens (Medium, medium fix, FN-A8-panel-demo-1-01)
- The demo's "this does nothing here" message is never checked on screen (Medium, small fix, FN-A8-panel-demo-1-02)
- The front desk demo test only opens five pages (Medium, small fix, FN-A8-panel-demo-1-03)
- Nothing checks that a reload undoes changes made through the demo's pretend server (Medium, small fix, FN-A8-panel-demo-1-04)
- The demo's menu badges and Today counts are never compared with the waiting cards (Medium, small fix, FN-A8-panel-demo-1-06)
- No test takes, changes or removes a member photo on the Add member screen (Medium, medium fix, FN-A8-panel-forms-2-01)
- The 'already has this number, archived' banner on Add member is never tested (Medium, small fix, FN-A8-panel-forms-2-02)
- The Add member error words, Saving button and Cancel are never checked on screen (Medium, small fix, FN-A8-panel-forms-2-03)
- Editing a member is never checked for the archived note, a clashing number or a kept photo (Medium, small fix, FN-A8-panel-forms-2-04)
- No test checks what the front desk sees on the member forms (Medium, small fix, FN-A8-panel-forms-2-05)
- The sell sheet with no plans on sale is never opened in a test (Medium, small fix, FN-A8-panel-forms-3-01)
- The UPI QR on the sell sheet is never tested (Medium, small fix, FN-A8-panel-forms-3-03)
- Many sell sheet hints and error words are never checked (Medium, small fix, FN-A8-panel-forms-3-04)
- The desk selling with part or no payment, or an old payment date, is never tested (Medium, small fix, FN-A8-panel-forms-3-05)
- Cancelling a receipt offline, on failure, or for a non-membership receipt is never tested (Medium, small fix, FN-A8-panel-forms-3-06)
- Two tests lock in that a past special day vanishes without a word (Medium, small fix, FN-A8-panel-logic-1-4-01)
- HQ messages in the bell are tested only for the owner (Medium, small fix, FN-A8-panel-logic-1-4-05)
- Importing members into several branches is never tried on screen (Medium, small fix, FN-A8-panel-logic-1-4-06)
- Import refusals and the fill-in-blanks choice are never seen on screen (Medium, small fix, FN-A8-panel-logic-1-4-08)
- A new member question that arrives just after another was answered is never tested, and likely makes no sound (Medium, small fix, FN-A8-panel-logic-2-1-03)
- Undo import is never tested for a member the gym only edited, a cancelled receipt, or a second undo (Medium, small fix, FN-A8-panel-logic-2-1-04)
- The timings test requires 'Right now members see' before anything is saved (Medium, small fix, FN-A8-panel-screens-1-3-01)
- Member messages: a double tap, the sending state, the page refreshing by itself, the empty page and the 180-day line are never tested (Medium, small fix, FN-A8-panel-screens-2-1-01)
- The 'Joined in the app' tab is only tested for two taps (Medium, small fix, FN-A8-panel-screens-2-1-03)
- The receipt for a payment to MettleUp is never opened in a test (Medium, small fix, FN-A8-panel-screens-2-1-06)
- A desk login can read every sent message by a direct call, and no test checks it (Medium, small fix, FN-A8-panel-shop-1-03)
- Two shop cards are never tested: Branding before the app is on, and after the shop is disconnected (Medium, small fix, FN-A8-panel-shop-2-03)
- No test checks that starting a demo or turning the shop on sends no member details (Medium, small fix, FN-A8-panel-shop-2-04)
- Renaming the gym is never tested on screen (Medium, small fix, FN-A8-panel-shop-2-06)
- Adding a product photo is never tested on screen (Medium, small fix, FN-A8-panel-shop-2-07)
- Switching branch while offline or with unsent entries is never tested (Medium, small fix, FN-A8-panel-shop-2-11)
- Renaming the business of a gym with branches is never tested on screen (Medium, small fix, FN-A8-panel-shop-2-14)
- The Payments page is never tested as the front desk (Medium, small fix, FN-A8-panel-shop-2-15)
- Saving Branding, a failed save and going back to MettleUp's look are never checked on screen (Medium, small fix, FN-A8-panel-shop-2-17)
- The server books personal training even when the member has no classes left (Medium, small fix, FN-A8-panel-ui-shell-4-01)
- The sign-in tests lock in 'Wait 15 minutes' though the PIN lock can last 1 hour (Medium, small fix, FN-A8-server-database-2-1-01)
- The AI ideas ask the owner to send renewal and come-back reminders the automatic reminders already send (Medium, small fix, FN-B-alerts-panel-assistant-b-01)
- Forgot PIN says a code is on its way on WhatsApp even when WhatsApp refused to send it (Medium, small fix, FN-B-alerts-panel-auth-data-a-01)
- A double payment from two desks is told only to the desk that sent it, and the note never clears when the owner sorts it (Medium, medium fix, FN-B-alerts-panel-auth-data-b-01)
- Saving the gym's look never says how many members will actually see it (Medium, small fix, FN-B-alerts-panel-brand-shell-a-01)
- The 'Add your logo and colours' set-up step disagrees with the gym's real look (Medium, small fix, FN-B-alerts-panel-brand-shell-b-01)
- News the owner already saw on Today still counts as new in the bell and in the 11:00 summary (Medium, small fix, FN-B-alerts-panel-logic-1-b-01)
- The 'Send members the app link' set-up step never ticks itself, though it says it will (Medium, small fix, FN-B-alerts-panel-logic-1-b-04)
- A join request stays under Joined online after the desk adds the same person through Add member (Medium, small fix, FN-B-alerts-panel-logic-2-b-03)
- 'Paid online, receipt not made' stays on Today after the desk saves the payment by hand (Medium, small fix, FN-B-alerts-panel-pay-machines-b-02)
- The 'Using the app' tag on the member page follows a different rule from the one that decides who gets pop-ups (Medium, small fix, FN-B-alerts-panel-screens-1-a-02)
- The owner can never see whether a member got the phone pop-up for a diet plan, workout plan, measurement or new challenge (Medium, medium fix, FN-B-alerts-panel-screens-1-b-02)
- Calling or WhatsApping an enquiry from its row leaves it on 'call today' and in the bell (Medium, small fix, FN-B-alerts-panel-screens-1-b-03)
- Free days given by hand for a friend who joined still leave 'Give free days' on the enquiry (Medium, small fix, FN-B-alerts-panel-screens-1-b-05)
- After a trainer replies to a member question, nobody can see whether the member saw it (Medium, small fix, FN-B-alerts-panel-screens-2-b-04)
- After 'Turn off on this device' the open admin app still chimes and pops up for every new alert (Medium, small fix, FN-B-alerts-panel-ui-shell-a-01)
- Choosing 'Once a day' for the rest still rings at once for each question or message while the app is open (Medium, small fix, FN-B-alerts-panel-ui-shell-a-02)
- The number on the browser tab and the number on the bell count different things (Medium, small fix, FN-B-alerts-panel-ui-shell-b-01)
- Sign-in and staff screens say "Something went wrong" and keep no note of why (Medium, small fix, FN-B-run-panel-auth-data-a-02)
- When MettleUp's gym server is down, the gym is told its own internet is broken (Medium, small fix, FN-B-run-panel-auth-data-a-03)
- Putting a gym online may leave the old owner key working for good, and nobody is told (Medium, small fix, FN-B-run-panel-auth-data-b-01)
- When money or a member taken with no internet is refused by the server later, MettleUp is never told (Medium, small fix, FN-B-run-panel-forms-a-01)
- If the every-minute job that sends gym alerts stops, no gym gets alerts with the app closed and nobody is told (Medium, small fix, FN-B-run-panel-logic-2-a-02)
- When MettleUp's payment server or the payment company has a fault, the desk is told 'No internet' or 'not switched on yet' (Medium, small fix, FN-B-run-panel-pay-machines-a-01)
- When a gym's payment company stops accepting its keys, online payments switch off and nobody is told (Medium, small fix, FN-B-run-panel-pay-machines-a-04)
- When a save fails on the member page, Visits, Enquiries, Challenges or door machines, MettleUp is never told (Medium, medium fix, FN-B-run-panel-screens-1-a-01)
- If a server part goes missing, Challenges, Diet plans, Measurements and Gym timings calmly say it is not switched on yet, and nobody is told (Medium, small fix, FN-B-run-panel-screens-1-a-02)
- On a slow line, Add 10 or a new product can be saved twice (Medium, medium fix, FN-B-run-panel-shop-a-01)
- Shop and member-app screens say 'Something went wrong' and nobody at MettleUp hears of it (Medium, small fix, FN-B-run-panel-shop-a-02)
- When the server cannot list members' requests, Today shows nothing waiting instead of saying it could not check (Medium, small fix, FN-B-run-panel-ui-shell-b-02)
- The 'AI answers for members' switch and limit also govern gym web page visitors, but the owner is never told (Medium, small fix, FN-B-switch-panel-assistant-01)
- The assistant's amount boxes turn a pasted 'Rs. 1500' into 0.15 rupees and cannot take paise (Medium, small fix, FN-B-switch-panel-assistant-02)
- Changing the logo or colours changes one branch only, and Branding does not say so (Medium, medium fix, FN-B-switch-panel-brand-shell-a-02)
- The import reads mobiles in Hindi digits, but not dates or fees, so such a row is refused (Medium, small fix, FN-B-switch-panel-logic-1-b-02)
- Selling a personal training pack with a trainer named on it does not give that trainer the member (Medium, medium fix, FN-B-switch-panel-logic-2-a-01)
- After adding a branch, no member can be checked in at the other branch until each one is ticked by hand (Medium, medium fix, FN-B-switch-panel-pay-machines-03)
- Member search on All branches finds nobody when a mobile number is pasted with +91 or typed in Hindi digits (Medium, small fix, FN-B-switch-panel-pay-machines-04)
- Once a GST number is saved, the collections export for the accountant still has no GST split (Medium, small fix, FN-B-switch-panel-screens-2-a-02)
- The gym's web page and its AI helper never mention the free trial the owner switched on (Medium, small fix, FN-B-switch-panel-screens-2-a-03)
- Members and Collections search find nobody when a mobile is pasted with a 0 in front or in Hindi digits (Medium, small fix, FN-B-switch-panel-screens-2-b-02)
- When the owner or a staff member gets a new mobile number, it cannot be changed: the person must be added again (Medium, medium fix, FN-B-time-panel-auth-data-02)
- If a terms change reaches the admin app before the server, every owner is stopped at the terms page and no new gym can be made (Medium, small fix, FN-B-time-panel-auth-data-04)
- 'Who came today' shows one number but a longer list when a member checked in twice (Medium, small fix, FN-B-truth-panel-assistant-a-01)
- 'Plans ending this week' means 8 days on the Today idea and 7 days in the week summary (Medium, small fix, FN-B-truth-panel-assistant-a-02)
- A plan extended by the assistant can be extended twice after a dropped connection (Medium, medium fix, FN-B-truth-panel-assistant-a-06)
- Putting a gym online can leave out the last check-in or payment saved while it copies (Medium, small fix, FN-B-truth-panel-auth-data-a-02)
- A receipt cancel that got no answer is shown as money taken and waiting to send (Medium, small fix, FN-B-truth-panel-auth-data-b-01)
- Two desks freezing the same plan at the same time give the member the days twice (Medium, small fix, FN-B-truth-panel-forms-a-02)
- The sell sheet's 'Still due after this' leaves out money the member already owed on earlier plans (Medium, small fix, FN-B-truth-panel-forms-b-02)
- Undoing an import leaves the details it filled in for members already in the gym (Medium, medium fix, FN-B-truth-panel-logic-1-a-01)
- 'Active members' for today can be two different numbers on Today and on Your growth (Medium, small fix, FN-B-truth-panel-logic-1-a-02)
- A renewal paid to start a few days after the old plan ends still shows the member as ending (Medium, small fix, FN-B-truth-panel-logic-1-b-03)
- Today's 'Renewals due' counts a plan that has not started yet, while 'plans end this week' on the same screen leaves it out (Medium, small fix, FN-B-truth-panel-logic-2-b-01)
- A desk that chose Hinglish switches back to English when it moves to the new address (Medium, small fix, FN-B-truth-panel-pay-machines-a-04)
- An owner's help questions and the MettleUp team's replies show only on the computer they were asked from (Medium, medium fix, FN-B-truth-panel-screens-1-a-02)
- A changed gym UPI ID can take a long time to reach the join page and the members' shop QR (Medium, small fix, FN-B-truth-panel-screens-2-a-02)
- A member message the gym never answered disappears from the gym after 90 days (Medium, small fix, FN-B-truth-panel-shop-b-02)
- When someone joining online pays more than the plan, Approve says it saves all of it but the receipt keeps only the plan price (Medium, small fix, FN-B-truth-panel-ui-shell-a-01)
- The gym terms changed on 14 Nov, but owners were never asked to accept them again (Medium, small fix, FN-B-words-panel-auth-data-01)
- In Hinglish, Staff & sign-in, the PIN sheets, the terms card, Put your gym online and every sign-in error stay in English (Medium, medium fix, FN-B-words-panel-auth-data-02)
- Once WhatsApp number checks are required, 'Put gym online' fails and tells the owner to ask for a WhatsApp code it cannot send (Medium, medium fix, FN-B-words-panel-auth-data-03)
- A running challenge says winners get their free days by themselves, but the owner must now give each one (Medium, small fix, FN-B-words-panel-logic-1-01)
- Start my gym promises 3 free months, but a mobile number that already had a trial gets none (Medium, small fix, FN-B-words-panel-logic-2-01)
- Switching on the Pro pack lock today would lock nothing, because its database part is not live (Medium, small fix, FN-H5-panel-pay-machines-02)
- A how-to question is sent to Help and feedback empty, where asking again may cost credits (Medium, small fix, FN-L14-panel-assistant-03)
- Every AI credit top-up is a hand job hidden among ordinary help messages (Medium, medium fix, FN-L14-panel-assistant-05)
- The data agreement tells the owner to open support access in Settings, but it is now in Help and feedback (Medium, small fix, FN-L14-panel-auth-data-03)
- Help has no page on working without internet, and its forgot-PIN line names only one way back in (Medium, small fix, FN-L14-panel-auth-data-04)
- The admin app tells owners to message MettleUp on WhatsApp but never gives a number or a button (Medium, small fix, FN-L14-panel-brand-shell-01)
- When a payment, sale or new member fails to save, MettleUp never hears of it (Medium, small fix, FN-L14-panel-forms-01)
- Several desk tasks have no help answer, and the help check never looks at these forms (Medium, small fix, FN-L14-panel-forms-02)
- A gym that pays MettleUp by UPI gets no warning before its plan ends (Medium, small fix, FN-L14-panel-logic-1-02)
- 'Needs you' on Today leaves out people who asked to join online (Medium, small fix, FN-L14-panel-logic-2-02)
- Owners are told to 'Message MettleUp on WhatsApp' with no number or button to do it (Medium, small fix, FN-L14-panel-pay-machines-01)
- The app promises MettleUp will raise a limit or sort out a machine clash, but MettleUp has no way to do either (Medium, medium fix, FN-L14-panel-pay-machines-02)
- A branch can be added but never closed, and leaving MettleUp says nothing about branches (Medium, medium fix, FN-L14-panel-pay-machines-03)
- Branches are live but have no help article, and the help check cannot see them (Medium, small fix, FN-L14-panel-pay-machines-04)
- Someone trying the demo gym has no way to ask MettleUp a question (Medium, small fix, FN-L14-panel-pay-machines-05)
- Help and feedback gives no other way to reach MettleUp when sending fails (Medium, small fix, FN-L14-panel-screens-1-01)
- Paying MettleUp has no help answer, because the help list still calls it not live (Medium, small fix, FN-L14-panel-screens-2-01)
- A gym delete request is sent through the AI help box, with the gym's name, code, phone and the asker's name (Medium, small fix, FN-L14-panel-ui-shell-01)
- Help says gym alerts work only while the admin app is open, but they now come with it closed (Medium, small fix, FN-L14-panel-ui-shell-02)
- The sell sheet checks a start date more loosely than the payment sheet checks a payment date (Medium, small fix, FN-L16-panel-forms-01)
- In the admin panel's Your questions, a second reply from the MettleUp team wipes out the first (Medium, medium fix, FN-L16-panel-logic-1-01)
- Pay MettleUp reads an amount typed with a decimal comma as a hundred times bigger (Medium, small fix, FN-L16-panel-logic-2-01)
- The Bring a friend and Busy machines cards quietly vanish from Settings when the first check fails (Medium, small fix, FN-L16-panel-screens-1-01)
- The MettleUp checkout step, member desk photos and alerts on this device have no test of their own (Medium, medium fix, FN-L16-panel-shop-02)
- A member's own name is sent to the AI as if the owner had typed it, so a crafted name can steer the message draft (Medium, small fix, FN-L19-panel-assistant-01)
- One person can switch the AI Assistant off for every trial gym for the rest of the month (Medium, small fix, FN-L19-panel-assistant-03)
- The front desk can add or remove check-ins for any day with no name kept, and check-ins now win challenge prizes (Medium, small fix, FN-L19-panel-auth-data-02)
- A member can earn a workout offer's free days without coming to the gym (Medium, medium fix, FN-L19-panel-logic-2-01)
- An owner can report paying MettleUp less than the price, and one HQ confirm still gives the full plan (Medium, small fix, FN-L19-panel-screens-2-01)
- The same workout code can earn the member extra days again and again (Medium, medium fix, FN-L19-panel-ui-shell-01)
- Numbers to confirm only shows a name the app user typed themselves (Medium, medium fix, FN-L19-panel-ui-shell-02)
- A gym panel sign-in never runs out (Medium, small fix, FN-L3-panel-auth-data-01)
- A stranger can list your mobile in their own gym, and Forgot PIN then opens their gym too (Medium, medium fix, FN-L3-panel-auth-data-02)
- A front-desk login can switch on "train at every branch" for a member, although only the owner is meant to (Medium, small fix, FN-L3-panel-forms-01)
- Disconnect the shop forgets the gym's owner key in this browser only; the key keeps working on the server (Medium, small fix, FN-L3-panel-screens-2-01)
- A front-desk login can give any member door access with any end date, paid or not (Medium, medium fix, FN-L3-panel-shop-01)
- Anyone with the app key can list the photos of every gym web page, even pages the owner never published (Medium, small fix, FN-L4-panel-brand-shell-02)
- "Never sees money totals" for front desk staff is only true on screen (Medium, small fix, FN-L4-panel-logic-2-01)
- The MettleUp access card can say 'MettleUp has never opened your records' when it did, more than 2 years ago (Medium, small fix, FN-L4-panel-ui-shell-01)
- Record a payment from the assistant fails for a member who owes on two plans (Medium, small fix, FN-L5-panel-assistant-05)
- An owner can wipe a refused receipt that was already printed, leaving no record of the cash and a gap in the receipt numbers (Medium, small fix, FN-L5-panel-auth-data-02)
- A plan and payment for a new member the server refused are sent anyway after 30 days, making a receipt for nobody (Medium, small fix, FN-L5-panel-auth-data-03)
- A GST-registered gym's monthly profit counts the GST it owes the government as its own money (Medium, small fix, FN-L5-panel-logic-1-01)
- Past pass visits change company or disappear when a member's pass box is changed (Medium, medium fix, FN-L5-panel-logic-2-01)
- The key help always tells the owner to use test keys, also when payments are live (Medium, small fix, FN-L5-panel-pay-machines-04)
- A refund made at the payment company after the receipt is saved never reaches the admin app (Medium, medium fix, FN-L5-panel-pay-machines-06)
- Once paying online when joining is switched on, the invite screen and printed join poster still say pay at the desk (Medium, small fix, FN-L5-panel-shop-04)
- After paying MettleUp online, the owner comes back to a screen that says nothing about whether the payment worked (Medium, medium fix, FN-L5-panel-ui-shell-01)
- The Pay online card never says payments are not refunded, even for the Rs 29,999 founding payment (Medium, small fix, FN-L5-panel-ui-shell-02)
- Each save and each change from another desk rebuilds and copies the whole gym (Medium, large fix, FN-L7-panel-auth-data-02)
- A gym kept in this browser only fills the browser's space within months of daily check-ins (Medium, medium fix, FN-L7-panel-auth-data-03)
- Giving free days to all challenge winners at once sends one request per winner, one after another (Medium, medium fix, FN-L7-panel-screens-1-01)
- A paying gym is handled as a trial gym whenever its paid check fails (Medium, small fix, FN-L8-panel-assistant-02)
- When all gyms together reach the day's speaking ceiling, the owner is told he used up his own time (Medium, small fix, FN-L8-panel-assistant-03)
- The paid WhatsApp code limit gives no warning before it is reached (Medium, small fix, FN-L8-panel-auth-data-01)
- A gym kept only in this browser hits its space limit with no early warning (Medium, small fix, FN-L8-panel-auth-data-04)
- If the gym server's storage limit is reached, every desk only sees 'Something went wrong' (Medium, small fix, FN-L8-panel-auth-data-05)
- When the picture store is full, a gym owner is told the logo is over 1 MB (Medium, small fix, FN-L8-panel-brand-shell-01)
- A web-page chat question stopped by a limit does not say whether the day ran out or the AI credits did (Medium, small fix, FN-L8-panel-logic-2-02)
- Anyone can call the door service with made-up machine numbers as often as they like (Medium, small fix, FN-L8-panel-pay-machines-02)
- MettleUp's notices in the bell vanish exactly when the server is over its limit (Medium, small fix, FN-L8-panel-ui-shell-01)
- A screen reader hears 'Thinking' but never hears that the answer has come (Medium, small fix, FN-L9-panel-assistant-02)
- Member names in an answer and past tasks in History can be tapped but look like plain text (Medium, small fix, FN-L9-panel-assistant-03)
- Closing the voice sheet after speaking throws away what was heard (Medium, small fix, FN-L9-panel-assistant-05)
- A changed member AI switch or monthly limit is lost without a word if the credits sheet is closed (Medium, small fix, FN-L9-panel-assistant-06)
- Closing a half-filled form with the cross or Escape throws away everything typed, with no question (Medium, small fix, FN-L9-panel-forms-01)
- On a phone, '+ New batch' can sit hidden off the right edge of the batch row (Medium, small fix, FN-L9-panel-forms-02)
- On Add member, the 'already has this number' and 'could not save' messages appear at the top, out of sight (Medium, small fix, FN-L9-panel-forms-03)
- Moving through the branch list with the arrow keys opens each branch in turn (Medium, small fix, FN-L9-panel-pay-machines-02)
- One secret key locks every gym's payment company keys, with no second key and no written way back (Medium, medium fix, FN-L14-panel-pay-machines-06)
- Anyone with a gym account can claim another gym's entry machine by typing its serial number first (Medium, medium fix, FN-L19-panel-pay-machines-01)
- Website sells the shop, logo and colours, trainer plans, challenge and Your numbers as Pro only, but today every gym gets them: the pack switch is off (Medium, medium fix, FN-A3-website-1-07)
- Demo gym: an approved renewal or pause says only "Approved", without the new dates (Medium, small fix, FN-A5-panel-demo-2-02)
- Coming back to a demo, and a demo that has gone, are never tested (Medium, small fix, FN-A8-panel-shop-2-05)
- "The receipt will be made by itself in a minute" is only true while someone has Today open (Medium, medium fix, FN-B-alerts-panel-forms-b-01)
- Reward days given by hand after a workout check still show on Today as a reward to give (Medium, small fix, FN-B-alerts-panel-forms-b-02)
- The nightly backup has never been restored from a real night's copy (Medium, small fix, FN-B-run-panel-forms-a-02)
- Online payment records and the gyms' payment company connections are not in the nightly backup (Medium, small fix, FN-B-run-panel-pay-machines-a-02)
- If an entry machine's upload arrives broken, its punches are skipped for good (Medium, small fix, FN-B-run-panel-pay-machines-a-03)
- The restore of a real nightly backup copy was never written down as done (Medium, small fix, FN-B-run-panel-screens-2-a-04)
- MettleUp's own admin app never shows whether a gym has agreed to the terms and data agreement (Medium, small fix, FN-B-switch-panel-auth-data-01)
- Once the unpaid-gym lock is on, a read-only gym can still send members messages and change reminders and timings (Medium, small fix, FN-B-switch-panel-logic-1-a-01)
- A GST-registered gym cannot see how much GST it collected in a month (Medium, medium fix, FN-B-switch-panel-logic-1-a-02)
- Days the gym is closed still count as days a member stayed away (Medium, medium fix, FN-B-switch-panel-logic-1-a-03)
- Editing a member or undoing an import does not update the door machines (Medium, small fix, FN-B-switch-panel-pay-machines-02)
- A member archived, or a plan cancelled, while an entry machine is switched off stays on that machine after it is switched back on (Medium, medium fix, FN-B-time-panel-pay-machines-02)
- When saving the gym look fails for an unknown reason, nobody at MettleUp ever hears of it (Medium, small fix, FN-L14-panel-brand-shell-02)
- The old address on the founder's personal domain must work for good, but nothing records when the domains run out (Medium, small fix, FN-L14-panel-pay-machines-07)
- The 3 credits for an AI workout plan are only asked for by the admin app, so a changed app gets AI plans free (Medium, medium fix, FN-L19-panel-assistant-02)
- The help box gives AI answers free to anyone who leaves out the gym's sign-in key (Medium, small fix, FN-L19-panel-logic-1-01)
- Entry machine check-ins are saved for any date, even years in the past or future (Medium, small fix, FN-L19-panel-pay-machines-02)
- The server takes whatever number of credits the admin app says a task costs (Medium, medium fix, FN-L5-panel-assistant-02)
- A machine with a big backlog of punches may be refused again and again (Medium, medium fix, FN-L8-panel-pay-machines-03)
- An open payment link asks the server every 4 seconds for as long as the screen stays open (Medium, small fix, FN-L8-panel-pay-machines-04)
- Old product photos are never removed from the picture store (Medium, medium fix, FN-L8-panel-shop-01)
- Training progress and an update note promise a phone notification every time (Small, small fix, FN-B-alerts-panel-logic-2-a-01)
- The heading 'Turn on the member app first' is never shown (Small, small fix, FN-A5-panel-shop-1-03)
- Notes say the admin app runs only its own scripts, but one outside script is allowed (Small, small fix, FN-A3-inbox-1-19)
- Notes say feedback can be typed or spoken in both apps; the admin app only takes typing (Small, medium fix, FN-A3-inbox-3-12)
- The list of times MettleUp support looked at the gym shows a day and month but no year (Small, small fix, FN-B-time-panel-auth-data-03)
- In Hinglish, automatic reminders, the plan-ended banner, Pay MettleUp, workout reports, body measures and member questions stay in English (Small, medium fix, FN-B-words-panel-logic-1-03)
- Several AI Assistant buttons are smaller than the panel's own finger-size rule (Small, small fix, FN-L9-panel-assistant-07)
- Web page editor says '1 plans from Plans' (Small, small fix, FN-A5-panel-screens-2-4-02)
- Several register lines are never checked on the Visits screen (Small, small fix, FN-A8-panel-screens-1-1-04)
- A test keeps an entry machine Online for three minutes after it stops, while the journey says it must not stay Online for minutes (Small, small fix, FN-A8-panel-screens-1-2-01)
- The More page's Shop and Member questions badges and its rows for a trainer are never tested (Small, small fix, FN-A8-panel-screens-2-1-07)
- Member questions page promises a phone notification for every reply (Small, small fix, FN-B-alerts-panel-logic-1-a-02)
- Festival ideas silently stop after 2028, and Eid stays 'around' even after the moon is seen (Small, small fix, FN-B-time-panel-assistant-02)
- Two Hinglish labels in the assistant say the wrong thing (Small, small fix, FN-B-words-panel-assistant-03)
- The assistant gives one member's page three names, and dues two (Small, small fix, FN-B-words-panel-assistant-05)
- The old ForgeAI admin icons are still served next to the new MettleUp ones (Small, small fix, FN-B-words-panel-brand-shell-03)
- In Hinglish, the money sheets and parts of Add member stay in English (Small, medium fix, FN-B-words-panel-forms-02)
- The freeze button reads 'Add 1 days' when one day is typed (Small, small fix, FN-B-words-panel-forms-03)
- Personal training is counted in 'sessions' on one screen and in 'classes' on another (Small, small fix, FN-B-words-panel-logic-2-03)
- In Hinglish, branches, entry machines, the move notice, the demo gym and the Pro pack note stay in English (Small, medium fix, FN-B-words-panel-pay-machines-02)
- In Hinglish, Visits, Enquiries, Expenses, Import, Help, Gym timings, Diet plans, Measurements and most of the member page stay in English (Small, medium fix, FN-B-words-panel-screens-1-01)
- Measurements tells the owner members find them under Progress, Body, but the member app has no Progress tab any more (Small, small fix, FN-B-words-panel-screens-1-02)
- A trainer's page says members see what the trainer teaches, but the member app never shows it (Small, small fix, FN-B-words-panel-screens-2-02)
- The MettleUp Plus lock Save button is greyed when nothing changed, with no word that it is already saved (Small, small fix, FN-B-words-panel-screens-2-03)
- Three 'put your gym online first' cards point to the wrong place (Small, small fix, FN-B-words-panel-shop-01)
- Shop says new orders show up in a few seconds, and Joined in the app says new members show up at once, but both look only once a minute (Small, small fix, FN-B-words-panel-shop-02)
- A few small lines in the workout offer and product cards read wrong (Small, small fix, FN-B-words-panel-shop-06)
- In Hinglish, Your numbers on Today, Your growth, the offline line, the member card, MettleUp access and the bell's update summary stay in English (Small, medium fix, FN-B-words-panel-ui-shell-01)
- The alert timing Save button is greyed out on opening with no word that the choice is already saved (Small, small fix, FN-B-words-panel-ui-shell-03)
- The first time offered for a message sent later follows the computer's clock, not India time (Small, small fix, FN-L16-panel-assistant-01)
- Staff jobs still carry a keep-on-this-browser stand-in waiting for a server change (Small, small fix, FN-L16-panel-logic-2-04)
- Help questions and past imports show their dates by the computer's clock, not India time (Small, small fix, FN-L16-panel-screens-1-02)
- Offline waiting payments show their time by the computer clock, not India time (Small, small fix, FN-L16-panel-ui-shell-01)
- The AI credits sheet's price list leaves out renewals, extensions, enquiries and expenses (Small, small fix, FN-L5-panel-assistant-03)
- The owner's numbers on Today go through every member, plan, payment and check-in about 30 times each time they are worked out (Small, medium fix, FN-L7-panel-logic-2-01)
- The Members list and the Money collections list draw every row at once (Small, medium fix, FN-L7-panel-screens-2-01)
- No automatic accessibility check ever looks at the AI Assistant (Small, small fix, FN-L9-panel-assistant-09)
- The 'Other ways back in' button does not tell a screen reader whether the list is open (Small, small fix, FN-L9-panel-auth-data-04)
- The colour code boxes on Branding show no focus ring when reached with the keyboard (Small, small fix, FN-L9-panel-brand-shell-01)
- The admin app ignores the bigger text setting in the computer browser (Small, medium fix, FN-L9-panel-brand-shell-02)
- In the light look, the 'No logo yet' words are hard to read (Small, small fix, FN-L9-panel-brand-shell-03)
- Which of the other logo colours is picked is shown only by a slightly different frame (Small, small fix, FN-L9-panel-brand-shell-04)
- The two logo choices behave like a pick-one list for a screen reader, but the arrow keys do nothing (Small, small fix, FN-L9-panel-brand-shell-05)
- A screen reader does not read the explanation under 'Comes with a pass' or 'Can train at every branch' (Small, small fix, FN-L9-panel-forms-04)
- Open payments, the move notice buttons and the branch picker are smaller than the panel's finger-size rule (Small, small fix, FN-L9-panel-pay-machines-03)
- The day-by-day visit charts tell their details only by colour, bar height and a mouse-hover note (Small, small fix, FN-L9-panel-screens-1-01)
- Three product card buttons have a spoken name that does not match the words on them (Small, small fix, FN-L9-panel-shop-02)
- With the keyboard, the bell panel does not take the focus, and closing it loses your place (Small, small fix, FN-L9-panel-ui-shell-02)
- Dark | Light and English | Hinglish are announced as pick-one lists, but the arrow keys do nothing (Small, small fix, FN-L9-panel-ui-shell-03)
- The side menu's group headings, 'More below' and the 'Pay now' link are smaller than the panel's finger-size rule (Small, small fix, FN-L9-panel-ui-shell-04)
- The receipt number written on the UPI payment is a guess and can differ from the receipt given (Small, small fix, FN-B-truth-panel-forms-a-03)
- A test locks in that extra digits in front of a number are dropped without a word (Small, small fix, FN-A8-panel-forms-1-07)
- Gym alerts have no quiet hours, so a shop order can ring the owner at 2 am (Small, medium fix, FN-B-alerts-panel-logic-2-a-03)
- When an entry machine stops reporting in, nobody is told (Small, small fix, FN-B-alerts-panel-pay-machines-a-02)
- Three controls go grey with no reason on screen (Small, small fix, FN-B-words-panel-pay-machines-04)
- Four buttons go grey with no word saying why (Small, small fix, FN-B-words-panel-screens-1-03)
- Two buttons with long words can run past the edge of a phone screen (Small, small fix, FN-B-words-panel-screens-1-04)
- Two controls go grey with no reason on screen (Small, small fix, FN-B-words-panel-shop-04)
- The AI that writes offers to members is not told to avoid promising body results (Small, small fix, FN-L12-panel-assistant-02)
- Some things on these pages are smaller to tap than the panel's own finger-size rule (Small, small fix, FN-L9-panel-screens-2-02)
- The examples sheet and the Try saying sentences are opened but never used in a test (Small, small fix, FN-A8-panel-assistant-2-04)
- No test signs in as a trainer (Small, small fix, FN-A8-panel-auth-data-2-05)
- The import money card is never tested after an undo, a second import, or when money cannot be worked out (Small, small fix, FN-A8-panel-auth-data-3-06)
- The alerts card is never tested when alerts are blocked or on an iPhone (Small, small fix, FN-A8-panel-brand-shell-1-06)
- Your numbers are never checked to change after a payment or new check-ins (Small, small fix, FN-A8-panel-brand-shell-1-09)
- Most Add expense refusals and month switching are never tested (Small, small fix, FN-A8-panel-brand-shell-2-10)
- Gym timings failure, offline and staff empty states are never tested (Small, small fix, FN-A8-panel-brand-shell-2-11)
- Parts of cancelling a receipt are never tested (Small, small fix, FN-A8-panel-brand-shell-3-08)
- The mobile number boxes on sign-in, Enquiries, Forgot PIN and Staff are never filled on screen, and the wrong-number words never checked (Small, small fix, FN-A8-panel-forms-1-06)
- Several Collect payment messages are never checked (Small, small fix, FN-A8-panel-forms-1-08)
- Who-took-the-money is never tested after a rename, on a shared phone, or for a link paid while the sheet is open (Small, small fix, FN-A8-panel-forms-1-09)
- The workout code check is never tested after a reward, on Cancel, or for a member with no plan (Small, small fix, FN-A8-panel-forms-1-10)
- A pass member's break and restart, and '+ Other company', are never tested on screen (Small, small fix, FN-A8-panel-forms-2-10)
- Batches are never seen on screen in any test (Small, small fix, FN-A8-panel-logic-1-1-03)
- Bold urgent lines, the Payment label and tapping a browser notice are never checked (Small, small fix, FN-A8-panel-logic-1-1-04)
- Automatic reminders: the offline card and refused saves are never seen on screen (Small, small fix, FN-A8-panel-logic-1-1-06)
- Changing the birthday switch while Today is open is never tested (Small, small fix, FN-A8-panel-logic-1-1-07)
- Two measurement messages are never tested (Small, small fix, FN-A8-panel-logic-1-1-08)
- Your growth for a young gym and its first-and-latest comparison are checked only as data (Small, small fix, FN-A8-panel-logic-1-2-02)
- The 'needs your gym online' cards on Challenges and Diet plans are never tested (Small, small fix, FN-A8-panel-logic-1-2-03)
- Editing a diet plan and copying a withdrawn one are never tested on screen (Small, small fix, FN-A8-panel-logic-1-2-07)
- The add-enquiry link, the call-again date sheet and the 90-day chat line are never tested (Small, small fix, FN-A8-panel-logic-1-2-08)
- The GST journey and the GST tests disagree on what old receipts show (Small, small fix, FN-A8-panel-logic-1-3-02)
- The workout report card on a member's page is never opened in a screen test (Small, medium fix, FN-A8-panel-logic-1-3-03)
- The Refresh line's hidden tab, busy tap and demo hiding are never tested (Small, small fix, FN-A8-panel-logic-1-3-05)
- Set up your gym's 'Next step' bar and undoing a hand tick are never tested (Small, small fix, FN-A8-panel-logic-1-3-06)
- Gym timings: Saving, double tap, Keep them and the 30-day cap are never tested (Small, small fix, FN-A8-panel-logic-1-4-02)
- Two progress journeys describe a screen the tests say is gone (Small, small fix, FN-A8-panel-logic-2-1-06)
- The words for a member who does not share workouts are never checked (Small, small fix, FN-A8-panel-logic-2-1-07)
- The phone More page is never checked for the desk, nor compared with the side menu (Small, small fix, FN-A8-panel-logic-2-1-08)
- The brand-new gym numbers journey expects five zero tiles, but the panel hides them (Small, small fix, FN-A8-panel-logic-2-2-02)
- The empty Pass visits page and the one-visit export words are never checked (Small, small fix, FN-A8-panel-logic-2-2-05)
- Most lines under settings are checked only as text in the code, not on screen (Small, small fix, FN-A8-panel-logic-2-3-06)
- What is new and its bell number are tested only as the owner, and never in the demo gym (Small, small fix, FN-A8-panel-logic-2-4-02)
- The paid-plan reminder on Today is never seen on screen, nor the desk Today of a trial gym (Small, small fix, FN-A8-panel-logic-2-4-04)
- The desk never turns its own alerts on or off in a test, and the could-not-turn-on words are never seen (Small, small fix, FN-A8-panel-logic-2-4-06)
- Many entry machine screens are never tested: the staff view, the no-number card, Keep it, the reload, Try again (Small, medium fix, FN-A8-panel-screens-1-2-03)
- The Add enquiry warnings, refusals, Saving and failed save are never seen on screen (Small, small fix, FN-A8-panel-screens-1-2-05)
- The 'Why did they not join?' reason box is never tested (Small, small fix, FN-A8-panel-screens-1-2-06)
- The thank-you sheet's failure, cannot-give notes and staff view are checked only as data (Small, small fix, FN-A8-panel-screens-1-2-07)
- Help and feedback's AI answer, its Yes and No and the team's reply are never seen on screen (Small, small fix, FN-A8-panel-screens-1-2-08)
- The MettleUp access card's off, failed and Cancel states are never seen on screen (Small, small fix, FN-A8-panel-screens-1-2-09)
- Checking in from the member page: the toast, a failure and the next day are never tested (Small, small fix, FN-A8-panel-screens-1-3-06)
- Parts of cancelling a membership are never checked on screen (Small, small fix, FN-A8-panel-screens-1-4-04)
- The measurements card for a gym not online, and a long list of entries, are never tested (Small, small fix, FN-A8-panel-screens-1-4-06)
- Pay MettleUp: the journey and the test disagree on what the front desk sees (Small, small fix, FN-A8-panel-screens-2-2-07)
- Pay MettleUp is never tested when the send fails (Small, small fix, FN-A8-panel-screens-2-2-09)
- Set up your gym: a hand tick surviving a refresh, and the row's look once done, are never tested (Small, small fix, FN-A8-panel-screens-2-3-03)
- The web page for a gym not online, and the desk in other states, are never tested (Small, small fix, FN-A8-panel-screens-2-4-05)
- The web page preview's waiting, failure and notice words are never tested (Small, small fix, FN-A8-panel-screens-2-4-06)
- Saving twice from a double tap is never tested on the web page or a workout plan (Small, small fix, FN-A8-panel-screens-2-4-07)
- The message limit warnings are checked only as words, never on screen (Small, small fix, FN-A8-panel-shop-1-06)
- Which menu item is lit on a phone, Back from More, and old page addresses are never tested (Small, small fix, FN-A8-panel-ui-shell-1-01)
- Screen colours and language are tested only for the owner, and never across a sign-out (Small, small fix, FN-A8-panel-ui-shell-1-02)
- Starting the demo with no internet, and the first-visit words, are never tested (Small, small fix, FN-A8-panel-ui-shell-1-04)
- No test checks the bell stays quiet in a hidden tab, or what the front desk hears (Small, small fix, FN-A8-panel-ui-shell-1-05)
- The desk's Challenges page with nothing running is never tested (Small, small fix, FN-A8-panel-ui-shell-2-03)
- Member messages: a full conversation, the not-online page and the error with Try again are never seen on screen (Small, small fix, FN-A8-panel-ui-shell-3-01)
- The Today's collection test cannot tell today's money from the month's (Small, small fix, FN-A8-panel-ui-shell-4-02)
- Old Messages links are never opened as the front desk (Small, small fix, FN-A8-panel-ui-shell-4-03)
- The free-trial line on Today is never checked as hidden for the desk, the demo or a browser-only gym (Small, small fix, FN-A8-panel-ui-shell-4-04)
- Trainer pages that cannot work are tested only as the owner (Small, small fix, FN-A8-panel-ui-shell-4-05)
- The 'please pay' pop-up stays in the member's inbox after the desk took the money (Small, small fix, FN-B-alerts-panel-forms-a-02)
- Pop-ups to members from a new challenge, diet plan or measurement go out at any hour (Small, small fix, FN-B-alerts-panel-screens-1-a-04)
- A shop order marked ready by mistake and put back to new still tells the member it is ready, and marking it ready again sends nothing (Small, small fix, FN-B-alerts-panel-shop-a-03)
- Nobody can tell which assistant ideas and answers owners actually use (Small, small fix, FN-B-run-panel-assistant-a-03)
- MettleUp cannot see which gyms set their own look or finish the set-up steps (Small, medium fix, FN-B-run-panel-brand-shell-a-01)
- Nobody can tell whether gyms send renewal and come-back reminders (Small, medium fix, FN-B-run-panel-logic-2-a-03)
- MettleUp cannot see how many gyms add branches, connect a payment company, or try the demo gym (Small, medium fix, FN-B-run-panel-pay-machines-a-07)
- MettleUp counts shop orders and app members, but not messages, offers or shop money (Small, small fix, FN-B-run-panel-shop-a-03)
- MettleUp cannot see whether owners install the app, read what's new, check workout codes or print growth reports (Small, medium fix, FN-B-run-panel-ui-shell-a-03)
- A member added by asking the assistant never has a birthday, so birthday ideas and wishes skip them (Small, small fix, FN-B-switch-panel-assistant-03)
- Once the Pro lock is on, a gym that leaves Pro keeps its logo and colours everywhere except the member app (Small, small fix, FN-B-switch-panel-brand-shell-a-01)
- A member who joins online is never asked for a birthday, so the birthday wish skips them (Small, medium fix, FN-B-switch-panel-logic-2-b-01)
- The price and discount boxes on ready offer messages drop the decimal point (Small, small fix, FN-B-switch-panel-logic-2-b-02)
- The member card's WhatsApp message is always in English, even when the gym chose Hindi for member messages (Small, small fix, FN-B-switch-panel-ui-shell-02)
- Running the first branding database step again would reset one real gym's chosen look (Small, small fix, FN-B-truth-panel-brand-shell-a-02)
- A member's page can say 'Training' in green beside a red 'Last visit 2 weeks ago', and 'Gone quiet' for someone not on the Losing the habit list (Small, small fix, FN-B-truth-panel-screens-1-b-01)
- The gift choice is called 'Gift – Extra days' on the sheet but saved as 'Gift - extra days' (Small, small fix, FN-B-words-panel-forms-04)
- The panel's own code notes still say Member messages, trainer pages and the join free trial are not live, though they are (Small, small fix, FN-H5-panel-logic-2-01)
- Gym web page photos can show members' faces with no check that those people agreed (Small, small fix, FN-L12-panel-screens-2-01)
- Unused leftovers sit in the AI Assistant code, including a test reset no test ever calls (Small, small fix, FN-L16-panel-assistant-04)
- Sign-in code keeps a few unused helpers and a copied storage check (Small, small fix, FN-L16-panel-auth-data-02)
- Rules no screen uses, some kept alive only by tests (Small, small fix, FN-L16-panel-logic-2-03)
- Unused leftovers in the shop folder: six test resets no test calls, a sign-out forget step nobody runs, a listener list nobody joins (Small, small fix, FN-L16-panel-shop-01)
- A help question sent without a sign-in key still gets a free AI answer that no gym pays for (Small, small fix, FN-L19-panel-screens-1-02)
- No test proves another gym's owner cannot read this gym's member sign-in profiles (Small, small fix, FN-L3-panel-brand-shell-03)
- No test proves another gym is refused on busy machines, Bring a friend counts, the leaderboard owner view, the challenge reward confirm, or the entry machine screens (Small, small fix, FN-L3-panel-screens-1-01)
- An old switched-off path still lets a member phone send body weight, calories and protein to the gym, against the privacy notice (Small, small fix, FN-L4-panel-brand-shell-03)
- The renewal message says "save over paying month by month" when the saving is against the member's own longer plan (Small, small fix, FN-L4-panel-logic-2-03)
- The welcome message can name one plan and give the end date of another (Small, small fix, FN-L4-panel-logic-2-05)
- After free days are added and then the start date is changed, the receipt shows the free days as paid (Small, small fix, FN-L5-panel-forms-03)
- A gym logo made from a photo is saved in the heaviest picture type, up to 1 MB (Small, small fix, FN-L7-panel-brand-shell-03)
- Each mobile number another desk added meanwhile makes the import resend up to 500 rows (Small, medium fix, FN-L7-panel-logic-1-03)
- Every open admin screen downloads the newest 300 shop orders again every minute (Small, medium fix, FN-L7-panel-shop-02)
- The list of members in the app is downloaded whole by three screens on their own, and redrawn the slow way (Small, small fix, FN-L7-panel-shop-03)
- An owner who used up today's AI matches is only told the AI was not available (Small, small fix, FN-L8-panel-logic-1-02)
- No automatic accessibility check ever looks at Diet plans, Challenges, Gym timings, Busy machines or Entry machines (Small, small fix, FN-L9-panel-screens-1-02)
- Crash reports never say which page broke (Small, small fix, FN-A5-panel-brand-shell-3-01)
- Import button says 'Update 1 members' (Small, small fix, FN-A5-panel-logic-1-4-01)
- The support window is never shown on screen after its hour ends (Small, small fix, FN-A8-panel-auth-data-2-10)
- The owner-only card's 'Back to Today' button and its reload are never tested (Small, small fix, FN-A8-panel-auth-data-3-02)
- The 'Use a starter price list' button on Plans has no test (Small, small fix, FN-A8-panel-auth-data-3-05)
- The offline bar's 'Details shown are from' time and the Staff offline view are never checked (Small, small fix, FN-A8-panel-auth-data-3-07)
- A test requires the bell History to keep lines older than 7 days (Small, small fix, FN-A8-panel-brand-shell-1-02)
- The demo as the front desk never shows the owner-only refusals on screen (Small, small fix, FN-A8-panel-brand-shell-1-07)
- The old What's new address is never opened in a test (Small, small fix, FN-A8-panel-brand-shell-2-09)
- The set-up test expects "Next step" to go back to an earlier step (Small, small fix, FN-A8-panel-brand-shell-3-02)
- "Back to my gym" is never pressed in a test (Small, small fix, FN-A8-panel-demo-1-07)
- Tests require another branch to find a member who is not allowed there (Small, small fix, FN-A8-panel-forms-2-06)
- Turning off 'train at every branch', and ticking it on Add member, are never tested (Small, small fix, FN-A8-panel-forms-2-07)
- The batch chips on the member form are never seen by a test (Small, small fix, FN-A8-panel-forms-2-08)
- Making an enquiry a member is untested when the number is taken or the form is cancelled (Small, small fix, FN-A8-panel-forms-2-09)
- The not-a-spreadsheet message and the same result from CSV and Excel are never checked (Small, small fix, FN-A8-panel-logic-2-1-05)
- The Add member joining date is never checked near midnight in India (Small, small fix, FN-A8-panel-logic-2-1-09)
- No test checks when the Pass visits button hides or stays (Small, small fix, FN-A8-panel-screens-1-1-02)
- Bring a friend: clearing the days, the one-day wording and the greyed Save are never tested (Small, small fix, FN-A8-panel-screens-1-1-03)
- Import progress words and a second tap on Add are never tested (Small, small fix, FN-A8-panel-screens-1-3-08)
- AI column matching: the waiting line, a late answer and the owner's own pick are never tested (Small, small fix, FN-A8-panel-screens-1-3-09)
- Importing a file with several sheets is never tested on screen (Small, small fix, FN-A8-panel-screens-1-3-10)
- The workout offer's 'Part of the Pro pack' card, 'already has the reward' and a removed member are never tested (Small, small fix, FN-A8-panel-screens-2-1-05)
- A test requires the desk to read every product, hidden ones and stock numbers included (Small, small fix, FN-A8-panel-shop-1-04)
- The visitor card's undo, double tap, wrong number and limit are never tested on screen (Small, small fix, FN-A8-panel-shop-2-09)
- The add-branch test locks in the wrong words '1 plans were copied' (Small, small fix, FN-A8-panel-shop-2-12)
- Add a branch refusals and the not-ready cards are never tested on screen (Small, small fix, FN-A8-panel-shop-2-13)
- The Payments page with no UPI ID, or a wrong one, is never tested (Small, small fix, FN-A8-panel-shop-2-16)
- Half the logo colour lines are never checked on screen (Small, small fix, FN-A8-panel-shop-2-18)
- A job name that is too long is cut short without a word, and the test locks that in (Small, small fix, FN-A8-server-database-3-3-01)
- The assistant says a message was sent to N in the app, with no way to see who will not get a pop-up (Small, medium fix, FN-B-alerts-panel-assistant-a-02)
- The long note after saving the gym's look disappears before it can be read (Small, small fix, FN-B-alerts-panel-brand-shell-a-02)
- A MettleUp message read on one device still shows as new on every other device (Small, medium fix, FN-B-alerts-panel-logic-1-b-06)
- When the browser renews its alert address, gym alerts stop with no warning (Small, small fix, FN-B-alerts-panel-shop-a-02)
- Admin app updates and new-feature dots read on one device show as new on every other device (Small, medium fix, FN-B-alerts-panel-ui-shell-b-02)
- Tapping 'I saved it' on an online payment does nothing visible when it fails (Small, small fix, FN-B-run-panel-pay-machines-a-05)
- After a slow line, trying again to add a branch says the name is already taken (Small, small fix, FN-B-run-panel-pay-machines-a-06)
- On a slow line, saving a new diet plan again after an error can make two copies (Small, small fix, FN-B-run-panel-screens-1-a-03)
- A help question sent again after a lost answer reaches MettleUp twice and is paid twice (Small, small fix, FN-B-run-panel-screens-1-a-04)
- Approving a renew request with no internet half-saves it and says it could not save (Small, small fix, FN-B-run-panel-ui-shell-a-01)
- When 'Try the demo' fails on the welcome screen, the reason is kept nowhere (Small, small fix, FN-B-run-panel-ui-shell-a-02)
- A PIN or sign-in code typed in Hindi digits is silently thrown away (Small, small fix, FN-B-switch-panel-auth-data-02)
- A pasted colour code with a space in front loses its last letter and is refused (Small, small fix, FN-B-switch-panel-brand-shell-b-01)
- Money boxes refuse an amount typed in Hindi digits or pasted as 'Rs 1500' (Small, small fix, FN-B-switch-panel-forms-03)
- The gym's phone typed in Hindi digits is saved as typed, so the web page says there is no phone (Small, small fix, FN-B-switch-panel-screens-2-b-03)
- The gym's message language is kept only on one device, so the desk's phone still sends English (Small, medium fix, FN-B-switch-panel-ui-shell-03)
- Today's Approve and Yes/No buttons are not greyed out with no internet (Small, small fix, FN-B-switch-panel-ui-shell-04)
- A brand-new gym's bell counts up to two weeks of MettleUp messages sent before it joined as new (Small, small fix, FN-B-time-panel-logic-1-04)
- The one-tap 'Record a payment' rounds dues to whole rupees, so a due with paise is refused (Small, small fix, FN-B-truth-panel-assistant-a-07)
- A question about future dates gets a backwards range and shows zero (Small, small fix, FN-B-truth-panel-assistant-a-08)
- The growth answer's change in members can rise or fall with no row that explains it (Small, small fix, FN-B-truth-panel-assistant-b-03)
- Saving the gym look from an older open screen quietly undoes a newer look saved elsewhere (Small, small fix, FN-B-truth-panel-brand-shell-a-01)
- The 'Saved' date on Branding has no year (Small, small fix, FN-B-truth-panel-brand-shell-b-02)
- The sell sheet never tells the front desk its 31-day limit on the payment date, unlike Collect payment (Small, small fix, FN-B-truth-panel-forms-a-04)
- The Monday WhatsApp summary counts new members and plans ending by different rules from Today (Small, small fix, FN-B-truth-panel-logic-2-a-03)
- Settings' 'Your gym's records' gives a different member count from the Members page (Small, small fix, FN-B-truth-panel-screens-2-b-02)
- The bell number can be bigger than the alerts the bell lists (Small, small fix, FN-B-truth-panel-shop-b-01)
- 'New members' leaves out archived members on Your numbers but counts them on Your growth (Small, small fix, FN-B-truth-panel-ui-shell-b-01)
- In Hinglish, answer cards, tapped ideas and one failure line stay in English (Small, small fix, FN-B-words-panel-assistant-02)
- History calls an unsaved member, payment or expense 'Not sent' (Small, small fix, FN-B-words-panel-assistant-04)
- With member AI on and a limit of 0, the sheet says both 'members can ask 3 a day' and 'members get help pages' (Small, small fix, FN-B-words-panel-assistant-06)
- A long job name on Staff & sign-in runs past the person's box on a phone (Small, small fix, FN-B-words-panel-auth-data-04)
- In Hinglish, the Branding page is almost all in English (Small, medium fix, FN-B-words-panel-brand-shell-01)
- On a first visit to Branding the Save button is greyed with no reason (Small, small fix, FN-B-words-panel-brand-shell-02)
- With the days box cleared, 'Add days' is greyed out with no word saying why (Small, small fix, FN-B-words-panel-forms-05)
- Collect payment says 'Every membership is fully paid' when a cancelled plan still has money owing (Small, small fix, FN-B-words-panel-forms-06)
- What's new says Take photo works when you edit a member, but the Edit member form has no photo (Small, small fix, FN-B-words-panel-forms-07)
- A gym stopped by MettleUp is called paused on some screens and on hold on others, and neither says why or who to ask (Small, small fix, FN-B-words-panel-logic-1-02)
- Member questions tells the owner members find "Ask about your workout" on the Gym tab, but that row is now "Message your gym" (Small, small fix, FN-B-words-panel-logic-1-04)
- The alerts setting lists what always comes at once, but leaves out join requests and web page questions (Small, small fix, FN-B-words-panel-logic-2-02)
- The alert timing and Bring a friend Save buttons are greyed when nothing changed, with no word that it is already saved (Small, small fix, FN-B-words-panel-logic-2-05)
- The test alert says it can take up to a minute, but the card waits a minute and a half (Small, small fix, FN-B-words-panel-logic-2-06)
- Start my gym says the members' app is free always, while a paid plan for members is built and waiting (Small, small fix, FN-B-words-panel-logic-2-07)
- After adding a branch with a long name, its 'Open' button runs off a phone screen (Small, small fix, FN-B-words-panel-pay-machines-03)
- The new-branch tip sends owners to 'Settings, Staff & sign-in', but that page is not in Settings (Small, small fix, FN-B-words-panel-pay-machines-05)
- Three small lines are clumsy or not quite true (Small, small fix, FN-B-words-panel-pay-machines-06)
- In Hinglish, the Shop page, Messages & offers, Joined in the app and the check-in poster page stay in English (Small, medium fix, FN-B-words-panel-shop-03)
- The Automatic reminders Save button is greyed when nothing changed, with no word that it is already saved (Small, small fix, FN-B-words-panel-shop-05)
- A notice from the open admin app shows no MettleUp picture (Small, small fix, FN-B-words-panel-ui-shell-04)
- Owners upload a logo that goes out to all their members without being asked if they may use it (Small, small fix, FN-L12-panel-brand-shell-01)
- Owners can upload any picture as a shop product photo with no word that they must have the right to use it (Small, small fix, FN-L12-panel-shop-01)
- The AI Assistant help page leaves out the daily question limit and how to get credits (Small, small fix, FN-L14-panel-assistant-06)
- A replaced or removed gym logo stays public on our server for ever (Small, medium fix, FN-L14-panel-brand-shell-03)
- The Branding help article skips half the screen (Small, small fix, FN-L14-panel-brand-shell-06)
- Help says a cancelled receipt always goes back onto the member's dues (Small, small fix, FN-L14-panel-forms-03)
- The entry machine guide says 'the address MettleUp gives you', but the screen writes the address in (Small, small fix, FN-L14-panel-pay-machines-08)
- When a plan ends and the gym goes read-only, the line on Today gives no way to reach MettleUp (Small, small fix, FN-L14-panel-ui-shell-03)
- Help never explains checking a member's workout code, and says the desk gives the reward days (Small, small fix, FN-L14-panel-ui-shell-04)
- The assistant writes its own date words in three places instead of using the app's shared date rules (Small, small fix, FN-L16-panel-assistant-02)
- The AI Assistant can vanish for a few minutes after the owner switches gym while its credits were being loaded (Small, small fix, FN-L16-panel-assistant-03)
- Sign-in screens show times by two different rules (Small, small fix, FN-L16-panel-auth-data-03)
- Four separate copies of the 'read a picture' step have already drifted apart (Small, small fix, FN-L16-panel-brand-shell-02)
- Some tests of the desk forms only look for words in the code, not at what the form does (Small, small fix, FN-L16-panel-forms-02)
- Two pieces of branch and entry machine code are never used by the app (Small, small fix, FN-L16-panel-pay-machines-02)
- The branch receipt example and the demo gym keep their own date rules on the device clock (Small, small fix, FN-L16-panel-pay-machines-03)
- Every screen writes its own short-message timer, and they show for different lengths of time (Small, small fix, FN-L16-panel-screens-1-03)
- Workout of the day and the Plus lock switch have no test of any kind (Small, small fix, FN-L16-panel-screens-2-01)
- The only quick tests of several owner screens look for words in the code, not at what the screen does (Small, medium fix, FN-L16-panel-screens-2-02)
- When the rewards count on Today cannot be read, the old number stays and nothing says so (Small, small fix, FN-L16-panel-screens-2-03)
- The date on MettleUp news in the bell has its own copy of the India-day rule (Small, small fix, FN-L16-panel-ui-shell-02)
- Most of the admin app's shared screen parts are never loaded by any test (Small, medium fix, FN-L16-panel-ui-shell-03)
- A batch name typed by the front desk goes into the owner's AI assistant as a trusted gym fact (Small, small fix, FN-L19-panel-forms-02)
- No test proves an owner's AI usage numbers leave out another gym's questions (Small, small fix, FN-L3-panel-assistant-01)
- No test proves another gym's owner cannot see this gym's support-access record or terms record (Small, small fix, FN-L3-panel-auth-data-03)
- A gym owner can show another gym's logo as their own, and no test checks it (Small, small fix, FN-L3-panel-brand-shell-01)
- No test proves another gym is refused when editing, hiding or re-photographing a product, reading the app members list, or saving alert settings (Small, small fix, FN-L3-panel-shop-02)
- Every gym gets 20 starter credits, but the website says only the free trial gets them and a monthly plan gets none (Small, small fix, FN-L5-panel-assistant-04)
- The pass box says no plan and no dues, but a member switched to a pass keeps their old plan and any money they still owe (Small, small fix, FN-L5-panel-forms-04)
- Money collected on Your growth is smaller than Collected on Expenses for the same month when the gym runs a shop (Small, small fix, FN-L5-panel-logic-1-02)
- A cancelled payment link leaves no button to make a new one (Small, small fix, FN-L5-panel-pay-machines-07)
- The Today AI card works out all its ideas again every 30 seconds for no reason (Small, small fix, FN-L7-panel-assistant-02)
- The sign-in screen waits for the whole panel to download first (Small, medium fix, FN-L7-panel-auth-data-04)
- The whole admin app, every screen, the demo gym and the Hindi-English word list, downloads before the first screen shows (Small, medium fix, FN-L7-panel-brand-shell-01)
- The admin app waits for Google's font list before it can draw anything (Small, small fix, FN-L7-panel-brand-shell-02)
- Every save rebuilds the whole gym on the desk phone, which will slow down for big, old gyms (Small, medium fix, FN-L7-panel-brand-shell-04)
- Every save from a desk form copies and compares the gym's whole history several times (Small, large fix, FN-L7-panel-forms-01)
- Each letter typed in the All branches member search re-sorts every branch's whole history (Small, small fix, FN-L7-panel-pay-machines-02)
- The Visits screen goes through the gym's whole check-in history about eight times after every check-in (Small, medium fix, FN-L7-panel-screens-1-02)
- The day's register, a batch list and the Losing the habit list draw every row at once (Small, small fix, FN-L7-panel-screens-1-03)
- The Trainers page downloads every trainer's photo again each time the week changes or a session is booked (Small, small fix, FN-L7-panel-screens-2-02)
- A spoken request that could not be turned into words still uses up speaking time (Small, small fix, FN-L8-panel-assistant-04)
- The ask box shows no focus ring when reached with the keyboard (Small, small fix, FN-L9-panel-assistant-08)
- Closing the side panel throws away a half-typed request (Small, small fix, FN-L9-panel-assistant-10)
- While waiting for the WhatsApp message, a screen reader reads the waiting line out again every minute (Small, small fix, FN-L9-panel-auth-data-03)
- 'Cancel receipt' stays greyed out with no word saying a reason of 3 letters is needed (Small, small fix, FN-L9-panel-forms-05)
- On Collect payment, a wrong amount or date is shown only in a banner, not at the box (Small, small fix, FN-L9-panel-forms-06)
- A screen reader is not told the result of a branch member search (Small, small fix, FN-L9-panel-pay-machines-04)
- 'Not now' on the put-on-your-phone card hides it for good and never says where to find it again (Small, small fix, FN-L9-panel-ui-shell-05)
- The 'Your gym is ready' card shows once and never says where the gym code and join link live after (Small, small fix, FN-L9-panel-ui-shell-06)
- The paid-online journey expects a Make member button that the card does not show (Small, small fix, FN-A8-panel-logic-2-3-08)
- The hidden anti-robot box does nothing in the send-a-code way of Forgot your PIN (Small, small fix, FN-A5-panel-auth-data-1-02)
- MettleUp cannot see how member imports go (Small, medium fix, FN-B-run-panel-logic-1-a-02)
- Every saved gym logo link names one database project, so moving to a new one breaks all logos (Small, medium fix, FN-L14-panel-brand-shell-04)
- The admin app still relies on the founder's personal web address (Small, small fix, FN-L14-panel-brand-shell-05)
- The Pay MettleUp code still says its server part is not live, though it is (Small, small fix, FN-L14-panel-logic-2-03)
- Door machines are set up with one fixed web address typed in by hand (Small, small fix, FN-L14-panel-screens-1-02)
- The first version of the admin app is still kept in the code but nothing opens it (Small, small fix, FN-L16-panel-brand-shell-01)
- The Branding 'unsaved colour survives a refresh' test waits on the real clock for 16 seconds (Small, small fix, FN-L16-panel-brand-shell-03)
- Small rules are written twice in the panel's logic (month of a day, a member's mobile number) (Small, small fix, FN-L16-panel-logic-1-02)
- The India-day rule is written out again in four places (Small, small fix, FN-L16-panel-logic-2-02)
- An import test fails if the test machine is slow (Small, small fix, FN-L16-panel-logic-2-05)
- Invite members drops a failed gym logo read without a trace (Small, small fix, FN-L16-panel-shop-03)
- A web page visitor can talk the gym's AI helper into promising things the gym never wrote (Small, medium fix, FN-L19-panel-brand-shell-01)
- Once the Pro gate is on, a Starter gym can open the Pro pages by blocking one check (Small, small fix, FN-L19-panel-pay-machines-03)
- Anyone with a member app account can create any number of empty gyms (Small, small fix, FN-L3-panel-brand-shell-02)
- No test proves another business cannot see or take back a visitor check-in at a branch (Small, small fix, FN-L3-panel-pay-machines-01)
- Every panel visitor downloads the whole AI Assistant even though nobody can see it (Small, small fix, FN-L7-panel-assistant-01)
- The terms-acceptance list has no index for who accepted (Small, small fix, FN-L7-panel-auth-data-05)
- The member import's code is part of every first download of the admin app (Small, small fix, FN-L7-panel-logic-1-01)
- Each member who leaves makes the database read the leaderboard records of every gym (Small, small fix, FN-L7-panel-screens-1-04)
- No automatic accessibility check ever looks at sign-in, new gym, Forgot PIN, WhatsApp check or the terms screen (Small, small fix, FN-L9-panel-auth-data-05)

### MettleUp HQ (our own admin) (88)

- Needs you says nothing when the payments to confirm cannot be counted (Medium, small fix, FN-L14-hq-app-06)
- The gym owner's MettleUp access list leaves out several things HQ does to the gym (Medium, small fix, FN-B-switch-hq-app-01)
- On a phone, long button words run past the screen edge on the Delete requests page (Medium, small fix, FN-B-words-hq-app-01)
- Four HQ tools are listed as switched off, but the live database already has what they wait for (Medium, small fix, FN-H5-hq-app-02)
- HQ tells you the wrong place for the gym’s own support switch (Medium, small fix, FN-L14-hq-app-02)
- Nothing reaches you about a new lead or help question unless HQ is open (Medium, medium fix, FN-L14-hq-app-08)
- In the light look, the orange words and buttons are too faint to read easily (Medium, small fix, FN-L9-hq-app-01)
- The gym list rows open a gym but do not show or say that they can be opened (Medium, small fix, FN-L9-hq-app-04)
- A plain feedback message marked Question waits for a reply HQ cannot send (Medium, small fix, FN-L14-hq-app-01)
- Un-pausing a new gym marks it as checked (Medium, small fix, FN-A5-hq-app-1-01)
- Members of a paused gym can still pay online in the app (Medium, small fix, FN-B-switch-hq-app-03)
- Pausing a gym says members keep their app, but members cannot check in or order while it is paused (Medium, small fix, FN-B-words-hq-app-03)
- HQ warns only about the logs key; every other key can stop working without a word (Medium, medium fix, FN-L14-hq-app-04)
- Complaints and refund requests by email or phone have no place in HQ (Medium, medium fix, FN-L14-hq-app-07)
- A delete request close to its 30-day limit is not in Needs you (Medium, small fix, FN-L4-hq-app-06)
- HQ says 'payment due' for a gym still inside its free trial, and never shows the stage the gym is really in (Medium, medium fix, FN-B-truth-hq-app-b-03)
- HQ plays the alert sound even when alerts are off (Medium, small fix, FN-A5-hq-app-2-01)
- The new owner sign-in code is tested only half way (Medium, small fix, FN-A8-hq-app-1-01)
- Nothing checks that staff names leave the sign-in history when support access ends (Medium, small fix, FN-A8-hq-app-1-02)
- The "nothing left" check after a gym delete looks at only two tables (Medium, small fix, FN-A8-hq-app-2-03)
- A lead whose gym signs up by itself stays a new lead to call (Medium, small fix, FN-B-alerts-hq-app-b-04)
- Nobody can tell whether the live HQ runs the newest code (Medium, small fix, FN-H5-hq-app-01)
- The welcome message to a new gym owner gives no address for the admin app (Medium, small fix, FN-L14-hq-app-03)
- A demo request marked won is kept for ever, even after that gym is deleted (Medium, small fix, FN-L4-hq-app-04)
- Deleting a gym does not touch what the second database holds about it (Medium, small fix, FN-L4-hq-app-05)
- Money taken by hand for a plan or an AI credit pack keeps no amount and makes no receipt (Medium, medium fix, FN-L5-hq-app-05)
- HQ cannot undo or record a refund for a payment that already became a plan (Medium, medium fix, FN-L5-hq-app-06)
- Any lifetime plan HQ sets, also Starter or on a test gym, quietly uses one of the 25 founding places (Medium, small fix, FN-L5-hq-app-07)
- The Needs you page redraws itself every minute and loses your place (Medium, small fix, FN-L9-hq-app-05)
- Most HQ screens are never opened by an automated test (Medium, medium fix, FN-A8-hq-app-2-01)
- A lost answer followed by Try again can make a gym, a message to every gym, or AI credits twice (Medium, medium fix, FN-B-run-hq-app-a-01)
- Deleting a gym for ever leaves its gym web page photos behind, while HQ says nothing is left (Medium, small fix, FN-L4-hq-app-03)
- HQ says every yearly or lifetime gym gets 100 free AI credits a month, but a Starter yearly gym gets 50 (Medium, small fix, FN-L5-hq-app-03)
- Gym server storage has no warning on Needs you, and its limit is a fixed number (Medium, small fix, FN-L8-hq-app-02)
- The System page's AI cost this month leaves out the AI Assistant and the English helper (Medium, small fix, FN-L8-hq-app-04)
- Delete requests sent from the admin app vanish from HQ with no warning when the website database cannot be read (Medium, small fix, FN-A5-hq-app-3-01)
- The gym delete test never tries pictures that cannot be removed (Medium, small fix, FN-A8-hq-app-2-02)
- With HQ installed on an Android phone, the alert pop-up never appears, yet HQ says alerts are on (Medium, small fix, FN-B-alerts-hq-app-a-01)
- HQ cannot see whether a gym's automatic reminders and pop-ups went out (Medium, medium fix, FN-B-alerts-hq-app-b-01)
- Errors in HQ and in the apps reach nobody; the System page card says not connected yet (Medium, medium fix, FN-B-run-hq-app-a-02)
- HQ counts gyms and payers today, but not activation, day-30 use or trial-to-paid (Medium, medium fix, FN-B-run-hq-app-a-04)
- Online payments to check vanish from the Payments page when online buying is on but its database update is missing (Medium, small fix, FN-B-run-hq-app-b-01)
- The 'Trial ended, not paid' tile also counts gyms whose paid plan ran out (Medium, small fix, FN-B-truth-hq-app-a-01)
- Needs you's 'new gyms to check' number does not match any count on the gym list it opens (Medium, small fix, FN-B-truth-hq-app-b-02)
- Confirming a Starter payment says the gym moves to Starter now, but it stays on Pro until its paid time or trial ends (Medium, small fix, FN-L5-hq-app-02)
- HQ shows test-mode online payments as real money to refund (Medium, small fix, FN-L5-hq-app-04)
- An open HQ tab rebuilds the whole gym list every minute and writes "Looked at all gyms" to the log each time (Medium, small fix, FN-L7-hq-app-01)
- Feedback stops at the newest 200 and Leads at the newest 300, with no way to see older ones (Medium, small fix, FN-L7-hq-app-03)
- Picture storage, download traffic and code-store storage are not watched anywhere in HQ (Medium, medium fix, FN-L8-hq-app-03)
- Many boxes have only a grey hint inside, no name, and the hint vanishes once you type (Small, small fix, FN-L9-hq-app-03)
- In the dark look, the red count on the menu is hard to read (Small, small fix, FN-L9-hq-app-02)
- On a phone, the More sheet opens but the keyboard and screen reader stay on the page behind it (Small, small fix, FN-L9-hq-app-08)
- Two things on the phone are small to tap: the back link on a gym page and Install app (Small, small fix, FN-L9-hq-app-09)
- HQ plan says it shows app versions; the card says not connected yet (Small, small fix, FN-A3-inbox-3-10)
- The Paying tile counts lifetime gyms, but tapping it lists only monthly and yearly payers (Small, small fix, FN-B-truth-hq-app-b-01)
- The support view test never checks what a member record shows (Small, small fix, FN-A8-hq-app-1-03)
- Nothing checks that HQ's private note on a message stays private (Small, small fix, FN-A8-hq-app-1-06)
- HQ's menu icons are copied from a free icon set without the credit line its licence asks for (Small, small fix, FN-L12-hq-app-01)
- Each gym's counts read through records with no index for the last-activity time and staff joins (Small, small fix, FN-L7-hq-app-02)
- The All gyms page waits for five separate reads one after another (Small, small fix, FN-L7-hq-app-04)
- No automatic accessibility check ever runs on HQ (Small, medium fix, FN-L9-hq-app-12)
- Some HQ steps end in tell Claude, with no written steps for anyone else (Small, small fix, FN-L14-hq-app-05)
- After a reply, pressing Save on the same feedback puts it back to New (Small, small fix, FN-B-alerts-hq-app-b-02)
- A new lead can arrive with no sound when another is handled in the same minute (Small, small fix, FN-B-alerts-hq-app-b-03)
- Messages says a message reaches the gyms' bell within a minute; an open admin app looks only every 15 minutes (Small, small fix, FN-B-words-hq-app-02)
- The read log warning on Needs you looks like a link but opens the same page (Small, small fix, FN-B-words-hq-app-04)
- Show older on the Log does nothing when it fails (Small, small fix, FN-B-words-hq-app-05)
- The Log says it holds every look at a gym, but looks made straight in the database are not in it (Small, medium fix, FN-B-words-hq-app-06)
- HQ messages name database updates by number (Small, small fix, FN-B-words-hq-app-07)
- A message button can point to an admin app page that does not exist (Small, small fix, FN-B-words-hq-app-08)
- HQ's install card calls it the owner panel, the name people give the gyms' admin app (Small, small fix, FN-B-words-hq-app-09)
- HQ never warns when one gym's AI use jumps (Small, small fix, FN-L19-hq-app-01)
- Making the free trial longer for a gym that already paid gives it no extra free days (Small, small fix, FN-L5-hq-app-08)
- A screen reader reads the read-log warning out again every minute (Small, small fix, FN-L9-hq-app-06)
- Moving to another page is silent for a screen reader, and the current page is shown by colour only (Small, small fix, FN-L9-hq-app-07)
- HQ ignores the bigger text setting in the computer browser (Small, medium fix, FN-L9-hq-app-10)
- If you close the install pop-up, the Install app button disappears with no hint how to install later (Small, small fix, FN-L9-hq-app-11)
- The web page switch test always says yes and never checks that switching on asks nothing (Small, small fix, FN-A8-hq-app-1-04)
- HQ plan lists export of a gym's data, but HQ only exports the list of gyms (Small, medium fix, FN-A3-inbox-3-04)
- The read-log warning vanishes when a page fails to load (Small, small fix, FN-A5-hq-app-1-02)
- The HQ journey for 3 branches gives the wrong Starter price (Small, small fix, FN-A8-hq-app-1-05)
- After a feedback reply HQ says their phone got a pop-up when it only knows the message was handed over (Small, small fix, FN-B-alerts-hq-app-a-04)
- A message to every gym shows no sign of which gyms have seen it (Small, medium fix, FN-B-alerts-hq-app-a-05)
- When the 30-day sign-in runs out, the minute check jumps to the sign-in page and throws away what you were typing (Small, small fix, FN-B-run-hq-app-a-03)
- Two HQ boxes cut a pasted value that has a space in it (Small, small fix, FN-B-switch-hq-app-04)
- Payment amounts are rounded to whole rupees, so a small gap can read as zero (Small, small fix, FN-B-truth-hq-app-a-02)
- The System page's devices and app members are counted differently from the gym list (Small, small fix, FN-B-truth-hq-app-b-04)
- 'New this week' on the Gyms tile counts gyms whose rows do not say new (Small, small fix, FN-B-truth-hq-app-b-05)

### Websites and web pages (84)

- The price decision still lists a Pro + AI pack that the product has since retired (Medium, small fix, FN-A3-inbox-4-03)
- After an update, an admin app left open cannot download the gym's data or read an Excel file until the page is reloaded, and offline it never can (Medium, small fix, FN-B-time-web-pages-01)
- No test opens the check-in poster page (Medium, small fix, FN-A8-web-pages-1-01)
- The invite link page's key words and its WhatsApp preview are never checked (Medium, small fix, FN-A8-web-pages-1-02)
- The member's pay card words are never checked (Medium, small fix, FN-A8-web-pages-1-07)
- The refunds page says AI credits for a failed task come back automatically, but they are asked back only once and can be lost (Medium, small fix, FN-L5-web-pages-01)
- One smart app link 'everywhere', but the check-in poster page still tells iPhone users something different (Medium, small fix, FN-A3-notes-claude-2-03)
- Member website says free with no limit, while a paid plan for the watch app and calculators is built and waiting (Medium, small fix, FN-A3-website-2-04)
- No test checks the gym-server relay's no-run safety headers (Medium, small fix, FN-A8-web-pages-1-03)
- No test checks a shared desk computer keeps no gym copy after sign-out (Medium, small fix, FN-A8-web-pages-1-05)
- The desk's payment-link messages are never checked on screen (Medium, small fix, FN-A8-web-pages-1-06)
- AI column matching for staff, an ended sign-in and a used-up day is checked only as a status code (Medium, small fix, FN-A8-web-pages-3-03)
- Browser alerts are tested only for an owner on the path where everything works (Medium, small fix, FN-A8-web-pages-3-05)
- A gym that cannot take new enquiries still shows 'Ask a question' and the AI helper on its web page (Medium, small fix, FN-B-switch-web-pages-01)
- A free plan with online pay on says 'Pay ₹0 now', then says online payment is broken (Medium, small fix, FN-B-truth-web-pages-b-01)
- Every public contact path ends at one person, with a 48-hour complaint promise and no cover when he is away (Medium, small fix, FN-L14-web-pages-02)
- A gym's public web page shows its join code, so anyone can join that gym's member app (Medium, medium fix, FN-L3-web-pages-02)
- The bring-a-friend page takes a stranger's name and number with no link to the privacy notice and no age line (Medium, small fix, FN-L4-web-pages-03)
- The privacy notice changed three times after 10 Nov, but the apps told nobody (Medium, small fix, FN-L4-web-pages-p2-03)
- Website says free messages go 'to everyone' and reach 'every member's app inbox', but only members who have joined in the app get them (Medium, small fix, FN-A3-website-1-05)
- The switching offer in the price plan (pay nothing until the old software's year ends) is nowhere on the website (Medium, small fix, FN-A3-inbox-4-04)
- The founding-gym box still says 'When the AI Assistant comes', while the same page and the About page say it is here (Medium, small fix, FN-A3-website-1-06)
- No test checks the admin app moves to a new version and drops the old files (Medium, medium fix, FN-A8-web-pages-1-04)
- A web page visitor is told the gym will call them, but the gym may never hear of the question (Medium, small fix, FN-B-alerts-web-pages-a-02)
- When the AI helper's answer fails to save, the owner never sees what the visitor was told (Medium, small fix, FN-B-alerts-web-pages-b-01)
- Leaving a number in the AI helper makes a second enquiry for a person the gym already has (Medium, medium fix, FN-B-alerts-web-pages-b-02)
- A visitor who chats again after their enquiry was closed is filed under the closed enquiry and the bell calls it done (Medium, small fix, FN-B-alerts-web-pages-b-03)
- The admin app's offline copy opens only when the internet is fully gone, not on a weak line or a server fault (Medium, small fix, FN-B-run-web-pages-a-02)
- The gym-owner site offers to come to any gym and set it up in person, with no area or limit (Medium, small fix, FN-L14-web-pages-01)
- The AI helper's 'leave your number' box also takes anyone's mobile number without checking it (Medium, medium fix, FN-L19-web-pages-01)
- A stranger can spend a gym's AI credits and fill its chat slots from the gym's web page (Medium, small fix, FN-L3-web-pages-01)
- The gym-owner home page says the import AI never sees member details, but it sees some of them (Medium, small fix, FN-L4-web-pages-p2-01)
- Plan-end reminders 7, 3 and 1 days before are promised for when online payments start, but nothing is built (Medium, medium fix, FN-L4-web-pages-p2-04)
- The AI Assistant help says it writes a workout plan for free, then that saving it costs 3 credits (Medium, small fix, FN-L4-web-pages-p2-05)
- The gym-owner website jumps around while it loads on a phone (Medium, small fix, FN-L7-web-pages-01)
- The per-visitor limits on gym web page forms switch off quietly when the small web store fails or is full (Medium, small fix, FN-L8-web-pages-02)
- If the answer to 'Join' is lost on a slow line, trying again makes the person check their number again and can then say the free trial is used (Medium, medium fix, FN-B-run-web-pages-a-03)
- Join page says money comes back if an online payment fails, but nothing in the product sends it back (Medium, small fix, FN-A3-website-2-06)
- The invite page always says "You pay at the gym desk", even when the gym takes join payments online (Medium, small fix, FN-A5-web-pages-1-01)
- When MettleUp's gym server is down, a gym's web page says the gym may have taken its page down (Medium, small fix, FN-B-run-web-pages-a-01)
- A second question to the gym from the same number replaces the first one, and a resend alerts the staff twice (Medium, small fix, FN-B-run-web-pages-a-04)
- If the public websites, join pages or gym pages break, MettleUp hears it only from gyms (Medium, medium fix, FN-B-run-web-pages-a-07)
- A gym's web page stays up for good after the gym stops using MettleUp, showing old prices and 'Open now' (Medium, medium fix, FN-B-time-web-pages-02)
- The join form and the gym page's question and AI boxes say 'Only this gym sees' your details, but others do too (Medium, small fix, FN-B-words-web-pages-02)
- The two marketing sites fetch their fonts from Google, but the privacy notice says our websites share nothing and never names this (Medium, small fix, FN-L12-web-pages-01)
- The gym-owner site, the member site and every gym web page load their letters from Google, but the privacy notice says our websites send nothing out (Medium, small fix, FN-L4-web-pages-01)
- The privacy notice says a web page may remember only your light or dark choice, but the gym page keeps your chat for 90 days on the device (Medium, small fix, FN-L4-web-pages-p2-02)
- The AI helper on gym web pages spends MettleUp's AI money without counting it anywhere (Medium, small fix, FN-L8-web-pages-01)
- The feature list says both marketing websites are behind a switch, but they have been public since 22 October (Small, small fix, FN-H5-web-pages-01)
- On the gym-owner website the colour dots and the source numbers are too small to tap easily (Small, small fix, FN-L9-web-pages-03)
- The demo form, the join page and the friend page wait for ever on a stuck line (Small, small fix, FN-B-run-web-pages-a-05)
- How long the update notes are kept is never tested (Small, small fix, FN-A8-web-pages-2-04)
- The update screen promises up to 5 new lines, but the app keeps only 3 (Small, small fix, FN-A8-web-pages-2-05)
- The help box's daily message limit is never tested (Small, small fix, FN-A8-web-pages-2-08)
- The daily limits on feedback, bring-a-friend and online join restart every morning at 05:30, not 24 hours later (Small, small fix, FN-A5-web-pages-2-01)
- No test keeps the delete-account page's backup promise in step with the privacy notice (Small, small fix, FN-A8-web-pages-1-08)
- MettleUp's messages in the bell are never tested for staff, for two gyms, or at the 120-day edge (Small, small fix, FN-A8-web-pages-3-02)
- Most of the AI Assistant's refusal words are never checked (Small, small fix, FN-A8-web-pages-3-04)
- MettleUp cannot see how many people visit the websites or gym pages, or how the AI helper does (Small, medium fix, FN-B-run-web-pages-a-08)
- No test ever opens the member website (Small, small fix, FN-L16-web-pages-01)
- Seven pictures sit on the public websites that no page shows (Small, small fix, FN-L16-web-pages-02)
- The member website's main picture takes 3 seconds to show on slow 4G (Small, small fix, FN-L7-web-pages-02)
- The gym invite page shifts after it opens and is the heaviest public page (Small, small fix, FN-L7-web-pages-03)
- On a gym's web page the keyboard focus ring is drawn in the gym's own colour, so it disappears on the gym-coloured signboard and bottom bar (Small, small fix, FN-L9-web-pages-02)
- A gym alert that arrived with the admin app closed stays on the phone or computer after someone has dealt with it (Small, small fix, FN-B-alerts-web-pages-a-01)
- The gym's page, its join form and the page editor each count the plans differently (Small, small fix, FN-B-truth-web-pages-b-03)
- The About page calls the gym's app a 'desk app', while every other page calls it the admin app (Small, small fix, FN-B-words-web-pages-03)
- The admin app's offline copy uses a hand-typed list of 'not the admin app' pages, and it already misses the get-the-app page (Small, small fix, FN-L16-web-pages-03)
- The About page says free credits end at the end of each month, but the 20 starter credits never end (Small, small fix, FN-L5-web-pages-02)
- After a test-mode payment the join page just says Paid with the amount, with no word that no real money moved (Small, small fix, FN-L5-web-pages-03)
- The friend invite page is never tested for a member with no first name (Small, small fix, FN-A8-web-pages-2-01)
- The join page keeps the person's name and checked number in the browser tab, and the test expects it to (Small, small fix, FN-A8-web-pages-2-02)
- The join page's refusal and change messages are never seen by a test (Small, small fix, FN-A8-web-pages-2-03)
- When saving feedback fails, people see the offline words, not 'Could not save. Try again.' (Small, small fix, FN-A8-web-pages-2-06)
- The get-the-app page on a computer is checked only for its blocks, not its words or QR (Small, small fix, FN-A8-web-pages-2-07)
- The join and friend pages say 'Check your internet and try again' and keep no note of why (Small, small fix, FN-B-run-web-pages-a-06)
- A badly formed form send can put a piece of a visitor's name or number into the server log (Small, small fix, FN-B-run-web-pages-b-01)
- A gym's web page left open keeps saying 'Open now' after the gym has closed for the day (Small, small fix, FN-B-time-web-pages-03)
- A price with paise shows a different amount on the gym's page than on the join form (Small, small fix, FN-B-truth-web-pages-b-02)
- One person can use up a gym's 'Report this page' allowance for the day (Small, small fix, FN-L3-web-pages-03)
- The gym's web page rounds plan prices to whole rupees, while the join page charges the exact price (Small, small fix, FN-L5-web-pages-04)
- Each visit to a gym's web page asks again whether the gym takes online payment (Small, small fix, FN-L7-web-pages-04)
- The bottom quick bar on a gym's page and on the member site can be reached with the Tab key while it is hidden off screen (Small, small fix, FN-L9-web-pages-01)
- On a tablet or small laptop, the gym's photos scroll sideways with no scroll bar or arrows, so most photos look missing (Small, small fix, FN-L9-web-pages-04)

### Server, data and messages (395)

- A member checking their number in the app is told to go back to a "page" when the message has no code (Medium, small fix, FN-A5-server-panel-worker-1-01)
- A member whose name on the gym list starts with a title, or is written surname first, never sees their plan or workout plans in the app (Medium, small fix, FN-B-switch-server-database-1-b-01)
- Once the plan lock is on, members of a gym that stopped paying still see the shop and offers, and their orders fail (Medium, medium fix, FN-B-switch-server-database-2-a-02)
- On an older member app, a member whose plan ended or who trains on a pass is told only 'Could not send' when asking a trainer (Medium, small fix, FN-B-time-server-database-3-02)
- Sign in with your phone number finds no gym for a member whose plan ended yesterday (Medium, small fix, FN-B-time-server-database-3-03)
- The backlog says the signing key is kept only on the owner's PC, but the cloud build holds it too (Medium, small fix, FN-A3-inbox-2-06)
- Wrong tries when changing a PIN lock it for only 15 minutes every time (Medium, small fix, FN-A5-server-database-2-1-01)
- What's new tells owners members get a pop-up when the gym sends a report they asked for, but the pop-up is for the gym asking (Medium, small fix, FN-A5-server-database-2-3-02)
- With paying online when joining switched on, the owner's help and the AI help still say people who join online pay at the desk, not online (Medium, small fix, FN-B-truth-server-panel-worker-a-01)
- No test ever runs a gym with hundreds of members, so slow big lists are never seen (Medium, medium fix, FN-L7-server-ci-workflows-02)
- Every admin app page load uses the shared free daily request limit, and at the limit the admin app may not open at all (Medium, small fix, FN-L8-server-panel-worker-01)
- Members updating from Google Play are shown the notes of a newer version than Play gives them (Medium, medium fix, FN-H5-server-panel-worker-02)
- The release's phone-test gate is only ever tested with runs that passed (Medium, small fix, FN-A8-server-ci-workflows-1-01)
- Nothing tests that the 'skip the phone test' switch is ignored on a real release (Medium, small fix, FN-A8-server-ci-workflows-1-02)
- The release run's safety stops are never tested (Medium, small fix, FN-A8-server-ci-workflows-1-05)
- The cross-role journey runner's pass and fail rules are never tested (Medium, medium fix, FN-A8-server-ci-workflows-1-08)
- The old cloud path for app accounts is barely tested (Medium, medium fix, FN-A8-server-database-1-1-01)
- Typing a gym code by hand, a wrong code, or your own gym's code is never tested (Medium, small fix, FN-A8-server-database-1-1-07)
- Withdrawing and editing a workout plan are barely tested on the server (Medium, small fix, FN-A8-server-database-1-3-01)
- Two family members on one mobile are never tested on the member's workout plans (Medium, small fix, FN-A8-server-database-1-3-02)
- Several workout offer refusals are never tested (Medium, small fix, FN-A8-server-database-1-3-03)
- Message limits for members and bad messages are never tested (Medium, small fix, FN-A8-server-database-1-3-04)
- A member leaving a paused gym, and the desk's other saves while paused, are never tested (Medium, small fix, FN-A8-server-database-1-3-07)
- Deleting a member's account is not checked to spare the gym's records or clear the profile (Medium, small fix, FN-A8-server-database-1-4-05)
- A member who left, or changed their check-in number, is never tested against the gym's payment requests (Medium, small fix, FN-A8-server-database-2-3-05)
- No test checks that a personal-training booking hides the member's phone, fees and body numbers (Medium, small fix, FN-A8-server-database-3-1-01)
- No test proves a member's action still saves when its alert fails (Medium, small fix, FN-A8-server-database-3-2-03)
- No test checks what a member sees when the gym turns off paying in the app (Medium, small fix, FN-A8-server-panel-worker-1-05)
- The download link for phones without Google Play has no test (Medium, small fix, FN-A8-server-panel-worker-2-02)
- The public page a check-in poster opens is never tested (Medium, small fix, FN-A8-server-panel-worker-2-03)
- The cloud tests prove 'Rest is over' only on a plain Google phone with no watch, never on OPPO, Xiaomi or Samsung (Medium, medium fix, FN-B-alerts-server-ci-workflows-a-01)
- Updating the app is only ever tested from the one release just before (Medium, medium fix, FN-B-time-server-ci-workflows-01)
- Only the GitHub copy of the phone app is proven to update; the watch app and the Play copy never are (Medium, medium fix, FN-B-time-server-ci-workflows-02)
- The cross-role test never lets time pass: no plan running out, staff removed or gym paused (Medium, medium fix, FN-B-time-server-ci-workflows-03)
- No cloud test ever pairs the watch with the phone (Medium, large fix, FN-B-truth-server-ci-workflows-a-03)
- Version 0.80.0 went to Play testers without the phone conditions test (Medium, small fix, FN-H5-server-ci-workflows-04)
- Nothing in the cloud checks how fast the websites and the gym panel load on a phone (Medium, small fix, FN-L7-server-ci-workflows-01)
- A door-machine change that fails is never shown, so a lapsed member can keep getting in (Medium, medium fix, FN-B-run-server-database-2-a-01)
- Every backup sits in the same Cloudflare account that runs the service, for 7 days, and only one person can open it (Medium, medium fix, FN-L14-server-database-2-04)
- A short database hiccup turns the owner's 'payments off' switches back on (Medium, small fix, FN-L16-server-panel-worker-01)
- Anyone who knows an entry machine's serial number can pose as that machine (Medium, medium fix, FN-L3-server-hq-gate-workers-01)
- Online acceptance of the terms is live, but its own server file still says it was never switched on (Medium, small fix, FN-A3-inbox-4-05)
- Two server change files still say they are not live although the notes say both went live on 16 Nov (Medium, small fix, FN-A3-notes-claude-1-05)
- A leaderboard update sent within 15 seconds of the last one is thrown away, even with new workouts (Medium, small fix, FN-A5-server-database-2-1-02)
- In a paused gym a member cannot take back a request or clear an answer (Medium, small fix, FN-A5-server-database-2-2-02)
- A Play dry run is never tested to change nothing (Medium, small fix, FN-A8-server-ci-workflows-1-03)
- Starting a demo gym is tested only for the happy path (Medium, small fix, FN-A8-server-database-1-1-02)
- The gym's list of app members with orders and money spent is never tested on the server (Medium, small fix, FN-A8-server-database-1-1-03)
- Putting a demo gym online is tested once on the server (Medium, small fix, FN-A8-server-database-1-1-04)
- The server's checks on branding and product photos are never tested (Medium, small fix, FN-A8-server-database-1-2-03)
- Joining a gym with a wrong code, no name or when busy is never tested on the server (Medium, small fix, FN-A8-server-database-1-2-04)
- No database test reads the list of members who joined in the app (Medium, small fix, FN-A8-server-database-1-2-05)
- The pause, new gym and sign-out records in HQ's log are never checked (Medium, small fix, FN-A8-server-database-1-3-06)
- A new gym's owner code and signing a gym out are tested only half way (Medium, small fix, FN-A8-server-database-1-3-08)
- The staff sign-in history is tested only for its happy path (Medium, small fix, FN-A8-server-database-1-4-01)
- Adding a staff person is never tested with wrong input or a mobile used before (Medium, small fix, FN-A8-server-database-1-4-03)
- Nothing checks another branch's desk cannot undo the home desk's visit or see a visitor's plan (Medium, small fix, FN-A8-server-database-1-4-04)
- No server test checks a gym keeps working after its free trial ends (Medium, small fix, FN-A8-server-database-1-4-07)
- No test checks that one PIN works in every branch, or that a changed PIN stops the old one (Medium, small fix, FN-A8-server-database-2-1-02)
- A stranger who types a mobile at check-in learns whether it belongs to a gym member (Medium, small fix, FN-A8-server-database-2-2-01)
- After a restore, members who deleted their account in the last day come back, and nothing says to delete them again (Medium, small fix, FN-A8-server-database-2-3-01)
- Replying to a member's question in a paused gym, the 200-question list cap and the 180-day removal are never tested (Medium, small fix, FN-A8-server-database-2-3-03)
- The trainer-question journeys promise short surnames and owner-cannot-read, but the phone test for the newer page shows full names and says the owner reads it too (Medium, small fix, FN-A8-server-database-2-3-04)
- The refusal and done lines of Message your gym are never checked on a screen (Medium, medium fix, FN-A8-server-database-3-1-04)
- The paid-features lock switch is not tested on screen, offline, for the desk or for a member who left (Medium, medium fix, FN-A8-server-database-3-1-05)
- No test sends a gym note to a phone whose first name does not match, or with another gym's id (Medium, small fix, FN-A8-server-database-3-1-06)
- The bell list's 3-day limit and its 50-alert cap are never tested (Medium, small fix, FN-A8-server-database-3-2-01)
- The page a real alert opens is never checked for shop, check-in, plan and trainer-question alerts (Medium, small fix, FN-A8-server-database-3-2-04)
- Nothing tests that a removed trainer loses their member questions and alerts (Medium, small fix, FN-A8-server-database-3-3-04)
- Nothing checks that a pause, a sign-out, a new owner code or a new gym writes its log line (Medium, small fix, FN-A8-server-hq-gate-workers-2-01)
- The nightly run is never tested with its backup or its first clean-up failing (Medium, small fix, FN-A8-server-hq-gate-workers-3-02)
- No test checks a fee pop-up skips members not on the app, members who left, or another gym (Medium, small fix, FN-A8-server-hq-gate-workers-3-04)
- No test checks that the demo form saves nothing while the landing page is hidden (Medium, small fix, FN-A8-server-panel-worker-1-02)
- No test sends a zero, tiny or huge amount to a payment request (Medium, small fix, FN-A8-server-panel-worker-1-03)
- No test checks the safety lines on answers passed through our gym server address (Medium, small fix, FN-A8-server-panel-worker-1-07)
- The Help box's daily limit and length limit are never tested on the Help address (Medium, small fix, FN-A8-server-panel-worker-3-04)
- No test proves a crash report drops the gym code and install id (Medium, small fix, FN-A8-server-panel-worker-3-05)
- A release can skip the closed or open test on Play while the release run still shows green (Medium, small fix, FN-B-alerts-server-ci-workflows-b-01)
- Switching an automatic reminder off does not stop reminders members' phones have already set (Medium, medium fix, FN-B-alerts-server-database-1-a-02)
- A 'gym closed today' notice sent as the third message of the day reaches no member's phone as a pop-up (Medium, small fix, FN-B-alerts-server-database-2-a-01)
- Asking a member for their workout report can reach nobody, and the desk is only told it is waiting (Medium, small fix, FN-B-alerts-server-database-2-a-03)
- A pause request nobody answers stays waiting after its dates have passed (Medium, small fix, FN-B-alerts-server-database-2-b-05)
- When a phone pop-up cannot be queued, nobody is told (Medium, small fix, FN-B-run-server-database-2-b-01)
- A member pop-up that fails to send is never tried again (Medium, medium fix, FN-B-run-server-hq-gate-workers-a-01)
- After a gym server outage of over 15 minutes, 'please pay' notes and 'paid online' alerts from that time are lost for good (Medium, medium fix, FN-B-run-server-hq-gate-workers-b-02)
- When the gym server or WhatsApp is slow, the join, friend and invite pages and the sign-in code wait with no time limit (Medium, small fix, FN-B-run-server-panel-worker-a-01)
- Nobody can tell how many people open a gym's invite, friend or join link, or how many then join (Medium, small fix, FN-B-run-server-panel-worker-a-05)
- New members can still join a gym that MettleUp has paused (Medium, small fix, FN-B-switch-server-database-1-a-01)
- While MettleUp has paused a gym, its desk can still add body measurements, diet plans and member photos, and members still get pop-ups for them (Medium, small fix, FN-B-switch-server-database-2-a-01)
- A member with no running paid plan can still send a question straight to a named trainer (Medium, small fix, FN-B-switch-server-database-3-a-02)
- Removing a trainer leaves their booked personal-training classes in place but hidden (Medium, small fix, FN-B-switch-server-database-3-a-03)
- Check-in numbers typed before the 3 Nov fix stay linked though the desk never checked them (Medium, small fix, FN-B-time-server-database-2-02)
- A help question sent from an older member app can get a team reply the member never sees, while HQ says they will see it (Medium, small fix, FN-B-time-server-panel-worker-01)
- Database changes are only ever tested on an empty database (Medium, medium fix, FN-B-truth-server-ci-workflows-a-01)
- No cloud test checks that a number shown in several places is the same everywhere (Medium, medium fix, FN-B-truth-server-ci-workflows-b-01)
- A gym with under 8 weeks of check-ins is shown as busy too easily (Medium, small fix, FN-B-truth-server-database-2-b-01)
- A member who joins today brings 30 days of workouts done before joining onto the gym's leaderboard and challenge (Medium, small fix, FN-B-truth-server-database-2-b-02)
- In a check-in challenge a member who comes daily can see 0 visits with no reason (Medium, medium fix, FN-B-truth-server-database-3-b-02)
- Each challenge prize the owner gives sends its own winner message, so from the 3rd winner there is no pop-up and the prizes use up the day's 10 messages (Medium, small fix, FN-B-words-server-database-2-01)
- Tapping the pop-up for a pause or renew answer, a report request or a workout offer opens the shop, not the card it is about (Medium, small fix, FN-B-words-server-database-2-02)
- The data agreement and privacy notice say our web server only passes requests on, but it keeps each gym's payment keys and payment records (Medium, small fix, FN-B-words-server-panel-worker-01)
- The real-phone robot check has never run after a release (Medium, small fix, FN-H5-server-ci-workflows-02)
- Records taken back by Undo this import stay on our server in full, for ever (Medium, medium fix, FN-L14-server-database-1-02)
- If the Firebase key stops working, every phone pop-up is lost quietly and MettleUp is never told (Medium, small fix, FN-L14-server-database-2-05)
- A member's question to one trainer who never answers quietly closes after 14 days, and the owner never sees it (Medium, small fix, FN-L14-server-database-2-07)
- A gym that stops paying and never asks to leave keeps all its members' details on our server for ever (Medium, medium fix, FN-L14-server-database-2-08)
- A member's question sent to one trainer rings only that trainer, so it can wait unseen if the trainer is away or removed (Medium, small fix, FN-L14-server-database-3-02)
- If the nightly clean-up or billing job fails, nobody is told (Medium, small fix, FN-L14-server-hq-gate-workers-04)
- The nightly clean-up, the 10-minute payment check and the help AI's monthly limit fail with only a hidden log line (Medium, medium fix, FN-L14-server-panel-worker-03)
- Outside code is fetched fresh, by a moving version, right next to MettleUp's most powerful keys (Medium, small fix, FN-L3-server-ci-workflows-01)
- A gym's join code can be found by trying codes, and then anyone can join that gym's member app (Medium, small fix, FN-L3-server-database-1-01)
- One person can block 'Start demo' for everyone, or block a gym's members from joining, for an hour (Medium, small fix, FN-L3-server-database-1-03)
- Every cloud phone test leaves made-up gyms on the live server for ever, with real-looking mobile numbers in them (Medium, medium fix, FN-L4-server-ci-workflows-01)
- Door entry machines are not in the privacy notice, and every door punch is kept for ever (Medium, small fix, FN-L4-server-database-2-04)
- The direct-read record would keep the full query text, with any names or numbers in it, for 2 years and refuse every erase (Medium, small fix, FN-L4-server-database-3-04)
- The door machine link would send members' names and every door punch unencrypted, while the privacy notice says data travels encrypted (Medium, medium fix, FN-L4-server-hq-gate-workers-01)
- The nightly backup is a full readable copy of every gym, and a look at it is never recorded (Medium, medium fix, FN-L4-server-hq-gate-workers-03)
- The privacy notice says MettleUp tells members and the Board about a data leak, but the leak plan leaves both to the gym and HQ cannot reach members (Medium, small fix, FN-L4-server-hq-gate-workers-04)
- Only Razorpay's open and cancelled answers are ever checked against the real payment company (Medium, medium fix, FN-L5-server-ci-workflows-01)
- A shop order marked Collected by mistake can never be undone, and a returned item cannot be recorded (Medium, medium fix, FN-L5-server-database-1-03)
- Once a gym is read-only for not paying MettleUp, money the desk already took and printed a receipt for cannot be saved (Medium, small fix, FN-L5-server-database-2-03)
- Phone app start time and the workout screen with a long history are never timed (Medium, medium fix, FN-L7-server-ci-workflows-03)
- A gym message to a big gym reaches members' phones only about 30 a minute, and a busy hour can drop pop-ups (Medium, medium fix, FN-L7-server-hq-gate-workers-01)
- Receipt change history and old sign-ins are never cleared, so they grow for ever (Medium, small fix, FN-L8-server-database-1-02)
- Every door-machine punch is kept on the gym server for ever (Medium, small fix, FN-L8-server-database-2-02)
- On a busy day gym-message pop-ups over 6 hours late are quietly dropped, and nobody is told (Medium, small fix, FN-L8-server-database-2-03)
- AI questions from the owner and staff cost the gym nothing and have no total limit per gym (Medium, small fix, FN-L8-server-database-3-01)
- Old open shop orders drop off the gym's order list (Medium, small fix, FN-A5-server-database-1-1-01)
- The owner cannot see how many phones got the pop-up for a gym message, offer or trainer reply, or why none went (Medium, medium fix, FN-B-alerts-server-database-2-b-01)
- Asking a member for their workout report leaves no record when the pop-up could not be sent to anyone (Medium, small fix, FN-B-alerts-server-database-2-b-02)
- An online plan payment missed for two days is never applied and nobody is told (Medium, small fix, FN-B-run-server-hq-gate-workers-a-02)
- A gym that has paid but is still waiting for MettleUp to confirm is cut down to basic and then read-only like a gym that never paid (Medium, small fix, FN-L14-server-database-2-02)
- A release's Play upload can be cancelled while it waits (Medium, small fix, FN-A5-server-ci-workflows-1-01)
- The Razorpay check passes on main when its keys are gone (Medium, small fix, FN-A5-server-ci-workflows-1-02)
- A change to the watch's release signing is not rehearsed before a release (Medium, small fix, FN-A5-server-ci-workflows-2-01)
- An empty daily limit box switches the gym's AI Assistant off (Medium, small fix, FN-A5-server-hq-gate-workers-3-02)
- The Razorpay check's guards against a live key are never tested (Medium, small fix, FN-A8-server-ci-workflows-1-06)
- A support sign-in code leaves no record and its limits are never tested (Medium, small fix, FN-A8-server-database-1-1-05)
- The words for four receipt refusals from the server are never tested (Medium, small fix, FN-A8-server-database-1-2-01)
- The receipt history the server keeps is never shown to the owner (Medium, medium fix, FN-A8-server-database-1-2-02)
- Importing again after an undo, and undoing one of two imports, are never tested (Medium, small fix, FN-A8-server-database-1-2-09)
- No test proves a failed member pop-up never undoes the gym's own approval, order change or report request (Medium, small fix, FN-A8-server-database-2-3-02)
- No test closes a member question after 14 days with no reply (Medium, small fix, FN-A8-server-database-3-1-07)
- Removing or giving back the trainer tick is never tested on the bell (Medium, small fix, FN-A8-server-database-3-2-06)
- Nothing tests that a friend invite at a paused gym rings nobody (Medium, small fix, FN-A8-server-database-3-3-02)
- Nothing checks that gym owners see a changed UPI ID (Medium, small fix, FN-A8-server-hq-gate-workers-1-03)
- No test checks that taking back free AI credits never takes credits the gym paid for (Medium, small fix, FN-A8-server-hq-gate-workers-3-01)
- No test checks that a payment held by a closed desk frees up after 5 minutes (Medium, small fix, FN-A8-server-panel-worker-1-04)
- No test checks that the move keeps a sign-in the new address already has (Medium, small fix, FN-A8-server-panel-worker-1-06)
- No test shows what owners and staff see when alerts cannot be switched on (Medium, small fix, FN-A8-server-panel-worker-3-02)
- The WhatsApp delivery log lines HQ relies on are barely tested (Medium, small fix, FN-A8-server-panel-worker-3-03)
- The reminder to renew the logs key can silently never come (Medium, small fix, FN-B-alerts-server-ci-workflows-b-02)
- The gym owner is not told when MettleUp opens emergency access to the gym's records (Medium, medium fix, FN-B-alerts-server-database-1-a-01)
- A workout offer set to give the days by itself can quietly not give them, with no reason shown (Medium, small fix, FN-B-alerts-server-database-1-b-01)
- The server never records how many phones a gym message's pop-up reached, and logs one that reached no phone as sent (Medium, medium fix, FN-B-alerts-server-database-2-a-02)
- An owner whose MettleUp payment is rejected or confirmed is not told (Medium, small fix, FN-B-alerts-server-database-2-a-04)
- Door-machine updates that fail are never shown to the owner (Medium, small fix, FN-B-alerts-server-database-2-b-03)
- A challenge prize given by hand keeps saying 'to give by hand' after the desk has given it (Medium, small fix, FN-B-alerts-server-database-2-b-04)
- A member question left unanswered for 14 days leaves the Member questions count but stays a to-do on the bell (Medium, small fix, FN-B-alerts-server-database-3-b-01)
- When a person already called asks again online, their old bell alerts come back next to the new one (Medium, small fix, FN-B-alerts-server-database-3-b-02)
- The server notes an alert as sent in the summary even when no browser got that summary (Medium, small fix, FN-B-alerts-server-database-3-b-03)
- A 'please pay' request for a member without the app reaches nobody, and the desk is never told (Medium, medium fix, FN-B-alerts-server-hq-gate-workers-a-01)
- A gym's plan moves down to Starter at night with no line in any log (Medium, small fix, FN-B-alerts-server-hq-gate-workers-b-01)
- A browser alert that fails to send is never tried again (Medium, medium fix, FN-B-run-server-database-3-a-02)
- A short hiccup in our small web database tells the owner the AI Assistant is not switched on yet (Medium, small fix, FN-B-run-server-panel-worker-a-02)
- Connecting a payment company by signing in can fail with no log line saying why (Medium, small fix, FN-B-run-server-panel-worker-b-01)
- The owner's MettleUp access list never shows that a delete request was opened for the gym (Medium, small fix, FN-B-switch-server-database-1-a-03)
- The gym web page chat takes AI credits even while charging for AI answers is switched off (Medium, small fix, FN-B-switch-server-panel-worker-01)
- A device signed in to the admin app stays signed in for ever, even if nobody opens it for months (Medium, small fix, FN-B-time-server-database-1-01)
- Running an older database step again quietly undoes a later one, and can break Create my gym (Medium, medium fix, FN-B-time-server-database-1-02)
- When the new bell went live, gyms without browser alerts saw their old alerts come back as new (Medium, small fix, FN-B-time-server-database-3-01)
- A timed message to everyone can show 'Seen by' more people than it went to (Medium, small fix, FN-B-truth-server-database-1-b-02)
- The web page AI helper charges the gym for answers it holds back as 'I will ask the gym' (Medium, small fix, FN-B-truth-server-database-3-a-01)
- A to-do alert that is never handled quietly leaves the bell after 30 days (Medium, small fix, FN-B-truth-server-database-3-b-01)
- When someone pays online while joining, the gym gets no 'paid online' alert, and the saved request still says they pay at the desk (Medium, small fix, FN-B-truth-server-hq-gate-workers-a-01)
- HQ shows a trial gym's AI Assistant limit as 50 a day while it really gets 20, and saving only the minutes raises it to 50 (Medium, small fix, FN-B-truth-server-hq-gate-workers-a-02)
- The gym's web page lists personal training packs as membership fees, but the join page does not offer them (Medium, small fix, FN-B-truth-server-panel-worker-b-01)
- The outage alarm reaches only you, and nothing says so if the alarm itself stops (Medium, small fix, FN-L14-server-ci-workflows-01)
- Outage notes, including a failed backup or a refused logs key, are posted where anyone can read them (Medium, small fix, FN-L14-server-ci-workflows-02)
- One personal code-store account holds every release, store upload, WhatsApp and alarm path, with no written way back if it is lost (Medium, small fix, FN-L14-server-ci-workflows-03)
- Deleting a gym also deletes its proof that it accepted the terms and the data agreement (Medium, small fix, FN-L14-server-database-1-01)
- If the nightly clean-up stops, nobody is told, and the log-deletion promises quietly break (Medium, small fix, FN-L14-server-database-1-03)
- Help on sending messages never says there is a limit of 10 a day, no pop-up from the 3rd, and one offer a day (Medium, small fix, FN-L14-server-database-2-06)
- A plan payment whose confirmation from the payment company is lost is checked again for only 48 hours, then forgotten (Medium, small fix, FN-L14-server-database-3-03)
- One secret signs phone checks, AI credit spending, join payments and web page chats, with no way to change it without breaking all of them (Medium, medium fix, FN-L14-server-database-3-04)
- Leads, help questions and replies, AI limits and the online-payment settings have no backup and no restore steps (Medium, medium fix, FN-L14-server-hq-gate-workers-02)
- When a bell alert or a member pop-up cannot be made, nobody ever finds out (Medium, small fix, FN-L16-server-database-3-01)
- Two payment failures are dropped without a single log line (Medium, small fix, FN-L16-server-panel-worker-02)
- The plan 'Pay online' step and the invite page fail with nothing logged, and the pay step has no test (Medium, small fix, FN-L16-server-panel-worker-03)
- The 'who is this sign-in' check is written twice with different rules (Medium, medium fix, FN-L16-server-panel-worker-04)
- One person can fill a gym's daily friend-enquiry allowance with fake leads (Medium, small fix, FN-L19-server-database-2-01)
- Anyone with a member's friend link can put a stranger's number in as an enquiry, and the gym then contacts someone who never asked (Medium, medium fix, FN-L19-server-panel-worker-01)
- Nothing warns about known security holes in the libraries the apps use (Medium, small fix, FN-L3-server-ci-workflows-02)
- The nightly backup copies the WhatsApp number-check secret and every PIN fingerprint into a plain store for 7 days (Medium, small fix, FN-L3-server-database-2-01)
- Anyone can send a question from a gym's web page in another person's name and mobile number (Medium, medium fix, FN-L3-server-database-3-01)
- Reads of gym data made with the server's master app key are never recorded (Medium, medium fix, FN-L3-server-database-3-03)
- An HQ sign-in lasts 30 days and cannot be ended from another device (Medium, small fix, FN-L3-server-hq-gate-workers-02)
- The 5-wrong-tries limit on WhatsApp sign-in codes can be beaten by sending many guesses at the same moment (Medium, small fix, FN-L3-server-panel-worker-02)
- A removed staff member's name, mobile number and device sign-in history stay on the server for good (Medium, small fix, FN-L4-server-database-1-04)
- Numbers that started a free trial are kept in plain form for ever, even after the gym is deleted (Medium, small fix, FN-L4-server-database-2-02)
- The direct-read record stops writing looks after 20,000 in all, though owners are told every look is recorded (Medium, small fix, FN-L4-server-database-3-05)
- Buying a MettleUp plan online sends the gym owner's name and mobile to a payment company the privacy notice does not name for this (Medium, small fix, FN-L4-server-hq-gate-workers-02)
- Making the free trial longer for one branch leaves the other branches' trial ending on the old day (Medium, small fix, FN-L5-server-database-1-01)
- HQ can cut a new gym's free trial to less than the 3 months the website and terms promise (Medium, small fix, FN-L5-server-database-1-02)
- A UPI or bank payment to MettleUp that is confirmed by mistake, bounced or paid back can never be undone or marked refunded (Medium, medium fix, FN-L5-server-database-2-01)
- An owner whose number already had a free trial gets a new gym with no free months and is never told (Medium, small fix, FN-L5-server-database-2-02)
- Moving from Starter up to Pro costs more than the price difference (Medium, small fix, FN-L5-server-database-3-03)
- A gym still on its trial can be told the AI Assistant is resting for the month although it has AI credits (Medium, small fix, FN-L5-server-panel-worker-02)
- Signing out of HQ and the 30-day sign-in end are never tested (Medium, small fix, FN-A8-server-hq-gate-workers-3-03)
- The address that hands Play Console each release bundle has no test at all (Medium, small fix, FN-A8-server-panel-worker-2-01)
- The nightly backup can catch a payment without its receipt, though it says it never can (Medium, small fix, FN-A5-server-database-2-3-01)
- Deleting a gym leaves the photos of its web page behind (Medium, small fix, FN-A5-server-hq-gate-workers-2-01)
- If the nightly backup is switched off, the outage alarm stays quiet for good (Medium, small fix, FN-B-run-server-ci-workflows-a-01)
- Seven full uncompressed backup copies will fill the free Cloudflare store, and the backup then stops (Medium, medium fix, FN-L8-server-database-2-01)
- The nightly backup will stop fitting in its free store long before the gym database is full (Medium, medium fix, FN-L8-server-hq-gate-workers-01)
- No automatic check that the buttons named in help exist on the screens (Medium, medium fix, FN-A3-help-07)
- AI credits can be given back for a task that worked (Medium, small fix, FN-A5-server-database-3-1-02)
- The HQ Log records a feedback or lead change even when it was refused (Medium, small fix, FN-A5-server-hq-gate-workers-1-01)
- A lead sent from the member app shows an empty call link and no word where it came from (Medium, small fix, FN-A5-server-hq-gate-workers-1-02)
- The two WhatsApp runs have no test at all, including the 'never print the token' promise (Medium, small fix, FN-A8-server-ci-workflows-1-07)
- The nightly clean-up test never checks old support-access windows or delete requests (Medium, small fix, FN-A8-server-database-1-4-02)
- The nightly test-gym clean-up is tested on one gym row only (Medium, small fix, FN-A8-server-database-3-1-02)
- Changing a lead or a feedback message in HQ is never tested (Medium, small fix, FN-A8-server-hq-gate-workers-1-01)
- The 12-month promise to demo leads is tested without a Demo lead (Medium, small fix, FN-A8-server-hq-gate-workers-1-02)
- Making a gym for a lead is never tested through HQ (Medium, small fix, FN-A8-server-hq-gate-workers-2-02)
- The app server's nightly clean-up run is never tested as a whole (Medium, small fix, FN-A8-server-panel-worker-3-01)
- The nightly deletion of old AI Assistant requests leaves no line in the HQ log (Medium, small fix, FN-B-alerts-server-hq-gate-workers-b-03)
- When the weekly free-limit check fails or is not set up, HQ keeps showing the old result (Medium, small fix, FN-B-alerts-server-hq-gate-workers-b-04)
- Web page chats are deleted after 90 days only by chance, so visitors' chats and numbers can stay for good (Medium, small fix, FN-B-run-server-database-3-a-01)
- The backup and read-record health checks say 'all fine' when their own record cannot be read (Medium, small fix, FN-B-run-server-hq-gate-workers-b-01)
- Running an older server change file again quietly undoes later security fixes (Medium, small fix, FN-B-time-server-database-2-05)
- HQ's member count for a gym includes members the gym has archived (Medium, small fix, FN-B-truth-server-database-1-a-01)
- HQ opens for one Google account only, and there is no written way back in if it is lost (Medium, small fix, FN-L14-server-hq-gate-workers-03)
- Nobody can tell from the code which changes to the small web database are live (Medium, small fix, FN-L14-server-panel-worker-02)
- The small web database is left out of the written backup plan (Medium, small fix, FN-L14-server-panel-worker-04)
- No written list of the about 17 secret keys this server needs, what each breaks, or how to replace one (Medium, small fix, FN-L14-server-panel-worker-05)
- The fix for a bad emulator download reached only 2 of the 8 cloud phone runs (Medium, small fix, FN-L16-server-ci-workflows-01)
- Five server change files still say they are not live, though the live database has all of them (Medium, small fix, FN-L16-server-database-2-01)
- The test database has a plan-reading change the live server never got, so its known failure on live is normal (Medium, small fix, FN-L16-server-database-2-02)
- The direct-read health check answers 'all fine' when it cannot read its own record (Medium, small fix, FN-L16-server-hq-gate-workers-01)
- An outsider can fill the day's crash reports and plant made-up crash notes that our coding sessions later read (Medium, medium fix, FN-L19-server-panel-worker-02)
- Anyone can store any number of pictures on our server for free through a demo gym (Medium, medium fix, FN-L3-server-database-1-02)
- The database test that says no app can read a table checks HQ and entry machine tables while they are empty (Medium, small fix, FN-L3-server-hq-gate-workers-04)
- Records of what a gym paid MettleUp are erased when the gym is deleted, though the notice says they are kept as tax law needs (Medium, small fix, FN-L4-server-database-2-05)
- Mobile numbers from the join form and web page questions are kept for ever, only to count one day's tries (Medium, small fix, FN-L4-server-database-3-03)
- The database check never looks for missing indexes, so 23 unindexed links passed and new ones will too (Medium, small fix, FN-L7-server-ci-workflows-05)
- Every minute, the online-payment alert reads every online payment any gym ever got (Medium, small fix, FN-L7-server-hq-gate-workers-02)
- Cloud test runs keep about 401 GB of build files, free only while the code stays public (Medium, small fix, FN-L8-server-ci-workflows-01)
- Gym web page photos have a daily upload limit but no total per gym, and removed photos are never deleted (Medium, medium fix, FN-L8-server-database-3-02)
- AI answer charging and pay-online-when-joining are listed as switched off, but both switches are on live (Small, small fix, FN-H5-server-database-3-01)
- 'A day' means three different things in the server's daily limits (Small, small fix, FN-L16-server-panel-worker-05)
- The watch test checks nothing is left running, but never measures battery use over a workout (Small, small fix, FN-L7-server-ci-workflows-04)
- Support access records still name the support team with the old ForgeAI name (Small, small fix, FN-L12-server-database-1-01)
- The WhatsApp set-up run writes business account details into a log anyone can read (Small, small fix, FN-L3-server-ci-workflows-03)
- Taking back a workout plan is never tested as a trainer (Small, small fix, FN-A8-server-database-1-2-07)
- Check-in refusals never check that nothing was written (Small, small fix, FN-A8-server-database-1-2-10)
- The timings test never checks late-night hours of yesterday or that members cannot see who changed the hours (Small, small fix, FN-A8-server-database-2-1-04)
- Pop-up jobs are never tested for a failed job, a second job for one offer, or being cleared away (Small, small fix, FN-A8-server-database-2-1-06)
- What's new: the keep times, the 5-line limit and the broken-file rule are never tested (Small, small fix, FN-A8-server-panel-worker-2-06)
- The invite and get-app pages' own words are mostly never checked (Small, small fix, FN-A8-server-panel-worker-2-08)
- The watch app's What's new on Google Play repeats the phone's notes (Small, small fix, FN-B-truth-server-ci-workflows-a-02)
- Nine links added in the newer database lists have no index, so removing a member, a staff login or a gym reads those lists for every gym (Small, small fix, FN-L7-server-database-2-01)
- The store-picture order check is never tested to stop a wrong order going live (Small, small fix, FN-A8-server-ci-workflows-1-04)
- The two ratchets on every push have no test (Small, small fix, FN-A8-server-ci-workflows-1-11)
- The watch build run's cancel, re-run and keep-pictures rules are never tested (Small, small fix, FN-A8-server-ci-workflows-1-14)
- The server limits on product price and stock are never tested (Small, small fix, FN-A8-server-database-1-1-06)
- Some My membership card words are never tested (Small, small fix, FN-A8-server-database-1-2-06)
- Cancelling a membership as the owner and marking a session on a cancelled pack are never tried (Small, small fix, FN-A8-server-database-1-2-08)
- Support access limits and its closing log row are never checked (Small, small fix, FN-A8-server-database-1-3-10)
- Renaming a business or a gym is never read back (Small, small fix, FN-A8-server-database-1-4-06)
- No test shows the desk which members are hidden from the leaderboard (Small, small fix, FN-A8-server-database-2-1-05)
- No test checks a diet plan comes back when a membership is renewed (Small, small fix, FN-A8-server-database-2-1-07)
- No test checks a sent report is kept 30 days from sending (Small, small fix, FN-A8-server-database-2-2-02)
- Taken-back messages and a staff try at sending are not checked against the daily limit (Small, small fix, FN-A8-server-database-2-2-04)
- A pass member's check-in is tested with one scan only (Small, small fix, FN-A8-server-database-2-2-05)
- Find my gym's not-found, too-many and pass lines are never checked (Small, small fix, FN-A8-server-database-3-1-08)
- The 30-day clean-up of old alerts is never tested (Small, small fix, FN-A8-server-database-3-2-02)
- The online-payment alert call's count and its 100-item limit are never tested (Small, small fix, FN-A8-server-database-3-2-05)
- No test checks a plan request that is no longer waiting makes no alert (Small, small fix, FN-A8-server-database-3-2-07)
- The browser alert run is never checked for phone numbers or for the 8-day summary limit (Small, small fix, FN-A8-server-database-3-3-05)
- Phone sign-in is never tested after a change to the person's plan, pass or Trainer tick (Small, small fix, FN-A8-server-database-3-3-06)
- The phone test expects a second pop-up for a corrected reply, while the journey says none (Small, small fix, FN-A8-server-hq-gate-workers-2-06)
- Nothing checks that HQ's log keeps only the length of a reply (Small, small fix, FN-A8-server-hq-gate-workers-2-07)
- The backup's real part size and its public status door are only half tested (Small, small fix, FN-A8-server-hq-gate-workers-3-05)
- No test sends a live-update connection through our gym server address (Small, small fix, FN-A8-server-panel-worker-1-08)
- No test checks the owner key stays out of the AI Assistant request and logs (Small, small fix, FN-A8-server-panel-worker-1-09)
- A retry after a failed save, and the daily feedback limit lifting, are never tested (Small, small fix, FN-A8-server-panel-worker-2-10)
- A demo request from a member's shared link is never tested on the page (Small, small fix, FN-A8-server-panel-worker-3-06)
- A reminder the owner never touched follows whatever each app version thinks the default is (Small, small fix, FN-B-alerts-server-database-1-a-03)
- A workout or diet plan sent to a whole membership plan pops up only for members on that plan on the day it is saved (Small, medium fix, FN-B-alerts-server-database-3-a-01)
- The gym's reply to a member message shows its words in the pop-up on a locked phone (Small, small fix, FN-B-alerts-server-database-3-a-02)
- If the team's reply pop-up fails to send, the member never gets one (Small, small fix, FN-B-alerts-server-hq-gate-workers-a-02)
- Gym messages pop up at once only while the admin app uses our own server address (Small, small fix, FN-B-alerts-server-panel-worker-a-01)
- MettleUp cannot see how online joining, free trials and gym web pages work out (Small, medium fix, FN-B-run-server-database-3-a-04)
- Automatic reminder switches can still be changed, and keep reaching members, while a gym is paused (Small, small fix, FN-B-switch-server-database-1-a-02)
- A new challenge pops up on every member's phone even when the gym already sent two messages that day (Small, small fix, FN-B-switch-server-database-2-a-03)
- The new-feature dots test makes a fresh install look like an old one, so it never checks that a brand-new member sees no dots (Small, small fix, FN-B-time-server-ci-workflows-04)
- A member who joins today sees up to two weeks of the gym's older messages marked unread (Small, small fix, FN-B-time-server-database-1-03)
- A member the owner hid from the leaderboard shows on it again after leaving and coming back (Small, small fix, FN-B-time-server-database-2-04)
- Two payment requests for the same due or join request can be made if two asks land at the same moment (Small, small fix, FN-B-truth-server-panel-worker-a-02)
- The WhatsApp "you are verified" reply is always in English, even after the person used the Hinglish page (Small, small fix, FN-B-words-server-panel-worker-03)
- The Hinglish WhatsApp message says "wapas jao", a casual form that reads rude to many older gym owners (Small, small fix, FN-B-words-server-panel-worker-04)
- The app file download can land on a GitHub page under the old ForgeAI name instead of the file (Small, small fix, FN-B-words-server-panel-worker-07)
- Once the iPhone app is out, a gym's invite link will send iPhones to the App Store and drop the gym (Small, small fix, FN-B-words-server-panel-worker-08)
- The HQ and door-machine set-up notes still describe things as not done that are done (Small, small fix, FN-H5-server-hq-gate-workers-02)
- A gym's sales offers pop up on the same notification line as its messages and replies (Small, small fix, FN-L12-server-hq-gate-workers-01)
- One test file never runs, and the website gate has no test (Small, small fix, FN-L16-server-ci-workflows-06)
- A 'change my name' door on the server is open to anyone with a member key, but no app uses it (Small, small fix, FN-L16-server-database-1-01)
- The oldest account link (make a gym from a sign-in, join by code, the phone's summary guard) is never run by any test (Small, small fix, FN-L16-server-database-1-02)
- If the membership look fails, birthday and joined-day reminders quietly stop, with nothing logged (Small, small fix, FN-L16-server-database-1-03)
- When a phone pop-up cannot be queued, the only trace is a database warning nobody reads (Small, small fix, FN-L16-server-database-2-03)
- An unused server door for counting web page visitors' AI questions is still open (Small, small fix, FN-L16-server-database-3-02)
- The 'today' rule is typed out by hand about 30 times, and one daily limit uses a different day (Small, small fix, FN-L16-server-database-3-03)
- No test proves a member cannot check or pay another member's payment, or that a desk sees only its own gym's payment settings (Small, small fix, FN-L3-server-panel-worker-03)
- The server does not check the price of a shop choice such as a size or flavour (Small, small fix, FN-L5-server-database-1-05)
- Each check-in, membership look and receipt save reads every membership or payment the gym ever had (Small, small fix, FN-L7-server-database-1-01)
- Opening the leaderboard adds up the whole gym's last 30 days about eight times (Small, small fix, FN-L7-server-database-2-02)
- Each feedback or help message reads the whole feedback table to check the daily limit (Small, small fix, FN-L7-server-panel-worker-02)
- The database job's failure path is never tested (Small, small fix, FN-A8-server-ci-workflows-1-13)
- Nothing checks the terms acceptance survives the owner who accepted being removed (Small, small fix, FN-A8-server-database-1-4-08)
- Declining a check-in number or a plan request is barely tested (Small, small fix, FN-A8-server-database-2-2-03)
- Trainer rules for a removed person, another trainer's member and moving a member are untested (Small, small fix, FN-A8-server-database-2-2-06)
- The desk journey expects a question sent to the front desk, but the server refuses that (Small, small fix, FN-A8-server-database-3-1-03)
- The gym delete request is never tested when it fails to send or for a gym not online (Small, small fix, FN-A8-server-hq-gate-workers-2-08)
- The limit of 30 friend enquiries a day for one gym is never tested (Small, small fix, FN-A8-server-panel-worker-2-04)
- Nothing checks a new gym name or logo reaches the invite link within 5 minutes (Small, small fix, FN-A8-server-panel-worker-2-05)
- The alerts key address has no time limit when HQ is slow, and no test of it (Small, small fix, FN-A8-server-panel-worker-3-07)
- A part that keeps going down and up opens a fresh outage note and email each time (Small, small fix, FN-B-alerts-server-ci-workflows-a-02)
- A gym with many staff browsers can lose the daily summary on some of them (Small, small fix, FN-B-alerts-server-hq-gate-workers-a-03)
- Forgot PIN: pressing Save again after a lost answer says the code is no good, though the new PIN was set (Small, small fix, FN-B-run-server-database-2-a-02)
- Plan-end reminders are used up before any message goes, and a missed night skips one (Small, small fix, FN-B-run-server-database-3-a-03)
- A MettleUp message to every gym never reaches staff whose admin app is closed (Small, medium fix, FN-B-switch-server-hq-gate-workers-01)
- While MettleUp has paused a gym, its door machine's entries are thrown away for good (Small, small fix, FN-B-switch-server-hq-gate-workers-02)
- Speaking to the AI Assistant still works when its AI is paused or resting for the month (Small, small fix, FN-B-switch-server-panel-worker-02)
- A workout-offer day stays counted after the gym takes back the check-in that proved it (Small, small fix, FN-B-truth-server-database-1-a-03)
- HQ's AI cost for a gym's day is priced by whichever AI answered last that day (Small, small fix, FN-B-truth-server-hq-gate-workers-a-03)
- A gym still on its first owner login sees "by Owner (old owner key)" next to a reward it gave (Small, small fix, FN-B-words-server-database-1-01)
- In Hinglish, every bell line and closed-app browser alert still comes in English (Small, medium fix, FN-B-words-server-database-3-01)
- Two alert words are not quite true: credit alerts are titled news from your members, and the at-once list leaves some out (Small, small fix, FN-B-words-server-database-3-02)
- When paying MettleUp online cannot work, the owner is told to try again in a minute or check the internet (Small, small fix, FN-B-words-server-hq-gate-workers-01)
- A look at a gym's payment records straight in our web database leaves no record (Small, medium fix, FN-B-words-server-panel-worker-02)
- Owners are told "The gym server could not be reached", a phrase from inside MettleUp (Small, small fix, FN-B-words-server-panel-worker-05)
- A gym owner asking for a demo for the first time can be told he has sent too many demo requests (Small, small fix, FN-B-words-server-panel-worker-06)
- Two cloud runs on main are missing from the feature map (Small, small fix, FN-H5-server-ci-workflows-03)
- A retired free-plan limits switch is still kept on the live database and listed as a feature (Small, small fix, FN-H5-server-database-1-01)
- The release checks print which Android version the app targets but never stop a release that Google Play would refuse (Small, small fix, FN-L12-server-ci-workflows-01)
- After every branch of a business is deleted, the business's name stays on our server (Small, small fix, FN-L14-server-database-1-04)
- Plan receipts can go out with no business name, and nothing warns that the setting is empty (Small, small fix, FN-L14-server-database-3-05)
- The key behind staff browser alerts is kept in one place only, and HQ says it must never change (Small, small fix, FN-L14-server-hq-gate-workers-05)
- Words typed into a hand-started cloud run are pasted straight into its commands (Small, small fix, FN-L19-server-ci-workflows-01)
- Some cloud runs do not limit what their built-in access pass may do (Small, small fix, FN-L19-server-ci-workflows-02)
- Any desk can skip the 'more than this member owes' check by marking a receipt as taken offline (Small, small fix, FN-L19-server-database-2-03)
- Giving back a counted AI question needs no proof that our web server asked (Small, small fix, FN-L19-server-database-3-01)
- Anyone with the public app key can list every gym's web page photos, unpublished drafts included (Small, small fix, FN-L3-server-database-3-02)
- No test proves another gym cannot cancel this gym's personal-training booking, edit its trainer page, or turn off its browser alerts (Small, small fix, FN-L3-server-database-3-04)
- Anyone on the internet can make HQ run its phone pop-up job (Small, small fix, FN-L3-server-hq-gate-workers-03)
- HQ can save a gym's paid plan with a paid-until date that has already passed (Small, small fix, FN-L5-server-database-1-04)
- The desk's plan request list reads every request the gym ever had (Small, small fix, FN-L7-server-database-2-04)
- The owner's list of direct reads of their gym goes through the whole two-year record, and the gym index made for it is never used (Small, small fix, FN-L7-server-database-3-02)
- The English helper's monthly cost leaves out tries that Google still charges for (Small, small fix, FN-L8-server-hq-gate-workers-03)
- A feedback message or demo request sent again after a lost answer is saved twice (Small, small fix, FN-B-run-server-panel-worker-a-03)
- The release gate's own tests run only on release day (Small, small fix, FN-A8-server-ci-workflows-1-12)
- Half the HQ home list and gym page numbers are never checked (Small, small fix, FN-A8-server-database-1-3-05)
- The app is checked on one Node version but built and phone-tested on an older one (Small, small fix, FN-L16-server-ci-workflows-02)
- The real-phone robot check after every release shows green even when it tested nothing (Small, small fix, FN-L16-server-ci-workflows-04)
- Four hand-run picture, video and phone-condition runs have no test (Small, medium fix, FN-A8-server-ci-workflows-1-09)
- The outage alert is never tested for an issue closed by hand or a changed list (Small, small fix, FN-A8-server-ci-workflows-1-10)
- The Pro-only lock on body measurements and diet plans is never tested (Small, small fix, FN-A8-server-database-2-1-03)
- The limit of 5 owner codes an hour and the old browser key note are never tested (Small, small fix, FN-A8-server-hq-gate-workers-2-03)
- The sign-out-everywhere test accepts any count of 3 or more (Small, small fix, FN-A8-server-hq-gate-workers-2-04)
- Admin app feedback: the journey expects the gym code, the test says none is sent (Small, small fix, FN-A8-server-panel-worker-2-09)
- The cap of 2,000 crash reports a day for everyone together is never tested (Small, small fix, FN-A8-web-pages-3-01)
- Plan-end reminders are noted as made though none is sent, and nobody can see the note (Small, small fix, FN-B-alerts-server-hq-gate-workers-b-02)
- A gym that asks for a demo twice becomes two new leads to call (Small, small fix, FN-B-alerts-server-panel-worker-b-02)
- The WhatsApp set-up and test runs always check the login_code message, even if sign-in is switched to another one (Small, small fix, FN-B-switch-server-ci-workflows-01)
- The planned plan-end reminders leave out gyms whose free trial is ending (Small, small fix, FN-B-switch-server-hq-gate-workers-03)
- The server still keeps an old free-plan rule that limits routines to 4, while the app now says routines are free (Small, small fix, FN-B-truth-server-database-1-a-02)
- 'New feedback' is counted three different ways, and the Needs you number does not match the list it opens (Small, small fix, FN-B-truth-server-hq-gate-workers-b-01)
- A gym's 'Last 30 days' of AI use really adds up 31 days (Small, small fix, FN-B-truth-server-hq-gate-workers-b-02)
- The System page's 'in all' feedback and lead totals shrink overnight with no reason shown (Small, small fix, FN-B-truth-server-hq-gate-workers-b-03)
- The Play store text says members can export their workouts to Excel, but the app saves a plain list file meant for re-importing (Small, small fix, FN-B-words-server-ci-workflows-01)
- A test gym with the old name "ForgeAI Test Gym" and a sample shop is made on the live server (Small, small fix, FN-B-words-server-database-1-02)
- If the 'what changed' tool breaks, the phone test quietly stops testing changed screens first (Small, small fix, FN-L16-server-ci-workflows-03)
- Two 'warning only for now' checks have stayed warning-only for weeks (Small, small fix, FN-L16-server-ci-workflows-05)
- A phone test that fails once and passes on a re-run leaves no trace (Small, medium fix, FN-L16-server-ci-workflows-07)
- AI prices, the rupee rate and the India-day rule are copied by hand in several HQ files (Small, small fix, FN-L16-server-hq-gate-workers-02)
- Nine HQ database tests skip themselves quietly if the test machine lacks the database part (Small, small fix, FN-L16-server-hq-gate-workers-03)
- About 50 code paths still handle database changes that were applied long ago (Small, medium fix, FN-L16-server-panel-worker-06)
- One AI limit test reads the real clock and can fail once around midnight India time (Small, small fix, FN-L16-server-panel-worker-07)
- Once the Pro lock is on, a Starter gym can keep rewriting the diet plans it made in its trial (Small, small fix, FN-L19-server-database-2-02)
- HQ's count of receipts cancelled this month can include receipts cancelled months ago (Small, small fix, FN-L5-server-database-1-06)
- Deleting a gym reads the offer history and the photo-upload passes of every gym (Small, small fix, FN-L7-server-database-1-02)
- The 10-minute payment check reads every old payment link of every gym, and old links are never removed (Small, small fix, FN-L7-server-panel-worker-01)
- Anyone can make the pop-up sender run over and over, each time calling the gym server (Small, small fix, FN-L8-server-hq-gate-workers-02)
- The gym web page chat's AI cost is written only to a passing log line (Small, small fix, FN-L8-server-panel-worker-02)

### Other (5)

- The alert sound stays silent until you click somewhere in HQ after opening it (Medium, small fix, FN-B-alerts-hq-app-a-02)
- Switching a gym's web page off still lets questions from that page reach the gym (Medium, small fix, FN-B-switch-server-database-3-a-01)
- An admin tab left open across an update can charge a question and answer 'did not understand' (Medium, small fix, FN-B-time-panel-assistant-01)
- No test checks that an unknown /api address answers "Not found" (Medium, small fix, FN-A8-server-panel-worker-1-01)
- An HQ pop-up stays on screen after the job in it is done (Small, small fix, FN-B-alerts-hq-app-a-03)

## Improvement ideas (336)

### Member app (phone) (144)

- If the coach comes back, drop 'bring your own Claude, OpenAI or Groq key' from the member app and run the coach through our own server with a set monthly cap (big gain, L job, IM-L18-phone-cloud-backup-ai-05)
- Make "Sign in to keep them safe" and the backup-moved card's "Sign in" start the sign-in itself, not just open the Backup and restore page (big gain, S job, IM-L18-phone-components-1-01)
- Show a "Does your gym use MettleUp? Tell them" notice on the Workout tab for a member with no gym, after a few workouts, using the existing Tell my gym message (big gain, S job, IM-L18-phone-components-1-05)
- Ask for a Google Play rating at a happy moment (for example the 5th finished workout or a new personal best), using Play's own in-app review card (big gain, S job, IM-L18-phone-components-2-07)
- Ask for a Google Play rating at a happy moment: on the finish screen after a new record, from the 5th workout on, using Play's own in-app rating box (at most once every few months) (big gain, S job, IM-L18-phone-lib-core-01)
- Show "Your workouts are only on this phone" on the finish screen of the 3rd workout, not only as the last of the Workout tab's notices (big gain, S job, IM-L18-phone-lib-core-02)
- Add "Recommend MettleUp to my gym" to the free month's "5 days left" and "has ended" pop-ups, using the existing share message (big gain, S job, IM-L18-phone-lib-core-05)
- Ask for a Play Store rating inside the app (Google's own in-app review card) at a happy moment: a new personal best or the 10th finished workout, at most once in a few months (big gain, S job, IM-L18-phone-native-01)
- Add a third app-icon shortcut "Check in" that opens the gym poster scanner, for members who have joined a gym (big gain, S job, IM-L18-phone-native-03)
- On "We did not find your number at a gym on MettleUp", add the "Recommend MettleUp to my gym" button (big gain, S job, IM-L18-phone-onboarding-db-01)
- On the "We set you up as New to lifting" note, ask the experience question right there (three choices) instead of only pointing to Profile (big gain, S job, IM-L18-phone-onboarding-db-06)
- For a gym member, add the gym's Bring a friend link to a shared workout picture and text (one line: "Train with me at <gym>") (big gain, M job, IM-L18-phone-screens-2-02)
- Ask for a Google Play rating at a good moment: after a workout that beat last time, from about the 5th workout, at most once in a few months (big gain, S job, IM-L18-phone-screens-2-04)
- Make the "Check in" row on My gym show today's answer ("Checked in today at 6:42 pm" or "Not checked in today"), and add "12th visit this month" to the check-in done screen (big gain, S job, IM-L18-phone-shop-1-04)
- Ask for a friend at the happy moment: on the "You're checked in" screen (and after a new personal best), show the Bring a friend invite with a direct WhatsApp button, not only the card at the bottom of My gym (big gain, S job, IM-L18-phone-shop-1-05)
- Make the "Your plan ends on Friday" card on the Workout tab, and the plan-ending reminders, open the Renew my plan list straight away when the gym offers plans in the app (big gain, S job, IM-L18-phone-shop-2-01)
- Put a small QR code on the "IN USE" sign with "Get MettleUp free" (for a gym member: the gym’s own join or Bring a friend link) (big gain, M job, IM-L18-phone-tracker-components-1-06)
- On the "Make your first routine" card, add a second choice "Or pick a ready plan" that opens Find a plan (big gain, S job, IM-L18-phone-tracker-components-1-07)
- After a member's first 2 weeks, offer a weekly goal on Up next with the number they actually trained ("You trained 3 times a week. Make 3 your goal?" Set / Not now) (big gain, S job, IM-L18-phone-tracker-components-2-04)
- Give the "lose fat" goal its own shape: a 10-minute cardio finish (treadmill, cycle or skipping) at the end of each plan-builder workout, and one ready "Fat loss, 3 days" gym program (big gain, M job, IM-L18-phone-tracker-engine-02)
- Let a gym owner attach a real reward to a badge in the panel (for example "50 workouts: a free shaker at the desk"), show it on the member's locked badge, and list who earned it on the desk screen (big gain, L job, IM-L18-phone-tracker-engine-07)
- In the first routine guide, when the member taps a ready name (Push Day, Leg Day, Full Body...), open step 3 with 5 common exercises for that day already ticked, so they untick instead of searching the whole library (big gain, S job, IM-L18-phone-tracker-lib-01)
- On the very first workout's finish screen, show 'Next time, beat these' with the best set of each lift (for example 'Bench 40 kg x 10') (big gain, S job, IM-L18-phone-tracker-services-1-01)
- Carry the member's app choices (rest timer, plate setup, reminder days, tips seen) in the MettleUp account copy, not only in the backup file (medium gain, S job, IM-L18-phone-cloud-backup-ai-01)
- On a new phone after Bring back my workouts, say plainly that progress photos stayed on the old phone and how to move them (Download my data on the old phone, Restore on the new one) (medium gain, S job, IM-L18-phone-cloud-backup-ai-02)
- Offer a one-time 'Move my old Google Drive backup into my MettleUp account' for members who still have a Drive backup, then retire the Drive code (medium gain, M job, IM-L18-phone-cloud-backup-ai-03)
- Reuse the offline coach's typed logging ('bench 60 kg 3x10', Hindi and Hinglish too) as a quick 'type your workout' box on the Workout tab, without the whole coach (medium gain, M job, IM-L18-phone-cloud-backup-ai-06)
- Keep the MettleUp Plus limits on what is extra (more own exercises, very old charts) but never on getting your data out: Download my data, Restore and Bring back my workouts stay free for ever (medium gain, S job, IM-L18-phone-cloud-backup-ai-08)
- Let a member tap a muscle in the body map's "Not trained" line, or the Balance check's weak muscle, to see a few exercises that train it (medium gain, M job, IM-L18-phone-components-1-02)
- On an exercise's History tab, show the change from the previous time on each workout (for example "Best set +2.5 kg" or "+2 reps") (medium gain, S job, IM-L18-phone-components-1-03)
- Tell the member when last month's report is ready (one Workout tab notice or push on the 1st), with Open and Share on it (medium gain, M job, IM-L18-phone-components-1-04)
- Give the "Couldn't save, storage may be full" banner a small "Free space" button that opens the phone's storage settings (medium gain, S job, IM-L18-phone-components-1-07)
- Give the Settings row 'Backup and restore' a short grey status line: 'Kept safe in your MettleUp account' or 'Only on this phone' (medium gain, S job, IM-L18-phone-components-2-01)
- Let the member answer the team's reply inside the same question ('Reply' under the team's message), instead of only 'Ask something new' (medium gain, M job, IM-L18-phone-components-2-03)
- Give the shared empty-state piece an optional action button, and use it where the next step is obvious ('No sets logged yet' -> 'Add to a workout', 'Exercise not found' -> 'Back to exercises', 'No photos yet' -> 'Take a photo') (medium gain, S job, IM-L18-phone-components-2-05)
- In Settings, Your gym: add 'Invite a friend to <gym>' when the member has a gym, and 'Recommend MettleUp to my gym' when they have none (medium gain, S job, IM-L18-phone-components-2-06)
- Warn before a week streak breaks: one quiet nudge on Saturday evening when this week has no workout yet ("One workout by Sunday keeps your 6 weeks in a row") (medium gain, S job, IM-L18-phone-lib-core-03)
- Give one "holiday week" every 3 months that keeps the week streak alive (Diwali, travel, illness) (medium gain, M job, IM-L18-phone-lib-core-04)
- Start the free month on the first finished workout, not on the first app open (medium gain, S job, IM-L18-phone-lib-core-06)
- Keep a help message that could not be sent and send it by itself when the internet is back, instead of "Couldn't send. Try again" (medium gain, M job, IM-L18-phone-lib-core-07)
- Let the floating feedback button add a picture of the screen it was opened from (member can remove it before Send) (medium gain, M job, IM-L18-phone-lib-core-08)
- When a member taps "No" on "Did this solve it?", offer "Tell me when the team answers" and ask for notification permission right there (medium gain, S job, IM-L18-phone-lib-core-09)
- Make the rest timer an Android 16 "Live Update": the countdown shows as a chip in the status bar and at the top of the lock screen, not only inside the notification list (medium gain, M job, IM-L18-phone-native-02)
- Let the "Time to train" reminder say what to beat today ("Push 1 · try Bench 62.5 kg x 8"), the same line the Today widget already shows (medium gain, S job, IM-L18-phone-native-04)
- When Plus is switched on, let the app show a free trial set up in Play (for example 7 days) instead of only the base price (medium gain, S job, IM-L18-phone-native-05)
- Offer "Add <gym> to your home screen" once more at a good moment (the first real check-in at the gym), not only once after joining (medium gain, S job, IM-L18-phone-native-08)
- Let the member type their gym's name (optional) before the recommend message goes out, and carry it in the shared link (medium gain, S job, IM-L18-phone-onboarding-db-02)
- On the not-found card, add "Have a gym code or poster? Join my gym" so the member does not go Back, Try another way, Join my gym (medium gain, S job, IM-L18-phone-onboarding-db-03)
- On the not-found card, also say the first name must be spelled the way the gym has it (medium gain, S job, IM-L18-phone-onboarding-db-04)
- Drop the separate kg or lb step: preselect kg (the phone sign-in already assumes kg for Indian numbers) and show the choice on step 1 or 3 (medium gain, S job, IM-L18-phone-onboarding-db-05)
- On the exercise page, add "Add to a routine" and "Start a workout with this" to its menu (medium gain, M job, IM-L18-phone-screens-1-01)
- Let a member tap a record on the Records page and share it as a picture (lift, weight and reps, date, the gym logo for gym members) (medium gain, S job, IM-L18-phone-screens-1-02)
- When taking a progress photo, show the last photo faintly over the camera so the member stands in the same spot and pose (medium gain, M job, IM-L18-phone-screens-1-04)
- Let a member set a goal body weight and draw it as a line on the body weight graph, with "x kg to go" (medium gain, M job, IM-L18-phone-screens-1-05)
- Offer one opt-in reminder: "Time for your weigh-in and progress photo" (weekly weigh-in, photo every 4 weeks) (medium gain, M job, IM-L18-phone-screens-1-06)
- Add "Ask my trainer to measure me" on the Body page for gym members, sent to the gym's help inbox (medium gain, M job, IM-L18-phone-screens-1-07)
- On the workout summary, give "Summary unavailable" a Try again button (medium gain, S job, IM-L18-phone-screens-2-01)
- For a member with no gym, end the share text and the picture footer with where to get the app ("Logged with MettleUp, mettleup.fit") (medium gain, S job, IM-L18-phone-screens-2-03)
- Show "about 50 min" on the routine preview and on Up next, from how long this routine took the last few times (medium gain, S job, IM-L18-phone-screens-2-05)
- In Find a plan, add a "From your gym" section listing the plans the gym's trainer sent (medium gain, S job, IM-L18-phone-screens-2-07)
- On the monthly report and year in review, add a clear "Share my month" button at the bottom, beside the text share (medium gain, S job, IM-L18-phone-screens-2-08)
- Offer an optional "photo day" reminder every 4 weeks on the Progress photos page, off until the member turns it on (medium gain, M job, IM-L18-phone-screens-2-09)
- Put a small "+ Add" on each shop card for a product with one size or flavour, so a member adds a protein bar or water from the grid without opening the product page (medium gain, S job, IM-L18-phone-shop-1-01)
- Add "Order again" on a collected or cancelled order in My orders: it puts the same items back in the bag at today's prices (medium gain, S job, IM-L18-phone-shop-1-02)
- On an out-of-stock product, offer "Tell me when it is back" (one pop-up when the gym restocks it), and show the owner how many members are waiting for it (medium gain, M job, IM-L18-phone-shop-1-03)
- Show what Bring a friend has earned: "2 friends joined, 14 free days added" instead of only "Friends who joined: 0" (medium gain, S job, IM-L18-phone-shop-1-06)
- Let a member add one photo to a complaint or feedback in Message your gym (a broken machine, a leaking tap, a dirty washroom) (medium gain, M job, IM-L18-phone-shop-1-07)
- On the leaderboard, give a member outside the top 10 one line of reach: "3 more workouts to pass #10" (Workouts tab only) (medium gain, S job, IM-L18-phone-shop-1-08)
- Offer "Pay now by UPI" on the bag itself, next to Place order, when the gym takes online payments, so paying is part of placing the order (medium gain, S job, IM-L18-phone-shop-1-10)
- Put an "Ask about this" button under the gym's Offer and Event messages that opens Message your gym with that message quoted (medium gain, S job, IM-L18-phone-shop-2-02)
- Add "Order again" on a collected shop order, which fills the bag with the same items in one tap (medium gain, S job, IM-L18-phone-shop-2-03)
- After a QR check-in, offer "Start today's gym workout" when the gym posted a workout of the day, next to the member's own routine (medium gain, S job, IM-L18-phone-shop-2-04)
- When a member finishes the gym's monthly challenge, offer a share picture ("I finished the November challenge at <gym>") that carries their bring-a-friend invite link (medium gain, M job, IM-L18-phone-shop-2-05)
- Give a member a reward (for example 3 months of MettleUp Plus) when the gym they recommended signs up, by putting a member code in the Recommend MettleUp to my gym link (medium gain, M job, IM-L18-phone-shop-2-06)
- Add a 5-second "Get ready" count before a plank or hold countdown starts, so the member can put the phone down and get into position (medium gain, S job, IM-L18-phone-tracker-components-1-01)
- At zero on a hold countdown, keep counting past the goal ("+0:07") until the member taps Stop, instead of saving exactly the goal time (medium gain, S job, IM-L18-phone-tracker-components-1-02)
- Open the plate calculator from the barbell set itself (a small "20 + 10 each side" line under the open set, or a long press on the weight), not only from the exercise menu (medium gain, M job, IM-L18-phone-tracker-components-1-03)
- On Finish workout, add a one-tap "How did it feel?" (for example Easy, Good, Hard) above the typed note (medium gain, S job, IM-L18-phone-tracker-components-1-05)
- Let a member set a goal for one lift ("Bench press 100 kg") and draw it as a line on that exercise’s chart, with "7.5 kg to go" (medium gain, M job, IM-L18-phone-tracker-components-1-08)
- Offer the how-to steps of library exercises in Hindi (a switch on the demo sheet), using the same short steps (medium gain, L job, IM-L18-phone-tracker-components-1-09)
- Under each routine on the Workout tab, add when it was last done ("Last done Tue" or "Not done yet") next to the exercise list (medium gain, S job, IM-L18-phone-tracker-components-2-01)
- Show "Watch your trainer" on the exercise's card during a live workout (a small video link), not only on the exercise's own page (medium gain, S job, IM-L18-phone-tracker-components-2-03)
- Let the workout share picture use one of that workout's own photos as its background (medium gain, M job, IM-L18-phone-tracker-components-2-05)
- Keep a discarded workout for about 10 seconds with an Undo bar, instead of wiping it the moment 'Discard workout?' is confirmed (medium gain, S job, IM-L18-phone-tracker-data-01)
- Offer Undo after deleting a routine or a whole folder (a folder takes every routine inside it with it) (medium gain, M job, IM-L18-phone-tracker-data-02)
- Let the gym set its plates and bars once in the panel, and give that setup to every member of the gym as the starting plate calculator setup (medium gain, M job, IM-L18-phone-tracker-data-05)
- When a member joins or moves to a new gym, ask once: 'New gym, new machines? Start machine and cable records fresh from today' and apply it to those exercises in one go (medium gain, M job, IM-L18-phone-tracker-data-06)
- Suggest duplicate exercises to merge: an own exercise whose name matches a library exercise or one of its other names, for example after an import from Hevy or Strong (medium gain, M job, IM-L18-phone-tracker-data-07)
- Pick the next exercise demo films by what members actually do: first every exercise in the beginner ready programs and the most-logged lifts, then the rest (medium gain, S job, IM-L18-phone-tracker-engine-01)
- Add a "Classic 5-day split" ready program (chest, back, shoulders, arms, legs: one muscle group a day), and a 2-day full-body program for busy weeks (medium gain, S job, IM-L18-phone-tracker-engine-03)
- Let the plan builder ask one optional extra question, "Anything to focus on?" (legs and glutes, upper body, arms, none), and add one more exercise for that area to each workout (medium gain, M job, IM-L18-phone-tracker-engine-04)
- Celebrate a new strength level on the finish screen ("Bench press: now Intermediate"), the day a best lift moves the member up a level (medium gain, S job, IM-L18-phone-tracker-engine-06)
- When a member has no routines and has skipped the first routine guide, show a small Up next card ('No routine yet') with 'Pick a ready plan' and 'Make a routine', instead of no card at all (medium gain, S job, IM-L18-phone-tracker-lib-02)
- For gym members, mark on the Calendar the days they checked in at the gym but logged no workout, with 'Log it' that opens a past workout for that day (medium gain, M job, IM-L18-phone-tracker-lib-04)
- Let 'Share routine' and 'Share folder' send a link: a friend with MettleUp taps it and the routine is added; a friend without it lands on the Play Store and gets the routine after install (medium gain, L job, IM-L18-phone-tracker-lib-05)
- Add 'Share to Instagram Story' as a direct button on the share sheet, sending the Story-size or see-through picture straight into Instagram's story editor (medium gain, M job, IM-L18-phone-tracker-lib-06)
- On the finish screen, add the badge the member is closest to ('3 more workouts to your 25 workouts badge'), when no new badge was earned (medium gain, S job, IM-L18-phone-tracker-services-1-02)
- Give a followed plan an end: ready programs carry a length (for example 8 or 12 weeks), and at the end the member sees 'Plan done' with what got stronger and a choice: repeat it a little heavier, or pick the next plan (medium gain, M job, IM-L18-phone-tracker-services-1-03)
- Let a member who finished the gym's workout of the day post a result (time or top weight) to a 'Today at <gym>' board other members of the gym can see, opt-in (medium gain, L job, IM-L18-phone-tracker-services-1-04)
- After two weeks on a plan the gym's trainer sent, ask once 'How is this plan?' (Too easy, Just right, Too hard) and send the answer to that trainer (medium gain, M job, IM-L18-phone-tracker-services-1-05)
- On a member's 10th, 25th, 50th and 100th workout, offer a share picture of the milestone ('My 50th workout') with the gym's name or the app's name (medium gain, S job, IM-L18-phone-tracker-services-1-09)
- When a member shares routines as text or a file, end the message with one line that gets a friend the app ("Get MettleUp free: <Play link>"), and for a gym member the gym's Bring a friend link instead (medium gain, S job, IM-L18-phone-tracker-services-2-01)
- After deleting a saved workout, show "Workout deleted" with Undo for about 10 seconds before it is really removed (medium gain, M job, IM-L18-phone-tracker-services-2-02)
- Let a member make a before-and-after picture from two progress photos they pick (dates and "8 weeks apart" on it, the gym's logo for a gym member), shared only when they tap Share (medium gain, M job, IM-L18-phone-tracker-services-2-05)
- In the Delete my account check, add a 'Download my data first' button before the final Delete (small gain, S job, IM-L18-phone-cloud-backup-ai-04)
- Drop meal-photo calorie logging from the coach plans (small gain, S job, IM-L18-phone-cloud-backup-ai-07)
- After Bring back my workouts, say what came back in full: workouts, routines, body weight and measurements, not only the workout count (small gain, S job, IM-L18-phone-cloud-backup-ai-09)
- Make the gym's logo and name at the top of the tabs tappable, opening the Gym tab (small gain, S job, IM-L18-phone-components-1-06)
- Change the watch card's "Not now" to hide it for 60 days instead of for good (small gain, S job, IM-L18-phone-components-1-08)
- Show 'New reply from the MettleUp team' as the grey line on Settings, Help and feedback, when a reply is unread (small gain, S job, IM-L18-phone-components-2-02)
- Do not add a screenshot attachment to Help and feedback for now (small gain, S job, IM-L18-phone-components-2-04)
- If the coach comes back, write its suggested-weight reasons in the member's own unit (kg or lb) (small gain, S job, IM-L18-phone-lib-core-10)
- On the Today widget, when there is no plan or the plan day has no exercises, make the button "Start" (an empty workout) instead of "Open" (small gain, S job, IM-L18-phone-native-06)
- Send each lift's sets and reps to Health Connect with the workout, not only "Strength training" with a start, end and calories (small gain, M job, IM-L18-phone-native-07)
- Remove the optional mobile number box from setup step 1 (small gain, S job, IM-L18-phone-onboarding-db-07)
- Move "Load demo data instead" off the member welcome into a hidden spot for sales demos (small gain, S job, IM-L18-phone-onboarding-db-08)
- Add "From FitNotes" (and a plain spreadsheet file) to Bring your workouts (small gain, M job, IM-L18-phone-onboarding-db-09)
- Make a tap on a photo in the Body page's photo strip open that photo, not the list of all photos (small gain, S job, IM-L18-phone-screens-1-03)
- Keep the 1-rep max and plate calculators free; keep suggested weight and reps in MettleUp Plus (small gain, S job, IM-L18-phone-screens-1-08)
- Decide on the switched-off Quick workout and "Muscles ready today": bring them back or delete them (small gain, S job, IM-L18-phone-screens-1-09)
- On Up next, for a gym member, add one line "Gym open till 10 pm" or "Gym closed today" that opens Gym timings (small gain, S job, IM-L18-phone-screens-2-06)
- Let a member add a screenshot to Help and feedback (small gain, M job, IM-L18-phone-screens-2-10)
- Add "Remind me" next to "Quietest later today: 2 pm to 4 pm" on the How busy card: one phone reminder at the start of that window (small gain, S job, IM-L18-phone-shop-1-09)
- Do not build class or slot booking yet; first ask 5 paying owners whether their members book anything (small gain, L job, IM-L18-phone-shop-1-11)
- Let a Complaint to the gym carry one photo (a broken machine, a dirty washroom) (small gain, M job, IM-L18-phone-shop-2-07)
- Once every gym server has the newest trainer-share function, drop the two older ways the phone still tries when sharing workouts with trainers (small gain, S job, IM-L18-phone-shop-2-08)
- Offer the plate calculator for plate-loaded machines too (leg press, hack squat, T-bar row), counting plates per side with no bar (small gain, M job, IM-L18-phone-tracker-components-1-04)
- Give the Progress tab's "Today" card its own Start button, so the member starts today's workout from there (small gain, S job, IM-L18-phone-tracker-components-2-02)
- On the Profile history chart, add one line comparing with the period before ("12% more kg than the 3 months before") (small gain, S job, IM-L18-phone-tracker-components-2-06)
- Make the plan builder start from the member's last answers (days, split, minutes, equipment, sore spots), not from the defaults each time (small gain, S job, IM-L18-phone-tracker-data-03)
- Remember the exercise picked under Progress, Your lifts, 'Any exercise' after the app restarts (small gain, S job, IM-L18-phone-tracker-data-04)
- When a member keeps changing the rest on one exercise to the same length (for example 3 workouts in a row skipping to 1:30 on curls), offer 'Make 1:30 the rest for curls?' (small gain, M job, IM-L18-phone-tracker-data-08)
- Put the member's goal, level, training days a week and equipment (home, dumbbells, full gym) at the top of the "Ask your own AI" text, and ask the AI to answer in Hindi when the app is in Hindi or Hinglish (small gain, S job, IM-L18-phone-tracker-engine-05)
- Warn the member before an easy week starts, on the Today card ("Next week is an easy week: half the sets"), and let them move it from there (small gain, S job, IM-L18-phone-tracker-engine-08)
- When this week's goal is reached, change 'This week: 4 of 4 workouts' to a done state ('Weekly goal met. 4 of 4') with a tick, and on the next workout say 'Bonus workout' (small gain, S job, IM-L18-phone-tracker-lib-03)
- In the exercise picker's Recent list, add the last best set beside the date ('Last: 12 Oct, 60 kg x 8') (small gain, S job, IM-L18-phone-tracker-lib-07)
- After a member taps 'Try 40 kg' on the stuck-lift card, show one line on the next workout's card: 'Last time you stepped back to 40 kg. Back to 45 kg when this feels easy' (small gain, S job, IM-L18-phone-tracker-lib-08)
- Do not add exercise videos to the library for now; keep the start and end pictures and the 2 to 4 how-to steps (small gain, S job, IM-L18-phone-tracker-lib-09)
- Under 'Ask your own AI', let the member pick the question at the end of the text: get stronger, build muscle, fix a weak muscle, or plan my next 4 weeks (small gain, S job, IM-L18-phone-tracker-services-1-06)
- Remove the AI-written finish note (Groq, behind a switch) and keep the plain fact note (small gain, S job, IM-L18-phone-tracker-services-1-07)
- When a forgotten workout pauses itself, the next app open asks 'Did you finish at 7:42 pm?' with Save, Keep going and Discard, instead of only showing a paused workout (small gain, S job, IM-L18-phone-tracker-services-1-08)
- Offer an optional "10 seconds left" short buzz (phone and watch) before rest ends, so the member is under the bar when the bell goes (small gain, M job, IM-L18-phone-tracker-services-2-03)
- Include the profile photo in the opt-in "Include photos in my backup", next to the progress photos (small gain, S job, IM-L18-phone-tracker-services-2-04)
- On an exercise with no "Watch your trainer" video, give a gym member a small "Ask my trainer for a video" that sends a short note to the gym's inbox (small gain, M job, IM-L18-phone-tracker-services-2-06)

### Watch app (8)

- Add an "Open on phone" button to the "Start a workout on your phone" screen that opens MettleUp on the phone (medium gain, S job, IM-L18-watch-app-01)
- Turn "Workout saved" on the watch into a short summary: time taken, sets done, and any new personal best, for the same few seconds (medium gain, M job, IM-L18-watch-app-02)
- Keep the heart rate the watch reads during a workout and save average and highest heart rate with the workout on the phone (and to Health Connect), after a clear yes from the member (medium gain, M job, IM-L18-watch-app-03)
- Add a Wear OS tile (swipe from the watch face) showing the last workout and "Open on phone to start" (medium gain, M job, IM-L18-watch-app-04)
- When the phone does not answer, keep the set logged on the watch and send it as soon as the phone is back, instead of "Not saved, tick it on your phone" (medium gain, L job, IM-L18-watch-app-05)
- Add "One more set" on the watch's "Exercise done" screen, next to Go (small gain, M job, IM-L18-watch-app-06)
- Let a member start a routine from the watch: show today's or the last routine with a Start button that opens the workout on the phone (small gain, L job, IM-L18-watch-app-07)
- Show the weekly count on the watch after a workout, for example "3rd workout this week" (small gain, S job, IM-L18-watch-app-08)

### Owner and desk panel (110)

- Add an "Enquiries to call today" idea to Today for you, with See who, ranked near the top when any are due or overdue (big gain, S job, IM-L18-panel-assistant-01)
- Give each person in "Enquiries to call today" and "Enquiries still open" a Call and a WhatsApp button (big gain, S job, IM-L18-panel-assistant-02)
- Make the assistant know the page it was opened from: on a member's page, show chips like "Renew Ravi", "Ravi paid", "Is Ravi's plan still on?" (big gain, M job, IM-L18-panel-assistant-05)
- After "Add a person", open that person's sign-in code straight away, with Send on WhatsApp ready (big gain, S job, IM-L18-panel-auth-data-01)
- After Save, show "Your new look is also on" with one-tap links: print the new join poster, the member card, the gym web page and the growth report (big gain, S job, IM-L18-panel-brand-shell-02)
- Add a one-tap "Paid in full" button next to Received now on the sell sheet (big gain, S job, IM-L18-panel-forms-01)
- When money is left as dues at a sale, ask "Will pay the rest by" (a date) and show it in Dues and in the reminder (big gain, M job, IM-L18-panel-forms-03)
- After a sale or payment, keep a short success step with "Send receipt on WhatsApp" and "Print" (big gain, S job, IM-L18-panel-forms-05)
- Give Add member an "Add and sell a plan" button, so a walk-in is added and sold in one go (big gain, S job, IM-L18-panel-forms-06)
- On Today's "Came in today with an ended plan or fees due" card, add a "Renew" or "Take payment" button beside each name, next to Message (big gain, S job, IM-L18-panel-logic-1-01)
- Let the automatic "Plan ends soon / today / ended" reminders carry a way to pay: a UPI pay link with the exact amount, or the gym's online renew where it is switched on (big gain, M job, IM-L18-panel-logic-1-04)
- Add an automatic "Fees due" reminder case (off by default, some days after the plan started), so part-paid members get a polite nudge without the owner messaging each one (big gain, M job, IM-L18-panel-logic-1-05)
- When a member import finishes, offer "Send these members the app link" right on the done card (big gain, S job, IM-L18-panel-logic-1-09)
- Put the member app link in the welcome message and the member card message (big gain, S job, IM-L18-panel-logic-2-01)
- After a free-trial visitor's last day, show "Trial ended, follow up" on Today with a ready WhatsApp message asking them to join (big gain, S job, IM-L18-panel-logic-2-02)
- In the owner's free-trial banner, show what the gym built during the trial (members added, fees recorded, check-ins) (big gain, S job, IM-L18-panel-logic-2-09)
- Give each person on All branches "Who to call, in every branch" a Call and a WhatsApp button (big gain, S job, IM-L18-panel-pay-machines-01)
- Change the demo gym bar button to "Start my gym free", opening Create my gym, and add the same button on every "This works in your own gym" page (big gain, S job, IM-L18-panel-pay-machines-02)
- Add "Send on WhatsApp" under the UPI QR: a ready message with the gym UPI ID, the amount and the receipt note (big gain, S job, IM-L18-panel-pay-machines-03)
- Turn "Last refused at the door" into a list of today’s refused members, each with Renew and WhatsApp (big gain, M job, IM-L18-panel-pay-machines-08)
- Offer automatic monthly fees through the connected payment company (UPI AutoPay mandate): the member approves once, the fee is taken each month and the receipt is made by itself (big gain, L job, IM-L18-panel-pay-machines-11)
- Add a 'Trial booked' step to an enquiry: pick the trial day, check the person in at the desk as a trial visit, and put them on 'call today' the day after (big gain, M job, IM-L18-panel-screens-1-01)
- Offer two or three ready WhatsApp messages on an enquiry (plain follow-up, 'come for a free trial', 'our plans and prices' filled from the gym's plans) instead of one fixed text (big gain, S job, IM-L18-panel-screens-1-03)
- After an import finishes, offer 'Invite these members to the MettleUp app': a list of the new members with a WhatsApp invite each (the same message as 'Share app link'), and a 'Not on the app yet' group in Messages (big gain, M job, IM-L18-panel-screens-1-08)
- On Today's person rows, make 'Message' open WhatsApp with the matching ready message (plan ending, plan ended, fees due, missed you) already typed, instead of an empty chat (big gain, S job, IM-L18-panel-screens-2-01)
- Give each row of Today's 'Money to collect' a Collect button that opens the payment sheet right there (big gain, S job, IM-L18-panel-screens-2-02)
- On Money -> Dues, add 'Send fee reminder to all N, one by one' (the WhatsApp queue) and a Remind link on each row (big gain, S job, IM-L18-panel-screens-2-03)
- Let a personal-training booking repeat: 'every Mon, Wed, Fri at 7 am for 4 weeks', skipping slots that are taken and listing them (big gain, M job, IM-L18-panel-screens-2-08)
- Add "Sell at the desk" on the Shop page: pick products, take the money, stock goes down, for a member or a walk-in (big gain, M job, IM-L18-panel-shop-01)
- On Joined in the app, add a second list "Not in the app yet" (members on the gym list with no app join) with a Send invite on WhatsApp button per person, and a search box over both (big gain, M job, IM-L18-panel-shop-06)
- Let an in-app message go to just the chosen group (a plan, a batch, members ending soon), not to every app member (big gain, M job, IM-L18-panel-shop-08)
- Add a "We miss you" automatic reminder: after N days with no check-in (owner picks 7, 10 or 14), the member gets one friendly app message (big gain, M job, IM-L18-panel-shop-09)
- Put a "Find a member" box (name or mobile) in the top bar on every page, on a computer and in the phone's header, that opens the member's page (big gain, M job, IM-L18-panel-ui-shell-01)
- Add an owner-to-owner loop: "Recommend MettleUp to another gym" with a ready WhatsApp message and the owner's own link, shown on Your growth and after the owner's first good month (big gain, M job, IM-L18-panel-ui-shell-05)
- On each Your numbers list (owe fees, plans ending, stopped coming), add "Message all on WhatsApp" using the existing one-by-one send list ("1 of 12, Open WhatsApp, Skip") (big gain, S job, IM-L18-panel-ui-shell-06)
- Make the box on Today's AI card a real typing box with a microphone, so a question can be asked without first opening the assistant (medium gain, S job, IM-L18-panel-assistant-03)
- In History, let a "Not sent" draft open again as its card (message, renewal, payment) instead of only putting the sentence back in the box (medium gain, M job, IM-L18-panel-assistant-04)
- Add a "Bring a friend" idea for regulars (members who came most this month), with a ready WhatsApp message carrying the gym's friend-enquiry link (medium gain, M job, IM-L18-panel-assistant-06)
- After a save, offer the natural next step on the done card: after adding a member, "Invite to the app" and "Send a welcome"; after saving an enquiry, "Send a WhatsApp hello" (medium gain, S job, IM-L18-panel-assistant-08)
- Let desk staff use the assistant for questions only (who owes, is this plan valid, who came today), with saves and messages left to the owner (medium gain, M job, IM-L18-panel-assistant-09)
- Add a Manager kind of person: front desk rights plus money totals and receipt cancels, set by the owner (medium gain, M job, IM-L18-panel-auth-data-02)
- In the "Sign out of this device?" sheet, when work is still waiting, add a "Send now" button and list what is waiting (medium gain, S job, IM-L18-panel-auth-data-03)
- When the owner is the only person on Staff & sign-in, show one line asking him to add his front desk, saying why it helps (medium gain, S job, IM-L18-panel-auth-data-07)
- After a logo upload or a colour change, keep a "Not saved yet" bar with Save pinned to the bottom of the screen, and ask before leaving the page with unsaved changes (medium gain, S job, IM-L18-panel-brand-shell-01)
- Give the join poster a band in the gym's own colour (top or bottom strip), like the member card already has (medium gain, S job, IM-L18-panel-brand-shell-03)
- Let an owner try their logo and colour in the phone preview before the member app is turned on, then show "Turn on the member app so members see this" (medium gain, M job, IM-L18-panel-brand-shell-05)
- Show discount chips (5% off, 10% off) under Plan price on the sell sheet, with the rupees off shown (medium gain, S job, IM-L18-panel-forms-02)
- Let Collect payment settle all of a member's dues in one receipt, oldest plan first (medium gain, M job, IM-L18-panel-forms-04)
- Add "Referred by" (pick a current member) and "How they heard" to Add member (medium gain, M job, IM-L18-panel-forms-07)
- Let a freeze be picked as "away from" and "back on" dates instead of a day count (medium gain, M job, IM-L18-panel-forms-08)
- Let the owner set a freeze allowance per plan (for example 15 days a year) and show days used on the freeze sheet (medium gain, M job, IM-L18-panel-forms-09)
- An enquiry saved with no follow-up date should come back into "Due" after 3 days instead of waiting in "Later" for ever (medium gain, S job, IM-L18-panel-logic-1-02)
- Give enquiries a few follow-up messages for each stage (first call back, free trial invite, an offer, a last try) and count the tries, suggesting "Lost" after the third (medium gain, M job, IM-L18-panel-logic-1-03)
- Make the automatic "We haven't seen you" reminder use each member's own rhythm (the same rule the Away list uses), then offer it switched on (medium gain, M job, IM-L18-panel-logic-1-06)
- When a member's plan ends without a renewal, or the member is archived, ask "why did they leave?" with the same short list enquiries use (price, too far, timings, joined another gym, other) (medium gain, M job, IM-L18-panel-logic-1-07)
- On Expenses, add "Copy last month's fixed costs" so rent, salary and electricity can be entered for a new month in one tap (medium gain, S job, IM-L18-panel-logic-1-08)
- Ask for a friend referral at the happy moments: the "One year with you" wish, a challenge win and a renewal receipt, naming the gym's free days for a friend (medium gain, M job, IM-L18-panel-logic-1-10)
- Add "friend thank-yous to give" to Needs you (medium gain, S job, IM-L18-panel-logic-2-03)
- When the member who brought a friend has no running plan, keep the free days owed and add them on their next renewal (medium gain, M job, IM-L18-panel-logic-2-04)
- Let the owner give the new friend a joining reward too (two-sided Bring a friend), as an optional Settings number (medium gain, M job, IM-L18-panel-logic-2-05)
- Offer a ready WhatsApp message to a pass member (FITPASS, cultpass) who visits often: join us directly and save (medium gain, S job, IM-L18-panel-logic-2-06)
- Add a ready "PT pack ending" WhatsApp message for members whose PT pack is almost used up (medium gain, S job, IM-L18-panel-logic-2-07)
- Next to "No new best in 6 weeks, a good time to offer personal training", add a one-tap WhatsApp offer and a count of such members on the trainer's list (medium gain, S job, IM-L18-panel-logic-2-08)
- Give the Monday WhatsApp summary a comparison with the week before on each number (for example: Money collected Rs 42,000, up Rs 5,000) (medium gain, S job, IM-L18-panel-logic-2-10)
- Add a ready "please rate us on Google" WhatsApp message, offered on the joining anniversary or after a member's tenth visit (medium gain, S job, IM-L18-panel-logic-2-11)
- Make "Add UPI ID" open the UPI ID box itself, from both Payments and the Pay online box (medium gain, S job, IM-L18-panel-pay-machines-04)
- On Payments, show what online payments brought in: "This month: Rs X from N online payments", with the last five (medium gain, M job, IM-L18-panel-pay-machines-05)
- Look up a visitor from another branch by itself once the 10th digit is typed, so the desk goes type, then Check in (medium gain, S job, IM-L18-panel-pay-machines-06)
- When a visitor’s plan is for their own branch only, let the owner allow this one visit (or charge a day fee) from the same card (medium gain, M job, IM-L18-panel-pay-machines-07)
- Replace "open Help and feedback and write: Move us to Pro" with one "Ask for Pro" button that sends that request (medium gain, S job, IM-L18-panel-pay-machines-09)
- Let the desk edit an enquiry after it is saved: fix the name or number, change 'Interested in', and add a short call note ('will come Monday after salary') (medium gain, S job, IM-L18-panel-screens-1-02)
- Pre-type a training-first WhatsApp message on the 'Losing the habit' Message button ('Hi Ravi, we missed you this week. Want me to keep your 7 am slot?') (medium gain, S job, IM-L18-panel-screens-1-04)
- Show a member's notes (injury, goal, 'knee pain, no squats') at the top of the member page, beside the status, instead of at the bottom under Details (medium gain, S job, IM-L18-panel-screens-1-05)
- Add 'Repeat last month's fixed costs': one tap adds rent, salaries and electricity again with last month's amounts, each editable (medium gain, S job, IM-L18-panel-screens-1-07)
- Let the owner share a picture of the challenge winners or the leaderboard top 5 (first names only, hidden members left out) for WhatsApp status and Instagram (medium gain, M job, IM-L18-panel-screens-1-09)
- Make Bring a friend two-sided: the friend's invite page offers a free trial day at the gym, not only the member's free days (medium gain, M job, IM-L18-panel-screens-1-10)
- Add 'Referred by' (pick a member) to Add enquiry, so a friend who walks in without the app link still earns the member their free days (medium gain, S job, IM-L18-panel-screens-1-11)
- On body measurements, show the change since the first measurement ('-4.2 kg since 3 Aug') and a 'Send on WhatsApp' summary for members without the app, ending with the app link (medium gain, S job, IM-L18-panel-screens-1-12)
- Add a search box (name or mobile) to Money -> Dues (medium gain, S job, IM-L18-panel-screens-2-04)
- On the Members table (computer view), show a Collect or Renew button in the row where money is due or the plan has ended (medium gain, M job, IM-L18-panel-screens-2-05)
- On a member message, make the member's phone number a Call and a WhatsApp link (medium gain, S job, IM-L18-panel-screens-2-06)
- Give the reply box in Member messages and Member questions a few ready replies to tap (for example 'Thanks, we will fix this today', 'Please see the desk this evening', 'Good question, your trainer will show you'), editable before sending (medium gain, S job, IM-L18-panel-screens-2-07)
- In Workout of the day, add 'Plan the week': fill the next 7 days from one workout plan's days in one go, each day still changeable (medium gain, M job, IM-L18-panel-screens-2-09)
- On Pass visits, let the owner type what each pass company pays per visit and show the expected payout for the month next to the visit count (medium gain, S job, IM-L18-panel-screens-2-10)
- On each shop order card, show the member's phone with Call and WhatsApp, and let the name open the member's page (medium gain, S job, IM-L18-panel-shop-02)
- Put low-stock products first on Products, add a "Low stock (n)" chip, and a "low stock" line on the Shop today card for the owner (medium gain, S job, IM-L18-panel-shop-03)
- Give the owner a "This month in the shop" view: money per product, best sellers, and orders cancelled (medium gain, M job, IM-L18-panel-shop-05)
- Show progress on Invite members: "52 of 140 active members have joined the app", with a link to the not-yet list (medium gain, S job, IM-L18-panel-shop-07)
- Let a workout offer also run for regulars ("train 12 times this month, get 2 extra days"), not only within days of joining (medium gain, M job, IM-L18-panel-shop-10)
- On a phone, let Send on WhatsApp on the member card share the card picture straight into WhatsApp through the phone's share sheet (medium gain, S job, IM-L18-panel-ui-shell-02)
- After Approve on a member's renew request, show "Take payment now" on the same line, opening Collect payment for that member and plan (medium gain, S job, IM-L18-panel-ui-shell-03)
- Let Decline on a member's pause or renew request carry a short reason chip (Please talk to the desk, Pause days used up, Plan not open to renew) that the member sees in the app (medium gain, M job, IM-L18-panel-ui-shell-04)
- Give bell to-do cards a "Remind me tomorrow" choice next to the X (medium gain, M job, IM-L18-panel-ui-shell-07)
- Add "Bring in your members from Excel" as a button on the 'Your gym is ready' card, beside Open the QR poster (medium gain, S job, IM-L18-panel-ui-shell-08)
- At the bottom of What's new and the bell's update summary, add "Tell us what to build next" that opens Send feedback with the topic picked (medium gain, S job, IM-L18-panel-ui-shell-09)
- Add "Send them a fee reminder" under the "Members who owe fees" list, as the separate "Fees due" answer already has (small gain, S job, IM-L18-panel-assistant-07)
- When Today's AI card has no ideas, say so in one calm line ("Nothing needs you today") instead of showing only the box (small gain, S job, IM-L18-panel-assistant-10)
- Remember the last mobile number used on this device, so a returning person types only the PIN (small gain, S job, IM-L18-panel-auth-data-04)
- Cut "PIN again" from Create my gym and use a show-PIN eye instead (small gain, S job, IM-L18-panel-auth-data-05)
- On the sign-in code sheet, let "Copy" copy the whole ready message (code, number and link), not just the 6 digits (small gain, S job, IM-L18-panel-auth-data-06)
- Fingerprint or face sign-in on the device instead of typing the PIN (small gain, L job, IM-L18-panel-auth-data-08)
- Show the opening screen too: a small second preview of the logo-on-launch screen next to the Workout tab and home-screen icon (small gain, S job, IM-L18-panel-brand-shell-04)
- Add six starter colour dots (red, orange, yellow, green, blue, purple tuned for the dark screens) above the colour code box (small gain, S job, IM-L18-panel-brand-shell-06)
- Offer an "Ask MettleUp to set it up" button on Branding that sends the logo to the team, instead of the long ChatGPT steps for a logo with a photo behind it (small gain, M job, IM-L18-panel-brand-shell-07)
- On Cancel receipt, offer reason chips (Wrong amount, Wrong member, Typed twice) and a "Cancel and take again" step (small gain, S job, IM-L18-panel-forms-10)
- When adding a branch, offer to copy gym timings, the UPI ID and the logo and colours too, not only plans (small gain, M job, IM-L18-panel-pay-machines-10)
- Move 'Archive member' off the main button grid (into a 'More' menu or under Details) and add Undo to its 'Member archived.' message (small gain, S job, IM-L18-panel-screens-1-06)
- Let the restock button take a number ("+ Add stock", with 10 typed in) instead of always adding exactly 10 (small gain, S job, IM-L18-panel-shop-04)
- Let the desk scan a member's workout code as a QR with the desk camera instead of typing the 10-letter code (small gain, M job, IM-L18-panel-ui-shell-10)
- Add a third choice, "Same as phone", to Dark | Light, following the device's own setting (small gain, S job, IM-L18-panel-ui-shell-11)

### MettleUp HQ (our own admin) (10)

- Put a WhatsApp button next to every phone number HQ shows: each lead, and the owner on a gym page (big gain, S job, IM-L18-hq-app-01)
- After Make a gym or a new sign-in code, add "Open in WhatsApp" that opens a chat with that owner with the message already filled in (big gain, S job, IM-L18-hq-app-02)
- Let a lead carry a "call back on" date, and list leads due today on Needs you (big gain, M job, IM-L18-hq-app-04)
- Add two call lines to Needs you: free trials ending in 3 days, and trial gyms with no desk activity for 3 days (big gain, M job, IM-L18-hq-app-05)
- Give Leads a Show filter (New first; Won and Lost hidden by default) and make the Needs you lead line open only the new ones (medium gain, S job, IM-L18-hq-app-03)
- On a gym page, show what this gym sent (feedback and help questions) and where it came from (its lead); make the gym code on a feedback card a link to that gym (medium gain, M job, IM-L18-hq-app-06)
- Add a private note box on each gym page ("owner wants Hindi bills, call after 6 pm") (medium gain, M job, IM-L18-hq-app-07)
- Reorder the gym page: facts and owner first, then day-to-day tools (plan, status), then a folded "More tools" for rare or risky ones (sign out everywhere, new sign-in code, AI limits, support access) (medium gain, M job, IM-L18-hq-app-08)
- Saved replies: a short list of ready answers he can drop into a feedback reply and edit (medium gain, M job, IM-L18-hq-app-09)
- Show how members' shared links turn into gyms: leads from members, how many became Won, and a Show filter for them (small gain, S job, IM-L18-hq-app-10)

### Websites and web pages (11)

- After someone sends the join form, replace "You can close this page now" with a "Get the free app for <gym>" button (the gym's own app link), so the new member installs the app while they still care (big gain, S job, IM-L18-web-pages-01)
- Add a "Chat on WhatsApp" button next to the call-me forms and in the owner site footer, opening a chat with MettleUp's customer-care number (big gain, S job, IM-L18-web-pages-04)
- Show proof from real gyms on the owner site: once 3 to 5 gyms agree, their name, city and one line each, and "N of 25 founding places left" next to the founding offer (big gain, M job, IM-L18-web-pages-06)
- Tag the "Do you own a gym? Get a free page like this one" link on every gym page with a source (for example ?from=gympage) and count those demo requests in HQ, the way member referrals already are (medium gain, S job, IM-L18-web-pages-02)
- Keep the ad's name on a lead: when the owner site is opened from an ad link (utm_source and utm_campaign), send those two words with the demo request so HQ shows which ad brought each gym (medium gain, S job, IM-L18-web-pages-03)
- After a call-me request, say when the call will come (for example "today between 10 am and 7 pm, or tomorrow morning") and offer "Open the demo gym while you wait" (medium gain, S job, IM-L18-web-pages-05)
- Add a 60-second screen video on the owner site (and as the Play promo video): an owner adds a member, the member logs a set, the dues list fills (medium gain, M job, IM-L18-web-pages-07)
- On a gym's web page, when the owner has switched on the free trial, make the top button "Try free for N days" instead of "Become a member" (medium gain, S job, IM-L18-web-pages-08)
- Put "Free, no ads" into the Play short description, the line most store visitors read (medium gain, S job, IM-L18-web-pages-11)
- Let the owner paste the gym's Google reviews link once, and show "See our Google reviews" in the Find us box of the gym's web page (small gain, M job, IM-L18-web-pages-09)
- On the member website, next to "Recommend MettleUp to your gym", add "Send the app to a gym buddy" (a WhatsApp share of the app link) (small gain, S job, IM-L18-web-pages-10)

### Server, data and messages (53)

- A hand-started 'send to everyone' run that moves a build already on open testing to production for 10% of phones, then 50%, then all, with a stop button (big gain, M job, IM-L18-server-ci-workflows-01)
- A daily check of Google Play's own crash and frozen-screen rates for the phone and watch apps, opening an alert like the outage one when a new version is worse than the last (big gain, M job, IM-L18-server-ci-workflows-02)
- Give the owner one weekly line on what the front desk did with prices: discounts given and joining fees skipped, by person (for example "Ramesh gave 6 discounts, Rs 1,800 off") (big gain, S job, IM-L18-server-database-1-01)
- Add a third challenge measure, gym visits (check-ins), next to workouts logged and kg lifted (big gain, M job, IM-L18-server-database-2-01)
- Let a gym owner switch on auto-renew for the MettleUp plan (one approval with the payment company, then each month or year is taken by itself, with the same receipt) (big gain, L job, IM-L18-server-database-3-01)
- After a gym's paid MettleUp plan ends, send two win-back reminders (the day after and 7 days after) with the renew link, and list those gyms for HQ to call (big gain, S job, IM-L18-server-database-3-03)
- Let the gym's join-online link carry a member's Bring-a-friend code, so a friend who joins online is credited to that member without the desk doing anything; also ask an optional 'How did you hear about us' with 4 chips (big gain, M job, IM-L18-server-database-3-04)
- Send the 7, 3 and 1-day plan-end and trial-end reminders as a free staff browser alert and an admin-app bell line, instead of waiting for a paid WhatsApp message (big gain, M job, IM-L18-server-hq-gate-workers-01)
- Ping the owner's own phone (the installed HQ app) the moment a new lead or a help question arrives, instead of only counting it on Needs you when HQ is open (big gain, M job, IM-L18-server-hq-gate-workers-02)
- Pay the reward for gym-to-gym referrals automatically: a lead that came through another gym's link carries that gym, and when it becomes a paying gym the referring gym gets one free month on its paid-until date, written in the HQ log (big gain, M job, IM-L18-server-hq-gate-workers-04)
- Flag paying gyms that are going quiet on Needs you: check-ins this week at less than half their 30-day pace, or no desk activity for 5 days, before their paid-until date (big gain, S job, IM-L18-server-hq-gate-workers-06)
- Carry the gym code through the Google Play install: the gym invite link's "Get the app" step adds the gym to the Play address, and the app reads it once on first open and offers "Join <gym>" with the code already filled in (big gain, M job, IM-L18-server-panel-worker-01)
- Group the member app's "Tell my gym" requests by gym name and city, and show HQ the count ("12 members of Iron Den, Pune asked for MettleUp") (big gain, S job, IM-L18-server-panel-worker-02)
- A daily run that collects new Play Store reviews and star ratings for MettleUp into one private list, grouped as bug, feature ask or praise (medium gain, S job, IM-L18-server-ci-workflows-03)
- Stop waiting on the Firebase Test Lab robot and read Google Play's free pre-launch report instead, which runs a robot on real phones for every testing-track upload (medium gain, S job, IM-L18-server-ci-workflows-04)
- Use Play Console's store listing experiments to test the first two pictures and the short description against a second version, instead of replacing them in place (medium gain, S job, IM-L18-server-ci-workflows-05)
- Add a Hindi store listing (title, short and full description, captions) next to the English one, saying plainly the app itself is in English (medium gain, S job, IM-L18-server-ci-workflows-06)
- A simple public status page for gym owners ('Admin app: working', 'Member sign-in: working') fed by the same 10-minute check, linked from the admin app's help (medium gain, M job, IM-L18-server-ci-workflows-07)
- When a member scans the gym poster and their number is not on the gym list, offer "Send my details to the gym" (the existing Join online request) instead of only "Ask the desk to add you, then scan again" (medium gain, M job, IM-L18-server-database-1-02)
- Send the "plan ends soon / today / ended" reminders from the server, like gym messages and plan approvals already are, instead of the member phone scheduling them from the last plan end it saw (medium gain, M job, IM-L18-server-database-1-03)
- Let a gym message point at one thing in the app: a shop product, the running workout offer, Renew my plan or Gym timings, shown as one button under the message (medium gain, M job, IM-L18-server-database-1-04)
- Let the owner tick 'Repeat every month' on a challenge, so the server sets up next month's copy by itself (medium gain, M job, IM-L18-server-database-2-02)
- Let a member tap 'I did it' on the gym's workout of the day, and show the trainer how many did it today (and, for a timed or for-reps workout, a small result board) (medium gain, M job, IM-L18-server-database-2-03)
- Send a phone pop-up when the trainer sends a new diet plan or records new body measurements (medium gain, S job, IM-L18-server-database-2-04)
- When the owner adds a special day to the gym hours (closed for Diwali, short hours), send members one automatic pop-up the evening before (medium gain, M job, IM-L18-server-database-2-05)
- Let a member write one short follow-up under the trainer's reply to 'Ask a trainer', and let the trainer answer it once more (medium gain, M job, IM-L18-server-database-2-06)
- Let the owner set pause rules once (for example up to 15 days, once per plan, asked 3 days ahead), and approve pause requests inside those rules without a desk tap (medium gain, L job, IM-L18-server-database-2-07)
- After HQ confirms a Pay MettleUp payment, give the owner a downloadable receipt (and a GST invoice once MettleUp is GST registered) on the same page (medium gain, M job, IM-L18-server-database-2-08)
- Send the member a pop-up when a friend they invited joins and the gym adds the free days ('A friend you invited joined. 7 free days added') (medium gain, S job, IM-L18-server-database-2-09)
- In the 7-day plan-end reminder to a gym on monthly billing, add one line with the yearly price and what it saves, with a 'Pay for 12 months' button (medium gain, S job, IM-L18-server-database-3-02)
- When a personal-training class is booked or cancelled, send the member a pop-up, and one more 2 hours before the class (medium gain, M job, IM-L18-server-database-3-05)
- Let the trainer or desk mark a personal-training class as Done or No-show, and show a month count per trainer (classes done, no-shows) (medium gain, M job, IM-L18-server-database-3-06)
- When a visitor on the gym's web page chat says 'I want to join', answer with the gym's join-online link (and the free trial when it is on), not only a promise of a call back (medium gain, S job, IM-L18-server-database-3-07)
- Add 'Repeat every month' to a challenge, so next month's copy starts by itself on the 1st with the same goal and prize days (medium gain, S job, IM-L18-server-database-3-08)
- Move a lead to Won by itself when the gym made from it pays for its first plan (confirmed UPI or online), and write the move in the HQ log (medium gain, S job, IM-L18-server-hq-gate-workers-03)
- Let an HQ message go to a group of gyms (trial gyms, one plan, one city) instead of always every gym, and show how many gyms opened it (medium gain, M job, IM-L18-server-hq-gate-workers-05)
- When a monthly gym's plan-end reminder goes out, offer the yearly plan with the saving in rupees, using the yearly plan the billing code already supports (medium gain, S job, IM-L18-server-hq-gate-workers-07)
- Add a weekly automatic restore check: read last night's backup back, count its rows per table, compare with the live totals, and show 'last restore check passed' next to the backup's health answer (medium gain, M job, IM-L18-server-hq-gate-workers-09)
- Let the demo form keep where the gym came from by a short fixed list of words (instagram, google-ad, poster, gym-page, owner-referral), sent by the landing page from the link it was opened with (medium gain, S job, IM-L18-server-panel-worker-03)
- Each week, list the help questions the AI said its help pages do not cover, and the answers people tapped "No, this did not solve it" on, grouped by topic, so the missing help page gets written (medium gain, S job, IM-L18-server-panel-worker-04)
- On a gym's own web page, when the owner's free trial is on, make the main button "Try free for N days" (with "Become a member" next to it) (medium gain, S job, IM-L18-server-panel-worker-05)
- After a gym owner sends the free demo form, answer with a "Chat with us on WhatsApp now" link that opens a chat with MettleUp's number and a ready message ("Hi, I asked for a demo for <gym>") (medium gain, S job, IM-L18-server-panel-worker-07)
- Within an hour of a new app version, if crash reports with the same error arrive from several phones, send HQ an alert, instead of waiting for the next daily crash run (medium gain, M job, IM-L18-server-panel-worker-08)
- At the end of each release run, one plain summary on the run page: version, which Play tracks it reached (phone and watch), any track skipped with a warning, and the What's new lines sent (small gain, S job, IM-L18-server-ci-workflows-08)
- Put the member's What's new lines on the public GitHub release page instead of the automatic list of code changes (small gain, S job, IM-L18-server-ci-workflows-09)
- Let the owner ask to close the gym and erase its data from the panel itself (a "Close my gym" request with the download-first step), feeding the existing delete-request list (small gain, S job, IM-L18-server-database-1-05)
- Undo a whole data import in one server step ("Undo this import: 142 members, 160 plans, 158 receipts"), all or nothing, instead of the panel deleting record by record (small gain, S job, IM-L18-server-database-1-06)
- Delete demo gyms that nobody signed up for and nobody used for 30 days, the way the nightly job already deletes the test gyms (small gain, S job, IM-L18-server-database-1-07)
- Do not build automatic trial extensions; keep trials at 3 months with HQ extending by hand up to 6, and spend the effort on the trial-ending call lines in HQ instead (small gain, S job, IM-L18-server-database-1-08)
- When the gym marks a member's message as done, ask the member one tap: 'Was this sorted? Yes / No', and show the owner the share of Yes this month (small gain, S job, IM-L18-server-database-3-09)
- When the door machine link goes live, send the gym an urgent staff alert when a machine stops calling in for 30 minutes during opening hours (small gain, S job, IM-L18-server-hq-gate-workers-08)
- When a person verifies their number for joining online, let the WhatsApp "verified" reply also carry the gym's app link ("Get the <gym> app: link") (small gain, S job, IM-L18-server-panel-worker-06)
- Let HQ send a bell message to one group of gyms only (gyms on the free trial, or paying gyms), not always to every gym (small gain, M job, IM-L18-server-panel-worker-09)
