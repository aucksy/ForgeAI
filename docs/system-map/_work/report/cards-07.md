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
