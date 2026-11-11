// Help articles for the AI help answers (Help and feedback box, member app and admin app).
// The AI answers ONLY from these, so every step, button name and screen name here was checked against
// the screen code on 4 Nov 2026 (admin app: the English words, the Hinglish comes from t()). Change a
// screen's words: change the article too. Never name a button that is not in the code.
// Member words: never "volume", "PR" or "session". No money promises, prices, dates or future features.
// The help library grows with the app (owner's HARD RULE, R-319 item 10): every screen file is listed
// in one article's `screens`, or in NO_HELP_SCREENS with a reason. Check: node scripts/ci/help_coverage.mjs
// Tests: node --test deploy/panel/helpArticles.test.mjs

export const HELP_ARTICLES = [
  // ------------------------------------------------------------------ gym owners and front desk
  {
    id: 'today-page',
    who: 'owner',
    title: 'Use the Today page',
    text:
      'Today is the first page of the admin app. It shows what needs doing now. ' +
      'At the top, "Quick actions" holds your most-used buttons. Tap "Change buttons" to pick them. ' +
      '"Requests from the app" lists members who asked to pause or renew their plan. Tap Approve or Decline. Approving a renewal adds the fee to what they owe; they pay at the desk. ' +
      'Cards below show "Money to collect", "Losing the habit", plans ending soon, "Birthdays today" and "Enquiries to call". Tap "See all" on a card for the full list. ' +
      '"Last week at your gym" can be sent to yourself or a partner with "Share on WhatsApp".',
    screens: ['apps/dashboard/src/crm/ui/screens/Today.tsx'],
  },
  {
    id: 'needs-you-alerts',
    who: 'owner',
    title: 'See what is waiting for you (Needs you)',
    text:
      'In the admin app, the Today menu item shows a red number when something waits for you: plan pause or renew requests from the app, check-in numbers to confirm, and new shop orders. Member questions have their own Questions menu item with its own number. ' +
      'At the top of Today, the "Needs you" card lists them; tap a line to go to it. ' +
      'The page title in the browser tab also shows the number. ' +
      'To get a short sound and a pop-up on this computer or phone when something new arrives, tap "Turn on alerts" on that card and allow notifications. ' +
      'Alerts work while the admin app is open in a tab.',
  },
  {
    id: 'add-a-member',
    who: 'owner',
    title: 'Add a new member, or find one',
    text:
      'Open the admin app (app.mettleup.fit). ' +
      '1. Tap Members, then "+ Add member". ' +
      '2. Type the full name and mobile number. Only these two are needed. Batch, joining date, email and notes are optional. ' +
      '3. Tap "Add member". The member\'s page opens. ' +
      '4. Tap "Sell membership", pick the plan, type the amount in "Received now" and how it was paid, then tap "Confirm". ' +
      'The mobile number is used to find the member and to send them WhatsApp messages. ' +
      'To find someone, type in "Search name or mobile number", or tap "Filter members" and pick Active, Expiring, Expired or "Has dues".',
    screens: ['apps/dashboard/src/crm/ui/screens/Members.tsx'],
  },
  {
    id: 'renew-or-take-payment',
    who: 'owner',
    title: 'Renew a membership or collect a payment',
    text:
      'To renew: 1. Open Members and tap the member. 2. Tap "Renew". 3. Pick the plan, type the amount in "Received now", pick "Paid by", then tap "Confirm". ' +
      'A member with no plan shows "Sell membership" instead of "Renew". ' +
      'To collect money still due: 1. Open the member. 2. Tap "Collect payment" (it shows only when money is due). 3. Type the "Amount received", pick "Paid by", then tap "Save payment". ' +
      'To see who still owes money, open Money, then Dues. Never enter a payment twice to test it.',
  },
  {
    id: 'online-payments',
    who: 'owner',
    title: 'Let members pay online (UPI QR or a payment link)',
    text:
      'UPI QR: add your gym’s UPI ID in Settings, Gym details. "Collect payment", "Renew" and shop orders then show "Show UPI QR" with the amount. The member scans it with any UPI app. When the money shows, tap "Save payment". ' +
      'Payment link: open Settings, then Payments. Paste the keys of your own Razorpay, Cashfree, PayU or PhonePe account and tap "Test and connect". "Collect payment" then shows "Make a payment link", and the receipt is made by itself. ' +
      'The money goes straight to your account; MettleUp takes no fee. "Test mode" means no real money moves yet. ' +
      'If a receipt could not be made, Today shows "Paid online, receipt not made".',
    screens: ['apps/dashboard/src/crm/pay/PaymentsScreen.tsx'],
  },
  {
    id: 'member-page-tools',
    who: 'owner',
    title: 'Other things you can do on a member\'s page',
    text:
      'Open Members and tap a member. On their page you can: ' +
      '1. Tap "Check in" to mark today\'s visit. ' +
      '2. Tap "Freeze / extra days" to add days for a break or a gift. Pick the reason, then tap "Add days". Only the owner can do this. ' +
      '3. Tap "Member card" for an ID card with a QR code. ' +
      '4. Tap "Send app invite" to send them the app link. ' +
      '5. Under "Body measurements", tap "Add measurements" to save their weight and tape measurements. ' +
      '6. If they use the app, under "Full workout history" tap "Request workout report", then "Download full history" once their phone sends it. ' +
      '7. Tap "Archive member" when they leave. "Restore member" brings them back.',
    screens: ['apps/dashboard/src/crm/ui/screens/MemberDetail.tsx', 'apps/dashboard/src/crm/ui/screens/MemberMeasurements.tsx'],
  },
  {
    id: 'money-and-receipts',
    who: 'owner',
    title: 'See payments, dues and receipts (Money)',
    text:
      'Open Money. It has two tabs. ' +
      '"Collections" lists every payment. Pick the period at the top, or search by receipt number, name or mobile. Tap a receipt number to open the printable receipt, then tap "Send on WhatsApp" or "Print". ' +
      '"Dues" shows "Who has dues" and how long each amount has been due. Tap "Collect" to take a payment. ' +
      '"Download Excel file" saves the list. ' +
      'A wrong payment can be undone with "Cancel receipt". The amount goes back into the member\'s dues. "Show cancelled receipts" lists them.',
    screens: ['apps/dashboard/src/crm/ui/screens/Money.tsx', 'apps/dashboard/src/crm/ui/screens/Receipt.tsx'],
  },
  {
    id: 'check-in-at-the-desk',
    who: 'owner',
    title: 'Check a member in',
    text:
      'At the desk: 1. Tap Visits. 2. Under "Check someone in", type a name or the last 4 digits of the mobile number. 3. Tap "Check in". ' +
      'You can also open the member\'s page and tap "Check in". ' +
      'Members can check themselves in: 1. In Visits, tap "Check-in QR". 2. Tap "Print poster" or "Download picture" and put it where members walk in. ' +
      'A member scans it with the MettleUp app. The app finds them by their mobile number, so that number must be in your Members list. ' +
      'App check-ins show in the register with an "App" tag. Two scans in one day count as one visit. ' +
      'The "Losing the habit" tab lists members who stopped coming.',
    screens: ['apps/dashboard/src/crm/ui/screens/Attendance.tsx', 'apps/dashboard/src/crm/shop/CheckInQrScreen.tsx'],
  },
  {
    id: 'pass-members',
    who: 'owner',
    title: 'FITPASS, cultpass and other pass members',
    text:
      'A pass member pays FITPASS, cultpass or another pass company, not your gym. The company pays your gym per visit. ' +
      'To add one: tap Members, then "+ Add member", tick "Comes with a pass" and tap their company (or "+ Other company"). For someone already listed: their page, "Edit", the same box. ' +
      'They have no plan and no dues, and are never on the renewal list. ' +
      'Each visit counts: tap "Pass visit" on their page, or they scan your check-in QR in the MettleUp app. ' +
      'Each month, open Visits, then "Pass visits": visits and people per company, to match the company’s payment. "Download Excel file" saves one line per visit.',
    screens: ['apps/dashboard/src/crm/ui/screens/PassVisits.tsx'],
  },
  {
    id: 'import-members-from-excel',
    who: 'owner',
    title: 'Bring in members from Excel or old gym software',
    text:
      '1. Tap Members, then "Import from Excel". ' +
      '2. Tap "Choose file" and pick a .xlsx, .xls or .csv file. "Download sample file" shows the layout. ' +
      '3. Under "Which column is which", check the columns. The name and mobile number columns are needed. ' +
      '4. Under "Check the list", see which rows will be added, which are already members, and which have problems. ' +
      '5. Tap the "Add ... members" button. ' +
      'Aadhaar and PAN numbers are never imported. A wrong file can be taken back with "Undo this import" on the same page.',
    screens: ['apps/dashboard/src/crm/ui/screens/ImportMembers.tsx'],
  },
  {
    id: 'plans-and-prices',
    who: 'owner',
    title: 'Add or change the plans you sell',
    text:
      'Plans are what you sell, and for how much. ' +
      '1. Open Plans (on a phone, under More). ' +
      '2. Tap "+ Add plan". ' +
      '3. Type the "Plan name", the "Duration" and the "Price (₹)". Add a "Joining fee (₹)" if you charge one. It is charged once, on a member\'s first plan. ' +
      '4. Tap "Save plan". ' +
      'With no plans yet, "Use a starter price list" fills in a list you can change. ' +
      'To stop selling a plan without deleting it, tap "Edit" and set "For sale?" to "Not for sale". ' +
      'A "PT plan" is for personal training, with a number of classes and an optional trainer.',
    screens: ['apps/dashboard/src/crm/ui/screens/Plans.tsx'],
  },
  {
    id: 'send-messages-to-members',
    who: 'owner',
    title: 'Send a message or offer to members',
    text:
      '1. Open "Messages & offers" (on a phone it is under More). Only the owner can send messages. ' +
      '2. Under "Pick a message", choose a ready message or a kind of message, and change the words if you want. ' +
      '3. Under "Who gets it", pick the group. ' +
      '4. To send in the MettleUp app, tap "Send in the app", then "Yes, send". You can also pick a day and time. ' +
      '5. For members without the app, tap "WhatsApp one by one". It opens your own WhatsApp with the words typed in. ' +
      'Sent messages show under "Sent in the app". The Reminders tab shows the automatic reminders.',
    screens: ['apps/dashboard/src/crm/ui/screens/Messages.tsx'],
  },
  {
    id: 'workout-offer-admin',
    who: 'owner',
    title: 'Reward members who train (Workout offer)',
    text:
      'A workout offer gives extra days to members who do a set number of workouts within some days of joining it. ' +
      '1. Open "Messages & offers" (on a phone, under More), then the "Workout offer" tab. ' +
      '2. Under "Start a workout offer", set "Workouts", "Within (days of joining)", "Reward (extra days)" and "Members can join until". ' +
      '3. Pick "Check-ins that count" and "How the days are given". ' +
      '4. Tap "Start offer". Members see it in the MettleUp app at once. ' +
      'The front desk sees "Workout offer" in its menu, to give the days members earned.',
  },
  {
    id: 'enquiries',
    who: 'owner',
    title: 'Keep track of people who asked about joining (Enquiries)',
    text:
      '1. Open Enquiries (on a phone, under More). ' +
      '2. Tap "+ Add enquiry". Type the name and mobile number. What they are interested in and the follow-up date are optional. ' +
      '3. Tap "Save enquiry". ' +
      'The list shows who to call today. To move a call, tap "Follow-up date", pick a day, then "Save date". ' +
      'When they join, tap "Mark joined and open" or "Add as member". If they will not join, tap "Not interested". ' +
      '"Where enquiries came from" counts the answers to "Where did they hear about us?".',
    screens: ['apps/dashboard/src/crm/ui/screens/Enquiries.tsx'],
  },
  {
    id: 'bring-a-friend-admin',
    who: 'owner',
    title: 'Members bring a friend (free days for each friend who joins)',
    text:
      'Members can send a friend a link from the MettleUp app. The friend leaves a name and number, and it shows in Enquiries with "Referred by" and the member\'s name. ' +
      'To give free days: open Settings, then "Member app". Under "Bring a friend", type the days in "Free days for each friend who joins" and tap "Save free days". Leave it empty to give none. ' +
      'When the friend joins, tap "Add as member". A "Thank" page opens: tap "Give" to add the days to the member\'s plan, or "Not now" to do it later from the enquiry. Only the owner can give them.',
    screens: ['apps/dashboard/src/crm/ui/screens/BringAFriend.tsx'],
  },
  {
    id: 'expenses-and-profit',
    who: 'owner',
    title: 'Note money going out and see profit (Expenses)',
    text:
      'Expenses is money going out, like rent. The front desk does not see this page. ' +
      '1. Open Expenses (on a phone, under More). ' +
      '2. Tap "+ Add expense". ' +
      '3. Fill in "What for", "Amount" and "Date". A note is optional. ' +
      '4. Tap "Save expense". ' +
      'The page shows what was collected, what went out and the "Profit" for the month, with "By category" below. Use the arrows at the top to see another month.',
    screens: ['apps/dashboard/src/crm/ui/screens/Expenses.tsx'],
  },
  {
    id: 'workout-plans-for-members',
    who: 'owner',
    title: 'Send members a workout plan or a workout of the day',
    text:
      'Workout plans are routines your gym sends to members\' MettleUp app. ' +
      '1. Open Workout plans (on a phone, under More). ' +
      '2. Tap "+ New plan", then "Start from a ready plan" or "Start empty". ' +
      '3. Name the plan. For each day, search under "Add an exercise" and tap the exercise, then set reps and rest. "+ Add day" adds a day. ' +
      '4. Tap "Save plan". ' +
      '5. Tap "Send" and pick the members. Members see it in the app after one check-in at the gym. ' +
      'For one workout for everyone, use "Workout of the day" on the same page: tap "Set today’s workout", then "Save workout".',
    screens: ['apps/dashboard/src/crm/ui/screens/WorkoutPlans.tsx', 'apps/dashboard/src/crm/ui/screens/WorkoutOfTheDay.tsx'],
  },
  {
    id: 'diet-plans-for-members',
    who: 'owner',
    title: 'Send members a diet plan',
    text:
      '1. Open Diet plans (on a phone, under More). ' +
      '2. Tap "+ New plan", then "Start from a sample" or "Start empty". ' +
      '3. Type the "Plan name". Tap "+ Add a meal" for each meal: its time and the food, one per line. Calories, protein and notes are optional. ' +
      '4. Tap "Save plan". ' +
      '5. Tap "Send" and choose who gets it. ' +
      'Members see it in the Gym tab of the MettleUp app, under "Diet plan". "Stop sending" takes a plan back.',
    screens: ['apps/dashboard/src/crm/ui/screens/DietPlans.tsx'],
  },
  {
    id: 'trainers-and-personal-training',
    who: 'owner',
    title: 'Trainer pages and personal-training bookings',
    text:
      'Open Trainers (on a phone, under More). Each trainer ticked "Trainer" in Staff & sign-in has a card. ' +
      'Tap "Open page" to see their working hours and their personal-training members with classes left. "Edit page" adds a photo, what they teach and their hours (the owner for anyone, a trainer for themself). ' +
      'To book: under "Personal training this week", pick the day, tap "Free" next to the time, pick the member and tap "Book". ' +
      'A member with no classes left, or a trainer or member already booked then, is refused. Outside working hours, tap "Book anyway". ' +
      'Tap a booking to cancel it. Booking does not use up a class.',
    screens: ['apps/dashboard/src/crm/ui/screens/Trainers.tsx'],
  },
  {
    id: 'my-members-trainers',
    who: 'owner',
    title: 'See your members\' workout progress (My members)',
    text:
      'My members shows the workouts of members who share them, and their trainer. Only trainers and the owner see it. ' +
      '1. Open "My members" (on a phone, under More). ' +
      '2. "Your members: who to talk to today" comes first. ' +
      '3. Each member shows their workouts each week for the last 12 weeks, and their best sets. ' +
      '4. Tap "WhatsApp: How’s it going?" or "WhatsApp: Well done" to message them. ' +
      'A member shows here only after they switch on "Share my workouts with my trainers" in their app.',
    screens: ['apps/dashboard/src/crm/ui/screens/MyMembers.tsx'],
  },
  {
    id: 'answer-member-questions',
    who: 'owner',
    title: 'Answer members\' questions (Questions)',
    text:
      'Members can ask a trainer a question from the MettleUp app ("Ask a trainer" on the Gym tab). ' +
      'Only the person the member picked sees it; "Any trainer" questions go to every trainer and the owner. ' +
      '1. Open "Questions" (on a phone, under More). A number on it shows how many questions wait for a reply. ' +
      '2. "Waiting for your reply" lists them, the longest wait first. ' +
      '3. Type in "Your reply" and tap "Send reply". ' +
      'The reply shows in the member\'s app, with a notification if they allowed messages from the gym. ' +
      'Only trainers (ticked in Staff & sign-in) and the owner can open Questions.',
    screens: ['apps/dashboard/src/crm/ui/screens/Questions.tsx'],
  },
  {
    id: 'member-progress-card',
    who: 'owner',
    title: 'See a member\'s workout progress on their page',
    text:
      'Open Members and tap a member. The "Progress" card shows, for the owner and the member\'s own trainer: ' +
      'kg lifted each week for 12 weeks (a line), workouts each week, best lifts with the day, new bests in the last 30 days, and their recent workouts with each exercise\'s best set. ' +
      'It shows only while the member has "Share my workouts with my trainers" switched on in their app. Body weight, photos and notes are never shared. ' +
      'A line like "No new best in 6 weeks" is only for staff: it suggests a good time to offer personal training. ' +
      'For every workout, use "Full workout history" on the same page.',
  },
  {
    id: 'challenges-and-leaderboard',
    who: 'owner',
    title: 'Run a challenge and see the leaderboard',
    text:
      'A challenge gives members a goal for a number of days. Everyone who reaches it wins. ' +
      '1. Open Challenges (on a phone, under More). ' +
      '2. Tap "New challenge". ' +
      '3. Type a name, pick "What counts" (Workouts or Kg lifted), the "First day", "How many days" and the goal. ' +
      '4. If you want, add "Free days for everyone who reaches the goal". ' +
      '5. Tap "Start challenge". Members see it in the MettleUp app within 10 minutes. ' +
      'The page also shows the "Leaderboard · last 30 days". "Copy this list" copies it for WhatsApp. Only the owner can start or change a challenge.',
    screens: ['apps/dashboard/src/crm/ui/screens/Challenges.tsx'],
  },
  {
    id: 'shop-orders-and-products',
    who: 'owner',
    title: 'Handle shop orders and products',
    text:
      'Shop shows what members order in the MettleUp app, and what you sell. ' +
      'Orders: new orders show up by themselves in a few seconds. 1. Get the item ready and tap "Mark ready". The member sees it in the app. 2. When they pay and collect it, tap "Collected (paid)". "Cancel order" puts the items back in stock. ' +
      'Products: 1. Tap "+ Add product". 2. Type the "Name", "Category", "Price" and "Stock". 3. Tap "Add product". ' +
      '"Hide from app" takes a product off the app without deleting it. "+10 stock" adds stock quickly. Members pay at the desk.',
    screens: ['apps/dashboard/src/crm/shop/ShopScreen.tsx'],
  },
  {
    id: 'invite-poster-and-gym-code',
    who: 'owner',
    title: 'Put up the join poster so members join in the app',
    text:
      '1. Tap More, then "Invite members". ' +
      '2. Under "Front-desk QR poster", tap "Print poster", or "Download picture" for a print shop. ' +
      '3. To send the link instead, tap "Send on WhatsApp", "Copy link" or "Copy message". ' +
      'Members scan the poster with their phone camera, get the MettleUp app, and tap Join. ' +
      'Members can also type your gym code (6 letters or numbers, shown on that page) in the app. ' +
      'To invite one member, open them in Members and tap "Send app invite". ' +
      'The separate check-in poster is in Visits, under "Check-in QR".',
    screens: ['apps/dashboard/src/crm/shop/InviteScreen.tsx'],
  },
  {
    id: 'member-cannot-join',
    who: 'owner',
    title: 'A member cannot join your gym in the app',
    text:
      '1. Check the member app is on: tap More, then "Invite members". If it asks to turn the member app on first, only the owner can do it, with "Turn on the shop". ' +
      '2. Give the member the gym code shown there. It has 6 letters or numbers. "No gym has this code" means it was typed wrong. ' +
      '3. In the app, the member must type their name and tick the box saying they are 18 or older and agree to the terms, then tap "Join this gym". ' +
      '4. The phone needs internet. ' +
      'For QR check-in, the member\'s mobile number must be in your Members list. Add or fix it, then they scan again.',
  },
  {
    id: 'gym-settings-admin',
    who: 'owner',
    title: 'Change your gym details and admin settings',
    text:
      'Open Settings (on a phone, under More). It has three tabs. ' +
      '"Gym": Language (English or Hinglish), the card to put the admin app on your phone or computer, then under "Gym details" your gym name, phone, address, GSTIN and UPI ID. Tap "Save details". ' +
      '"Member app": your gym code, and links to branding, gym timings, challenges and busy machines. ' +
      '"Sign-in & data": "Staff & sign-in", "Download a backup" (an Excel file of all your gym data), "Your gym’s records" (how many members, plans sold, payments and check-ins are saved), "Clear offline copy" and "Delete our gym from MettleUp". ' +
      '"MettleUp access" is on Help and feedback.',
    screens: ['apps/dashboard/src/crm/ui/screens/Settings.tsx'],
  },
  {
    id: 'gym-timings-and-busy-machines',
    who: 'owner',
    title: 'Set gym timings and busy machines for members',
    text:
      'Gym timings tell members when you are open. 1. Open Gym timings (on a phone, under More). 2. Under "Start from", pick the times closest to yours, then change any day. "Copy Monday to Tue to Sat" saves typing. "+ Add evening time" adds a second time. 3. Add holidays with "+ Add a special day". 4. Tap "Save and show members". ' +
      'Busy machines tells members when a machine is usually busy. Open Settings, tap the "Member app" tab, then "Open busy machines". Switch on "Show busy machines to members", type how many of each you have, then tap "Save". ' +
      'Only the owner can change these.',
    screens: ['apps/dashboard/src/crm/ui/screens/GymTimings.tsx', 'apps/dashboard/src/crm/ui/screens/BusyMachines.tsx'],
  },
  {
    id: 'branding-logo-colours',
    who: 'owner',
    title: 'Put your logo and colours in the member app (Branding)',
    text:
      'Branding puts your logo and colours in the MettleUp app your members use. Only the owner can change it. ' +
      '1. Open Branding (on a phone, under More). ' +
      '2. Tap "Upload logo" and pick your logo picture. ' +
      '3. Under "Colour", set "Your brand colour". ' +
      '4. Under "Headings", pick a heading style. ' +
      '5. Tap "Save". ' +
      'To go back, tap "Use MettleUp’s look". ' +
      'If the page says "Turn on the member app first", do that, then come back.',
    screens: ['apps/dashboard/src/crm/brand/BrandingScreen.tsx'],
  },
  {
    id: 'staff-and-sign-in',
    who: 'owner',
    title: 'Let staff sign in, and set your PIN',
    text:
      '1. Open More, then "Staff & sign-in". On a computer: Settings, the "Sign-in & data" tab, then "Staff & sign-in". ' +
      '2. Tap "Add a person". Type the name and mobile number, and pick "What can they do?": Owner or Staff. Staff can add members, collect fees and check people in. ' +
      '3. Tap "Make sign-in code", then "Copy the code" or "Send on WhatsApp". The code works once, for a few minutes. ' +
      'The same code lets you use a new phone. ' +
      '"Set my PIN" lets you sign in with your mobile number and a PIN. "Sign out other devices" signs you out elsewhere. ' +
      'Forgot your PIN? Where you are still signed in, make yourself a code and sign in with it.',
    screens: ['apps/dashboard/src/crm/auth/PeopleScreen.tsx'],
  },
  {
    id: 'your-growth-report',
    who: 'owner',
    title: 'See if your gym is growing (Your growth)',
    text:
      'Your growth shows the gym month by month since it started on MettleUp. Only the owner sees it. ' +
      '1. Open "Your growth" (on a phone, under More). ' +
      '2. Read the "Summary", then "Month by month". ' +
      '3. To compare with before MettleUp, use "Add old records" to type your old numbers. ' +
      '4. Tap "Print or save as PDF" for a one-page report, or "Share this report". "Download Excel file" saves the numbers.',
  },

  // ------------------------------------------------------------------ members
  {
    id: 'join-your-gym',
    who: 'member',
    title: 'Join your gym in the app',
    text:
      '1. Open the Gym tab. ' +
      '2. Tap "Scan the poster" and point your camera at the poster at your gym\'s desk. Or type your gym\'s code (6 letters or numbers) and tap Next. ' +
      '3. Check the gym name, type your name, and tick the box: you are 18 or older and agree to the terms. ' +
      '4. Tap "Join this gym". ' +
      'New to the app? Tap "Join my gym" on the first screen. ' +
      'To check in later, open the Gym tab, tap "Check in" and scan the check-in poster at the desk. The first time, it asks for the mobile number your gym has. ' +
      'Is your gym not on MettleUp yet? Tap "Recommend MettleUp to my gym" in the Gym tab.',
    screens: [
      'apps/mobile/src/app/(tabs)/shop.tsx',
      'apps/mobile/src/app/j/[code].tsx',
      'apps/mobile/src/app/c/[code].tsx',
      'apps/mobile/src/app/scan.tsx',
    ],
  },
  {
    id: 'my-membership',
    who: 'member',
    title: 'See your membership, pause or renew your plan',
    text:
      '1. Open the Gym tab, then "My gym". "My membership" shows your plan, its end date and the days left. ' +
      '2. To ask for a break, tap "Pause my plan". Tap the first day you will be away, then the last day, then "Send to the desk". ' +
      '3. To renew, tap "Renew my plan", pick a plan, then "Send to the desk". You pay at the desk. ' +
      'The desk confirms it. Changed your mind? Tap "Take back my request". If you do not see these buttons, ask the desk. ' +
      'On the same page, tap the open or closed line to see Gym timings, and "Diet plan" to see the plan your trainer sent.',
    screens: ['apps/mobile/src/app/shop/hours.tsx', 'apps/mobile/src/app/shop/diet.tsx'],
  },
  {
    id: 'bring-a-friend',
    who: 'member',
    title: 'Invite a friend to your gym',
    text:
      '1. Open the Gym tab, then "My gym". ' +
      '2. Under "Bring a friend", tap "Invite a friend" and pick WhatsApp or another app. ' +
      'Your friend opens the link, leaves a name and number, and the gym calls them. Only the gym sees their number. ' +
      '"Friends who joined" shows how many of your friends became members. If your gym gives free days for this, the card says how many. The gym adds them to your plan. ' +
      'If you do not see the card, your gym has not started it yet.',
  },
  {
    id: 'gym-reminders-and-messages',
    who: 'member',
    title: 'Workout reminders and messages from your gym',
    text:
      'Workout reminders: open Profile, tap Settings, then "Reminders". Switch on "Workout reminders", tap the days you want, and set the "Reminder time". ' +
      'If you joined a gym, the same page has "Reminders from my gym" (like your plan ending) and "Messages from my gym". Switch them off to stop those pop-ups. ' +
      'To read your gym\'s messages, open the Gym tab and tap the bell at the top right. A number on the bell means new messages.',
    screens: ['apps/mobile/src/app/settings/notifications.tsx', 'apps/mobile/src/app/shop/inbox.tsx'],
  },
  {
    id: 'gym-shop-order',
    who: 'member',
    title: 'Order from your gym\'s shop',
    text:
      'If your gym has a shop: ' +
      '1. Open the Gym tab, then "Shop". ' +
      '2. Tap a product, pick an option if it asks, then tap "Add to bag". ' +
      '3. Tap the bag at the top right, check it, then tap "Place order". ' +
      '4. You pay at the desk when you collect it. ' +
      'To see your orders, tap "My orders". It shows when an order is ready. To cancel one, tap "Cancel order".',
    screens: ['apps/mobile/src/app/shop/[id].tsx', 'apps/mobile/src/app/shop/bag.tsx', 'apps/mobile/src/app/shop/orders.tsx'],
  },
  {
    id: 'gym-privacy-and-leaving',
    who: 'member',
    title: 'What your gym can see, the leaderboard, and leaving a gym',
    text:
      'Open Profile, tap Settings, and look under "Your gym". ' +
      '1. "What my gym can see" explains what your gym gets. Switch on "Show my name on my gym\'s leaderboard" to show your name; otherwise others see "A member". "Let my gym mates see my workouts" and "Share my workouts with my trainers" are there too. ' +
      '2. "Gym logo on my home screen" adds your gym\'s icon to your phone. ' +
      '3. The "Leave" row with your gym\'s name leaves the gym. Your workouts stay on this phone. ' +
      'The leaderboard is in the Gym tab, under "Ranking". Tap a member\'s name to see the workouts they share.',
    screens: [
      'apps/mobile/src/app/settings/gym-sees.tsx',
      'apps/mobile/src/app/settings/gym.tsx',
      'apps/mobile/src/app/shop/mate/[id].tsx',
    ],
  },
  {
    id: 'ask-a-trainer',
    who: 'member',
    title: 'Ask a trainer at your gym',
    text:
      'If your gym has it: open the Gym tab and tap "Ask a trainer". ' +
      '1. Under "Who should answer?" pick a trainer. Your own trainer is picked first. "Any trainer" sends it to every trainer and the gym owner. ' +
      '2. Type your question (up to 500 letters) and tap "Send question". ' +
      '3. The reply shows on the same page. Switch on "Messages from my gym" in Settings, then Reminders, to get a notification when they reply. ' +
      'You can have one question waiting at a time. To ask something else first, tap "Take back my question". Only the person you pick sees your question.',
    screens: ['apps/mobile/src/app/shop/ask.tsx'],
  },
  {
    id: 'log-a-workout',
    who: 'member',
    title: 'Log a workout and see last time\'s numbers',
    text:
      '1. Open the Workout tab. Tap "Start routine" on a routine, or "Start empty workout". ' +
      '2. Tap "Add exercise" to add more exercises. ' +
      '3. Type the weight and reps for each set, then tap the tick. ' +
      '4. When you are done, tap "Finish workout". ' +
      'The PREVIOUS column shows what you did last time for each set. ' +
      'Tap an exercise name to open its page. Its History shows every time you did it. ' +
      'To choose where last time\'s numbers come from, open Profile, tap Settings, then "More workout choices", then "Last time\'s numbers": "Any workout" or "Same routine".',
    screens: [
      'apps/mobile/src/app/(tabs)/workout.tsx',
      'apps/mobile/src/app/session/active.tsx',
      'apps/mobile/src/app/session/add-exercise.tsx',
      'apps/mobile/src/app/session/finish.tsx',
    ],
  },
  {
    id: 'kg-to-beat-box',
    who: 'member',
    title: 'The kg to beat box on each exercise',
    text:
      'Each exercise has a box above its sets that shows the total kilos to beat (weight times reps, added up over the sets), worked out from last time. ' +
      'During the workout it shows your next set and how many kilos you have done, for example "Next: 42.5 kg × 7 · 410 of 765 kg". ' +
      'When you lift exactly the total, it says "reached" and turns green. If you lift more, it says "beaten". ' +
      'For body-weight moves like push-ups it counts reps instead of kilos. ' +
      'Tap the box to see the suggested weight and why.',
  },
  {
    id: 'routines',
    who: 'member',
    title: 'Make, edit and start a routine',
    text:
      '1. Open the Workout tab and tap "New routine". ' +
      '2. Type the routine name, tap "Add exercise" and pick exercises. ' +
      '3. For each exercise, set the "Sets", "Rep min" and "Rep max". You can add "Warm-up sets", a rest time, a note, or "Superset with next". ' +
      '4. Tap "Start routine" to begin. ' +
      'Tap a routine on the Workout tab to see it; "Edit routine" changes it. ' +
      'The Up next card shows your next routine. Tap "See exercises" to check it before you tap Start. ' +
      'The ⋯ menu on a routine can share it, move it to a folder, or delete it.',
    screens: [
      'apps/mobile/src/app/routines/[id].tsx',
      'apps/mobile/src/app/routines/view/[id].tsx',
      'apps/mobile/src/app/routines/add-exercise.tsx',
      'apps/mobile/src/app/routines/first.tsx',
      'apps/mobile/src/app/today.tsx',
    ],
  },
  {
    id: 'find-a-plan',
    who: 'member',
    title: 'Find a ready plan or build your own',
    text:
      '1. Open the Workout tab and tap "Find a plan". ' +
      '2. Tap "Build a plan" and answer: goal, experience, days a week, split, equipment, time per workout, and sore spots under "Go easy on". To leave exercises out, tap "Choose exercises to leave out". ' +
      '3. Tap "Build my plan", check it, then tap "Save and follow". ' +
      'Or tap a ready program lower down, then "Follow this plan" or "Add to my routines". ' +
      'A plan you follow decides your Up next workout. ' +
      'To bring in a routine a friend shared, tap "Import a routine file" on the same page.',
    screens: [
      'apps/mobile/src/app/programs/index.tsx',
      'apps/mobile/src/app/programs/[key].tsx',
      'apps/mobile/src/app/plan/build.tsx',
      'apps/mobile/src/app/plan/avoid.tsx',
    ],
  },
  {
    id: 'past-workouts',
    who: 'member',
    title: 'Find, edit or share a past workout',
    text:
      'Your past workouts are on the Profile tab, newest first. Tap one to open it. ' +
      'On its page, tap Share for "Share as a picture" or "Share as text". Tap ⋯ for "Save as routine", "Repeat workout", "Rename workout", "Edit workout" or "Delete workout". ' +
      'To find a day: on Profile, tap Calendar. Tap a day to see its workout, or tap the search icon to search by exercise or workout name. ' +
      'Forgot to log one? In Calendar, tap "Log a past workout".',
    screens: ['apps/mobile/src/app/session/[id].tsx', 'apps/mobile/src/app/calendar.tsx', 'apps/mobile/src/app/history.tsx'],
  },
  {
    id: 'progress-and-records',
    who: 'member',
    title: 'See your progress, records and reports',
    text:
      'Open the Profile tab. On its chart, tap a point, then its date, to see the workouts of that week or month. ' +
      'Below the chart, "Your progress" has Charts, Exercises, Records, Body and Reports. ' +
      '"Charts" shows your last 7 days, sets for each muscle group, and your main exercises. ' +
      '"Records" lists your best weights and reps, newest first. ' +
      '"Body" holds body weight, measurements and progress photos. ' +
      'Under "Reports", open your monthly report or year in review. The arrows step to another month, and the share button makes a picture of it. ' +
      'Badges: on the Profile tab, tap "Badges" to see the ones you earned and how to earn the rest.',
    screens: [
      'apps/mobile/src/app/(tabs)/progress.tsx',
      'apps/mobile/src/app/stats.tsx',
      'apps/mobile/src/app/records.tsx',
      'apps/mobile/src/app/report/[period].tsx',
      'apps/mobile/src/app/progress/pick-lift.tsx',
      'apps/mobile/src/app/badges.tsx',
    ],
  },
  {
    id: 'exercises-and-your-own',
    who: 'member',
    title: 'Look up an exercise, or make your own',
    text:
      '1. Open the Profile tab and tap "Exercises" under "Your progress". Search, or filter by equipment and muscle. ' +
      '2. Tap an exercise. "Summary" shows last time, your best and a chart. "History" shows every time you did it. "How to" shows how to do it. ' +
      'To make your own: on Exercises, tap "Create". Type the name, pick how you log it, the main muscle and the equipment, then tap "Save exercise". ' +
      'To hide one you never do, open it, open its menu and tap "Hide from my lists". "Hidden exercises", at the bottom of the list, brings it back with "Show".',
    screens: [
      'apps/mobile/src/app/exercises.tsx',
      'apps/mobile/src/app/exercise/[id].tsx',
      'apps/mobile/src/app/library/new.tsx',
      'apps/mobile/src/app/library/hidden.tsx',
    ],
  },
  {
    id: 'body-weight-and-photos',
    who: 'member',
    title: 'Log body weight, measurements and progress photos',
    text:
      '1. Open the Profile tab and tap "Body" under "Your progress". ' +
      '2. Tap "+" at the top right. ' +
      '3. Pick the "Date", type your body weight and any measurements, and add a picture if you like. Blank boxes are skipped. ' +
      '4. Tap "Save". ' +
      'Tap a measure to see its graph. Tap an entry under "History" to fix or delete it. ' +
      'Progress photos: tap "See all", then "Add a photo". "Compare two photos" puts two side by side. Your photos are private.',
    screens: [
      'apps/mobile/src/app/measures/index.tsx',
      'apps/mobile/src/app/measures/add.tsx',
      'apps/mobile/src/app/photos/index.tsx',
      'apps/mobile/src/app/photos/compare.tsx',
    ],
  },
  {
    id: 'plates-and-one-rep-max',
    who: 'member',
    title: 'Plate calculator and 1-rep max',
    text:
      'Set your gym\'s plates once: open Profile, tap Settings, then "Plates and bars". Choose the plates your gym has, use "Add a plate" for one that is missing, and "Another bar" for a different bar. "Back to the standard set" undoes your changes. ' +
      'During a workout, tap ⋯ on an exercise, then "Plate calculator". It shows which plates go on each side. ' +
      'For your 1-rep max, open an exercise\'s page and tap "1-rep max and % calculator". Type a weight and reps to see your estimate, and 95% down to 50% of it.',
    screens: ['apps/mobile/src/app/settings/plates.tsx', 'apps/mobile/src/app/one-rep-max.tsx'],
  },
  {
    id: 'rest-timer-and-sound',
    who: 'member',
    title: 'Rest timer, its sound and alerts',
    text:
      'The rest timer starts when you tick a set. To change one exercise\'s rest, tap the clock time on its card. ' +
      'For everything else: open Profile, tap Settings, then "Rest timer and sounds". ' +
      'There you can set the "Default rest", turn "Workout sounds" on or off, and pick the "Rest-over sound": MettleUp chime, Bell, Double beep or Whistle. ' +
      'If "Rest alerts" says "May be late" or "Silent", tap it to fix it. ' +
      'When MettleUp asks, turn on "Alarms & reminders" so "Rest is over" rings on time, even on a locked phone. ' +
      '"Ring through Do Not Disturb" is also on that page.',
    screens: ['apps/mobile/src/app/settings/rest.tsx'],
  },
  {
    id: 'more-workout-choices',
    who: 'member',
    title: 'Next weight, last time\'s numbers and when you are stuck',
    text:
      'Open Profile, tap Settings, then "More workout choices". ' +
      '"How the app picks your next weight": pick the "Weight step" (Small, Standard or Large) and the "Reps to aim for" (Match my goal, Strength, Muscle or Higher reps). ' +
      '"Last time\'s numbers": "Any workout" or "Same routine". ' +
      '"Muscle tips": now and then, Up next suggests a few sets for a muscle group you left out. ' +
      '"When I\'m stuck at a weight": "Ask me", "Step back by itself" or "Never suggest it".',
    screens: [
      'apps/mobile/src/app/settings/workout-choices.tsx',
      'apps/mobile/src/app/settings/next-weight.tsx',
      'apps/mobile/src/app/settings/last-time.tsx',
      'apps/mobile/src/app/settings/muscle-tips.tsx',
    ],
  },
  {
    id: 'rate-how-hard-rpe',
    who: 'member',
    title: 'RPE: rate how hard a set felt',
    text:
      'RPE means how hard a set felt, from 6 to 10. ' +
      '6 is easy, with 4 or more reps left. 8 means 2 more reps left. 10 means you could not do another rep. ' +
      'To turn it on: open Profile, tap Settings, then "Rate how hard each set felt", and switch it on. Each set then gets an RPE box. ' +
      'During a workout, tap the box and pick a number. The set ticks itself and your rest starts. ' +
      'Last time\'s RPE shows in the PREVIOUS column.',
    screens: ['apps/mobile/src/app/settings/effort.tsx'],
  },
  {
    id: 'profile-units-weekly-goal',
    who: 'member',
    title: 'Your profile, units and weekly goal',
    text:
      'Open the Profile tab. Tap the pencil to edit your profile: photo, name, bio and a link, plus your mobile number, goal and body details. Changes save as you type. ' +
      'The gear opens Settings. ' +
      'Units: in Settings, tap "Units" and pick "kg, km" or "lb, miles". ' +
      'Weekly goal: in Settings, tap "Weekly goal" and use + and − to set how many workouts a week you aim for. ' +
      'Light or dark (newest app): in Settings, tap "Light or dark" and pick "Same as phone", "Light" or "Dark". "Same as phone" follows your phone. ' +
      'To share this month as a picture, tap the share button on Profile.',
    screens: [
      'apps/mobile/src/app/(tabs)/profile.tsx',
      'apps/mobile/src/app/edit-profile.tsx',
      'apps/mobile/src/app/settings/index.tsx',
      'apps/mobile/src/app/settings/units.tsx',
      'apps/mobile/src/app/settings/look.tsx',
      'apps/mobile/src/app/settings/weekly-goal.tsx',
    ],
  },
  {
    id: 'watch-widgets-health',
    who: 'member',
    title: 'Watch, widgets and health apps',
    text:
      'Open Profile, tap Settings, and look under "Phone and watch". ' +
      '"Your watch": tap "Install on watch", and switch on "Open MettleUp on my watch" so it opens when you start a workout. ' +
      '"Widgets": tap "Add Today" or "Add This week". Today starts your next workout and shows what to beat from last time. ' +
      'Gym members can tap "Add Gym right now": how busy your gym is, and when that was checked. Tap it to check in. ' +
      '"Health apps": connect Health Connect to send your workouts, and to read your weight or steps. ' +
      '"Sleep and workouts" tells you, after a lighter workout, if you slept under 6 hours. ' +
      'If a row is missing, this phone does not have it.',
    screens: [
      'apps/mobile/src/app/settings/watch.tsx',
      'apps/mobile/src/app/settings/widgets.tsx',
      'apps/mobile/src/app/settings/health.tsx',
      'apps/mobile/src/app/workout/start.tsx',
    ],
  },
  {
    id: 'bring-in-from-hevy-or-strong',
    who: 'member',
    title: 'Bring in your workouts from Hevy or Strong',
    text:
      '1. In Hevy, go to Settings, then "Export & Backup Data", and export your workouts. In Strong, go to Settings, then "Export Strong Data", and save the .csv file. ' +
      '2. In MettleUp, open Profile, tap Settings, then "Bring in from Hevy or Strong". ' +
      '3. Tap "Hevy" or "Strong", then "Choose Hevy file" or "Choose Strong file". ' +
      '4. Check what is in it, then pick "Merge" to keep your current workouts, or "Replace". ' +
      'Kilograms or pounds are both read. The file is read on your phone and is not uploaded. You can undo right after. ' +
      'Have a Hevy routine link? Tap "Paste a Hevy link".',
    screens: [
      'apps/mobile/src/app/settings/import.tsx',
      'apps/mobile/src/app/import/index.tsx',
      'apps/mobile/src/app/import/routines.tsx',
    ],
  },
  {
    id: 'backup-and-restore',
    who: 'member',
    title: 'Back up and restore your workouts',
    text:
      'Your MettleUp account is your backup. Open Profile, tap Settings, then "Backup and restore", and tap "Continue with Google". ' +
      'Your workouts, routines and body weight are then saved by themselves. On a new phone, sign in with the same Google account and tap "Bring back my workouts". ' +
      '"Download my data" makes one file with everything, a copy for your own records. ' +
      '"Restore from a backup" brings back a file you saved: tap "Choose backup file", then "Replace everything on this phone" or "Add to what\'s here". ' +
      'Used Google Drive backup in an older version? Tap "Bring back a Google Drive backup", then "Find my Drive backup".',
    screens: [
      'apps/mobile/src/app/settings/backup.tsx',
      'apps/mobile/src/app/settings/save-backup.tsx',
      'apps/mobile/src/app/settings/restore-backup.tsx',
      'apps/mobile/src/app/settings/drive-restore.tsx',
    ],
  },
  {
    id: 'spreadsheet-erase-and-app-info',
    who: 'member',
    title: 'Save a spreadsheet, erase your data, What\'s new and About',
    text:
      'Open Profile, tap Settings. ' +
      '"Save as a spreadsheet": tap "Save my history" or "Save my measurements" to save a spreadsheet file. ' +
      '"Erase or start over": "Erase all data" deletes everything on this phone and starts over. It asks first. Save a backup before you do this. ' +
      '"What\'s new" lists what changed in the last 3 updates. ' +
      '"About" shows the app version and "Credits".',
    screens: [
      'apps/mobile/src/app/settings/export.tsx',
      'apps/mobile/src/app/settings/data.tsx',
      'apps/mobile/src/app/settings/news.tsx',
      'apps/mobile/src/app/settings/about.tsx',
      'apps/mobile/src/app/credits.tsx',
    ],
  },

  {
    id: 'ready-today-and-quick-workout',
    who: 'member',
    title: 'See which muscles are ready today, and build a quick workout',
    text:
      'On the Workout tab, the "Muscles ready today" card names the muscles still resting from the workouts you logged. Tap it to open "Ready today": the body map shows each muscle as Ready (green), Almost ready (amber) or Still resting (red). Tap a muscle to see when it is ready. ' +
      'It uses only the workouts you logged; sleep and soreness are not counted. ' +
      'Tap "Quick workout for the time you have". Pick the time, what to train (the most rested parts are picked for you) and your equipment. The app picks the exercises, with your weights from last time. Tap "Start this workout".',
    screens: ['apps/mobile/src/app/ready.tsx', 'apps/mobile/src/app/quick.tsx'],
  },
  {
    id: 'ask-an-ai',
    who: 'member',
    title: 'Ask an AI app about your workouts',
    text:
      'Open Profile, tap Settings, then "Ask an AI about your workouts" under Your data. ' +
      'The page shows a short text of your last 4 weeks of workouts: each exercise, your best set and how it is going, with a question at the end. ' +
      'Tap "Share to an AI app" and pick ChatGPT, Gemini or any app on your phone. MettleUp sends nothing itself; you choose where the text goes. Your name, phone number and body weight are left out.',
    screens: ['apps/mobile/src/app/settings/ask-ai.tsx'],
  },
  // ------------------------------------------------------------------ both apps
  {
    id: 'send-feedback',
    who: 'both',
    title: 'Ask a question or send feedback',
    text:
      'Member app: tap the small round button on the edge of any screen, or open Profile, tap Settings, then "Help and feedback". ' +
      'Type, or tap Speak and talk in Hindi or English, then tap Send. ' +
      'To hide the round button, turn off "Show the feedback button on every screen" on that page. You can also drag it up or down. ' +
      'Admin app: tap More, then "Help and feedback", type your message, then tap Send. ' +
      'A question may get an answer at once. Tap Yes or No to say if it helped. Every message is read. ' +
      'Owners: "MettleUp access", lower on that page, lets MettleUp support read your records for one hour, and lists every time they looked.',
    screens: ['apps/mobile/src/app/settings/feedback.tsx', 'apps/dashboard/src/crm/ui/screens/Feedback.tsx'],
  },
  {
    id: 'replies-from-the-team',
    who: 'both',
    title: 'Get a reply from the MettleUp team',
    text:
      'When the answer did not solve your question, or there was no answer, the MettleUp team replies. ' +
      'Member app: open Profile → Settings → "Help and feedback". Under "Your questions" every question you sent from this phone is kept with its answer, and the reply shows as "Reply from the MettleUp team", marked New until you see it. The phone shows a pop-up when the reply arrives if gym messages are on. ' +
      'Admin app: the same list, "Your questions", is on More → "Help and feedback" in the browser you asked from.',
  },
];

