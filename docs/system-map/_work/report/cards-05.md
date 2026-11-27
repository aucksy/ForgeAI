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
