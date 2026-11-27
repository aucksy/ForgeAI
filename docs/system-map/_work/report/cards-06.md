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
