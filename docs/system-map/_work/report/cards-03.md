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
