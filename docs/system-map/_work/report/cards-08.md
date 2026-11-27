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
