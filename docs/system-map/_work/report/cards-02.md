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
