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

### Website promises staff cannot see member lists, but emergencies can

**How bad:** Serious. Privacy and trust: a public security promise on the sales page is wider than the truth.
**What you would see:** The gym-owner website says our staff cannot open your member list unless you let them in for 1 hour. In fact MettleUp HQ has an emergency action that opens read-only access to any gym for 15 to 60 minutes. It needs a typed reason but no OK from the gym. It is logged, and the owner sees it afterwards. The privacy notice does mention emergency access; the website line does not.
**Who it hurts and how often:** Gym owners reading the website, every time. No member data is exposed by the words themselves; the risk is an owner feeling misled after seeing an emergency visit in their log.
**Proof:** Found by reading the code. Compare the website's staff-access line with the privacy notice's emergency-access section, and with the emergency button on the HQ panel.
**Fix:** Add the logged emergency case to the website line, in words you approve. Size: small.
**Your decision:** Yes. My view: change the website words to name the logged emergency access; it is honest and still reassuring. Option 1: change the website words. Option 2: make emergency access wait for the gym's OK.
Finding: FN-A3-inbox-3-06

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
