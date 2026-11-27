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
