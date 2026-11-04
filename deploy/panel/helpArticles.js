// Starter help articles for the AI help answers (Help and feedback box, member app and admin app).
// The AI answers ONLY from these, so every step and button name here was checked against the screen
// code on 2 Nov 2026. Change a screen's words: change the article too.
// Member words: never "volume", "PR" or "session". No money promises, dates or future features.
// Tests: node --test deploy/panel/helpArticles.test.mjs

export const HELP_ARTICLES = [
  // ------------------------------------------------------------------ gym owners and front desk
  {
    id: 'add-a-member',
    who: 'owner',
    title: 'Add a new member',
    text:
      'Open the admin app (app.mettleup.fit). ' +
      '1. Tap Members, then "+ Add member". ' +
      '2. Type the full name and mobile number. Only these two are needed. Batch, joining date, email and notes are optional. ' +
      '3. Tap "Add member". The member\'s page opens. ' +
      '4. Tap "Sell membership", pick the plan, type the amount in "Received now" and how it was paid, then tap "Confirm". ' +
      'The mobile number is used to find the member and to send them WhatsApp messages.',
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
    id: 'check-in-at-the-desk',
    who: 'owner',
    title: 'Check a member in',
    text:
      'At the desk: 1. Tap Visits. 2. Under "Check someone in", type a name or the last 4 digits of the mobile number. 3. Tap "Check in". ' +
      'You can also open the member\'s page and tap "Check in". ' +
      'Members can check themselves in: 1. In Visits, tap "Check-in QR". 2. Tap "Print poster" or "Download picture" and put it where members walk in. ' +
      'A member scans it with the MettleUp app. The app finds them by their mobile number, so that number must be in your Members list. ' +
      'App check-ins show in the register with an "App" tag. Two scans in one day count as one visit.',
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
  },
  {
    id: 'bring-in-from-hevy-or-strong',
    who: 'member',
    title: 'Bring in your workouts from Hevy or Strong',
    text:
      '1. In Hevy, go to Settings, then "Export & Backup Data", and export your workouts. In Strong, go to Settings, then "Export Strong Data", and save the .csv file. ' +
      '2. In MettleUp, open Profile, tap Settings, then "Bring in from Hevy or Strong". ' +
      '3. Tap "Import from Hevy" or "Import from Strong", then choose the file. ' +
      '4. Check what is in it, then pick "Merge" to keep your current workouts, or "Replace". ' +
      'Kilograms or pounds are both read. The file is read on your phone and is not uploaded. ' +
      'You can undo right after.',
  },
  {
    id: 'backup-and-restore',
    who: 'member',
    title: 'Back up and restore your workouts',
    text:
      'Your MettleUp account is your backup. Open Profile, tap Settings, then "Backup and restore", and tap "Continue with Google". ' +
      'MettleUp then saves your workouts, routines and body weight to your account by itself. On a new phone, sign in with the same Google account and tap "Bring back my workouts". ' +
      '"Download my data" makes one file with everything, a copy for your own records. Keep it in Files, Google Drive or WhatsApp. ' +
      '"Restore from a backup" brings your workouts back from a file you saved: tap "Choose backup file", check what is inside, then pick "Replace everything on this phone" or "Add to what\'s here". Files from the old ForgeAI app work too. ' +
      'Backed up to Google Drive with an older version of the app? On the same page, tap "Bring back a Google Drive backup", then "Find my Drive backup", and pick the same Google account.',
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
  },
  {
    id: 'send-feedback',
    who: 'both',
    title: 'Ask a question or send feedback',
    text:
      'Member app: tap the small round button on the edge of any screen, or open Profile, tap Settings, then "Help and feedback". ' +
      'Type, or tap Speak and talk in Hindi or English, then tap Send. ' +
      'To hide the round button, turn off "Show the feedback button on every screen" on that page. You can also drag it up or down. ' +
      'Admin app: tap More, then "Help and feedback", type your message, then tap Send. ' +
      'A question may get an answer at once. Tap Yes or No to say if it helped. Every message is read.',
  },
];
