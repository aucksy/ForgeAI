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