/**
 * Screens no help answer can be about, each with its reason (scripts/ci/help_coverage.mjs). A new
 * screen goes into an article's `screens` first; it lands here only when there is truly nothing a
 * member or a gym could ask about it.
 */
export const NO_HELP_SCREENS = {
  'apps/dashboard/src/crm/ui/screens/MettleUpReceipt.tsx': 'Not live yet (billing step 3: one MettleUp receipt, opened from Pay MettleUp; server 0063 is not applied). Its help goes in the Pay MettleUp article when that goes live.',
  'apps/dashboard/src/crm/ui/screens/PayMettleUp.tsx': 'Not live yet (T79 Pay MettleUp: server 0060 is not applied and MettleUp has not added its payment details); the screen says so itself. Its help article is written when it goes live.',
  'apps/dashboard/src/crm/ui/screens/EntryMachines.tsx': 'Not live yet (F103 entry machines: server 0059 and the gate are not switched on); the screen says so itself. Its help article is written when it goes live.',
  'apps/mobile/src/app/_layout.tsx': 'The app frame around every screen; nothing to tap.',
  'apps/mobile/src/app/(tabs)/_layout.tsx': 'The bottom tab bar frame; each tab has its own article.',
  'apps/mobile/src/app/+not-found.tsx': 'Shown only for a broken link; it sends the member back into the app.',
  'apps/mobile/src/app/index.tsx': 'Redirect: opens the Workout tab.',
  'apps/mobile/src/app/qa-update.tsx': 'Redirect: a test-build link for the update screen pictures; opens the Workout tab.',
  'apps/mobile/src/app/qa-sleep.tsx': 'Redirect: a test-build link for the sleep line pictures (R-344); goes straight back.',
  'apps/mobile/src/app/qa-look.tsx': 'Redirect: a test-build link for the gym colour pictures on the light and dark looks; goes straight back.',
  'apps/mobile/src/app/qa-dots.tsx': 'Redirect: a test-build link for the new-feature dot pictures (F198); goes straight back.',
  'apps/mobile/src/app/analytics.tsx': 'Redirect: an old link that opens Charts.',
  'apps/mobile/src/app/bodyweight.tsx': 'Redirect: an old link that opens Body.',
  'apps/mobile/src/app/library/index.tsx': 'Redirect: an old link that opens Exercises.',
  'apps/mobile/src/app/measurements/index.tsx': 'Redirect: an old link that opens Body.',
  'apps/mobile/src/app/measurements/log.tsx': 'Redirect: an old link that opens the Body form.',
  'apps/mobile/src/app/routines/index.tsx': 'Redirect: opens the Workout tab, where routines live.',
  'apps/mobile/src/app/settings/details.tsx': 'Redirect: an old link that opens Your profile.',
  'apps/mobile/src/app/settings/workouts.tsx': 'Redirect: an old link that opens Settings.',
  'apps/mobile/src/app/(tabs)/coach.tsx': 'The AI coach is switched off in this app (hidden until its phase); members cannot open it.',
  'apps/mobile/src/app/settings/coach.tsx': 'AI coach settings: switched off with the AI coach; the page sends members back to Settings.',
  'apps/mobile/src/app/nutrition.tsx': 'Food logging is switched off in this app; the page sends members to the Workout tab.',
  'apps/mobile/src/app/settings/phone-backup.tsx': 'No row in the app opens it since R-320 (Backup shows only the MettleUp account); kept for the cloud check of Android backup.',
  'apps/dashboard/src/crm/ui/screens/More.tsx': 'The phone menu: a list of links; every page it opens has its own article.',
};
